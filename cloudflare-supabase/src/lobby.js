// Durable Object unique : WebSocket de tous les joueurs (présence, défis, duels de quiz, combats de cartes, notifications).
// L'état des parties en cours vit en mémoire ; seuls les résultats (pièces, victoires) sont écrits dans D1.
import CFG from './config.js';
import { withDb } from './pg.js';
import { one, all, run, st, placeholders, cardRows, caseSql, RANK, userFromToken, randomPool, meter, takeMeter, isQuotaError, nextResetMs, QUOTA_MSG } from './util.js';
import { battleQuestions, aiQuestions } from './aiquiz.js';
import { makeArticleQuestions } from './quiz.js';
import { pushFor } from './push.js';
import { bumpQuests, ensureGameSchema, boosted, tPayouts, grantTitle, TITLE, tourLabel } from './game.js';

const Q_COUNT = 5, Q_TIME = 15000, B_TIME = 18000, FIGHT_PICK = 30000, Q_PER_CARD = 3, SHINY = 100000000;
const AWAY_PAUSE = 180000;  // un joueur déconnecté en plein combat : on met le combat en pause et on l'attend jusqu'à 3 minutes, puis forfait
// pauses entre les étapes du combat (ms)
const T = { intro: 1800, card: 1300, closeAfterAnswer: 600, nextQ: 2000, nextTurn: 2200 };
const now = () => Date.now();
const FIGHT_BET = { min: 10, max: 500, fighter: 0.25, openTurns: 2 };   // paris sur les combats : mises, part du vainqueur dans la cagnotte perdante, dernier tour où l'on peut encore parier
const TOUR_WAIT = 10 * 60000;   // un joueur de tournoi absent plus de 10 minutes perd son match

function mask(extract, title) {
  const words = title.split(/\s+/).filter(w => w.length > 2).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  let t = extract.slice(0, 280);
  if (words.length) t = t.replace(new RegExp(words.join('|'), 'gi'), '█████');
  return t;
}
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);

export class Lobby {
  constructor(state, env) {
    this.env = meter(withDb(env), 'R:combats (WebSocket)'); this.state = state;
    this.clients = new Map(); // userId -> Set<WebSocket>
    this.duels = new Map();
    this.battles = new Map();
    this.hidden = new Map();  // userId -> true quand l'appli est en arrière-plan (écran verrouillé, autre appli) : on le notifie alors par push
    this.away = new Map();   // userId -> heure de la dernière déconnexion complète
    this.tours = new Set(); this.tlock = new Map();
    this.texts = new Map(); this.aiP = new Map(); this.poolC = null;   // textes d'articles, questions IA en cours de fabrication, cartes pour les questions de secours : partagés entre le choix des decks et le début du combat       // tournois en cours (ids) ; verrou par tournoi pendant une mise à jour
    setInterval(() => { this.broadcast({ t: 'ping' }); if (this.tours.size) this.tourTick().catch(e => console.error('tourTick', e)); this.betJanitor().catch(() => {}); }, 30000); // garde les connexions ouvertes
    state.blockConcurrencyWhile(() => this.restore().catch(e => console.error('restore', e)));   // les combats en cours survivent à un redémarrage du serveur (mise à jour du jeu…)
  }

