// Transforme le catalogue SQLite (créé par `node seed.js --dump` ou `--sample` dans ../wikimasters) en fichiers statiques :
//   public/catalog/meta.json   { n, ranges }
//   public/catalog/<k>.json    10 000 pages chacun, [[id, titre, vues], ...] classées par rang de popularité
// Usage : node scripts/build-catalog.mjs [chemin/vers/game.db]
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dbPath = process.argv[2] || path.join(root, '..', 'wikimasters', 'data', 'game.db');
const out = path.join(root, 'public', 'catalog');
const SHARD = 10000;

const db = new DatabaseSync(dbPath, { readOnly: true });
const meta = db.prepare("SELECT v FROM meta WHERE k = 'ranges'").get();
if (!meta) { console.error('Catalogue introuvable : lance d’abord `node seed.js --dump` (ou --sample) dans ../wikimasters'); process.exit(1); }
const ranges = JSON.parse(meta.v);
const n = Math.max(...Object.values(ranges).map(r => r[1]));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let shard = [], k = 0, count = 0;
for (const r of db.prepare('SELECT id, title, views FROM cards WHERE shiny = 0 AND rank IS NOT NULL ORDER BY rank').iterate()) {
  shard.push([r.id, r.title, r.views]); count++;
  if (shard.length === SHARD) { writeFileSync(path.join(out, `${k++}.json`), JSON.stringify(shard)); shard = []; }
}
if (shard.length) writeFileSync(path.join(out, `${k++}.json`), JSON.stringify(shard));
writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ n, ranges, shard: SHARD }));
console.log(`${count.toLocaleString('fr-FR')} pages, ${k} fichiers dans ${out}`);
