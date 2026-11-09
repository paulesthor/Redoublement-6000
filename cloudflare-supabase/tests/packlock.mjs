// Verrou d'ouverture des paquets pendant une maintenance volontaire de la base.
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const reg = async n => { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); return r.token; };
const ADM = await reg('Chef'), BOB = await reg('Bob'); await q("UPDATE users SET is_admin = 1 WHERE name = 'Chef'"); await q('UPDATE users SET pack_stock = 5, coins = 1000 WHERE name = ?', 'Bob');
let [s, v] = await call(BOB, 'GET', '/api/me'); ok('sans verrou : /me sans message', s === 200 && !v.packLock);
const MSG = 'Maintenance volontaire de la base : l\'ouverture des paquets est suspendue quelques minutes. Ce n\'est pas un bug.';
await q("INSERT INTO settings (key, value) VALUES ('pack_lock', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", MSG);
[s, v] = await call(BOB, 'GET', '/api/me'); ok('verrou posé : /me annonce la maintenance', v.packLock === MSG, J(v).slice(0, 80));
for (const [path, body] of [['/api/packs/open', {}], ['/api/packs/buy', {}], ['/api/commu/open', {}], ['/api/commu/buy', { n: 1 }], ['/api/expeditions/1/collect', {}]]) { [s, v] = await call(BOB, 'POST', path, body); ok(`verrou : ${path} refusé avec le message`, s === 503 && v.packLock === true && v.error === MSG, `${s} ${J(v).slice(0, 80)}`); }
[s] = await call(BOB, 'GET', '/api/packs/next'); ok('le reste du jeu reste ouvert (lecture de la distribution)', s === 200, s);
[s] = await call(BOB, 'GET', '/api/auctions'); ok('les enchères restent ouvertes', s === 200, s);
[s, v] = await call(ADM, 'GET', '/api/me'); ok('l\'administrateur n\'est pas bloqué', !v.packLock);
await q("DELETE FROM settings WHERE key = 'pack_lock'");
[s, v] = await call(BOB, 'POST', '/api/packs/open', {}); ok('verrou levé : l\'ouverture refonctionne', s === 200 && v.cards?.length > 0, `${s} ${J(v).slice(0, 80)}`);
done();
