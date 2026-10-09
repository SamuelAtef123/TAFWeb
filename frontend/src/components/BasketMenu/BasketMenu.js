import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MENU, CATEGORY_ICONS } from '../../data/menu';
import { fromApi, normalizeCart } from '../../utils/shop';
import './BasketMenu.css';

/* ---------- helpers ---------- */
const fmt = n => Number(n).toLocaleString('en-US');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function readCart() {
  try {
    const c = JSON.parse(localStorage.getItem('cart') || '[]');
    return Array.isArray(c) ? c : [];
  } catch (err) {
    return [];
  }
}

/* ---------- the real basket photo (basket.webp, 666 x 696 px) ----------
   Everything below is measured in pixels of that photo, then turned into %.
   Layers:  photo  ->  products  ->  the photo's own FRONT wall on top,
   so products sit *inside* the real basket.                                 */
const IMG = { w: 666, h: 696 };
const ITEM_W = 146;
const MOUTH = { x: 315, y: 366 }; // where things drop in
// everything below the front rim of the basket (clip for the top copy of the photo)
const FRONT = [
  [0, 418], [60, 414], [100, 410], [200, 406], [330, 403], [440, 401],
  [488, 399], [520, 399], [600, 398], [666, 396], [666, 696], [0, 696],
];
const FRONT_CLIP = `polygon(${FRONT.map(
  ([x, y]) => `${((x / IMG.w) * 100).toFixed(2)}% ${((y / IMG.h) * 100).toFixed(2)}%`
).join(',')})`;
const at = (x, y) => ({ left: `${(x / IMG.w) * 100}%`, top: `${(y / IMG.h) * 100}%` });

// where products pile up inside the basket, in the order they are added
const SLOTS = [
  { x: 252, y: 386, s: 1, r: -6 },
  { x: 392, y: 384, s: 1, r: 5 },
  { x: 320, y: 366, s: 1.04, r: -2 },
  { x: 192, y: 396, s: 0.88, r: 8 },
  { x: 458, y: 392, s: 0.88, r: -8 },
  { x: 262, y: 332, s: 0.9, r: 4 },
  { x: 378, y: 330, s: 0.9, r: -5 },
  { x: 322, y: 294, s: 0.8, r: 2 },
];

// "goes great with" suggestions, by category of what was just added
const PAIRS = {
  Viennoiserie: ['HOT005', 'HOT006'],
  Cookies: ['HOT006'],
  Muffins: ['HOT006'],
  'English Cake': ['HOT003'],
  Individuals: ['HOT001'],
  Tarts: ['HOT001'],
  Choux: ['HOT005'],
  Salad: ['COL012'],
  Sandwiches: ['COL012', 'COL011'],
  'Hot Drinks': ['VIE001'],
  'V60 Coffee': ['VIE001'],
  'Cold Drinks': ['VIE002'],
  Smoothies: ['COO001'],
  'New Drinks': ['COO001'],
};

