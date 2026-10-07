// Contrôles de sécurité : accès, injections, limites d'essais, sessions, en-têtes.
import './api.mjs';
import { readFileSync } from 'node:fs';
const { call, settle, ok, DB, worker, env, ctx, done, J } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
// plus fiable : on relit la déclaration de chaque route une par une
const decl = [...src.matchAll(/^route\('(GET|POST)', '([^']+)'/gm)].map(m => ({ method: m[1], path: m[2], at: m.index }));
for (let i = 0; i < decl.length; i++) { const body = src.slice(decl[i].at, decl[i + 1]?.at ?? src.length); const last = body.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).filter(l => /\);\s*(\/\/.*)?$/.test(l)).at(-1) || ''; decl[i].pub = /, false\);\s*(\/\/.*)?$/.test(last); decl[i].admin = /route\('[A-Z]+', '[^']+', admin\(/.test(body.slice(0, 120)); }
console.log('— inventaire des routes :', decl.length);
const PUBLIC = decl.filter(r => r.pub).map(r => r.method + ' ' + r.path).sort();
ok('routes publiques = liste attendue', J(PUBLIC) === J(['GET /api/avatar/:id', 'GET /api/config', 'GET /api/version', 'POST /api/login', 'POST /api/push/pull', 'POST /api/register']), J(PUBLIC));
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
await q('UPDATE users SET is_admin = 1 WHERE name = ?', 'Alice');
const sub = p => p.replace(/:\w+/g, '1');
console.log('— accès sans connexion');
const open = [];
for (const rt of decl.filter(x => !x.pub)) { const [st] = await call(null, rt.method, sub(rt.path), rt.method === 'POST' ? {} : undefined); if (!(st === 401 || (st === 403 && rt.path.startsWith('/api/admin/')))) open.push(`${rt.method} ${rt.path} -> ${st}`); }
ok('toutes les autres routes exigent une connexion (401)', open.length === 0, J(open));
console.log('— accès administrateur');
const adm = decl.filter(x => x.path.startsWith('/api/admin/')), leak = [];
for (const rt of adm) { const [st] = await call(B, rt.method, sub(rt.path), rt.method === 'POST' ? {} : undefined); if (st !== 403) leak.push(`${rt.method} ${rt.path} -> ${st}`); }
ok('routes admin : refusées à un joueur ordinaire', leak.length === 0, J(leak));
for (const p of ['/api/me/test-mode', '/api/quiz/preview?q=Paris']) { const [st] = await call(B, p.includes('preview') ? 'GET' : 'POST', p, p.includes('preview') ? undefined : {}); ok('réservé admin : ' + p, st === 403, st); }
console.log('— injections SQL (littéraux)');
const evil = ["x$q", "$q", "$q$", "$q$ OR 1=1 --", "'; DROP TABLE users; --", "\\", "a$q0$b$q$", "$q$$q$", "$$", "é\u0000z", "x$q$q", "$q0", "$q1$"];
let bad = [];
for (const a of evil) for (const b of evil) { try { const [row] = await q('SELECT ? AS a, ? AS b, ?3 AS c', a, b, 'fin'); if (row.a !== a.replace(/\u0000/g, '') || row.b !== b.replace(/\u0000/g, '') || row.c !== 'fin') bad.push([a, b]); } catch (e) { bad.push([a, b, e.message.slice(0, 60)]); } }
ok('169 couples de textes hostiles ressortent à l\'identique', bad.length === 0, J(bad.slice(0, 3)));
[s, r] = await call(A, 'POST', '/api/dm/2', { body: "x$q" }); await new Promise(r => setTimeout(r, 1400)); [s, r] = await call(A, 'POST', '/api/dm/2', { body: "'); DROP TABLE users; --" });
ok('messages hostiles stockés tels quels, tables intactes', (await q('SELECT COUNT(*) n FROM users'))[0].n >= 2 && (await q("SELECT COUNT(*) n FROM dms WHERE body LIKE '%DROP TABLE%'"))[0].n === 1);
for (const n of ['a$q', "x' OR '1'='1", '<script>', 'a b', 'é'.repeat(25), '']) { [s] = await call(null, 'POST', '/api/register', { name: n, password: 'secret9' }); ok('pseudo refusé : ' + J(n).slice(0, 20), s === 400, s); }
console.log('— connexion : limites et sessions');
[s] = await call(null, 'POST', '/api/register', { name: 'Court', password: '12345' }); ok('mot de passe trop court refusé', s === 400);
for (let i = 0; i < 8; i++) await call(null, 'POST', '/api/login', { name: 'Bob', password: 'faux' + i });
[s, r] = await call(null, 'POST', '/api/login', { name: 'Bob', password: 'secret2' }); ok('après 8 échecs : pseudo verrouillé (429), même avec le bon mot de passe', s === 429, J([s, r]));
[s] = await call(null, 'POST', '/api/login', { name: 'Alice', password: 'secret1' }); ok('un autre pseudo n\'est pas bloqué', s === 200, s);
await q("DELETE FROM login_fails"); [s, r] = await call(null, 'POST', '/api/login', { name: 'Bob', password: 'secret2' }); ok('connexion normale après déverrouillage', s === 200 && r.token, J([s, r]));
const tok2 = r.token;
await q('UPDATE sessions SET created = ? WHERE token = ?', Date.now() - 200 * 86400000, tok2); [s] = await call(tok2, 'GET', '/api/me'); ok('session de plus de 180 jours refusée', s === 401);
[s, r] = await call(null, 'POST', '/api/login', { name: 'Bob', password: 'secret2' }); const tok3 = r.token;
[s] = await call(tok3, 'POST', '/api/logout', {}); [s] = await call(tok3, 'GET', '/api/me'); ok('déconnexion : jeton invalidé côté serveur', s === 401);
[s] = await call(B, 'POST', '/api/me/password', { old: 'mauvais', password: 'nouveau1' }); ok('changement de mot de passe : ancien mot de passe exigé', s === 403);
[s] = await call(B, 'POST', '/api/me/password', { old: 'secret2', password: 'abc' }); ok('nouveau mot de passe trop court refusé', s === 400);
[s, r] = await call(null, 'POST', '/api/login', { name: 'Bob', password: 'secret2' }); const other = r.token;
[s] = await call(B, 'POST', '/api/me/password', { old: 'secret2', password: 'nouveau1' }); ok('mot de passe changé', s === 200);
[s] = await call(other, 'GET', '/api/me'); ok('les autres appareils sont déconnectés', s === 401);
[s] = await call(B, 'GET', '/api/me'); ok('l\'appareil courant reste connecté', s === 200);
[s] = await call(null, 'POST', '/api/login', { name: 'Bob', password: 'nouveau1' }); ok('connexion avec le nouveau mot de passe', s === 200);
console.log('— limites et en-têtes');
const big = await worker.fetch(new Request('http://x/api/dm/2', { method: 'POST', headers: { authorization: 'Bearer ' + A, 'content-type': 'application/json', 'content-length': '900000' }, body: '{}' }), env, ctx); ok('requête volumineuse refusée (413)', big.status === 413, big.status);
const oldA = env.ASSETS; env.ASSETS = { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) };
const home = await worker.fetch(new Request('http://x/index.html'), env, ctx);
ok('page : CSP, cadre interdit, nosniff', /default-src 'self'/.test(home.headers.get('content-security-policy') || '') && /frame-ancestors 'none'/.test(home.headers.get('content-security-policy') || '') && home.headers.get('x-frame-options') === 'DENY' && home.headers.get('x-content-type-options') === 'nosniff', J([...home.headers]).slice(0, 300));
env.ASSETS = oldA;
const apiRes = await worker.fetch(new Request('http://x/api/version'), env, ctx); ok('API : nosniff et pas de CORS ouvert', apiRes.headers.get('x-content-type-options') === 'nosniff' && !apiRes.headers.get('access-control-allow-origin'));
console.log('— autorisations entre joueurs');
for (let i = 0; i < 2; i++) { await call(A, 'POST', '/api/packs/open', {}); await call(B, 'POST', '/api/packs/open', {}); } await settle();
const ca = (await q('SELECT card_id FROM inventory WHERE user_id = 1 LIMIT 1'))[0].card_id;
[s] = await call(B, 'POST', '/api/discard', { card_id: ca, qty: 1 }); ok('défausser la carte d\'un autre : refusé', s === 400);
[s] = await call(B, 'POST', '/api/fuse', { card_id: ca }); ok('fusionner la carte d\'un autre : refusé', s === 400);
[s] = await call(B, 'POST', '/api/auctions', { card_id: ca, price: 10 }); ok('vendre la carte d\'un autre : refusé', s === 400);
[s] = await call(B, 'POST', '/api/favorites', { card_id: ca, on: true }); ok('favori sur la carte d\'un autre : refusé', s === 400);
for (const bodyx of [{ card_id: ca, qty: -5 }, { card_id: ca, qty: 'abc' }, { card_id: 'x' }]) { [s] = await call(A, 'POST', '/api/discard', bodyx); ok('discard valeurs absurdes : pas d\'erreur serveur ni gain négatif ' + J(bodyx), s < 500); }
const c0 = (await q('SELECT coins FROM users WHERE id = 1'))[0].coins;
for (const price of [-1, 0, 1e12, 'x', NaN, Infinity]) { [s] = await call(A, 'POST', '/api/auctions', { card_id: ca, price }); ok('enchère prix absurde refusée : ' + price, s === 400, s); }
for (const stake of [-5, 0, 1e9, 'a', 5.5]) { [s] = await call(A, 'POST', '/api/tournaments', { stake }); ok('mise de tournoi absurde : ' + stake, s === 400 || (s === 200 && stake === 5.5 ? false : true), s); }
const t = await call(A, 'POST', '/api/trades', { to: 2, offer_card: ca, want_card: ca }); ok('échange sans carte demandée refusé', t[0] === 400);
[s, r] = await call(A, 'POST', '/api/trades', { to: 2, offer_card: ca, want_card: (await q('SELECT card_id FROM inventory WHERE user_id = 2 LIMIT 1'))[0].card_id });
const tid = (await q('SELECT id FROM trades ORDER BY id DESC LIMIT 1'))[0]?.id;
if (tid) { [s] = await call(A, 'POST', `/api/trades/${tid}/accept`, {}); ok('accepter son propre échange : refusé', s === 403); }
[s, r] = await call(B, 'POST', '/api/me/avatar', { data: 'data:image/jpeg;base64,' + 'A'.repeat(100000) }); ok('photo trop lourde refusée', s === 400);
[s, r] = await call(B, 'POST', '/api/me/avatar', { data: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==' }); ok('SVG refusé comme photo (XSS)', s === 400);
done();
