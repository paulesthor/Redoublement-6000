// Joueurs simulés : jamais d'offre au-dessus du prix du marché (à 3 % près), même si les ventes sont truquées.
import './api.mjs';
const { call, settle, ok, DB, J, done } = globalThis.__T;
const { botRef, botValue, botCap, botPrice } = await import('../src/index.js');
const q = async (sql, ...p) => (await DB.prepare(sql).bind(...p).all()).results;
// 1) valeurs de référence
ok('référence : indépendante des ventes', botRef('ultra', 50000) === botRef('ultra', 50000) && botRef('legendary', 100000) > botRef('ultra', 100000) && botRef('ultra', 100000) > botRef('common', 100000));
ok('prix du marché sans vente = référence', botValue('ultra', 20000, null) === botRef('ultra', 20000));
ok('ventes truquées (moyenne énorme) : valeur plafonnée à 1,5 × la référence', botValue('ultra', 20000, 1e6) <= botRef('ultra', 20000) * 1.5 + 1e-9, J(botValue('ultra', 20000, 1e6)));
ok('ventes très basses : valeur plancher à la moitié de la référence', botValue('ultra', 20000, 1) >= botRef('ultra', 20000) * .5 - 1e-9);
ok('offre maximale = prix du marché + 3 % au plus', [10, 100, 280, 5000].every(v => botCap(v) <= v * 1.03 + 1));
ok('prix de départ des ventes simulées : autour du marché (0,8 à 1,2)', Array.from({ length: 200 }, () => botPrice('rare', 30000, 40)).every(p => p >= 40 * .8 - 1 && p <= 40 * 1.2 + 1));
// 2) bots en situation : un joueur met une carte en vente, avec des ventes passées truquées à un prix absurde
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
for (let i = 0; i < 6; i++) await call(A, 'POST', '/api/packs/open', {}); await settle();
const alice = (await q('SELECT id FROM users WHERE is_bot = 0'))[0].id;
await q('UPDATE users SET coins = 100000, is_admin = 1 WHERE id = ?', alice); await call(A, 'POST', '/api/admin/run', { action: 'bots' }); await settle();
const cards = (await q('SELECT i.card_id, c.rarity, c.views FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ? ORDER BY i.card_id', alice)).slice(0, 6);
const rnd = Math.random; let botBids = 0;
async function market(card, fakeAvg, start) {
  await q('DELETE FROM sales WHERE card_id = ?', card.card_id);
  if (fakeAvg) for (let i = 0; i < 10; i++) await q('INSERT INTO sales (card_id, price, ts) VALUES (?,?,?)', card.card_id, fakeAvg, Date.now());
  await q("UPDATE auctions SET status = 'expired' WHERE status = 'open'");
  [s] = await call(A, 'POST', '/api/auctions', { card_id: card.card_id, price: start, minutes: 600 }); if (s !== 200) throw new Error('mise en vente refusée ' + s);
  const aid = (await q('SELECT id FROM auctions WHERE seller_id = ? ORDER BY id DESC LIMIT 1', alice))[0].id;
  Math.random = () => 0.0001;
  try { for (let i = 0; i < 12; i++) await call(A, 'POST', '/api/admin/run', { action: 'bots' }); } finally { Math.random = rnd; }
  await settle();
  const a = (await q('SELECT bid, bidder_id FROM auctions WHERE id = ?', aid))[0], bot = a.bidder_id && (await q('SELECT is_bot FROM users WHERE id = ?', a.bidder_id))[0].is_bot;
  if (bot) botBids++;
  return { bid: a.bid, bot: !!bot, cap: botCap(botValue(card.rarity, card.views, fakeAvg || null)) };
}
for (const c of cards.slice(0, 4)) {
  const cap = botCap(botValue(c.rarity, c.views, 1e6));
  const m = await market(c, 1e6, 1);                              // 10 ventes truquées à 1 000 000 : les bots ne montent jamais plus haut que le plafond
  ok(`ventes truquées (${c.rarity}) : le bot n'enchérit jamais au-dessus de ${cap}`, !m.bot || m.bid <= cap, J([m, cap]));
}
const c0 = cards[4], capNo = botCap(botValue(c0.rarity, c0.views, null));
let m = await market(c0, 0, capNo * 5 + 50);                      // prix de départ très au-dessus du marché : aucune offre
ok('prix de départ au-dessus du marché : aucun bot n\'enchérit', !m.bot, J([m, capNo]));
const c1 = cards[5], capOk = botCap(botValue(c1.rarity, c1.views, null));
m = await market(c1, 0, Math.max(1, Math.floor(capOk / 2)));      // prix raisonnable : les bots peuvent acheter, mais jamais au-dessus du plafond
ok('prix raisonnable : si un bot enchérit, c\'est au plus au prix du marché', !m.bot || m.bid <= capOk, J([m, capOk]));
ok('les bots restent actifs : au moins une offre dans les scénarios', botBids >= 2, botBids);
// quota : au plus 5 ventes par jour à des joueurs simulés pour un même joueur
{ await q("UPDATE auctions SET status = 'expired' WHERE status = 'open'"); await q('DELETE FROM bids');
  const cheap = (await q('SELECT i.card_id FROM inventory i WHERE i.user_id = ? AND i.rar < 5 ORDER BY i.card_id', alice)).map(x => x.card_id).slice(0, 8); const mine = [];
  for (const id of cheap) { await q('DELETE FROM sales WHERE card_id = ?', id); [s] = await call(A, 'POST', '/api/auctions', { card_id: id, price: 1, minutes: 600 }); if (s === 200) mine.push(id); }
  Math.random = () => 0.0001; try { for (let i = 0; i < 40; i++) await call(A, 'POST', '/api/admin/run', { action: 'bots' }); } finally { Math.random = rnd; } await settle();
  const led = (await q('SELECT COUNT(*) n FROM auctions a JOIN users u ON u.id = a.bidder_id WHERE a.seller_id = ? AND u.is_bot = 1 AND a.status = \'open\'', alice))[0].n;
  ok(`${mine.length} cartes en vente : les joueurs simulés n'en prennent que 5 au plus`, mine.length >= 6 && +led >= 3 && +led <= 5, J([mine.length, led]));
  // le lendemain : les ventes d'hier ne comptent plus, le quota est renouvelé
  await q("UPDATE auctions SET status = 'sold', ends_at = ? WHERE seller_id = ? AND bidder_id IN (SELECT id FROM users WHERE is_bot = 1)", Date.now() - 26 * 3600000, alice);
  Math.random = () => 0.0001; try { for (let i = 0; i < 30; i++) await call(A, 'POST', '/api/admin/run', { action: 'bots' }); } finally { Math.random = rnd; }
  await settle(); ok('le jour suivant : le quota est renouvelé', +(await q('SELECT COUNT(*) n FROM auctions a JOIN users u ON u.id = a.bidder_id WHERE a.seller_id = ? AND u.is_bot = 1 AND a.status = \'open\'', alice))[0].n >= 1); }
done();