/* ---------- tiny synthesized sounds ---------- */
let audioCtx = null;
function audio() {
  if (!audioCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    audioCtx = new C();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playPop() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(380, t);
  o.frequency.exponentialRampToValueAtTime(920, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g);
  g.connect(a.destination);
  o.start(t);
  o.stop(t + 0.25);
  const len = Math.floor(a.sampleRate * 0.12);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const n = a.createBufferSource();
  n.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2600;
  const g2 = a.createGain();
  g2.gain.value = 0.1;
  n.connect(f);
  f.connect(g2);
  g2.connect(a.destination);
  n.start(t + 0.06);
}

/* ---------- crumbs + sparkles (canvas) ---------- */
function useParticles(canvasRef) {
  const parts = useRef([]);
  const raf = useRef(0);
  const size = useRef({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.parentElement.clientWidth;
      const h = c.parentElement.clientHeight;
      size.current = { w, h, dpr };
      c.width = w * dpr;
      c.height = h * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c.parentElement);
    return () => ro.disconnect();
  }, [canvasRef]);

  const loop = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const { w, h, dpr } = size.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ps = parts.current;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= 1;
      if (p.life <= 0) {
        ps.splice(i, 1);
        continue;
      }
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / p.fade);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.type === 'star') {
        const s = p.size * 1.7;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const r = k % 2 ? s * 0.26 : s;
          const a = (k * Math.PI) / 4;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    raf.current = ps.length ? requestAnimationFrame(loop) : 0;
  }, [canvasRef]);

  const burst = useCallback(
    (x, y) => {
      const crumbColors = ['#c98f4b', '#b8742e', '#8a5a28', '#d9a35a', '#a8692f'];
      const sparkColors = ['#e0a458', '#d4782f', '#f2c36b', '#f0a23a'];
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.3;
        const sp = 2 + Math.random() * 5.2;
        parts.current.push({
          type: 'crumb', x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.22,
          size: 2 + Math.random() * 3.4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
          life: 55 + Math.random() * 30, fade: 25,
          color: crumbColors[(Math.random() * crumbColors.length) | 0],
        });
      }
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.6 + Math.random() * 2.6;
        parts.current.push({
          type: 'star', x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.4, g: 0.03,
          size: 2.2 + Math.random() * 3, rot: Math.random() * 3, vr: (Math.random() - 0.5) * 0.18,
          life: 50 + Math.random() * 40, fade: 30,
          color: sparkColors[(Math.random() * sparkColors.length) | 0],
        });
      }
      if (!raf.current) raf.current = requestAnimationFrame(loop);
    },
    [loop]
  );

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return burst;
}

/* ---------- number that rolls up to its new value ---------- */
function Ticker({ value }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    const b = value;
    if (a === b) return undefined;
    const start = performance.now();
    let id;
    const step = t => {
      const k = Math.min(1, (t - start) / 650);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (b - a) * e));
      if (k < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    from.current = b;
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <>{fmt(shown)}</>;
}

/* ---------- image with an emoji fallback ---------- */
function Photo({ src, alt, emoji, className }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return (
      <div className={`bm-fallback ${className || ''}`} aria-hidden="true">
        {emoji}
      </div>
    );
  }
  return (
    <img className={className} src={src} alt={alt} loading="lazy" draggable={false} onError={() => setBad(true)} />
  );
}

/* =====================================================================
   Basket + menu, drop-in replacement for the old "Find your favorite" section
   ===================================================================== */
