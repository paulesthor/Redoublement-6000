// Légendaires uniques : un seul exemplaire normal et un seul exemplaire shiny par article, dans tous les tirages.
import './api.mjs';
const { call, settle, ok, DB, J, done, env } = globalThis.__T;
const CFG = (await import('../src/config.js')).default;
const { __testHooks } = await import('../src/index.js');
const { refreshUnique, releaseLegends } = await import('../src/unique.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const origin = 'http://x', draw = (n, w, theme = null, ev = null, uid = null) => __testHooks.drawCards(env, origin, n, w, theme, ev, uid);
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
const [alice, bob] = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id);
const SH = 100000000, saveL = CFG.DROP.legendary, saveG = CFG.GODPACK_CHANCE, saveS = CFG.SHINY_CHANCE;
const heavy = { ...CFG.DROP, legendary: 5000 };
// 1) mode normal (réglage coupé) : rien n'est réservé
CFG.GODPACK_CHANCE = 0; let packs = []; for (let i = 0; i < 3; i++) packs.push(...await draw(10, heavy, null, null, alice));
ok('réglage coupé : aucune réservation', (await q('SELECT COUNT(*) n FROM legend_taken'))[0].n === 0 && packs.some(c => c.rarity === 'legendary'));
// 2) mode unique : activé
await q("INSERT INTO settings (key, value) VALUES ('unique_on', '1') ON CONFLICT (key) DO UPDATE SET value = '1'"); refreshUnique();
CFG.SHINY_CHANCE = 0.3; packs = [];
for (let i = 0; i < 30; i++) packs.push(...await draw(10, heavy, null, null, i % 2 ? alice : bob));
const legs = packs.filter(c => c.rarity === 'legendary'), ids = legs.map(c => c.id);
ok('30 paquets presque tous légendaires : aucune carte en double (normales et shiny)', ids.length > 200 && new Set(ids).size === ids.length, J([ids.length, new Set(ids).size]));
ok('des shiny et des normales sont sorties, jamais deux fois la même version', legs.some(c => c.shiny) && legs.some(c => !c.shiny));
ok('chaque légendaire tirée est réservée', (await q('SELECT COUNT(*) n FROM legend_taken'))[0].n === ids.length, J([(await q('SELECT COUNT(*) n FROM legend_taken'))[0].n, ids.length]));
// la version normale et la version shiny du même article peuvent exister toutes les deux (2 exemplaires au total)
const both = legs.filter(c => c.shiny).filter(c => legs.some(d => !d.shiny && d.id === c.id - SH)); ok('une version normale et une version shiny du même article sont deux cartes distinctes', legs.every(c => new Set(legs.filter(d => d.id === c.id)).size === 1));
// 3) sans identifiant de joueur : comportement d'avant (pas de réservation)
const before = (await q('SELECT COUNT(*) n FROM legend_taken'))[0].n; await draw(10, heavy); ok('tirage sans joueur : rien n\'est réservé', (await q('SELECT COUNT(*) n FROM legend_taken'))[0].n === before);
// 4) catégorie épuisée : les légendaires de la catégorie n'existent qu'une fois, le reste devient ultra
await q('DELETE FROM legend_taken'); CFG.SHINY_CHANCE = 0;
const theme = { cards: [{ r: 5 }, { r: 6 }, { r: 7 }] };
const t1 = await draw(10, heavy, theme, null, alice), t2 = await draw(10, heavy, theme, null, bob);
const tl = [...t1, ...t2].filter(c => c.rarity === 'legendary'), tids = tl.map(c => c.id);
ok('catégorie de 3 cartes : 3 légendaires au plus en tout, toutes différentes', tl.length === 3 && new Set(tids).size === 3, J(tl.length));
ok('les autres cartes « légendaires » deviennent des ultra rares', [...t1, ...t2].filter(c => c.rarity === 'ultra').length >= 10);
// 5) libération : une carte non donnée retourne dans la réserve, jamais si elle est dans une collection
const one = tl[0]; await q('INSERT INTO cards (id, title, views, rarity, atk, def, shiny, url) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING', one.id, one.title, 10, 'legendary', 5, 5, 0, 'u');
await q('INSERT INTO inventory (user_id, card_id, qty, acquired, rar, sh, skey, nk, fav) VALUES (?,?,1,1,5,0,1,?,0) ON CONFLICT DO NOTHING', alice, one.id, 'x');
await releaseLegends(env, [one]); ok('une carte déjà dans une collection n\'est jamais libérée', (await q('SELECT 1 x FROM legend_taken WHERE card_id = ?', one.id)).length === 1);
await releaseLegends(env, [tl[1]]); ok('une carte non donnée retourne dans la réserve', (await q('SELECT 1 x FROM legend_taken WHERE card_id = ?', tl[1].id)).length === 0);
// 6) défausse interdite pour une légendaire unique
[s, r] = await call(A, 'POST', '/api/discard', { card_id: one.id }); ok('défausse d\'une légendaire : refusée', s === 400 && /unique/.test(r.error), J([s, r]));
[s, r] = await call(A, 'POST', '/api/discard-many', { ids: [one.id] }); ok('défausse multiple avec une légendaire : refusée', s === 400, J([s, r]));
// 7) vrais paquets : aucune légendaire en double entre deux joueurs
await q('DELETE FROM legend_taken'); await q('DELETE FROM inventory WHERE rar = 5'); CFG.DROP.legendary = 3000;   // réserve ET collections vidées : sinon une légendaire gardée d'un test précédent peut ressortir (le tirage ne la voit plus réservée)
 await q('UPDATE users SET pack_stock = 40, coins = 10000');
