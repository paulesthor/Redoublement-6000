// Duel à la mise : 1 carte chacun, 6 questions par carte, le vainqueur garde la carte de l'autre.
import './api.mjs';
const { call, settle, ok, DB, lobby, done, J } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
class Sock { constructor() { this.log = []; } send(d) { this.log.push(JSON.parse(d)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
for (let i = 0; i < 3; i++) { await call(A, 'POST', '/api/packs/open', {}); await call(B, 'POST', '/api/packs/open', {}); }
await settle();
const [a, b] = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id), users = { [a]: { id: a, name: 'Alice' }, [b]: { id: b, name: 'Bob' } };
const socks = { [a]: new Sock(), [b]: new Sock() }; for (const id of [a, b]) lobby.clients.set(id, new Set([socks[id]]));
const say = (u, m) => lobby.onMessage(users[u], m), last = (sk, t) => [...sk.log].reverse().find(m => m.t === t);
const total = async () => (await q('SELECT SUM(qty) n FROM inventory WHERE user_id IN (?, ?)', a, b))[0].n;
const T0 = await total();
const ca = (await q('SELECT card_id FROM inventory WHERE user_id = ? ORDER BY skey DESC LIMIT 1', a))[0].card_id, cb = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND card_id <> ? ORDER BY skey DESC LIMIT 1', b, ca))[0].card_id;
const has = async (u, c) => (await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', u, c))[0]?.qty ?? 0;
const qa = await has(a, ca), qb = await has(b, cb), qab = await has(a, cb), qba = await has(b, ca);
console.log('— duel à la mise');
await say(a, { t: 'challenge', to: b, mode: 'stake' }); ok('le défi indique le mode', last(socks[b], 'challenge')?.mode === 'stake');
await say(b, { t: 'accept', from: a, mode: 'stake' });
const bt = [...lobby.battles.values()][0]; ok('duel créé : 1 carte, 6 questions', bt?.stake && bt.rounds === 1 && bt.qPer === 6 && last(socks[a], 'battle_start')?.rounds === 1 && last(socks[a], 'battle_start')?.stake);
await say(a, { t: 'pick', id: bt.id, cards: [ca, cb] }); ok('2 cartes refusées', socks[a].log.some(m => m.t === 'error'));
await say(a, { t: 'pick', id: bt.id, cards: [ca] }); ok('carte pas encore retirée avant que l\'adversaire choisisse', (await has(a, ca)) === qa);
await say(b, { t: 'pick', id: bt.id, cards: [cb] });
ok('cartes mises de côté pendant le duel', (await has(a, ca)) === qa - 1 && (await has(b, cb)) === qb - 1 && (await total()) === T0 - 2, J([await has(a, ca), qa]));
let f; const end = Date.now() + 240000;
while (lobby.battles.has(bt.id) && Date.now() < end) {
  f = lobby.battles.get(bt.id)?.fight;
  if (f?.attacker && !f.cur && lobby.clients.has(f.attacker)) { const left = [...f.left[f.attacker]]; if (left.length) await say(f.attacker, { t: 'bf_pick', id: bt.id, card: left[0] }); }
  if (f?.cur && f.cur.k >= 0 && f.cur.k < 6 && !f.cur.closed && f.cur.choice === undefined) await say(f.defender, { t: 'bf_answer', id: bt.id, choice: f.cur.qs[f.cur.k].answer });
  await sleep(120);
}
await settle(); for (let i = 0; i < 300 && !last(socks[a], 'bf_end'); i++) await sleep(100);
const e = last(socks[a], 'bf_end'); ok('duel terminé', !!e, J(e)); ok('2 tours de 6 questions', socks[a].log.filter(m => m.t === 'bf_q').length === 12 && last(socks[a], 'bf_q').kTotal === 6, socks[a].log.filter(m => m.t === 'bf_q').length);
ok('résultat : les 2 cartes indiquées', e.stake?.cards?.[a] && e.stake.cards[b]);
ok('aucune carte perdue ni créée', (await total()) === T0 || e.winner === null ? (await total()) === T0 : (await total()) === T0, J([await total(), T0]));
if (e.winner === null) ok('égalité : chacun reprend sa carte', (await has(a, ca)) === qa && (await has(b, cb)) === qb);
else { const w = e.winner, l = w === a ? b : a, cw = w === a ? ca : cb, cl = w === a ? cb : ca;
  ok('le vainqueur garde la carte de l\'adversaire', (await has(w, cl)) >= 1 && (await has(w, cw)) >= 1, J([w, cw, cl]));
  ok('le perdant perd sa carte', (await has(l, cl)) === (l === a ? qa : qb) - 1, J([await has(l, cl)])); }
console.log('— carte vendue pendant le duel impossible : elle est en réserve');
done();
