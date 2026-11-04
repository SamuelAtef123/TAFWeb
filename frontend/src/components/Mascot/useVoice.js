import { useCallback, useEffect, useRef, useState } from 'react';
import { spokenText, clipId } from './voiceClips';

export { spokenText };

/*
  Tino's voice: recorded clips (see voiceClips.js) for everything he normally says,
  and the browser's built-in speech (Web Speech API) for anything that has no recording.

  Browsers only let a page talk after the visitor has clicked/tapped something,
  so before that `speak` returns false and the bubble offers a "tap to hear" button.
*/

const VOICE_KEY = 'tino-voice'; // 'on' | 'off'
const PITCH = 1.05; // 0..2 - higher sounds younger
const RATE = 1.06;

const supported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

// prefer a male English voice (pitched up it sounds like a boy; pitched-up female voices sound like a girl)
const PREFERRED = [
  /\b(Guy|Andrew|Brian|Christopher|Eric|Roger|Steffan|Ryan|Thomas|Davis|Tony)\b.*(Online|Natural)/i,
  /Google UK English Male/i,
  /Microsoft (David|Mark|George|Ryan|James)/i,
  /\b(Aaron|Daniel|Alex|Arthur|Fred|Rishi|Oliver|Tom|Evan|Nathan|Reed|Ralph)\b/i,
  /\bmale\b/i,
];
const chooseVoice = () => {
  const all = window.speechSynthesis.getVoices();
  const en = all.filter(v => /^en([-_]|$)/i.test(v.lang));
  for (const re of PREFERRED) {
    const v = en.find(x => re.test(x.name));
    if (v) return v;
  }
  return en.find(v => /en[-_](US|GB)/i.test(v.lang)) || en[0] || null;
};

const readPref = () => {
  try {
    return localStorage.getItem(VOICE_KEY) !== 'off';
  } catch (e) {
    return true;
  }
};

// which recordings exist (public/voice/manifest.json), loaded once per page
let clipsPromise = null;
const loadClips = () => {
  if (!clipsPromise) {
    clipsPromise = fetch('/voice/manifest.json')
      .then(r => (r.ok ? r.json() : { clips: [] }))
      .then(m => new Set(m.clips || []))
      .catch(() => new Set());
  }
  return clipsPromise;
};

export default function useVoice() {
  const synthOK = supported();
  const ok = synthOK || typeof Audio !== 'undefined';
  const [on, setOnState] = useState(readPref);
  const [speaking, setSpeaking] = useState(false);
  const [spokenKey, setSpokenKey] = useState(null);
  const voiceRef = useRef(null);
  const timer = useRef(0);
  const clips = useRef(new Set());
  const audio = useRef(null);

  useEffect(() => {
    let alive = true;
    loadClips().then(set => {
      if (alive) clips.current = set;
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!synthOK) return undefined;
    const load = () => {
      voiceRef.current = chooseVoice();
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      clearTimeout(timer.current);
      window.speechSynthesis.cancel();
    };
  }, [synthOK]);

  const silence = useCallback(() => {
    clearTimeout(timer.current);
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onpause = null;
      audio.current.pause();
      audio.current = null;
    }
    if (synthOK) window.speechSynthesis.cancel();
  }, [synthOK]);

  useEffect(() => silence, [silence]);

  const stop = useCallback(() => {
    silence();
    setSpeaking(false);
  }, [silence]);

  // say a line; `force` is used right after a click on the speaker button
  const speak = useCallback(
    (text, key, { force = false } = {}) => {
      if (!ok) return false;
      if (!on && !force) return false;
      const ua = navigator.userActivation;
      if (!force && ua && !ua.hasBeenActive) return false; // browser would block it anyway
      const words = spokenText(text);
      if (!words) return false;
      silence();
      setSpokenKey(key);

      // 1) the recorded voice
      const id = clipId(words);
      if (clips.current.has(id)) {
        const a = new Audio(`/voice/${id}.mp3`);
        audio.current = a;
        a.onplaying = () => setSpeaking(true);
        a.onended = () => setSpeaking(false);
        a.onpause = () => setSpeaking(false);
        a.onerror = () => setSpeaking(false);
        a.play().catch(() => setSpeaking(false));
        return true;
      }

      // 2) no recording for this line: the browser's own voice
      if (!synthOK) return false;
      const u = new SpeechSynthesisUtterance(words);
      if (!voiceRef.current) voiceRef.current = chooseVoice();
      if (voiceRef.current) {
        u.voice = voiceRef.current;
        u.lang = voiceRef.current.lang;
      } else {
        u.lang = 'en-US';
      }
      u.pitch = PITCH;
      u.rate = RATE;
      u.volume = 0.95;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      // Chrome sometimes drops a speak() that comes right after cancel()
      timer.current = setTimeout(() => window.speechSynthesis.speak(u), 40);
      return true;
    },
    [ok, synthOK, on, silence]
  );

  const setOn = useCallback(
    value => {
      setOnState(value);
      try {
        localStorage.setItem(VOICE_KEY, value ? 'on' : 'off');
      } catch (e) {
        /* private mode */
      }
      if (!value) stop();
    },
    [stop]
  );

  return { supported: ok, on, setOn, speak, stop, speaking, spokenKey };
}
