import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LINES, CATEGORY_LINES, pick } from './lines';
import useVoice from './useVoice';
import './Mascot.css';

/*
  Tino, the bakery mascot (2.5D paper cut-out).

  - ~10 s after the home page opens he comes alive inside the hero logo
    (the logo swaps to its lettering-only version and he lifts off the page).
  - Scroll past the hero and he hops down to the corner; scroll back up and he hops back in.
  - He talks in a speech bubble with quick-reply buttons, and reacts to the page:
    category chips, "See today's bake", Surprise me, and anything added to the basket.
  - "Bye, Tino" sends him away for this visit; a small button brings him back.

  It only needs these hooks on the page: .bk-hero, .bk-hero-logo-wrap > img.bk-hero-logo,
  #menu, .bk-footer, .bm-surprise, .bk-marquee and the `cart:updated` / `tino:deliver` window events.

  When the browser can draw 3D, a real 3D Tino (three/Companion.js, loaded on demand) joins him:
  he hides behind the 2.5D Tino in the logo, peeks out, shows off some acrobatics, surfs down the
  marquee to the corner when you scroll, and carries orders to the basket himself.
  The 2.5D Tino then stays in the logo. Without WebGL everything works exactly as before.
*/

const APPEAR_AFTER = 10000; // first visit
const APPEAR_AGAIN = 1500; // coming back to the home page in the same visit
const AWAY_KEY = 'tino-away';
const MET_KEY = 'tino-met';
const ASSET = '/mascot';
// Tino's box inside the hero logo image, as fractions of the logo (left, top, width, height)
const IN_LOGO = [0.3619, 0.1985, 0.2768, 0.5078];

