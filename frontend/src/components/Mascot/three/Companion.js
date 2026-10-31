import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { rigTino } from './tinoRig';

/*
  3D Tino: the logo boy as a real 3D model (public/mascot/tino3d.glb, ~200 KB),
  drawn on a transparent full-screen WebGL layer where 1 unit = 1 CSS pixel,
  so he can run to anything on the page (a menu card, the basket, the marquee...).

  The generated model has no skeleton, so tinoRig.js cuts it into head, arms (each still
  holding its bread) and legs and gives it bones: he swings his arms when he walks, waves,
  cheers, gestures while he talks, climbs up and down the marquee hand over hand and carries
  orders over his head, on top of the whole-body hops, flips, cartwheels and spins.

  Every move is an async step. Starting a new sequence cancels the running one,
  so scrolling in the middle of a backflip never leaves him stuck in the air.
*/

const MODEL_URL = '/mascot/tino3d.glb';
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const E = {
  linear: t => t,
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  back: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const CANCELLED = 'tino-cancelled';
const DUR = {
  backflip: 1150, frontflip: 1100, spin: 1000, dance: 2400, cheer: 1100, wave: 1300, bow: 1100,
  sniff: 1500, tada: 900, cartwheel: 900, dizzy: 1500, hop: 560, wiggle: 900,
};

export function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

// load the model once and normalise it: 100 units tall, feet at y=0, facing the camera
let modelPromise = null;
function loadModel() {
  if (!modelPromise) {
    modelPromise = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(MODEL_URL)
      .then(gltf => {
        const m = gltf.scene;
        m.rotation.y = -Math.PI / 2; // the generated model faces +X
        m.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const s = 100 / size.y;
        m.scale.setScalar(s);
        m.updateMatrixWorld(true);
        const b2 = new THREE.Box3().setFromObject(m);
        const c = b2.getCenter(new THREE.Vector3());
        m.position.sub(c); // centred on the body (the flip pivot)
        m.updateMatrixWorld(true);
        m.traverse(o => {
          if (o.isMesh) {
            // both sides: where an arm is cut from the body you see its inside, not a hole
            o.material.side = THREE.DoubleSide;
            if (o.material.map) o.material.map.anisotropy = 4;
          }
        });
        return rigTino(m);
      });
  }
  return modelPromise;
}

export default class Companion {
  static async create(opts) {
    const rig = await loadModel();
    return new Companion(rig, opts);
  }

  constructor({ group: model, bones }, { onPoke, label = 'Tino, the bakery mascot. Click to talk.', reduced = false } = {}) {
    this.reduced = reduced;
    this.onPoke = onPoke;
    this.alive = true;
    this.busy = false;
    this.where = 'hidden'; // hidden | hero | dock | travel | delivering

    // --- renderer + camera (pixel units, y up, origin at the top-left of the window) ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const cv = this.renderer.domElement;
    cv.className = 'tino3d-canvas';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 6000);
    this.camera.position.set(0, 0, 3000);
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0xd9b48a, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(-0.6, 1, 1.4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe2b0, 0.7);
    rim.position.set(0.8, 0.4, -1);
    this.scene.add(rim);

    // root (feet, on screen) -> tilt (leans / sways, pivot at the feet) -> spin (flips, pivot at the belly) -> model
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.spin = new THREE.Group();
    this.spin.position.y = 50;
    this.spin.add(model);
    this.bones = bones;
    this.tilt.add(this.spin);
    this.root.add(this.tilt);
    this.root.visible = false;
    this.scene.add(this.root);

    // soft shadow under his feet
    const sh = document.createElement('canvas');
    sh.width = sh.height = 64;
    const g = sh.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(60,35,15,0.35)');
    grd.addColorStop(1, 'rgba(60,35,15,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    this.shadowTex = new THREE.CanvasTexture(sh);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false })
    );
    this.shadow.visible = false;
    this.scene.add(this.shadow);

    // the order he carries: a little plate with the product photo, balanced on his head
    this.carry = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 12, 2.6, 40),
      new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.6 })
    );
    plate.rotation.x = 0.35;
    this.photo = new THREE.Mesh(new THREE.CircleGeometry(13, 40), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.photo.position.set(0, 9, 4);
    this.carry.add(plate, this.photo);
    this.carry.visible = false;
    this.scene.add(this.carry);

    // depth-only cut-out of the 2.5D Tino, so 3D Tino can hide *behind* him
    const occTex = new THREE.TextureLoader().load('/mascot/tino.webp');
    this.occluder = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: occTex, alphaTest: 0.5, colorWrite: false })
    );
    this.occluder.renderOrder = -1;
    this.occluder.visible = false;
    this.scene.add(this.occluder);
    this.occluderRect = null;

    // clickable box that follows him around (the canvas itself never takes clicks)
    this.hitbox = document.createElement('button');
    this.hitbox.type = 'button';
    this.hitbox.className = 'tino3d-hit';
    this.hitbox.setAttribute('aria-label', label);
    this.hitbox.style.display = 'none';
    this.hitbox.addEventListener('click', () => this.onPoke && this.onPoke());
    document.body.appendChild(this.hitbox);

    // --- state ---
    this.pos = { x: -300, y: -300 }; // his feet, in window pixels
    this.h = 150; // height in pixels
    this.yaw = 0;
    this.yawTarget = 0;
    this.extraYaw = 0;
    this.follow = null; // () => {x, y, h}: where to stand when nothing else is moving him
    this.tween = null;
    this.clip = 'idle';
    this.act = null;
    this.talking = false;
    this.pointer = null;
    this.carrying = false;
    this.dy = 0;
    this.runId = 0;
    this.textures = new Map();

    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    this.onPointer = e => {
      this.pointer = { x: e.clientX, y: e.clientY };
    };
    this.onVisibility = () => {
      if (!document.hidden && this.alive) {
        cancelAnimationFrame(this.raf);
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.tick);
      }
    };
    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /* =================== plumbing =================== */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    Object.assign(this.camera, { left: 0, right: w, top: 0, bottom: -h });
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    this.alive = false;
    this.runId += 1;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.onPointer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.textures.forEach(t => t.dispose());
    this.shadowTex.dispose();
    this.spin.clear(); // the shared model stays cached for next time
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hitbox.remove();
  }

  // every scene calls newRun(); awaiting step() throws once a newer scene has started
  newRun() {
    this.runId += 1;
    if (this.tween) this.tween.resolve('cut');
    if (this.act) this.act.resolve('cut');
    this.act = null;
    this.extraYaw = 0;
    this.faceAway = false;
    this.clip = this.carrying ? 'carry' : 'idle';
    const id = this.runId;
    return async p => {
      if (id !== this.runId || !this.alive) throw CANCELLED;
      const v = await p;
      if (id !== this.runId || !this.alive) throw CANCELLED;
      return v;
    };
  }

  show(on) {
    this.root.visible = on;
    this.shadow.visible = on;
    this.hitbox.style.display = on ? 'block' : 'none';
    if (!on) {
      this.where = 'hidden';
      this.carry.visible = false;
    }
  }

  setTalking(on) {
    this.talking = on;
  }

  // the visible box around him (for the speech bubble)
  rect() {
    if (!this.root.visible) return null;
    const w = this.h * 0.5;
    const top = this.pos.y - this.h - this.dy;
    return { left: this.pos.x - w / 2, right: this.pos.x + w / 2, top, bottom: top + this.h, width: w, height: this.h };
  }

  // move his feet somewhere (target is a function so it can follow things that scroll)
  moveTo(target, { dur = 700, arc = 0, ease = 'inOut', clip = null, flip = 0, h = null } = {}) {
    if (this.tween) this.tween.resolve('cut');
    return new Promise(resolve => {
      if (this.reduced) {
        const t = target();
        this.pos = { x: t.x, y: t.y };
        if (h) this.h = h;
        resolve('done');
        return;
      }
      this.tween = {
        t0: performance.now(),
        dur,
        from: { ...this.pos, h: this.h },
        target,
        toH: h,
        arc,
        ease: E[ease] || E.inOut,
        clip,
        flip,
        resolve: v => {
          this.tween = null;
          resolve(v);
        },
      };
    });
  }

  play(name, dur = DUR[name] || 1000) {
    return new Promise(resolve => {
      if (this.act) this.act.resolve('cut');
      if (this.reduced) {
        resolve('skip');
        return;
      }
      this.act = {
        name,
        t0: performance.now(),
        dur,
        resolve: v => {
          this.act = null;
          resolve(v);
        },
      };
    });
  }

  texture(url) {
    if (!this.textures.has(url)) {
      const t = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(url, t);
    }
    return this.textures.get(url);
  }

  holdPhoto(url) {
    if (!url) {
      this.carry.visible = false;
      this.carrying = false;
      if (this.clip === 'carry') this.clip = 'idle';
      return;
    }
    this.photo.material.map = this.texture(url);
    this.photo.material.needsUpdate = true;
    this.carry.visible = true;
    this.carrying = true;
    this.clip = 'carry';
  }

  /* =================== the frame loop =================== */
  tick(now) {
    if (!this.alive || document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;

    // where is he?
    let moving = false;
    let flipZ = 0;
    let tweenClip = null;
    if (this.tween) {
      const tw = this.tween;
      const k = clamp((now - tw.t0) / tw.dur, 0, 1);
      const e = tw.ease(k);
      const to = tw.target();
      this.pos.x = lerp(tw.from.x, to.x, e);
      this.pos.y = lerp(tw.from.y, to.y, e) - Math.sin(Math.PI * k) * tw.arc;
      if (tw.toH) this.h = lerp(tw.from.h, tw.toH, e);
      moving = Math.abs(to.x - tw.from.x) > 4;
      flipZ = tw.flip * e;
      tweenClip = tw.clip;
      if (moving) this.yawTarget = clamp((to.x - tw.from.x) / 140, -1.15, 1.15);
      if (k >= 1) tw.resolve('done');
    } else if (this.follow) {
      const f = this.follow();
      if (f) {
        const s = 1 - Math.pow(0.0004, dt); // glide after the page when it moves under him
        this.pos.x = lerp(this.pos.x, f.x, s);
        this.pos.y = lerp(this.pos.y, f.y, s);
        if (f.h) this.h = lerp(this.h, f.h, s);
      }
    }
    let look = 0;
    if (!moving && !this.act) {
      // look towards the cursor: a little with the body, more with the head
      const p = this.pointer;
      look = p ? clamp((p.x - this.pos.x) / window.innerWidth, -0.5, 0.5) : 0;
      this.yawTarget = look * 0.7;
    }
    if (this.faceAway) this.yawTarget = Math.PI; // climbing: back to us, face to the marquee

    // pose: reset, add the looping motion, then the one-shot move on top
    // (whole body: tilt/spin/squash; joints: P.b.<bone> = [x, y, z] rotations)
    const P = {
      tx: 0, tz: 0, sx: 0, sy: 0, sz: 0, dy: 0, sqx: 1, sqy: 1, yaw: 0,
      b: { head: [0, look * 0.9, 0], armR: [0, 0, 0], armB: [0, 0, 0], legR: [0, 0, 0], legB: [0, 0, 0] },
    };
    this.applyClip(tweenClip || (moving ? (this.carrying ? 'carryRun' : 'run') : this.clip), t, P);
    if (this.act) {
      const a = this.act;
      const k = clamp((now - a.t0) / a.dur, 0, 1);
      this.applyAct(a.name, k, t, P);
      if (k >= 1) a.resolve('done');
    }
    if (this.talking) {
      // nod and talk with his hands
      P.b.head[0] += Math.sin(t * 9) * 0.07;
      P.b.head[2] += Math.sin(t * 3.1) * 0.05;
      if (!this.act && !this.carrying && this.clip === 'idle' && !moving) {
        P.b.armB[2] += 0.35 + Math.abs(Math.sin(t * 3.4)) * 0.5;
        P.b.armB[0] += -0.35 - Math.sin(t * 2.3) * 0.15;
        P.b.armR[2] -= 0.15 + Math.abs(Math.sin(t * 2.7 + 1)) * 0.25;
      }
      P.sqy *= 1 + Math.abs(Math.sin(t * 11)) * 0.012;
    }
    P.sz += flipZ;
    Object.entries(P.b).forEach(([k, v]) => this.bones[k].rotation.set(v[0], v[1], v[2]));

    // place him on screen
    this.yaw = lerp(this.yaw, this.yawTarget, 1 - Math.pow(0.002, dt));
    const s = this.h / 100;
    this.dy = P.dy;
    this.root.position.set(this.pos.x, -(this.pos.y - P.dy), 0);
    this.root.scale.set(s * P.sqx, s * P.sqy, s * P.sqx);
    this.root.rotation.set(0, 0, 0);
    this.tilt.rotation.set(P.tx, 0, P.tz);
    this.spin.rotation.set(P.sx, this.yaw + P.yaw, P.sz, 'YXZ');

    // shadow stays on the ground and shrinks when he jumps
    const lift = clamp(P.dy / this.h, 0, 1.5);
    this.shadow.position.set(this.pos.x, -this.pos.y + 2, -500);
    this.shadow.scale.set(this.h * 0.55 * (1 - lift * 0.4), this.h * 0.12 * (1 - lift * 0.4), 1);

    // the order balancing on his head
    if (this.carry.visible && this.carrying) {
      const bob = Math.sin(t * 13) * 2;
      this.carry.position.set(this.pos.x + Math.sin(t * 6.5) * 2, -(this.pos.y - this.h * 1.04 - P.dy) + bob, 400);
      this.carry.scale.setScalar(s * 1.5); // a tray, held up with both hands
      this.carry.rotation.z = P.tz * 0.6 + Math.sin(t * 6.5) * 0.06;
    }

    // occluder (the 2.5D Tino, in front of him)
    const r = this.occluderRect && this.occluderRect();
    if (r && r.width) {
      this.occluder.visible = true;
      this.occluder.position.set(r.left + r.width / 2, -(r.top + r.height / 2), 1500);
      this.occluder.scale.set(r.width, r.height, 1);
    } else this.occluder.visible = false;

    this.renderer.render(this.scene, this.camera);

    if (this.root.visible) {
      const b = this.rect();
      const hb = this.hitbox.style;
      hb.transform = `translate(${Math.round(b.left)}px, ${Math.round(b.top)}px)`;
      hb.width = `${Math.round(b.width)}px`;
      hb.height = `${Math.round(b.height)}px`;
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  /* =================== body motion =================== */
  // Joint conventions (he faces the camera): armR = his loaf arm (screen left), armB = his baguette arm.
  // Raising an arm out to the side: armR z < 0, armB z > 0. Swinging forward/back: x.
  applyClip(name, t, P) {
    const h = this.h;
    const b = P.b;
    switch (name) {
      case 'idle': {
        P.sqy *= 1 + Math.sin(t * 2.2) * 0.012;
        P.tz += Math.sin(t * 1.1) * 0.025;
        // hands never quite still: a slow swing, and now and then a little fidget
        b.armR[0] += Math.sin(t * 1.7) * 0.12;
        b.armB[0] += -Math.sin(t * 1.7) * 0.12;
        b.armR[2] -= 0.06 + Math.max(0, Math.sin(t * 0.9)) * 0.12;
        b.armB[2] += 0.06 + Math.max(0, Math.sin(t * 0.9 + 2)) * 0.12;
        b.head[2] += Math.sin(t * 0.8) * 0.06;
        break;
      }
      case 'carry':
        P.sqy *= 1 + Math.sin(t * 2.2) * 0.012;
        b.armR[2] = -2.55 + Math.sin(t * 6.5) * 0.05;
        b.armB[2] = 2.55 + Math.sin(t * 6.5) * 0.05;
        break;
      case 'run':
      case 'carryRun': {
        // a happy little run: arms and legs swinging
        const f = t * 15;
        const sw = Math.sin(f);
        P.tz += sw * (name === 'run' ? 0.08 : 0.05);
        P.dy += Math.abs(Math.cos(f)) * h * 0.05;
        P.tx += 0.1;
        b.legR[0] = sw * 0.38;
        b.legB[0] = -sw * 0.38;
        if (name === 'run') {
          b.armR[0] = -sw * 0.7;
          b.armB[0] = sw * 0.7;
          b.armR[2] = -0.15;
          b.armB[2] = 0.15;
        } else {
          b.armR[2] = -2.55 + sw * 0.06;
          b.armB[2] = 2.55 + sw * 0.06;
        }
        break;
      }
      case 'climb': {
        // hand over hand, legs pushing, seen from behind
        const f = t * 7;
        const sw = Math.sin(f);
        b.armR[2] = -(1.55 + Math.max(0, sw) * 0.85);
        b.armB[2] = 1.55 + Math.max(0, -sw) * 0.85;
        b.armR[0] = -0.25;
        b.armB[0] = -0.25;
        b.legR[0] = Math.max(0, -sw) * 0.4;
        b.legB[0] = Math.max(0, sw) * 0.4;
        P.tz += sw * 0.06;
        P.dy += Math.abs(sw) * h * 0.02;
        break;
      }
      case 'hang': {
        // dangling from the edge by both hands, legs kicking
        b.armR[2] = -2.6;
        b.armB[2] = 2.6;
        b.legR[0] = Math.sin(t * 9) * 0.35;
        b.legB[0] = -Math.sin(t * 9) * 0.35;
        break;
      }
      case 'surf':
        P.yaw += -0.95;
        P.sqy *= 0.92;
        P.tz += Math.sin(t * 5) * 0.12;
        b.armR[2] = -1.3 + Math.sin(t * 7) * 0.25;
        b.armB[2] = 1.3 + Math.sin(t * 7 + 1) * 0.25;
        break;
      case 'fly':
        // arms flapping, legs tucked: "wheee!"
        P.sqy *= 1.05;
        P.sqx *= 0.97;
        b.armR[2] = -(1.9 + Math.sin(t * 16) * 0.45);
        b.armB[2] = 1.9 + Math.sin(t * 16) * 0.45;
        b.legR[0] = -0.3;
        b.legB[0] = 0.25;
        break;
      default:
        break;
    }
  }

  applyAct(name, k, t, P) {
    const h = this.h;
    const b = P.b;
    const bump = Math.sin(Math.PI * k); // 0 -> 1 -> 0
    const up = E.out(Math.min(1, k * 4)) * (1 - E.in(Math.max(0, (k - 0.82) / 0.18))); // raise, hold, lower
    switch (name) {
      case 'peek':
        // leaning out from behind the 2.5D Tino, waving
        P.tz += -0.42 * E.out(Math.min(1, k * 3)) + Math.sin(t * 10) * 0.04 * (k > 0.3 ? 1 : 0);
        P.yaw += 0.35;
        b.armB[2] = up * (2.1 + Math.sin(t * 13) * 0.4);
        b.head[2] += 0.2 * up;
        break;
      case 'wave':
        b.armB[2] = up * (2.15 + Math.sin(k * TAU * 3.5) * 0.45);
        b.armB[0] = -0.2 * up;
        b.head[2] += -0.15 * up;
        P.tz += Math.sin(k * TAU * 1.75) * 0.05 * up;
        P.dy += Math.abs(Math.sin(k * TAU * 1.75)) * h * 0.03;
        break;
      case 'wiggle':
        P.tz += Math.sin(k * TAU * 3) * 0.18 * bump;
        P.dy += Math.abs(Math.sin(k * TAU * 1.5)) * h * 0.06;
        P.yaw += Math.sin(k * TAU * 1.5) * 0.3;
        b.armR[2] = -(0.6 + Math.sin(k * TAU * 3) * 0.5) * bump;
        b.armB[2] = (0.6 - Math.sin(k * TAU * 3) * 0.5) * bump;
        break;
      case 'hop':
        P.dy += bump * h * 0.22;
        P.sqy *= k < 0.15 ? 0.9 : 1 + bump * 0.06;
        b.armR[2] = -1.4 * bump;
        b.armB[2] = 1.4 * bump;
        b.legR[0] = -0.25 * bump;
        b.legB[0] = 0.2 * bump;
        break;
      case 'backflip':
      case 'frontflip': {
        const back = name === 'backflip';
        const e = E.inOut(clamp((k - 0.12) / 0.76, 0, 1));
        P.dy += Math.sin(Math.PI * clamp((k - 0.1) / 0.8, 0, 1)) * h * (back ? 0.6 : 0.55);
        P.sx += (back ? -TAU : TAU) * e;
        P.yaw += (back ? 0.5 : -0.5) * bump;
        const tuck = Math.sin(Math.PI * e);
        P.sqy *= 1 - 0.14 * tuck;
        if (k < 0.12) P.sqy *= 1 - 0.15 * Math.sin((k / 0.12) * Math.PI);
        // arms swing up for the take-off, hug the knees in the air
        const swing = k < 0.15 ? k / 0.15 : 1 - tuck;
        b.armR[2] = -2.3 * swing - 0.5 * tuck;
        b.armB[2] = 2.3 * swing + 0.5 * tuck;
        b.armR[0] = -0.9 * tuck;
        b.armB[0] = -0.9 * tuck;
        b.legR[0] = -0.35 * tuck;
        b.legB[0] = -0.35 * tuck;
        break;
      }
      case 'cartwheel':
        P.sz += -TAU * E.inOut(k);
        P.dy += bump * h * 0.32;
        b.armR[2] = -2.35;
        b.armB[2] = 2.35;
        b.legR[2] = -0.3;
        b.legB[2] = 0.3;
        break;
      case 'spin':
        P.yaw += TAU * 2 * E.inOut(k);
        P.dy += bump * h * 0.2;
        P.sqy *= 1 + bump * 0.06;
        b.armR[2] = -1.5 * up;
        b.armB[2] = 1.5 * up;
        b.legB[0] = -0.3 * bump;
        break;
      case 'dance': {
        const f = k * TAU * 4;
        P.tz += Math.sin(f) * 0.15;
        P.yaw += Math.sin(f * 0.5) * 0.5;
        P.dy += Math.abs(Math.sin(f)) * h * 0.06;
        // disco: one arm up, one arm down, swap
        b.armR[2] = -(1.1 + Math.sin(f) * 0.9) * up;
        b.armB[2] = (1.1 - Math.sin(f) * 0.9) * up;
        b.armR[0] = -0.3 * up;
        b.legR[2] = -Math.max(0, Math.sin(f)) * 0.3;
        b.legB[2] = Math.max(0, -Math.sin(f)) * 0.3;
        b.head[2] += Math.sin(f) * 0.15;
        break;
      }
      case 'cheer': {
        const j = Math.abs(Math.sin(k * TAU));
        P.dy += j * h * 0.28;
        P.sqy *= 1 + j * 0.08;
        P.tz += Math.sin(k * TAU * 2) * 0.06;
        b.armR[2] = -(2.2 + Math.sin(k * TAU * 4) * 0.3) * up;
        b.armB[2] = (2.2 - Math.sin(k * TAU * 4) * 0.3) * up;
        b.legR[0] = -0.2 * j;
        b.legB[0] = -0.2 * j;
        break;
      }
      case 'tada': {
        const e = E.back(Math.min(1, k * 2.2));
        P.dy += Math.sin(Math.PI * Math.min(1, k * 2)) * h * 0.12;
        P.tz += 0.1 * e * (1 - k);
        b.armR[2] = -1.35 * e * (1 - E.in(Math.max(0, (k - 0.75) / 0.25)));
        b.armB[2] = 1.35 * e * (1 - E.in(Math.max(0, (k - 0.75) / 0.25)));
        b.legB[2] = 0.25 * e * (1 - k);
        b.head[2] += 0.15 * e * (1 - k);
        break;
      }
      case 'bow':
        P.tx += 0.5 * bump;
        b.armR[0] = -0.9 * bump; // hand to his chest
        b.armB[0] = 0.5 * bump;
        b.head[0] += 0.25 * bump;
        break;
      case 'sniff':
        P.tx += 0.12 * bump;
        P.yaw += Math.sin(k * TAU) * 0.5;
        b.head[0] += -0.3 * bump + Math.sin(k * TAU * 6) * 0.05;
        b.armB[0] = -0.6 * bump;
        break;
      case 'grab':
        P.tx += 0.4 * bump;
        P.sqy *= 1 - 0.12 * bump;
        b.armR[0] = -1.2 * bump;
        b.armB[0] = -1.2 * bump;
        break;
      case 'toss':
        P.tx += -0.25 * bump;
        P.dy += bump * h * 0.12;
        b.armR[2] = -2.55 - 0.2 * bump;
        b.armB[2] = 2.55 + 0.2 * bump;
        b.armR[0] = 0.5 * bump;
        b.armB[0] = 0.5 * bump;
        break;
      case 'land':
        P.sqy *= 1 - 0.16 * bump;
        P.sqx *= 1 + 0.1 * bump;
        b.armR[2] = -0.9 * bump;
        b.armB[2] = 0.9 * bump;
        break;
      case 'dizzy':
        P.tz += Math.sin(k * TAU * 3) * 0.2 * (1 - k * 0.5);
        P.yaw += Math.sin(k * TAU * 2) * 0.4;
        b.armR[2] = -(0.7 + Math.sin(k * TAU * 3) * 0.5);
        b.armB[2] = 0.7 - Math.sin(k * TAU * 3 + 1) * 0.5;
        b.head[2] += Math.sin(k * TAU * 3) * 0.25;
        break;
      case 'swing': {
        // hanging from the marquee, swinging to get some momentum
        const sw = Math.sin(k * TAU * 2) * (1 - k * 0.3);
        P.tz += sw * 0.28;
        b.legR[0] = -0.4 * sw;
        b.legB[0] = -0.4 * sw;
        break;
      }
      case 'pullup':
        // pulling himself up over the edge
        P.sqy *= 1 - 0.1 * bump;
        b.armR[2] = -2.6 + 1.1 * E.inOut(k);
        b.armB[2] = 2.6 - 1.1 * E.inOut(k);
        b.legR[0] = -0.5 * bump;
        break;
      default:
        break;
    }
  }

  /* =================== places =================== */
  dockSpot() {
    const small = window.innerWidth < 640;
    const h = small ? 110 : clamp(window.innerHeight * 0.22, 130, 180);
    return { x: (small ? 14 : 24) + h * 0.28, y: window.innerHeight - (small ? 10 : 16), h };
  }

  besideSpot(getRect) {
    const r = getRect();
    if (!r || !r.width) return null;
    const h = clamp(r.height * 0.88, 110, 340);
    const roomRight = window.innerWidth - r.right;
    const side = roomRight > h * 0.45 ? 1 : -1;
    const x = side > 0 ? Math.min(r.right + h * 0.3, window.innerWidth - h * 0.3) : Math.max(r.left - h * 0.3, h * 0.3);
    return { x, y: r.bottom - r.height * 0.035, h, side };
  }

  marqueeLine(x) {
    const m = document.querySelector('.bk-marquee');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const tilt = Math.tan((1 * Math.PI) / 180); // the marquee is rotated -1deg (right end higher)
    return clamp(r.top + (r.right - x) * tilt + 6, 70, window.innerHeight - 30);
  }

  // the marquee's top and bottom edge at x (it is rotated -1deg), and whether it is on screen
  marqueeEdges(x) {
    const m = document.querySelector('.bk-marquee');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const tilt = Math.tan((1 * Math.PI) / 180);
    return {
      top: r.top + (r.right - x) * tilt,
      bottom: r.bottom - (x - r.left) * tilt,
      visible: r.bottom > 90 && r.top < window.innerHeight - 60,
    };
  }

  /* =================== scenes =================== */

  // hides behind the 2.5D Tino, peeks out, pops out over his shoulder and shows off
  async intro(getRect, cue = () => {}) {
    this.busy = true; // little tricks wait until the show is over
    try {
      await this.introShow(getRect, cue);
    } finally {
      this.busy = false;
    }
  }

  async introShow(getRect, cue) {
    const step = this.newRun();
    this.where = 'hero';
    // wait (briefly) until the logo Tino is on the page
    for (let i = 0; i < 20 && !(getRect() && getRect().width); i++) await step(sleep(50));
    const r = getRect();
    const spot = this.besideSpot(getRect);
    if (!r || !spot) return;
    const h = spot.h;
    this.follow = null;
    this.h = h;
    if (this.reduced) {
      this.pos = { x: spot.x, y: spot.y };
      this.follow = () => this.besideSpot(getRect);
      this.show(true);
      await step(cue('peek'));
      await step(cue('hello'));
      await step(cue('welcome'));
      return;
    }
    const base = () => getRect().bottom - getRect().height * 0.04;
    this.pos = { x: r.left + r.width * 0.5, y: base() };
    this.occluderRect = getRect;
    this.show(true);
    // peek out on the right-hand side and wiggle hello
    await step(this.moveTo(() => ({ x: getRect().right - h * 0.12, y: base() }), { dur: 700, ease: 'out', clip: 'idle' }));
    const peek = this.play('peek', 2200);
    await step(Promise.all([peek, cue('peek')]));
    // duck back in...
    await step(this.moveTo(() => ({ x: getRect().left + getRect().width * 0.5, y: base() }), { dur: 380, ease: 'in', clip: 'idle' }));
    await step(sleep(500));
    // ...and pop out over his shoulder!
    setTimeout(() => {
      if (this.where === 'hero') this.occluderRect = null;
    }, 420);
    await step(this.moveTo(() => this.besideSpot(getRect), { dur: 950, arc: h * 1.1, clip: 'fly', flip: -TAU }));
    this.occluderRect = null;
    this.follow = () => this.besideSpot(getRect);
    await step(this.play('land', 260));
    await step(Promise.all([this.play('wave', 1300), cue('hello')]));
    await step(cue('watch'));
    await step(this.play('backflip'));
    await step(this.play('land', 220));
    // cartwheel out and back
    const away = this.besideSpot(getRect).side; // away from the logo Tino
    this.follow = null;
    const out = () => {
      const s = this.besideSpot(getRect);
      return { x: clamp(s.x + away * h * 0.9, h * 0.3, window.innerWidth - h * 0.3), y: s.y };
    };
    await step(Promise.all([this.moveTo(out, { dur: 900, clip: 'idle' }), this.play('cartwheel', 900)]));
    await step(Promise.all([this.moveTo(() => this.besideSpot(getRect), { dur: 900, clip: 'idle' }), this.play('cartwheel', 900)]));
    this.follow = () => this.besideSpot(getRect);
    await step(this.play('spin'));
    await step(this.play('tada'));
    await step(cue('welcome'));
  }

  // a playful move on the spot
  async trick(name) {
    if (this.busy || this.where === 'travel' || this.where === 'hidden') return;
    const step = this.newRun();
    await step(this.play(name));
    if (['backflip', 'frontflip'].includes(name)) await step(this.play('land', 220));
  }

  // back up to the 2.5D Tino: if the marquee is on screen he climbs up it on the way
  async toHero(getRect) {
    const step = this.newRun();
    const fromDock = this.where === 'dock';
    this.where = 'travel';
    this.follow = null;
    this.occluderRect = null;
    this.show(true);
    const spot = () => this.besideSpot(getRect) || this.dockSpot();
    const m0 = this.marqueeEdges(this.pos.x);
    if (fromDock && m0 && m0.visible && !this.reduced) {
      const x0 = clamp(this.pos.x + this.h * 0.5, this.h * 0.5, window.innerWidth * 0.4);
      const x = Math.min(x0 + Math.max(160, window.innerWidth * 0.14), window.innerWidth - this.h);
      const edgeAt = xx => () => this.marqueeEdges(xx) || { top: this.pos.y, bottom: this.pos.y };
      const edge = edgeAt(x);
      // jump up and grab the bottom edge...
      this.faceAway = true;
      await step(this.moveTo(() => ({ x: x0, y: edgeAt(x0)().bottom + this.h * 1.02 }), { dur: 650, ease: 'out', clip: 'hang' }));
      this.clip = 'hang';
      await step(this.play('swing', 700));
      // ...monkey bars along it...
      await step(this.moveTo(() => ({ x, y: edge().bottom + this.h * 1.02 }), { dur: 1300, ease: 'linear', clip: 'climb' }));
      // ...climb up over the front of the marquee, hand over hand...
      await step(this.moveTo(() => ({ x, y: edge().top + 4 }), { dur: 1500, ease: 'linear', clip: 'climb' }));
      await step(this.play('pullup', 420));
      // ...turn round on top, wave, and hop back up to the logo
      this.clip = 'idle';
      this.faceAway = false;
      this.follow = () => ({ x, y: edge().top + 4 });
      await step(sleep(250));
      await step(this.play('wave', 1100));
      this.follow = null;
    }
    await step(this.moveTo(spot, { dur: 950, arc: 170, clip: 'fly', h: spot().h, flip: TAU }));
    this.follow = spot;
    this.where = 'hero';
    await step(this.play('land', 240));
  }

  // hop onto the marquee, run along it, climb down its front, dangle, and drop into the corner
  async viaMarquee() {
    const step = this.newRun();
    this.where = 'travel';
    this.follow = null;
    this.occluderRect = null;
    this.show(true);
    const dock = this.dockSpot();
    const vw = window.innerWidth;
    const m0 = this.marqueeEdges(this.pos.x);
    if (!m0 || !m0.visible || this.reduced) {
      // the marquee is already off screen: just jump into the corner
      await step(this.moveTo(() => this.dockSpot(), { dur: 800, arc: 140, clip: 'fly', h: dock.h, flip: TAU }));
    } else {
      const h = dock.h;
      const x1 = clamp(this.pos.x, vw * 0.55, vw - 80);
      const x2 = clamp(vw * 0.32, dock.x + h * 0.7, vw - 80);
      const edge = x => () => this.marqueeEdges(x) || { top: this.dockSpot().y - h, bottom: this.dockSpot().y - h };
      // onto the marquee...
      await step(this.moveTo(() => ({ x: x1, y: edge(x1)().top + 4 }), { dur: 650, arc: 90, clip: 'fly', h }));
      await step(this.play('land', 180));
      // ...run along the top while the words scroll under his feet...
      await step(this.moveTo(() => ({ x: x2, y: edge(x2)().top + 4 }), { dur: 1300, clip: 'run' }));
      // ...turn round and climb down the front, hand over hand...
      this.faceAway = true;
      this.follow = () => ({ x: x2, y: edge(x2)().top + 4 });
      await step(sleep(280));
      this.follow = null;
      await step(this.moveTo(() => ({ x: x2, y: edge(x2)().bottom + h * 1.02 }), { dur: 1500, ease: 'linear', clip: 'climb' }));
      // ...monkey bars along the bottom edge, hand over hand...
      const x3 = Math.max(dock.x + h * 0.35, x2 - Math.max(160, vw * 0.14));
      await step(this.moveTo(() => ({ x: x3, y: edge(x3)().bottom + h * 1.02 }), { dur: 1500, ease: 'linear', clip: 'climb' }));
      // ...dangle and swing...
      this.clip = 'hang';
      this.follow = () => ({ x: x3, y: edge(x3)().bottom + h * 1.02 });
      await step(this.play('swing', 1000));
      this.follow = null;
      // ...and let go: somersault into the corner
      this.clip = 'idle';
      this.faceAway = false;
      await step(this.moveTo(() => this.dockSpot(), { dur: 800, arc: 50, ease: 'in', clip: 'fly', flip: TAU }));
    }
    this.follow = () => this.dockSpot();
    this.where = 'dock';
    await step(this.play('land', 260));
  }

  // drop into the corner from the top of the screen
  async dropIn() {
    const step = this.newRun();
    this.where = 'travel';
    this.occluderRect = null;
    const d = this.dockSpot();
    this.h = d.h;
    this.pos = { x: d.x, y: -40 };
    this.show(true);
    await step(this.moveTo(() => this.dockSpot(), { dur: 900, ease: 'in', clip: 'fly' }));
    this.follow = () => this.dockSpot();
    this.where = 'dock';
    await step(this.play('land', 300));
  }

  async toDock() {
    const step = this.newRun();
    this.where = 'travel';
    this.occluderRect = null;
    await step(this.moveTo(() => this.dockSpot(), { dur: 800, arc: 140, clip: 'fly', h: this.dockSpot().h }));
    this.follow = () => this.dockSpot();
    this.where = 'dock';
    await step(this.play('land', 240));
  }

  // run to the menu card, grab the treat, balance it on his head, carry it to the basket and toss it in
  async deliver(cardEl, imageUrl, mouthEl, { onGrab, onDrop } = {}) {
    const step = this.newRun();
    this.busy = true;
    this.where = 'delivering';
    this.follow = null;
    this.occluderRect = null;
    this.show(true);
    let dropped = false;
    const drop = () => {
      if (!dropped && onDrop) onDrop();
      dropped = true;
    };
    try {
      const at = el => () => {
        const r = el.getBoundingClientRect();
        return { x: clamp(r.left + r.width / 2, 50, window.innerWidth - 50), y: clamp(r.bottom - 8, 140, window.innerHeight - 8) };
      };
      const h = clamp(this.dockSpot().h * 0.85, 100, 150);
      await step(this.moveTo(at(cardEl), { dur: 750, arc: h * 0.9, clip: 'fly', h }));
      await step(this.play('land', 160));
      await step(this.play('grab', 420));
      this.holdPhoto(imageUrl);
      if (onGrab) onGrab();
      const mouth = () => {
        const r = mouthEl.getBoundingClientRect();
        return { x: r.left + r.width * 0.78, y: clamp(r.top + r.height * 0.6 + h * 0.25, 140, window.innerHeight - 8) };
      };
      await step(this.moveTo(mouth, { dur: 1050, arc: h * 0.9, clip: 'carryRun' }));
      await step(this.play('toss', 360));
      await this.flyPlate(mouthEl);
      drop();
      await step(this.play('cheer', 900));
      await step(this.moveTo(() => this.dockSpot(), { dur: 780, arc: 120, clip: 'fly', h: this.dockSpot().h }));
      await step(this.play('land', 220));
    } finally {
      this.holdPhoto(null);
      drop(); // never lose an order, even if he got interrupted
      this.busy = false;
      if (this.where === 'delivering') {
        this.follow = () => this.dockSpot();
        this.where = 'dock';
      }
    }
  }

  // the plate leaves his head and arcs into the basket
  flyPlate(mouthEl) {
    const g = this.carry;
    const start = g.position.clone();
    const s0 = g.scale.x;
    this.carrying = false;
    const t0 = performance.now();
    const dur = 460;
    return new Promise(resolve => {
      const f = now => {
        if (!this.alive) return resolve();
        const k = clamp((now - t0) / dur, 0, 1);
        const r = mouthEl.getBoundingClientRect();
        const end = { x: r.left + r.width / 2, y: -(r.top + r.height / 2) };
        g.position.set(lerp(start.x, end.x, k), lerp(start.y, end.y, E.in(k)) + Math.sin(Math.PI * k) * 70, 400);
        g.rotation.z = k * 5;
        g.scale.setScalar(s0 * (1 - 0.65 * k));
        if (k < 1) requestAnimationFrame(f);
        else {
          g.visible = false;
          resolve();
        }
      };
      requestAnimationFrame(f);
    });
  }
}
