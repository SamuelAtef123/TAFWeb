import { useEffect, useRef, useState } from 'react';
import { SpeakerIcon } from '../icons';
import './Reviews.css';

/*
  "What friends are saying": the Instagram reels people posted about Tino & Friends,
  played as vertical video cards that drift slowly sideways in a loop.

  The videos live in frontend/public/reviews/ as review-1.mp4 … review-5.mp4
  (with an optional still frame review-1.jpg … for before the video loads).
  To add or remove a review, edit REVIEWS below; `reel` is the code after /reel/ in the Instagram link.
*/
const REVIEWS = [
  { reel: 'DJ1RbjSI8wx', file: 'review-1', by: 'ouda.5' },
  { reel: 'DCmMVCwMfBL', file: 'review-2', by: 'abdelrahmaanshoukryy' },
  { reel: 'C9FrEQoNkIx', file: 'review-3', by: 'sherry_on_top' },
  { reel: 'DP4SaLjDdwI', file: 'review-4', by: 'go.with.row' },
  { reel: 'DXRLEtOiAVJ', file: 'review-5', by: 'nawplatters' },
];

const reelUrl = code => `https://www.instagram.com/reel/${code}/`;

function Card({ review, copy, live, soundOn, onSound }) {
  const ref = useRef(null);
  const [missing, setMissing] = useState(false);

  // play only while the section is on screen
  useEffect(() => {
    const v = ref.current;
    if (!v || missing) return;
    if (live) {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      v.pause();
    }
  }, [live, missing]);

  useEffect(() => {
    if (ref.current) ref.current.muted = !soundOn;
  }, [soundOn]);

  return (
    <figure className="rv-card" aria-hidden={copy || undefined}>
      <div className="rv-frame">
        {missing ? (
          // the video can't play here: show its still frame and send people to the reel
          <a
            className="rv-missing"
            href={reelUrl(review.reel)}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={copy ? -1 : 0}
            style={{ backgroundImage: `url(/reviews/${review.file}.jpg)` }}
          >
            <span>Watch on Instagram</span>
          </a>
        ) : (
          <>
            <video
              ref={ref}
              src={`/reviews/${review.file}.mp4`}
              poster={`/reviews/${review.file}.jpg`}
              muted
              loop
              playsInline
              preload="metadata"
              onError={() => setMissing(true)}
            />
            <button
              type="button"
              className={`rv-sound${soundOn ? ' on' : ''}`}
              onClick={onSound}
              tabIndex={copy ? -1 : 0}
              aria-label={soundOn ? 'Mute this review' : 'Play this review with sound'}
            >
              <SpeakerIcon muted={!soundOn} size={15} />
            </button>
          </>
        )}
      </div>
      <figcaption>
        <span className="rv-by">@{review.by}</span>
        <a href={reelUrl(review.reel)} target="_blank" rel="noopener noreferrer" tabIndex={copy ? -1 : 0}>
          View reel
        </a>
      </figcaption>
    </figure>
  );
}

export default function Reviews() {
  const rootRef = useRef(null);
  const [live, setLive] = useState(false);
  const [sound, setSound] = useState(null); // key of the one card playing with sound

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // leaving the section silences it
  useEffect(() => {
    if (!live) setSound(null);
  }, [live]);

  // the row is drawn twice so the loop has no seam; the second copy is hidden from screen readers
  const row = copy =>
    REVIEWS.map(r => {
      const key = `${copy ? 'b' : 'a'}-${r.reel}`;
      return (
        <Card
          key={key}
          review={r}
          copy={copy}
          live={live}
          soundOn={sound === key}
          onSound={() => setSound(s => (s === key ? null : key))}
        />
      );
    });

  return (
    <section className="rv" id="reviews" ref={rootRef} aria-labelledby="rv-title">
      <div className="rv-head" data-reveal>
        <p className="rv-kicker">Reviews</p>
        <h2 id="rv-title">What friends are saying.</h2>
      </div>

      <div className={`rv-marquee${sound ? ' held' : ''}`}>
        <div className="rv-belt">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </section>
  );
}
