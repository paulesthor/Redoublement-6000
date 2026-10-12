// Remise à zéro de la saison 0 : cartes fondateur, état de départ, sauvegardes, bilan, titre « Pionnier ».
import './api.mjs';
const { call, settle, ok, DB, J, done, env } = globalThis.__T;
const { planFounders, START, FOUNDER_TITLE, WIPE } = await import('../src/seasonzero.js');
const { RESET_AT } = await import('../src/reset.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
// 1) tirage des cartes fondateur (fonction pure)
{
  const seq = [0.1, 0.9, 0.4, 0.6, 0.2, 0.8, 0.3, 0.7, 0.5]; let k = 0; const rnd = () => seq[k++ % seq.length];
  const players = [1, 2, 3, 4], picks = new Map([[1, [10, 11, 12]], [2, [10]], [3, []], [4, [99]]]), owned = new Map([[1, [10, 11, 12, 13]], [2, [10, 20]], [3, [30]], [4, [40]]]);
  let n = 1000; const out = await planFounders({ players, picks, owned, randomCard: async used => { while (used.has(++n)); return n; }, rnd });
  const ids = [...out.values()].map(f => f.id);
  ok('cartes fondateur : une par joueur, toutes différentes', out.size === 4 && new Set(ids).size === 4, J([...out]));
  ok('chacun reçoit une carte qu\'il avait proposée quand c\'est possible', [1, 2].every(u => !out.get(u) || picks.get(u).includes(out.get(u).id) || out.get(u).source !== 'choix'));
  ok('sans proposition : une légendaire de sa collection', out.get(3).source === 'collection' && out.get(3).id === 30, J(out.get(3)));
  ok('proposition invalide (pas à lui) : retombe sur sa collection', out.get(4).source === 'collection' && out.get(4).id === 40, J(out.get(4)));
  const none = await planFounders({ players: [5], picks: new Map(), owned: new Map(), randomCard: async () => 777, rnd }); ok('aucune légendaire : carte tirée au hasard', none.get(5).source === 'hasard' && none.get(5).id === 777);
  let clashes = 0; for (let i = 0; i < 200; i++) { const r = await planFounders({ players: [1, 2], picks: new Map([[1, [10]], [2, [10]]]), owned: new Map([[1, [10, 11]], [2, [10, 12]]]), randomCard: async () => 5 }); const a = r.get(1), b = r.get(2); if (a.id === b.id) clashes++; }
  ok('deux joueurs, même carte : jamais en double (le hasard tranche)', clashes === 0);
}
// 2) vraie remise à zéro
const reg = async n => (await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }))[1].token;
const A = await reg('Alice'), B = await reg('Bob'), C = await reg('Carl'), D = await reg('Dora');
const ids = Object.fromEntries((await q('SELECT id, name FROM users ORDER BY id')).map(u => [u.name, u.id]));
await q('UPDATE users SET is_admin = 1 WHERE id = ?', ids.Alice);
const card = async (id, title, rarity, views = 100 + id) => q('INSERT INTO cards (id, title, views, rarity, atk, def, shiny, url) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING', id, title, views, rarity, 5, 5, id > 90000000 ? 1 : 0, 'u');
const give = (uid, id, rar, sh = 0, qty = 1) => q('INSERT INTO inventory (user_id, card_id, qty, acquired, rar, sh, skey, nk, fav) VALUES (?,?,?,?,?,?,?,?,0) ON CONFLICT DO NOTHING', uid, id, qty, Date.now(), rar, sh, rar * 1e9, 't' + id);
for (const [i, t] of [[7001, 'L1'], [7002, 'L2'], [7003, 'L3'], [7004, 'L4'], [7005, 'L5']]) await card(i, t, 'legendary');
await card(7100, 'Commune', 'common'); await card(90007001, 'L1 shiny', 'legendary');
for (const id of [7001, 7002, 7003]) await give(ids.Alice, id, 5); await give(ids.Alice, 7100, 0, 0, 30); await give(ids.Alice, 90007001, 5, 1);
for (const id of [7001, 7004]) await give(ids.Bob, id, 5); await give(ids.Carl, 7005, 5); await give(ids.Carl, 7100, 0, 0, 5);   // Dora : aucune légendaire
await q('UPDATE users SET coins = 123456, packs_opened = 999, duel_wins = 9, pack_stock = 77 WHERE is_bot = 0');
await q("INSERT INTO reset_choices (user_id, picks, ts) VALUES (?,?,?)", ids.Alice, JSON.stringify([7001, 7002, 7003]), 1); await q("INSERT INTO reset_choices (user_id, picks, ts) VALUES (?,?,?)", ids.Bob, JSON.stringify([7001]), 1);
await q("INSERT INTO auctions (seller_id, card_id, start_price, ends_at) VALUES (?,?,?,?)", ids.Carl, 7100, 5, Date.now() + 1e6); await q("INSERT INTO sales (card_id, price, ts) VALUES (7100, 9, 1)"); await q("INSERT INTO hits (username, title, shiny, ts) VALUES ('x','y',0,1)");
await q("INSERT INTO event_claims (key, user_id, ts) VALUES ('exped-finish-1', 0, 1) ON CONFLICT DO NOTHING"); await q("INSERT INTO event_claims (key, user_id, ts) VALUES ('w:2026-10-12', 1, 1) ON CONFLICT DO NOTHING");
await q("INSERT INTO friends (user_id, friend_id, ts) VALUES (?,?,1)", ids.Alice, ids.Bob).catch(() => {}); await q('UPDATE users SET avatar_v = 7 WHERE id = ?', ids.Alice);
let [s, r] = await call(B, 'POST', '/api/admin/reset-run', { dry: true }); ok('réservé à l\'administrateur', s === 403);
[s, r] = await call(A, 'POST', '/api/admin/reset-run', {}); ok('sans confirmation : refusé', s === 400 && /REMETTRE A ZERO/.test(r.error), J([s, r]));
[s, r] = await call(A, 'POST', '/api/admin/reset-run', { dry: true }); const planned = r.plan;
ok('prévisualisation : 4 joueurs, 4 cartes différentes, rien n\'est modifié', s === 200 && r.dry && planned.length === 4 && new Set(planned.map(p => p.card)).size === 4 && (await q('SELECT COUNT(*) n FROM inventory'))[0].n > 8, J(r).slice(0, 300));
ok('prévisualisation : Dora (sans légendaire) reçoit une carte au hasard', planned.find(p => p.user === 'Dora').source === 'hasard');
[s, r] = await call(A, 'POST', '/api/admin/reset-run', { confirm: 'REMETTRE A ZERO' }); ok('remise à zéro lancée', s === 200 && r.ok && r.players === 4, J([s, r]).slice(0, 300));
const inv = await q('SELECT user_id, card_id, qty, rar FROM inventory WHERE user_id IN (?,?,?,?)', ids.Alice, ids.Bob, ids.Carl, ids.Dora);
ok('chaque joueur n\'a plus que sa carte fondateur (légendaire, 1 exemplaire)', inv.length === 4 && inv.every(i => i.rar === 5 && +i.qty === 1) && new Set(inv.map(i => i.card_id)).size === 4, J(inv));
ok('elles portent le halo bêta', (await q('SELECT COUNT(*) n FROM cards WHERE beta = 1'))[0].n === 4);
ok('Alice garde une de ses 3 propositions, pas la shiny', [7001, 7002, 7003].includes(+inv.find(i => i.user_id === ids.Alice).card_id));
const u = await q('SELECT coins, pack_stock, packs_opened, duel_wins, title FROM users WHERE id = ?', ids.Alice);
ok('état de départ : 500 pièces, 10 paquets, statistiques à zéro, titre Pionnier', u[0].coins === START.coins && u[0].pack_stock === START.packs && +u[0].packs_opened === 0 && +u[0].duel_wins === 0 && u[0].title === FOUNDER_TITLE, J(u));
ok('le titre Pionnier est débloqué', (await q('SELECT 1 x FROM user_titles WHERE user_id = ? AND tid = ?', ids.Alice, FOUNDER_TITLE)).length === 1 && (await q('SELECT COUNT(*) n FROM user_titles'))[0].n === 4);
for (const tb of ['auctions', 'sales', 'hits']) ok(`table vidée : ${tb}`, +(await q(`SELECT COUNT(*) n FROM ${tb}`))[0].n === 0);
ok('légendaires uniques activées, une seule carte réservée par joueur', (await q("SELECT value FROM settings WHERE key = 'unique_on'"))[0].value === '1' && +(await q('SELECT COUNT(*) n FROM legend_taken'))[0].n === 4);
ok('les opérations uniques déjà faites ne se rejouent pas, les réclamations de la saison sont effacées', (await q("SELECT 1 x FROM event_claims WHERE key = 'exped-finish-1'")).length === 1 && (await q("SELECT 1 x FROM event_claims WHERE key LIKE 'w:%'")).length === 0);
ok('comptes, avatars et connexions conservés', (await q('SELECT avatar_v FROM users WHERE id = ?', ids.Alice))[0].avatar_v === 7 && (await call(A, 'GET', '/api/me'))[0] === 200);
ok('sauvegardes créées (comptes, collections)', +(await q('SELECT COUNT(*) n FROM bk_s0_inventory'))[0].n > 8 && +(await q('SELECT COUNT(*) n FROM bk_s0_users'))[0].n >= 4);
[s, r] = await call(A, 'POST', '/api/admin/reset-run', { confirm: 'REMETTRE A ZERO' }); ok('deuxième lancement refusé', s === 409, J([s, r]));
// bilan
const now0 = Date.now; Date.now = () => RESET_AT + 5000; delete env.RESET;
try {
  [s, r] = await call(A, 'GET', '/api/me'); ok('/me : un bilan est à montrer', r.recap === true, J(r.recap));
  [s, r] = await call(A, 'GET', '/api/recap'); ok('bilan : chiffres d\'avant la remise à zéro et carte fondateur', s === 200 && r.recap.coins === 123456 && r.recap.packs === 999 && r.recap.cards >= 31 && r.recap.legendary === 4 && r.recap.rank >= 1 && r.recap.players === 4 && r.founder.card?.beta === 1 && r.founder.title, J(r).slice(0, 400));
  await call(A, 'POST', '/api/recap/seen', {}); [s, r] = await call(A, 'GET', '/api/me'); ok('bilan vu : il ne revient plus', !r.recap);
  [s, r] = await call(B, 'GET', '/api/me'); ok('les autres joueurs ont leur bilan', r.recap === true);
} finally { Date.now = now0; env.RESET = '0'; }
done();
