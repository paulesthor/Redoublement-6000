'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const { db, tx } = require('./db');
const live = require('./live');
const CFG = require('./config');

const PORT = +process.env.PORT || 3000;
const { PACK_EVERY, PACK_MAX, PACK_SIZE, SELL, POINTS, RARITIES } = CFG;
const RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]));
const caseSql = (col, map) => `CASE ${col} ${RARITIES.map(r => `WHEN '${r}' THEN ${map[r]}`).join(' ')} END`;

// ---------- utilitaires ----------
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (msg, code = 400) => { throw new HttpError(code, msg); };
const now = () => Date.now();
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 32).toString('hex'); }
function userFromToken(token) {
  if (!token) return null;
  return one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', token) || null;
}
function refreshPacks(u) {
  const elapsed = Math.floor((now() - u.pack_ts) / PACK_EVERY);
  if (elapsed > 0) {
    const stock = Math.min(PACK_MAX, u.pack_stock + elapsed);
    const ts = stock >= PACK_MAX ? now() : u.pack_ts + elapsed * PACK_EVERY;
    run('UPDATE users SET pack_stock=?, pack_ts=? WHERE id=?', stock, ts, u.id);
    u.pack_stock = stock; u.pack_ts = ts;
  }
  return u;
}
const publicUser = u => ({
  id: u.id, name: u.name, coins: u.coins, packs: u.pack_stock, wins: u.duel_wins, losses: u.duel_losses,
  nextPackIn: u.pack_stock >= PACK_MAX ? 0 : Math.max(0, u.pack_ts + PACK_EVERY - now()),
});
const addCard = (uid, cid, n = 1) => run(
  'INSERT INTO inventory (user_id, card_id, qty) VALUES (?,?,?) ON CONFLICT(user_id, card_id) DO UPDATE SET qty = qty + excluded.qty', uid, cid, n);