export default function BasketMenu() {
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState(readCart);
  const [menu, setMenu] = useState(MENU);
  const [panel, setPanel] = useState(false);
  const [ghostProduct, setGhostProduct] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [sound, setSound] = useState(() => localStorage.getItem('bm-sound') === '1');

  const stageRef = useRef(null);
  const basketRef = useRef(null);
  const mouthRef = useRef(null);
  const tagRef = useRef(null);
  const ghostRef = useRef(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const overRef = useRef(false);
  const cartRef = useRef(cart);
  const menuRef = useRef(menu);
  const soundRef = useRef(sound);
  const bubbleTimer = useRef(0);

  cartRef.current = cart;
  menuRef.current = menu;
  soundRef.current = sound;

  const burst = useParticles(canvasRef);

  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  useEffect(() => {
    try {
      localStorage.setItem('cart', JSON.stringify(cart));
    } catch (err) {
      /* storage blocked - basket still works for this visit */
    }
    // let the page header update its cart counter
    window.dispatchEvent(new Event('cart:updated'));
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem('bm-sound', sound ? '1' : '0');
    } catch (err) {
      /* ignore */
    }
  }, [sound]);

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && setPanel(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => () => clearTimeout(bubbleTimer.current), []);

  // Load the live menu from the backend. If the server is not running we keep the menu that
  // ships with the website, so the page always works.
  useEffect(() => {
    let alive = true;
    fetch('/api/products', { headers: { Accept: 'application/json' } })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(list => {
        if (!alive || !Array.isArray(list) || list.length === 0) return;
        setMenu(list.map(fromApi));
      })
      .catch(() => {
        /* offline: bundled menu stays */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Keep saved cart lines pointing at the live products (Mongo id, current price, photo).
  useEffect(() => {
    setCart(prev => normalizeCart(prev, menu));
  }, [menu]);

  const categories = useMemo(() => [...new Set(menu.map(p => p.category))], [menu]);

  const counts = useMemo(() => {
    const m = { All: menu.length };
    menu.forEach(p => {
      m[p.category] = (m[p.category] || 0) + 1;
    });
    return m;
  }, [menu]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.filter(
      p =>
        (category === 'All' || p.category === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    );
  }, [menu, category, query]);

  /* ---------- cart ---------- */
  const addToCart = useCallback((product, qty = 1) => {
    setCart(prev => {
      const i = prev.findIndex(it => (it._id || it.id) === product.id || (product.code && it.code === product.code));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + qty };
        return next;
      }
      return [
        ...prev,
        {
          _id: product.id,
          id: product.id,
          code: product.code,
          name: product.name,
          price: product.price,
          image: product.image,
          category: product.category,
          quantity: qty,
        },
      ];
    });
  }, []);

  const changeQty = (id, delta) =>
    setCart(prev =>
      prev
        .map(it => ((it._id || it.id) === id ? { ...it, quantity: it.quantity + delta } : it))
        .filter(it => it.quantity > 0)
    );

  /* ---------- effects ---------- */
  const pulse = (ref, cls) => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // restart the CSS animation
    el.classList.add(cls);
  };

  const spawn = (cls, x, y, text) => {
    const stage = stageRef.current;
    if (!stage) return;
    const d = document.createElement('div');
    d.className = cls;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    if (text) d.textContent = text;
    stage.appendChild(d);
    d.addEventListener('animationend', () => d.remove(), { once: true });
    setTimeout(() => d.remove(), 2200);
  };

  const celebrate = (product, pt) => {
    const stage = stageRef.current;
    if (!stage) return;
    const sr = stage.getBoundingClientRect();
    const x = pt.x - sr.left;
    const y = pt.y - sr.top;
    burst(x, y);
    spawn('bm-ripple', x, y);
    spawn('bm-ripple bm-ripple2', x, y);
    spawn('bm-float', x, y - 34, `+1 ${product.name}`);
    pulse(basketRef, 'squash');
    pulse(tagRef, 'swing');
    if (navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch (err) {
        /* not supported */
      }
    }
    if (soundRef.current) playPop();
  };

  const suggestFor = product => {
    const ids = PAIRS[product.category] || [];
    const inCart = new Set(cartRef.current.flatMap(i => [i._id, i.id, i.code]));
    inCart.add(product.id);
    inCart.add(product.code);
    const pick = ids.find(code => !inCart.has(code));
    return pick ? menuRef.current.find(p => p.code === pick && p.available) || null : null;
  };

  const mouthPoint = () => {
    const r = mouthRef.current.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /* ---------- the ghost (the thing you carry) ---------- */
  const placeGhost = (x, y, scale = 1, rot = 0) => {
    const g = ghostRef.current;
    if (!g) return;
    g.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${rot}deg) scale(${scale})`;
  };

  const commit = (product, to) => {
    addToCart(product);
    celebrate(product, to);
    const s = suggestFor(product);
    clearTimeout(bubbleTimer.current);
    if (s) {
      setBubble(s);
      bubbleTimer.current = setTimeout(() => setBubble(null), 7500);
    }
  };

  // fly the ghost along an arc and drop it into the basket
  const landGhost = (product, from) => {
    const g = ghostRef.current;
    if (!g) return;
    setGhostProduct(product);
    g.style.display = 'block';
    g.style.opacity = '1';
    const to = mouthPoint();
    const mid = {
      x: (from.x + to.x) / 2 + (to.x - from.x) * 0.08,
      y: Math.min(from.y, to.y) - 110,
    };
    const frames = [];
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * mid.x + t * t * to.x;
      const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * mid.y + t * t * to.y;
      const sc = from.scale + (0.6 - from.scale) * t;
      const rot = from.rot * (1 - t) + t * 24;
      frames.push({
        transform: `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${rot}deg) scale(${sc})`,
        opacity: t > 0.9 ? 0 : 1,
      });
    }
    const anim = g.animate(frames, {
      duration: 560,
      easing: 'cubic-bezier(.45,.05,.55,.95)',
      fill: 'forwards',
    });
    anim.onfinish = () => {
      anim.cancel();
      g.style.display = 'none';
      setGhostProduct(null);
      setDragId(null);
      commit(product, to);
    };
  };

  const flyBack = (st, last) => {
    const g = ghostRef.current;
    const r = st.cardEl.getBoundingClientRect();
    const to = { x: r.left + r.width / 2, y: r.top + 100 };
    const anim = g.animate(
      [
        {
          transform: `translate(${last.x}px,${last.y}px) translate(-50%,-50%) rotate(${last.rot}deg) scale(${last.scale})`,
        },
        { transform: `translate(${to.x}px,${to.y}px) translate(-50%,-50%) rotate(0deg) scale(.7)`, opacity: 0 },
      ],
      { duration: 420, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'forwards' }
    );
    anim.onfinish = () => {
      anim.cancel();
      g.style.display = 'none';
      setGhostProduct(null);
      setDragId(null);
    };
  };

  // tap "+" / Enter on a card: fly the product from the card photo into the basket
  const quickAdd = (product, el) => {
    if (!product.available) return;
    const r = el.getBoundingClientRect();
    landGhost(product, {
      x: r.left + r.width / 2,
      y: r.top + Math.min(90, r.height / 2),
      scale: 0.95,
      rot: 0,
    });
  };

  const surprise = e => {
    const inCart = new Set(cart.map(i => i._id || i.id));
    const open = menuRef.current.filter(p => p.available);
    const pool = open.filter(p => p.featured && !inCart.has(p.id));
    const list = pool.length ? pool : open;
    const p = list[(Math.random() * list.length) | 0];
    const r = e.currentTarget.getBoundingClientRect();
    landGhost(p, { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: 0.8, rot: -10 });
  };

  /* ---------- drag & drop (pointer events: mouse, pen and touch) ---------- */
  const blockTouch = e => e.preventDefault();

  const inStage = (x, y) => {
    const r = stageRef.current.getBoundingClientRect();
    const m = 28;
    return x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
  };

  const startPress = (e, product) => {
    if (!product.available) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (dragRef.current) return;
    const cardEl = e.currentTarget;
    const st = {
      product,
      cardEl,
      pointerId: e.pointerId,
      isTouch: e.pointerType === 'touch',
      startX: e.clientX,
      startY: e.clientY,
      cur: { x: e.clientX, y: e.clientY },
      last: { x: e.clientX, y: e.clientY },
      tilt: 0,
      active: false,
      timer: 0,
    };
    dragRef.current = st;

    const detach = () => {
      clearTimeout(st.timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', blockTouch);
      document.body.classList.remove('bm-grabbing');
    };

    const begin = (x, y) => {
      st.active = true;
      st.last = { x, y };
      setGhostProduct(product);
      setDragId(product.id);
      document.body.classList.add('bm-grabbing');
      const g = ghostRef.current;
      g.style.display = 'block';
      g.style.opacity = '1';
      placeGhost(x, y, 1.12, 0);
      window.addEventListener('touchmove', blockTouch, { passive: false });
      if (navigator.vibrate) {
        try {
          navigator.vibrate(8);
        } catch (err) {
          /* not supported */
        }
      }
    };

    function onMove(ev) {
      if (ev.pointerId !== st.pointerId) return;
      st.cur = { x: ev.clientX, y: ev.clientY };
      if (!st.active) {
        const dist = Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY);
        if (st.isTouch) {
          if (dist > 10) {
            // the finger is scrolling the page, not dragging a product
            detach();
            dragRef.current = null;
          }
        } else if (dist > 5) {
          begin(ev.clientX, ev.clientY);
        }
        return;
      }
      const vx = ev.clientX - st.last.x;
      st.tilt = st.tilt * 0.7 + clamp(vx * 1.6, -22, 22) * 0.3;
      st.last = { x: ev.clientX, y: ev.clientY };
      placeGhost(ev.clientX, ev.clientY, 1.12, st.tilt);

      const over = inStage(ev.clientX, ev.clientY);
      if (over !== overRef.current) {
        overRef.current = over;
        setOverStage(over);
      }
      const sr = stageRef.current.getBoundingClientRect();
      const lean = ((ev.clientX - (sr.left + sr.width / 2)) / sr.width) * 8;
      stageRef.current.style.setProperty('--lean', over ? clamp(lean, -3, 3).toFixed(2) : '0');
    }

    function finish(x, y, cancelled) {
      const wasActive = st.active;
      detach();
      dragRef.current = null;
      if (!wasActive) return;
      overRef.current = false;
      setOverStage(false);
      stageRef.current.style.setProperty('--lean', '0');
      const from = { x, y, scale: 1.12, rot: st.tilt };
      if (!cancelled && inStage(x, y)) landGhost(product, from);
      else flyBack(st, from);
    }

    function onUp(ev) {
      if (ev.pointerId !== st.pointerId) return;
      finish(ev.clientX, ev.clientY, false);
    }
    function onCancel(ev) {
      if (ev.pointerId !== st.pointerId) return;
      finish(st.last.x, st.last.y, true);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);

    if (st.isTouch) {
      // long-press to pick a product up, so normal swipes still scroll the page
      st.timer = setTimeout(() => {
        if (dragRef.current === st && !st.active) begin(st.cur.x, st.cur.y);
      }, 230);
    }
  };

  /* ---------- card tilt ---------- */
  const tilt = e => {
    if (e.pointerType !== 'mouse' || dragRef.current) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((px - 0.5) * 9).toFixed(2)}deg`);
  };
  const untilt = e => {
    const el = e.currentTarget;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  const shown = cart.slice(-SLOTS.length);
  const hidden = cart.length - shown.length;

  return (
    <div className="bm" id="menu">
      <section className="bk-menu bm-menu" aria-label="Menu">
        <div className="bk-menu-head" data-reveal>
          <h2>Find your favorite.</h2>
          <p>From our oven to your table.</p>
        </div>

        <div className="bm-layout">
          {/* ===== the basket: sits left of the menu and stays in view while you browse ===== */}
          <aside
            ref={stageRef}
            className={`bm-stage ${dragId ? 'dragging' : ''} ${overStage ? 'over' : ''} ${cart.length ? 'filled' : ''}`}
            style={{ '--lean': 0 }}
            aria-label="Your basket"
          >
            <button
              type="button"
              className={`bm-sound ${sound ? 'on' : ''}`}
              onClick={() => setSound(s => !s)}
              aria-pressed={sound}
              aria-label={sound ? 'Turn sounds off' : 'Turn sounds on'}
              title={sound ? 'Sounds on' : 'Sounds off'}
            >
              {sound ? '🔊' : '🔈'}
            </button>

            <p className="bm-eyebrow">Your basket</p>

            <div className="bm-basket-wrap">
              <div className="bm-shadow" aria-hidden="true" />
              <div className="bm-basket" ref={basketRef}>
                <img className="bm-photo" src="/images/basket.webp" alt="" draggable={false} />

                <div className="bm-items">
                  {shown.map((it, i) => {
                    const slot = SLOTS[i];
                    const id = it._id || it.id;
                    return (
                      <div
                        key={id}
                        className="bm-med"
                        style={{
                          ...at(slot.x, slot.y),
                          width: `${((ITEM_W * slot.s) / IMG.w) * 100}%`,
                          zIndex: i + 1,
                        }}
                      >
                        <div className="bm-med-in" key={`${id}:${it.quantity}`} style={{ '--r': `${slot.r}deg` }}>
                          <Photo src={it.image} alt={it.name} emoji={CATEGORY_ICONS[it.category] || '🥐'} />
                          {it.quantity > 1 && <b className="bm-qty">×{it.quantity}</b>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* soft shadow where the products sink behind the front wall */}
                <div className="bm-inner-shade" />

                {/* the photo again, clipped to just the front wall, drawn over the products */}
                <img
                  className="bm-photo bm-front"
                  src="/images/basket.webp"
                  alt=""
                  draggable={false}
                  aria-hidden="true"
                  style={{ clipPath: FRONT_CLIP, WebkitClipPath: FRONT_CLIP }}
                />

                <div className="bm-mouth" ref={mouthRef} style={at(MOUTH.x, MOUTH.y)}>
                  <span className="bm-mouth-ring" />
                  <span className="bm-mouth-label">Drop it in</span>
                </div>

                <svg className="bm-steam" viewBox="0 0 200 120" aria-hidden="true">
                  <path d="M70 120 C55 95 90 85 72 55 C62 36 82 24 74 4" />
                  <path d="M104 120 C88 98 122 84 106 56 C96 38 114 26 108 6" />
                  <path d="M136 120 C122 97 152 86 138 58 C130 42 144 30 140 10" />
                </svg>
              </div>

              <button
                type="button"
                ref={tagRef}
                className="bm-tag"
                onClick={() => setPanel(true)}
                aria-label={`Open basket: ${count} items, ${fmt(total)} EGP`}
              >
                <i className="bm-tag-hole" />
                <span className="bm-tag-n">
                  {count} {count === 1 ? 'treat' : 'treats'}
                </span>
                <span className="bm-tag-total">
                  <Ticker value={total} /> <small>EGP</small>
                </span>
              </button>

              {hidden > 0 && <span className="bm-more">+{hidden} more</span>}
            </div>

            <p className={`bm-hint ${cart.length ? 'quiet' : ''}`}>Drag a treat onto the basket, or tap +</p>

            <div className="bm-actions">
              <button type="button" onClick={() => setPanel(true)}>
                Review
              </button>
              <Link className={cart.length ? '' : 'disabled'} to="/cart" aria-disabled={!cart.length}>
                Checkout →
              </Link>
            </div>

            {bubble && (
              <div className="bm-bubble" role="status">
                <Photo src={bubble.image} alt="" emoji="☕" className="bm-bubble-img" />
                <div>
                  <small>Goes great with</small>
                  <strong>{bubble.name}</strong>
                  <span>{fmt(bubble.price)} EGP</span>
                </div>
                <button
                  type="button"
                  className="bm-bubble-add"
                  onClick={e => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const b = bubble;
                    setBubble(null);
                    landGhost(b, { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: 0.8, rot: 0 });
                  }}
                >
                  Add
                </button>
                <button type="button" className="bm-bubble-x" onClick={() => setBubble(null)} aria-label="Dismiss">
                  ×
                </button>
              </div>
            )}

            <canvas ref={canvasRef} className="bm-particles" aria-hidden="true" />
          </aside>

          {/* ===== the menu ===== */}
          <div className="bm-main">
            <div className="bm-tools">
              <label className="bm-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="Search the menu…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </label>
              <button type="button" className="bm-surprise" onClick={surprise}>
                🎲 Surprise me
              </button>
            </div>

            <div className="bk-cats" role="tablist" aria-label="Product categories" data-reveal>
              {['All', ...categories].map(c => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  className={category === c ? 'active' : ''}
                  onClick={() => setCategory(c)}
                >
                  <span className="bm-chip-ic" aria-hidden="true">
                    {CATEGORY_ICONS[c]}
                  </span>
                  {c}
                  <em>{counts[c]}</em>
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="bk-empty">
                <span>✦</span>
                <h3>Nothing matches “{query}”.</h3>
                <p>Try another word or pick a different category.</p>
              </div>
            ) : (
              <div className="bk-grid bm-grid" key={`${category}|${query}`}>
                {filtered.map((p, i) => (
                  <article
                    key={p.id}
                    className={`bk-card bm-card ${dragId === p.id ? 'is-dragging' : ''} ${p.available ? '' : 'is-soldout'}`}
                    style={{ '--i': Math.min(i, 12) }}
                    tabIndex={0}
                    aria-label={`${p.name}, ${p.price} EGP. Press Enter to add to the basket.`}
                    onPointerDown={e => startPress(e, p)}
                    onPointerMove={tilt}
                    onPointerLeave={untilt}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        quickAdd(p, e.currentTarget.querySelector('.bk-img'));
                      }
                    }}
                  >
                    <div className="bk-img">
                      <Photo src={p.image} alt={p.name} emoji={CATEGORY_ICONS[p.category]} />
                      {!p.available ? <span className="bm-ribbon bm-soldout">Sold out</span> : p.featured && <span className="bm-ribbon">★ Signature</span>}
                    </div>
                    <div className="bk-info">
                      <p className="bk-cat">{p.category}</p>
                      <h3>{p.name}</h3>
                      <p className="bm-desc">{p.description}</p>
                      <p className="bk-price">{fmt(p.price)} EGP</p>
                    </div>
                    <button
                      className="bk-add"
                      type="button"
                      aria-label={`Add ${p.name} to basket`}
                      disabled={!p.available}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => quickAdd(p, e.currentTarget.closest('.bm-card').querySelector('.bk-img'))}
                    >
                      +
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- what you're carrying while you drag ---------- */}
      <div ref={ghostRef} className="bm-ghost" aria-hidden="true">
        {ghostProduct && (
          <Photo src={ghostProduct.image} alt="" emoji={CATEGORY_ICONS[ghostProduct.category]} />
        )}
      </div>

      {/* ---------- basket drawer ---------- */}
      <div className={`bm-scrim ${panel ? 'open' : ''}`} onClick={() => setPanel(false)} />
      <aside className={`bm-panel ${panel ? 'open' : ''}`} aria-hidden={!panel}>
        <div className="bm-panel-head">
          <div>
            <p>Your basket</p>
            <h2>
              {count} {count === 1 ? 'treat' : 'treats'}
            </h2>
          </div>
          <button type="button" className="bm-x" onClick={() => setPanel(false)} aria-label="Close basket">
            ×
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="bm-panel-empty">
            <span>🧺</span>
            <p>Your basket is waiting.</p>
            <small>Drag something warm and buttery into it.</small>
          </div>
        ) : (
          <ul className="bm-lines">
            {cart.map(it => {
              const id = it._id || it.id;
              return (
                <li key={id}>
                  <div className="bm-line-img">
                    <Photo src={it.image} alt="" emoji={CATEGORY_ICONS[it.category] || '🥐'} />
                  </div>
                  <div className="bm-line-info">
                    <strong>
                      <Link to={`/product/${it.code || id}`}>{it.name}</Link>
                    </strong>
                    <span>{fmt(it.price)} EGP</span>
                  </div>
                  <div className="bm-stepper">
                    <button type="button" onClick={() => changeQty(id, -1)} aria-label={`Remove one ${it.name}`}>
                      −
                    </button>
                    <span>{it.quantity}</span>
                    <button type="button" onClick={() => changeQty(id, 1)} aria-label={`Add one ${it.name}`}>
                      +
                    </button>
                  </div>
                  <b className="bm-line-total">{fmt(it.price * it.quantity)}</b>
                </li>
              );
            })}
          </ul>
        )}

        <div className="bm-panel-foot">
          <div className="bm-sum">
            <span>Total</span>
            <strong>
              <Ticker value={total} /> <small>EGP</small>
            </strong>
          </div>
          <div className="bm-panel-actions">
            <button type="button" className="bm-ghost-btn" onClick={() => setCart([])} disabled={!cart.length}>
              Empty basket
            </button>
            <Link className={`bm-checkout ${cart.length ? '' : 'disabled'}`} to="/cart" aria-disabled={!cart.length}>
              Checkout →
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
