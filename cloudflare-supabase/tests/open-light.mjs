// L'ouverture d'un paquet ne prépare plus le paquet suivant dans sa propre requête (limite de calcul du plan gratuit) : c'est /api/packs/next qui s'en charge.
import './api.mjs';
const { call, ok, DB, J, done, settle } = globalThis.__T;
const q = async sql => (await DB.prepare(sql).all()).results;
const [, a] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret1' }); const B = a.token;
await DB.prepare("UPDATE users SET pack_stock = 20 WHERE name = 'Bob'").run();
for (let i = 0; i < 3; i++) await call(B, 'POST', '/api/packs/open', {});
await settle();
ok('trois ouvertures : aucun paquet préparé dans leurs requêtes', +(await q('SELECT COUNT(*) n FROM prepared'))[0].n === 0, J(await q('SELECT COUNT(*) n FROM prepared')));
const [s] = await call(B, 'GET', '/api/packs/next'); await settle();
ok('/api/packs/next prépare le paquet suivant', s === 200 && +(await q('SELECT COUNT(*) n FROM prepared'))[0].n >= 1);
const [s2, r2] = await call(B, 'POST', '/api/packs/open', {}); ok('l\'ouverture suivante utilise le paquet préparé', s2 === 200 && r2.cards.length === 10 && +(await q('SELECT COUNT(*) n FROM prepared'))[0].n === 0);
done();