for (let i = 0; i < 12; i++) { await call(A, 'POST', '/api/packs/open', {}); await call(B, 'POST', '/api/packs/buy', {}); } await settle();
const inv = await q('SELECT card_id, COUNT(*) n, SUM(qty) q FROM inventory WHERE rar = 5 GROUP BY card_id');
ok('vrais paquets : chaque légendaire existe une seule fois', inv.length > 20 && inv.every(x => +x.n === 1 && +x.q === 1), J([inv.length, inv.filter(x => +x.n > 1 || +x.q > 1).length]));
ok('la réserve correspond aux légendaires en collection (ou préparées)', +(await q('SELECT COUNT(*) n FROM legend_taken'))[0].n >= inv.length);
// 8) les joueurs simulés n'enchérissent jamais sur une légendaire
const leg = inv[0].card_id; await q("UPDATE auctions SET status = 'expired' WHERE status = 'open'");
await q('UPDATE users SET is_admin = 1 WHERE id = ?', alice);
const owner = (await q('SELECT user_id FROM inventory WHERE card_id = ?', leg))[0].user_id, tok = owner === alice ? A : B;
[s] = await call(tok, 'POST', '/api/auctions', { card_id: leg, price: 1, minutes: 600 }); ok('mise en vente d\'une légendaire par son propriétaire', s === 200);
const rnd = Math.random; Math.random = () => 0.0001; try { for (let i = 0; i < 8; i++) await call(A, 'POST', '/api/admin/run', { action: 'bots' }); } finally { Math.random = rnd; } await settle();
ok('aucun joueur simulé n\'enchérit sur une légendaire', (await q('SELECT COUNT(*) n FROM bids b JOIN auctions a ON a.id = b.auction_id JOIN users u ON u.id = b.user_id WHERE a.card_id = ? AND u.is_bot = 1', leg))[0].n === 0);
[s, r] = await call(A, 'POST', '/api/admin/lot', { title: 'Paris' }); ok('l\'administration ne crée pas de vente simulée de légendaire', s !== 200 || r.rarity !== 'legendary', J([s, r]));
// 9) « qui possède cette carte ? »
{ const SHo = 100000000, ownerName = (await q('SELECT name FROM users WHERE id = ?', owner))[0].name;
  [s, r] = await call(B, 'GET', `/api/cards/${leg}/owners`); ok('légendaire en vente : état « enchère », vendeur et prix indiqués', s === 200 && r.unique && r.state === 'enchère' && r.auction?.seller === ownerName && r.auction.price === 1, J(r));
  ok('l\'autre version (shiny) est signalée', r.other && r.other.id === leg + SHo && r.other.shiny === true, J(r.other));
  await q("UPDATE auctions SET status = 'expired' WHERE card_id = ?", leg); await q('INSERT INTO inventory (user_id, card_id, qty, acquired, rar, sh, skey, nk, fav) VALUES (?,?,1,1,5,0,1,?,0) ON CONFLICT DO NOTHING', owner, leg, 'x');
  [s, r] = await call(B, 'GET', `/api/cards/${leg}/owners`); ok('légendaire en collection : état « collection » et propriétaire', r.state === 'collection' && r.owners.length === 1 && r.owners[0].name === ownerName && r.total === 1, J(r));
  const freeId = 8800001; await q('INSERT INTO cards (id, title, views, rarity, atk, def, shiny, url) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING', freeId, 'Libre', 5, 'legendary', 5, 5, 0, 'u');
  [s, r] = await call(B, 'GET', `/api/cards/${freeId}/owners`); ok('légendaire que personne n\'a : « libre »', r.state === 'libre' && r.owners.length === 0, J(r));
  await q('INSERT INTO legend_taken (card_id, ts) VALUES (?,1) ON CONFLICT DO NOTHING', freeId); [s, r] = await call(B, 'GET', `/api/cards/${freeId}/owners`); ok('réservée mais chez personne : « en jeu »', r.state === 'en jeu', J(r));
  const common = (await q("SELECT c.id FROM cards c JOIN inventory i ON i.card_id = c.id WHERE c.rarity = 'common' LIMIT 1"))[0]?.id;
  if (common) { [s, r] = await call(B, 'GET', `/api/cards/${common}/owners`); ok('carte non légendaire : pas unique, nombre de propriétaires et d\'exemplaires', s === 200 && r.unique === false && r.state === null && r.total >= 1 && r.players >= 1, J(r)); }
  [s] = await call(B, 'GET', '/api/cards/999999999/owners'); ok('carte inconnue : 404', s === 404);
  [s] = await call(null, 'GET', `/api/cards/${leg}/owners`); ok('connexion requise', s === 401); }
// 10) tableau de bord de l'économie : administrateur seulement
{ 
  await q('UPDATE users SET is_admin = 0 WHERE id <> ?', alice); [s] = await call(B, 'GET', '/api/admin/economy'); ok('économie : refusée à un joueur non administrateur', s === 403, s);
  [s, r] = await call(A, 'GET', '/api/admin/economy'); ok('économie : chiffres pour l\'administrateur', s === 200 && r.players >= 2 && r.coins > 0 && r.legendaries.existing > 0 && Array.isArray(r.top), J([s, r]));
  ok('économie : répartition des collections par rareté et par joueur', r.collections?.byRarity?.length > 0 && r.collections.cardsPerPlayer.max >= r.collections.cardsPerPlayer.median && r.collections.cardsPerPlayer.median > 0, J(r.collections)); }
CFG.DROP.legendary = saveL; CFG.GODPACK_CHANCE = saveG; CFG.SHINY_CHANCE = saveS;
done();