function takeCard(uid, cid) {
  const r = run('UPDATE inventory SET qty = qty - 1 WHERE user_id=? AND card_id=? AND qty > 0', uid, cid);
  if (!r.changes) bad('Tu ne possèdes pas cette carte');
  run('DELETE FROM inventory WHERE user_id=? AND card_id=? AND qty <= 0', uid, cid);
}
// ---- tirage : rareté pondérée (config.DROP), puis page tirée uniformément dans cette rareté ----
function drawRarity(min = 0) {
  const avail = RARITIES.filter(r => RANK[r] >= min && live.total(r) > 0);
  if (!avail.length) bad('Catalogue vide : lance `npm run seed --dump` (ou `npm run seed:sample`)', 503);
  let roll = Math.random() * avail.reduce((s, r) => s + CFG.DROP[r], 0);
  for (const r of avail) { if ((roll -= CFG.DROP[r]) < 0) return r; }
  return avail.at(-1);
}
function drawCard(min = 0) {
  const r = drawRarity(min);
  let id = live.take(r) ?? live.randomId(r); // réserve déjà enrichie, sinon tirage direct dans la base
  if (id == null) bad('Catalogue vide', 503);
  live.ensureStats(id);
  if (r === 'legendary' && Math.random() < CFG.SHINY_CHANCE) id = live.toShiny(id);
  return id;
}
/** Tire un booster complet : la rareté dépend uniquement de la chance (aucune garantie). */
function drawPack() {
  // pages distinctes dans un même booster (re-tirage si doublon, borné pour les très petits catalogues)
  const pages = new Set(), ids = [];
  while (ids.length < PACK_SIZE) {
    let id;
    for (let tries = 0; tries < 30; tries++) {
      id = drawCard();
      if (!pages.has(id % 100000000)) break;
    }
    pages.add(id % 100000000); ids.push(id);
  }
  return ids;
}
function cardRows(ids) {
  return ids.length ? all(`SELECT * FROM cards WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
}

// ---------- WebSocket : présence + push ----------
const clients = new Map(); // userId -> Set<ws>
function push(uid, msg) {
  const s = clients.get(uid); if (!s) return;
  const data = JSON.stringify(msg);
  for (const ws of s) if (ws.readyState === 1) ws.send(data);
}
function broadcast(msg) { for (const uid of clients.keys()) push(uid, msg); }
const onlineIds = () => [...clients.keys()];
const sendPresence = () => broadcast({ t: 'online', ids: onlineIds() });

// ---------- duels de quiz ----------
const duels = new Map(); // id -> duel
const Q_COUNT = 5, Q_TIME = 15000;
function mask(extract, title) {
  const words = title.split(/\s+/).filter(w => w.length > 2).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  let t = extract.slice(0, 280);
  if (words.length) t = t.replace(new RegExp(words.join('|'), 'gi'), '█████');
  return t;
}
function makeQuestions() {
  // questions bâties sur des cartes déjà enrichies (description disponible)
  const cards = all("SELECT id, title, extract, views FROM cards WHERE enriched >= 1 AND shiny = 0 AND length(extract) > 80 ORDER BY RANDOM() LIMIT ?", Q_COUNT * 4);
  if (cards.length < 8) bad('Pas assez de cartes enrichies pour un duel : ouvre quelques boosters d’abord', 503);
  const qs = [];
  for (let i = 0; i < Q_COUNT; i++) {
    const g = cards.splice(0, 4);
    if (i % 2 === 0 || g.length < 4) {
      const opts = g.map(c => c.title).sort(() => Math.random() - 0.5);
      qs.push({ text: `Quel article Wikipédia est décrit ici ?\n« ${mask(g[0].extract, g[0].title)} »`, options: opts, answer: opts.indexOf(g[0].title) });
    } else {
      const opts = g.map(c => c.title);
      const best = g.reduce((a, c) => (c.views > a.views ? c : a));
      qs.push({ text: 'Lequel de ces articles est le plus consulté sur Wikipédia ?', options: opts, answer: opts.indexOf(best.title) });
    }
  }
  return qs;
}
function startDuel(a, b) {
  const d = { id: crypto.randomUUID(), players: [a.id, b.id], names: { [a.id]: a.name, [b.id]: b.name },
    score: { [a.id]: 0, [b.id]: 0 }, qs: makeQuestions(), i: -1, answers: {}, timer: null, over: false };
  duels.set(d.id, d);
  for (const p of d.players) push(p, { t: 'duel_start', id: d.id, names: d.names, total: Q_COUNT });
  setTimeout(() => nextQuestion(d), 1500);
}
function nextQuestion(d) {
  if (d.over) return;
  d.i++; d.answers = {};
  if (d.i >= Q_COUNT) return endDuel(d);
  const q = d.qs[d.i]; d.qStart = now();
  for (const p of d.players) push(p, { t: 'question', id: d.id, n: d.i + 1, total: Q_COUNT, text: q.text, options: q.options, time: Q_TIME });
  d.timer = setTimeout(() => closeQuestion(d), Q_TIME + 500);
}
function closeQuestion(d) {
  clearTimeout(d.timer);
  const q = d.qs[d.i];
  for (const p of d.players) push(p, { t: 'reveal', id: d.id, answer: q.answer, score: d.score, picks: d.answers });
  setTimeout(() => nextQuestion(d), 2500);
}
function endDuel(d) {
  d.over = true; duels.delete(d.id);
  const [a, b] = d.players, sa = d.score[a], sb = d.score[b];
  const win = sa === sb ? null : sa > sb ? a : b;
  tx(() => {
    for (const p of d.players) {
      const gain = win === null ? CFG.QUIZ_DRAW : p === win ? CFG.QUIZ_WIN : CFG.QUIZ_LOSE;
      run('UPDATE users SET coins = coins + ?, duel_wins = duel_wins + ?, duel_losses = duel_losses + ? WHERE id=?',
        gain, p === win ? 1 : 0, win !== null && p !== win ? 1 : 0, p);
    }
  });
  for (const p of d.players) push(p, { t: 'duel_end', id: d.id, score: d.score, names: d.names, winner: win });
}
// ---------- combats de cartes ----------
const battles = new Map();
function startBattle(a, b) {
  const bt = { id: crypto.randomUUID(), players: [a.id, b.id], names: { [a.id]: a.name, [b.id]: b.name }, picks: {} };
  battles.set(bt.id, bt);
  for (const p of bt.players) push(p, { t: 'battle_start', id: bt.id, names: bt.names, rounds: CFG.BATTLE_ROUNDS });
  bt.timer = setTimeout(() => { // un joueur n'a pas choisi : forfait
    if (!battles.has(bt.id)) return;
    battles.delete(bt.id);
    for (const p of bt.players) push(p, { t: 'info', msg: 'Combat annulé : équipe non choisie à temps.' });
    for (const p of bt.players) push(p, { t: 'battle_cancel' });
  }, 90000);
}
function resolveBattle(bt) {
  clearTimeout(bt.timer); battles.delete(bt.id);
  const [a, b] = bt.players;
  const team = uid => cardRows(bt.picks[uid]).reduce((m, c) => (m[c.id] = c, m), {});
  const ta = team(a), tb = team(b);
  const rounds = []; const wins = { [a]: 0, [b]: 0 }; const dmg = { [a]: 0, [b]: 0 };
  for (let i = 0; i < CFG.BATTLE_ROUNDS; i++) {
    const ca = ta[bt.picks[a][i]], cb = tb[bt.picks[b][i]];
    const hit = (x, y) => Math.max(1, x.atk - y.def * 0.5) * (0.9 + Math.random() * 0.2);
    const da = hit(ca, cb), db_ = hit(cb, ca);
    dmg[a] += da; dmg[b] += db_;
    const w = da === db_ ? null : da > db_ ? a : b;
    if (w) wins[w]++;
    rounds.push({ a: ca, b: cb, da: Math.round(da), db: Math.round(db_), winner: w });
  }
  let win = wins[a] === wins[b] ? (Math.abs(dmg[a] - dmg[b]) < 1 ? null : dmg[a] > dmg[b] ? a : b) : wins[a] > wins[b] ? a : b;
  tx(() => {
    for (const p of bt.players) {
      const gain = win === null ? CFG.BATTLE_DRAW : p === win ? CFG.BATTLE_WIN : CFG.BATTLE_LOSE;
      run('UPDATE users SET coins = coins + ?, duel_wins = duel_wins + ?, duel_losses = duel_losses + ? WHERE id=?',
        gain, p === win ? 1 : 0, win !== null && p !== win ? 1 : 0, p);
    }
  });
  for (const p of bt.players) push(p, { t: 'battle_end', id: bt.id, names: bt.names, a, b, rounds, wins, winner: win });
}
function handleWs(ws, user, msg) {
  const mode = msg.mode === 'battle' ? 'battle' : 'quiz';
  if (msg.t === 'challenge') {
    const target = +msg.to;
    if (target === user.id || !clients.has(target)) return push(user.id, { t: 'error', msg: 'Joueur hors ligne' });
    push(target, { t: 'challenge', from: user.id, name: user.name, mode });
    push(user.id, { t: 'info', msg: 'Défi envoyé.' });
  } else if (msg.t === 'accept') {
    const from = one('SELECT id, name FROM users WHERE id=?', +msg.from);
    if (from && clients.has(from.id)) (mode === 'battle' ? startBattle : startDuel)(from, user);
  } else if (msg.t === 'decline') {
    push(+msg.from, { t: 'info', msg: `${user.name} a refusé.` });
  } else if (msg.t === 'pick') {
    const bt = battles.get(msg.id);
    const ids = (msg.cards || []).map(Number);
    if (!bt || !bt.players.includes(user.id) || bt.picks[user.id]) return;
    if (ids.length !== CFG.BATTLE_ROUNDS || new Set(ids).size !== ids.length) return push(user.id, { t: 'error', msg: `Choisis ${CFG.BATTLE_ROUNDS} cartes différentes` });
    const owned = new Set(all(`SELECT card_id FROM inventory WHERE user_id=? AND card_id IN (${ids.map(() => '?').join(',')})`, user.id, ...ids).map(r => r.card_id));
    if (!ids.every(i => owned.has(i))) return push(user.id, { t: 'error', msg: 'Carte non possédée' });
    bt.picks[user.id] = ids;
    push(user.id, { t: 'info', msg: 'Équipe validée, en attente de l’adversaire…' });
    if (bt.players.every(p => bt.picks[p])) resolveBattle(bt);
  } else if (msg.t === 'answer') {
    const d = duels.get(msg.id);
    if (!d || d.over || !d.players.includes(user.id) || d.answers[user.id] !== undefined || d.i < 0) return;
    const q = d.qs[d.i], choice = +msg.choice, left = Math.max(0, Q_TIME - (now() - d.qStart));
    d.answers[user.id] = choice;
    if (choice === q.answer) d.score[user.id] += 100 + Math.round(left / 300);
    if (Object.keys(d.answers).length === 2) closeQuestion(d);
  }
}

// ---------- enchères ----------
function settleAuctions() {
  const due = all("SELECT * FROM auctions WHERE status='open' AND ends_at <= ?", now());
  for (const a of due) {
    tx(() => {
      if (a.bidder_id) {
        run('UPDATE users SET coins = coins + ? WHERE id=?', a.bid, a.seller_id);
        addCard(a.bidder_id, a.card_id);
        run("UPDATE auctions SET status='sold' WHERE id=?", a.id);
        run('INSERT INTO sales (card_id, price, ts) VALUES (?,?,?)', a.card_id, a.bid, now());
      } else {
        addCard(a.seller_id, a.card_id);
        run("UPDATE auctions SET status='expired' WHERE id=?", a.id);
      }
    });
    const card = one('SELECT title FROM cards WHERE id=?', a.card_id);
    if (a.bidder_id) {
      push(a.bidder_id, { t: 'notify', msg: `Tu as remporté « ${card.title} » pour ${a.bid} 🪙` });
      push(a.seller_id, { t: 'notify', msg: `« ${card.title} » vendu ${a.bid} 🪙` });
    } else push(a.seller_id, { t: 'notify', msg: `Enchère sans offre : « ${card.title} » t'est rendue.` });
    broadcast({ t: 'refresh', what: 'auctions' });
  }
}
setInterval(() => { try { settleAuctions(); } catch (e) { console.error(e); } }, 2000);

