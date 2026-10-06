// Durable Object unique : WebSocket de tous les joueurs (présence, défis, duels de quiz, combats de cartes, notifications).
// L'état des parties en cours vit en mémoire ; seuls les résultats (pièces, victoires) sont écrits dans D1.
import CFG from './config.js';
import { one, all, run, st, placeholders, cardRows, userFromToken } from './util.js';
import { battleQuestions, aiQuestions } from './aiquiz.js';
import { pushFor } from './push.js';

const Q_COUNT = 5, Q_TIME = 15000, B_TIME = 18000, FIGHT_PICK = 30000, Q_PER_CARD = 3, SHINY = 100000000;
const AWAY_MAX = 60000;     // un joueur absent plus d'une minute en plein combat déclare forfait
// pauses entre les étapes du combat (ms)
const T = { intro: 1800, card: 1300, closeAfterAnswer: 600, nextQ: 2000, nextTurn: 2200 };
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
    this.hidden = new Map();  // userId -> true quand l'appli est en arrière-plan (écran verrouillé, autre appli) : on le notifie alors par push
    this.away = new Map();   // userId -> heure de la dernière déconnexion complète
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
      if (to) { this.push(to, msg); if (!this.clients.has(to) || this.hidden.get(to)) await pushFor(this.env, to, msg); }
      else this.broadcast(msg, msg.except ?? null);
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
    this.away.delete(user.id); this.hidden.delete(user.id);
    this.presence();
    this.sync(user.id);                                  // reprise d'une partie en cours après coupure ou retour sur l'appli
    server.addEventListener('message', ev => { this.onMessage(user, JSON.parse(ev.data)).catch(e => console.error(e)); });
    server.addEventListener('close', () => {
      const s = this.clients.get(user.id); s?.delete(server);
      if (s && !s.size) { this.clients.delete(user.id); this.away.set(user.id, now()); }
      this.presence();
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async onMessage(user, msg) {
    const mode = msg.mode === 'battle' ? 'battle' : 'quiz';
    if (msg.t === 'sync') return this.sync(user.id);
    if (msg.t === 'vis') { this.hidden.set(user.id, !msg.v); return; }
    if ((msg.t === 'challenge' || msg.t === 'accept' || msg.t === 'challenge_bot') && this.gameOf(user.id)) return this.push(user.id, { t: 'info', msg: 'Tu es déjà dans une partie.' });
    if (msg.t === 'challenge') {
      const target = +msg.to;
      if (this.gameOf(target)) return this.push(user.id, { t: 'error', msg: 'Ce joueur est déjà en partie' });
      if (target === user.id || !this.clients.has(target)) return this.push(user.id, { t: 'error', msg: 'Joueur hors ligne' });
      this.push(target, { t: 'challenge', from: user.id, name: user.name, mode });
      if (this.hidden.get(target)) await pushFor(this.env, target, { t: 'challenge', name: user.name });
      this.push(user.id, { t: 'info', msg: 'Défi envoyé.' });
    } else if (msg.t === 'accept') {
      const from = await one(this.env, 'SELECT id, name FROM users WHERE id = ?', +msg.from);
      if (from && this.gameOf(from.id)) return this.push(user.id, { t: 'error', msg: 'Ce joueur est déjà en partie' });
      if (from && this.clients.has(from.id)) await (mode === 'battle' ? this.startBattle(from, user) : this.startDuel(from, user));
    } else if (msg.t === 'decline') {
      this.push(+msg.from, { t: 'info', msg: `${user.name} a refusé.` });
    } else if (msg.t === 'challenge_bot') {
      await this.startBotBattle(user);
    } else if (msg.t === 'pick') {
      await this.pick(user, msg);
    } else if (msg.t === 'answer') {
      this.answer(user, msg);
    } else if (msg.t === 'bf_pick') {
      this.fightPick(user, msg);
    } else if (msg.t === 'bf_answer') {
      this.fightAnswer(user, msg);
    }
  }

  gameOf(uid) { for (const g of [...this.battles.values(), ...this.duels.values()]) if (!g.over && g.players.includes(uid)) return g; return null; }
  /** Renvoie à un joueur l'état exact de sa partie (après une reconnexion, un retour sur l'appli ou un rechargement). */
  sync(uid) {
    const g = this.gameOf(uid);
    if (!g) return this.push(uid, { t: 'game_none' });
    if (g.qs && g.i !== undefined) {                                   // duel de quiz
      this.push(uid, { t: 'duel_start', id: g.id, names: g.names, total: Q_COUNT, resume: true });
      if (g.qMsg) this.push(uid, { ...g.qMsg, time: Math.max(0, Q_TIME - (now() - g.qStart)), full: Q_TIME, picked: g.answers[uid] ?? null });
      if (g.rev) this.push(uid, g.rev);
    } else if (g.fight) {                                              // combat en cours
      this.push(uid, g.startMsg);
      for (const { m, dl } of g.fight.log) this.push(uid, dl ? { ...m, time: Math.max(0, dl - now()), full: m.time } : m);
    } else if (g.picks[uid]) this.push(uid, { t: 'battle_wait', id: g.id, msg: 'Deck validé, en attente de l\'adversaire…' });
    else this.push(uid, { t: 'battle_start', id: g.id, names: g.names, rounds: CFG.BATTLE_ROUNDS, resume: true });
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
    d.rev = null; d.qMsg = { t: 'question', id: d.id, n: d.i + 1, total: Q_COUNT, text: q.text, options: q.options, time: Q_TIME };
    for (const p of d.players) this.push(p, d.qMsg);
    d.timer = setTimeout(() => this.closeQuestion(d), Q_TIME + 500);
  }
  closeQuestion(d) {
    if (d.over || d.rev) return;
    clearTimeout(d.timer);
    const q = d.qs[d.i];
    d.rev = { t: 'reveal', id: d.id, answer: q.answer, score: d.score, picks: d.answers };
    for (const p of d.players) this.push(p, d.rev);
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
    this.prefetchQuizzes(ids);                                       // les questions des cartes choisies se préparent pendant que l'adversaire choisit
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
  /** Texte de l'introduction de chaque article (jusqu'à 2 500 caractères), pour fabriquer des questions précises. */
  async articleTexts(cards) {
    const out = new Map(), UA = { 'User-Agent': 'WikimastersClone/1.0 (https://github.com/paulesthor/Redoublement-6000; jeu prive entre amis)' };
    const pid = c => (c.id >= SHINY ? c.id - SHINY : c.id);
    try {
      const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts', exintro: '1', explaintext: '1', exchars: '2500', exlimit: 'max', pageids: [...new Set(cards.map(pid))].join('|') });
      const r = await fetch('https://fr.wikipedia.org/w/api.php?' + params, { headers: UA });
      const pages = r.ok ? (await r.json()).query?.pages ?? {} : {};
      for (const c of cards) { const p = pages[pid(c)]; if (p && p.title === c.title && p.extract) out.set(c.id, p.extract); }
    } catch { /* repli sur l'extrait déjà stocké */ }
    return out;
  }
  async prefetchQuizzes(ids) {
    try {
      const rows = await cardRows(this.env, ids), texts = await this.articleTexts(rows);
      await Promise.all(rows.map(c => aiQuestions(this.env, c, texts.get(c.id) || c.extract)));
    } catch { /* tant pis : les règles prendront le relais */ }
  }
  // ---------- combat : 3 cartes chacun ; à tour de rôle, l'attaquant choisit une carte et le défenseur répond à 3 questions sur son article ----------
  // Chaque mauvaise réponse coûte au défenseur le tiers de l'ATK de la carte ; bonne réponse = rien. PV de départ = somme des DEF des 3 cartes. Le plus de PV à la fin gagne.
  async resolveBattle(bt) {                                          // appelé quand les deux équipes sont validées
    clearTimeout(bt.timer);
    for (const p of bt.players) this.push(p, { t: 'battle_prep', id: bt.id });
    const [a, b] = bt.players, pub = c => ({ id: c.id, title: c.title, rarity: c.rarity, shiny: c.shiny, atk: c.atk, def: c.def, image: c.image });
    const rows = {}; for (const uid of bt.players) rows[uid] = await cardRows(this.env, bt.picks[uid]);
    const first = Math.random() < .5 ? a : b;
    const f = bt.fight = { turn: 0, total: CFG.BATTLE_ROUNDS * 2, order: [first, first === a ? b : a], hp: {}, max: {}, deck: {}, left: {}, qs: new Map(), cur: null, log: [] };
    for (const uid of bt.players) { f.deck[uid] = rows[uid].map(pub); f.max[uid] = f.hp[uid] = f.deck[uid].reduce((t, c) => t + c.def, 0); f.left[uid] = new Set(f.deck[uid].map(c => c.id)); }
    const all6 = bt.players.flatMap(uid => rows[uid].map(c => ({ uid, c })));
    const [texts, pool] = await Promise.all([
      this.articleTexts(all6.map(x => x.c)),
      all(this.env, "SELECT id, title, extract, views FROM cards WHERE enriched >= 1 AND shiny = 0 AND length(extract) > 80 ORDER BY RANDOM() LIMIT 30"),
    ]);
    await Promise.all(all6.map(async ({ uid, c }) => f.qs.set(uid + ':' + c.id, await battleQuestions(this.env, c, texts.get(c.id) || c.extract, { cards: pool }, Q_PER_CARD))));
    bt.startMsg = { t: 'bf_start', id: bt.id, names: bt.names, a, b, deck: f.deck, hp: f.hp, max: f.max, first, total: f.total };
    for (const p of bt.players) this.push(p, bt.startMsg);
    setTimeout(() => this.fightTurn(bt), T.intro);
  }
  /** Envoie un évènement aux deux joueurs et le garde pour rejouer l'état à qui revient dans la partie (dl = heure limite éventuelle). */
  emit(bt, m, dl = 0) {
    const f = bt.fight;
    if (m.t === 'bf_turn') f.log = [];
    else if (m.t === 'bf_q') f.log = f.log.filter(e => e.m.t === 'bf_turn' || e.m.t === 'bf_card');
    f.log.push({ m, dl });
    for (const p of bt.players) this.push(p, m);
  }
  /** Joueur humain absent depuis trop longtemps ? */
  deserters(bt) { return bt.players.filter(p => p !== bt.bot && this.away.has(p) && now() - this.away.get(p) > AWAY_MAX); }
  fightTurn(bt) {
    if (bt.over) return;
    const f = bt.fight; f.turn++; f.cur = null;
    if (f.turn > f.total || this.deserters(bt).length) return this.endFight(bt);
    f.attacker = f.order[(f.turn - 1) % 2]; f.defender = bt.players.find(p => p !== f.attacker);
    this.emit(bt, { t: 'bf_turn', id: bt.id, turn: f.turn, total: f.total, attacker: f.attacker, defender: f.defender, hp: { ...f.hp }, left: Object.fromEntries(bt.players.map(u => [u, [...f.left[u]]])), time: FIGHT_PICK }, now() + FIGHT_PICK);
    const auto = () => { const ids = [...f.left[f.attacker]]; this.fightPick({ id: f.attacker }, { id: bt.id, card: ids[Math.floor(Math.random() * ids.length)] }); };
    bt.timer = setTimeout(auto, bt.bot === f.attacker ? 2000 + Math.random() * 2500 : FIGHT_PICK + 500);   // trop lent : carte tirée au hasard
  }
  fightPick(user, msg) {
    const bt = this.battles.get(msg.id), f = bt?.fight;
    if (!f || bt.over || f.cur || f.attacker !== user.id || !f.left[user.id].has(+msg.card)) return;
    clearTimeout(bt.timer);
    const card = f.deck[user.id].find(c => c.id === +msg.card);
    f.left[user.id].delete(card.id);
    f.cur = { card, qs: f.qs.get(user.id + ':' + card.id), k: -1, wrong: 0, lost: 0 };
    this.emit(bt, { t: 'bf_card', id: bt.id, turn: f.turn, attacker: f.attacker, defender: f.defender, card, hp: { ...f.hp } });
    setTimeout(() => this.fightQuestion(bt), T.card);
  }
  fightQuestion(bt) {
    if (bt.over) return;
    const f = bt.fight, c = f.cur; c.k++; c.choice = undefined; c.closed = false;
    if (c.k >= Q_PER_CARD) return this.fightTurnEnd(bt);
    if (this.deserters(bt).length) return this.endFight(bt);
    const q = c.qs[c.k];
    this.emit(bt, { t: 'bf_q', id: bt.id, turn: f.turn, k: c.k + 1, kTotal: Q_PER_CARD, attacker: f.attacker, defender: f.defender, card: c.card, text: q.text, options: q.options, time: B_TIME, hp: { ...f.hp } }, now() + B_TIME);
    if (bt.bot === f.defender) setTimeout(() => this.fightAnswer({ id: bt.bot }, { id: bt.id, choice: Math.random() < .55 ? q.answer : Math.floor(Math.random() * q.options.length) }), 2500 + Math.random() * 7000);
    bt.timer = setTimeout(() => this.closeFightQuestion(bt), B_TIME + 500);
  }
  fightAnswer(user, msg) {
    const bt = this.battles.get(msg.id), f = bt?.fight, c = f?.cur;
    if (!c || bt.over || c.k < 0 || c.k >= Q_PER_CARD || c.closed || c.choice !== undefined || f.defender !== user.id) return;
    c.choice = +msg.choice;
    this.emit(bt, { t: 'bf_picked', id: bt.id, turn: f.turn, k: c.k + 1, choice: c.choice });   // les deux voient la réponse choisie
    clearTimeout(bt.timer);
    bt.timer = setTimeout(() => this.closeFightQuestion(bt), T.closeAfterAnswer);
  }
  closeFightQuestion(bt) {
    if (bt.over) return;
    const f = bt.fight, c = f.cur; if (c.closed || c.k >= Q_PER_CARD) return; c.closed = true; clearTimeout(bt.timer);
    const q = c.qs[c.k], ok = c.choice === q.answer, dmg = ok ? 0 : Math.round(c.card.atk / 3);
    f.hp[f.defender] = Math.max(0, f.hp[f.defender] - dmg);
    if (!ok) c.wrong++; c.lost += dmg;
    this.emit(bt, { t: 'bf_a', id: bt.id, turn: f.turn, k: c.k + 1, choice: c.choice ?? null, right: q.answer, ok, dmg, hp: { ...f.hp }, defender: f.defender });
    setTimeout(() => this.fightQuestion(bt), T.nextQ);
  }
  fightTurnEnd(bt) {
    if (bt.over) return;
    const f = bt.fight, c = f.cur;
    this.emit(bt, { t: 'bf_turn_end', id: bt.id, turn: f.turn, attacker: f.attacker, defender: f.defender, wrong: c.wrong, lost: c.lost, hp: { ...f.hp } });
    setTimeout(() => this.fightTurn(bt), T.nextTurn);
  }
  async endFight(bt, quitters = this.deserters(bt)) {
    if (bt.over) return;
    bt.over = true; clearTimeout(bt.timer); this.battles.delete(bt.id);
    const f = bt.fight, [a, b] = bt.players;
    if (quitters.length === 2) return;                                // plus personne : rien à récompenser
    const win = quitters.length ? bt.players.find(p => !quitters.includes(p)) : f.hp[a] === f.hp[b] ? null : f.hp[a] > f.hp[b] ? a : b;
    const k = bt.bot ? .5 : 1;                                        // contre un joueur simulé, gains réduits de moitié
    await this.reward(bt.players.filter(p => p !== bt.bot), win, Math.round(CFG.BATTLE_WIN * k), Math.round(CFG.BATTLE_LOSE * k), Math.round(CFG.BATTLE_DRAW * k));
    for (const p of bt.players) this.push(p, { t: 'bf_end', id: bt.id, names: bt.names, a, b, hp: f.hp, max: f.max, winner: win, forfeit: quitters[0] ?? null });
  }
}
