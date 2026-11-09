// Mesure : nombre d'appels vers la base (= « sous-requêtes » Cloudflare) par route. Sert à comparer deux versions.
import './api.mjs';
const { call, J, done, DB, trips, settle } = globalThis.__T;
const reg = async n => { await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); const [, l] = await call(null, 'POST', '/api/login', { name: n, password: 'secret1' }); return l.token; };
const A = await reg('Alice'), B = await reg('Bob');
await DB.prepare("UPDATE users SET coins = 5000, pack_stock = 5 WHERE name = 'Bob'").run();
const out = {};
const m = async (k, tok, method, path, body) => { await settle(); const t0 = trips(); const r = await call(tok, method, path, body); out[k] = [trips() - t0, r[0]]; };
for (let i = 0; i < 2; i++) { await m('GET /api/me (2e fois)', B, 'GET', '/api/me'); }
await m('GET /api/commu', B, 'GET', '/api/commu');
await m('GET /api/cosmetics', B, 'GET', '/api/cosmetics');
await m('GET /api/hits', B, 'GET', '/api/hits');
await m('GET /api/boot (remplace les 5 ci-dessus + config)', B, 'GET', '/api/boot');
await m('GET /api/auctions', B, 'GET', '/api/auctions');
await m('POST /api/packs/open', B, 'POST', '/api/packs/open', {});
await m('GET /api/album/stats', B, 'GET', '/api/album/stats');
await m('GET /api/leaderboard', B, 'GET', '/api/leaderboard');
await m('GET /api/friends', B, 'GET', '/api/friends');
console.log('\nTRIPS ' + J(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v[0]]))));
const total = Object.values(out).reduce((t, v) => t + v[0], 0); console.log('TOTAL', total);
process.exit(0);
