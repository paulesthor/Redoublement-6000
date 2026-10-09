// Génère cloudflare/public/catalog/albums-events.json (albums éphémères) à partir de cloudflare-supabase/src/events-data.js : node tools/build-event-albums.mjs
// Un album garde les 8 premiers titres de sa liste trouvés dans le catalogue (toutes raretés) ; un album de moins de 6 cartes est ignoré.
import { readFileSync, writeFileSync } from 'node:fs';
import { EVENT_ALBUMS } from '../cloudflare-supabase/src/events-data.js';
const dir = new URL('../cloudflare/public/catalog/', import.meta.url), META = JSON.parse(readFileSync(new URL('meta.json', dir)));
const by = new Map();
for (let k = 0; k * META.shard < META.n; k++) JSON.parse(readFileSync(new URL(k + '.json', dir))).forEach(([id, t], i) => { const c = { id, t, r: k * META.shard + i }; by.set(t, c); if (!(by.has(t) || by.has(t.toLowerCase()))) by.set(t.toLowerCase(), c); });
const R = Object.entries(META.ranges), rarity = r => R.find(([, [a, b]]) => r >= a && r < b)?.[0];
const albums = [];
for (const a of EVENT_ALBUMS) {
  const seen = new Set(), cards = [];
  for (const t of a.titles) { const c = by.get(t) ?? by.get(t.toLowerCase()); if (c && !seen.has(c.id) && cards.length < 8) { seen.add(c.id); cards.push(c); } }
  console.log(a.emoji, a.name.padEnd(22), cards.length, cards.map(c => `${c.t} (${rarity(c.r)})`).join(', '), '| absents :', a.titles.filter(t => !(by.has(t) || by.has(t.toLowerCase()))).join(', '));
  if (cards.length >= 6) albums.push({ id: a.id, name: a.name, emoji: a.emoji, blurb: a.blurb, cards });
}
writeFileSync(new URL('albums-events.json', dir), JSON.stringify({ albums }));
console.log(albums.length, 'albums éphémères');
