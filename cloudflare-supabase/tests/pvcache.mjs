// Vues Wikipédia : mémoire en base, repos après un refus (429), nouvelle tentative, pas de rafale.
import './api.mjs';
const { ok, DB, J, done, env } = globalThis.__T;
const { pvGet, pvRest, pvForget, viewsError } = await import('../src/pvcache.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
delete globalThis.__CACHE_MS;   // ici on teste la VRAIE logique (mémoire et repos), pas le mode « tout frais » des autres tests
let calls = 0, mode = '429';
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (!String(u).includes('pageviews')) return realFetch(u, o);
  calls++;
  if (mode === '429') return new Response('trop', { status: 429, headers: { 'retry-after': '0' } });
  return new Response(JSON.stringify({ items: [{ timestamp: '2026110100', views: 120 }, { timestamp: '2026110200', views: 130 }] }), { status: 200 });
};
let v = await pvGet(env, 'Moscou', '2026-11-01', '2026-11-02');
ok('Wikimedia refuse (429) : réponse indisponible, une seule nouvelle tentative', v === null && calls === 2 && viewsError.code === 429, J({ v, calls, code: viewsError.code }));
ok('un repos de 5 minutes est posé pour tout le monde', (await pvRest(env)) > Date.now() + 4 * 60000);
calls = 0; v = await pvGet(env, 'Paris', '2026-11-01', '2026-11-02');
ok('pendant le repos : aucune demande envoyée à Wikimedia', v === null && calls === 0 && /limite les demandes/.test(viewsError.msg), J({ calls, msg: viewsError.msg }));
// fin du repos : on peut redemander ; le résultat est mémorisé
await q("UPDATE settings SET value = ? WHERE key = 'pv_rest'", String(Date.now() - 1000)); pvForget(); mode = 'ok'; calls = 0;
v = await pvGet(env, 'Moscou', '2026-11-01', '2026-11-02');
ok('après le repos : les vues arrivent', v && v['2026-11-01'] === 120 && v['2026-11-02'] === 130 && calls === 1, J({ v, calls }));
calls = 0; v = await pvGet(env, 'Moscou', '2026-11-01', '2026-11-02');
ok('la même demande est servie par la mémoire de la base : aucun appel', v && v['2026-11-02'] === 130 && calls === 0, J({ calls }));
ok('la série est rangée sous une clé datée (purge possible)', (await q("SELECT key FROM settings WHERE key LIKE 'pv:%'")).map(r => r.key).join() === 'pv:2026-11-02:Moscou|2026-11-01');
// une panne de Wikimedia (500) : repos plus court (1 minute), pas de rafale
mode = '500'; globalThis.fetch = async (u, o) => { if (!String(u).includes('pageviews')) return realFetch(u, o); calls++; return new Response('x', { status: 503 }); };
calls = 0; v = await pvGet(env, 'Lyon', '2026-11-01', '2026-11-02');
const rest500 = (await pvRest(env)) - Date.now(); ok('panne 503 : repos court (environ 1 minute)', v === null && rest500 > 30000 && rest500 <= 61000, J({ rest500, calls }));
globalThis.fetch = realFetch;
done();
