import './api.mjs';
const { call, settle, DB, log, trips, J } = globalThis.__T;
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
await call(A, 'POST', '/api/packs/open', {}); await settle(); await call(A, 'POST', '/api/packs/open', {}); await settle();
for (const [m, p] of [['POST', '/api/packs/open'], ['GET', '/api/me'], ['GET', '/api/auctions']]) {
  await settle(); const n0 = log.length, t0 = trips(); await call(A, m, p, m === 'GET' ? undefined : {}); 
  console.log('\n==', m, p, 'allers-retours:', trips() - t0);
  for (const q of log.slice(n0)) console.log('  ', q.replace(/\$q\d*\$.*?\$q\d*\$/gs, '…').replace(/\s+/g, ' ').slice(0, 150));
}
process.exit(0);
