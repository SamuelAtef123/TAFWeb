import { useCallback, useEffect, useRef, useState } from 'react';
import './Reviews.css';

/*
  "What friends are saying": the Instagram reels people posted about Tino & Friends,
  shown with Instagram's own embed (it credits each creator and links back to the reel).

  To add or remove a review, edit REELS below (the code is the part after /reel/ in the link).
  Instagram's script is only loaded once the section is about to scroll into view.
*/
const REELS = ['DJ1RbjSI8wx', 'DCmMVCwMfBL', 'C9FrEQoNkIx', 'DP4SaLjDdwI', 'DXRLEtOiAVJ'];

const EMBED_JS = 'https://www.instagram.com/embed.js';

// Instagram's embed markup; their script swaps it for the reel. The link inside is what shows if it can't.
const embedHtml = code => {
  const url = `https://www.instagram.com/reel/${code}/?utm_source=ig_embed&utm_campaign=loading`;
  return (
    `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14">` +
    `<a class="rv-fallback" href="${url}" target="_blank" rel="noopener noreferrer">` +
    '<span class="rv-fallback-mark">Instagram</span>' +
    '<span class="rv-fallback-text">Watch this review on Instagram</span>' +
    '<span class="rv-fallback-go">View reel →</span>' +
    '</a></blockquote>'
  );
};

function loadEmbeds() {
  if (window.instgrm && window.instgrm.Embeds) {
    window.instgrm.Embeds.process();
    return;
  }
  if (document.querySelector(`script[src="${EMBED_JS}"]`)) return;
  const s = document.createElement('script');
  s.src = EMBED_JS;
  s.async = true;
  document.body.appendChild(s);
}

export default function Reviews() {
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const [ends, setEnds] = useState({ start: true, end: false });

  // load Instagram's script when the section is near
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        loadEmbeds();
        io.disconnect();
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // grey out an arrow at either end of the row
  const update = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    setEnds({ start: t.scrollLeft < 8, end: t.scrollLeft + t.clientWidth > t.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    const t = trackRef.current;
    if (!t) return undefined;
    update();
    t.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // the embeds change size as they load
    const ro = new ResizeObserver(update);
    ro.observe(t);
    return () => {
      t.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [update]);

  const step = dir => {
    const t = trackRef.current;
    if (!t) return;
    const card = t.querySelector('.rv-card');
    const w = card ? card.getBoundingClientRect().width + 24 : 360;
    t.scrollBy({ left: dir * w, behavior: 'smooth' });
  };

  return (
    <section className="rv" id="reviews" ref={rootRef} aria-labelledby="rv-title">
      <div className="rv-head" data-reveal>
        <div>
          <p className="rv-kicker">Reviews</p>
          <h2 id="rv-title">What friends are saying.</h2>
        </div>
        <div className="rv-arrows">
          <button type="button" onClick={() => step(-1)} disabled={ends.start} aria-label="Previous reviews">
            ←
          </button>
          <button type="button" onClick={() => step(1)} disabled={ends.end} aria-label="More reviews">
            →
          </button>
        </div>
      </div>

      <div className="rv-track" ref={trackRef}>
        {REELS.map(code => (
          // the embed replaces its own markup, so React leaves the inside of this box alone
          <div className="rv-card" key={code} dangerouslySetInnerHTML={{ __html: embedHtml(code) }} />
        ))}
      </div>
    </section>
  );
}
