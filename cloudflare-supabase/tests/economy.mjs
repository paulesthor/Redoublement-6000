// Bourse, plus ou moins, cours et alertes, banque, dividendes, expéditions.
import './api.mjs';
const { call, settle, ok, DB, J, done, env, ctx, worker } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const { dayKey } = await import('../src/game.js');
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
for (let i = 0; i < 4; i++) { await call(A, 'POST', '/api/packs/open', {}); await call(B, 'POST', '/api/packs/open', {}); } await settle();
const [alice, bob] = (await q('SELECT id FROM users ORDER BY id')).map(x => x.id);
await q('UPDATE users SET coins = 10000');
const coins = async id => (await q('SELECT coins FROM users WHERE id = ?', id))[0].coins;
const realNow = Date.now; let shift = 0; Date.now = () => realNow() + shift;

console.log('— bourse (paris sur les vues Wikipédia)');
[s, r] = await call(A, 'GET', '/api/bourse'); ok('marché du jour : 12 titres avec 7 jours de vues', s === 200 && r.market.length === 12 && r.market.every(m => m.series.length === 7 && m.ref > 0), J(r).slice(0, 200));
const mk = r.market; ok('marché identique pour tous', J((await call(B, 'GET', '/api/bourse'))[1].market.map(m => m.id)) === J(mk.map(m => m.id)));
const c0 = await coins(alice);
[s, r] = await call(A, 'POST', '/api/bourse/bet', { slot: mk[0].slot, dir: 'up', stake: 100 }); ok('pari à la hausse', s === 200 && (await coins(alice)) === c0 - 100, J([s, r]));
[s, r] = await call(A, 'POST', '/api/bourse/bet', { slot: mk[0].slot, dir: 'down', stake: 100 }); ok('un seul pari par titre et par jour', s === 400 && (await coins(alice)) === c0 - 100, J([s, r]));
[s, r] = await call(A, 'POST', '/api/bourse/bet', { slot: mk[1].slot, dir: 'down', stake: 100 }); ok('pari à la baisse', s === 200);
[s, r] = await call(A, 'POST', '/api/bourse/bet', { slot: mk[2].slot, dir: 'up', stake: 5 }); ok('mise trop basse', s === 400);
[s, r] = await call(A, 'POST', '/api/bourse/bet', { slot: mk[2].slot, dir: 'up', stake: 9999 }); ok('mise trop haute', s === 400);
[s, r] = await call(A, 'POST', '/api/bourse/bet', { slot: mk[2].slot, dir: 'x', stake: 50 }); ok('direction invalide', s === 400);
[s, r] = await call(A, 'POST', '/api/bourse/bet', { slot: 99, dir: 'up', stake: 50 }); ok('titre inconnu', s === 404);
[s, r] = await call(B, 'POST', '/api/bourse/bet', { slot: mk[0].slot, dir: 'down', stake: 200 }); [s, r] = await call(B, 'POST', '/api/bourse/bet', { slot: mk[2].slot, dir: 'up', stake: 50 });
for (let i = 3; i < 9; i++) await call(A, 'POST', '/api/bourse/bet', { slot: mk[i].slot, dir: 'up', stake: 50 });
[s, r] = await call(A, 'POST', '/api/bourse/bet', { slot: mk[9].slot, dir: 'up', stake: 50 }); ok('au plus 8 paris par jour', s === 400 && /Maximum 8/.test(r.error), J([s, r]));
[s, r] = await call(A, 'GET', '/api/bourse'); ok('mes paris affichés', r.market.filter(m => m.bet).length === 8 && r.left === 0);
// règlement le lendemain : le titre 0 monte (au-dessus de la référence), le titre 1 monte aussi (donc mon pari « baisse » est perdu), le titre 2 reste identique
const day0 = dayKey(); const chosen = new Map(mk.map(m => [m.title, m]));
globalThis.__PV = (title, day) => { const m = chosen.get(title); if (!m || day !== day0) return undefined; return m.slot === 2 ? m.ref : m.slot === 0 || m.slot === 1 ? m.ref * 2 : m.ref; };
shift += 86400000; await call(A, 'GET', '/api/me'); [s, r] = await call(A, 'GET', '/api/bourse'); await settle();
const a1 = await q('SELECT slot, dir, stake, payout, settled FROM bourse_bets WHERE user_id = ? AND day = ? ORDER BY slot', alice, day0);
ok('pari gagné : 1,8 × la mise', a1.find(b => b.slot === mk[0].slot).payout === 180, J(a1.slice(0, 3)));
ok('pari perdu : rien', a1.find(b => b.slot === mk[1].slot).payout === 0);
ok('tous les paris réglés', a1.every(b => b.settled === 1));
const b1 = await q('SELECT slot, payout FROM bourse_bets WHERE user_id = ? AND day = ? ORDER BY slot', bob, day0); ok('stable : mise rendue', b1.find(b => b.slot === mk[2].slot).payout === 50 && b1.find(b => b.slot === mk[0].slot).payout === 0, J(b1));
[s, r] = await call(A, 'GET', '/api/bourse'); ok('historique des paris', r.past.length >= 3 && r.past.some(p => p.result === 'won') && r.past.some(p => p.result === 'lost'), J(r.past.slice(0, 2)));
ok('pas de double paiement', (await q("SELECT COUNT(*) n FROM bourse_market WHERE status = 'open' AND day = ?", day0))[0].n === 0);
// l'API des vues en panne : pas de marché, pas d'erreur
shift += 86400000; globalThis.__PV_FAIL = true; [s, r] = await call(A, 'GET', '/api/bourse'); ok('API des vues en panne : marché vide, pas d\'erreur', s === 200 && r.market.length === 0, J([s, r]).slice(0, 120));
globalThis.__PV_FAIL = false; globalThis.__PV = undefined;

