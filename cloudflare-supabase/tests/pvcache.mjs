// Vues Wikipédia : les visiteurs ne sollicitent jamais Wikimedia ; la tâche planifiée espace ses demandes, respecte « retry-after » et mémorise les résultats.
import './api.mjs';
const { ok, DB, J, done, env } = globalThis.__T;
const { pvGet, pvRest, pvForget, pvStart, pvStop, viewsError } = await import('../src/pvcache.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
delete globalThis.__CACHE_MS;   // ici on teste la VRAIE logique, pas le mode « tout frais » des autres tests
globalThis.__PV_PACE = 0;       // pas d'attente réelle de 13 s dans le test
let calls = 0, mode = '429';
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (!String(u).includes('pageviews')) return realFetch(u, o);
  calls++;
  if (mode === '429') return new Response('trop', { status: 429, headers: { 'retry-after': '33' } });
  if (mode === '503') return new Response('x', { status: 503 });
  return new Response(JSON.stringify({ items: [{ timestamp: '2026110100', views: 120 }, { timestamp: '2026110200', views: 130 }] }), { status: 200 });
};
// 1. un visiteur ne déclenche jamais d'appel
let v = await pvGet(env, 'Moscou', '2026-11-01', '2026-11-02');
ok('visiteur : aucune demande à Wikimedia, message d\'attente clair', v === null && calls === 0 && /en cours de récupération/.test(viewsError.msg), J({ calls, msg: viewsError.msg }));
// 2. la tâche planifiée essaie ; Wikimedia refuse avec « retry-after: 33 »
pvStart(5);
v = await pvGet(env, 'Moscou', '2026-11-01', '2026-11-02');
ok('tâche planifiée : une seule demande, refusée (429), aucune insistance', v === null && calls === 1 && viewsError.code === 429 && viewsError.retryAfter === 33000, J({ v, calls, code: viewsError.code, ra: viewsError.retryAfter }));
const rest = (await pvRest(env)) - Date.now(); ok('le repos suit le délai demandé par Wikimedia (33 s + marge), pas 5 minutes', rest > 30000 && rest <= 39000, J({ rest }));
calls = 0; v = await pvGet(env, 'Paris', '2026-11-01', '2026-11-02');
ok('pendant le repos : aucune demande', v === null && calls === 0 && /limite les demandes/.test(viewsError.msg), J({ calls, msg: viewsError.msg }));
// 3. fin du repos : les vues arrivent et sont mémorisées
await q("UPDATE settings SET value = ? WHERE key = 'pv_rest'", String(Date.now() - 1000)); pvForget(); mode = 'ok'; calls = 0;
v = await pvGet(env, 'Moscou', '2026-11-01', '2026-11-02');
ok('après le repos : les vues arrivent', v && v['2026-11-01'] === 120 && v['2026-11-02'] === 130 && calls === 1, J({ v, calls }));
calls = 0; v = await pvGet(env, 'Moscou', '2026-11-01', '2026-11-02');
ok('la même demande est servie par la base : aucun appel', v && v['2026-11-02'] === 130 && calls === 0, J({ calls }));
pvStop(); v = await pvGet(env, 'Moscou', '2026-11-01', '2026-11-02');
ok('un visiteur lit aussi la mémoire de la base', v && v['2026-11-02'] === 130 && calls === 0);
ok('la série est rangée sous une clé datée (purge possible)', (await q("SELECT key FROM settings WHERE key LIKE 'pv:%'")).map(r => r.key).join() === 'pv:2026-11-02:Moscou|2026-11-01');
// 4. budget : au plus N demandes par passage
pvStart(2); calls = 0; mode = 'ok';
for (const t of ['A', 'B', 'C', 'D']) await pvGet(env, t, '2026-11-01', '2026-11-02');
ok('budget de 2 demandes par passage respecté (4 articles demandés, 2 appels)', calls === 2, J({ calls }));
// 5. panne 503 : repos court
pvStart(5); await q("DELETE FROM settings WHERE key = 'pv_rest'"); pvForget(); mode = '503'; calls = 0;
v = await pvGet(env, 'Lyon', '2026-11-01', '2026-11-02');
const r503 = (await pvRest(env)) - Date.now(); ok('panne 503 : repos court (1 minute)', v === null && r503 > 30000 && r503 <= 61000, J({ r503, calls }));
pvStop(); globalThis.fetch = realFetch; globalThis.__PV_PACE = undefined;
done();
