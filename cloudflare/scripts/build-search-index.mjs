// Index de recherche : retrouve le rang (donc la rareté) d'un titre exact, sans charger tout le catalogue.
//   public/catalog/s/<0..4095>.json   [[rang, titre], ...] pour les titres dont le hachage tombe dans ce seau
// À relancer après `npm run catalog`. Usage : node scripts/build-search-index.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'public', 'catalog');
const out = path.join(dir, 's');
export const BUCKETS = 4096;
export const bucketOf = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0; return h & (BUCKETS - 1); };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const buckets = Array.from({ length: BUCKETS }, () => []);
const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json')));
const files = readdirSync(dir).filter(f => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
let n = 0;
for (const f of files) {
  const shard = JSON.parse(readFileSync(path.join(dir, f)));
  const base = parseInt(f) * meta.shard;
  shard.forEach((e, i) => { buckets[bucketOf(e[1])].push([base + i, e[1]]); n++; });
}
buckets.forEach((b, i) => writeFileSync(path.join(out, `${i}.json`), JSON.stringify(b)));
console.log(`${n.toLocaleString('fr-FR')} titres dans ${BUCKETS} fichiers`);
