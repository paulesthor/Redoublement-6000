// Économie de l'événement communiste avec plusieurs joueurs simulés : inscription et taxe, gains plafonnés, boutique, classement, fin et gagnant.
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const N = 10, names = Array.from({ length: N }, (_, i) => 'Camarade' + (i + 1)), tok = {}, uid = {};
for (const n of names) { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); tok[n] = r.token; uid[n] = (await q('SELECT id FROM users WHERE name = ?', n))[0].id; }
await call(null, 'POST', '/api/register', { name: 'Chef', password: 'secret1' }); await q("UPDATE users SET is_admin = 1 WHERE name = 'Chef'"); const [, rl] = await call(null, 'POST', '/api/login', { name: 'Chef', password: 'secret1' }); const ADM = rl.token;
const coins = async n => +(await q('SELECT coins c FROM users WHERE id = ?', uid[n]))[0].c;
for (const n of names) await q('UPDATE users SET coins = 1000 WHERE id = ?', uid[n]);
await q('UPDATE users SET coins = 100 WHERE id = ?', uid.Camarade10);   // trop pauvre pour la taxe

// 1. événement fermé : aucun joueur ne peut entrer ni jouer
let [s] = await call(tok.Camarade1, 'POST', '/api/commu/join', {}); ok('événement fermé : l\'inscription est refusée', s === 403, s);
[s] = await call(tok.Camarade1, 'POST', '/api/commu/earn', { game: 'tsar', ending: 'samovar' }); ok('événement fermé : les gains sont refusés', s === 403, s);
[s] = await call(tok.Camarade1, 'POST', '/api/commu/set', { on: true }); ok('un joueur ne peut pas ouvrir l\'événement', s === 403, s);
let [, v] = await call(tok.Camarade1, 'GET', '/api/commu'); ok('l\'état est lisible : fermé, pas inscrit', v.on === false && v.joined === false && v.tax === 300 && v.startWr === 500, J(v).slice(0, 120));
// 2. ouverture (administrateur) et inscriptions en parallèle, dont des doublons
[s, v] = await call(ADM, 'POST', '/api/commu/set', { on: true, scope: 'all' }); ok('l\'administrateur ouvre l\'événement à tous', s === 200 && v.on === true);
const joins = await Promise.all(names.flatMap(n => [call(tok[n], 'POST', '/api/commu/join', {}), call(tok[n], 'POST', '/api/commu/join', {})]));
const okJ = joins.filter(([st]) => st === 200).length, dup = joins.filter(([st]) => st === 409).length, poor = joins.filter(([st]) => st === 400).length;
ok('inscriptions : 9 réussies, doublons refusés, le joueur trop pauvre refusé', okJ === 9 && poor >= 1 && dup >= 9 && okJ + poor + dup === 20, `réussies ${okJ} · doublons ${dup} · pauvre ${poor}`);
for (const n of names.slice(0, 9)) ok(`${n} : taxe de 300 prélevée une seule fois`, await coins(n) === 700, await coins(n));
ok('le joueur trop pauvre n\'a rien perdu et n\'est pas inscrit', await coins('Camarade10') === 100 && (await call(tok.Camarade10, 'GET', '/api/commu'))[1].joined === false);
[, v] = await call(tok.Camarade1, 'GET', '/api/commu'); ok('cagnotte = 9 × 300, 500 ₽ de départ', v.pot === 2700 && v.wr === 500 && v.players === 9 && v.earned === 0, J(v).slice(0, 140));
// 3. gains : validés et plafonnés côté serveur
const T = tok.Camarade1; const sinceOld = Date.now() - 48 * 3600000;
[s, v] = await call(T, 'POST', '/api/commu/earn', { game: 'tsar', ending: 'inconnue' }); ok('fin inconnue refusée', s === 400, s);
[s] = await call(T, 'POST', '/api/commu/earn', { game: 'poker', x: 1 }); ok('jeu inconnu refusé', s === 400, s);
[s, v] = await call(T, 'POST', '/api/commu/earn', { game: 'tsar', ending: 'samovar' }); ok('Tsar : première fin découverte = 40 ₽', s === 200 && v.gained === 40 && v.first === true, J(v).slice(0, 100));
[s, v] = await call(T, 'POST', '/api/commu/earn', { game: 'tsar', ending: 'train' }); ok('Tsar : deux fins en moins de 20 s : la 2e ne rapporte rien', s === 200 && v.gained === 0, J(v).slice(0, 100));
await q('UPDATE plan_progress SET last_tsar = 0 WHERE user_id = ?', uid.Camarade1); [, v] = await call(T, 'POST', '/api/commu/earn', { game: 'tsar', ending: 'train' }); ok('Tsar : une autre fin découverte = 40 ₽', v.gained === 40);
await q('UPDATE plan_progress SET last_tsar = 0 WHERE user_id = ?', uid.Camarade1); [, v] = await call(T, 'POST', '/api/commu/earn', { game: 'tsar', ending: 'samovar' });
ok('Tsar : une fin déjà vue rapporte moins (8 ₽)', v.gained === 8, J(v).slice(0, 100));
for (let i = 0; i < 10; i++) { await q('UPDATE plan_progress SET last_tsar = 0 WHERE user_id = ?', uid.Camarade1); await call(T, 'POST', '/api/commu/earn', { game: 'tsar', ending: 'late' }); }
[, v] = await call(T, 'GET', '/api/commu'); ok('Tsar : plafond de 100 ₽ par jour respecté', v.today.tsar === 100 && v.earned === v.today.tsar, J(v.today));
// camp : le temps compte (un plan toutes les 3 h au plus) et le plafond aussi
const C2 = tok.Camarade2; [s, v] = await call(C2, 'POST', '/api/commu/earn', { game: 'camp', plans: 5 }); ok('Camp : 5 plans annoncés juste après l\'inscription = rien', s === 200 && v.gained === 0, J(v).slice(0, 100));
await q('UPDATE plan_progress SET joined = ? WHERE user_id = ?', sinceOld, uid.Camarade2);
const campRace = await Promise.all([call(C2, 'POST', '/api/commu/earn', { game: 'camp', plans: 20 }), call(C2, 'POST', '/api/commu/earn', { game: 'camp', plans: 20 })]);
[, v] = await call(C2, 'GET', '/api/commu'); ok('Camp : deux appareils en même temps, pas de double gain, plafond de 250 ₽', campRace.every(([st]) => st === 200) && v.today.camp <= 250 && v.today.camp % 90 === 0 || v.today.camp === 250, J(v.today));
[s] = await call(C2, 'POST', '/api/commu/earn', { game: 'camp', plans: -3 }); ok('Camp : valeur négative refusée', s === 400, s);
// patates : score borné, un quart d'heure ne se rejoue pas à la chaîne
const P3 = tok.Camarade3; [s] = await call(P3, 'POST', '/api/commu/earn', { game: 'potato', score: 99999 }); ok('Patates : score absurde refusé', s === 400, s);
[, v] = await call(P3, 'POST', '/api/commu/earn', { game: 'potato', score: 2000 }); ok('Patates : 2 000 points = 50 ₽', v.gained === 50, J(v).slice(0, 80));
[, v] = await call(P3, 'POST', '/api/commu/earn', { game: 'potato', score: 2000 }); ok('Patates : rejouer tout de suite ne rapporte rien', v.gained === 0, J(v).slice(0, 80));
// 4. boutique
const B = tok.Camarade4; await q('UPDATE plan_progress SET wr = 500 WHERE user_id = ?', uid.Camarade4);
[s, v] = await call(B, 'POST', '/api/commu/buy', { n: 4 }); ok('boutique : 4 colis = 200 ₽', s === 200 && v.wr === 300 && v.packs === 14, J(v).slice(0, 100));
const buys = await Promise.all(Array.from({ length: 6 }, () => call(B, 'POST', '/api/commu/buy', { n: 1 }))); [, v] = await call(B, 'GET', '/api/commu');
ok('boutique : 6 achats simultanés avec 300 ₽ : jamais de solde négatif', v.wr >= 0 && v.wr + (v.packs - 10) * 50 === 500, J(v).slice(0, 100));
[s] = await call(B, 'POST', '/api/commu/buy', { n: 50 }); ok('boutique : quantité absurde refusée', s === 400, s);
[s] = await call(tok.Camarade10, 'POST', '/api/commu/buy', { n: 1 }); ok('boutique : un non-inscrit est refusé', s === 403, s);
// 5. des joueurs aux rythmes différents, puis classement
const totals = { Camarade1: 100, Camarade2: 250, Camarade3: 50, Camarade4: 0, Camarade5: 400, Camarade6: 400, Camarade7: 120, Camarade8: 80, Camarade9: 0 };
await q('UPDATE plan_progress SET earned = 0, earn_ts = 0');
for (const [n, e] of Object.entries(totals)) await q('UPDATE plan_progress SET earned = ?, earn_ts = ? WHERE user_id = ?', e, e === 400 ? (n === 'Camarade5' ? 2000 : 1000) : 5000, uid[n]);
const [, st] = await call(tok.Camarade1, 'GET', '/api/commu/standings');
ok('classement : trié par wikiroubles gagnés, égalité au plus tôt atteint', st.top[0].name === 'Camarade6' && st.top[1].name === 'Camarade5' && st.top[2].name === 'Camarade2', J(st.top.slice(0, 4).map(x => x.name)));
ok('classement : mon rang et la cagnotte', st.myRank === 5 && st.pot === 2700 && st.players === 9, J({ r: st.myRank, p: st.pot }));
[s] = await call(tok.Camarade10, 'GET', '/api/commu/standings'); ok('classement : refusé à un non-inscrit', s === 403, s);
// 6. fin de l'événement
[s] = await call(tok.Camarade6, 'POST', '/api/commu/finish', {}); ok('un joueur ne peut pas clore l\'événement', s === 403, s);
const before6 = await coins('Camarade6'); [s, v] = await call(ADM, 'POST', '/api/commu/finish', {});
ok('fin : Camarade6 gagne (égalité à 400 ₽, atteint le premier)', s === 200 && v.winner?.name === 'Camarade6' && v.winner.prize === 2700, J(v));
ok('fin : la cagnotte de 2 700 est versée au gagnant', await coins('Camarade6') === before6 + 2700);
ok('fin : titre « Staline » et contour doré', (await q("SELECT COUNT(*) n FROM user_titles WHERE user_id = ? AND tid = 'commu_staline'", uid.Camarade6))[0].n === 1 && (await call(tok.Camarade6, 'GET', '/api/commu'))[1].perks.includes('gold_outline'));
ok('fin : un seul gagnant (pas de titre aux autres)', (await q("SELECT COUNT(*) n FROM user_titles WHERE tid = 'commu_staline'"))[0].n === 1);
[s] = await call(ADM, 'POST', '/api/commu/finish', {}); ok('fin : impossible de clore deux fois', s === 409, s);
[s] = await call(tok.Camarade1, 'POST', '/api/commu/earn', { game: 'potato', score: 100 }); ok('après la fin : les gains sont refusés', s === 403, s);
[s] = await call(tok.Camarade1, 'POST', '/api/plan/claim', { id: 1 }); ok('après la fin : on ne réclame plus de palier', s === 403, s);
[s, v] = await call(tok.Camarade1, 'GET', '/api/plan'); ok('après la fin : le joueur inscrit peut toujours voir son Plan', s === 200 && v.milestones.length === 12, s);
[, v] = await call(tok.Camarade1, 'GET', '/api/commu'); ok('après la fin : événement clos', v.on === false && v.done === true && v.pot === 0, J(v).slice(0, 100));
[s] = await call(tok.Camarade10, 'GET', '/api/plan'); ok('un non-inscrit ne voit pas le Plan', s === 403, s);
done();