// ---------- API REST ----------
const routes = [];
const route = (method, pattern, fn, auth = true) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, auth });

route('POST', '/api/register', ({ body }) => {
  const name = String(body.name || '').trim(), pw = String(body.password || '');
  if (!/^[\p{L}\p{N}_-]{2,20}$/u.test(name)) bad('Pseudo : 2 à 20 caractères (lettres, chiffres, _ -)');
  if (pw.length < 4) bad('Mot de passe trop court (4 min.)');
  if (process.env.INVITE_CODE && body.invite !== process.env.INVITE_CODE) bad('Code d’invitation invalide', 403);
  if (one('SELECT 1 FROM users WHERE name=?', name)) bad('Pseudo déjà pris', 409);
  const salt = crypto.randomBytes(16).toString('hex');
  const id = Number(run('INSERT INTO users (name, salt, hash, coins, pack_stock, pack_ts, created, friend_code) VALUES (?,?,?,?,?,?,?,?)', name, salt, hashPw(pw, salt), CFG.START_COINS, CFG.START_PACKS, now(), now(), crypto.randomBytes(5).toString('hex')).lastInsertRowid);
  return newSession(id);
}, false);
route('POST', '/api/login', ({ body }) => {
  const u = one('SELECT * FROM users WHERE name=?', String(body.name || '').trim());
  if (!u || !crypto.timingSafeEqual(Buffer.from(hashPw(String(body.password || ''), u.salt)), Buffer.from(u.hash))) bad('Pseudo ou mot de passe incorrect', 401);
  return newSession(u.id);
}, false);
function newSession(uid) {
  const token = crypto.randomBytes(24).toString('hex');
  run('INSERT INTO sessions (token, user_id, created) VALUES (?,?,?)', token, uid, now());
  return { token };
}
route('GET', '/api/me', ({ user }) => ({ ...publicUser(refreshPacks(user)), badge: friendBadge(user.id) }));