console.log('— plus ou moins');
[s, r] = await call(A, 'GET', '/api/hilo'); ok('état initial', s === 200 && r.active === false && r.perDay === 2 && r.table[0] === 1.85, J(r));
{ const regs = []; for (const nm of ['MicheleCestLeBresil', 'Michele_cestlebresil']) { const [st, rr] = await call(null, 'POST', '/api/register', { name: nm, password: 'secret7' }); regs.push(rr.token); }
  for (const T of regs) { const [s1, r1] = await call(T, 'GET', '/api/hilo'); const [s2, r2] = await call(T, 'POST', '/api/hilo/start', { stake: 50 }); const [s3] = await call(T, 'POST', '/api/hilo/guess', { guess: 'more' }); const [s4] = await call(T, 'POST', '/api/hilo/cashout', {});
    ok('Plus ou moins bloqué pour ce pseudo (casse et séparateurs ignorés) : message « T\'avais qu\'à pas tricher »', s1 === 200 && r1.blocked === true && /pas tricher/.test(r1.message) && s2 === 403 && /pas tricher/.test(r2.error) && s3 === 403 && s4 === 403, J([s1, r1, s2, r2])); }
  ok('les autres joueurs ne sont pas bloqués', (await call(A, 'GET', '/api/hilo'))[1].blocked === undefined); }
