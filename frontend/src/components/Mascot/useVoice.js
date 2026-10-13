import { useCallback, useEffect, useRef, useState } from 'react';

/*
  Tino's voice, using the browser's built-in speech (Web Speech API).
  Free, no audio files, and it can say anything - including product names.
  The device's English voice is pitched up so it sounds like a young boy.

  Browsers only let a page talk after the visitor has clicked/tapped something,
  so before that `speak` returns false and the bubble offers a "tap to hear" button.
*/

const VOICE_KEY = 'tino-voice'; // 'on' | 'off'
const PITCH = 1.75; // 0..2 - higher sounds younger
const RATE = 1.06;

const supported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

// what to say out loud: no emoji, no arrows, "&" read as "and", numbered steps without "1)"
export const spokenText = text =>
  String(text || '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/&/g, ' and ')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\+/g, ' plus ')
    .replace(/…/g, '...')
    .replace(/[→↑←↓]/g, '')
    .replace(/(^|\s)\d\)\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([),.!?])/g, '$1')
    .trim();

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

export default function useVoice() {
  const ok = supported();
  const [on, setOnState] = useState(readPref);
  const [speaking, setSpeaking] = useState(false);
  const [spokenKey, setSpokenKey] = useState(null);
  const voiceRef = useRef(null);
  const timer = useRef(0);

  useEffect(() => {
    if (!ok) return undefined;
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
  }, [ok]);

  const stop = useCallback(() => {
    if (!ok) return;
    clearTimeout(timer.current);
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [ok]);

  // say a line; `force` is used right after a click on the speaker button
  const speak = useCallback(
    (text, key, { force = false } = {}) => {
      if (!ok) return false;
      if (!on && !force) return false;
      const ua = navigator.userActivation;
      if (!force && ua && !ua.hasBeenActive) return false; // browser would block it anyway
      const words = spokenText(text);
      if (!words) return false;
      clearTimeout(timer.current);
      window.speechSynthesis.cancel();
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
      setSpokenKey(key);
      return true;
    },
    [ok, on]
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