const hits = []; // derniers tirages légendaires (bandeau "Hits")
function announceHits(user, cards) {
  for (const c of cards) {
    if (c.rarity !== 'legendary') continue;
    const h = { user: user.name, title: c.title, shiny: !!c.shiny, ts: now() };
    hits.unshift(h); hits.length = Math.min(hits.length, 10);
    broadcast({ t: 'hit', ...h });
  }
}
async function finishPack(user, ids, before) {
  await live.enrichWithin(ids, 1500); // description/image : au plus 1,5 s d'attente, la réserve les a presque toujours déjà
  const rows = new Map(cardRows([...new Set(ids)]).map(c => [c.id, c]));
  const seen = new Set();
  const cards = ids.map(id => { const isNew = !before.has(id) && !seen.has(id); seen.add(id); return { ...rows.get(id), isNew }; })
    .sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || b.shiny - a.shiny);
  announceHits(user, cards);
  return { cards };
}
const ownedIds = uid => new Set(all('SELECT card_id FROM inventory WHERE user_id=?', uid).map(r => r.card_id));
route('POST', '/api/packs/open', async ({ user }) => {
  const { ids, before } = tx(() => {
    const u = refreshPacks(one('SELECT * FROM users WHERE id=?', user.id));
    if (u.pack_stock < 1) bad('Plus de booster disponible, patiente un peu !');
    const wasFull = u.pack_stock >= PACK_MAX;
    run('UPDATE users SET pack_stock = pack_stock - 1, pack_ts = CASE WHEN ? THEN ? ELSE pack_ts END WHERE id=?', wasFull ? 1 : 0, now(), u.id);
    const before = ownedIds(u.id);
    const drawn = drawPack(); drawn.forEach(c => addCard(u.id, c));
    return { ids: drawn, before };
  });
  return finishPack(user, ids, before);
});
route('POST', '/api/packs/buy', async ({ user }) => {
  const { ids, before } = tx(() => {
    const paid = run('UPDATE users SET coins = coins - ? WHERE id=? AND coins >= ?', CFG.PACK_PRICE, user.id, CFG.PACK_PRICE);
    if (!paid.changes) bad(`Pas assez de pièces (${CFG.PACK_PRICE} requises)`);
    const before = ownedIds(user.id);
    const drawn = drawPack(); drawn.forEach(c => addCard(user.id, c));
    return { ids: drawn, before };
  });
  return finishPack(user, ids, before);
});
// le client peut demander l'enrichissement de cartes affichées sans image/description
route('POST', '/api/cards/enrich', async ({ body }) => {
  const ids = (body.ids || []).map(Number).filter(Number.isFinite).slice(0, 40);
  await live.enrichWithin(ids, 4000);
  return { cards: cardRows(ids).map(c => ({ id: c.id, extract: c.extract, image: c.image, enriched: c.enriched })) };
});
route('GET', '/api/hits', () => ({ hits }));
route('GET', '/api/config', () => ({
  rarities: RARITIES, labels: CFG.LABELS, drop: CFG.DROP, sell: CFG.SELL, shinyChance: CFG.SHINY_CHANCE, catalog: live.catalogSize(), packSize: PACK_SIZE, packPrice: CFG.PACK_PRICE, packEveryMin: PACK_EVERY / 60000, packMax: PACK_MAX,
}), false);

