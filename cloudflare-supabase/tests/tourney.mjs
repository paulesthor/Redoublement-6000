// Tournoi à 4 joueurs : mises, 2 demi-finales simultanées, finale + match pour la 3e place, gains ; forfaits.
import './api.mjs';
const { call, settle, ok, DB, lobby, done, J } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
class Sock { constructor() { this.log = []; this.open = true; } send(d) { if (this.open) this.log.push(JSON.parse(d)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const names = ['Alice', 'Bob', 'Chloé', 'Dan'], T = {};
for (const n of names) { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); T[n] = r.token; }
for (let i = 0; i < 2; i++) for (const n of names) await call(T[n], 'POST', '/api/packs/open', {});
await settle();
const ids = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id), users = Object.fromEntries(ids.map((id, i) => [id, { id, name: names[i] }]));
await q('UPDATE users SET coins = 1000');
const socks = Object.fromEntries(ids.map(id => [id, new Sock()]));
const online = on => { for (const id of ids) { if (on.includes(id)) lobby.clients.set(id, new Set([socks[id]])); else lobby.clients.delete(id); } };
const coins = async () => Object.fromEntries((await q('SELECT id, coins FROM users')).map(x => [x.id, x.coins]));
const deck = async uid => (await q('SELECT card_id FROM inventory WHERE user_id = ? ORDER BY skey DESC LIMIT 3', uid)).map(x => x.card_id);
let s, r;
console.log('— inscriptions et mises');
online(ids);
[s, r] = await call(T.Alice, 'POST', '/api/tournaments', { stake: 5 }); ok('mise trop basse refusée', s === 400, J([s, r]));
[s, r] = await call(T.Alice, 'POST', '/api/tournaments', { stake: 100 }); ok('création', s === 200 && r.id, J([s, r])); const tid = r.id;
ok('mise prélevée', (await coins())[ids[0]] === 900);
[s, r] = await call(T.Alice, 'POST', `/api/tournaments/${tid}/join`, {}); ok('double inscription refusée', s === 400, J([s, r]));
await q('UPDATE users SET coins = 50 WHERE id = ?', ids[3]); [s, r] = await call(T.Dan, 'POST', `/api/tournaments/${tid}/join`, {}); ok('pas assez de pièces', s === 400, J([s, r])); await q('UPDATE users SET coins = 1000 WHERE id = ?', ids[3]);
[s, r] = await call(T.Bob, 'POST', `/api/tournaments/${tid}/join`, {}); [s, r] = await call(T.Chloé, 'POST', `/api/tournaments/${tid}/join`, {}); ok('3 inscrits : pas encore lancé', (await q('SELECT status FROM tournaments WHERE id = ?', tid))[0].status === 'open');
[s, r] = await call(T.Bob, 'POST', `/api/tournaments/${tid}/leave`, {}); ok('départ avant le lancement : remboursé', s === 200 && (await coins())[ids[1]] === 1000, J([s, r]));
await call(T.Bob, 'POST', `/api/tournaments/${tid}/join`, {}); [s, r] = await call(T.Dan, 'POST', `/api/tournaments/${tid}/join`, {});
ok('4e joueur : le tournoi démarre', s === 200 && r.started && (await q('SELECT status FROM tournaments WHERE id = ?', tid))[0].status === 'running', J([s, r]));
await settle(); await sleep(300);
[s, r] = await call(T.Alice, 'GET', `/api/tournaments/${tid}`); ok('tableau : 2 demi-finales', r.bracket?.matches.length === 2 && r.bracket.matches.every(m => m.r === 1 && m.s === 'live' && m.lb === 'Demi-finale'), J(r.bracket));
ok('deux combats en même temps', lobby.battles.size === 2 && [...lobby.battles.values()].every(b => b.tour?.label?.includes('Demi-finale')));
ok('chaque joueur a reçu le combat', ids.every(id => socks[id].log.some(m => m.t === 'battle_start' && /Demi-finale/.test(m.tour))));
console.log('— combats (≈ 4 à 6 minutes)');
const picked = new Set(); const t0 = Date.now(); let finished = 0;
while (Date.now() - t0 < 900000) {
  for (const bt of [...lobby.battles.values()]) {
    if (!bt.fight) { for (const p of bt.players) if (!bt.picks[p] && !picked.has(bt.id + p)) { picked.add(bt.id + p); await lobby.onMessage(users[p], { t: 'pick', id: bt.id, cards: await deck(p) }); } continue; }
    const f = bt.fight;
    if (f.attacker && !f.cur && lobby.clients.has(f.attacker)) { const left = [...f.left[f.attacker]]; if (left.length) await lobby.onMessage(users[f.attacker], { t: 'bf_pick', id: bt.id, card: left[0] }); }
    if (f.cur && f.cur.k >= 0 && f.cur.k < 3 && !f.cur.closed && f.cur.choice === undefined) await lobby.onMessage(users[f.defender], { t: 'bf_answer', id: bt.id, choice: f.cur.qs[f.cur.k].answer });
  }
  const st = (await q('SELECT status FROM tournaments WHERE id = ?', tid))[0].status;
  if (st === 'done') break;
  await sleep(150);
}
await settle(); await sleep(500);
const fin = (await call(T.Alice, 'GET', `/api/tournaments/${tid}`))[1];
ok('tournoi terminé', fin.status === 'done', J(fin).slice(0, 300));
ok('demi-finales, finale et 3e place jouées', fin.bracket.matches.length === 4 && fin.bracket.matches.every(m => m.s === 'done') && ['Finale', 'Match pour la 3ᵉ place'].every(k => fin.bracket.matches.some(m => m.lb === k)), J(fin.bracket.matches));
const fm = fin.bracket.matches.find(m => m.lb === 'Finale'), cm = fin.bracket.matches.find(m => m.g === 'L' && m.r === 2), r1 = fin.bracket.matches.filter(m => m.r === 1);
ok('finale entre les 2 vainqueurs, 3e place entre les 2 perdants', new Set([fm.a, fm.b]).size === 2 && [fm.a, fm.b].every(u => r1.some(m => m.w === u)) && [cm.a, cm.b].every(u => r1.some(m => m.l === u)));
ok('classement : 1er finaliste gagnant', fin.bracket.rank[0] === fm.w && fin.bracket.rank[1] === fm.l && fin.bracket.rank[2] === cm.w && fin.bracket.rank[3] === cm.l);
const po = Object.fromEntries((await q('SELECT user_id, payout FROM tournament_players WHERE tid = ?', tid)).map(x => [x.user_id, x.payout])), net = fin.bracket.rank.map(u => po[u] - 100);
ok('les 2 premiers gagnent, les 2 derniers perdent leur mise', net[0] > 0 && net[1] > 0 && net[2] === -100 && net[3] === -100 && net[0] >= net[1], J(net));
const pays = (await q('SELECT payout FROM tournament_players WHERE tid = ?', tid)).reduce((t, x) => t + x.payout, 0); ok('gains versés = mises (400)', pays === 400, pays);
ok('notifications de résultat', ids.every(id => socks[id].log.some(m => m.t === 'notify' && /finis \d/.test(m.msg))));

console.log('— forfaits');
await q('UPDATE users SET coins = 1000'); online(ids);
[s, r] = await call(T.Alice, 'POST', '/api/tournaments', { stake: 50 }); const t2 = r.id;
for (const n of ['Bob', 'Chloé']) await call(T[n], 'POST', `/api/tournaments/${t2}/join`, {});
online([ids[0]]); await call(T.Dan, 'POST', `/api/tournaments/${t2}/join`, {}); await settle(); await sleep(300);
ok('joueurs hors ligne : matchs en attente', (await call(T.Alice, 'GET', `/api/tournaments/${t2}`))[1].bracket.matches.every(m => m.s === 'wait'));
const age = async () => { const t = (await q('SELECT bracket FROM tournaments WHERE id = ?', t2))[0]; const b = JSON.parse(t.bracket); b.matches.forEach(m => { if (m.s === 'wait') m.since = Date.now() - 11 * 60000; }); await q('UPDATE tournaments SET bracket = ? WHERE id = ?', JSON.stringify(b), t2); };
await age(); await lobby.tourTick(); await settle();
let b2 = (await call(T.Alice, 'GET', `/api/tournaments/${t2}`))[1];
ok('absents plus de 10 min : forfait, étape suivante', b2.bracket.stage === 2 && b2.bracket.matches.length === 4, J(b2.bracket.matches.map(m => [m.lb, m.s])));
await age(); await lobby.tourTick(); await settle();
b2 = (await call(T.Alice, 'GET', `/api/tournaments/${t2}`))[1];
ok('tournoi clos par forfaits, gains versés', b2.status === 'done' && b2.bracket.rank.length === 4 && (await q('SELECT SUM(payout) s FROM tournament_players WHERE tid = ?', t2))[0].s === 200, J(b2).slice(0, 300));
console.log('— tournoi à 8 joueurs (forfaits)');
const more = ['Eve', 'Fred', 'Gina', 'Hugo'];
for (const n of more) { const [, rr] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); T[n] = rr.token; }
const ids8 = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id); await q('UPDATE users SET coins = 1000'); online([]);
[s, r] = await call(T.Alice, 'POST', '/api/tournaments', { stake: 100, size: 8 }); const t8 = r.id; ok('tournoi à 8 créé', s === 200 && (await q('SELECT maxp FROM tournaments WHERE id = ?', t8))[0].maxp === 8);
for (const n of [...names.slice(1), ...more.slice(0, 3)]) { [s, r] = await call(T[n], 'POST', `/api/tournaments/${t8}/join`, {}); ok('inscription ' + n + (n === 'Gina' ? ' (7e)' : ''), s === 200 && !r.started, J([s, r])); }
ok('à 7 inscrits : toujours ouvert', (await q('SELECT status FROM tournaments WHERE id = ?', t8))[0].status === 'open');
[s, r] = await call(T.Hugo, 'POST', `/api/tournaments/${t8}/join`, {}); ok('8e joueur : le tournoi démarre', s === 200 && r.started, J([s, r])); await settle(); await sleep(300);
let b8 = (await call(T.Alice, 'GET', `/api/tournaments/${t8}`))[1];
ok('4 quarts de finale', b8.size === 8 && b8.bracket.matches.length === 4 && b8.bracket.matches.every(m => m.lb === 'Quart de finale'), J(b8.bracket));
[s, r] = await call(T.Alice, 'POST', `/api/tournaments/${t8}/join`, {}); ok('plus d\'inscription une fois lancé', s === 400);
const age8 = async () => { const b = JSON.parse((await q('SELECT bracket FROM tournaments WHERE id = ?', t8))[0].bracket); b.matches.forEach(m => { if (m.s === 'wait') m.since = Date.now() - 11 * 60000; }); await q('UPDATE tournaments SET bracket = ? WHERE id = ?', JSON.stringify(b), t8); };
for (let i = 0; i < 3; i++) { await age8(); await lobby.tourTick(); await settle(); if (i === 0) { b8 = (await call(T.Alice, 'GET', `/api/tournaments/${t8}`))[1]; ok('tour 2 : demi-finales et demi-finales de classement', b8.bracket.stage === 2 && b8.bracket.matches.filter(m => m.r === 2).length === 4 && b8.bracket.matches.filter(m => m.lb === 'Demi-finale').length === 2 && b8.bracket.matches.filter(m => m.lb === 'Demi-finale de classement').length === 2, J(b8.bracket.matches.map(m => [m.r, m.g, m.lb]))); } }
b8 = (await call(T.Alice, 'GET', `/api/tournaments/${t8}`))[1];
ok('tournoi à 8 terminé : 12 matchs', b8.status === 'done' && b8.bracket.matches.length === 12 && b8.bracket.matches.every(m => m.s === 'done'), J(b8.bracket.matches.length));
ok('tour 3 : finale, 3e, 5e et 7e places', ['Finale', 'Match pour la 3ᵉ place', 'Match pour la 5ᵉ place', 'Match pour la 7ᵉ place'].every(k => b8.bracket.matches.some(m => m.lb === k)), J(b8.bracket.matches.filter(m => m.r === 3).map(m => m.lb)));
ok('classement des 8 joueurs, tous différents', b8.bracket.rank.length === 8 && new Set(b8.bracket.rank).size === 8);
const po8 = (await q('SELECT user_id, payout FROM tournament_players WHERE tid = ? ', t8)), byRank = b8.bracket.rank.map(u => po8.find(p => p.user_id === u).payout);
ok('8 joueurs : les 4 premiers gagnent, les 4 derniers perdent leur mise', byRank.slice(0, 4).every(p => p > 100) && byRank.slice(4).every(p => p === 0) && byRank[0] >= byRank[1] && byRank[1] >= byRank[2] && byRank[2] >= byRank[3], J(byRank));
ok('gains versés = mises (800)', byRank.reduce((a, b) => a + b, 0) === 800, J(byRank));
[s, r] = await call(T.Alice, 'POST', '/api/tournaments', { stake: 100, size: 5 }); ok('taille inconnue : ramenée à 4', s === 200 && (await q('SELECT maxp FROM tournaments WHERE id = ?', r.id))[0].maxp === 4); await call(T.Alice, 'POST', `/api/tournaments/${r.id}/leave`, {});
console.log('— annulation');
[s, r] = await call(T.Bob, 'POST', '/api/tournaments', { stake: 80 }); const t3 = r.id; await call(T.Dan, 'POST', `/api/tournaments/${t3}/join`, {});
const before = await coins(); [s, r] = await call(T.Bob, 'POST', `/api/tournaments/${t3}/leave`, {});
ok('le créateur annule : tout le monde est remboursé', s === 200 && r.cancelled && (await coins())[ids[1]] === before[ids[1]] + 80 && (await coins())[ids[3]] === before[ids[3]] + 80, J(r));
[s, r] = await call(T.Alice, 'GET', '/api/tournaments'); ok('liste des tournois', s === 200 && r.tournaments.some(t => t.id === t2 && t.status === 'done'), J(r).slice(0, 200));
done();
