// Calendrier de l'avent : portes, dates, ouverture unique, rattrapage, récompenses.
import './api.mjs';
const { call, ok, DB, J, done, settle } = globalThis.__T;
const { NOEL, DOORS, doorToday } = await import('../src/noel.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const mk = async n => { await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); const [, l] = await call(null, 'POST', '/api/login', { name: n, password: 'secret1' }); return l.token; };
const A = await mk('Alice'); await DB.prepare("UPDATE users SET is_admin = 1 WHERE name = 'Alice'").run(); const B = await mk('Bob');
const bal = async n => (await q("SELECT coins, pack_stock FROM users WHERE name = ?", n))[0];
ok('24 portes, un texte et une récompense chacune', DOORS.length === 24 && DOORS.every(o => o.text.length > 30 && o.coins > 0));
// jour du calendrier selon la date (heure de Paris)
const real = Date.now; const at = iso => { const t = Date.parse(iso); Date.now = () => t; const v = doorToday(); Date.now = real; return v; };
ok('avant le 1er décembre : aucune porte', at('2026-11-30T23:30:00+01:00') === 0);
ok('1er décembre à minuit : porte 1', at('2026-12-01T00:00:30+01:00') === 1);
ok('le 12 : porte 12', at('2026-12-12T15:00:00+01:00') === 12);
ok('le 24 et le 25 : toutes les portes', at('2026-12-24T00:10:00+01:00') === 24 && at('2026-12-25T12:00:00+01:00') === 24);
// événement fermé : rien d'ouvrable
let [s, r] = await call(B, 'GET', '/api/noel'); ok('fermé : l\'état indique que l\'événement n\'est pas ouvert', s === 200 && r.on === false);
[s, r] = await call(B, 'POST', '/api/noel/door', { n: 1 }); ok('fermé : ouverture refusée', s === 403);
[s, r] = await call(B, 'POST', '/api/noel/set', { on: true, scope: 'all' }); ok('seul l\'administrateur règle l\'événement', s === 403);
// test administrateur : aperçu seul
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
[s, r] = await call(B, 'GET', '/api/noel'); ok('mode test : invisible pour les joueurs', r.on === false);
[s, r] = await call(A, 'GET', '/api/noel?day=3'); ok('administrateur : aperçu au jour simulé 3 (portes 2 et 3 ouvrables, la 1 manquée)', r.on && r.today === 3 && r.simulated && r.doors.filter(d => d.openable).map(d => d.n).join() === '2,3' && r.doors[0].missed, J({ today: r.today, sim: r.simulated }));
[s, r] = await call(B, 'GET', '/api/noel?day=20'); ok('un joueur ne peut pas simuler un jour', r.today === 0 && !r.simulated);
// ouvert à tous, avant le 1er décembre : rien n'est ouvrable
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'all' });
[s, r] = await call(B, 'GET', '/api/noel'); ok('ouvert à tous : état visible, aucune porte ouvrable avant le 1er décembre', r.on && r.today === 0 && r.doors.every(d => !d.openable));
[s, r] = await call(B, 'POST', '/api/noel/door', { n: 1 }); ok('porte 1 refusée avant le 1er décembre', s === 403, J(r));
// jour réel : le 5 décembre
Date.now = () => Date.parse('2026-12-05T10:00:00+01:00');
const b0 = await bal('Bob');
[s, r] = await call(B, 'POST', '/api/noel/door', { n: 5 }); ok('porte 5 ouverte le 5', s === 200 && r.reward.coins === DOORS[4].coins && r.text, J(r));
const b1 = await bal('Bob'); ok('récompense créditée (wikibidou et paquets)', +b1.coins === +b0.coins + DOORS[4].coins && +b1.pack_stock === +b0.pack_stock + DOORS[4].packs, J({ b0, b1 }));
[s, r] = await call(B, 'POST', '/api/noel/door', { n: 5 }); ok('une porte ne s\'ouvre qu\'une fois', s === 409);
const b2 = await bal('Bob'); ok('pas de second crédit', +b2.coins === +b1.coins);
[s, r] = await call(B, 'POST', '/api/noel/door', { n: 6 }); ok('porte du lendemain refusée (pas encore ouvrable)', s === 403);
[s, r] = await call(B, 'POST', '/api/noel/door', { n: 4 }); ok('rattrapage : la porte de la veille reste ouvrable (le 5, on peut ouvrir la 4)', s === 200, J(r));
[s, r] = await call(B, 'POST', '/api/noel/door', { n: 3 }); ok('trop tard : la porte d\'avant-hier est perdue (le 5, la 3 est refusée)', s === 403 && /Trop tard/.test(r.error), J(r));
[s, r] = await call(B, 'POST', '/api/noel/door', { n: 1 }); ok('et la porte 1 aussi', s === 403);
[s, r] = await call(B, 'GET', '/api/noel'); ok('2 portes ouvertes ; 1, 2 et 3 marquées manquées ; plus rien d\'ouvrable', r.opened === 2 && r.doors.filter(d => d.missed).map(d => d.n).join() === '1,2,3' && r.doors.every(d => !d.openable), J({ opened: r.opened, missed: r.doors.filter(d => d.missed).map(d => d.n) }));
ok('détails (texte) visibles seulement pour les portes ouvertes', r.doors.filter(d => d.text).length === 2 && !r.doors[5].text);
// on ne se connecte que le 7 : la porte 6 (veille) s'ouvre, la 5 est déjà prise
Date.now = () => Date.parse('2026-12-07T09:00:00+01:00');
[s, r] = await call(B, 'GET', '/api/noel'); ok('le 7 : ouvrables = 6 et 7', r.doors.filter(d => d.openable).map(d => d.n).join() === '6,7', J(r.doors.filter(d => d.openable).map(d => d.n)));
[s, r] = await call(B, 'POST', '/api/noel/door', { n: 6 }); ok('le 7 : la porte 6 (veille) s\'ouvre', s === 200);
Date.now = () => Date.parse('2026-12-05T10:00:00+01:00');
// deux requêtes simultanées sur la même porte : un seul crédit
const b3 = await bal('Bob'); await Promise.all([call(B, 'POST', '/api/noel/door', { n: 5 }), call(B, 'POST', '/api/noel/door', { n: 5 })]); ok('double clic : aucun crédit en plus', +(await bal('Bob')).coins === +b3.coins);
const c0 = await bal('Alice'); await Promise.all([call(A, 'POST', '/api/noel/door', { n: 1, day: 1 }), call(A, 'POST', '/api/noel/door', { n: 1, day: 1 }), call(A, 'POST', '/api/noel/door', { n: 1, day: 1 })]);
ok('trois ouvertures simultanées de la même porte : un seul crédit', +(await bal('Alice')).coins === +c0.coins + DOORS[0].coins, J({ c0, c1: await bal('Alice') }));
// après la fin
Date.now = () => NOEL.END + 3600000; [s, r] = await call(B, 'POST', '/api/noel/door', { n: 10 }); ok('après la fin : plus d\'ouverture pour les joueurs', s === 403);
Date.now = real;
done();
