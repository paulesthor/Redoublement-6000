// Base PostgreSQL locale (PGlite = vrai PostgreSQL compilé en WebAssembly) avec le même schéma et la même fonction q() que Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { pgDB } from '../src/pg.js';
const ROOT = new URL('..', import.meta.url).pathname;
export async function makeDb() {
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
