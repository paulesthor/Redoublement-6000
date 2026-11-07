// Événement ouvert en test réel : visible et jouable seulement par l'administrateur, avec le vrai parcours (taxe, 500 ₽, paliers vierges).
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
let [, r] = await call(null, 'POST', '/api/register', { name: 'Chef', password: 'secret1' }); const ADM = r.token;
[, r] = await call(null, 'POST', '/api/register', { name: 'Simple', password: 'secret2' }); const SIM = r.token;
await q("UPDATE users SET is_admin = 1, coins = 1000 WHERE name = 'Chef'"); await q("UPDATE users SET coins = 1000 WHERE name = 'Simple'");
const coins = async n => +(await q('SELECT coins c FROM users WHERE name = ?', n))[0].c;
// 1. aperçu administrateur (événement fermé) : accès gratuit
let [s, v] = await call(ADM, 'GET', '/api/plan'); ok('fermé : l\'administrateur voit son Plan (aperçu gratuit)', s === 200 && v.milestones.length === 12);
[, v] = await call(ADM, 'POST', '/api/plan/earn', { amount: 500 }); ok('fermé : il peut jouer l\'aperçu', v.earned === 500);
// 2. ouverture en test réel
[s, v] = await call(ADM, 'POST', '/api/commu/set', { on: true }); ok('ouverture en test (portée administrateur)', s === 200 && v.on === true);
[, v] = await call(SIM, 'GET', '/api/commu'); ok('un joueur ordinaire ne voit pas l\'événement ouvert', v.on === false && v.joined === false);
[s] = await call(SIM, 'POST', '/api/commu/join', {}); ok('un joueur ordinaire ne peut pas s\'inscrire', s === 403, s);
[s] = await call(SIM, 'GET', '/api/plan'); ok('ni voir le Plan', s === 403, s);
[, v] = await call(ADM, 'GET', '/api/commu'); ok('l\'administrateur voit l\'événement ouvert et n\'est PAS encore inscrit', v.on === true && v.joined === false, J(v).slice(0, 140));
[s] = await call(ADM, 'POST', '/api/commu/earn', { game: 'tsar', ending: 'samovar' }); ok('inscription obligatoire pour jouer', s === 403, s);
// 3. vrai parcours : taxe de 300, 500 ₽ de départ, paliers vierges
const c0 = await coins('Chef'); [s, v] = await call(ADM, 'POST', '/api/commu/join', {}); ok('inscription réelle : 300 wikibidou prélevés', s === 200 && await coins('Chef') === c0 - 300, await coins('Chef'));
[, v] = await call(ADM, 'GET', '/api/commu'); ok('état : inscrit, 500 ₽, aperçu effacé, cagnotte 300', v.joined && v.wr === 500 && v.earned === 0 && v.pot === 300 && v.players === 1, J(v).slice(0, 160));
[s] = await call(ADM, 'POST', '/api/commu/join', {}); ok('on ne s\'inscrit pas deux fois', s === 409, s);
[, v] = await call(ADM, 'POST', '/api/commu/earn', { game: 'tsar', ending: 'samovar' }); ok('gain réel du Tsar : 40 ₽', v.gained === 40 && v.wr === 540, J(v).slice(0, 100));
[, v] = await call(ADM, 'GET', '/api/plan'); ok('Plan : paliers vierges, 40 ₽ gagnés', v.earned === 40 && v.claimed.length === 0);
[s] = await call(ADM, 'POST', '/api/plan/earn', { amount: 100 }); ok('la démo (+₽ gratuits) reste possible pour l\'administrateur', s === 200);
// 4. fin : le gagnant est le seul inscrit réel
[s, v] = await call(ADM, 'POST', '/api/commu/finish', {}); ok('fin : l\'administrateur remporte la cagnotte de 300', s === 200 && v.winner?.name === 'Chef' && v.winner.prize === 300, J(v));
[, v] = await call(ADM, 'GET', '/api/commu'); ok('événement clos', v.on === false && v.done === true);
// 5. ouverture à tous : le joueur ordinaire peut alors entrer
await call(ADM, 'POST', '/api/commu/set', { on: true, scope: 'all' }); [, v] = await call(SIM, 'GET', '/api/commu'); ok('ouvert à tous : le joueur le voit', v.on === true);
[s] = await call(SIM, 'POST', '/api/commu/join', {}); ok('et peut s\'inscrire', s === 200, s);
done();