  // ---------- durabilité : l'état des combats est copié dans le stockage du Durable Object ----------
  async addMeter(items) {
    if (!items.length) return;
    const key = 'meter:' + new Date().toISOString().slice(0, 10), cur = new Map((await this.state.storage.get(key)) ?? []);
    for (const [k, v] of items) { const o = cur.get(k) ?? {}; for (const [f, n] of Object.entries(v)) o[f] = (o[f] || 0) + n; cur.set(k, o); }
    await this.state.storage.put(key, [...cur]);
    if (!this.pruned || this.pruned !== key) {                       // on ne garde que 14 jours de statistiques
      this.pruned = key;
      const old = [...(await this.state.storage.list({ prefix: 'meter:' })).keys()].sort().slice(0, -14);
      for (const k of old) await this.state.storage.delete(k);
    }
  }
  /** Garde une trace des évènements d'un combat (consultable dans l'admin) : sert à comprendre pourquoi un combat s'arrête. */
  trace(bt, kind, detail = '') {
    this.env.DB.prepare('INSERT INTO fight_events (ts, battle, players, kind, detail) VALUES (?,?,?,?,?)').bind(now(), bt?.id?.slice(0, 8) ?? '', bt ? bt.players.map(p => bt.names[p]).join(' vs ') : '', kind, String(detail).slice(0, 300)).run().catch(() => {});
  }
  snap(bt) {
    const f = bt.fight;
    return { id: bt.id, players: bt.players, names: bt.names, bot: bt.bot, tour: bt.tour ?? null, stake: bt.stake ?? false, rounds: bt.rounds, qPer: bt.qPer, escrow: bt.escrow ?? null, picks: bt.picks, startMsg: bt.startMsg ?? null, phase: bt.phase ?? 'deck',
      fight: f && { turn: f.turn, total: f.total, order: f.order, hp: f.hp, max: f.max, deck: f.deck, attacker: f.attacker, defender: f.defender, log: f.log,
        left: Object.fromEntries(Object.entries(f.left).map(([u, set]) => [u, [...set]])), qs: [...f.qs.entries()],
        cur: f.cur && { card: f.cur.card, qkey: f.cur.qkey, k: f.cur.k, wrong: f.cur.wrong, lost: f.cur.lost, closed: !!f.cur.closed } } };
  }
  persist(bt) { if (!bt.over) this.state.storage.put('bt:' + bt.id, this.snap(bt)).catch(e => console.error('persist', e)); }
  forget(bt) { this.state.storage.delete('bt:' + bt.id).catch(() => {}); }
  async restore() {
    try { for (const x of await all(this.env, "SELECT id FROM tournaments WHERE status = 'running'")) this.tours.add(x.id); } catch { /* table pas encore créée */ }
    const saved = await this.state.storage.list({ prefix: 'bt:' });
    for (const [key, v] of saved) {
      try {
        const bt = { ...v, gen: 0, over: false, paused: false };
        if (v.fight) {
          const f = bt.fight; f.left = Object.fromEntries(Object.entries(f.left).map(([u, ids]) => [u, new Set(ids)])); f.qs = new Map(f.qs);
          if (f.cur) { f.cur.qs = f.qs.get(f.cur.qkey); f.cur.choice = undefined; }
          for (const p of bt.players) if (p !== bt.bot) this.away.set(p, now());               // comptés absents jusqu'à leur reconnexion (3 min avant forfait)
          this.battles.set(bt.id, bt);
          bt.rearm = () => this.resume(bt);
          this.trace(bt, 'restauré', `phase ${bt.phase}, tour ${f.turn}`);
          this.step(bt, 500, () => this.resume(bt));
        } else { await this.state.storage.delete(key); }                                           // choix de deck interrompu : on repart de zéro
      } catch (e) { console.error('restore battle', e); await this.state.storage.delete(key); }
    }
  }
  /** Reprend un combat restauré là où il en était (les étapes chronométrées repartent avec un temps neuf). */
  resume(bt) {
    switch (bt.phase) {
      case 'pick': return this.beginPick(bt);
      case 'q': return this.beginQuestion(bt);
      case 'card': case 'a': return this.fightQuestion(bt);
      default: return this.fightTurn(bt);                                                         // intro, fin d'attaque
    }
  }
  /** Une erreur inattendue ne doit jamais laisser les joueurs bloqués : on arrête proprement et on le leur dit. */
  crash(bt, e) {
    console.error('combat', e);
    this.trace(bt, 'erreur', e?.message ?? e);
    if (bt.over) return;
    bt.over = true; bt.gen++; this.battles.delete(bt.id); this.forget(bt);
    if (bt.stake) this.stakeSettle(bt, null).catch(() => {});                                       // cartes rendues
    this.betSettle(bt, null).catch(() => {});                                                          // paris remboursés
    for (const p of bt.players) this.push(p, { t: 'bf_error', id: bt.id, quota: isQuotaError(e) });
    if (bt.tour) this.tourRequeue(bt.tour).catch(() => {});                                          // le match de tournoi sera relancé
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
    if (url.pathname === '/meter') {                      // statistiques d'activité du jeu : cumul par jour, stocké ici (hors base de données)
      if (req.method === 'POST') { await this.addMeter(await req.json()); return new Response('ok'); }
      await this.addMeter(takeMeter());
      const n = Math.min(14, Math.max(1, +url.searchParams.get('days') || 1));
      const all = await this.state.storage.list({ prefix: 'meter:' });
      return Response.json({ days: [...all].sort(([a], [b]) => a.localeCompare(b)).slice(-n).map(([k, items]) => ({ day: k.slice(6), items })) });
    }
    if (url.pathname === '/live') return Response.json({ fights: await this.liveFights(+url.searchParams.get('uid') || 0) });
    if (url.pathname === '/bet') { const b = await req.json(); try { return Response.json(await this.placeBet(b)); } catch (e) { return Response.json({ error: e.message }, { status: e.status || 500 }); } }
    if (url.pathname === '/tour/start') { const { id } = await req.json(); await this.tourStart(+id); return new Response('ok'); }
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
    if (this.tours.size) this.tourKickAll().catch(() => {});   // un match de tournoi l'attendait peut-être
    this.sync(user.id);                                  // reprise d'une partie en cours après coupure ou retour sur l'appli
    server.addEventListener('message', ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } this.onMessage(user, m).catch(e => { console.error(e); this.push(user.id, isQuotaError(e) ? { t: 'error', msg: QUOTA_MSG, quota: true, until: nextResetMs() } : { t: 'error', msg: 'Erreur du serveur, réessaie.' }); }); });
    server.addEventListener('close', () => {
      const s = this.clients.get(user.id); s?.delete(server);
      if (s && !s.size) { this.clients.delete(user.id); this.away.set(user.id, now()); }
      this.presence();
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async onMessage(user, msg) {
    const mode = msg.mode === 'battle' || msg.mode === 'stake' ? msg.mode : 'quiz';
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
      if (from && this.clients.has(from.id)) await (mode === 'stake' ? this.startBattle(from, user, false, null, { stake: true }) : mode === 'battle' ? this.startBattle(from, user) : this.startDuel(from, user));
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
      if (g.paused) { const gone = this.absent(g); if (gone.length) this.push(uid, { t: 'bf_wait', id: g.id, names: gone.map(x => g.names[x]), until: Math.min(...gone.map(p => (this.away.get(p) ?? now()) + AWAY_PAUSE)) }); }
    } else if (g.picks[uid]) this.push(uid, { t: 'battle_wait', id: g.id, msg: 'Deck validé, en attente de l\'adversaire…' });
    else this.push(uid, { t: 'battle_start', id: g.id, names: g.names, rounds: g.rounds ?? CFG.BATTLE_ROUNDS, resume: true, tour: g.tour?.label, stake: g.stake });
  }

  // ---------- quiz ----------
  async makeQuestions() {
    const cards = await randomPool(this.env, Q_COUNT * 4);
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
    for (const p of d.players) bumpQuests(this.env, p, { duel_play: 1, duel_win: p === win ? 1 : 0 });
    for (const p of d.players) this.push(p, { t: 'duel_end', id: d.id, score: d.score, names: d.names, winner: win });
  }
  reward(players, win, W, L, D) {
    return this.env.DB.batch(players.map(p => st(this.env,
      'UPDATE users SET coins = coins + ?, duel_wins = duel_wins + ?, duel_losses = duel_losses + ? WHERE id = ?',
      win === null ? D : p === win ? W : L, p === win ? 1 : 0, win !== null && p !== win ? 1 : 0, p)));
  }

  // ---------- combats de cartes ----------
  async startBattle(a, b, vsBot = false, tour = null, opts = {}) {
    const bt = { id: crypto.randomUUID(), players: [a.id, b.id], names: { [a.id]: a.name, [b.id]: b.name }, picks: {}, bot: vsBot ? b.id : null, tour, stake: !!opts.stake, rounds: opts.stake ? 1 : CFG.BATTLE_ROUNDS, qPer: opts.stake ? 6 : Q_PER_CARD };
    this.battles.set(bt.id, bt);
    for (const p of bt.players) this.push(p, { t: 'battle_start', id: bt.id, names: bt.names, rounds: bt.rounds, tour: tour?.label, stake: bt.stake });
    this.trace(bt, 'début', vsBot ? 'contre un joueur simulé' : '');
    if (!vsBot) this.broadcast({ t: 'refresh', what: 'fights' });
    bt.timer = setTimeout(() => { // un joueur n'a pas choisi : combat annulé
      if (!this.battles.delete(bt.id)) return;
      this.trace(bt, 'annulé', 'deck non choisi à temps');
      this.betSettle(bt, bt.tour && bt.players.filter(p => bt.picks[p]).length === 1 ? bt.players.find(p => bt.picks[p]) : null).catch(() => {}); this.broadcast({ t: 'refresh', what: 'fights' });
      if (bt.tour) {                                                       // tournoi : celui qui n'a pas choisi d'équipe perd le match
        const ok = bt.players.filter(p => bt.picks[p]);
        for (const p of bt.players) { this.push(p, { t: 'info', msg: 'Match de tournoi : équipe non choisie à temps.' }); this.push(p, { t: 'battle_cancel' }); }
        return void this.tourResult(bt.tour.tid, bt.tour.mi, ok.length === 1 ? ok[0] : null).catch(e => console.error('tourResult', e));
      }
      for (const p of bt.players) { this.push(p, { t: 'info', msg: 'Combat annulé : équipe non choisie à temps.' }); this.push(p, { t: 'battle_cancel' }); }
    }, 90000);
  }
  async pick(user, msg) {
    const bt = this.battles.get(msg.id);
    const ids = (msg.cards || []).map(Number);
    if (!bt || !bt.players.includes(user.id) || bt.picks[user.id]) return;
    if (ids.length !== bt.rounds || new Set(ids).size !== ids.length) return this.push(user.id, { t: 'error', msg: `Choisis ${bt.rounds} carte${bt.rounds > 1 ? 's' : ''}${bt.rounds > 1 ? ' différentes' : ''}` });
    const owned = new Set((await all(this.env, `SELECT card_id FROM inventory WHERE user_id = ? AND card_id IN (${placeholders(ids.length)})`, user.id, ...ids)).map(r => r.card_id));
    if (!ids.every(i => owned.has(i))) return this.push(user.id, { t: 'error', msg: 'Carte non possédée' });
    bt.picks[user.id] = ids;
    this.prefetchQuizzes(ids, bt.qPer);                              // les questions des cartes choisies se préparent pendant que l'adversaire choisit
    if (bt.bot) { const bp = await this.botPicks(bt, user.id); if (!bp) { this.battles.delete(bt.id); return this.push(user.id, { t: 'error', msg: 'Le joueur simulé n’a pas trouvé d’équipe, réessaie' }); } bt.picks[bt.bot] = bp; }
    else this.push(user.id, { t: 'info', msg: 'Équipe validée, en attente de l’adversaire…' });
    if (bt.players.every(p => bt.picks[p])) { try { if (bt.stake && !(await this.stakeEscrow(bt))) return; await this.resolveBattle(bt); } catch (e) { this.crash(bt, e); } }
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
      const r = await one(this.env, `SELECT id FROM reserve WHERE rarity = ? ${ids.length ? `AND id NOT IN (${placeholders(ids.length)})` : ''} ORDER BY RANDOM() LIMIT 1`, byId.get(id).rarity, ...ids);
      if (r) { ids.push(r.id); continue; }
      const max = (await one(this.env, 'SELECT MAX(id) m FROM cards'))?.m ?? 0;                 // réserve vide pour cette rareté : carte quelconque de la même rareté, sans tri complet
      const alt = await one(this.env, `SELECT id FROM cards WHERE shiny = 0 AND rarity = ? AND id >= ? ${ids.length ? `AND id NOT IN (${placeholders(ids.length)})` : ''} ORDER BY id LIMIT 1`, byId.get(id).rarity, Math.floor(Math.random() * max), ...ids)
        ?? await one(this.env, `SELECT id FROM cards WHERE shiny = 0 AND rarity = ? ${ids.length ? `AND id NOT IN (${placeholders(ids.length)})` : ''} ORDER BY id LIMIT 1`, byId.get(id).rarity, ...ids);
      if (alt) ids.push(alt.id);
    }
    return ids.length === bt.picks[humanId].length ? ids : null;
  }
  /** Texte de l'introduction de chaque article (jusqu'à 4 000 caractères), pour fabriquer des questions précises. */
  async articleTexts(cards) {
    const out = new Map(), UA = { 'User-Agent': 'WikimastersClone/1.0 (https://github.com/paulesthor/Redoublement-6000; jeu prive entre amis)' };
    const pid = c => (c.id >= SHINY ? c.id - SHINY : c.id);
    for (const c of cards) if (this.texts.has(c.id)) out.set(c.id, this.texts.get(c.id));        // déjà lus pendant le choix des decks
    const todo = cards.filter(c => !out.has(c.id));
    if (!todo.length) return out;
    try {
      const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts', exintro: '1', explaintext: '1', exchars: '4000', exlimit: 'max', pageids: [...new Set(todo.map(pid))].join('|') });
      const r = await fetch('https://fr.wikipedia.org/w/api.php?' + params, { headers: UA });
      const pages = r.ok ? (await r.json()).query?.pages ?? {} : {};
      for (const c of todo) { const p = pages[pid(c)]; if (p && p.title === c.title && p.extract) { out.set(c.id, p.extract); this.texts.set(c.id, p.extract); } }
      if (this.texts.size > 300) for (const k of [...this.texts.keys()].slice(0, 100)) this.texts.delete(k);
    } catch { /* repli sur l'extrait déjà stocké */ }
    return out;
  }
  /** Questions IA d'une carte : une seule fabrication à la fois par carte (le choix du deck et le début du combat partagent le même travail). */
  aiShared(card, text, want = 3) {
    const k = card.id + ':' + want;
    let p = this.aiP.get(k);
    if (!p) { p = aiQuestions(this.env, card, text, want).catch(() => []); this.aiP.set(k, p); setTimeout(() => this.aiP.delete(k), 600000); }
    return p;
  }
  async cardPool() {
    if (!this.poolC || now() - this.poolC.t > 300000) this.poolC = { t: now(), v: await randomPool(this.env, 30) };
    return this.poolC.v;
  }
  async prefetchQuizzes(ids, want = 3) {
    try {
      const rows = await cardRows(this.env, ids), texts = await this.articleTexts(rows);
      await Promise.all(rows.map(c => this.aiShared(c, texts.get(c.id) || c.extract, want)));
    } catch { /* tant pis : les règles prendront le relais */ }
  }
  // ---------- combat : 3 cartes chacun ; à tour de rôle, l'attaquant choisit une carte et le défenseur répond à 3 questions sur son article ----------
  // Chaque mauvaise réponse coûte au défenseur le tiers de l'ATK de la carte ; bonne réponse = rien. PV de départ = somme des DEF des 3 cartes. Le plus de PV à la fin gagne.
  async resolveBattle(bt) {                                          // appelé quand les deux équipes sont validées
    clearTimeout(bt.timer);
    for (const p of bt.players) this.push(p, { t: 'battle_prep', id: bt.id });
    const [a, b] = bt.players, pub = c => ({ id: c.id, title: c.title, rarity: c.rarity, shiny: c.shiny, atk: c.atk, def: c.def, lvl: c.lvl || 0, image: c.image });
    const t0 = now();
    await ensureGameSchema(this.env);
    const rows = {};
    await Promise.all(bt.players.map(async uid => {                   // les deux équipes en parallèle
      const base = await cardRows(this.env, bt.picks[uid]);
      if (uid === bt.bot || !base.length) { rows[uid] = base; return; }
      const lv = bt.escrow ? new Map([[bt.escrow.cid[uid], bt.escrow.lvl[uid]]]) : new Map((await all(this.env, `SELECT card_id, lvl FROM inventory WHERE user_id = ? AND card_id IN (${placeholders(base.length)})`, uid, ...base.map(c => c.id))).map(x => [x.card_id, x.lvl]));
      rows[uid] = base.map(c => boosted(c, CFG.RARITIES.indexOf(c.rarity), lv.get(c.id) || 0));   // les stats de fusion comptent en combat
    }));
    const tRows = now() - t0;
    const first = Math.random() < .5 ? a : b;
    const f = bt.fight = { turn: 0, total: bt.rounds * 2, order: [first, first === a ? b : a], hp: {}, max: {}, deck: {}, left: {}, qs: new Map(), cur: null, log: [] };
    for (const uid of bt.players) { f.deck[uid] = rows[uid].map(pub); f.max[uid] = f.hp[uid] = f.deck[uid].reduce((t, c) => t + c.def, 0); f.left[uid] = new Set(f.deck[uid].map(c => c.id)); }
    const all6 = bt.players.flatMap(uid => rows[uid].map(c => ({ uid, c })));
    const [texts, pool] = await Promise.all([this.articleTexts(all6.map(x => x.c)), this.cardPool()]);
    const tTexts = now() - t0 - tRows;
    // l'IA a au plus 7 s pour fabriquer des questions manquantes : passé ce délai, on prend les questions « à règles » (l'IA termine en tâche de fond et les garde pour la prochaine fois)
    let slow = 0;
    await Promise.all(all6.map(async ({ uid, c }) => {
      const text = texts.get(c.id) || c.extract, fallback = Symbol();
      const ai = battleQuestions(this.env, c, text, { cards: pool }, bt.qPer, (cc, tx, want) => this.aiShared(cc, tx, want));
      const q = await Promise.race([ai, new Promise(res => setTimeout(() => res(fallback), 7000))]);
      if (q === fallback) { slow++; f.qs.set(uid + ':' + c.id, makeArticleQuestions(c, text, { cards: pool }, bt.qPer)); } else f.qs.set(uid + ':' + c.id, q);
    }));
    this.trace(bt, 'préparation', `${now() - t0} ms (cartes ${tRows}, textes ${tTexts}, questions ${now() - t0 - tRows - tTexts}${slow ? `, ${slow} carte(s) sans IA car trop lentes` : ''})`);
    bt.startMsg = { t: 'bf_start', id: bt.id, names: bt.names, a, b, deck: f.deck, hp: f.hp, max: f.max, first, total: f.total };
    for (const p of bt.players) this.push(p, bt.startMsg);
    bt.gen = 0; bt.phase = 'intro'; bt.rearm = () => this.resume(bt);
    this.persist(bt);
    this.step(bt, T.intro, () => this.fightTurn(bt));
  }
  /** Envoie un évènement aux deux joueurs et le garde pour rejouer l'état à qui revient dans la partie (dl = heure limite éventuelle). */
  emit(bt, m, dl = 0) {
    const f = bt.fight;
    if (m.t === 'bf_turn') f.log = [];
    else if (m.t === 'bf_q') f.log = f.log.filter(e => e.m.t === 'bf_turn' || e.m.t === 'bf_card');
    f.log.push({ m, dl });
    for (const p of bt.players) this.push(p, m);
    this.persist(bt);
  }
  /** Joueurs humains actuellement déconnectés. */
  absent(bt) { return bt.players.filter(p => p !== bt.bot && !this.clients.has(p)); }
  /**
   * Planifie l'étape suivante du combat. Si un joueur est déconnecté au moment de l'exécuter, le combat est mis en pause (personne n'est pénalisé) :
   * on le reprend dès son retour (les étapes chronométrées repartent avec un temps neuf), ou forfait si l'absence dépasse AWAY_PAUSE.
   */
  step(bt, ms, fn, timed = false) {
    const g = bt.gen;
    const run = () => {
      if (bt.over || g !== bt.gen) return;                             // partie finie, ou étape remplacée par une plus récente
      const gone = this.absent(bt);
      if (!gone.length) {
        if (bt.paused) { bt.paused = false; this.trace(bt, 'reprise'); for (const p of bt.players) this.push(p, { t: 'bf_resume', id: bt.id }); if (timed && bt.rearm) { try { bt.rearm(); } catch (e) { this.crash(bt, e); } return; } }
        try { const r = fn(); if (r && r.catch) r.catch(e => this.crash(bt, e)); } catch (e) { this.crash(bt, e); }
        return;
      }
      const lost = gone.filter(p => now() - (this.away.get(p) ?? now()) > AWAY_PAUSE);
      if (lost.length) return this.endFight(bt, lost);
      if (!bt.paused) {
        bt.paused = true; this.trace(bt, 'pause', gone.map(x => bt.names[x]).join(', ') + ' déconnecté');
        const until = Math.min(...gone.map(p => (this.away.get(p) ?? now()) + AWAY_PAUSE));
        for (const p of bt.players) this.push(p, { t: 'bf_wait', id: bt.id, names: gone.map(x => bt.names[x]), until });
      }
      setTimeout(run, 1500);
    };
    return setTimeout(run, ms);
  }
  /** Envoie un évènement aux deux joueurs et le garde pour rejouer l'état à qui revient dans la partie (dl = heure limite éventuelle). */
  fightTurn(bt) {
    if (bt.over) return;
    const f = bt.fight; f.turn++; f.cur = null;
    if (f.turn > f.total) return this.endFight(bt);
    f.attacker = f.order[(f.turn - 1) % 2]; f.defender = bt.players.find(p => p !== f.attacker);
    this.beginPick(bt);
  }
  beginPick(bt) {
    const f = bt.fight; bt.gen++; bt.phase = 'pick';
    this.emit(bt, { t: 'bf_turn', id: bt.id, turn: f.turn, total: f.total, attacker: f.attacker, defender: f.defender, hp: { ...f.hp }, left: Object.fromEntries(bt.players.map(u => [u, [...f.left[u]]])), time: FIGHT_PICK }, now() + FIGHT_PICK);
    bt.rearm = () => this.beginPick(bt);                               // reprise après une pause : le joueur retrouve ses 30 s entières
    const auto = () => { const ids = [...f.left[f.attacker]]; this.fightPick({ id: f.attacker }, { id: bt.id, card: ids[Math.floor(Math.random() * ids.length)] }); };
    this.step(bt, f.left[f.attacker].size === 1 ? 1500 : bt.bot === f.attacker ? 2000 + Math.random() * 2500 : FIGHT_PICK + 500, auto, true);   // une seule carte restante : elle monte au combat toute seule   // trop lent : carte tirée au hasard
  }
  fightPick(user, msg) {
    const bt = this.battles.get(msg.id), f = bt?.fight;
    if (!f || bt.over || f.cur || f.attacker !== user.id || !f.left[user.id].has(+msg.card)) return;
    bt.gen++; bt.phase = 'card';
    const card = f.deck[user.id].find(c => c.id === +msg.card);
    f.left[user.id].delete(card.id);
    f.cur = { card, qkey: user.id + ':' + card.id, qs: f.qs.get(user.id + ':' + card.id), k: -1, wrong: 0, lost: 0 };
    this.emit(bt, { t: 'bf_card', id: bt.id, turn: f.turn, attacker: f.attacker, defender: f.defender, card, hp: { ...f.hp } });
    this.step(bt, T.card, () => this.fightQuestion(bt));
  }
  fightQuestion(bt) {
    if (bt.over) return;
    const f = bt.fight, c = f.cur; c.k++; c.choice = undefined; c.closed = false;
    if (c.k >= bt.qPer) return this.fightTurnEnd(bt);
    this.beginQuestion(bt);
  }
  beginQuestion(bt) {
    const f = bt.fight, c = f.cur, q = c.qs[c.k]; bt.gen++; bt.phase = 'q'; c.choice = undefined; c.closed = false;
    this.emit(bt, { t: 'bf_q', id: bt.id, turn: f.turn, k: c.k + 1, kTotal: bt.qPer, attacker: f.attacker, defender: f.defender, card: c.card, text: q.text, options: q.options, time: B_TIME, hp: { ...f.hp } }, now() + B_TIME);
    bt.rearm = () => this.beginQuestion(bt);                           // reprise après une pause : la question est reposée avec un temps neuf
    if (bt.bot === f.defender) setTimeout(() => this.fightAnswer({ id: bt.bot }, { id: bt.id, choice: Math.random() < .55 ? q.answer : Math.floor(Math.random() * q.options.length) }), 2500 + Math.random() * 7000);
    this.step(bt, B_TIME + 500, () => this.closeFightQuestion(bt), true);
  }
  fightAnswer(user, msg) {
    const bt = this.battles.get(msg.id), f = bt?.fight, c = f?.cur;
    if (!c || bt.over || c.k < 0 || c.k >= bt.qPer || c.closed || c.choice !== undefined || f.defender !== user.id) return;
    c.choice = +msg.choice;
    this.emit(bt, { t: 'bf_picked', id: bt.id, turn: f.turn, k: c.k + 1, choice: c.choice });   // les deux voient la réponse choisie
    bt.gen++;
    this.step(bt, T.closeAfterAnswer, () => this.closeFightQuestion(bt));
  }
  closeFightQuestion(bt) {
    if (bt.over) return;
    const f = bt.fight, c = f.cur; if (c.closed || c.k >= bt.qPer) return; c.closed = true; bt.gen++; bt.phase = 'a';
    const q = c.qs[c.k], ok = c.choice === q.answer, dmg = ok ? 0 : Math.round(c.card.atk / bt.qPer);
    f.hp[f.defender] = Math.max(0, f.hp[f.defender] - dmg);
    if (!ok) c.wrong++; c.lost += dmg;
    if (ok && f.defender !== bt.bot) bumpQuests(this.env, f.defender, { battle_correct: 1 });
    this.emit(bt, { t: 'bf_a', id: bt.id, turn: f.turn, k: c.k + 1, choice: c.choice ?? null, right: q.answer, ok, dmg, hp: { ...f.hp }, defender: f.defender });
    this.step(bt, T.nextQ, () => this.fightQuestion(bt));
  }
  fightTurnEnd(bt) {
    if (bt.over) return;
    const f = bt.fight, c = f.cur; bt.phase = 'turnend';
    this.emit(bt, { t: 'bf_turn_end', id: bt.id, turn: f.turn, attacker: f.attacker, defender: f.defender, wrong: c.wrong, lost: c.lost, hp: { ...f.hp } });
    this.step(bt, T.nextTurn, () => this.fightTurn(bt));
  }
  async endFight(bt, quitters = []) {
    if (bt.over) return;
    bt.over = true; bt.gen++; this.battles.delete(bt.id); this.forget(bt);
    const f = bt.fight, [a, b] = bt.players;
    this.trace(bt, 'fin', quitters.length ? `forfait de ${quitters.map(p => bt.names[p]).join(', ')}` : `normale, tour ${Math.min(f.turn, f.total)}/${f.total}, PV ${a}:${f.hp[a]} ${b}:${f.hp[b]}`);
    if (quitters.length === 2) { this.betSettle(bt, null).catch(() => {}); this.broadcast({ t: 'refresh', what: 'fights' }); if (bt.stake) await this.stakeSettle(bt, null); if (bt.tour) await this.tourResult(bt.tour.tid, bt.tour.mi, null); return; }   // plus personne : rien à récompenser
    const win = quitters.length ? bt.players.find(p => !quitters.includes(p)) : f.hp[a] === f.hp[b] ? null : f.hp[a] > f.hp[b] ? a : b;
    if (bt.stake) await this.stakeSettle(bt, win);
    await this.betSettle(bt, win).catch(e => console.error('paris', e)); this.broadcast({ t: 'refresh', what: 'fights' });
    const k = bt.bot ? .5 : 1;                                        // contre un joueur simulé, gains réduits de moitié
    await this.reward(bt.players.filter(p => p !== bt.bot), win, Math.round(CFG.BATTLE_WIN * k), Math.round(CFG.BATTLE_LOSE * k), Math.round(CFG.BATTLE_DRAW * k));
    for (const p of bt.players) if (p !== bt.bot) bumpQuests(this.env, p, { battle_play: 1, battle_win: p === win ? 1 : 0 });
    for (const p of bt.players) this.push(p, { t: 'bf_end', id: bt.id, names: bt.names, a, b, hp: f.hp, max: f.max, winner: win, forfeit: quitters[0] ?? null, stake: bt.stake ? { cards: Object.fromEntries(bt.players.map(p => [p, { title: f.deck[p][0].title, rarity: f.deck[p][0].rarity, image: f.deck[p][0].image }])) } : undefined, tour: bt.tour ? (win === null ? 'Égalité : tirage au sort pour le tournoi.' : bt.tour.lb) : undefined });
    if (bt.tour) await this.tourResult(bt.tour.tid, bt.tour.mi, win);
  }
  // ---------- tournois : 4 joueurs, 2 demi-finales en même temps, puis finale et match pour la 3e place ----------
  async tourLoad(id) {
    const t = await one(this.env, 'SELECT * FROM tournaments WHERE id = ?', id);
    if (!t) return null;
    try { t.br = t.bracket ? JSON.parse(t.bracket) : null; } catch { t.br = null; }
    return t;
  }
  tourSave(t) { return run(this.env, 'UPDATE tournaments SET bracket = ?, stage = ? WHERE id = ?', JSON.stringify(t.br), t.br.stage, t.id); }
  /** Exclusion : une seule mise à jour à la fois par tournoi. */
  tourLocked(id, fn) {
    const p = (this.tlock.get(id) ?? Promise.resolve()).catch(() => {}).then(fn);
    this.tlock.set(id, p.catch(() => {}));
    return p;
  }
  async tourStart(id) {
    await this.tourLocked(id, async () => {
      const t = await this.tourLoad(id);
      if (!t || t.br) return;
      const ps = shuffle(await all(this.env, 'SELECT p.user_id id, u.name FROM tournament_players p JOIN users u ON u.id = p.user_id WHERE p.tid = ?', id));
      const n = t.maxp;
      if (ps.length !== n || ![4, 8].includes(n)) return;
      const matches = [];
      for (let i = 0; i < n; i += 2) matches.push({ r: 1, g: '', lb: tourLabel(n, 1, ''), a: ps[i].id, b: ps[i + 1].id, s: 'wait', since: now() });
      t.br = { stage: 1, rounds: Math.log2(n), n, names: Object.fromEntries(ps.map(p => [p.id, p.name])), matches };
      await this.tourSave(t);
      this.tours.add(id);
      for (const p of ps) this.tourNote(p.id, `Tournoi n°${id} : c'est parti (${t.br.matches[0].lb}) ! Reste en ligne et choisis ton équipe.`);
      await this.tourKick(t);
    });
  }
  /** Accorde un titre et prévient le joueur s'il vient de le débloquer. */
  titleNote(uid, id) { grantTitle(this.env, uid, id).then(n => n && this.tourNote(uid, `Nouveau titre débloqué : « ${TITLE[id].label} » !`)).catch(() => {}); }
  tourNote(uid, msg) { this.push(uid, { t: 'notify', msg }); if (!this.clients.has(uid) || this.hidden.get(uid)) pushFor(this.env, uid, { t: 'notify', msg }).catch(() => {}); }
  /** Lance les matchs de l'étape dont les deux joueurs sont connectés et libres ; prévient les absents. */
  async tourKick(t) {
    let dirty = false;
    t.br.matches.forEach((m, mi) => { if (m.s === 'live' && !this.liveFor(t.id, mi)) { m.s = 'wait'; m.since = now(); dirty = true; } });   // combat perdu (redémarrage) : à relancer
    for (const [mi, m] of t.br.matches.entries()) {
      if (m.s !== 'wait') continue;
      const free = u => this.clients.has(u) && !this.gameOf(u);
      if (free(m.a) && free(m.b)) {
        m.s = 'live'; dirty = true;
        await this.startBattle({ id: m.a, name: t.br.names[m.a] }, { id: m.b, name: t.br.names[m.b] }, false, { tid: t.id, mi, lb: m.lb, label: `Tournoi n°${t.id} · ${m.lb}` });
      } else if (!m.notified) {
        m.notified = true; dirty = true;
        for (const u of [m.a, m.b]) if (!free(u)) this.tourNote(u, `Tournoi n°${t.id} : ton match (${m.lb}) t'attend ! Tu as 10 minutes pour te connecter.`);
      }
    }
    if (dirty) await this.tourSave(t);
  }
  liveFor(tid, mi) { for (const b of this.battles.values()) if (!b.over && b.tour?.tid === tid && b.tour.mi === mi) return true; return false; }
  async tourKickAll() { for (const id of [...this.tours]) await this.tourLocked(id, async () => { const t = await this.tourLoad(id); if (t?.br) await this.tourKick(t); }); }
  async tourRequeue({ tid, mi }) {
    await this.tourLocked(tid, async () => { const t = await this.tourLoad(tid); const m = t?.br?.matches[mi]; if (m && m.s === 'live') { m.s = 'wait'; m.since = now(); m.notified = false; await this.tourSave(t); setTimeout(() => this.tourKickAll().catch(() => {}), 3000); } });
  }
  /** Toutes les 30 s : relance les matchs en attente et donne perdant celui qui ne se présente pas à temps. */
  async tourTick() {
    for (const id of [...this.tours]) {
      const late = []; let start = false;
      await this.tourLocked(id, async () => {
        const t = await this.tourLoad(id);
        if (!t || t.status !== 'running') { this.tours.delete(id); return; }
        if (!t.br) { start = true; return; }
        await this.tourKick(t);
        for (const [mi, m] of t.br.matches.entries()) if (m.s === 'wait' && now() - m.since >= TOUR_WAIT) late.push([mi, m]);
      });
      if (start) await this.tourStart(id);
      for (const [mi, m] of late) {
        const here = [m.a, m.b].filter(u => this.clients.has(u) && !this.gameOf(u));
        for (const u of [m.a, m.b]) this.tourNote(u, here.includes(u) && here.length === 1 ? `Tournoi n°${id} : ton adversaire est absent, tu gagnes le match par forfait.` : `Tournoi n°${id} : match perdu par forfait (absent plus de 10 minutes).`);
        await this.tourResult(id, mi, here.length === 1 ? here[0] : null);
      }
    }
  }
  /** Fin d'un match (winner = null : égalité ou double forfait, tirage au sort). Passe à l'étape suivante ou clôt le tournoi et verse les gains. */
  tourResult(tid, mi, winner) {
    return this.tourLocked(tid, async () => {
      const t = await this.tourLoad(tid);
      if (!t?.br || t.status !== 'running') return;
      const m = t.br.matches[mi];
      if (!m || m.s === 'done') return;
      if (winner !== m.a && winner !== m.b) winner = Math.random() < .5 ? m.a : m.b;
      m.s = 'done'; m.w = winner; m.l = winner === m.a ? m.b : m.a;
      const br = t.br, stage = br.stage, cur = br.matches.filter(x => x.r === stage);
      if (cur.every(x => x.s === 'done')) {
        if (stage < br.rounds) {
          br.stage = stage + 1;
          for (const g of [...new Set(cur.map(x => x.g))]) {
            const gm = cur.filter(x => x.g === g);
            for (const [sfx, key] of [['W', 'w'], ['L', 'l']]) {
              const ps = gm.map(x => x[key]);
              for (let i = 0; i < ps.length; i += 2) {
                const lb = tourLabel(br.n, stage + 1, g + sfx);
                br.matches.push({ r: stage + 1, g: g + sfx, lb, a: ps[i], b: ps[i + 1], s: 'wait', since: now() });
                for (const u of [ps[i], ps[i + 1]]) this.tourNote(u, `Tournoi n°${tid} : prochain match — ${lb}.`);
              }
            }
          }
        } else {
          const pos = x => [...x.g].reduce((s, c) => s * 2 + (c === 'L' ? 1 : 0), 0);
          const term = cur.slice().sort((x, y) => pos(x) - pos(y));
          br.stage = 'done'; br.rank = term.flatMap(x => [x.w, x.l]);
          const pay = tPayouts(br.n, t.stake), claim = await run(this.env, "UPDATE tournaments SET status = 'done', ended = ?, stage = 'done', bracket = ? WHERE id = ? AND status = 'running'", now(), JSON.stringify(br), tid);
          if (claim.meta.changes) {
            await this.env.DB.batch(br.rank.flatMap((u, i) => [st(this.env, 'UPDATE tournament_players SET payout = ? WHERE tid = ? AND user_id = ?', pay[i], tid, u), ...(pay[i] ? [st(this.env, 'UPDATE users SET coins = coins + ? WHERE id = ?', pay[i], u)] : [])]));
            for (const u of br.rank) this.titleNote(u, 'tour_play');
            this.titleNote(br.rank[0], 'tour_champ');
            br.rank.forEach((u, i) => this.tourNote(u, pay[i] ? `Tournoi n°${tid} : tu finis ${i + 1}ᵉ et gagnes ${pay[i] - t.stake} pièces !` : `Tournoi n°${tid} : tu finis ${i + 1}ᵉ et perds ta mise de ${t.stake} pièces.`));
          }
          this.tours.delete(tid);
          this.broadcast({ t: 'refresh', what: 'tournaments' });
          return;
        }
      }
      await this.tourSave(t);
      this.broadcast({ t: 'refresh', what: 'tournaments' });
      await this.tourKick(t);
    });
  }

  // ---------- duel à la mise : une carte chacun, 6 questions par carte, le vainqueur garde la carte de l'autre ----------
  /** Les deux cartes sont mises de côté (retirées des collections) dès que les deux joueurs ont choisi : elles ne peuvent plus être vendues ni échangées pendant le duel. */
  async stakeEscrow(bt) {
    const cid = Object.fromEntries(bt.players.map(p => [p, bt.picks[p][0]]));
    const rows = {};
    for (const p of bt.players) rows[p] = await one(this.env, 'SELECT qty, lvl FROM inventory WHERE user_id = ? AND card_id = ?', p, cid[p]);
    const bad = bt.players.find(p => !rows[p] || rows[p].qty < 1);
    const cancel = (msg) => { this.battles.delete(bt.id); this.forget(bt); this.betSettle(bt, null).catch(() => {}); this.broadcast({ t: 'refresh', what: 'fights' }); clearTimeout(bt.timer); for (const p of bt.players) { this.push(p, { t: 'info', msg }); this.push(p, { t: 'battle_cancel' }); } return false; };
    if (bad) return cancel(`Duel annulé : ${bt.names[bad]} ne possède plus la carte choisie.`);
    const res = await this.env.DB.batch([...bt.players.map(p => st(this.env, 'UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND card_id = ? AND qty >= 1', p, cid[p])), st(this.env, 'DELETE FROM inventory WHERE qty <= 0 AND card_id IN (?, ?) AND user_id IN (?, ?)', cid[bt.players[0]], cid[bt.players[1]], bt.players[0], bt.players[1])]);
    const took = bt.players.filter((p, i) => res[i].meta.changes);
    if (took.length < 2) {                                            // l'une des deux cartes a disparu entre-temps : on rend l'autre
      for (const p of took) await this.giveCard(p, cid[p], rows[p].lvl);
      return cancel('Duel annulé : une des cartes n’est plus disponible.');
    }
    bt.escrow = { cid, lvl: Object.fromEntries(bt.players.map(p => [p, rows[p].lvl])), done: false };
    this.persist(bt);
    return true;
  }
  /** Rend une carte à un joueur (même requête que l'ajout à la collection, avec son niveau de fusion). */
  giveCard(uid, cid, lvl = 0) {
    const rar = caseSql('c.rarity', RANK);
    return run(this.env, `INSERT INTO inventory (user_id, card_id, qty, acquired, rar, sh, skey, nk, fav, lvl)
      SELECT ?1, c.id, 1, ?3, ${rar}, c.shiny, ${rar}::bigint * 1000000000 + LEAST(c.views, 999999999), lower(c.title), 0, ?5 FROM cards c WHERE c.id = ?2
      ON CONFLICT(user_id, card_id) DO UPDATE SET qty = inventory.qty + 1, lvl = GREATEST(inventory.lvl, excluded.lvl)`, uid, cid, now(), 0, lvl);
  }
  /** Fin du duel : le vainqueur reçoit les deux cartes, le perdant n'a plus la sienne ; égalité ou annulation : chacun reprend la sienne. */
  async stakeSettle(bt, win) {
    const e = bt.escrow;
    if (!e || e.done) return;
    e.done = true;
    const [a, b] = bt.players;
    if (win === null || win === undefined) { await this.giveCard(a, e.cid[a], e.lvl[a]); await this.giveCard(b, e.cid[b], e.lvl[b]); }
    else { const lose = win === a ? b : a; await this.giveCard(win, e.cid[win], e.lvl[win]); await this.giveCard(win, e.cid[lose], 0); this.titleNote(win, 'stake_win'); }
  }

  // ---------- paris sur les combats : cagnotte partagée entre les parieurs du vainqueur, dont 25 % de la cagnotte perdante vont au combattant gagnant ----------
  betOpen(bt) { return !bt.over && !bt.bot && (!bt.fight || bt.fight.turn <= FIGHT_BET.openTurns); }
  /** Combats en cours entre joueurs (cartes, mise, tournoi) avec cagnotte, cotes et pari du joueur qui consulte. */
  async liveFights(uid) {
    await ensureGameSchema(this.env);
    const list = [...this.battles.values()].filter(b => !b.over && !b.bot);
    if (!list.length) return [];
    const ids = list.map(b => b.id), pids = [...new Set(list.flatMap(b => b.players))];
    const [pools, mine, recs] = await Promise.all([
      all(this.env, `SELECT battle, side, SUM(stake) s, COUNT(*) n FROM fight_bets WHERE settled = 0 AND battle IN (${placeholders(ids.length)}) GROUP BY battle, side`, ...ids),
      uid ? all(this.env, `SELECT battle, side, stake FROM fight_bets WHERE settled = 0 AND user_id = ? AND battle IN (${placeholders(ids.length)})`, uid, ...ids) : [],
      all(this.env, `SELECT id, duel_wins w, duel_losses l FROM users WHERE id IN (${placeholders(pids.length)})`, ...pids),
    ]);
    const rec = new Map(recs.map(r => [r.id, r]));
    return list.map(b => {
      const [a, c] = b.players, f = b.fight, pool = id => { const p = pools.find(x => x.battle === b.id && x.side === id); return { sum: +(p?.s || 0), n: +(p?.n || 0) }; };
      return { id: b.id, kind: b.tour ? 'tour' : b.stake ? 'stake' : 'combat', label: b.tour?.label ?? (b.stake ? 'Duel à la mise' : 'Combat de cartes'),
        players: [a, c].map(id => ({ id, name: b.names[id], w: rec.get(id)?.w ?? 0, l: rec.get(id)?.l ?? 0, hp: f?.hp?.[id] ?? null, max: f?.max?.[id] ?? null, bet: pool(id), deck: f ? f.deck[id].map(x => ({ t: x.title, r: x.rarity, atk: x.atk, def: x.def, lvl: x.lvl || 0 })) : null })),
        started: !!f, turn: f ? Math.min(f.turn, f.total) : 0, total: f?.total ?? b.rounds * 2, open: this.betOpen(b), mine: mine.find(m => m.battle === b.id) ?? null, fighting: b.players.includes(uid), share: FIGHT_BET.fighter };
    });
  }
  async placeBet({ uid, name, battle, side, stake }) {
    const E = (m, status = 400) => Object.assign(new Error(m), { status });
    await ensureGameSchema(this.env);
    const bt = this.battles.get(battle);
    if (!bt || bt.over || bt.bot) throw E('Ce combat n’est plus disponible', 404);
    if (bt.players.includes(uid)) throw E('Tu ne peux pas parier sur ton propre combat');
    if (!this.betOpen(bt)) throw E('Les paris sont fermés : le combat est trop avancé');
    side = +side; stake = Math.floor(+stake);
    if (!bt.players.includes(side)) throw E('Choisis l’un des deux joueurs');
    if (!(stake >= FIGHT_BET.min && stake <= FIGHT_BET.max)) throw E(`Mise entre ${FIGHT_BET.min} et ${FIGHT_BET.max} pièces`);
    if (await one(this.env, 'SELECT 1 x FROM fight_bets WHERE battle = ? AND user_id = ?', battle, uid)) throw E('Tu as déjà parié sur ce combat');
    const paid = await run(this.env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', stake, uid, stake);
    if (!paid.meta.changes) throw E('Pas assez de pièces');
    const ins = await run(this.env, 'INSERT INTO fight_bets (battle, user_id, side, stake, ts) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING', battle, uid, side, stake, now());
    if (!ins.meta.changes) { await run(this.env, 'UPDATE users SET coins = coins + ? WHERE id = ?', stake, uid); throw E('Tu as déjà parié sur ce combat'); }
    this.broadcast({ t: 'refresh', what: 'fights' });
    for (const p of bt.players) this.push(p, { t: 'notify', msg: `🎲 ${name} a parié ${stake} pièces sur ${bt.names[side]} (la cagnotte grossit !)` });
    return { ok: true };
  }
  /** Règle les paris d'un combat. win = id du vainqueur, ou null (égalité, annulation, panne : tout le monde est remboursé). */
  async betSettle(bt, win) {
    const rows = await all(this.env, 'SELECT id, user_id, side, stake FROM fight_bets WHERE battle = ? AND settled = 0', bt.id);
    if (!rows.length) return;
    const claim = await run(this.env, 'UPDATE fight_bets SET settled = 1 WHERE battle = ? AND settled = 0', bt.id);
    if (!claim.meta.changes) return;
    const total = rows.reduce((t, r) => t + r.stake, 0), onWin = rows.filter(r => r.side === win), winSum = onWin.reduce((t, r) => t + r.stake, 0), loserPool = total - winSum;
    const refund = win == null || !onWin.length || !loserPool;                                      // pas de vainqueur, ou personne d'un côté : on rend les mises
    const share = refund ? 0 : Math.floor(loserPool * FIGHT_BET.fighter), dist = total - share, stmts = [], notes = [];
    for (const r of rows) {
      const pay = refund ? r.stake : r.side === win ? Math.floor(r.stake / winSum * dist) : 0;
      stmts.push(st(this.env, 'UPDATE fight_bets SET payout = ? WHERE id = ?', pay, r.id));
      if (pay) stmts.push(st(this.env, 'UPDATE users SET coins = coins + ? WHERE id = ?', pay, r.user_id));
      notes.push([r.user_id, refund ? `Pari remboursé${bt.names?.[r.side] ? ` (${bt.names[r.side]})` : ''} : ${r.stake} pièces rendues.` : pay ? `Pari gagné sur ${bt.names[win]} : +${pay - r.stake} pièces !` : `Pari perdu sur ${bt.names[r.side]} : −${r.stake} pièces.`]);
    }
    if (share && !bt.bot) { stmts.push(st(this.env, 'UPDATE users SET coins = coins + ? WHERE id = ?', share, win)); notes.push([win, `Victoire ! Tu remportes aussi ${share} pièces de la cagnotte des paris.`]); }
    await this.env.DB.batch(stmts);
    for (const [u, msg] of notes) this.tourNote(u, msg);
  }
  /** Paris dont le combat a disparu (redémarrage du serveur…) : remboursés. */
  async betJanitor() {
    if (this.janitorAt && now() - this.janitorAt < 120000) return; this.janitorAt = now();
    await ensureGameSchema(this.env);
    const rows = await all(this.env, 'SELECT DISTINCT battle FROM fight_bets WHERE settled = 0 AND ts < ?', now() - 180000);
    for (const { battle } of rows) if (!this.battles.has(battle)) await this.betSettle({ id: battle, names: {}, bot: false }, null);
  }

}