[s, r] = await call(A, 'POST', '/api/hilo/start', { stake: 5 }); ok('mise trop basse', s === 400);
const h0 = await coins(alice); [s, r] = await call(A, 'POST', '/api/hilo/start', { stake: 100 }); ok('partie lancée, mise prélevée, vues de B cachées', s === 200 && r.active && r.a.v > 0 && r.b.v === undefined && (await coins(alice)) === h0 - 100, J(r));
[s] = await call(A, 'POST', '/api/hilo/start', { stake: 100 }); ok('une seule partie à la fois', s === 400);
[s] = await call(A, 'POST', '/api/hilo/cashout', {}); ok('encaisser sans avoir répondu : refusé', s === 400);
// on triche côté test : la paire est lue en base pour deviner juste
let wins = 0;
for (let i = 0; i < 3; i++) {
  const g = (await q('SELECT pair FROM hilo_games WHERE user_id = ?', alice))[0], p = JSON.parse(g.pair);
  [s, r] = await call(A, 'POST', '/api/hilo/guess', { guess: p.b.v > p.a.v ? 'more' : 'less' }); if (s === 200 && r.right) wins++;
}
ok('3 bonnes réponses : série de 3, multiplicateur ×1,85³', wins === 3 && r.streak === 3 && r.mult === 6.33 && r.cash === 633, J(r));
const cb = await coins(alice); [s, r] = await call(A, 'POST', '/api/hilo/cashout', {}); ok('encaissement : 633', s === 200 && r.cashed === 633 && (await coins(alice)) === cb + 633, J([s, r]));
await call(A, 'POST', '/api/hilo/start', { stake: 50 }); { const p = JSON.parse((await q('SELECT pair FROM hilo_games WHERE user_id = ?', alice))[0].pair); [s, r] = await call(A, 'POST', '/api/hilo/guess', { guess: p.b.v > p.a.v ? 'less' : 'more' }); }
ok('mauvaise réponse : mise perdue, partie terminée, valeurs révélées', r.right === false && r.reveal.v > 0 && (await q('SELECT active FROM hilo_games WHERE user_id = ?', alice))[0].active === 0, J(r));
[s] = await call(A, 'POST', '/api/hilo/guess', { guess: 'more' }); ok('plus de partie en cours', s === 400);
for (let i = 0; i < 1; i++) { await call(A, 'POST', '/api/hilo/start', { stake: 10 }); await q('UPDATE hilo_games SET active = 0 WHERE user_id = ?', alice); }
[s, r] = await call(A, 'POST', '/api/hilo/start', { stake: 10 }); ok('2 parties par jour au maximum', s === 400 && /Maximum 2/.test(r.error), J([s, r]));
{ // compte à rebours du « Plus ou moins »
  const [, rt] = await call(null, 'POST', '/api/register', { name: 'Chrono', password: 'secret5' }); const T = rt.token; await q('UPDATE users SET coins = 5000 WHERE name = ?', 'Chrono');
  let [s1, r1] = await call(T, 'POST', '/api/hilo/start', { stake: 50 });
  ok('manche chronométrée : 15 secondes pour répondre', s1 === 200 && r1.timeMax === 15000 && r1.left > 14000 && r1.left <= 15000, J(r1));
  [s1, r1] = await call(T, 'POST', '/api/hilo/guess', { guess: 'timeout' }); ok('« temps écoulé » refusé tant que le temps n\'est pas écoulé', s1 === 400, J([s1, r1]));
  shift += 20000; [s1, r1] = await call(T, 'POST', '/api/hilo/guess', { guess: 'timeout' }); ok('temps écoulé : manche perdue, mise perdue', s1 === 200 && r1.right === false && r1.timeout === true && r1.lost === 50, J([s1, r1]));
  [s1, r1] = await call(T, 'GET', '/api/hilo'); ok('partie terminée après le temps écoulé', r1.active === undefined || r1.active === false);
  await q('UPDATE hilo_games SET day = ?, plays = 0 WHERE user_id = (SELECT id FROM users WHERE name = ?)', '2000-01-01', 'Chrono');
  [s1, r1] = await call(T, 'POST', '/api/hilo/start', { stake: 50 }); shift += 30000;
  const pr = (await q('SELECT pair FROM hilo_games WHERE user_id = (SELECT id FROM users WHERE name = ?)', 'Chrono'))[0].pair, pj = JSON.parse(pr);
  [s1, r1] = await call(T, 'POST', '/api/hilo/guess', { guess: pj.b.v > pj.a.v ? 'more' : 'less' }); ok('bonne réponse envoyée après la fin du temps : perdue quand même', s1 === 200 && r1.right === false && r1.timeout === true, J([s1, r1]));
  await q('UPDATE hilo_games SET day = ?, plays = 0 WHERE user_id = (SELECT id FROM users WHERE name = ?)', '2000-01-01', 'Chrono');
  [s1, r1] = await call(T, 'POST', '/api/hilo/start', { stake: 50 }); const pj2 = JSON.parse((await q('SELECT pair FROM hilo_games WHERE user_id = (SELECT id FROM users WHERE name = ?)', 'Chrono'))[0].pair);
  [s1, r1] = await call(T, 'POST', '/api/hilo/guess', { guess: pj2.b.v > pj2.a.v ? 'more' : 'less' }); ok('bonne réponse dans le temps : la manche suivante repart à 15 secondes', s1 === 200 && r1.right === true && r1.left > 14000, J([s1, r1]));
}