const AVG = `(SELECT CAST(ROUND(AVG(price)) AS INTEGER) FROM (SELECT price FROM sales WHERE card_id = c.id ORDER BY id DESC LIMIT 10))`;
route('GET', '/api/album', ({ user }) => {
  const cards = all(`SELECT c.*, i.qty, ${AVG} AS avg_price FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id=?
    ORDER BY ${caseSql('c.rarity', Object.fromEntries(RARITIES.map(r => [r, RARITIES.length - 1 - RANK[r]])))}, c.shiny DESC, c.views DESC`, user.id);
  const total = Object.fromEntries(RARITIES.map(r => [r, live.total(r)]));
  const rarityAvg = Object.fromEntries(all(`SELECT c.rarity, CAST(ROUND(AVG(s.price)) AS INTEGER) p, COUNT(*) n FROM sales s JOIN cards c ON c.id = s.card_id GROUP BY c.rarity`).map(r => [r.rarity, { avg: r.p, n: r.n }]));
  return { cards, total, rarityAvg };
});
function discard(uid, cid, qty) {
  const inv = one('SELECT qty FROM inventory WHERE user_id=? AND card_id=?', uid, cid);
  qty = Math.min(qty, inv?.qty || 0);
  if (qty < 1) bad('Tu ne possèdes pas cette carte');
  const price = SELL[one('SELECT rarity FROM cards WHERE id=?', cid).rarity] * qty;
  run('UPDATE inventory SET qty = qty - ? WHERE user_id=? AND card_id=?', qty, uid, cid);
  run('DELETE FROM inventory WHERE user_id=? AND card_id=? AND qty <= 0', uid, cid);
  run('UPDATE users SET coins = coins + ? WHERE id=?', price, uid);
  return price;
}
route('POST', '/api/discard', ({ user, body }) => ({ price: tx(() => discard(user.id, +body.card_id, Math.max(1, Math.floor(+body.qty || 1)))) }));
// vend tous les exemplaires en trop (on garde 1 exemplaire) des cartes de rareté <= max_rarity
route('POST', '/api/discard-dupes', ({ user, body }) => tx(() => {
  const max = RANK[body.max_rarity] ?? 0;
  let total = 0, n = 0;
  for (const r of all('SELECT c.id, c.rarity, i.qty FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id=? AND i.qty > 1', user.id)) {
    if (RANK[r.rarity] <= max) { total += discard(user.id, r.id, r.qty - 1); n += r.qty - 1; }
  }
  return { price: total, count: n };
}));

route('GET', '/api/users', ({ user }) => ({ users: all('SELECT id, name FROM users ORDER BY name').map(u => ({ ...u, online: clients.has(u.id), me: u.id === user.id })) }));
route('GET', '/api/leaderboard', () => ({
  players: all(`SELECT u.id, u.name, u.coins, u.duel_wins wins, u.duel_losses losses,
    COALESCE(SUM(${caseSql('c.rarity', POINTS)}), 0) + u.duel_wins * 10 AS score,
    COUNT(c.id) AS uniques
    FROM users u LEFT JOIN inventory i ON i.user_id = u.id LEFT JOIN cards c ON c.id = i.card_id GROUP BY u.id ORDER BY score DESC LIMIT 50`),
}));

