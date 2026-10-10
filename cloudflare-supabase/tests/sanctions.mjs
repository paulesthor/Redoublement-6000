// Sanction de pièces : gains suspendus (mis de côté), épargne gelée, une seule fois, restitution à la fin.
import './api.mjs';
const { call, settle, ok, DB, J, done, env, ctx } = globalThis.__T;
const { __testHooks } = await import('../src/index.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Michelleclebresil', password: 'secret1' }); const M = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
const [mid, bid] = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id);
const coins = async id => +(await q('SELECT coins FROM users WHERE id = ?', id))[0].coins;
await q('UPDATE users SET coins = 1000');
const dayNo = Math.floor(Date.now() / 86400000);
await q('INSERT INTO savings (user_id, amount, acc_day, locked_until) VALUES (?,?,?,0)', mid, 2000, dayNo - 3); await q('INSERT INTO savings (user_id, amount, acc_day, locked_until) VALUES (?,?,?,0)', bid, 2000, dayNo - 3);
[s, r] = await call(B, 'GET', '/api/bank'); ok('joueur normal : intérêts de l\'épargne versés', r.savings.interest > 0 && !r.savings.frozen, J(r.savings));
[s, r] = await call(M, 'GET', '/api/me'); ok('/api/me du joueur sanctionné : bandeau « Gains suspendus » (5 jours)', r.ev.some(e => e.kind === 'freeze' && Math.abs(e.end - Date.now() - 5 * 86400000) < 60000), J(r.ev));
ok('/api/me : écran de sanction (message et date de fin) pour ce joueur seulement', !!(await call(M, 'GET', '/api/me'))[1].sanction?.msg?.includes('pas tricher') && !(await call(B, 'GET', '/api/me'))[1].sanction);
ok('joueur normal : pas de bandeau de sanction', !(await call(B, 'GET', '/api/me'))[1].ev.some(e => e.kind === 'freeze'));
// gains suspendus
await settle(); const base = await coins(mid), held0 = +(await q('SELECT held FROM coin_freeze WHERE user_id = ?', mid))[0].held, bobBase = await coins(bid);
const held = async () => +(await q('SELECT held FROM coin_freeze WHERE user_id = ?', mid))[0].held;
await q('UPDATE users SET coins = coins + 500 WHERE id = ?', mid);
ok('un gain est mis de côté (les pièces n\'augmentent pas)', (await coins(mid)) === base && (await held()) === held0 + 500);
let refused = false; try { await q('UPDATE users SET coins = coins - 200 WHERE id = ?', mid); } catch { refused = true; } ok('filet SQL : toute dépense est refusée', refused && (await coins(mid)) === base);
await q('UPDATE users SET coins = coins + 300 WHERE id = ?', mid); ok('plusieurs gains s\'additionnent à part', (await coins(mid)) === base && (await held()) === held0 + 800);
await q('UPDATE users SET coins = coins + 500 WHERE id = ?', bid); ok('un autre joueur gagne normalement', (await coins(bid)) === bobBase + 500);
// vrai chemin du jeu : récompense quotidienne
[s, r] = await call(M, 'POST', '/api/daily/claim', {}); ok('récompense du jour : acceptée mais mise de côté', s === 200 && (await coins(mid)) === base && (await held()) === held0 + 850, J([s, await coins(mid), await held()]));
// dépenses interdites par les routes (message clair, aucune pièce perdue ni objet obtenu)
const stock0 = +(await q('SELECT pack_stock FROM users WHERE id = ?', mid))[0].pack_stock;
for (const [m, u, b] of [['POST', '/api/packs/buy', {}], ['POST', '/api/themepacks/buy', { theme: 'x' }], ['POST', '/api/auctions/1/bid', { amount: 99 }], ['POST', '/api/tournaments', { stake: 50 }], ['POST', '/api/tournaments/1/join', {}], ['POST', '/api/bourse/bet', { stake: 50 }], ['POST', '/api/hilo/start', { stake: 50 }], ['POST', '/api/fights/bet', { battle: 'x', side: 1, stake: 50 }]]) {
  [s, r] = await call(M, m, u, b); ok(`dépense refusée : ${u}`, s === 403 && /dépenses sont suspendues/.test(r.error), J([s, r]));
}
ok('rien n\'a été dépensé ni acheté', (await coins(mid)) === base && +(await q('SELECT pack_stock FROM users WHERE id = ?', mid))[0].pack_stock === stock0);
[s, r] = await call(B, 'POST', '/api/packs/buy', {}); ok('joueur normal : peut dépenser', s !== 403, J([s, r]));
// épargne gelée
[s, r] = await call(M, 'GET', '/api/bank'); ok('épargne : plus d\'intérêts, montant inchangé, date de gel indiquée', r.savings.amount === 2000 && r.savings.interest === 0 && r.savings.frozen > Date.now(), J(r.savings));
[s, r] = await call(M, 'POST', '/api/bank/withdraw', { amount: 500 }); ok('retrait refusé pendant le gel', s === 403 && /gelée/.test(r.error), J([s, r]));
[s, r] = await call(M, 'POST', '/api/bank/deposit', { amount: 100 }); ok('dépôt refusé pendant le gel', s === 403, J([s, r]));
// une seule fois
const n0 = (await q('SELECT COUNT(*) n FROM coin_freeze'))[0].n; await call(M, 'GET', '/api/me'); await call(M, 'GET', '/api/me'); ok('sanction posée une seule fois', +(await q('SELECT COUNT(*) n FROM coin_freeze'))[0].n === +n0 && +n0 === 1);
// fin de sanction : restitution
await q('UPDATE coin_freeze SET until = ? WHERE user_id = ?', Date.now() - 1000, mid);
const freed = await __testHooks.sanctions.tick(env); await settle();
ok('fin de sanction : les pièces mises de côté sont rendues', freed === 1 && (await coins(mid)) === base + held0 + 850 && (await held()) === 0, J([freed, await coins(mid), base, held0]));
await q('UPDATE users SET coins = coins + 100 WHERE id = ?', mid); ok('après la sanction : les gains reprennent', (await coins(mid)) === base + held0 + 950);
await __testHooks.sanctions.tick(env); [s, r] = await call(M, 'GET', '/api/me'); ok('la sanction n\'est pas reposée après sa fin', !r.ev.some(e => e.kind === 'freeze') && +(await q('SELECT until FROM coin_freeze WHERE user_id = ?', mid))[0].until < Date.now());
[s, r] = await call(M, 'POST', '/api/bank/withdraw', { amount: 500 }); ok('épargne : retrait de nouveau possible', s === 200, J([s, r]));
// Plus ou moins : bloqué pour ce pseudo
[s, r] = await call(M, 'GET', '/api/hilo'); ok('Plus ou moins bloqué (pseudo Michelleclebresil)', r.blocked === true && /pas tricher/.test(r.message), J(r));
done();
