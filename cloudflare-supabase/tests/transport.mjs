// Le transport HTTPS de production, testé contre un faux serveur « Supabase » (PostgREST) qui exécute la fonction q() sur PostgreSQL.
import http from 'node:http';
import { makeDb } from './pgharness.mjs';
import { pgDB, supabaseTransport } from '../src/pg.js';
const { pg } = await makeDb();
let seen = [], fail = 0, hits = 0;
const srv = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  hits++; seen.push({ url: req.url, key: req.headers.apikey, auth: req.headers.authorization, ct: req.headers['content-type'] });
  if (fail > 0) { fail--; res.writeHead(503); return res.end('{"message":"temporarily unavailable"}'); }
  const { stmts } = JSON.parse(Buffer.concat(chunks));
  try { const r = (await pg.query('SELECT public.q($1::jsonb) AS r', [JSON.stringify(stmts)])).rows[0].r; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)); }
  catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: e.code, message: e.message })); }
}).listen(8799);
const DB = pgDB(supabaseTransport('http://localhost:8799/', 'cle-service'));
let bad = 0; const ok = (n, c, d = '') => { console.log((c ? '  ok  ' : '  ÉCHEC ') + n + (c ? '' : ' ' + d)); if (!c) bad++; };
let r = await DB.prepare('INSERT INTO users (name, salt, hash, pack_ts, created) VALUES (?,?,?,?,?)').bind('Zoé', 's', 'h', 1, 1).run();
ok('requête HTTPS : adresse /rest/v1/rpc/q, clé en en-têtes', seen[0].url === '/rest/v1/rpc/q' && seen[0].key === 'cle-service' && seen[0].auth === 'Bearer cle-service' && seen[0].ct === 'application/json', JSON.stringify(seen[0]));
ok('identifiant créé renvoyé', r.meta.last_row_id === 1, JSON.stringify(r.meta));
fail = 1; hits = 0; r = await DB.prepare('SELECT name FROM users WHERE id = ?').bind(1).all();
ok('lecture rejouée après un 503', r.results[0].name === 'Zoé' && hits === 2, hits);
fail = 1; hits = 0; let err; try { await DB.prepare('UPDATE users SET coins = 5 WHERE id = 1').run(); } catch (e) { err = e; }
ok('écriture JAMAIS rejouée (1 seule tentative)', hits === 1 && err?.status === 503, hits + ' ' + err);
try { await DB.prepare('SELEC nimporte').all(); } catch (e) { err = e; }
ok('erreur SQL remontée avec son code', /Supabase 400/.test(err.message), err.message);
const q = await DB.batch([DB.prepare('UPDATE users SET coins = 7 WHERE id = 1'), DB.prepare('SELECT coins FROM users WHERE id = 1')]);
ok('lot = un seul aller-retour', q[1].results[0].coins === 7);
srv.close(); process.exit(bad ? 1 : 0);