console.log('— cours des cartes, tendances, alertes');
const card = (await q('SELECT card_id FROM inventory WHERE user_id = ? LIMIT 1', alice))[0].card_id;
for (const p of [10, 12, 11, 30]) await q('INSERT INTO sales (card_id, price, ts) VALUES (?,?,?)', card, p, Date.now());
[s, r] = await call(A, 'GET', `/api/cards/${card}/prices`); ok('historique de prix', s === 200 && r.sales.length === 4 && r.last === 30 && r.max === 30 && r.min === 10, J(r));
[s, r] = await call(A, 'GET', '/api/trends'); ok('tendances : la carte à 30 est en hausse', r.up.some(c => c.id === card && c.pct > 100 && c.series.length === 4), J(r.up).slice(0, 200));
[s] = await call(A, 'POST', '/api/alerts', { card_id: card, dir: 'up', price: 50 }); ok('alerte créée', s === 200);
[s] = await call(A, 'POST', '/api/alerts', { card_id: card, dir: 'up', price: -3 }); ok('alerte invalide refusée', s === 400);
[s, r] = await call(A, 'GET', '/api/trends'); ok('mes alertes listées', r.alerts.length === 1);
{ const { __testHooks } = await import('../src/index.js'); }
await q('UPDATE inventory SET qty = 2 WHERE user_id = ? AND card_id = ?', alice, card);
// une vente à 60 déclenche l'alerte « ≥ 50 »
await call(A, 'POST', '/api/auctions', { card_id: card, price: 60, minutes: 1 }); const aid = (await q('SELECT id FROM auctions ORDER BY id DESC LIMIT 1'))[0].id;
await call(B, 'POST', `/api/auctions/${aid}/bid`, { amount: 60 }); await q('UPDATE auctions SET ends_at = ? WHERE id = ?', Date.now() - 1000, aid);
const sock = { log: [], send(d) { this.log.push(JSON.parse(d)); } }; const lob = globalThis.__T.lobby; lob.clients.set(alice, new Set([sock]));
await call(A, 'GET', '/api/auctions'); await settle(); await settle();
ok('vente à 60 : alerte « ≥ 50 » déclenchée puis retirée', sock.log.some(m => m.t === 'notify' && /Alerte prix/.test(m.msg)) && (await q('SELECT COUNT(*) n FROM price_alerts WHERE user_id = ?', alice))[0].n === 0, J(sock.log.filter(m => m.t === 'notify')));
lob.clients.delete(alice);

console.log('— banque et épargne');
[s, r] = await call(A, 'GET', '/api/bank'); ok('banque : épargne vide, plafond 5000', s === 200 && r.savings.amount === 0 && r.savings.cap === 5000, J(r.savings));
[s] = await call(A, 'POST', '/api/bank/deposit', { amount: 6000 }); ok('au-dessus du plafond : refusé', s === 400);
[s] = await call(A, 'POST', '/api/bank/deposit', { amount: -5 }); ok('montant négatif refusé', s === 400);
const e0 = await coins(alice); [s, r] = await call(A, 'POST', '/api/bank/deposit', { amount: 1000 }); ok('dépôt de 1000', s === 200 && (await coins(alice)) === e0 - 1000 && r.amount === 1000);
[s, r] = await call(A, 'POST', '/api/bank/withdraw', { amount: 400 }); ok('retrait anticipé : 10 % de frais', s === 200 && r.fee === 40 && r.received === 360 && r.amount === 600, J(r));
shift += 10 * 86400000; [s, r] = await call(A, 'GET', '/api/bank'); const exp = Math.floor(600 * Math.pow(1.006, 10)); ok('10 jours plus tard : intérêts composés de 0,6 % par jour', r.savings.amount === exp && r.savings.interest === exp - 600, J(r.savings));
const e1 = await coins(alice); [s, r] = await call(A, 'POST', '/api/bank/withdraw', { amount: exp }); ok('retrait après 7 jours : sans frais, intérêts compris', s === 200 && r.fee === 0 && r.received === exp && (await coins(alice)) === e1 + exp, J(r));
[s] = await call(A, 'POST', '/api/bank/withdraw', { amount: 10 }); ok('rien à retirer', s === 400);

console.log('— dividendes de collection');
await q('UPDATE users SET div_day = NULL WHERE id = ?', alice);
[s, r] = await call(A, 'GET', '/api/bank'); const dv = r.dividends; ok('dividendes calculés d\'après la collection', dv.daily > 0 && dv.days === 1 && dv.claimable === dv.daily, J(dv));
await q('UPDATE inventory SET lvl = 3 WHERE user_id = ? AND rar = (SELECT MAX(rar) FROM inventory WHERE user_id = ?)', alice, alice);
[s, r] = await call(A, 'GET', '/api/bank'); ok('la fusion augmente les dividendes', r.dividends.daily >= dv.daily, [dv.daily, r.dividends.daily]);
const d0 = await coins(alice); [s, r] = await call(A, 'POST', '/api/bank/dividends/claim', {}); ok('dividendes récupérés', s === 200 && r.got > 0 && (await coins(alice)) === d0 + r.got, J(r));
[s] = await call(A, 'POST', '/api/bank/dividends/claim', {}); ok('une seule fois par jour', s === 400);
shift += 5 * 86400000; [s, r] = await call(A, 'GET', '/api/bank'); ok('jours manqués cumulés (3 au maximum)', r.dividends.days === 3 && r.dividends.claimable === r.dividends.daily * 3, J(r.dividends));

