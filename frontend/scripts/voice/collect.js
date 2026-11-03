/*
  Lists every line Tino can say, as the exact words he speaks, with each line's clip id.
  Writes scripts/voice/lines.json: [{ id, words }]

  Run from frontend/:
    npx esbuild scripts/voice/collect.js --bundle --platform=node --outfile=scripts/voice/.collect.cjs && node scripts/voice/.collect.cjs
*/
import fs from 'fs';
import path from 'path';
import { LINES, CATEGORY_LINES, VOICE_TEMPLATES } from '../../src/components/Mascot/lines';
import { MENU } from '../../src/data/menu';
import { spokenText, clipId } from '../../src/components/Mascot/voiceClips';

const texts = new Set();
const add = t => {
  if (typeof t === 'string') texts.add(t);
  else if (Array.isArray(t)) t.forEach(add);
  else if (t && typeof t === 'object' && typeof t.text === 'string') texts.add(t.text);
};

Object.values(LINES).forEach(add); // functions (added, carrying, feast) are expanded below
Object.values(CATEGORY_LINES).forEach(add);

const { FEAST, ADDED_NAMED, ADDED_PLAIN, CARRYING_NAMED, CARRYING_PLAIN } = VOICE_TEMPLATES;
const names = [...new Set(MENU.map(p => p.name))];
names.forEach(n => {
  ADDED_NAMED.forEach(f => add(f(n)));
  CARRYING_NAMED.forEach(f => add(f(n)));
});
add(ADDED_PLAIN);
add(CARRYING_PLAIN);
for (let n = 5; n <= 15; n++) add(FEAST(n));

const out = new Map();
texts.forEach(t => {
  const words = spokenText(t);
  if (words) out.set(clipId(words), words);
});
const list = [...out].map(([id, words]) => ({ id, words }));
fs.writeFileSync(path.join('scripts', 'voice', 'lines.json'), JSON.stringify(list, null, 1));
console.log(`${list.length} lines (${names.length} products)`);
