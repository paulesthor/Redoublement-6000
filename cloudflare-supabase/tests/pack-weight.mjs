// Mesure : taille des requêtes SQL envoyées et de la réponse pour une ouverture de paquet (avec une réserve garnie comme en production).
import './api.mjs';
const { call, DB, J, done, log, env, worker, ctx, settle } = globalThis.__T;
const [, a] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret1' }); const B = a.token;
await DB.prepare("UPDATE users SET pack_stock = 200, coins = 100000 WHERE name = 'Bob'").run();
for (let i = 0; i < 12; i++) await worker.scheduled({}, { ...env }, ctx); await settle();   // la tâche planifiée garnit la réserve
await call(B, 'GET', '/api/me'); await settle();
const sizes = [];
for (let i = 0; i < 12; i++) {
  const from = log.length; const t = await worker.fetch(new Request('http://x/api/packs/open', { method: 'POST', headers: { authorization: 'Bearer ' + B, 'content-type': 'application/json' }, body: '{}' }), env, ctx); const txt = await t.text(); await settle();
  const sqls = log.slice(from); sizes.push({ stmts: sqls.length, sqlChars: sqls.reduce((n, s) => n + s.length, 0), biggest: Math.max(...sqls.map(s => s.length)), response: txt.length, withExtract: (txt.match(/"extract":"[^"]{20,}/g) || []).length });
}
const avg = k => Math.round(sizes.reduce((n, s) => n + s[k], 0) / sizes.length);
console.log('MESURE', J({ instructions: avg('stmts'), sqlOctets: avg('sqlChars'), plusGrosse: avg('biggest'), reponseOctets: avg('response'), cartesAvecTexte: avg('withExtract') }));
const last = log.slice(-60).map(s => s.length).sort((a, b) => b - a).slice(0, 6); console.log('PLUS_GROSSES', J(last));
process.exit(0);
