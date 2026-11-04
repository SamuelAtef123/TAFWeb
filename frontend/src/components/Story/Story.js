import { useEffect, useRef } from 'react';
import '@fontsource/dm-serif-display/400.css';
import './Story.css';

/*
  "Why Tino & Friends" - three panels after the marquee.
  Each panel has a giant word in DM Serif Display sitting BEHIND a cut-out photo.
  As you scroll, the word slides sideways (alternating direction) and the photo
  floats up a little, so the bake seems to hover in front of the type.
*/
const PANELS = [
  {
    id: 'quality',
    num: '01',
    label: 'Quality',
    word: 'the bake',
    img: '/images/story/bake.webp',
    alt: 'A rustic sourdough loaf with thick slices cut from it',
    lead: 'Baked fresh every morning, from scratch.',
    text: 'Real butter, slow-fermented dough and flour we trust. Nothing frozen, nothing reheated, nothing rushed — just bread and pastry the way they are meant to be.',
    dir: -1,
  },
  {
    id: 'mission',
    num: '02',
    label: 'Mission',
    word: 'the craft',
    img: '/images/story/craft.webp',
    alt: 'Iced coffee splashing out of a glass',
    lead: 'Made by hand, by friends.',
    text: 'From espresso pulled to order and poured over ice, to croissants folded by hand at dawn — small batches, made by people who love doing it, for people we like to see again.',
    dir: 1,
    between: true, // the tall glass stands in the gap between "the" and "craft"
  },
  {
    id: 'exclusivity',
    num: '03',
    label: 'Exclusivity',
    word: 'the signature',
    img: '/images/story/signature.webp',
    alt: 'A golden croissant, one half cut open to show its flaky layers',
    lead: 'Only at Tino & Friends.',
    text: 'Recipes we created ourselves and bake in limited numbers each day. You won’t find them anywhere else — and when they’re gone, they’re gone until tomorrow.',
    dir: -1,
  },
];

export default function Story() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;

    const panels = [...root.querySelectorAll('.st-panel')];
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      panels.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        // -1 when the panel enters at the bottom, 0 when centred, 1 when it leaves at the top
        const p = Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / ((vh + r.height) / 2)));
        el.style.setProperty('--p', p.toFixed(4));
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="st" ref={rootRef} aria-label="Why Tino & Friends">
      {PANELS.map(p => (
        <article key={p.id} className={`st-panel st-${p.id}`} style={{ '--dir': p.dir }} data-reveal>
          <p className="st-label">
            <span>{p.num}</span> {p.label}
          </p>
          <h2 className="st-word" aria-label={`${p.label}: ${p.word}`}>
            {p.between ? (
              <span className="st-split" aria-hidden="true">
                <span className="st-ink">{p.word.split(' ')[0]}</span>
                <span className="st-gap">
                  <img className="st-gap-img" src={p.img} alt="" loading="lazy" decoding="async" draggable={false} />
                </span>
                <span className="st-ink st-ink-fade">{p.word.split(' ').slice(1).join(' ')}</span>
              </span>
            ) : (
              <span className="st-ink st-ink-fade" aria-hidden="true">{p.word}</span>
            )}
          </h2>
          {!p.between && (
            <div className="st-photo">
              <img src={p.img} alt={p.alt} loading="lazy" decoding="async" draggable={false} />
            </div>
          )}
          {p.between && <span className="st-sr">{p.alt}</span>}
          <div className="st-copy">
            <p className="st-lead">{p.lead}</p>
            <p>{p.text}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
