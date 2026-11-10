// Paquets jamais perdus : si l'ouverture échoue ET que le remboursement échoue aussi, le marqueur rembourse plus tard (une seule fois).
import './api.mjs';
const { call, ok, DB, J, done, env, worker, ctx, settle } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const [, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret1' }); const B = r.token;
await q("UPDATE users SET pack_stock = 3 WHERE name = 'Bob'");
const stock = async () => +(await q("SELECT pack_stock s FROM users WHERE name = 'Bob'"))[0].s;
const markers = async () => +(await q("SELECT COUNT(*) n FROM event_progress WHERE key LIKE 'po:%'"))[0].n;
// 1. ouverture normale : un paquet de moins, aucun marqueur restant
let [s, o] = await call(B, 'POST', '/api/packs/open', {}); ok('ouverture normale : 10 cartes, stock -1, marqueur effacé', s === 200 && o.cards?.length === 10 && await stock() === 2 && await markers() === 0, J({ s, st: await stock(), m: await markers() }));
// 2. ouverture abandonnée (Worker interrompu) : paquet pris, marqueur resté, rien d'autre
await q("UPDATE users SET pack_stock = pack_stock - 1 WHERE name = 'Bob'");
const uid = +(await q("SELECT id FROM users WHERE name = 'Bob'"))[0].id, old = Math.floor(Date.now() / 1000) - 400;
await q("INSERT INTO event_progress (key, user_id, n) VALUES ('po:o:" + old + ":aa', ?, ?)", uid, old);
ok('ouverture abandonnée : paquet manquant', await stock() === 1);
await call(B, 'GET', '/api/me'); await settle();
ok('à la réouverture de l\'appli : le paquet est rendu et le marqueur effacé', await stock() === 2 && await markers() === 0, J({ st: await stock(), m: await markers() }));
await call(B, 'GET', '/api/me'); await worker.scheduled({}, { ...env }, ctx); await settle();
ok('pas de second remboursement', await stock() === 2);
// 3. marqueur récent : pas encore rendu (l'ouverture est peut-être en cours)
const now = Math.floor(Date.now() / 1000);
await q("INSERT INTO event_progress (key, user_id, n) VALUES ('po:o:" + now + ":bb', ?, ?)", uid, now);
await worker.scheduled({}, { ...env }, ctx); await settle();
ok('marqueur récent : laissé tranquille', await stock() === 2 && await markers() === 1);
await q("DELETE FROM event_progress WHERE key LIKE 'po:%'");
// 4. achat abandonné : les pièces sont rendues par la tâche planifiée
await q("UPDATE users SET coins = 1000 WHERE name = 'Bob'");
await q("UPDATE users SET coins = coins - 50 WHERE name = 'Bob'");
await q("INSERT INTO event_progress (key, user_id, n) VALUES ('po:b50:" + old + ":cc', ?, ?)", uid, old);
await worker.scheduled({}, { ...env }, ctx); await settle();
ok('achat abandonné : 50 pièces rendues par la tâche planifiée', +(await q("SELECT coins c FROM users WHERE name = 'Bob'"))[0].c === 1000 && await markers() === 0);
// 5. le tirage échoue PUIS le remboursement échoue aussi : le marqueur sauve le paquet
await q("UPDATE users SET pack_stock = 4 WHERE name = 'Bob'"); await q('DELETE FROM reserve'); await q('DELETE FROM prepared');
const realFetch = globalThis.fetch, realBatch = DB.batch;
globalThis.fetch = async () => { throw new Error('Wikipédia injoignable'); };
DB.batch = async list => { if (list.some(x => /pack_stock \+ 1|packs_opened \+ 1/.test(x._sql))) throw new Error('Too many subrequests'); return realBatch.call(DB, list); };
globalThis.__NO_DRAW = true;
[s, o] = await call(B, 'POST', '/api/packs/open', {});
globalThis.fetch = realFetch; DB.batch = realBatch;
const lost = 4 - await stock();
if (s === 200) console.log('  (tirage réussi malgré tout : scénario non reproduit, s=200)');
else { ok('tirage en échec : erreur renvoyée', s >= 400, J([s, o]));
  ok('remboursement en échec aussi : paquet manquant mais marqueur présent', lost === 1 && await markers() === 1, J({ lost, m: await markers() }));
  await q("UPDATE event_progress SET n = n - 400 WHERE key LIKE 'po:%'");
  await worker.scheduled({}, { ...env }, ctx); await settle();
  ok('la tâche planifiée rend le paquet, une seule fois', await stock() === 4 && await markers() === 0, J({ st: await stock() })); }
done();
