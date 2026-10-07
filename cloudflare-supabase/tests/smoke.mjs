import { makeDb } from './pgharness.mjs';
const { DB, pg } = await makeDb();
const ok = (n, c, d = '') => { console.log((c ? '  ok  ' : '  FAIL ') + n + (c ? '' : ' ' + d)); if (!c) process.exitCode = 1; };
let r = await DB.prepare('INSERT INTO users (name, salt, hash, pack_ts, created) VALUES (?,?,?,?,?)').bind("Alice $1 'x'", 's', 'h', 1, 2).run();
ok('insert renvoie last_row_id', r.meta.last_row_id === 1, JSON.stringify(r));
r = await DB.prepare('SELECT id, name FROM users WHERE lower(name) = lower(?)').bind("alice $1 'x'").all();
ok('texte avec $1 et apostrophe intact', r.results[0]?.name === "Alice $1 'x'", JSON.stringify(r));
r = await DB.batch([DB.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').bind(5, 1), DB.prepare('SELECT coins FROM users WHERE id = ?1').bind(1)]);
ok('batch + ?1', r[0].meta.changes === 1 && r[1].results[0].coins === 205, JSON.stringify(r));
r = await DB.prepare('INSERT OR IGNORE INTO achievements (user_id, key, ts) VALUES (?,?,?)').bind(1, 'a', 1).run();
r = await DB.prepare('INSERT OR IGNORE INTO achievements (user_id, key, ts) VALUES (?,?,?)').bind(1, 'a', 1).run();
ok('INSERT OR IGNORE sans doublon', r.meta.changes === 0, JSON.stringify(r.meta));
r = await DB.prepare('DELETE FROM achievements WHERE user_id = ? RETURNING key').bind(1).run();
ok('DELETE … RETURNING', r.results[0]?.key === 'a');
try { await DB.batch([DB.prepare('UPDATE users SET coins = 1 WHERE id = 1'), DB.prepare('INSERT INTO users (name) VALUES (?)').bind('x')]); } catch (e) {}
r = await DB.prepare('SELECT coins FROM users WHERE id = 1').first('coins'); ok('lot annulé en bloc si une requête échoue', r === 205, r);
const rows = await pg.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('users','cards')"); ok('RLS activé', rows.rows.every(x => x.relrowsecurity));
