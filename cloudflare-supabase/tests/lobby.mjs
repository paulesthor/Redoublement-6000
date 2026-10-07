// Combat de cartes complet (Durable Object Lobby) contre PostgreSQL : deux joueurs, 6 tours, 18 questions, récompenses.
import './api.mjs';
const { call, settle, ok, DB, lobby, done, J } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
class Sock { constructor() { this.log = []; this.open = true; } send(d) { if (this.open) this.log.push(JSON.parse(d)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
for (let i = 0; i < 2; i++) { await call(A, 'POST', '/api/packs/open', {}); await call(B, 'POST', '/api/packs/open', {}); }
await settle();
const ids = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id), [a, b] = ids;
const deck = async uid => (await q('SELECT card_id FROM inventory WHERE user_id = ? ORDER BY skey DESC LIMIT 3', uid)).map(x => x.card_id);
const users = { [a]: { id: a, name: 'Alice' }, [b]: { id: b, name: 'Bob' } };
const socks = { [a]: new Sock(), [b]: new Sock() };
for (const id of ids) { lobby.clients.set(id, new Set([socks[id]])); }
const say = (uid, m) => lobby.onMessage(users[uid], m);
const last = (s, t) => [...s.log].reverse().find(m => m.t === t);
const types = s => s.log.map(m => m.t);
const coins = async id => (await q('SELECT coins, duel_wins w, duel_losses l FROM users WHERE id = ?', id))[0];
const c0 = [await coins(a), await coins(b)];
console.log('— combat de cartes (temps réel, ≈ 1 à 2 minutes)');
await say(a, { t: 'challenge', to: b, mode: 'battle' }); await say(b, { t: 'accept', from: a, mode: 'battle' });
const bid = () => [...lobby.battles.keys()][0];
const dA = await deck(a); const base0 = (await q('SELECT atk, def, rarity FROM cards WHERE id = ?', dA[0]))[0]; await q('UPDATE inventory SET lvl = 2 WHERE user_id = ? AND card_id = ?', a, dA[0]);
await say(a, { t: 'pick', id: bid(), cards: dA }); await say(b, { t: 'pick', id: bid(), cards: await deck(b) });
const id = bid(); ok('combat créé', !!id);
await sleep(800); { const { FUSE } = await import('../src/game.js'); const fc = lobby.battles.get(id)?.fight?.deck[a]?.find(c => c.id === dA[0]); const rr = ['common','uncommon','rare','super','ultra','legendary'].indexOf(base0.rarity); ok('combat : le niveau de fusion s\'applique aux stats', fc && fc.lvl === 2 && fc.atk === base0.atk + FUSE.bonus[rr] * 2, J([fc, base0])); }
const end = Date.now() + 240000;
let f;
while (lobby.battles.has(id) && Date.now() < end) {
  f = lobby.battles.get(id)?.fight;
  if (f?.attacker && !f.cur && lobby.clients.has(f.attacker)) { const left = [...f.left[f.attacker]]; if (left.length) await say(f.attacker, { t: 'bf_pick', id, card: left[0] }); }
  if (f?.cur && f.cur.k >= 0 && f.cur.k < 3 && !f.cur.closed && f.cur.choice === undefined) await say(f.defender, { t: 'bf_answer', id, choice: f.cur.qs[f.cur.k].answer });
  await sleep(150);
}
await settle();
for (let i = 0; i < 400 && !last(socks[a], 'bf_end'); i++) await sleep(100);   // le résultat part après le versement des récompenses (base lente : on attend)
const e = last(socks[a], 'bf_end');
ok('combat terminé normalement', e && e.forfeit === null && !lobby.battles.has(id), J(e)?.slice(0, 200));
ok('6 tours et 18 questions', types(socks[a]).filter(t => t === 'bf_turn').length === 6 && types(socks[a]).filter(t => t === 'bf_q').length === 18, J(types(socks[a]).filter(t => t.startsWith('bf_')).slice(-8)));
ok('aucun message d\'erreur', !types(socks[a]).includes('bf_error') && !types(socks[a]).includes('error'), J(socks[a].log.filter(m => /error/.test(m.t))));
const c1 = [await coins(a), await coins(b)];
ok('récompenses versées', c1[0].coins > c0[0].coins || c1[1].coins > c0[1].coins, J([c0, c1]));
const ev = await q('SELECT kind FROM fight_events'); ok('journal des combats écrit', ev.length >= 2, J(ev));
const left = await q('SELECT COUNT(*) n FROM fight_events WHERE kind = ?', 'erreur'); ok('aucune erreur dans le journal', +left[0].n === 0, J(left));
console.log('— duel de quiz');
socks[a].log.length = 0; socks[b].log.length = 0;
await say(a, { t: 'challenge', to: b, mode: 'quiz' }); await say(b, { t: 'accept', from: a, mode: 'quiz' });
const dend = Date.now() + 120000; let answered = 0;
while (Date.now() < dend && !last(socks[a], 'duel_end')) {
  for (const uid of [a, b]) { const qm = last(socks[uid], 'question'); if (qm && (qm.n ?? 0) > (socks[uid].done ?? 0) ) { socks[uid].done = qm.n; await say(uid, { t: 'answer', id: qm.id ?? [...lobby.duels.keys()][0], choice: 0 }); answered++; } }
  await sleep(100);
}
ok('duel de quiz terminé', !!last(socks[a], 'duel_end'), J(types(socks[a])));
ok('5 questions posées', types(socks[a]).filter(t => t === 'question').length === 5, J(types(socks[a])));
done();
