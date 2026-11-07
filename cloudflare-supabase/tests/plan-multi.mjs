// Plan quinquennal et Camp avec plusieurs joueurs simulés en même temps : récompenses versées une seule fois, aucune fuite entre joueurs, courses entre appareils.
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const N = 8, names = Array.from({ length: N }, (_, i) => 'Joueur' + (i + 1)), tok = {}, id = {};
for (const n of names) { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); tok[n] = r.token; }
for (const n of names) { await q('UPDATE users SET is_admin = 1 WHERE name = ?', n); id[n] = (await q('SELECT id FROM users WHERE name = ?', n))[0].id; }
await call(null, 'POST', '/api/register', { name: 'Simple', password: 'secret1' }); const [, rs] = await call(null, 'POST', '/api/login', { name: 'Simple', password: 'secret1' }); const SIMPLE = rs.token;
const packs = async n => +(await q('SELECT pack_stock p FROM users WHERE id = ?', id[n]))[0].p;
const p0 = {}; for (const n of names) p0[n] = await packs(n);

// 1. chaque joueur gagne des wikiroubles à son rythme, en parallèle
const gains = { Joueur1: 300, Joueur2: 1500, Joueur3: 2600, Joueur4: 4800, Joueur5: 6000, Joueur6: 100, Joueur7: 4300, Joueur8: 2100 };
await Promise.all(names.map(async n => { for (let left = gains[n]; left > 0; left -= 1000) await call(tok[n], 'POST', '/api/plan/earn', { amount: Math.min(1000, left) }); }));
for (const n of names) { const [, r] = await call(tok[n], 'GET', '/api/plan'); ok(`${n} : ${gains[n]} ₽ gagnés, rien à lui d'un autre`, r.earned === gains[n] && r.claimed.length === 0, `${r.earned}`); }

// 2. tout le monde réclame tous les paliers atteints, en parallèle, et chacun deux fois par appareil (course)
const shouldGet = n => { const [, ] = [0, 0]; return null; };
const [, ref] = await call(tok.Joueur1, 'GET', '/api/plan'); const MS = ref.milestones;
const results = (await Promise.all(names.map(async n => { const out = []; for (const m of MS) out.push(...await Promise.all([call(tok[n], 'POST', '/api/plan/claim', { id: m.id }), call(tok[n], 'POST', '/api/plan/claim', { id: m.id })])); return out; }))).flat();
let okN = 0, conflict = 0, refused = 0, other = 0;
results.forEach(([s]) => { if (s === 200) okN++; else if (s === 409) conflict++; else if (s === 400) refused++; else other++; });
let expectedOk = 0; for (const n of names) expectedOk += MS.filter(m => gains[n] >= m.at).length;
ok('courses : une seule réclamation réussie par palier et par joueur', okN === expectedOk, `réussies ${okN} / attendues ${expectedOk}`);
ok('le doublon est refusé (409) ou le palier pas atteint (400), jamais une erreur serveur', other === 0, `autres ${other}`);
for (const n of names) {
  const [, r] = await call(tok[n], 'GET', '/api/plan'); const due = MS.filter(m => gains[n] >= m.at);
  ok(`${n} : ${due.length} paliers reçus exactement`, r.claimed.length === due.length && J(r.claimed) === J(due.map(m => m.id)), J(r.claimed));
  const expPacks = due.reduce((t, m) => t + m.packs, 0), expWr = due.reduce((t, m) => t + m.wr, 0);
  ok(`${n} : colis et wikiroubles = somme des paliers (pas de doublon, pas de perte)`, await packs(n) - p0[n] === expPacks && r.wr === expWr, `colis ${await packs(n) - p0[n]}/${expPacks} · ₽ ${r.wr}/${expWr}`);
  ok(`${n} : thème rouge uniquement s'il a atteint le palier 6`, r.perks.includes('theme_urss') === (gains[n] >= 2100));
}
// 2 bis. rafale : un même joueur réclame 4 paliers différents d'un seul coup (deux onglets, deux appareils)
await call(tok.Joueur2, 'POST', '/api/plan/reset', {}); await call(tok.Joueur2, 'POST', '/api/plan/earn', { amount: 2000 }); await call(tok.Joueur2, 'POST', '/api/plan/earn', { amount: 2000 });
const burst = await Promise.all([1, 2, 3, 4].map(i => call(tok.Joueur2, 'POST', '/api/plan/claim', { id: i }))); const [, b2] = await call(tok.Joueur2, 'GET', '/api/plan');
ok('rafale : 4 paliers différents d\'un coup, tous versés une seule fois', burst.every(([s]) => s === 200) && J(b2.claimed) === '[1,2,3,4]', J(burst.map(([s]) => s)) + ' ' + J(b2.claimed));
// 3. isolement : le joueur 6 n'a rien reçu des autres, un joueur ordinaire est refusé partout
const [, r6] = await call(tok.Joueur6, 'GET', '/api/plan'); ok('isolement : le joueur à 100 ₽ n\'a ni souvenir ni cadre ni thème', r6.perks.length === 0 && r6.claimed.length === 0);
for (const [m, path, body] of [['GET', '/api/plan'], ['POST', '/api/plan/earn', { amount: 5 }], ['POST', '/api/plan/claim', { id: 1 }], ['POST', '/api/plan/reset', {}], ['GET', '/api/camp'], ['POST', '/api/camp/claim', { id: 1, p: 9 }]]) { const [s] = await call(SIMPLE, m, path, body); ok(`joueur ordinaire refusé : ${m} ${path}`, s === 403, s); }
const titles = (await q("SELECT COUNT(*) n FROM user_titles WHERE tid LIKE 'plan_%'"))[0].n; let expTitles = 0; for (const n of names) expTitles += MS.filter(m => m.title && gains[n] >= m.at).length;
ok('titres du Plan : un par palier atteint et par joueur', +titles === expTitles, `${titles}/${expTitles}`);
// 4. Camp : tout le monde réclame la même prime en même temps
const camp = await Promise.all(names.map(n => call(tok[n], 'GET', '/api/camp')));
ok('camp : les 8 joueurs ont leur propre progression', camp.every(([s, r]) => s === 200 && r.claimed.length === 0));
const early = await Promise.all(names.map(n => call(tok[n], 'POST', '/api/camp/claim', { id: 10, p: 99 })));
ok('camp : le dernier palier est refusé avant le délai minimum (60 h), pour tous', early.every(([s]) => s === 400), J(early.map(([s]) => s)));
const racing = await Promise.all(names.flatMap(n => [call(tok[n], 'POST', '/api/camp/claim', { id: 1, p: 1 }), call(tok[n], 'POST', '/api/camp/claim', { id: 1, p: 1 })]));
ok('camp : jamais d\'erreur serveur sous course', racing.every(([s]) => [200, 400, 409].includes(s)), J(racing.map(([s]) => s)));
// 5. remise à zéro : n'efface que le joueur concerné
await call(tok.Joueur5, 'POST', '/api/plan/reset', {}); const [, a5] = await call(tok.Joueur5, 'GET', '/api/plan'), [, a4] = await call(tok.Joueur4, 'GET', '/api/plan');
ok('remise à zéro : seul le joueur concerné est touché', a5.earned === 0 && a5.claimed.length === 0 && a4.claimed.length === MS.filter(m => gains.Joueur4 >= m.at).length);
done();
