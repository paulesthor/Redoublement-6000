// Échanges : vente directe d'une carte contre des pièces à un joueur précis (sans passer par les enchères).
import './api.mjs';
const { call, settle, ok, DB, J, done } = globalThis.__T;
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Cleo', password: 'secret3' }); const C = r.token;
const [alice, bob, cleo] = (await q("SELECT id FROM users WHERE name IN ('Alice','Bob','Cleo') ORDER BY id")).map(x => +x.id);
for (let i = 0; i < 3; i++) await call(A, 'POST', '/api/packs/open', {}); await settle();
const cards = await q('SELECT card_id, qty FROM inventory WHERE user_id = ? ORDER BY card_id', alice), card = cards[0].card_id;
const coins = async id => +(await q('SELECT coins FROM users WHERE id = ?', id))[0].coins, has = async (id, c) => +((await q('SELECT qty FROM inventory WHERE user_id = ? AND card_id = ?', id, c))[0]?.qty ?? 0);
await q('UPDATE users SET coins = 1000 WHERE id IN (?,?,?)', alice, bob, cleo);
[s, r] = await call(A, 'POST', '/api/trades', { to: bob, offer_card: card, price: 0 }); ok('prix nul refusé', s === 400, J([s, r]));
[s, r] = await call(A, 'POST', '/api/trades', { to: bob, offer_card: card, price: 5000000 }); ok('prix trop élevé refusé', s === 400, J([s, r]));
[s, r] = await call(A, 'POST', '/api/trades', { to: alice, offer_card: card, price: 100 }); ok('pas de vente à soi-même', s === 400, J([s, r]));
[s, r] = await call(B, 'POST', '/api/trades', { to: alice, offer_card: card, price: 100 }); ok('on ne vend que ce qu\'on possède', s === 400, J([s, r]));
[s, r] = await call(A, 'POST', '/api/trades', { to: bob, offer_card: card, price: 300 }); ok('vente proposée à Bob pour 300', s === 200, J([s, r]));
[s, r] = await call(B, 'GET', '/api/trades'); const t = r.trades[0]; ok('Bob voit l\'offre : carte et prix, sans carte demandée', r.trades.length === 1 && t.price === 300 && t.want_id === null && t.offer_id === card && t.from_name === 'Alice', J(r));
[s, r] = await call(A, 'GET', '/api/trades'); ok('Alice la voit aussi (en attente)', r.trades.length === 1 && r.trades[0].price === 300);
[s] = await call(C, 'POST', `/api/trades/${t.id}/accept`, {}); ok('un autre joueur ne peut pas l\'accepter', s === 403, s);
[s] = await call(A, 'POST', `/api/trades/${t.id}/accept`, {}); ok('le vendeur ne peut pas accepter sa propre offre', s === 403, s);
await q('UPDATE users SET coins = 100 WHERE id = ?', bob);
[s, r] = await call(B, 'POST', `/api/trades/${t.id}/accept`, {}); ok('pas assez de pièces : refusé, rien ne bouge', s === 400 && await coins(bob) === 100 && await coins(alice) === 1000 && await has(alice, card) >= 1 && (await call(B, 'GET', '/api/trades'))[1].trades.length === 1, J([s, r]));
await q('UPDATE users SET coins = 1000 WHERE id = ?', bob);
const before = await has(alice, card), salesBefore = +(await q('SELECT COUNT(*) n FROM sales'))[0].n;
[s, r] = await call(B, 'POST', `/api/trades/${t.id}/accept`, {}); ok('achat accepté', s === 200, J([s, r]));
ok('Bob paie 300 et reçoit la carte', await coins(bob) === 700 && await has(bob, card) === 1);
ok('Alice reçoit 300 et perd la carte', await coins(alice) === 1300 && await has(alice, card) === before - 1);
ok('la vente directe n\'entre pas dans le cours du marché', +(await q('SELECT COUNT(*) n FROM sales'))[0].n === salesBefore);
ok('l\'offre n\'est plus en attente', (await call(B, 'GET', '/api/trades'))[1].trades.length === 0);
[s] = await call(B, 'POST', `/api/trades/${t.id}/accept`, {}); ok('on ne l\'accepte pas deux fois', s === 404, s);
// vendeur qui n'a plus la carte : l'acheteur est remboursé
const card2 = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND card_id <> ? LIMIT 1', alice, card))[0].card_id;
[s] = await call(A, 'POST', '/api/trades', { to: cleo, offer_card: card2, price: 200 }); const t2 = (await call(C, 'GET', '/api/trades'))[1].trades[0];
await q('DELETE FROM inventory WHERE user_id = ? AND card_id = ?', alice, card2);
[s, r] = await call(C, 'POST', `/api/trades/${t2.id}/accept`, {}); ok('le vendeur n\'a plus la carte : refusé, acheteur non débité', s === 400 && await coins(cleo) === 1000, J([s, r, await coins(cleo)]));
// refus et annulation
const card3 = (await q('SELECT card_id FROM inventory WHERE user_id = ? LIMIT 1', alice))[0].card_id;
await call(A, 'POST', '/api/trades', { to: bob, offer_card: card3, price: 50 }); const t3 = (await call(B, 'GET', '/api/trades'))[1].trades.find(x => x.price === 50);
[s] = await call(B, 'POST', `/api/trades/${t3.id}/decline`, {}); ok('refus de l\'offre', s === 200 && await coins(bob) === 700);
await call(A, 'POST', '/api/trades', { to: bob, offer_card: card3, price: 60 }); const t4 = (await call(A, 'GET', '/api/trades'))[1].trades.find(x => x.price === 60);
[s] = await call(A, 'POST', `/api/trades/${t4.id}/cancel`, {}); ok('annulation par le vendeur', s === 200);
// l'échange carte contre carte fonctionne toujours
const bobCard = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND card_id <> ? LIMIT 1', bob, card3));
await call(B, 'POST', '/api/packs/open', {}); await settle();
const bc = (await q('SELECT card_id FROM inventory WHERE user_id = ? AND card_id NOT IN (SELECT card_id FROM inventory WHERE user_id = ?) LIMIT 1', bob, alice))[0]?.card_id;
if (bc) { [s] = await call(A, 'POST', '/api/trades', { to: bob, offer_card: card3, want_card: bc }); const t5 = (await call(B, 'GET', '/api/trades'))[1].trades.find(x => x.want_id === bc);
  [s] = await call(B, 'POST', `/api/trades/${t5.id}/accept`, {}); ok('échange carte contre carte toujours possible', s === 200 && await has(bob, card3) >= 1 && await has(alice, bc) >= 1, s); }
done();
