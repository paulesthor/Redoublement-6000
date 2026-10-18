// Quiz entre joueurs : le tirage des cartes ne retombe plus toujours sur les mêmes (les shiny ont un identifiant énorme).
import './api.mjs';
const { ok, DB, done } = globalThis.__T;
const { randomPool } = await import('../src/util.js');
const env = globalThis.__T.env;
for (let i = 1; i <= 400; i++) {
  await DB.prepare('INSERT INTO cards (id, title, views, rarity, atk, def, shiny, url, extract, enriched) VALUES (?,?,?,?,?,?,?,?,?,1) ON CONFLICT DO NOTHING').bind(i * 1000, 'Carte ' + i, i, 'common', 1, 1, 0, 'u', 'x'.repeat(100)).run();
  if (i <= 40) await DB.prepare('INSERT INTO cards (id, title, views, rarity, atk, def, shiny, url, extract, enriched) VALUES (?,?,?,?,?,?,?,?,?,1) ON CONFLICT DO NOTHING').bind(100000000 + i * 1000, 'Shiny ' + i, i, 'common', 1, 1, 1, 'u', 'x'.repeat(100)).run();
}
const seen = new Set(); let lowest = 0, same = 0, prev = '';
for (let i = 0; i < 30; i++) {
  const p = await randomPool(env, 20), key = p.map(c => c.id).sort((a, b) => a - b).join(',');
  p.forEach(c => seen.add(c.id)); if (key === prev) same++; prev = key;
  if (p.length === 20 && p.every(c => c.id <= 20000)) lowest++;
  if (p.some(c => c.id >= 100000000)) { ok('aucune carte shiny dans le tirage', false); }
}
ok('20 cartes distinctes à chaque tirage', (await randomPool(env, 20)).length === 20 && new Set((await randomPool(env, 20)).map(c => c.id)).size === 20);
ok('les tirages varient (beaucoup de cartes différentes sur 30 tirages)', seen.size > 150, seen.size);
ok('jamais deux tirages identiques d\'affilée', same === 0, same);
ok('ce ne sont pas toujours les cartes aux plus petits identifiants', lowest < 3, lowest);
done();