route('GET', '/api/auctions', ({ user }) => ({
  auctions: all(`SELECT a.id, a.start_price, a.bid, a.ends_at, a.seller_id, a.bidder_id, s.name seller, b.name bidder,
    c.id card_id, c.title, c.image, c.rarity, c.atk, c.def, ${AVG} avg_price,
    (SELECT COUNT(*) FROM bids WHERE auction_id = a.id) bids FROM auctions a JOIN cards c ON c.id = a.card_id
    JOIN users s ON s.id = a.seller_id LEFT JOIN users b ON b.id = a.bidder_id
    WHERE a.status='open' ORDER BY a.ends_at`).map(a => ({ ...a, mine: a.seller_id === user.id, leading: a.bidder_id === user.id })),
}));
route('POST', '/api/auctions', ({ user, body }) => {
  const price = Math.floor(+body.price), minutes = Math.min(1440, Math.max(1, Math.floor(+body.minutes || 10)));
  if (!(price >= 1 && price <= 1e6)) bad('Prix invalide');
  tx(() => {
    takeCard(user.id, +body.card_id);
    run('INSERT INTO auctions (seller_id, card_id, start_price, ends_at) VALUES (?,?,?,?)', user.id, +body.card_id, price, now() + minutes * 60000);
  });
  const card = one('SELECT title FROM cards WHERE id=?', +body.card_id);
  for (const uid of clients.keys()) if (uid !== user.id) push(uid, { t: 'notify', msg: `${user.name} met « ${card.title} » aux enchères (${price} 🪙)` });
  broadcast({ t: 'refresh', what: 'auctions' });
  return { ok: true };
});
route('GET', '/api/auctions/:id/bids', ({ params }) => ({
  bids: all('SELECT b.amount, b.ts, u.name FROM bids b JOIN users u ON u.id = b.user_id WHERE b.auction_id=? ORDER BY b.id DESC LIMIT 50', +params.id),
}));
route('POST', '/api/auctions/:id/bid', ({ user, params, body }) => {
  const amount = Math.floor(+body.amount);
  const out = tx(() => {
    const a = one("SELECT * FROM auctions WHERE id=? AND status='open'", +params.id);
    if (!a || a.ends_at <= now()) bad('Enchère terminée');
    if (a.seller_id === user.id) bad('Tu ne peux pas enchérir sur ta propre vente');
    if (amount < Math.max(a.start_price, a.bid + 1)) bad(`Offre minimale : ${Math.max(a.start_price, a.bid + 1)} 🪙`);
    if (a.bidder_id === user.id) run('UPDATE users SET coins = coins + ? WHERE id=?', a.bid, user.id);
    const paid = run('UPDATE users SET coins = coins - ? WHERE id=? AND coins >= ?', amount, user.id, amount);
    if (!paid.changes) bad('Pas assez de pièces');
    if (a.bidder_id && a.bidder_id !== user.id) run('UPDATE users SET coins = coins + ? WHERE id=?', a.bid, a.bidder_id);
    const ends = a.ends_at - now() < 30000 ? now() + 30000 : a.ends_at; // anti-snipe
    run('UPDATE auctions SET bid=?, bidder_id=?, ends_at=? WHERE id=?', amount, user.id, ends, a.id);
    run('INSERT INTO bids (auction_id, user_id, amount, ts) VALUES (?,?,?,?)', a.id, user.id, amount, now());
    return a;
  });
  const title = one('SELECT title FROM cards WHERE id=?', out.card_id).title;
  const others = new Set(all('SELECT DISTINCT user_id FROM bids WHERE auction_id=?', out.id).map(r => r.user_id));
  others.add(out.seller_id);
  for (const uid of others) {
    if (uid === user.id) continue;
    const msg = uid === out.seller_id ? `${user.name} enchérit ${amount} 🪙 sur ta « ${title} »`
      : uid === out.bidder_id ? `Tu as été surenchéri sur « ${title} » : ${amount} 🪙 par ${user.name}`
      : `${user.name} a enchéri ${amount} 🪙 sur « ${title} »`;
    push(uid, { t: 'notify', msg });
  }
  broadcast({ t: 'refresh', what: 'auctions' });
  return { ok: true };
});

