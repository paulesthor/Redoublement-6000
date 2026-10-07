// (Dans un environnement avec proxy : NODE_USE_ENV_PROXY=1 node …)
// Récupère les catégories Wikipédia (non cachées) des articles légendaires du catalogue : node tools/fetch-categories.mjs <sortie.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const out = process.argv[2] || 'categories.json', META = JSON.parse(readFileSync(new URL('../cloudflare/public/catalog/meta.json', import.meta.url)));
const N = META.ranges.legendary[1], shard = JSON.parse(readFileSync(new URL('../cloudflare/public/catalog/0.json', import.meta.url)));
const arts = shard.slice(0, N);                                                   // [id, titre, vues]
const data = existsSync(out) ? JSON.parse(readFileSync(out)) : {};
const UA = { 'User-Agent': 'WikimastersClone/1.0 (jeu prive entre amis; https://github.com/paulesthor/Redoublement-6000)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const todo = arts.filter(a => !data[a[0]]);
console.log(arts.length, 'articles,', todo.length, 'à faire');
for (let i = 0; i < todo.length; i += 40) {
  const batch = todo.slice(i, i + 40), cats = Object.fromEntries(batch.map(a => [a[0], []]));
  let cont = {};
  for (let guard = 0; guard < 30; guard++) {
    const p = new URLSearchParams({ action: 'query', format: 'json', prop: 'categories', cllimit: 'max', clshow: '!hidden', pageids: batch.map(a => a[0]).join('|'), ...cont });
    let r; for (let k = 0; k < 12; k++) { r = await fetch('https://fr.wikipedia.org/w/api.php?' + p, { headers: UA }); if (r.ok) break; const wait = (+r.headers.get('retry-after') || 0) * 1000 || 15000 * (k + 1); console.log('attente', r.status, Math.round(wait / 1000), 's'); await sleep(wait); }
    if (!r.ok) { console.log('échec', r.status, '— relance la commande pour reprendre'); writeFileSync(out, JSON.stringify(data)); process.exit(1); }
    const j = await r.json();
    for (const [id, pg] of Object.entries(j.query?.pages ?? {})) for (const c of pg.categories ?? []) (cats[id] ??= []).push(c.title.replace(/^Catégorie:/, ''));
    if (!j.continue) break; cont = j.continue; await sleep(600);
  }
  for (const a of batch) data[a[0]] = { t: a[1], c: cats[a[0]] ?? [] };
  if ((i / 40) % 10 === 0) { writeFileSync(out, JSON.stringify(data)); console.log(Object.keys(data).length, '/', arts.length); }
  await sleep(1200);
}
writeFileSync(out, JSON.stringify(data)); console.log('terminé', Object.keys(data).length);
