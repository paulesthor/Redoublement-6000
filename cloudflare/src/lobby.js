// Durable Object unique : WebSocket de tous les joueurs (présence, défis, duels de quiz, combats de cartes, notifications).
// L'état des parties en cours vit en mémoire ; seuls les résultats (pièces, victoires) sont écrits dans D1.
import CFG from './config.js';
import { one, all, run, st, placeholders, cardRows, userFromToken } from './util.js';

const Q_COUNT = 5, Q_TIME = 15000;
const now = () => Date.now();

function mask(extract, title) {
  const words = title.split(/\s+/).filter(w => w.length > 2).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  let t = extract.slice(0, 280);
  if (words.length) t = t.replace(new RegExp(words.join('|'), 'gi'), '█████');
  return t;
}
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);

export class Lobby {
  constructor(state, env) {
    this.env = env;
    this.clients = new Map(); // userId -> Set<WebSocket>
    this.duels = new Map();
    this.battles = new Map();
    setInterval(() => this.broadcast({ t: 'ping' }), 30000); // garde les connexions ouvertes
  }

  push(uid, msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients.get(uid) ?? []) { try { ws.send(data); } catch { /* fermée */ } }
  }
  broadcast(msg, except = null) { for (const uid of this.clients.keys()) if (uid !== except) this.push(uid, msg); }
  presence() { this.broadcast({ t: 'online', ids: [...this.clients.keys()] }); }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/push') {                      // appelé par le Worker (notifications, rafraîchissements, hits)
      const { to, msg } = await req.json();
      to ? this.push(to, msg) : this.broadcast(msg, msg.except ?? null);
      return new Response('ok');
    }
    if (url.pathname === '/online') return Response.json({ ids: [...this.clients.keys()] });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });

    const user = await userFromToken(this.env, url.searchParams.get('token'));
    if (!user) return new Response('Non connecté', { status: 401 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    if (!this.clients.has(user.id)) this.clients.set(user.id, new Set());
    this.clients.get(user.id).add(server);
    this.presence();
    server.addEventListener('message', ev => { this.onMessage(user, JSON.parse(ev.data)).catch(e => console.error(e)); });
    server.addEventListener('close', () => {
      const s = this.clients.get(user.id); s?.delete(server);
      if (s && !s.size) this.clients.delete(user.id);
      this.presence();
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async onMessage(user, msg) {
    const mode = msg.mode === 'battle' ? 'battle' : 'quiz';
    if (msg.t === 'challenge') {
      const target = +msg.to;
      if (target === user.id || !this.clients.has(target)) return this.push(user.id, { t: 'error', msg: 'Joueur hors ligne' });
      this.push(target, { t: 'challenge', from: user.id, name: user.name, mode });
      this.push(user.id, { t: 'info', msg: 'Défi envoyé.' });
    } else if (msg.t === 'accept') {
      const from = await one(this.env, 'SELECT id, name FROM users WHERE id = ?', +msg.from);
      if (from && this.clients.has(from.id)) await (mode === 'battle' ? this.startBattle(from, user) : this.startDuel(from, user));
    } else if (msg.t === 'decline') {
      this.push(+msg.from, { t: 'info', msg: `${user.name} a refusé.` });
    } else if (msg.t === 'pick') {
      await this.pick(user, msg);
    } else if (msg.t === 'answer') {
      this.answer(user, msg);
    }
  }

  // ---------- quiz ----------
  async makeQuestions() {
    const cards = await all(this.env, "SELECT id, title, extract, views FROM cards WHERE enriched >= 1 AND shiny = 0 AND length(extract) > 80 ORDER BY RANDOM() LIMIT ?", Q_COUNT * 4);
    if (cards.length < 8) throw new Error('Pas assez de cartes enrichies pour un duel : ouvre quelques boosters d’abord');
    const qs = [];
    for (let i = 0; i < Q_COUNT; i++) {
      const g = cards.splice(0, 4);
      if (i % 2 === 0 || g.length < 4) {
        const opts = shuffle(g.map(c => c.title));
        qs.push({ text: `Quel article Wikipédia est décrit ici ?\n« ${mask(g[0].extract, g[0].title)} »`, options: opts, answer: opts.indexOf(g[0].title) });
      } else {
        const opts = g.map(c => c.title), best = g.reduce((a, c) => (c.views > a.views ? c : a));
        qs.push({ text: 'Lequel de ces articles est le plus consulté sur Wikipédia ?', options: opts, answer: opts.indexOf(best.title) });
      }
    }
    return qs;
  }
  async startDuel(a, b) {
    let qs;
    try { qs = await this.makeQuestions(); } catch (e) { for (const p of [a.id, b.id]) this.push(p, { t: 'error', msg: e.message }); return; }
    const d = { id: crypto.randomUUID(), players: [a.id, b.id], names: { [a.id]: a.name, [b.id]: b.name },
      score: { [a.id]: 0, [b.id]: 0 }, qs, i: -1, answers: {}, timer: null, over: false };
    this.duels.set(d.id, d);
    for (const p of d.players) this.push(p, { t: 'duel_start', id: d.id, names: d.names, total: Q_COUNT });
    setTimeout(() => this.nextQuestion(d), 1500);
  }
  nextQuestion(d) {
    if (d.over) return;
    d.i++; d.answers = {};
    if (d.i >= Q_COUNT) return this.endDuel(d);
    const q = d.qs[d.i]; d.qStart = now();
    for (const p of d.players) this.push(p, { t: 'question', id: d.id, n: d.i + 1, total: Q_COUNT, text: q.text, options: q.options, time: Q_TIME });
    d.timer = setTimeout(() => this.closeQuestion(d), Q_TIME + 500);
  }
  closeQuestion(d) {
    clearTimeout(d.timer);
    const q = d.qs[d.i];
    for (const p of d.players) this.push(p, { t: 'reveal', id: d.id, answer: q.answer, score: d.score, picks: d.answers });
    setTimeout(() => this.nextQuestion(d), 2500);
  }
  answer(user, msg) {
    const d = this.duels.get(msg.id);
    if (!d || d.over || !d.players.includes(user.id) || d.answers[user.id] !== undefined || d.i < 0) return;
    const q = d.qs[d.i], choice = +msg.choice, left = Math.max(0, Q_TIME - (now() - d.qStart));
    d.answers[user.id] = choice;
    if (choice === q.answer) d.score[user.id] += 100 + Math.round(left / 300);
    if (Object.keys(d.answers).length === 2) this.closeQuestion(d);
  }
  async endDuel(d) {
    d.over = true; this.duels.delete(d.id);
    const [a, b] = d.players, sa = d.score[a], sb = d.score[b];
    const win = sa === sb ? null : sa > sb ? a : b;
    await this.reward(d.players, win, CFG.QUIZ_WIN, CFG.QUIZ_LOSE, CFG.QUIZ_DRAW);
    for (const p of d.players) this.push(p, { t: 'duel_end', id: d.id, score: d.score, names: d.names, winner: win });
  }
  reward(players, win, W, L, D) {
    return this.env.DB.batch(players.map(p => st(this.env,
      'UPDATE users SET coins = coins + ?, duel_wins = duel_wins + ?, duel_losses = duel_losses + ? WHERE id = ?',
      win === null ? D : p === win ? W : L, p === win ? 1 : 0, win !== null && p !== win ? 1 : 0, p)));
  }

  // ---------- combats de cartes ----------
  async startBattle(a, b) {
    const bt = { id: crypto.randomUUID(), players: [a.id, b.id], names: { [a.id]: a.name, [b.id]: b.name }, picks: {} };
    this.battles.set(bt.id, bt);
    for (const p of bt.players) this.push(p, { t: 'battle_start', id: bt.id, names: bt.names, rounds: CFG.BATTLE_ROUNDS });
    bt.timer = setTimeout(() => { // un joueur n'a pas choisi : combat annulé
      if (!this.battles.delete(bt.id)) return;
      for (const p of bt.players) { this.push(p, { t: 'info', msg: 'Combat annulé : équipe non choisie à temps.' }); this.push(p, { t: 'battle_cancel' }); }
    }, 90000);
  }
  async pick(user, msg) {
    const bt = this.battles.get(msg.id);
    const ids = (msg.cards || []).map(Number);
    if (!bt || !bt.players.includes(user.id) || bt.picks[user.id]) return;
    if (ids.length !== CFG.BATTLE_ROUNDS || new Set(ids).size !== ids.length) return this.push(user.id, { t: 'error', msg: `Choisis ${CFG.BATTLE_ROUNDS} cartes différentes` });
    const owned = new Set((await all(this.env, `SELECT card_id FROM inventory WHERE user_id = ? AND card_id IN (${placeholders(ids.length)})`, user.id, ...ids)).map(r => r.card_id));
    if (!ids.every(i => owned.has(i))) return this.push(user.id, { t: 'error', msg: 'Carte non possédée' });
    bt.picks[user.id] = ids;
    this.push(user.id, { t: 'info', msg: 'Équipe validée, en attente de l’adversaire…' });
    if (bt.players.every(p => bt.picks[p])) await this.resolveBattle(bt);
  }
  async resolveBattle(bt) {
    clearTimeout(bt.timer); this.battles.delete(bt.id);
    const [a, b] = bt.players;
    const team = async uid => Object.fromEntries((await cardRows(this.env, bt.picks[uid])).map(c => [c.id, c]));
    const [ta, tb] = [await team(a), await team(b)];
    const rounds = [], wins = { [a]: 0, [b]: 0 }, dmg = { [a]: 0, [b]: 0 };
    for (let i = 0; i < CFG.BATTLE_ROUNDS; i++) {
      const ca = ta[bt.picks[a][i]], cb = tb[bt.picks[b][i]];
      const hit = (x, y) => Math.max(1, x.atk - y.def * 0.5) * (0.9 + Math.random() * 0.2);
      const da = hit(ca, cb), db = hit(cb, ca);
      dmg[a] += da; dmg[b] += db;
      const w = da === db ? null : da > db ? a : b;
      if (w) wins[w]++;
      rounds.push({ a: ca, b: cb, da: Math.round(da), db: Math.round(db), winner: w });
    }
    const win = wins[a] === wins[b] ? (Math.abs(dmg[a] - dmg[b]) < 1 ? null : dmg[a] > dmg[b] ? a : b) : wins[a] > wins[b] ? a : b;
    await this.reward(bt.players, win, CFG.BATTLE_WIN, CFG.BATTLE_LOSE, CFG.BATTLE_DRAW);
    for (const p of bt.players) this.push(p, { t: 'battle_end', id: bt.id, names: bt.names, a, b, rounds, wins, winner: win });
  }
}
