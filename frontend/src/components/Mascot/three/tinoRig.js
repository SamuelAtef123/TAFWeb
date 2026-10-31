import * as THREE from 'three';

/*
  The generated Tino model is one solid mesh with no skeleton.
  This gives him one in code: every vertex is assigned to the
  head, the two arms (each still holding its bread) or the two legs (the mesh is cut
  along those seams, so nothing stretches), and a small
  set of bones moves those parts. No extra download, no rigging service.

  Coordinates here are the normalised model space used by Companion.js:
  100 units tall, centred on the belly, facing +Z, his loaf arm on -X, his baguette arm on +X.
*/

// joint positions (where each part turns)
export const PIVOTS = {
  head: [0, 25, -1],
  armR: [-12, 19, 0], // loaf arm
  armB: [14, 19, 0], // baguette arm
  legR: [-4, -31, 0],
  legB: [11, -31, 0],
};
const ORDER = ['torso', 'head', 'armR', 'armB', 'legR', 'legB'];

// which part a point belongs to (hard edges: the mesh is cut, not stretched)
export function partOf(x, y) {
  if (y > 25.5) return 'head';
  if (y < -32) return x > 6 ? 'legB' : 'legR';
  if (x < -11.5 && y > -15 && y < 22) return 'armR';
  if (y > -29 && y < 22 && x > (y > -12 ? 15.5 : 20)) return 'armB';
  return 'torso';
}

// Small islands (a few stray triangles of apron counted as "arm", etc.) would fly off with the
// wrong part. Merge every island smaller than MIN_ISLAND into the part that surrounds it.
const MIN_ISLAND = 260;
function cleanIslands(pos, index, tris, part) {
  const n = pos.count;
  // weld vertices that share a position (UV seams split them), so islands follow the real surface
  const key = new Map();
  const weld = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 20)},${Math.round(pos.getY(i) * 20)},${Math.round(pos.getZ(i) * 20)}`;
    if (!key.has(k)) key.set(k, i);
    weld[i] = key.get(k);
  }
  const nb = Array.from({ length: n }, () => []);
  const vid = (t, c) => (index ? index[t * 3 + c] : t * 3 + c);
  for (let t = 0; t < tris; t++) {
    for (let c = 0; c < 3; c++) {
      const a = weld[vid(t, c)];
      const b = weld[vid(t, (c + 1) % 3)];
      if (a !== b) {
        nb[a].push(b);
        nb[b].push(a);
      }
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      const r = weld[s];
      if (r !== s || seen[r]) continue;
      const p0 = part[r];
      const comp = [r];
      seen[r] = 1;
      const around = new Map();
      for (let q = 0; q < comp.length; q++) {
        nb[comp[q]].forEach(v => {
          if (part[v] === p0) {
            if (!seen[v]) {
              seen[v] = 1;
              comp.push(v);
            }
          } else around.set(part[v], (around.get(part[v]) || 0) + 1);
        });
      }
      if (comp.length < MIN_ISLAND && around.size) {
        const to = [...around.entries()].sort((a, b) => b[1] - a[1])[0][0];
        comp.forEach(v => {
          part[v] = to;
        });
      }
    }
  }
  for (let i = 0; i < n; i++) part[i] = part[weld[i]];
}

// mesh: the normalised model group (as built in Companion.js). Returns { group, bones }.
export function rigTino(model) {
  model.updateMatrixWorld(true);
  const meshes = [];
  model.traverse(o => {
    if (o.isMesh) meshes.push(o);
  });

  const bones = {};
  const root = new THREE.Bone();
  bones.torso = root;
  Object.entries(PIVOTS).forEach(([k, p]) => {
    const b = new THREE.Bone();
    b.position.set(p[0], p[1], p[2]);
    root.add(b);
    bones[k] = b;
  });
  const list = ORDER.map(k => bones[k]);

  const group = new THREE.Group();
  group.add(root);
  const skeleton = new THREE.Skeleton(list);

  meshes.forEach(mesh => {
    const src = mesh.geometry;
    const g = new THREE.BufferGeometry();
    // de-quantise position/normal (meshopt stores them as small integers) and bake the transform
    ['position', 'normal'].forEach(name => {
      const a = src.getAttribute(name);
      if (!a) return;
      const arr = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) {
        arr[i * 3] = a.getX(i);
        arr[i * 3 + 1] = a.getY(i);
        arr[i * 3 + 2] = a.getZ(i);
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    });
    Object.keys(src.attributes).forEach(name => {
      if (name !== 'position' && name !== 'normal') g.setAttribute(name, src.getAttribute(name));
    });
    if (src.index) g.setIndex(src.index);
    g.applyMatrix4(mesh.matrixWorld);
    if (g.getAttribute('normal')) g.normalizeNormals();

    // Cut along the seams: a triangle whose corners belong to different parts is copied once
    // for each of those parts, so a lifted arm leaves no stretched "web" and no hole behind.
    const pos = g.getAttribute('position');
    const index = g.index ? g.index.array : null;
    const tris = index ? index.length / 3 : pos.count / 3;
    const vid = (t, c) => (index ? index[t * 3 + c] : t * 3 + c);
    const part = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) part[i] = ORDER.indexOf(partOf(pos.getX(i), pos.getY(i)));
    cleanIslands(pos, index, tris, part);
    const out = [];
    const bone = [];
    for (let t = 0; t < tris; t++) {
      const v = [vid(t, 0), vid(t, 1), vid(t, 2)];
      const parts = [...new Set(v.map(i => part[i]))];
      parts.forEach(pb => {
        out.push(v[0], v[1], v[2]);
        bone.push(pb, pb, pb);
      });
    }
    const flat = new THREE.BufferGeometry();
    Object.keys(g.attributes).forEach(name => {
      const a0 = g.getAttribute(name);
      const n = a0.itemSize;
      const arr = new Float32Array(out.length * n);
      for (let k = 0; k < out.length; k++) {
        for (let c = 0; c < n; c++) arr[k * n + c] = a0.getComponent(out[k], c);
      }
      flat.setAttribute(name, new THREE.BufferAttribute(arr, n));
    });
    const idx = new Uint16Array(out.length * 4);
    const wts = new Float32Array(out.length * 4);
    for (let k = 0; k < out.length; k++) {
      idx[k * 4] = bone[k];
      wts[k * 4] = 1;
    }
    flat.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    flat.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
    g.dispose();
    const gg = flat;
    gg.computeBoundingSphere();
    const sm = new THREE.SkinnedMesh(gg, mesh.material);
    sm.frustumCulled = false;
    sm.add(root);
    sm.bind(skeleton);
    group.add(sm);
  });
  group.remove(root);
  return { group, bones, skeleton };
}
