// Entretien de la base : ramasse-miettes des cartes inutilisées (sans toucher à rien d'utile) et petites purges.
import './api.mjs';
const { call, ok, DB, J, done, env } = globalThis.__T;
const { maintenance, gcCards, GC_BATCH } = await import('../src/maint.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
globalThis.__GC_MS = 0;
const reg = async n => { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); return r.token; };
await reg('Alice'); await reg('Bob');
const [alice, bob] = (await q('SELECT id FROM users ORDER BY id')).map(r => +r.id);
const base = 8000000;   // ids de test
for (let i = 1; i <= 40; i++) await q("INSERT INTO cards (id, title, rarity, views) VALUES (?, ?, 'common', 10)", base + i, 'Carte ' + i);
// utilisées de toutes les manières : 1 collection, 2 vues, 3 enchère, 4 échange, 5 vente, 6 favori, 7 alerte, 8 réserve, 9 paquet préparé, 10 expédition, 11 attendue, 12 légendaire prise
await q("INSERT INTO inventory (user_id, card_id, qty, acquired, rar) VALUES (?, ?, 1, 1, 0)", alice, base + 1);
await q("INSERT INTO card_seen (user_id, card_id, ts) VALUES (?, ?, 1)", alice, base + 2);
await q("INSERT INTO auctions (seller_id, card_id, start_price, bid, ends_at, status) VALUES (?, ?, 5, 0, ?, 'open')", alice, base + 3, Date.now() + 1e7);
await q("INSERT INTO trades (from_id, to_id, offer_card, want_card, price, status, created) VALUES (?, ?, ?, NULL, 5, 'pending', 1)", alice, bob, base + 4);
await q("INSERT INTO sales (card_id, price, ts) VALUES (?, 5, 1)", base + 5);
await q("INSERT INTO favorites (user_id, card_id, ts) VALUES (?, ?, 1)", alice, base + 6);
await q("INSERT INTO price_alerts (user_id, card_id, dir, price) VALUES (?, ?, 'up', 5)", alice, base + 7);
await q("INSERT INTO reserve (id, rarity, rank) VALUES (?, 'common', 1)", base + 8);
await q("INSERT INTO prepared (user_id, cards, ts, w) VALUES (?, ?, 1, '')", alice, JSON.stringify([{ id: base + 9, title: 'x' }, { id: base + 99, title: 'y' }]));
await q("INSERT INTO expeditions (user_id, cards, hours, started, ends, rc, status) VALUES (?, ?, 1, 1, 2, 0, 'out')", alice, JSON.stringify([{ id: base + 10, n: 1 }]));
await q("INSERT INTO wanted (card_id, at) VALUES (?, 1)", base + 11);
await q("INSERT INTO legend_taken (card_id, ts) VALUES (?, 1)", base + 12);
await q("INSERT INTO cards (id, title, rarity, views) VALUES (?, 'Carte événement', 'common', 1) ON CONFLICT DO NOTHING", 200000123);
const nCards = async () => +(await q('SELECT COUNT(*) n FROM cards WHERE id >= ? AND id < ?', base, base + 100))[0].n;
const before = await nCards();
const gone = await gcCards(env);
const left = (await q('SELECT id FROM cards WHERE id >= ? AND id < ? ORDER BY id', base, base + 100)).map(r => r.id - base);
ok('ramasse-miettes : les cartes inutilisées sont supprimées', gone >= 28 && before - (await nCards()) === gone, J({ gone, before, after: await nCards() }));
ok('toutes les cartes encore utiles sont conservées (collection, vues, enchère, échange, vente, favori, alerte, réserve, paquet préparé, expédition, attendue, légendaire)', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(n => left.includes(n)), J(left));
ok('une carte d\'événement n\'est jamais supprimée', (await q('SELECT 1 FROM cards WHERE id = 200000123')).length === 1);
ok('le curseur repart du début quand la fin de la table est atteinte', (await q("SELECT value FROM settings WHERE key = 'cards_gc_cursor'"))[0].value === '0');
globalThis.__GC_MS = 3600000;
ok('au plus un lot par heure', await gcCards(env) === 0);
// petites purges : vieux journaux, empreintes, notifications
await q("INSERT INTO logs (ts, level, kind, usr, route, status, ms, detail) VALUES (?, 'info', 'action', 'x', 'POST /x', 200, 1, '')", Date.now() - 20 * 86400000);
await q("INSERT INTO event_progress (key, user_id, n) VALUES ('ip:aaaa', ?, ?)", alice, Math.floor((Date.now() - 100 * 86400000) / 1000));
await q("INSERT INTO event_progress (key, user_id, n) VALUES ('ip:bbbb', ?, ?)", alice, Math.floor(Date.now() / 1000));
globalThis.__GC_MS = 0;
const m = await maintenance(env);
ok('entretien : journal de plus de 14 jours supprimé', (await q("SELECT COUNT(*) n FROM logs WHERE ts < ?", Date.now() - 15 * 86400000))[0].n === 0 && m.purge === true);
ok('entretien : empreintes de plus de 90 jours supprimées, les récentes gardées', (await q("SELECT key FROM event_progress WHERE key LIKE 'ip:%'")).map(r => r.key).join() === 'ip:bbbb');
done();
