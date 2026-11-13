// Boules de neige de Noël : physique déterministe, essais limités, score rejoué par le serveur, flocons créditées une fois.
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
await import('../src/noel.js');
const P = globalThis.SnowPhys;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const mk = async n => { await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); const [, l] = await call(null, 'POST', '/api/login', { name: n, password: 'secret1' }); return l.token; };
const A = await mk('Alice'); await DB.prepare("UPDATE users SET is_admin = 1 WHERE name = 'Alice'").run(); const B = await mk('Bob');

// physique : mêmes entrées, mêmes sorties ; niveaux stables
const L = P.level(7), L2 = P.level(7);
ok('niveau stable pour un numéro donné', J(L) === J(L2) && P.level(1).targets.length === 2 && P.level(24).targets.length === 5);
const a1 = P.play(L, [[60, 50], [70, 40], [50, 60]]), a2 = P.play(L, [[60, 50], [70, 40], [50, 60]]);
ok('rejeu identique', J(a1) === J(a2));

// un tir qui touche : on cherche par force brute pour avoir un vrai lancer gagnant au niveau 1
const lv1 = P.level(1); let win = null;
for (let px = 20; px <= 100 && !win; px++) for (let py = 0; py <= 100 && !win; py++) { if (px * px + py * py > 1e4) continue; const r = P.throwBall(lv1, { hp: lv1.targets.map(t => t.hp) }, 0, px, py); if (r.down) win = [px, py]; }
ok('un tir gagnant existe au niveau 1', !!win, J(win));

// serveur : événement fermé, puis test admin
Date.now = () => Date.parse('2026-12-05T10:00:00+01:00');
let [s, r] = await call(B, 'GET', '/api/noel/snow'); ok('fermé : refusé', s === 403);
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'all' });
[s, r] = await call(B, 'GET', '/api/noel/snow'); ok('niveau du jour = 5', s === 200 && r.n === 5 && r.used === 0 && r.level.n === 5, J(r).slice(0, 120));
[s, r] = await call(B, 'GET', '/api/noel/snow?n=3'); ok('niveau d\'avant-hier refusé', s === 403);
[s, r] = await call(B, 'POST', '/api/noel/snow/submit', { n: 5, a: 1, throws: [[50, 50]] }); ok('envoi sans essai commencé refusé', s === 400);
[s, r] = await call(B, 'POST', '/api/noel/snow/start', { n: 5 }); ok('essai 1 commencé', s === 200 && r.attempt === 1);
// on joue le niveau 5 : on cherche un lancer qui fait tomber au moins une cible avec le vent de la boule 0
const lv5 = P.level(5); let w5 = null;
for (let px = 20; px <= 100 && !w5; px++) for (let py = 0; py <= 100 && !w5; py++) { if (px * px + py * py > 1e4) continue; const r2 = P.throwBall(lv5, { hp: lv5.targets.map(t => t.hp) }, 0, px, py); if (r2.down) w5 = [px, py]; }
const f0 = (await q("SELECT n FROM event_progress WHERE key = 'nl:flocons'")).length;
[s, r] = await call(B, 'POST', '/api/noel/snow/submit', { n: 5, a: 1, throws: [w5, [10, 10]] });
ok('score calculé par le serveur', s === 200 && r.score >= 90 && r.results.length === 2 && r.results[0].down, J(r).slice(0, 160));
const sc = r.score, fl = r.flocons; ok('flocons créditées = score / 6', fl === P.flocons(sc) && r.gained === fl, J({ sc, fl }));
[s, r] = await call(B, 'POST', '/api/noel/snow/submit', { n: 5, a: 1, throws: [w5] }); ok('un essai ne se rejoue pas', s === 409);
const fl2 = (await q("SELECT n FROM event_progress WHERE key = 'nl:flocons' AND user_id = (SELECT id FROM users WHERE name = 'Bob')"))[0].n; ok('pas de second crédit', +fl2 === fl);
// triche : le score envoyé par le client est ignoré
await call(B, 'POST', '/api/noel/snow/start', { n: 5 });
[s, r] = await call(B, 'POST', '/api/noel/snow/submit', { n: 5, a: 2, score: 99999, flocons: 999, throws: [[1, 1]] });
ok('score envoyé ignoré (tir nul : 0 gain)', s === 200 && r.score === 0 && r.flocons === fl && r.gained === 0, J({ score: r.score, fl: r.flocons }));
// meilleur score conservé, seule la progression est payée
ok('meilleur score conservé', r.best === sc);
await call(B, 'POST', '/api/noel/snow/start', { n: 5 });
[s, r] = await call(B, 'POST', '/api/noel/snow/start', { n: 5 }); ok('quatrième essai refusé', s === 409);
[s, r] = await call(B, 'POST', '/api/noel/snow/submit', { n: 5, a: 3, throws: [w5, w5, w5, w5, w5, w5, w5] }); ok('au plus 5 lancers retenus', s === 200 && r.results.length <= 5);
// simultanéité : deux envois du même essai, un seul compte
const C = await mk('Carl'); await call(C, 'POST', '/api/noel/snow/start', { n: 5 });
const both = await Promise.all([call(C, 'POST', '/api/noel/snow/submit', { n: 5, a: 1, throws: [w5] }), call(C, 'POST', '/api/noel/snow/submit', { n: 5, a: 1, throws: [w5] })]);
ok('envois simultanés : un seul accepté', both.filter(x => x[0] === 200).length === 1, J(both.map(x => x[0])));
const cf = (await q("SELECT n FROM event_progress WHERE key = 'nl:flocons' AND user_id = (SELECT id FROM users WHERE name = 'Carl')"))[0];
ok('flocons de Carl créditées une seule fois', +cf.n === P.flocons(P.play(lv5, [w5]).score), J(cf));
// plafond
ok('flocons plafonnées à 120 par niveau', P.flocons(1e6) === 120);
Date.now = Date.now;
done();
