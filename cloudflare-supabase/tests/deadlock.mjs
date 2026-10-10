// Blocage mutuel (deadlock) PostgreSQL : la transaction annulée est rejouée ; les autres erreurs ne le sont jamais.
import { supabaseTransport } from '../src/pg.js';
let n = 0, fail = 0;
const ok = (t, c, d = '') => { console.log(`  ${c ? 'ok ' : 'KO '} ${t}${c ? '' : ' ' + d}`); if (!c) fail++; };
const real = globalThis.fetch;
const script = list => { n = 0; globalThis.fetch = async () => { const r = list[Math.min(n++, list.length - 1)]; return new Response(JSON.stringify(r.body), { status: r.status }); }; };
const tr = supabaseTransport('https://x.supabase.co', 'eyJkey');
script([{ status: 500, body: { code: '40P01', message: 'deadlock detected' } }, { status: 500, body: { code: '40P01', message: 'deadlock detected' } }, { status: 200, body: [{ results: [], changes: 1 }] }]);
ok('écriture : deadlock rejoué puis réussi', (await tr([{ sql: 'UPDATE users SET coins = 1' }]))[0].changes === 1 && n === 3, n);
script([{ status: 500, body: { code: '40P01', message: 'deadlock detected' } }]);
let err; try { await tr([{ sql: 'UPDATE users SET coins = 1' }]); } catch (e) { err = e; }
ok('deadlock persistant : abandon après 5 essais', /40P01/.test(err?.message) && n === 5, n);
script([{ status: 400, body: { code: '23505', message: 'duplicate key' } }]);
err = null; try { await tr([{ sql: 'INSERT INTO t VALUES (1)' }]); } catch (e) { err = e; }
ok('autre erreur : jamais rejouée', /23505/.test(err?.message) && n === 1, n);
globalThis.fetch = real;
console.log(fail ? `\n${fail} ÉCHEC(S)` : '\nTOUT PASSE'); process.exit(fail ? 1 : 0);
