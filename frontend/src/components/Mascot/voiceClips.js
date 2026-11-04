/*
  Tino's recorded voice.

  Every line he can say was recorded ahead of time with a neural voice (Kokoro, "am_liam",
  pitched up to sound like a young boy) and saved as public/voice/<id>.mp3, where <id> is a
  short hash of the spoken text. public/voice/manifest.json lists the ids that exist.
  Lines without a recording (e.g. a product added to the menu later) use the browser's voice.

  To re-record after changing lines.js or the menu: see scripts/voice/README.md.
*/

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

// FNV-1a, 32 bit, as 8 hex digits: the recording's file name
export const clipId = words => {
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) {
    h ^= words.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
