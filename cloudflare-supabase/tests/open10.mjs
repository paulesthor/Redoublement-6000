// Ouvrir 10 paquets d'un coup.
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
await q('UPDATE users SET pack_stock = 25 WHERE id = 1');
[s, r] = await call(A, 'POST', '/api/packs/open10', {});
ok('dix tirages de dix cartes', s === 200 && r.packs.length === 10 && r.packs.every(p => p.cards.length === 10), J([s, r.packs?.length]));
ok('dix boosters débités', +(await q('SELECT pack_stock FROM users WHERE id = 1'))[0].pack_stock === 15);
ok('compteur de paquets ouverts à jour', +(await q('SELECT packs_opened FROM users WHERE id = 1'))[0].packs_opened === 10);
ok('toutes les cartes sont dans la collection', +(await q('SELECT COUNT(*) n FROM inventory WHERE user_id = 1'))[0].n >= 10);
[s, r] = await call(A, 'POST', '/api/packs/open10', {}); ok('deuxième lot de dix', s === 200 && r.packs.length === 10);
[s, r] = await call(A, 'POST', '/api/packs/open10', {}); ok('moins de dix boosters : refusé, rien débité', s === 400 && +(await q('SELECT pack_stock FROM users WHERE id = 1'))[0].pack_stock === 5, J([s, r]));
done();
