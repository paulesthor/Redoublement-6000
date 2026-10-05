'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const { db, tx } = require('./db');

const PORT = +process.env.PORT || 3000;
const PACK_EVERY = 10 * 60 * 1000, PACK_MAX = 10, PACK_SIZE = 5;
const WEIGHTS = { common: 70, rare: 22, epic: 6, legendary: 2 };
const SELL = { common: 5, rare: 20, epic: 80, legendary: 300 };
const POINTS = { common: 1, rare: 5, epic: 20, legendary: 50 };

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
const cardsByRarity = {};
function loadPool() {
  for (const r of Object.keys(WEIGHTS)) cardsByRarity[r] = all('SELECT id FROM cards WHERE rarity=?', r).map(x => x.id);
}
function drawCard() {
  const avail = Object.keys(WEIGHTS).filter(r => cardsByRarity[r].length);
  if (!avail.length) bad('Aucune carte en base : lance `npm run seed`', 500);
  let roll = Math.random() * avail.reduce((s, r) => s + WEIGHTS[r], 0), rar = avail[0];
  for (const r of avail) { if ((roll -= WEIGHTS[r]) < 0) { rar = r; break; } }
  const pool = cardsByRarity[rar];
  return pool[Math.floor(Math.random() * pool.length)];
}
const cardRows = ids => ids.length
  ? all(`SELECT * FROM cards WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];

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
  const cards = all('SELECT id, title, extract, views FROM cards ORDER BY RANDOM() LIMIT ?', Q_COUNT * 4 + 8);
  if (cards.length < 8) bad('Pas assez de cartes en base pour un duel', 500);
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
      const gain = win === null ? 25 : p === win ? 50 : 10;
      run('UPDATE users SET coins = coins + ?, duel_wins = duel_wins + ?, duel_losses = duel_losses + ? WHERE id=?',
        gain, p === win ? 1 : 0, win !== null && p !== win ? 1 : 0, p);
    }
  });
  for (const p of d.players) push(p, { t: 'duel_end', id: d.id, score: d.score, names: d.names, winner: win });
}
function handleWs(ws, user, msg) {
  if (msg.t === 'challenge') {
    const target = +msg.to;
    if (target === user.id || !clients.has(target)) return push(user.id, { t: 'error', msg: 'Joueur hors ligne' });
    push(target, { t: 'challenge', from: user.id, name: user.name });
    push(user.id, { t: 'info', msg: 'Défi envoyé !' });
  } else if (msg.t === 'accept') {
    const from = one('SELECT id, name FROM users WHERE id=?', +msg.from);
    if (from && clients.has(from.id)) startDuel(from, user);
  } else if (msg.t === 'decline') {
    push(+msg.from, { t: 'info', msg: `${user.name} a refusé le duel.` });
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
  const id = Number(run('INSERT INTO users (name, salt, hash, pack_ts, created) VALUES (?,?,?,?,?)', name, salt, hashPw(pw, salt), now(), now()).lastInsertRowid);
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
route('GET', '/api/me', ({ user }) => publicUser(refreshPacks(user)));

route('POST', '/api/packs/open', ({ user }) => {
  const ids = tx(() => {
    const u = refreshPacks(one('SELECT * FROM users WHERE id=?', user.id));
    if (u.pack_stock < 1) bad('Plus de booster disponible, patiente un peu !');
    const wasFull = u.pack_stock >= PACK_MAX;
    run('UPDATE users SET pack_stock = pack_stock - 1, pack_ts = CASE WHEN ? THEN ? ELSE pack_ts END WHERE id=?', wasFull ? 1 : 0, now(), u.id);
    const drawn = Array.from({ length: PACK_SIZE }, drawCard);
    drawn.forEach(c => addCard(u.id, c));
    return drawn;
  });
  const rows = new Map(cardRows([...new Set(ids)]).map(c => [c.id, c]));
  const owned = new Set(all('SELECT card_id FROM inventory WHERE user_id=? AND qty=1', user.id).map(r => r.card_id));
  return { cards: ids.map(id => ({ ...rows.get(id), isNew: owned.has(id) && ids.filter(x => x === id).length === 1 })) };
});

route('GET', '/api/album', ({ user }) => {
  const cards = all(`SELECT c.*, i.qty FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id=? 
    ORDER BY CASE c.rarity WHEN 'legendary' THEN 0 WHEN 'epic' THEN 1 WHEN 'rare' THEN 2 ELSE 3 END, c.views DESC`, user.id);
  const total = Object.fromEntries(all('SELECT rarity, COUNT(*) n FROM cards GROUP BY rarity').map(r => [r.rarity, r.n]));
  return { cards, total };
});
route('POST', '/api/cards/:id/sell', ({ user, params }) => tx(() => {
  const cid = +params.id, inv = one('SELECT qty FROM inventory WHERE user_id=? AND card_id=?', user.id, cid);
  if (!inv || inv.qty < 2) bad('Tu ne peux vendre que les doublons');
  const price = SELL[one('SELECT rarity FROM cards WHERE id=?', cid).rarity];
  takeCard(user.id, cid); run('UPDATE users SET coins = coins + ? WHERE id=?', price, user.id);
  return { price };
}));

route('GET', '/api/users', ({ user }) => ({ users: all('SELECT id, name FROM users ORDER BY name').map(u => ({ ...u, online: clients.has(u.id), me: u.id === user.id })) }));
route('GET', '/api/leaderboard', () => ({
  players: all(`SELECT u.id, u.name, u.coins, u.duel_wins wins, u.duel_losses losses,
    COALESCE(SUM(CASE c.rarity WHEN 'legendary' THEN 50 WHEN 'epic' THEN 20 WHEN 'rare' THEN 5 ELSE 1 END), 0) + u.duel_wins * 10 AS score,
    COUNT(c.id) AS uniques
    FROM users u LEFT JOIN inventory i ON i.user_id = u.id LEFT JOIN cards c ON c.id = i.card_id GROUP BY u.id ORDER BY score DESC LIMIT 50`),
}));

route('GET', '/api/auctions', ({ user }) => ({
  auctions: all(`SELECT a.id, a.start_price, a.bid, a.ends_at, a.seller_id, a.bidder_id, s.name seller, b.name bidder,
    c.id card_id, c.title, c.image, c.rarity, c.atk, c.def FROM auctions a JOIN cards c ON c.id = a.card_id
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
  broadcast({ t: 'refresh', what: 'auctions' });
  return { ok: true };
});
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
    return a;
  });
  if (out.bidder_id && out.bidder_id !== user.id) push(out.bidder_id, { t: 'notify', msg: 'Tu as été surenchéri !' });
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
route('GET', '/api/cards/search', ({ query }) => ({
  cards: all('SELECT id, title, rarity FROM cards WHERE title LIKE ? ORDER BY views DESC LIMIT 15', `%${(query.get('q') || '').replace(/[%_]/g, '')}%`),
}));
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

loadPool();
server.listen(PORT, () => console.log(`WikiMasters sur http://localhost:${PORT}  (${all('SELECT 1 FROM cards').length} cartes)`));
