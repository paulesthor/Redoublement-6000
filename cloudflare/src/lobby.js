// Durable Object unique : WebSocket de tous les joueurs (présence, défis, duels de quiz, combats de cartes, notifications).
// L'état des parties en cours vit en mémoire ; seuls les résultats (pièces, victoires) sont écrits dans D1.
import CFG from './config.js';
import { one, all, run, st, placeholders, cardRows, userFromToken } from './util.js';

const Q_COUNT = 5, Q_TIME = 15000, B_TIME = 20000;
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
    } else if (msg.t === 'challenge_bot') {
      await this.startBotBattle(user);
    } else if (msg.t === 'pick') {
      await this.pick(user, msg);
    } else if (msg.t === 'answer') {
      this.answer(user, msg);
    } else if (msg.t === 'banswer') {
      this.battleAnswer(user, msg);
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
  async startBattle(a, b, vsBot = false) {
    const bt = { id: crypto.randomUUID(), players: [a.id, b.id], names: { [a.id]: a.name, [b.id]: b.name }, picks: {}, bot: vsBot ? b.id : null };
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
    if (bt.bot) { const bp = await this.botPicks(bt, user.id); if (!bp) { this.battles.delete(bt.id); return this.push(user.id, { t: 'error', msg: 'Le joueur simulé n’a pas trouvé d’équipe, réessaie' }); } bt.picks[bt.bot] = bp; }
    else this.push(user.id, { t: 'info', msg: 'Équipe validée, en attente de l’adversaire…' });
    if (bt.players.every(p => bt.picks[p])) await this.resolveBattle(bt);
  }
  // ---------- bataille : chaque joueur répond à une question sur la carte de l'adversaire, à chaque manche ----------
  async startBotBattle(user) {
    const bots = await all(this.env, 'SELECT id, name FROM users WHERE is_bot = 1 ORDER BY RANDOM() LIMIT 1');
    if (!bots.length) return this.push(user.id, { t: 'error', msg: 'Aucun joueur simulé disponible pour le moment' });
    await this.startBattle(user, bots[0], true);
  }
  /** Le joueur simulé choisit des cartes de la même rareté que les tiennes, dans l'ordre. */
  async botPicks(bt, humanId) {
    const mine = await cardRows(this.env, bt.picks[humanId]);
    const byId = new Map(mine.map(c => [c.id, c]));
    const ids = [];
    for (const id of bt.picks[humanId]) {
      const r = await one(this.env, `SELECT id FROM cards WHERE shiny = 0 AND rarity = ? ${ids.length ? `AND id NOT IN (${placeholders(ids.length)})` : ''} ORDER BY RANDOM() LIMIT 1`, byId.get(id).rarity, ...ids);
      if (r) ids.push(r.id);
    }
    return ids.length === bt.picks[humanId].length ? ids : null;
  }
  async makeCardQuestion(card, pool) {
    const others = shuffle(pool.filter(p => p.id !== card.id));
    const clip = c => { const t = mask(c.extract, c.title).replace(/\s+/g, ' ').trim(); return t.length > 150 ? t.slice(0, 147).replace(/\s+\S*$/, '') + '…' : t; };
    if (card.extract && card.extract.length > 80 && others.length >= 3 && Math.random() < .7) {
      const opts = shuffle([card, ...others.slice(0, 3)]);
      return { text: `Quelle description correspond à « ${card.title} » ?`, options: opts.map(clip), answer: opts.indexOf(card) };
    }
    const o = others[0] || { title: 'France', views: 100000 };
    return { text: `« ${card.title} » est-elle plus consultée sur Wikipédia que « ${o.title} » ?`, options: ['Oui', 'Non'], answer: card.views >= o.views ? 0 : 1 };
  }
  async resolveBattle(bt) {
    clearTimeout(bt.timer);
    const [a, b] = bt.players;
    const team = async uid => Object.fromEntries((await cardRows(this.env, bt.picks[uid])).map(c => [c.id, c]));
    const [ta, tb] = [await team(a), await team(b)];
    const pool = await all(this.env, "SELECT id, title, extract, views FROM cards WHERE enriched >= 1 AND shiny = 0 AND length(extract) > 80 ORDER BY RANDOM() LIMIT 24");
    bt.cards = [];                                                   // [{ a, b, qA, qB }] : qA est posée au joueur A, au sujet de la carte de B
    for (let i = 0; i < CFG.BATTLE_ROUNDS; i++) {
      const ca = ta[bt.picks[a][i]], cb = tb[bt.picks[b][i]];
      bt.cards.push({ a: ca, b: cb, qA: await this.makeCardQuestion(cb, pool), qB: await this.makeCardQuestion(ca, pool) });
    }
    bt.i = -1; bt.rounds = []; bt.wins = { [a]: 0, [b]: 0 }; bt.dmg = { [a]: 0, [b]: 0 };
    setTimeout(() => this.nextBattleRound(bt), 800);
  }
  nextBattleRound(bt) {
    bt.i++; bt.answers = {};
    if (bt.i >= CFG.BATTLE_ROUNDS) return this.endBattle(bt);
    const [a, b] = bt.players, r = bt.cards[bt.i], pub = c => ({ id: c.id, title: c.title, rarity: c.rarity, shiny: c.shiny, atk: c.atk, def: c.def, image: c.image });
    bt.qStart = now();
    for (const [uid, mine, theirs, q] of [[a, r.a, r.b, r.qA], [b, r.b, r.a, r.qB]]) {
      this.push(uid, { t: 'bq', id: bt.id, n: bt.i + 1, total: CFG.BATTLE_ROUNDS, mine: pub(mine), theirs: pub(theirs), text: q.text, options: q.options, time: B_TIME, wins: bt.wins });
    }
    if (bt.bot) {                                                    // le joueur simulé répond après un temps de réflexion
      const q = bt.bot === a ? r.qA : r.qB;
      setTimeout(() => this.battleAnswer({ id: bt.bot }, { id: bt.id, choice: Math.random() < .55 ? q.answer : Math.floor(Math.random() * q.options.length) }), 3000 + Math.random() * 9000);
    }
    bt.timer = setTimeout(() => this.closeBattleRound(bt), B_TIME + 500);
  }
  battleAnswer(user, msg) {
    const bt = this.battles.get(msg.id);
    if (!bt || !bt.cards || !bt.players.includes(user.id) || bt.answers[user.id] !== undefined || bt.i < 0) return;
    bt.answers[user.id] = +msg.choice;
    if (bt.players.every(p => bt.answers[p] !== undefined)) this.closeBattleRound(bt);
  }
  closeBattleRound(bt) {
    if (bt.closing === bt.i) return; bt.closing = bt.i; clearTimeout(bt.timer);
    const [a, b] = bt.players, r = bt.cards[bt.i];
    const okA = bt.answers[a] === r.qA.answer, okB = bt.answers[b] === r.qB.answer;
    const mult = ok => ok ? CFG.BATTLE_RIGHT : CFG.BATTLE_WRONG;     // bonne réponse : l'attaque frappe plus fort ; mauvaise réponse ou temps écoulé : moins fort
    const hit = (x, y, ok) => Math.max(1, x.atk * mult(ok) - y.def * 0.5) * (0.95 + Math.random() * 0.1);
    const da = hit(r.a, r.b, okA), db = hit(r.b, r.a, okB);
    bt.dmg[a] += da; bt.dmg[b] += db;
    const w = Math.round(da) === Math.round(db) ? null : da > db ? a : b;
    if (w) bt.wins[w]++;
    const round = { a: r.a, b: r.b, da: Math.round(da), db: Math.round(db), winner: w, okA, okB, ma: mult(okA), mb: mult(okB) };
    bt.rounds.push(round);
    for (const p of bt.players) this.push(p, { t: 'bround', id: bt.id, n: bt.i + 1, a, b, round, wins: bt.wins, answers: bt.answers, rightA: r.qA.answer, rightB: r.qB.answer });
    setTimeout(() => this.nextBattleRound(bt), 5000);
  }
  async endBattle(bt) {
    this.battles.delete(bt.id);
    const [a, b] = bt.players, { wins, dmg } = bt;
    const win = wins[a] === wins[b] ? (Math.abs(dmg[a] - dmg[b]) < 1 ? null : dmg[a] > dmg[b] ? a : b) : wins[a] > wins[b] ? a : b;
    const k = bt.bot ? .5 : 1;                                        // contre un joueur simulé, gains réduits de moitié
    await this.reward(bt.players.filter(p => p !== bt.bot), win, Math.round(CFG.BATTLE_WIN * k), Math.round(CFG.BATTLE_LOSE * k), Math.round(CFG.BATTLE_DRAW * k));
    for (const p of bt.players) this.push(p, { t: 'battle_end', id: bt.id, names: bt.names, a, b, rounds: bt.rounds, wins, winner: win });
  }
}
