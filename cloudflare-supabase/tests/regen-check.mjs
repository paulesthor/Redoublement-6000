// Colis gratuits du Parti : un toutes les 10 minutes, jusqu'à 30, pour chaque joueur inscrit (même s'il n'ouvre rien).
import './api.mjs';
const { call, ok, DB, J, done, settle } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const mkp = async n => { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); return r.token; };
const A = await mkp('Alice'); await DB.prepare("UPDATE users SET is_admin = 1 WHERE name = 'Alice'").run();
const names = ['Just1e', 'Bob', 'Carole']; const T = {};
for (const n of names) { T[n] = await mkp(n); await DB.prepare("UPDATE users SET coins = 1000 WHERE name = ?").bind(n).run(); }
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' });
for (const n of names) await call(T[n], 'POST', '/api/commu/join', {});
const packs = async n => +(await q("SELECT packs FROM plan_progress WHERE user_id = (SELECT id FROM users WHERE name = ?)", n))[0].packs;
const view = async n => (await call(T[n], 'GET', '/api/commu'))[1];
// départ : 10 colis offerts ; on vide le stock de Just1e pour qu'il ne reste qu'un colis
await DB.prepare("UPDATE plan_progress SET packs = 1 WHERE user_id = (SELECT id FROM users WHERE name = 'Just1e')").run();
const v0 = await view('Just1e'); ok('Just1e : 1 colis, compte à rebours en cours', v0.packs === 1 && v0.nextPackIn > 0, J({ p: v0.packs, next: v0.nextPackIn }));
const real = Date.now; let off = 0; Date.now = () => real() + off;
for (const [mins, expect] of [[11, 2], [35, 4], [75, 8]]) {
  off = mins * 60000; const v = await view('Just1e');
  ok(`après ${mins} min sans rien ouvrir : ${expect} colis (1 + une toutes les 10 min)`, v.packs === expect, J({ p: v.packs, next: v.nextPackIn }));
}
// jamais plus de 30
off = 40 * 3600000; ok('plafond : 30 colis au plus', (await view('Just1e')).packs === 30, J(await packs('Just1e')));
// pause : le compte à rebours est gelé, pas perdu
off = 41 * 3600000; await DB.prepare("UPDATE plan_progress SET packs = 1 WHERE user_id = (SELECT id FROM users WHERE name = 'Bob')").run();
await call(A, 'POST', '/api/commu/pause', { paused: true }); const vb = await view('Bob'); ok('en pause : pas de recharge', vb.packs === 1, J(vb.packs));
await call(A, 'POST', '/api/commu/pause', { paused: false }); off = 41 * 3600000 + 25 * 60000; const vb2 = await view('Bob');
ok('après la pause : la recharge reprend', vb2.packs > 1, J({ p: vb2.packs, next: vb2.nextPackIn }));
// un joueur qui n'ouvre jamais l'appli : la recharge est calculée à sa prochaine visite, rien n'est perdu
await DB.prepare("UPDATE plan_progress SET packs = 0 WHERE user_id = (SELECT id FROM users WHERE name = 'Carole')").run(); off += 2 * 3600000;
const vc = await view('Carole'); ok('retour après 2 h : 12 colis d\'un coup', vc.packs >= 12, J(vc.packs));
// échec en cours de recharge : rien n'est perdu (ni colis crédité sans date avancée, ni date avancée sans colis)
const setTs = async (n, minAgo) => DB.prepare("UPDATE event_progress SET n = ? WHERE key = 'cm:packts' AND user_id = (SELECT id FROM users WHERE name = ?)").bind(Math.floor(Date.now() / 1000) - minAgo * 60, n).run();
await DB.prepare("UPDATE plan_progress SET packs = 3 WHERE user_id = (SELECT id FROM users WHERE name = 'Just1e')").run(); await setTs('Just1e', 30); const realBatch = DB.batch; DB.batch = async l => { if (l.some(x => /FOR UPDATE\) = \?/.test(x._sql))) throw new Error('Too many subrequests'); return realBatch.call(DB, l); };
const bad = await call(T['Just1e'], 'GET', '/api/commu'); DB.batch = realBatch;
const after = await view('Just1e'); ok('recharge interrompue : le prochain passage rattrape, aucun colis perdu', after.packs === 6, J({ failStatus: bad[0], packs: after.packs }));
// deux appareils en même temps : un seul crédit
await DB.prepare("UPDATE plan_progress SET packs = 2 WHERE user_id = (SELECT id FROM users WHERE name = 'Bob')").run(); await setTs('Bob', 60);
await Promise.all([call(T['Bob'], 'GET', '/api/commu'), call(T['Bob'], 'GET', '/api/commu'), call(T['Bob'], 'GET', '/api/commu')]);
const pb = await packs('Bob'); ok('trois lectures simultanées : une seule recharge (60 min = 6 colis)', pb === 8, J(pb));
// contrôle et recharge immédiate de tous les joueurs (administrateur)
await DB.prepare("UPDATE plan_progress SET packs = 4 WHERE user_id = (SELECT id FROM users WHERE name = 'Just1e')").run(); await setTs('Just1e', 95);
await DB.prepare("UPDATE plan_progress SET packs = 10 WHERE user_id = (SELECT id FROM users WHERE name = 'Bob')").run(); await setTs('Bob', 25);
await DB.prepare("UPDATE plan_progress SET packs = 30 WHERE user_id = (SELECT id FROM users WHERE name = 'Carole')").run(); await setTs('Carole', 300);
let [s2, chk] = await call(T['Bob'], 'GET', '/api/admin/commu-check'); ok('contrôle réservé à l\'administrateur', s2 === 403);
[s2, chk] = await call(A, 'GET', '/api/admin/commu-check'); const by = n => chk.players.find(p => p.name === n);
ok('contrôle : Just1e en attente de 9 colis, Bob de 2, Carole pleine', s2 === 200 && by('Just1e').due === 9 && by('Bob').due === 2 && by('Carole').flag === 'plein', J(chk.players));
[s2, chk] = await call(A, 'POST', '/api/admin/commu-recharge', {}); ok('recharge de tous : 2 joueurs crédités (la joueuse pleine est ignorée)', s2 === 200 && chk.credited === 2, J(chk));
ok('Just1e 4 + 9 = 13 colis', await packs('Just1e') === 13, J(await packs('Just1e')));
ok('Bob 10 + 2 = 12 colis', await packs('Bob') === 12, J(await packs('Bob')));
ok('Carole reste à 30 (plafond)', await packs('Carole') === 30);
[s2, chk] = await call(A, 'POST', '/api/admin/commu-recharge', {}); ok('deuxième recharge : rien de plus (aucun double crédit)', chk.credited === 0 && await packs('Just1e') === 13 && await packs('Bob') === 12, J(chk));
// cadeau ponctuel : Just1e reçoit 30 colis une seule fois
await DB.prepare("UPDATE plan_progress SET packs = 3 WHERE user_id = (SELECT id FROM users WHERE name = 'Just1e')").run(); await DB.prepare("DELETE FROM settings WHERE key = 'commu_gift_colis-just1e-30'").run();
await call(T['Bob'], 'GET', '/api/commu'); await call(T['Just1e'], 'GET', '/api/commu');
ok('cadeau : Just1e passe à 30 colis', await packs('Just1e') === 30, J(await packs('Just1e')));
await DB.prepare("UPDATE plan_progress SET packs = 12 WHERE user_id = (SELECT id FROM users WHERE name = 'Just1e')").run(); await call(T['Just1e'], 'GET', '/api/commu');
ok('le cadeau n\'est donné qu\'une fois', await packs('Just1e') < 30, J(await packs('Just1e')));
Date.now = real;
done();
