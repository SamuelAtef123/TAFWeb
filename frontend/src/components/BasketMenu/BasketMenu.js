import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MENU } from '../../data/menu';
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
const ITEM_W = 168; // the product photos have a little room around them, so a touch bigger than before
const MOUTH = { x: 450, y: 366 }; // where things drop in (the middle of the free part of the basket)
// everything below the top edge of the cloth's front fold (clip for the top copy of the photo);
// measured on the photo, the same line that hides Tino's legs (see FOLD in Mascot/three/Companion.js)
const FRONT = [
  [0, 404], [90, 399], [120, 411], [150, 426], [180, 432], [210, 433], [240, 433], [270, 427],
  [300, 420], [330, 417], [360, 414], [420, 410], [480, 403], [540, 400], [600, 394], [666, 392],
  [666, 696], [0, 696],
];
const FRONT_CLIP = `polygon(${FRONT.map(
  ([x, y]) => `${((x / IMG.w) * 100).toFixed(2)}% ${((y / IMG.h) * 100).toFixed(2)}%`
).join(',')})`;
const at = (x, y) => ({ left: `${(x / IMG.w) * 100}%`, top: `${(y / IMG.h) * 100}%` });

// where products pile up inside the basket, in the order they are added.
// Tino stands in the left end of the basket (x up to ~280), so the treats fill the middle and right:
// a front row first, then a row behind it. Up to 6 show; the rest are counted as "+N more".
const SLOTS = [
  { x: 400, y: 386, s: 1, r: -6 },
  { x: 530, y: 384, s: 0.95, r: 8 },
  { x: 465, y: 346, s: 0.9, r: -3 },
  { x: 372, y: 350, s: 0.85, r: 10 },
  { x: 566, y: 346, s: 0.82, r: -9 },
  { x: 470, y: 308, s: 0.8, r: 4 },
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

/* Small categories share a section: the menu sections AND the category buttons use these groups
   (display only - the data keeps its own category) */
const SECTION_OF = {
  Cookies: 'Sweets',
  Muffins: 'Sweets',
  Individuals: 'Sweets',
  'English Cake': 'Sweets',
  Tarts: 'Sweets',
  Choux: 'Sweets',
  Salad: 'Salads & Sandwiches',
  Sandwiches: 'Salads & Sandwiches',
  'V60 Coffee': 'Hot Drinks',
  Smoothies: 'Cold Drinks',
  Beverages: 'Cold Drinks',
  'New Drinks': 'Cold Drinks',
};
const sectionOf = p => SECTION_OF[p.category] || p.category;

/* ---------- image with a quiet fallback mark ---------- */
function Photo({ src, alt, className }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return (
      <div className={`bm-fallback ${className || ''}`} aria-hidden="true">
        ✦
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

  const stageRef = useRef(null);
  const basketRef = useRef(null);
  const mouthRef = useRef(null);
  const ghostRef = useRef(null);
  const dragRef = useRef(null);
  const overRef = useRef(false);
  const cartRef = useRef(cart);
  const menuRef = useRef(menu);
  const bubbleTimer = useRef(0);

  cartRef.current = cart;
  menuRef.current = menu;

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
        setMenu(list.map(fromApi).filter(p => !p.hidden));
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

  // the buttons are the menu's sections (Viennoiserie, Sweets, Hot Drinks...), in menu order
  const categories = useMemo(() => [...new Set(menu.map(sectionOf))], [menu]);

  const counts = useMemo(() => {
    const m = { All: menu.length };
    menu.forEach(p => {
      const sec = sectionOf(p);
      m[sec] = (m[sec] || 0) + 1;
    });
    return m;
  }, [menu]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.filter(
      p =>
        (category === 'All' || sectionOf(p) === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    );
  }, [menu, category, query]);

  // Menu laid out in sections (one section when a category button or search is active)
  const sections = useMemo(() => {
    if (query.trim()) return [{ title: `results for “${query.trim()}”`, items: filtered }];
    const groups = new Map();
    filtered.forEach(p => {
      const title = sectionOf(p);
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(p);
    });
    return [...groups].map(([title, items]) => ({ title, items }));
  }, [filtered, query]);

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
    spawn('bm-float', x, y - 34, `+1 ${product.name}`);
    pulse(basketRef, 'squash');
    if (navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch (err) {
        /* not supported */
      }
    }
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

  // 3D Tino (when he is on screen) can run over, grab the treat and carry it to the basket himself.
  // He calls `drop()` when it lands (or straight away if anything interrupts him).
  const askTino = (product, el) => {
    let accepted = false;
    let dropped = false;
    const drop = () => {
      if (dropped) return;
      dropped = true;
      commit(product, mouthPoint());
    };
    window.dispatchEvent(
      new CustomEvent('tino:deliver', {
        detail: { product, el, mouth: mouthRef.current, accept: () => { accepted = true; }, drop },
      })
    );
    return accepted;
  };

  // tap "+" / Enter on a card: fly the product from the card photo into the basket
  const quickAdd = (product, el) => {
    if (!product.available) return;
    if (askTino(product, el)) return;
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
    if (!p) return;
    const btn = e.currentTarget;
    if (askTino(p, btn)) return;
    const r = btn.getBoundingClientRect();
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

  const renderCard = (p, i) => (
    <article
      key={p.id}
      className={`bk-card bm-card ${dragId === p.id ? 'is-dragging' : ''} ${p.available ? '' : 'is-soldout'}`}
      style={{ '--i': Math.min(i, 8) }}
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
        <Photo src={p.image} alt={p.name} />
        {!p.available ? <span className="bm-ribbon bm-soldout">Sold out</span> : p.featured && <span className="bm-ribbon">signature</span>}
      </div>
      <div className="bk-info">
        <h3>{p.name.toLowerCase()}</h3>
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
  );

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
            <header className="bm-head">
              <p className="bm-eyebrow">Your basket</p>
              <span className="bm-count">{count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'Empty'}</span>
            </header>

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
                          zIndex: slot.y, // lower in the basket = nearer = on top
                        }}
                      >
                        <div className="bm-med-in" key={`${id}:${it.quantity}`} style={{ '--r': `${slot.r}deg` }}>
                          <Photo src={it.image} alt={it.name} />
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

              </div>


              {hidden > 0 && <span className="bm-more">+{hidden} more</span>}
            </div>

            {/* the total, set like the last line of a receipt; opens the full list */}
            {cart.length ? (
              <button
                type="button"
                className="bm-summary"
                onClick={() => setPanel(true)}
                aria-label={`Review basket: ${count} items, ${fmt(total)} EGP`}
              >
                <span className="bm-sum-label">Subtotal</span>
                <span className="bm-sum-total">
                  <Ticker value={total} /> <small>EGP</small>
                </span>
              </button>
            ) : (
              <p className="bm-hint">Drag a treat into the basket, or tap +</p>
            )}

            {bubble && (
              <div className="bm-bubble" role="status">
                <Photo src={bubble.image} alt="" className="bm-bubble-img" />
                <div>
                  <small>Pairs well with</small>
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

            <div className="bm-actions">
              <button type="button" onClick={() => setPanel(true)}>
                Review
              </button>
              <Link className={cart.length ? '' : 'disabled'} to="/cart" aria-disabled={!cart.length}>
                Checkout →
              </Link>
            </div>


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
                Surprise me
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
              <div className="bm-sections" key={`${category}|${query}`}>
                {sections.map(sec => (
                  <section key={sec.title} className="bm-sec" aria-label={sec.title}>
                    <h3 className="bm-sec-title">{sec.title.toLowerCase()}</h3>
                    <div className="bk-grid bm-grid">{sec.items.map(renderCard)}</div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- what you're carrying while you drag ---------- */}
      <div ref={ghostRef} className="bm-ghost" aria-hidden="true">
        {ghostProduct && (
          <Photo src={ghostProduct.image} alt="" />
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
            <span>✦</span>
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
                    <Photo src={it.image} alt="" />
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
                  <b className="bm-line-total">{fmt(it.price * it.quantity)} EGP</b>
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
