// Test d'intégration : le vrai Worker (src/index.js) contre un vrai PostgreSQL (PGlite), avec le vrai catalogue de cartes.
import { makeDb } from './pgharness.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { Lobby } from '../src/lobby.js';
const PUBLIC = new URL('../../cloudflare/public', import.meta.url).pathname;
globalThis.__FLUSH_MS = 0;   // les statistiques et le journal partent tout de suite
const { DB, pg, env: base, trips, log } = await makeDb();
// --- Wikipédia factice : chaque page a un texte et une image ---
globalThis.fetch = async (u, o) => {
  const url = String(u);
  if (url.includes('wikipedia.org') || url.includes('wikidata.org')) {
    const sp = new URL(url).searchParams;
    if (sp.get('gsrsearch')) { const base = ['Paris', 'France', 'Lyon', 'Pomme', 'Chien', 'Soleil', 'Musique', 'Rome', 'Marseille', 'Eau'], rot = [...sp.get('gsrsearch')].reduce((t, c) => t + c.charCodeAt(0), 0) % base.length, names = [...base.slice(rot), ...base.slice(0, rot)]; const pages = Object.fromEntries(names.map((n, i) => ['s' + i, { pageid: 5000 + i, title: n, index: i + 1, extract: n + ' est un article.', thumbnail: { source: 'https://img/' + n + '.jpg' } }])); return new Response(JSON.stringify({ query: { pages } }), { status: 200 }); }
    if (sp.get('titles') && sp.get('prop') === 'extracts') return new Response(JSON.stringify({ query: { pages: { 1: { pageid: 1, title: sp.get('titles'), extract: 'Paris est la capitale de la France. Elle a été fondée vers 250 av. J.-C. et compte plus de deux millions d\'habitants dans ses murs. '.repeat(6) } } } }), { status: 200 });
    const ids = (sp.get('pageids') || '').split('|').filter(Boolean), titles = (sp.get('titles') || '').split('|').filter(Boolean);
    const mk = (id, title) => ({ pageid: +id, title, extract: ('Article ' + title + '. Né en 1850, il a vécu 70 ans à Lyon. ').repeat(3), thumbnail: { source: 'https://img/' + id + '.jpg' } });
    const pages = Object.fromEntries([...ids.map(id => [id, mk(id, null)]), ...titles.map((t, i) => ['9' + i, mk('9' + i, t)])]);   // par identifiant : titre inconnu (le code relance par titre)
    return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
  }
  if (url.includes('wikimedia.org/api/rest_v1/metrics/pageviews')) {                // vues Wikipédia factices : globalThis.__PV(titre, 'YYYY-MM-DD') peut les imposer
    const m = url.match(/user\/([^/]+)\/daily\/(\d{8})00\/(\d{8})00/); if (!m) return new Response('{}', { status: 400 });
    if (globalThis.__PV_FAIL) return new Response('{}', { status: 500 });
    const title = decodeURIComponent(m[1]).replace(/_/g, ' '), items = [], d0 = Date.parse(m[2].replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') + 'T00:00:00Z'), d1 = Date.parse(m[3].replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') + 'T00:00:00Z');
    for (let t = d0; t <= d1; t += 86400000) { const day = new Date(t).toISOString().slice(0, 10), over = globalThis.__PV?.(title, day); if (over === null) continue; items.push({ timestamp: day.replace(/-/g, '') + '00', views: over ?? 1000 + ([...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 400, 7)) }); }
    return items.length ? new Response(JSON.stringify({ items }), { status: 200 }) : new Response('{}', { status: 404 });
  }
  return new Response('{}', { status: 404 });
};
const ASSETS = { fetch: async req => { const p = new URL(typeof req === 'string' ? req : req.url).pathname; const f = PUBLIC + p; return existsSync(f) ? new Response(readFileSync(f), { headers: { 'content-type': 'application/json' } }) : new Response('', { status: 404 }); } };
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const storage = new Map();
const state = { storage: { put: async (k, v) => storage.set(k, structuredClone(v)), get: async k => structuredClone(storage.get(k)), delete: async k => storage.delete(k), list: async ({ prefix }) => new Map([...storage].filter(([k]) => k.startsWith(prefix))) }, blockConcurrencyWhile: async fn => { await fn(); } };
const env = { ...base, ASSETS, INVITE_CODE: undefined, EVENTS: '0', PRANK: '0', AI: { run: async () => ({ response: '{"questions":[]}' }) } };
env.LOBBY = { idFromName: () => 'x', get: () => ({ fetch: (u, o) => lobby.fetch(new Request(u, o)) }) };
const lobby = new Lobby(state, env);
const { default: worker } = await import('../src/index.js');
const waits = [];
const ctx = { waitUntil: p => { waits.push(p); } };
const tripStats = new Map();
const call = async (tok, method, path, body) => { const t0 = trips(); const out = await call0(tok, method, path, body); const sync = trips() - t0; await settle(); const k = method + ' ' + path.split('?')[0].replace(/\/\d+/g, '/:id'); const o = tripStats.get(k) ?? [0, 0]; tripStats.set(k, [Math.max(o[0], sync), Math.max(o[1], trips() - t0)]); return out; };
const call0 = async (tok, method, path, body) => { const r = await worker.fetch(new Request('http://x' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, ctx); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return [r.status, j]; };
const settle = async () => { while (waits.length) await Promise.allSettled(waits.splice(0)); };
let fails = 0; const ok = (n, c, d = '') => { console.log((c ? '  ok  ' : '  ÉCHEC ') + n + (c ? '' : ' ' + String(d).slice(0, 300))); if (!c) fails++; };
const J = x => JSON.stringify(x);
export { call, settle, ok, DB, pg, env, lobby, worker, ctx, fails as _f };
globalThis.__T = { log, trips, tripStats, call, settle, ok, DB, pg, env, lobby, worker, ctx, J, done: async () => { console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE'); if (globalThis.__wipe) { await globalThis.__wipe(); console.log('(base Supabase vidée après les tests)'); } process.exit(fails ? 1 : 0); } };
