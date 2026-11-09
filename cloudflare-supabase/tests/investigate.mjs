// Enquête anti-triche (lecture seule) : dernier joueur créé, échanges avec un autre joueur, alertes.
import './api.mjs';
const { call, ok, DB, J, done } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
const reg = async n => { const [, r] = await call(null, 'POST', '/api/register', { name: n, password: 'secret1' }); return r.token; };
const ADM = await reg('Chef'), OLD = await reg('Ancien'), NEW = await reg('Nouveau');
await q("UPDATE users SET is_admin = 1 WHERE name = 'Chef'");
const id = async n => +(await q('SELECT id FROM users WHERE name = ?', n))[0].id; const oid = await id('Ancien'), nid = await id('Nouveau');
let [s, v] = await call(OLD, 'GET', '/api/admin/investigate'); ok('réservé à l\'administrateur', s === 403, s);
[s, v] = await call(ADM, 'GET', '/api/admin/investigate'); ok('sans nom : le dernier joueur créé est examiné', s === 200 && v.player.name === 'Nouveau', J(v.player));
[s] = await call(ADM, 'GET', '/api/admin/investigate?name=Fantome'); ok('joueur introuvable : 404', s === 404, s);
ok('aucune relation : rapport vide', v.peers.length === 0 && v.flags.length === 0, J(v.flags));
// scénario de triche : l'ancien donne des cartes au nouveau (prix 0) et lui envoie beaucoup de pièces en enchères
for (const c of [901, 902, 903]) await q("INSERT INTO cards (id, title, rarity) VALUES (?, ?, 'legendary') ON CONFLICT DO NOTHING", c, 'Carte ' + c);
for (const c of [901, 902, 903]) await q("INSERT INTO trades (from_id, to_id, offer_card, want_card, price, status, created) VALUES (?, ?, ?, NULL, 0, 'done', ?)", oid, nid, c, Date.now());
await q("INSERT INTO trades (from_id, to_id, offer_card, want_card, price, status, created) VALUES (?, ?, 901, NULL, 5, 'done', ?)", oid, nid, Date.now());
await q("INSERT INTO auctions (seller_id, card_id, start_price, bid, bidder_id, ends_at, status) VALUES (?, 901, 10, 4000, ?, ?, 'sold')", oid, nid, Date.now());
await q("INSERT INTO dms (a, b, from_id, body, ts) VALUES (?, ?, ?, 'secret', ?)", Math.min(oid, nid), Math.max(oid, nid), oid, Date.now());
[s, v] = await call(ADM, 'GET', '/api/admin/investigate');
ok('relation détectée avec l\'ancien joueur', v.peers.length === 1 && v.peers[0].name === 'Ancien' && v.peers[0].trades === 4 && v.peers[0].auctionsBought === 1 && v.peers[0].dms === 1, J(v.peers));
ok('alertes : concentration sur un seul joueur, cartes données à 0 pièce, enchère gonflée, vente à prix dérisoire', v.flags.some(f => /% des échanges/.test(f)) && v.flags.some(f => /pour 0 pièce/.test(f)) && v.flags.some(f => /Enchère/.test(f)) && v.flags.some(f => /très éloigné/.test(f)), J(v.flags));
ok('le contenu des messages privés n\'est jamais renvoyé', !JSON.stringify(v).includes('secret'));
ok('enquête nominative aussi possible', (await call(ADM, 'GET', '/api/admin/investigate?name=ancien'))[1].player.name === 'Ancien');
done();
