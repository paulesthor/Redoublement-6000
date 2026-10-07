// Base PostgreSQL locale (PGlite = vrai PostgreSQL compilé en WebAssembly) avec le même schéma et la même fonction q() que Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { pgDB } from '../src/pg.js';
const realFetch = globalThis.fetch;   // les tests remplacent fetch (Wikipédia factice) : on garde le vrai pour joindre Supabase
const ROOT = new URL('..', import.meta.url).pathname;
/** SB_REF + SB_PAT : les tests tournent contre le VRAI projet Supabase (via l'API de gestion, jeton personnel) au lieu de PGlite. Le schéma doit déjà y être installé. */
async function remoteDb() {
  const { SB_REF, SB_PAT } = process.env;
  const sql = async query => {
    for (let i = 0; ; i++) {
      const r = await realFetch(`https://api.supabase.com/v1/projects/${SB_REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + SB_PAT, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      const t = await r.text();
      if ((r.status === 429 || r.status >= 500) && i < 8) { await new Promise(x => setTimeout(x, 1500 * (i + 1))); continue; }   // limite de débit ou incident passager de l'API de gestion
      if (!r.ok) throw Object.assign(new Error('Supabase ' + r.status + ' ' + t.slice(0, 300)), { status: r.status });
      return JSON.parse(t);
    }
  };
  const tables = "SELECT string_agg(format('%I', tablename), ', ') t FROM pg_tables WHERE schemaname = 'public'";
  const wipe = async () => { const t = (await sql(tables))[0].t; await sql(`TRUNCATE ${t} RESTART IDENTITY CASCADE`); };
  const n = (await sql('SELECT count(*)::int n FROM users'))[0].n; if (n) throw new Error('Le projet contient déjà des données : tests refusés');
  const transport = async stmts => { const js = JSON.stringify(stmts); const tag = '$sbq$'; if (js.includes(tag)) throw new Error('tag'); return (await sql(`SELECT public.q(${tag}${js}${tag}::jsonb) AS r`))[0].r; };
  transport.log = []; transport.trips = 0;
  const logged = async stmts => { logged.log.push(...stmts.map(s => s.sql)); logged.trips++; return transport(stmts); };
  logged.log = []; logged.trips = 0;
  return { pg: { query: async (q, p) => ({ rows: await sql(q) }), exec: sql }, DB: pgDB(logged), log: logged.log, trips: () => logged.trips, env: { DB: pgDB(logged) }, wipe };
}
export async function makeDb() {
  if (process.env.SB_REF && process.env.SB_PAT) { const r = await remoteDb(); r.env.DB = r.DB; process.on('exit', () => {}); globalThis.__wipe = r.wipe; return r; }
  const pg = new PGlite();
  await pg.exec("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;");
  await pg.exec(readFileSync(ROOT + 'schema.pg.sql', 'utf8'));
  await pg.exec(readFileSync(ROOT + 'supabase-q.sql', 'utf8'));
  const transport = async stmts => (await pg.query('SELECT public.q($1::jsonb) AS r', [JSON.stringify(stmts)])).rows[0].r;
  transport.log = [];
  const logged = async stmts => { logged.log.push(...stmts.map(s => s.sql)); logged.trips++; return transport(stmts); };
  logged.log = []; logged.trips = 0;
  const DB = pgDB(logged);
  return { pg, DB, log: logged.log, trips: () => logged.trips, env: { DB } };
}
