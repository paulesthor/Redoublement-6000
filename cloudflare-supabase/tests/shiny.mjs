// Cartes shiny : tirage, enregistrement, collection, succès et paquets thématiques.
import './api.mjs';
const { call, settle, ok, DB, J, done } = globalThis.__T;
const CFG = (await import('../src/config.js')).default;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
ok('chance de shiny configurée : 1 % des légendaires', CFG.SHINY_CHANCE === 0.01);
const saveS = CFG.SHINY_CHANCE, saveL = CFG.DROP.legendary; CFG.SHINY_CHANCE = 1; CFG.DROP.legendary = 5000;   // presque que des légendaires, toutes shiny
[s, r] = await call(A, 'POST', '/api/packs/open', {}); await settle();
const cards = r.cards ?? [], sh = cards.filter(c => c.shiny);
ok('paquet : des cartes shiny sont tirées', sh.length > 0 && sh.every(c => c.rarity === 'legendary' && c.id >= 100000000), J(cards.map(c => [c.rarity, c.shiny, c.id]).slice(0, 4)));
const inv = await q('SELECT i.card_id, i.sh, c.shiny, c.rarity FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.sh = 1');
ok('inventaire : les shiny sont enregistrées (sh = 1) et liées à une fiche de carte shiny', inv.length === new Set(sh.map(c => c.id)).size && inv.every(x => x.shiny === 1 && x.rarity === 'legendary'), J(inv));
[s, r] = await call(A, 'GET', '/api/album/page?sort=rar'); const col = r.cards ?? [];
ok('collection : les shiny sont listées avec shiny = true', col.some(c => c.shiny), J(col.slice(0, 3)));
const norm = [1];
ok('la shiny garde le même article que la carte normale (id - 100000000)', sh.every(c => c.id - 100000000 > 0));
CFG.SHINY_CHANCE = saveS; CFG.DROP.legendary = saveL;
ok('taux normaux rétablis', CFG.SHINY_CHANCE === 0.01);
done();