console.log('— expéditions');
const spare = (await call(A, 'GET', '/api/expeditions/spare'))[1].cards; 
await q('UPDATE inventory SET qty = 6 WHERE user_id = ? AND card_id IN (SELECT card_id FROM inventory WHERE user_id = ? AND sh = 0 ORDER BY card_id LIMIT 2)', alice, alice);
const sp = (await call(A, 'GET', '/api/expeditions/spare'))[1].cards; ok('doublons disponibles (un exemplaire reste toujours à la maison)', sp.length >= 2 && sp.every(c => c.spare >= 1), J(sp).slice(0, 150));
{ const RK = ['common', 'uncommon', 'rare', 'super', 'ultra', 'legendary']; ok('doublons triés du plus rare au moins rare', sp.every((c, k) => !k || RK.indexOf(sp[k - 1].rarity) >= RK.indexOf(c.rarity)), J(sp.map(c => c.rarity))); }
const c1 = sp[0], q0 = (await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', alice, c1.id))[0].qty;
[s, r] = await call(A, 'POST', '/api/expeditions/start', { hours: 3, cards: [{ id: c1.id, n: 1 }] }); ok('durée inconnue refusée', s === 400);
[s, r] = await call(A, 'POST', '/api/expeditions/start', { hours: 1, cards: [{ id: c1.id, n: c1.spare + 1 }] }); ok('on ne peut pas envoyer le dernier exemplaire', s === 400 && (await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', alice, c1.id))[0].qty === q0);
[s, r] = await call(A, 'POST', '/api/expeditions/start', { hours: 1, cards: [] }); ok('aucune carte : refusé', s === 400);
[s, r] = await call(A, 'POST', '/api/expeditions/start', { hours: 1, cards: [{ id: c1.id, n: 2 }] }); ok('expédition de 1 h lancée, 2 exemplaires partis', s === 200 && (await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', alice, c1.id))[0].qty === q0 - 2, J([s, r]));
[s, r] = await call(A, 'GET', '/api/expeditions'); const ex = r.active[0]; ok('expédition en cours, pas encore prête', r.active.length === 1 && ex.ready === false && ex.rc === null, J(r.active));
[s] = await call(A, 'POST', `/api/expeditions/${ex.id}/collect`, {}); ok('trop tôt : refusé', s === 400);
[s] = await call(A, 'POST', '/api/expeditions/start', { hours: 8, cards: [{ id: sp[1].id, n: 1 }] }); [s] = await call(A, 'POST', '/api/expeditions/start', { hours: 8, cards: [{ id: sp[1].id, n: 1 }] }); ok('2 expéditions en même temps au maximum', s === 400);
shift += 2 * 3600000; [s, r] = await call(A, 'GET', '/api/me'); ok('/me : pastille « expédition prête »', r.ex === 1, r.ex);
[s, r] = await call(A, 'GET', '/api/expeditions'); ok('expédition prête, gain connu', r.active.find(x => x.id === ex.id).ready && r.active.find(x => x.id === ex.id).rc >= 0);
const x0 = await coins(alice); [s, r] = await call(A, 'POST', `/api/expeditions/${ex.id}/collect`, {}); ok('retour : pièces créditées et exemplaires rendus', s === 200 && r.cards === 2 && (await coins(alice)) === x0 + r.coins && (await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', alice, c1.id))[0].qty === q0, J(r));
[s] = await call(A, 'POST', `/api/expeditions/${ex.id}/collect`, {}); ok('récupérable une seule fois', s === 404 || s === 400);
[s] = await call(B, 'POST', `/api/expeditions/${ex.id}/collect`, {}); ok('expédition d\'un autre joueur : introuvable', s === 404);
{ const cid = (await q('SELECT id FROM cards ORDER BY id DESC LIMIT 1'))[0].id;
  await q('DELETE FROM inventory WHERE user_id = ? AND card_id = ?', alice, cid);
  await DB.prepare("INSERT INTO inventory (user_id, card_id, qty, acquired) VALUES (?,?,1,?)").bind(alice, cid, 1700000000000).run();
  await DB.prepare('DELETE FROM inventory WHERE user_id = ? AND card_id = ?').bind(alice, cid).run();
  ok('historique : carte vendue = toujours « déjà possédée »', (await q('SELECT ts FROM card_seen WHERE user_id = ? AND card_id = ?', alice, cid)).length === 1);
  [s, r] = await call(A, 'GET', '/api/leaderboard'); ok('classement sans pièces', s === 200 && r.players.every(p => p.coins === undefined), J(r.players?.[0])); }
Date.now = realNow;
done();