route('GET', '/api/trades', ({ user }) => ({
  trades: all(`SELECT t.id, t.status, t.from_id, t.to_id, f.name from_name, o.name to_name,
    c1.id offer_id, c1.title offer_title, c1.rarity offer_rarity, c2.id want_id, c2.title want_title, c2.rarity want_rarity
    FROM trades t JOIN users f ON f.id=t.from_id JOIN users o ON o.id=t.to_id
    JOIN cards c1 ON c1.id=t.offer_card JOIN cards c2 ON c2.id=t.want_card
    WHERE t.status='pending' AND (t.from_id=? OR t.to_id=?) ORDER BY t.id DESC`, user.id, user.id),
}));
function searchCards(q) {
  q = q.trim();
  if (q.length < 2) return [];
  const hi = q.slice(0, -1) + String.fromCharCode(q.charCodeAt(q.length - 1) + 1); // recherche par préfixe, via l'index sur le titre
  return all(`SELECT id, title, rarity, shiny FROM cards WHERE shiny = 0 AND title COLLATE NOCASE >= ? AND title COLLATE NOCASE < ? ${q.length >= 3 ? 'ORDER BY views DESC' : ''} LIMIT 15`, q, hi);
}
route('GET', '/api/cards/search', ({ query }) => ({
  cards: searchCards(query.get('q') || ''),
}));
route('GET', '/api/catalog/search', ({ user, query }) => {
  const q = (query.get('q') || '').trim();
  if (q.length < 2) return { cards: [] };
  const cols = 'id, title, rarity, rank, views, atk, def, image, extract, enriched';
  let cards = all(`SELECT ${cols} FROM cards WHERE shiny = 0 AND title COLLATE NOCASE >= ? AND title COLLATE NOCASE < ? ORDER BY views DESC LIMIT 20`, q, q.slice(0, -1) + String.fromCharCode(q.charCodeAt(q.length - 1) + 1));
  if (cards.length < 20) {
    const have = new Set(cards.map(c => c.id));
    cards = cards.concat(all(`SELECT ${cols} FROM cards WHERE shiny = 0 AND title LIKE ? ORDER BY views DESC LIMIT 20`, '%' + q.replace(/[%_]/g, '') + '%').filter(c => !have.has(c.id))).slice(0, 20);
  }
  return { cards: cards.map(c => ({ ...c, owned: one('SELECT COALESCE(SUM(qty), 0) n FROM inventory WHERE user_id=? AND card_id IN (?, ?)', user.id, c.id, c.id + 100000000).n })) };
});
route('POST', '/api/trades', ({ user, body }) => {
  const to = +body.to;
  if (to === user.id || !one('SELECT 1 FROM users WHERE id=?', to)) bad('Destinataire invalide');
  if (!one('SELECT 1 FROM inventory WHERE user_id=? AND card_id=?', user.id, +body.offer_card)) bad('Tu ne possèdes pas la carte proposée');
  if (!one('SELECT 1 FROM cards WHERE id=?', +body.want_card)) bad('Carte demandée inconnue');
  run('INSERT INTO trades (from_id, to_id, offer_card, want_card, created) VALUES (?,?,?,?,?)', user.id, to, +body.offer_card, +body.want_card, now());
  push(to, { t: 'notify', msg: `${user.name} te propose un échange !` });
  push(to, { t: 'refresh', what: 'trades' });
  return { ok: true };
});
route('POST', '/api/trades/:id/:action', ({ user, params }) => {
  const other = tx(() => {
    const t = one("SELECT * FROM trades WHERE id=? AND status='pending'", +params.id);
    if (!t) bad('Échange introuvable', 404);
    if (params.action === 'cancel') {
      if (t.from_id !== user.id) bad('Interdit', 403);
      run("UPDATE trades SET status='cancelled' WHERE id=?", t.id);
    } else if (params.action === 'decline') {
      if (t.to_id !== user.id) bad('Interdit', 403);
      run("UPDATE trades SET status='declined' WHERE id=?", t.id);
    } else if (params.action === 'accept') {
      if (t.to_id !== user.id) bad('Interdit', 403);
      try { takeCard(t.from_id, t.offer_card); takeCard(t.to_id, t.want_card); }
      catch { bad("L'un de vous n'a plus la carte concernée"); }
      addCard(t.to_id, t.offer_card); addCard(t.from_id, t.want_card);
      run("UPDATE trades SET status='done' WHERE id=?", t.id);
    } else bad('Action inconnue', 404);
    return t.from_id === user.id ? t.to_id : t.from_id;
  });
  push(other, { t: 'refresh', what: 'trades' }); push(other, { t: 'notify', msg: `Échange mis à jour (${params.action}).` });
  return { ok: true };
});

// ---------- amis ----------
// Par pseudo : demande à valider par l'autre joueur. Par QR code (code secret de l'ami) : ajout immédiat des deux côtés.
const friendBadge = uid => one(`SELECT (SELECT COUNT(*) FROM friend_requests WHERE to_id = ? AND status = 'pending')
  + (SELECT COUNT(*) FROM friends WHERE user_id = ? AND seen = 0) AS n`, uid, uid).n;
