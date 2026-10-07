// Génère cloudflare/public/catalog/albums.json à partir de tools/albums-themes.mjs : node tools/build-albums.mjs
// Un album = au plus 8 cartes légendaires (dans l'ordre de la liste) ; un thème qui en compte moins de 4 est ignoré.
import { readFileSync, writeFileSync } from 'node:fs';
import { THEMES } from './albums-themes.mjs';
const META = JSON.parse(readFileSync(new URL('../cloudflare/public/catalog/meta.json', import.meta.url)));
const N = META.ranges.legendary[1], shard = JSON.parse(readFileSync(new URL('../cloudflare/public/catalog/0.json', import.meta.url))).slice(0, N);
const by = new Map(shard.map(([id, t], r) => [t.toLowerCase(), { id, t, r }]));
const MAX = 8, albums = [];
for (const th of THEMES) {
  const seen = new Set(), cards = [];
  for (const t of th.titles) { const c = by.get(t.toLowerCase()); if (c && !seen.has(c.id) && cards.length < MAX) { seen.add(c.id); cards.push(c); } }
  if (cards.length < 4) { console.log('ignoré (moins de 4 cartes) :', th.id, cards.length); continue; }
  albums.push({ id: th.id, name: th.name, emoji: th.emoji, blurb: th.blurb, cards });
}
writeFileSync(new URL('../cloudflare/public/catalog/albums.json', import.meta.url), JSON.stringify({ albums }));
console.log(albums.length, 'albums,', albums.reduce((t, a) => t + a.cards.length, 0), 'cartes');
for (const a of albums) console.log(' ', a.emoji, a.name.padEnd(30), a.cards.map(c => c.t).join(', '));
