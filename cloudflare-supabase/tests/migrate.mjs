// Migration : une base D1 factice (SQLite avec l'ANCIEN schéma) est recopiée dans PostgreSQL via la page /migrate.
import './api.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const { DB, env, worker, ok, done, J, settle, ctx } = globalThis.__T;
const sq = new DatabaseSync(':memory:'); sq.exec(readFileSync(new URL('../../cloudflare/schema.sql', import.meta.url), 'utf8'));
env.OLD_DB = { prepare: sql => { let p = []; const o = { bind: (...a) => { p = a; return o; }, all: async () => ({ results: sq.prepare(sql).all(...p) }), first: async () => sq.prepare(sql).get(...p) ?? null }; return o; } };
env.MIGRATE_KEY = 'cle-secrete';
// --- données de l'ancienne base ---
sq.exec('PRAGMA foreign_keys = OFF');
for (let i = 1; i <= 5; i++) sq.prepare('INSERT INTO users (id, name, salt, hash, pack_ts, created, friend_code, coins, is_bot, drop_w, showcase) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(i * 3, i === 5 ? 'Ça "va" \'bien\'' : 'Joueur' + i, 's', 'h', 1700000000000 + i, 1700000000000, 'code' + i, i === 4 ? 1e9 : 100 + i, i === 4 ? 1 : 0, i === 2 ? '{"common":50}' : null, null);
for (let i = 1; i <= 400; i++) sq.prepare('INSERT INTO cards (id, title, extract, image, url, views, rarity, atk, def, shiny, enriched) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(1000 + i, 'Carte ' + i + (i % 7 ? '' : " d'été $1"), 'Texte é à ü "guillemets" \\ $2 ' + i, i % 3 ? 'https://img/' + i : null, '', i * 10, ['common', 'uncommon', 'rare', 'super', 'ultra', 'legendary'][i % 6], 100, 90, 0, 2);
for (let i = 1; i <= 400; i++) sq.prepare('INSERT INTO inventory (user_id, card_id, qty, acquired, rar, sh, skey, nk, fav) VALUES (?,?,?,?,?,?,?,?,?)').run(3 + 3 * (i % 5), 1000 + i, 1 + (i % 3), i % 4 ? 5000 + i : null, i % 6, 0, (i % 6) * 1e9 + i * 10, 'carte ' + i, 0);
sq.prepare("INSERT INTO inventory (user_id, card_id, qty, rar, sh, skey, nk, fav) VALUES (3, 99999999, 1, 0, 0, 0, 'orpheline', 0)").run();   // ligne orpheline : carte inexistante
for (let i = 1; i <= 30; i++) sq.prepare('INSERT INTO hits (user, title, shiny, ts) VALUES (?,?,?,?)').run('Joueur1', 'Carte ' + i, i % 2, 1700000000000 + i);
sq.prepare('INSERT INTO auctions (id, seller_id, card_id, start_price, bid, bidder_id, ends_at, status) VALUES (7, 3, 1001, 50, 60, 6, 1700000999999, ?)').run('open');
sq.prepare('INSERT INTO bids (auction_id, user_id, amount, ts) VALUES (7, 6, 60, 1700000000001)').run();
sq.prepare("INSERT INTO settings (key, value) VALUES ('vapid', '{\"k\":1}')").run();
sq.prepare('INSERT INTO dms (a, b, from_id, body, ts) VALUES (3, 6, 3, ?, 1700000000000)').run('Salut \'toi\' $1');
sq.prepare("INSERT INTO convs VALUES (3, 6, 1700000000000, 'Salut', 1, 0)").run();
// --- appels de l'API de migration ---
const mig = async b => { const r = await worker.fetch(new Request('http://x/api/migrate', { method: 'POST', body: JSON.stringify({ key: 'cle-secrete', ...b }) }), env, ctx); return [r.status, await r.json()]; };
let [s, r] = await mig({ key: 'mauvaise', step: 'tables' }); ok('mauvaise clé refusée', s === 403, J([s, r]));
let pg = await worker.fetch(new Request('http://x/migrate'), env, ctx); ok('page /migrate servie', pg.status === 200 && (await pg.text()).includes('Tout recopier'));
await DB.prepare("INSERT INTO users (name, salt, hash, pack_ts, created) VALUES ('Vieux','s','h',1,1)").run();   // des données déjà présentes : « reset » doit les vider
[s, r] = await mig({ step: 'reset' }); ok('reset', s === 200, J(r));
[s, r] = await mig({ step: 'tables' }); let skippedTotal = 0;
for (const t of r.tables) { let after = 0; for (;;) { const [s2, r2] = await mig({ step: 'copy', table: t, after }); if (s2 !== 200) { ok('copie ' + t, false, J(r2)); break; } skippedTotal += r2.skipped || 0; after = r2.next; if (r2.done) break; } }
[s, r] = await mig({ step: 'finish' }); ok('compteurs d\'identifiants', s === 200, J(r));
[s, r] = await mig({ step: 'counts' });
const bad = Object.entries(r.counts).filter(([t, [o, n]]) => o !== n); ok('mêmes nombres de lignes (sauf la ligne orpheline)', bad.length === 1 && bad[0][0] === 'inventory' && bad[0][1][0] - bad[0][1][1] === 1, J(bad));
ok('ligne orpheline ignorée sans bloquer le reste', skippedTotal === 1, skippedTotal);
const u = (await DB.prepare("SELECT name, coins, drop_w FROM users WHERE id IN (12, 15) ORDER BY id").all()).results; ok('valeurs spéciales conservées (guillemets, 1e9)', u[0].coins === 1000000000 && u[1].name === 'Ça "va" \'bien\'', J(u));
const c = (await DB.prepare("SELECT title, extract FROM cards WHERE id = 1007").first()); ok('texte avec $ et \\ intact', c.title === "Carte 7 d'été $1" && c.extract.includes('\\ $2'), J(c));
const h = await DB.prepare("SELECT username FROM hits LIMIT 1").first(); ok('hits.user -> username', h.username === 'Joueur1', J(h));
const nu = await DB.prepare("INSERT INTO users (name, salt, hash, pack_ts, created) VALUES ('Nouveau','s','h',1,1)").run(); ok('nouvel identifiant après la migration > ancien maximum', nu.meta.last_row_id > 15, J(nu.meta));
const nb = await DB.prepare("INSERT INTO bids (auction_id, user_id, amount, ts) VALUES (7, 6, 70, 1)").run(); ok('séquence des offres réglée', nb.meta.last_row_id > 1, J(nb.meta));
delete env.MIGRATE_KEY; [s] = await mig({ step: 'tables' }); ok('migration désactivable (sans clé : 404)', s === 404);
done();