const store = {
  get: k => {
    try {
      return sessionStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set: (k, v) => {
    try {
      if (v == null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch (e) {
      /* private mode etc. - Tino still works for this page view */
    }
  },
};
const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isNarrow = () => window.innerWidth < 640;
const NO_3D_KEY = 'tino-2d'; // sessionStorage: set to '1' to keep only the 2.5D Tino
const IDLE_3D = ['wiggle', 'sniff', 'spin', 'hop', 'wave'];
const ignoreCancel = e => {
  if (e !== 'tino-cancelled') throw e;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const readCart = () => {
  try {
    const c = JSON.parse(localStorage.getItem('cart') || '[]');
    return Array.isArray(c) ? c : [];
  } catch (e) {
    return [];
  }
};
const snapshot = () => {
  const m = new Map();
  readCart().forEach(i => m.set(i.name, (m.get(i.name) || 0) + (i.quantity || 0)));
  return m;
};

/* ---------------- the cut-out figure ---------------- */
function Figure({ figRef, travelRef, act, talking, onPoke, label }) {
  return (
    <div className="tino-travel" ref={travelRef}>
      <button
        type="button"
        className={`tino-fig ${talking ? 'is-talking' : ''}`}
        ref={figRef}
        onClick={onPoke}
        aria-label={label}
        style={{ '--tino-mask': `url(${ASSET}/tino.webp)` }}
      >
        <span className="tino-ground" aria-hidden="true" />
        <span className="tino-persp" aria-hidden="true">
          <span className="tino-act" key={act.n} data-act={act.name}>
            <span className="tino-rig">
              <span className="tino-breath">
                <span className="tino-edge e3" />
                <span className="tino-edge e2" />
                <span className="tino-edge e1" />
                <img className="tino-body" src={`${ASSET}/tino-body.webp`} alt="" draggable={false} />
                <img className="tino-head" src={`${ASSET}/tino-head.webp`} alt="" draggable={false} />
              </span>
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

/* ---------------- typewriter text ---------------- */
function useTypewriter(text, speed = 24) {
  // progress is stored together with the text it belongs to, so a new line never
  // inherits the previous line's progress (that caused a one-frame flash of the full text)
  const [prog, setProg] = useState({ text, n: 0 });
  const chars = text ? [...text] : [];
  const n = prog.text === text ? prog.n : 0;
  useEffect(() => {
    if (!text) return undefined;
    const all = [...text];
    if (reducedMotion()) {
      setProg({ text, n: all.length });
      return undefined;
    }
    let i = 0;
    setProg({ text, n: 0 });
    const id = setInterval(() => {
      i += all[i] === ' ' ? 2 : 1;
      setProg({ text, n: Math.min(i, all.length) });
      if (i >= all.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return {
    shown: chars.slice(0, n).join(''),
    done: n >= chars.length,
    finish: () => setProg({ text, n: chars.length }),
  };
}

/* ---------------- the component ---------------- */
export default function Mascot() {
  const navigate = useNavigate();
  // waiting -> hero | dock ; away = sent away by the visitor
  const [mode, setMode] = useState(store.get(AWAY_KEY) ? 'away' : 'waiting');
  const [hero, setHero] = useState(null); // { wrap, img } of the hero logo
  const [frame, setFrame] = useState(null); // the logo image's box inside its wrapper
  const [say, setSay] = useState(null); // { text, replies, auto, key }
  const [act, setAct] = useState({ name: 'idle', n: 0 });

  const figRef = useRef(null);
  const travelRef = useRef(null);
  const bubbleRef = useRef(null);
  const travelFrom = useRef(null);
  const modeRef = useRef(mode);
  const sayRef = useRef(say);
  const heroVisible = useRef(true);
  const said = useRef(new Set());
  const cartSnap = useRef(snapshot());
  const busyUntil = useRef(0); // a real conversation is going on until this time
  const autoTimer = useRef(0);
  const quietSurprise = useRef(false);
  const compRef = useRef(null); // the 3D Tino, once loaded
  const [has3D, setHas3D] = useState(false);
  const has3DRef = useRef(false);
  const pokeRef = useRef(() => {});
  const playfulLeft = useRef(10); // playful remarks per page view
  modeRef.current = mode;
  has3DRef.current = has3D;
  sayRef.current = say;

  const typing = useTypewriter(say ? say.text : '');
  const voice = useVoice();
  const talking = !!say && (!typing.done || voice.speaking); // his head keeps nodding while he speaks

  /* ---------- load the 3D Tino (in the background, only if the browser can draw it) ---------- */
  useEffect(() => {
    if (store.get(NO_3D_KEY)) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      import('./three/Companion')
        .then(async ({ default: Companion, webglOK }) => {
          if (cancelled || !webglOK()) return;
          const c = await Companion.create({ onPoke: () => pokeRef.current(), reduced: reducedMotion() });
          if (cancelled) {
            c.destroy();
            return;
          }
          compRef.current = c;
          setHas3D(true);
        })
        .catch(() => {
          /* no 3D: the 2.5D Tino does everything on his own */
        });
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (compRef.current) compRef.current.destroy();
      compRef.current = null;
    };
  }, []);

  // 3D Tino's mouth-less "talking" bounce
  useEffect(() => {
    if (compRef.current) compRef.current.setTalking(talking);
  }, [talking, has3D]);

  // where the 2.5D Tino is (3D Tino hides behind him / stands next to him)
  const figRect = useCallback(() => (figRef.current ? figRef.current.getBoundingClientRect() : null), []);

  // the 3D Tino finished loading after the 2.5D one was already out: bring him in too
  useEffect(() => {
    const c = compRef.current;
    if (!has3D || !c || c.where !== 'hidden') return;
    const m = modeRef.current;
    if (m === 'hero') c.toHero(figRect).catch(ignoreCancel);
    else if (m === 'dock') c.dropIn().catch(ignoreCancel);
  }, [has3D, figRect]);

  // say each new line out loud (when the voice is on and the visitor has interacted with the page)
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const sayKey = say ? say.key : null;
  useEffect(() => {
    const v = voiceRef.current;
    if (sayKey == null) {
      v.stop();
      return;
    }
    if (sayRef.current) v.speak(sayRef.current.text, sayKey);
  }, [sayKey]);

  // the speaker button in the bubble: unmute / play a line that was blocked / mute
  const onVoiceButton = () => {
    if (!say) return;
    if (!voice.on) {
      voice.setOn(true);
      voice.speak(say.text, say.key, { force: true });
    } else if (voice.spokenKey !== say.key) {
      voice.speak(say.text, say.key, { force: true });
    } else {
      voice.setOn(false);
    }
  };
  const voiceState = !voice.on ? 'off' : say && voice.spokenKey !== say.key ? 'tap' : 'on';

  /* ---------- small helpers ---------- */
  const hush = useCallback(() => {
    clearTimeout(autoTimer.current);
    busyUntil.current = 0;
    setSay(null);
  }, []);

  const doAct = useCallback(name => {
    if (reducedMotion() && name !== 'idle') return;
    const c = compRef.current;
    if (has3DRef.current && c) {
      // the 3D Tino does the moving; the 2.5D one in the logo only wakes up / looks around
      if (name === 'hop') c.trick('hop').catch(ignoreCancel);
      else if (name === 'wave') c.trick('wave').catch(ignoreCancel);
      else if (name === 'look') c.trick(pick(IDLE_3D)).catch(ignoreCancel);
      if (name !== 'alive' && name !== 'look') return;
    }
    setAct(a => ({ name, n: a.n + 1 }));
  }, []);

  const speak = useCallback(
    (line, { auto = 0, conversation = false } = {}) => {
      clearTimeout(autoTimer.current);
      setSay({ text: line.text, replies: line.replies || [], key: Date.now(), auto: !!auto });
      if (conversation) busyUntil.current = Date.now() + 15000;
      if (auto) {
        autoTimer.current = setTimeout(() => {
          setSay(s => (s && s.text === line.text ? null : s));
        }, auto);
      }
    },
    []
  );

  // short remarks about what the visitor just did; never interrupt a real conversation
  const remark = useCallback(
    (text, replies = [], ms = 5200) => {
      if (modeRef.current !== 'hero' && modeRef.current !== 'dock') return;
      if (Date.now() < busyUntil.current && sayRef.current && sayRef.current.replies.length) return;
      speak({ text, replies }, { auto: ms });
      doAct('hop');
    },
    [speak, doAct]
  );

  const goTo = useCallback(next => {
    const c = compRef.current;
    if (has3DRef.current && c) {
      // the 2.5D Tino stays in the logo; the 3D one travels
      setMode(next);
      if (next === 'dock') c.viaMarquee().catch(ignoreCancel);
      if (next === 'hero') c.toHero(figRect).catch(ignoreCancel);
      return;
    }
    if (figRef.current) travelFrom.current = figRef.current.getBoundingClientRect();
    setMode(next);
  }, [figRect]);

  /* ---------- find the hero logo ---------- */
  useEffect(() => {
    const img = document.querySelector('.bk-hero-logo-wrap > img.bk-hero-logo');
    if (img) setHero({ wrap: img.parentElement, img });
  }, []);

  // keep an invisible frame exactly on top of the logo image (same box, same transform)
  useLayoutEffect(() => {
    if (!hero) return undefined;
    const measure = () => {
      const { img } = hero;
      const cs = getComputedStyle(img);
      setFrame({
        left: img.offsetLeft,
        top: img.offsetTop,
        width: img.offsetWidth,
        height: img.offsetHeight,
        transform: cs.transform === 'none' ? '' : cs.transform,
        origin: cs.transformOrigin,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hero.img);
    ro.observe(hero.wrap);
    hero.img.addEventListener('load', measure);
    return () => {
      ro.disconnect();
      hero.img.removeEventListener('load', measure);
    };
  }, [hero]);

  // swap the logo to its lettering-only version while Tino is out of it
  useEffect(() => {
    if (!hero) return undefined;
    const out = mode === 'hero' || mode === 'dock';
    hero.wrap.classList.toggle('tino-out', out);
    return () => hero.wrap.classList.remove('tino-out');
  }, [hero, mode]);

  /* ---------- appear after 10 s ---------- */
  useEffect(() => {
    if (mode !== 'waiting') return undefined;
    const met = store.get(MET_KEY);
    const t = setTimeout(() => {
      store.set(MET_KEY, '1');
      const inHero = heroVisible.current && !!document.querySelector('.bk-hero-logo-wrap');
      const c = compRef.current;
      if (c && has3DRef.current) {
        if (inHero) {
          setMode('hero');
          doAct('alive');
          // the 3D Tino peeks out from behind the 2.5D one, says hi, shows off, then welcomes you
          const cue = name => {
            if (name === 'peek') speak(pick(LINES.peek), { auto: 2400 });
            if (name === 'hello') speak(LINES.hello3d, { auto: 2200 });
            if (name === 'watch') {
              speak(LINES.watch, { auto: 1600 });
              return new Promise(r => setTimeout(r, 450));
            }
            if (name === 'welcome') speak(met ? LINES.welcomeBack : LINES.welcome);
            return null;
          };
          setTimeout(() => c.intro(figRect, cue).catch(ignoreCancel), reducedMotion() ? 100 : 1100);
        } else {
          setMode('dock');
          c.dropIn().catch(ignoreCancel);
          setTimeout(() => speak(met ? LINES.welcomeBack : LINES.helloDock), reducedMotion() ? 0 : 900);
        }
        return;
      }
      if (inHero) {
        setMode('hero');
        doAct('alive');
        setTimeout(() => speak(met ? LINES.welcomeBack : LINES.hello), reducedMotion() ? 0 : 900);
      } else {
        travelFrom.current = 'below';
        setMode('dock');
        setTimeout(() => speak(met ? LINES.welcomeBack : LINES.helloDock), reducedMotion() ? 0 : 900);
      }
    }, met ? APPEAR_AGAIN : APPEAR_AFTER);
    return () => clearTimeout(t);
  }, [mode, speak, doAct, figRect]);

  /* ---------- hop between the logo and the corner while scrolling ---------- */
  useEffect(() => {
    const el = document.querySelector('.bk-hero');
    if (!el) {
      heroVisible.current = false;
      return undefined;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        const r = e.intersectionRatio;
        if (r < 0.35) heroVisible.current = false;
        if (r >= 0.55) heroVisible.current = true;
        const m = modeRef.current;
        if (has3DRef.current) return; // the 3D Tino uses the scroll check above
        if (m === 'hero' && r < 0.35) {
          setSay(null);
          goTo('dock');
        } else if (m === 'dock' && r >= 0.55 && document.querySelector('.bk-hero-logo-wrap')) {
          setSay(null);
          goTo('hero');
        }
      },
      { threshold: [0, 0.2, 0.35, 0.45, 0.55, 0.7, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [goTo]);

  // 3D Tino follows the logo Tino itself: as soon as it scrolls out of view he heads for the corner
  // (on phones the hero is tall, so the hero box alone can stay "visible" long after the logo is gone)
  useEffect(() => {
    if (!has3D) return undefined;
    let raf = 0;
    const check = () => {
      raf = 0;
      const r = figRect();
      const m = modeRef.current;
      if (!r || !r.height) return;
      const vh = window.innerHeight;
      const gone = r.bottom < 70 + r.height * 0.25 || r.top > vh;
      const back = r.top > 70 - r.height * 0.35 && r.bottom < vh + r.height * 0.1; // most of the logo Tino is in view
      if (m === 'hero' && gone) {
        setSay(null);
        goTo('dock');
      } else if (m === 'dock' && back) {
        setSay(null);
        goTo('hero');
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [has3D, figRect, goTo]);

  // a line the first time each section shows up while he is in the corner
  useEffect(() => {
    if (mode !== 'dock') return undefined;
    const targets = [
      ['menu', document.querySelector('#menu .bm-main') || document.getElementById('menu')],
      ['footer', document.querySelector('.bk-footer')],
    ].filter(([, el]) => el);
    const io = new IntersectionObserver(
      entries =>
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          const id = e.target.dataset.tinoSection;
          if (said.current.has(id)) return;
          setTimeout(() => {
            if (modeRef.current !== 'dock' || said.current.has(id)) return;
            if (Date.now() < busyUntil.current) return; // busy: try again next time it scrolls into view
            if (sayRef.current && sayRef.current.auto === false) return;
            said.current.add(id);
            if (id === 'menu') speak(isNarrow() ? LINES.menuMobile : LINES.menu, { auto: 9000 });
            if (id === 'footer') speak(LINES.footer, { auto: 9000 });
            doAct('hop');
          }, 700);
        }),
      { threshold: 0.25 }
    );
    targets.forEach(([id, el]) => {
      el.dataset.tinoSection = id;
      io.observe(el);
    });
    return () => io.disconnect();
  }, [mode, speak, doAct]);

  /* ---------- travel animation (logo <-> corner) ---------- */
  useLayoutEffect(() => {
    const from = travelFrom.current;
    travelFrom.current = null;
    const el = travelRef.current;
    if (!from || !el) return;
    const to = el.getBoundingClientRect();
    if (!to.width) return;
    if (reducedMotion()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      return;
    }
    const K = to.width / el.offsetWidth || 1; // the logo frame is scaled; work in local px
    if (from === 'below') {
      el.animate(
        [
          { transform: `translateY(${(window.innerHeight - to.top + 20) / K}px)` },
          { transform: `translateY(${-24 / K}px)`, offset: 0.7 },
          { transform: 'none' },
        ],
        { duration: 800, easing: 'cubic-bezier(.3,.9,.4,1)' }
      );
      return;
    }
    const dx = (from.left - to.left) / K;
    const dy = (from.top - to.top) / K;
    const s = from.width / to.width;
    const lift = (Math.min(180, Math.abs(dy) * 0.18 + 70)) / K;
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
        {
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(s + 1) / 2}) rotate(${dx > 0 ? -10 : 10}deg)`,
          offset: 0.5,
        },
        { transform: 'translate(0, 0) scale(1.04, 0.94)', offset: 0.9 },
        { transform: 'none' },
      ],
      { duration: 950, easing: 'cubic-bezier(.45,.05,.3,1)' }
    );
  }, [mode]);

  /* ---------- he looks toward the cursor (2.5D tilt) ---------- */
  useEffect(() => {
    if (reducedMotion()) return undefined;
    let raf = 0;
    let last = null;
    const apply = () => {
      raf = 0;
      const el = figRef.current;
      if (!el || !last) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.3;
      const ry = clamp(((last.x - cx) / window.innerWidth) * 46, -20, 20);
      const rx = clamp(((cy - last.y) / window.innerHeight) * 14, -7, 7);
      el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
      el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    };
    const onMove = e => {
      last = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [mode]);

  /* ---------- little idle moves ---------- */
  useEffect(() => {
    if (mode !== 'hero' && mode !== 'dock') return undefined;
    if (reducedMotion()) return undefined;
    let t;
    const loop = () => {
      t = setTimeout(() => {
        const c = compRef.current;
        const free = !sayRef.current && Date.now() > busyUntil.current;
        if (has3D && c && free && !c.busy && (c.where === 'hero' || c.where === 'dock')) {
          // the 3D Tino keeps the place lively: a joke and a trick
          if (playfulLeft.current > 0 && Math.random() < 0.75) {
            playfulLeft.current -= 1;
            const line = pick(LINES.playful);
            speak({ text: line.text, replies: [] }, { auto: 4200 });
            c.trick(line.move).catch(ignoreCancel);
          } else {
            c.trick(pick(IDLE_3D)).catch(ignoreCancel);
          }
        } else if (free) doAct(pick(['look', 'look', 'hop', 'wave']));
        loop();
      }, has3D ? 11000 + Math.random() * 8000 : 7000 + Math.random() * 7000);
    };
    loop();
    return () => clearTimeout(t);
  }, [mode, doAct, has3D, speak]);

  // if the basket is still empty after a while in the menu, offer to help (once)
  useEffect(() => {
    if (mode !== 'dock') return undefined;
    const t = setTimeout(() => {
      if (said.current.has('nudge') || readCart().length) return;
      if (Date.now() < busyUntil.current || sayRef.current) return;
      said.current.add('nudge');
      speak(LINES.nudge, { auto: 9000 });
      doAct('wave');
    }, 45000);
    return () => clearTimeout(t);
  }, [mode, speak, doAct]);

  /* ---------- react to the page ---------- */
  useEffect(() => {
    const onCart = () => {
      const before = cartSnap.current;
      const now = snapshot();
      cartSnap.current = now;
      let added = null;
      let removed = false;
      now.forEach((q, name) => {
        if (q > (before.get(name) || 0)) added = name;
      });
      before.forEach((q, name) => {
        if ((now.get(name) || 0) < q) removed = true;
      });
      const total = [...now.values()].reduce((s, q) => s + q, 0);
      // on narrow screens the basket's own "Goes great with" tip is already showing: just hop, don't talk over it
      if (added && window.innerWidth < 900 && document.querySelector('.bm-bubble')) {
        doAct('hop');
        return;
      }
      if (added) {
        const prevTotal = [...before.values()].reduce((s, q) => s + q, 0);
        const text = total >= 5 && prevTotal < 5 ? LINES.feast(total) : LINES.added(added);
        remark(text, [{ id: 'checkout', label: 'Checkout →' }]);
      } else if (removed && total === 0) {
        remark(LINES.emptied.text, LINES.emptied.replies);
      } else if (removed) {
        remark(pick(LINES.removed));
      }
    };
    const onClick = e => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('.bk-cta')) {
        remark(LINES.cta, [], 3500);
        return;
      }
      if (t.closest('.bm-surprise')) {
        if (quietSurprise.current) {
          quietSurprise.current = false;
          return;
        }
        remark(LINES.surpriseClick, [], 3500);
        return;
      }
      const chip = t.closest('.bk-cats button');
      if (chip) {
        const txt = chip.textContent || '';
        const cat = Object.keys(CATEGORY_LINES)
          .sort((a, b) => b.length - a.length)
          .find(k => txt.includes(k));
        if (cat) remark(CATEGORY_LINES[cat], [], 4200);
      }
    };
    // the menu asks: "can Tino carry this one?" (see BasketMenu askTino)
    const onDeliver = e => {
      const c = compRef.current;
      const { product, el, mouth, accept, drop } = e.detail || {};
      if (!c || !has3DRef.current || c.busy || reducedMotion()) return;
      if (modeRef.current !== 'dock' && modeRef.current !== 'hero') return;
      if (!el || !mouth) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      accept();
      busyUntil.current = 0;
      speak({ text: LINES.carrying(product.name), replies: [] }, { auto: 4000 });
      c.deliver(el, product.image, mouth, { onDrop: drop }).catch(ignoreCancel);
    };
    window.addEventListener('cart:updated', onCart);
    window.addEventListener('tino:deliver', onDeliver);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('cart:updated', onCart);
      window.removeEventListener('tino:deliver', onDeliver);
      document.removeEventListener('click', onClick);
    };
  }, [remark, doAct, speak]);

  /* ---------- the quick-reply buttons ---------- */
  const scrollToMenu = () => {
    const m = document.getElementById('menu');
    if (m) m.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  const onReply = id => {
    busyUntil.current = Date.now() + 15000;
    switch (id) {
      case 'menu':
        speak(isNarrow() ? LINES.menuMobile : LINES.menu, { conversation: true });
        said.current.add('menu');
        setTimeout(scrollToMenu, 350);
        break;
      case 'surprise': {
        speak(LINES.surprise, { conversation: true });
        const btn = document.querySelector('.bm-surprise');
        if (!btn) break;
        const r = btn.getBoundingClientRect();
        const visible = r.top > 60 && r.bottom < window.innerHeight;
        if (!visible) scrollToMenu();
        setTimeout(() => {
          quietSurprise.current = true;
          btn.click();
        }, visible ? 250 : 900);
        break;
      }
      case 'how':
        speak(LINES.how, { conversation: true });
        break;
      case 'who':
        speak(LINES.who, { conversation: true });
        doAct('wave');
        break;
      case 'checkout':
        if (readCart().length) navigate('/cart');
        else speak(LINES.checkoutEmpty, { conversation: true });
        break;
      case 'top':
        window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
        setSay(null);
        break;
      case 'ok':
        speak(LINES.ok, { auto: 2500 });
        busyUntil.current = 0;
        break;
      case 'bye':
        speak(LINES.bye, { auto: 1600 });
        doAct('wave');
        setTimeout(() => {
          setSay(null);
          store.set(AWAY_KEY, '1');
          setMode('away');
          if (compRef.current) {
            compRef.current.newRun();
            compRef.current.show(false);
          }
        }, reducedMotion() ? 0 : 1500);
        break;
      default:
        break;
    }
  };

  const poke = () => {
    if (say && !say.auto) {
      if (!typing.done) typing.finish();
      else hush(); // second click closes the conversation
      return;
    }
    const line = pick(LINES.poke);
    speak({ ...line, replies: [...line.replies, { id: 'bye', label: 'Bye, Tino 👋' }] }, { conversation: true });
    doAct('hop');
  };

  pokeRef.current = poke;

  const comeBack = () => {
    store.set(AWAY_KEY, null);
    const inHero = heroVisible.current && !!document.querySelector('.bk-hero-logo-wrap');
    const c = compRef.current;
    if (c && has3DRef.current) {
      setMode(inHero ? 'hero' : 'dock');
      doAct('alive');
      (inHero ? c.toHero(figRect) : c.dropIn()).catch(ignoreCancel);
      setTimeout(() => speak(LINES.back, { conversation: true }), reducedMotion() ? 0 : 1000);
      return;
    }
    if (!inHero) travelFrom.current = 'below';
    setMode(inHero ? 'hero' : 'dock');
    doAct(inHero ? 'alive' : 'hop');
    setTimeout(() => speak(LINES.back, { conversation: true }), reducedMotion() ? 0 : 800);
  };

  // Escape closes the bubble
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') hush();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hush]);

  /* ---------- keep the speech bubble next to Tino ---------- */
  useEffect(() => {
    if (!say) return undefined;
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      const b = bubbleRef.current;
      const f = figRef.current;
      const c = compRef.current;
      // speak from the 3D Tino when he is out, otherwise from the 2.5D one
      const r = (has3DRef.current && c && c.rect()) || (f && f.getBoundingClientRect());
      if (!b || !r) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const bw = b.offsetWidth;
      const bh = b.offsetHeight;
      const m = 12;
      const topMin = 76; // under the fixed header
      let x;
      let y;
      let side;
      if (vw < 640) {
        const inDock = modeRef.current === 'dock';
        side = inDock ? 'up' : 'down';
        x = m;
        y = inDock ? r.top - bh - 6 : r.bottom - r.height * 0.1;
        y = clamp(y, topMin, vh - bh - m);
      } else {
        const headY = r.top + r.height * 0.14;
        const right = vw - r.right;
        const left = r.left;
        if (right + r.width * 0.14 >= bw + 18 || right >= left) {
          side = 'right';
          x = Math.min(r.right - r.width * 0.14 + 6, vw - bw - m);
        } else {
          side = 'left';
          x = Math.max(r.left + r.width * 0.14 - bw - 6, m);
        }
        y = clamp(headY - bh * 0.3, topMin, vh - bh - m);
      }
      b.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      if (b.dataset.side !== side) b.dataset.side = side;
      b.style.visibility = r.bottom < 0 || r.top > vh ? 'hidden' : 'visible';
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [say, mode]);

  /* ---------- render ---------- */
  const out = mode === 'hero' || mode === 'dock';
  const figure = (
    <Figure
      figRef={figRef}
      travelRef={travelRef}
      act={act}
      talking={talking && !has3D}
      onPoke={poke}
      label="Tino, the bakery mascot. Click to talk."
    />
  );

  return (
    <>
      {/* lettering-only logo, sitting exactly where the real logo image is */}
      {hero &&
        frame &&
        createPortal(
          <img
            className="bk-hero-logo tino-lettering"
            src={`${ASSET}/logo-lettering.webp`}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
          />,
          hero.wrap
        )}

      {/* Tino inside the hero logo */}
      {(mode === 'hero' || (has3D && mode === 'dock')) &&
        hero &&
        frame &&
        createPortal(
          <div
            className="tino-logo-frame"
            style={{
              left: frame.left,
              top: frame.top,
              width: frame.width,
              height: frame.height,
              transform: frame.transform,
              transformOrigin: frame.origin,
            }}
          >
            <div
              className="tino-slot tino-in-logo"
              style={{
                left: `${IN_LOGO[0] * 100}%`,
                top: `${IN_LOGO[1] * 100}%`,
                width: `${IN_LOGO[2] * 100}%`,
                height: `${IN_LOGO[3] * 100}%`,
              }}
            >
              {figure}
            </div>
          </div>,
          hero.wrap
        )}

      {/* Tino in the corner */}
      {mode === 'dock' && !has3D && createPortal(<div className="tino-slot tino-dock">{figure}</div>, document.body)}

      {/* speech bubble */}
      {out &&
        say &&
        createPortal(
          <div
            className="tino-bubble"
            ref={bubbleRef}
            key={say.key}
            role="dialog"
            aria-label="Tino says"
            onMouseEnter={() => clearTimeout(autoTimer.current)}
          >
            <div className="tino-bubble-in">
              <span className="tino-name">Tino</span>
              <p className="tino-sr" aria-live="polite">
                {say.text}
              </p>
              <p className="tino-text" aria-hidden="true" onClick={typing.finish}>
                {typing.shown}
                {!typing.done && <span className="tino-caret" />}
              </p>
              {say.replies.length > 0 && (
                <div className={`tino-replies ${typing.done ? 'show' : ''}`}>
                  {say.replies.map(r => (
                    <button type="button" key={r.id} onClick={() => onReply(r.id)} tabIndex={typing.done ? 0 : -1}>
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
              {voice.supported && (
                <button
                  type="button"
                  className={`tino-voice is-${voiceState}`}
                  onClick={onVoiceButton}
                  aria-label={
                    voiceState === 'off' ? "Turn Tino's voice on" : voiceState === 'tap' ? 'Hear Tino say this' : "Mute Tino's voice"
                  }
                  title={voiceState === 'off' ? 'Voice off' : voiceState === 'tap' ? 'Tap to hear Tino' : 'Mute'}
                >
                  {voiceState === 'off' ? '🔇' : '🔊'}
                </button>
              )}
              <button type="button" className="tino-x" onClick={hush} aria-label="Close">
                ×
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* call him back */}
      {mode === 'away' &&
        createPortal(
          <button type="button" className="tino-recall" onClick={comeBack} aria-label="Bring Tino back">
            <img src={`${ASSET}/tino-head.webp`} alt="" />
            <span>Tino</span>
          </button>,
          document.body
        )}
    </>
  );
}
