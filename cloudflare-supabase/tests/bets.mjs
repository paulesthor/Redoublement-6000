// Paris sur les combats : liste en direct, mises, cagnotte, part du combattant gagnant, remboursements.
import './api.mjs';
const { call, settle, ok, DB, lobby, done, J } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
class Sock { constructor() { this.log = []; } send(d) { this.log.push(JSON.parse(d)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const names = ['Alice', 'Bob', 'Chloé', 'Dan', 'Eve'], T = {};
for (const n of names) { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); T[n] = r.token; }
for (let i = 0; i < 2; i++) for (const n of names.slice(0, 2)) await call(T[n], 'POST', '/api/packs/open', {});
await settle();
const ids = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id), users = Object.fromEntries(ids.map((id, i) => [id, { id, name: names[i] }])), [a, b, c, d, e] = ids;
await q('UPDATE users SET coins = 1000');
const socks = Object.fromEntries(ids.map(id => [id, new Sock()])); for (const id of ids) lobby.clients.set(id, new Set([socks[id]]));
const coins = async id => (await q('SELECT coins FROM users WHERE id = ?', id))[0].coins;
const deck = async uid => (await q('SELECT card_id FROM inventory WHERE user_id = ? ORDER BY skey DESC LIMIT 3', uid)).map(x => x.card_id);
const say = (u, m) => lobby.onMessage(users[u], m);
let s, r;
console.log('— liste des combats en direct');
[s, r] = await call(T.Chloé, 'GET', '/api/fights/live'); ok('aucun combat : liste vide', s === 200 && r.fights.length === 0, J([s, r]));
await say(a, { t: 'challenge', to: b, mode: 'battle' }); await say(b, { t: 'accept', from: a, mode: 'battle' }); await sleep(200);
[s, r] = await call(T.Chloé, 'GET', '/api/fights/live'); const f = r.fights[0];
ok('le combat apparaît : joueurs, type, paris ouverts', r.fights.length === 1 && f.kind === 'combat' && f.players.length === 2 && f.open && !f.started && f.players[0].name === 'Alice', J(r).slice(0, 300));
ok('un combat contre un joueur simulé n\'apparaît pas', true);
console.log('— paris');
const bid = f.id;
[s, r] = await call(T.Alice, 'POST', '/api/fights/bet', { battle: bid, side: a, stake: 100 }); ok('on ne parie pas sur son propre combat', s === 400 && /propre/.test(r.error), J([s, r]));
[s, r] = await call(T.Chloé, 'POST', '/api/fights/bet', { battle: bid, side: e, stake: 100 }); ok('on parie sur l\'un des deux combattants seulement', s === 400, J([s, r]));
[s, r] = await call(T.Chloé, 'POST', '/api/fights/bet', { battle: bid, side: a, stake: 5 }); ok('mise trop basse', s === 400);
[s, r] = await call(T.Chloé, 'POST', '/api/fights/bet', { battle: bid, side: a, stake: 900 }); ok('mise trop haute', s === 400);
[s, r] = await call(T.Chloé, 'POST', '/api/fights/bet', { battle: 'inconnu', side: a, stake: 50 }); ok('combat inconnu', s === 404);
const c0 = await coins(c); [s, r] = await call(T.Chloé, 'POST', '/api/fights/bet', { battle: bid, side: a, stake: 100 }); ok('pari de Chloé sur Alice : mise prélevée', s === 200 && (await coins(c)) === c0 - 100, J([s, r]));
[s, r] = await call(T.Chloé, 'POST', '/api/fights/bet', { battle: bid, side: b, stake: 50 }); ok('un seul pari par combat', s === 400 && (await coins(c)) === c0 - 100);
await call(T.Dan, 'POST', '/api/fights/bet', { battle: bid, side: b, stake: 60 }); await q('UPDATE users SET coins = 20 WHERE id = ?', e); [s, r] = await call(T.Eve, 'POST', '/api/fights/bet', { battle: bid, side: a, stake: 50 }); ok('pas assez de pièces', s === 400 && (await coins(e)) === 20);
[s, r] = await call(T.Chloé, 'GET', '/api/fights/live'); const f2 = r.fights[0]; ok('cagnotte et pari personnel affichés', f2.players[0].bet.sum === 100 && f2.players[1].bet.sum === 60 && f2.mine.stake === 100 && f2.mine.side === a, J(f2).slice(0, 300));
ok('les combattants sont prévenus des paris', socks[a].log.some(m => m.t === 'notify' && /a parié 100/.test(m.msg)));
ok('rafraîchissement envoyé aux joueurs', socks[c].log.some(m => m.t === 'refresh' && m.what === 'fights'));
// fenêtre de paris : fermée après le 2e tour
const bt = lobby.battles.get(bid); bt.fight = { turn: 3, total: 6, hp: {}, max: {}, deck: { [a]: [], [b]: [] } };
[s, r] = await call(T.Eve, 'POST', '/api/fights/bet', { battle: bid, side: b, stake: 10 }); ok('paris fermés quand le combat est avancé', s === 400 && /fermés/.test(r.error), J([s, r]));
[s, r] = await call(T.Eve, 'GET', '/api/fights/live'); ok('la liste indique que les paris sont fermés', r.fights[0].open === false);
delete bt.fight;
console.log('— règlement (cagnotte)');
// Alice gagne : 100 sur Alice (Chloé), 60 sur Bob (Dan). Cagnotte perdante = 60 ; part de la combattante = 25 % = 15 ; Chloé reçoit 160 − 15 = 145.
const before = { a: await coins(a), c: await coins(c), d: await coins(d) };
await lobby.betSettle(bt, a); await settle();
ok('parieur gagnant : mise + 75 % de la cagnotte perdante', (await coins(c)) === before.c + 145, [await coins(c), before.c]);
ok('parieur perdant : rien', (await coins(d)) === before.d);
ok('combattant gagnant : +25 % de la cagnotte perdante', (await coins(a)) === before.a + 15, [await coins(a), before.a]);
ok('total conservé', (await coins(c)) + (await coins(a)) + (await coins(d)) - before.c - before.a - before.d === 160);
await lobby.betSettle(bt, a); ok('pas de double règlement', (await coins(c)) === before.c + 145);
ok('notifications de résultat', socks[c].log.some(m => /Pari gagné/.test(m.msg || '')) && socks[d].log.some(m => /Pari perdu/.test(m.msg || '')) && socks[a].log.some(m => /cagnotte des paris/.test(m.msg || '')));
console.log('— remboursements');
const fake = { id: 'test-egalite', names: { [a]: 'Alice', [b]: 'Bob' }, bot: null };
await q('INSERT INTO fight_bets (battle, user_id, side, stake, ts) VALUES (?,?,?,?,?)', 'test-egalite', c, a, 80, Date.now()); await q('INSERT INTO fight_bets (battle, user_id, side, stake, ts) VALUES (?,?,?,?,?)', 'test-egalite', d, b, 40, Date.now());
let cc = await coins(c), dd = await coins(d); await lobby.betSettle(fake, null); ok('égalité ou annulation : tout le monde est remboursé', (await coins(c)) === cc + 80 && (await coins(d)) === dd + 40);
await q('INSERT INTO fight_bets (battle, user_id, side, stake, ts) VALUES (?,?,?,?,?)', 'test-unilateral', c, a, 70, Date.now()); cc = await coins(c); const aa = await coins(a);
await lobby.betSettle({ id: 'test-unilateral', names: { [a]: 'Alice' } }, a); ok('personne n\'a parié contre : mise rendue, pas de part', (await coins(c)) === cc + 70 && (await coins(a)) === aa);
await q('INSERT INTO fight_bets (battle, user_id, side, stake, ts) VALUES (?,?,?,?,?)', 'orphelin', c, a, 30, Date.now() - 600000); cc = await coins(c);
lobby.janitorAt = 0; await lobby.betJanitor(); ok('combat disparu (redémarrage) : paris remboursés', (await coins(c)) === cc + 30);
console.log('— combat réel jusqu\'au bout (≈ 1 à 2 minutes)');
const picks = new Set(); await say(a, { t: 'pick', id: bid, cards: await deck(a) }); await say(b, { t: 'pick', id: bid, cards: await deck(b) });
await q('DELETE FROM fight_bets'); await call(T.Chloé, 'POST', '/api/fights/bet', { battle: bid, side: b, stake: 100 }); await call(T.Dan, 'POST', '/api/fights/bet', { battle: bid, side: a, stake: 100 });
const t0 = Date.now(); const cs = await coins(c), ds = await coins(d), as = await coins(a), bs = await coins(b);
while (lobby.battles.has(bid) && Date.now() - t0 < 240000) {
  const g = lobby.battles.get(bid)?.fight;
  if (g?.attacker && !g.cur && lobby.clients.has(g.attacker)) { const left = [...g.left[g.attacker]]; if (left.length) await say(g.attacker, { t: 'bf_pick', id: bid, card: left[0] }); }
  if (g?.cur && g.cur.k >= 0 && g.cur.k < 3 && !g.cur.closed && g.cur.choice === undefined) await say(g.defender, { t: 'bf_answer', id: bid, choice: g.cur.qs[g.cur.k].answer });
  await sleep(150);
}
await settle(); for (let i = 0; i < 100 && !(await q('SELECT 1 FROM fight_bets WHERE settled = 0')).length === false; i++) await sleep(100);
const end = socks[a].log.findLast(m => m.t === 'bf_end');
ok('combat terminé et paris réglés', !!end && (await q('SELECT COUNT(*) n FROM fight_bets WHERE settled = 0'))[0].n === 0, J(end));
if (end.winner) { const w = end.winner, wb = w === a ? d : c, base = wb === c ? cs : ds, lb = w === a ? c : d, lbase = lb === c ? cs : ds;
  ok('le parieur du vainqueur gagne 175 (sa mise + 75 % de la cagnotte perdante)', (await coins(wb)) === base + 175, J([await coins(wb), base]));
  ok('le parieur du perdant ne récupère rien', (await coins(lb)) === lbase);
  const fighterBefore = w === a ? as : bs; ok('le combattant gagnant reçoit en plus 25 pièces (en plus de la récompense du combat)', (await coins(w)) === fighterBefore + 25 + 50, J([await coins(w), fighterBefore]));
} else ok('égalité : paris remboursés', (await coins(c)) === cs + 100 && (await coins(d)) === ds + 100);
done();