const areFriends = (a, b) => !!one('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?', a, b);
function makeFriends(a, b, unseenFor = null) { // a et b deviennent amis ; unseenFor = joueur qui doit voir la pastille rouge
  const ins = db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created, seen) VALUES (?,?,?,?)');
  ins.run(a, b, now(), unseenFor === a ? 0 : 1); ins.run(b, a, now(), unseenFor === b ? 0 : 1);
  run("UPDATE friend_requests SET status = 'accepted' WHERE status = 'pending' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))", a, b, b, a);
}
route('GET', '/api/friends', ({ user }) => ({
  code: user.friend_code,
  friends: all(`SELECT u.id, u.name, f.created, f.seen FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.name`, user.id)
    .map(f => ({ ...f, isNew: !f.seen, online: clients.has(f.id) })),
  incoming: all(`SELECT r.id, u.name, r.created FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? AND r.status = 'pending' ORDER BY r.id DESC`, user.id),
  outgoing: all(`SELECT r.id, u.name FROM friend_requests r JOIN users u ON u.id = r.to_id WHERE r.from_id = ? AND r.status = 'pending' ORDER BY r.id DESC`, user.id),
}));
route('POST', '/api/friends/request', ({ user, body }) => {
  const target = one('SELECT id, name FROM users WHERE name = ?', String(body.name || '').trim());
  if (!target) bad('Aucun joueur avec ce pseudo', 404);
  if (target.id === user.id) bad('Tu ne peux pas t’ajouter toi-même');
  if (areFriends(user.id, target.id)) bad(`${target.name} est déjà dans tes amis`);
  if (one("SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'", user.id, target.id)) bad('Demande déjà envoyée');
  if (one("SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'", target.id, user.id)) { // il t'avait déjà invité : on accepte
    makeFriends(user.id, target.id, target.id);
    push(target.id, { t: 'friend', kind: 'accepted', name: user.name });
    return { status: 'friends', name: target.name };
  }
  run('INSERT INTO friend_requests (from_id, to_id, created) VALUES (?,?,?)', user.id, target.id, now());
  push(target.id, { t: 'friend', kind: 'request', name: user.name });
  return { status: 'sent', name: target.name };
});
route('POST', '/api/friends/respond/:id', ({ user, params, body }) => {
  const r = one("SELECT * FROM friend_requests WHERE id = ? AND to_id = ? AND status = 'pending'", +params.id, user.id);
  if (!r) bad('Demande introuvable', 404);
  if (body.accept) {
    makeFriends(user.id, r.from_id, r.from_id);
    push(r.from_id, { t: 'friend', kind: 'accepted', name: user.name });
  } else run("UPDATE friend_requests SET status = 'declined' WHERE id = ?", r.id);
  return { ok: true };
});
route('POST', '/api/friends/add-code', ({ user, body }) => {
  const owner = one('SELECT id, name FROM users WHERE friend_code = ?', String(body.code || '').trim());
  if (!owner) bad('QR code invalide', 404);
  if (owner.id === user.id) bad('C’est ton propre QR code');
  if (areFriends(user.id, owner.id)) return { status: 'already', name: owner.name };
  makeFriends(user.id, owner.id, owner.id);
  push(owner.id, { t: 'friend', kind: 'added', name: user.name });
  return { status: 'friends', name: owner.name };
});
route('POST', '/api/friends/remove', ({ user, body }) => {
  run('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', user.id, +body.id, +body.id, user.id);
  return { ok: true };
});
route('POST', '/api/friends/seen', ({ user }) => { run('UPDATE friends SET seen = 1 WHERE user_id = ?', user.id); return { ok: true }; });

// ---------- serveur HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const PUB = path.join(__dirname, 'public');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
      if (!r) bad('Route inconnue', 404);
      const params = url.pathname.match(r.re).groups || {};
      let user = null;
      if (r.auth) { user = userFromToken((req.headers.authorization || '').replace('Bearer ', '')); if (!user) bad('Non connecté', 401); }
      let body = {};
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const c of req) { if ((size += c.length) > 20000) bad('Corps trop gros', 413); chunks.push(c); }
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { bad('JSON invalide'); }
      }
      const out = await r.fn({ user, params, body, query: url.searchParams });
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(out));
    }
    const file = path.join(PUB, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) bad('Introuvable', 404);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    res.writeHead(e.code || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e instanceof HttpError ? e.message : 'Erreur serveur' }));
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  const user = userFromToken(new URL(req.url, 'http://x').searchParams.get('token'));
  if (!user) return ws.close(4001);
  if (!clients.has(user.id)) clients.set(user.id, new Set());
  clients.get(user.id).add(ws);
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  sendPresence();
  ws.on('message', raw => { try { handleWs(ws, user, JSON.parse(raw)); } catch (e) { console.error(e); } });
  ws.on('close', () => {
    const s = clients.get(user.id); s?.delete(ws);
    if (s && !s.size) clients.delete(user.id);
    sendPresence();
  });
});
setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 25000);

live.loadRanges();
live.refill();
server.listen(PORT, () => console.log(`WikiMasters sur http://localhost:${PORT}  (${live.catalogSize().toLocaleString('fr-FR')} cartes au catalogue)`));
