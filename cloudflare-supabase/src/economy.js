// Gagner des wikibidou autrement : Bourse (paris sur les vues Wikipédia), « Plus ou moins », cours des cartes et alertes, banque (épargne), dividendes de collection, expéditions.
// Les routes sont enregistrées par installEconomy(d), qui reçoit les outils de index.js.

const UA = { 'User-Agent': 'WikimastersClone/1.0 (https://github.com/paulesthor/Redoublement-6000; jeu prive entre amis)' };
export const BOURSE = { slots: 12, minStake: 10, maxStake: 500, maxBets: 8, dayStake: 2000, payout: 1.8, popularRanks: 1500 };
export const HILO = { minStake: 10, maxStake: 500, perDay: 6, step: 1.85, maxStreak: 10, gap: 0.15, ranks: 30000 };
export const BANK = { rate: 0.006, cap: 5000, lockDays: 7, fee: 0.1 };               // 0,6 % par jour, 5 000 pièces au plus, retrait avant 7 jours : 10 % de frais
export const DIV = { rate: [0.02, 0.1, 0.4, 1.5, 5, 20], lvl: 0.25, shiny: 2, album: 20, maxDays: 3 };   // pièces par carte et par jour, selon la rareté
export const EXPED = { slots: 2, maxCards: 12, hours: [[1, 1], [4, 3.2], [8, 6]], base: [3, 6, 15, 40, 120, 400], pack: { 1: 0.01, 4: 0.06, 8: 0.15 } };
const DAY = 86400000;
const ymd = d => d.replace(/-/g, '');
const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);

/** Vues Wikipédia par jour (UTC) d'un article entre deux jours « YYYY-MM-DD » : { 'YYYY-MM-DD': vues }, ou null si l'API ne répond pas. Un jour sans visite est absent. */
export async function pageViews(title, from, to, fetchFn = fetch) {
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${ymd(from)}00/${ymd(to)}00`;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4500);
    const r = await fetchFn(url, { headers: UA, signal: ctl.signal }); clearTimeout(t);
    if (r.status === 404) return {};
    if (!r.ok) return null;
    const j = await r.json(), out = {};
    for (const it of j.items ?? []) { const s = String(it.timestamp); out[`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`] = it.views; }
    return out;
  } catch { return null; }
}

export function installEconomy(d) {
  const { route, bad, one, all, run, st, placeholders, notify, bq, addCard, insertCard, entryAt, getMeta, stats, statsCache, ensureGameSchema, dayKey, msToMidnight, hash, CFG, now, assetOrigin, albumCount } = d;
  const rand = (a, b) => a + Math.random() * (b - a);
  const LIST = /^(Liste|Listes|Élections?|Championnat|Saison|Catégorie|Portail)\b|homonymie|^\d{4}\b/i;

  // ======================= BOURSE : hausse ou baisse des vues du jour =======================
  /** Marché du jour : 12 articles populaires avec leurs vues des 7 derniers jours ; construit une fois par jour. */
  let buildTry = 0;
  async function ensureMarket(env, origin) {
    await ensureGameSchema(env);
    const day = dayKey(), have = await all(env, 'SELECT slot FROM bourse_market WHERE day = ?', day);
    if (have.length >= 4 || now() - buildTry < 120000) return day;                  // déjà construit (ou essai récent sans succès)
    buildTry = now();
    const from = addDays(day, -7), to = addDays(day, -1), out = [];
    const cand = async slot => {
      for (let k = 0; k < 6; k++) {
        const e = await entryAt(env, origin, (hash(`bourse${day}${slot}`) + k * 104729) % BOURSE.popularRanks);
        if (LIST.test(e[1])) continue;
        const v = await pageViews(e[1], from, to);
        if (!v) return null;                                                          // l'API ne répond pas : on abandonne cet emplacement
        const series = []; for (let i = -7; i <= -1; i++) series.push(v[addDays(day, i)] ?? 0);
        if (series.filter(Boolean).length < 6) continue;                                // article trop peu consulté pour un pari lisible
        return { slot, id: e[0], title: e[1], series, ref: Math.round(series.reduce((t, x) => t + x, 0) / 7) };
      }
      return null;
    };
    for (const m of (await Promise.all(Array.from({ length: BOURSE.slots }, (_, s) => cand(s)))).filter(Boolean)) out.push(m);
    if (out.length < 4) return day;
    await env.DB.batch(out.map(m => st(env, "INSERT INTO bourse_market (day, slot, id, title, series, ref, status) VALUES (?,?,?,?,?,?,'open') ON CONFLICT DO NOTHING", day, m.slot, m.id, m.title, JSON.stringify(m.series), m.ref)));
    return day;
  }
  /** Règle les marchés des jours passés dès que les vues du jour sont publiées (4 jours d'attente au plus, sinon les mises sont rendues). */
  async function settleBourse(env, ctx) {
    await ensureGameSchema(env);
    const today = dayKey(), open = await all(env, "SELECT day, slot, id, title, ref FROM bourse_market WHERE status = 'open' AND day < ? ORDER BY day LIMIT 12", today);
    for (const m of open) {
      const v = await pageViews(m.title, m.day, m.day);
      let actual = v ? (v[m.day] ?? null) : null, void_ = false;
      if (actual === null) { if (v && m.day <= addDays(today, -4)) void_ = true; else continue; }
      const claim = await run(env, "UPDATE bourse_market SET status = ?, actual = ? WHERE day = ? AND slot = ? AND status = 'open'", void_ ? 'void' : 'done', actual, m.day, m.slot);
      if (!claim.meta.changes) continue;
      const bets = await all(env, 'SELECT user_id, dir, stake FROM bourse_bets WHERE day = ? AND slot = ? AND settled = 0', m.day, m.slot);
      const stmts = [];
      for (const b of bets) {
        const won = !void_ && ((b.dir === 'up' && actual > m.ref) || (b.dir === 'down' && actual < m.ref)), tie = void_ || actual === m.ref;
        const pay = tie ? b.stake : won ? Math.floor(b.stake * BOURSE.payout) : 0;
        stmts.push(st(env, 'UPDATE bourse_bets SET settled = 1, payout = ?, actual = ? WHERE user_id = ? AND day = ? AND slot = ?', pay, actual ?? 0, b.user_id, m.day, m.slot));
        if (pay) stmts.push(st(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', pay, b.user_id));
        notify(env, ctx, { t: 'notify', msg: tie ? `Bourse : « ${m.title} » est resté stable, mise rendue.` : won ? `Bourse : « ${m.title} » ${b.dir === 'up' ? 'monte' : 'baisse'} comme prévu : +${pay - b.stake} pièces !` : `Bourse : « ${m.title} » ${b.dir === 'up' ? 'n\'a pas monté' : 'n\'a pas baissé'} : mise perdue.` }, b.user_id);
      }
      if (stmts.length) await env.DB.batch(stmts);
    }
  }
  route('GET', '/api/bourse', async ({ env, ctx, user, origin }) => {
    const day = await ensureMarket(env, origin);
    await settleBourse(env, ctx).catch(() => {});
    const [market, bets, past] = await Promise.all([
      all(env, 'SELECT slot, id, title, series, ref FROM bourse_market WHERE day = ? ORDER BY slot', day),
      all(env, 'SELECT slot, dir, stake FROM bourse_bets WHERE user_id = ? AND day = ?', user.id, day),
      all(env, `SELECT b.day, b.dir, b.stake, b.payout, b.settled, b.actual, m.title, m.ref FROM bourse_bets b JOIN bourse_market m ON m.day = b.day AND m.slot = b.slot WHERE b.user_id = ? AND b.day < ? ORDER BY b.day DESC, b.slot LIMIT 20`, user.id, day),
    ]);
    const my = new Map(bets.map(b => [b.slot, b]));
    return { day, resetIn: msToMidnight(), payout: BOURSE.payout, min: BOURSE.minStake, max: BOURSE.maxStake, left: BOURSE.maxBets - bets.length, dayStake: BOURSE.dayStake - bets.reduce((t, b) => t + b.stake, 0),
      market: market.map(m => ({ slot: m.slot, id: m.id, title: m.title, series: JSON.parse(m.series), ref: m.ref, bet: my.get(m.slot) ?? null })),
      past: past.map(p => ({ ...p, result: !p.settled ? 'wait' : p.payout > p.stake ? 'won' : p.payout === p.stake ? 'tie' : 'lost' })) };
  });
  route('POST', '/api/bourse/bet', async ({ env, ctx, user, body, origin }) => {
    const day = await ensureMarket(env, origin), slot = Math.floor(+body.slot), stake = Math.floor(+body.stake), dir = body.dir === 'down' ? 'down' : body.dir === 'up' ? 'up' : null;
    if (!dir) bad('Choisis hausse ou baisse');
    if (!(stake >= BOURSE.minStake && stake <= BOURSE.maxStake)) bad(`Mise entre ${BOURSE.minStake} et ${BOURSE.maxStake} pièces`);
    if (!(await one(env, 'SELECT 1 x FROM bourse_market WHERE day = ? AND slot = ?', day, slot))) bad('Titre inconnu', 404);
    const today = await one(env, 'SELECT COUNT(*) n, COALESCE(SUM(stake), 0) s FROM bourse_bets WHERE user_id = ? AND day = ?', user.id, day);
    if (today.n >= BOURSE.maxBets) bad(`Maximum ${BOURSE.maxBets} paris par jour`);
    if (+today.s + stake > BOURSE.dayStake) bad(`Maximum ${BOURSE.dayStake} pièces misées par jour`);
    const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', stake, user.id, stake);
    if (!paid.meta.changes) bad('Pas assez de pièces');
    const ins = await run(env, 'INSERT INTO bourse_bets (user_id, day, slot, dir, stake) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING', user.id, day, slot, dir, stake);
    if (!ins.meta.changes) { await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', stake, user.id); bad('Tu as déjà parié sur ce titre aujourd’hui'); }
    bq(env, ctx, user.id, { bourse_bet: 1, spend: stake });
    return { ok: true };
  });

  // ======================= PLUS OU MOINS =======================
  const hiloMult = n => Math.round(Math.pow(HILO.step, n) * 100) / 100;
  async function pickPair(env, origin, prevB = null) {
    const { ranges } = await getMeta(env, origin), max = Math.min(HILO.ranks, ranges.ultra[1]);
    const pick = async () => { for (let i = 0; i < 12; i++) { const e = await entryAt(env, origin, Math.floor(Math.random() * max)); if (!LIST.test(e[1]) && e[2] > 0) return { id: e[0], t: e[1], v: e[2] }; } return null; };
    const a = prevB ?? await pick();
    for (let i = 0; i < 25; i++) { const b = await pick(); if (a && b && b.id !== a.id && Math.abs(b.v - a.v) / Math.max(a.v, b.v) >= HILO.gap) return { a, b }; }
    return null;
  }
  const hiloView = g => g && g.active ? { active: true, stake: g.stake, streak: g.streak, mult: hiloMult(g.streak), next: hiloMult(g.streak + 1), cash: Math.floor(g.stake * hiloMult(g.streak)), a: { t: JSON.parse(g.pair).a.t, v: JSON.parse(g.pair).a.v }, b: { t: JSON.parse(g.pair).b.t } } : { active: false };
  route('GET', '/api/hilo', async ({ env, user }) => {
    await ensureGameSchema(env);
    const g = await one(env, 'SELECT * FROM hilo_games WHERE user_id = ?', user.id), day = dayKey();
    return { ...hiloView(g), plays: g && g.day === day ? g.plays : 0, perDay: HILO.perDay, min: HILO.minStake, max: HILO.maxStake, step: HILO.step, table: Array.from({ length: 6 }, (_, i) => hiloMult(i + 1)) };
  });
  route('POST', '/api/hilo/start', async ({ env, user, body, origin }) => {
    await ensureGameSchema(env);
    const stake = Math.floor(+body.stake), day = dayKey();
    if (!(stake >= HILO.minStake && stake <= HILO.maxStake)) bad(`Mise entre ${HILO.minStake} et ${HILO.maxStake} pièces`);
    const g = await one(env, 'SELECT * FROM hilo_games WHERE user_id = ?', user.id);
    if (g?.active) bad('Une partie est déjà en cours');
    if (g && g.day === day && g.plays >= HILO.perDay) bad(`Maximum ${HILO.perDay} parties par jour`);
    const pair = await pickPair(env, origin); if (!pair) bad('Impossible de préparer une partie, réessaie', 503);
    const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', stake, user.id, stake);
    if (!paid.meta.changes) bad('Pas assez de pièces');
    await run(env, `INSERT INTO hilo_games (user_id, day, plays, active, stake, streak, pair) VALUES (?,?,1,1,?,0,?)
      ON CONFLICT (user_id) DO UPDATE SET day = excluded.day, plays = CASE WHEN hilo_games.day = excluded.day THEN hilo_games.plays + 1 ELSE 1 END, active = 1, stake = excluded.stake, streak = 0, pair = excluded.pair`, user.id, day, stake, JSON.stringify(pair));
    return hiloView(await one(env, 'SELECT * FROM hilo_games WHERE user_id = ?', user.id));
  });
  route('POST', '/api/hilo/guess', async ({ env, ctx, user, body, origin }) => {
    await ensureGameSchema(env);
    const g = await one(env, 'SELECT * FROM hilo_games WHERE user_id = ?', user.id);
    if (!g?.active) bad('Aucune partie en cours');
    const guess = body.guess === 'less' ? 'less' : body.guess === 'more' ? 'more' : null; if (!guess) bad('Plus ou moins ?');
    const { a, b } = JSON.parse(g.pair), right = (b.v > a.v) === (guess === 'more');
    if (!right) {
      const done = await run(env, 'UPDATE hilo_games SET active = 0 WHERE user_id = ? AND active = 1 AND streak = ?', user.id, g.streak);
      if (!done.meta.changes) bad('Réessaie');
      return { active: false, right: false, reveal: { t: b.t, v: b.v }, a: { t: a.t, v: a.v }, lost: g.stake };
    }
    const streak = g.streak + 1;
    if (streak >= HILO.maxStreak) {                                                     // série maximale : encaissé d'office
      const done = await run(env, 'UPDATE hilo_games SET active = 0, streak = ? WHERE user_id = ? AND active = 1 AND streak = ?', streak, user.id, g.streak);
      if (!done.meta.changes) bad('Réessaie');
      const pay = Math.floor(g.stake * hiloMult(streak)); await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', pay, user.id);
      return { active: false, right: true, cashed: pay, reveal: { t: b.t, v: b.v }, a: { t: a.t, v: a.v }, streak };
    }
    const pair = await pickPair(env, origin, b); if (!pair) { await run(env, 'UPDATE hilo_games SET active = 0 WHERE user_id = ?', user.id); const pay = Math.floor(g.stake * hiloMult(streak)); await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', pay, user.id); return { active: false, right: true, cashed: pay, reveal: { t: b.t, v: b.v }, a: { t: a.t, v: a.v }, streak }; }
    const upd = await run(env, 'UPDATE hilo_games SET streak = ?, pair = ? WHERE user_id = ? AND active = 1 AND streak = ?', streak, JSON.stringify(pair), user.id, g.streak);
    if (!upd.meta.changes) bad('Réessaie');
    return { ...hiloView(await one(env, 'SELECT * FROM hilo_games WHERE user_id = ?', user.id)), right: true, reveal: { t: b.t, v: b.v }, prev: { t: a.t, v: a.v } };
  });
  route('POST', '/api/hilo/cashout', async ({ env, user }) => {
    await ensureGameSchema(env);
    const g = await one(env, 'SELECT * FROM hilo_games WHERE user_id = ?', user.id);
    if (!g?.active) bad('Aucune partie en cours');
    if (g.streak < 1) bad('Réponds au moins une fois avant d’encaisser');
    const done = await run(env, 'UPDATE hilo_games SET active = 0 WHERE user_id = ? AND active = 1 AND streak = ?', user.id, g.streak);
    if (!done.meta.changes) bad('Réessaie');
    const pay = Math.floor(g.stake * hiloMult(g.streak)); await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', pay, user.id);
    return { ok: true, cashed: pay, streak: g.streak };
  });

  // ======================= COURS DES CARTES, TENDANCES, ALERTES =======================
  route('GET', '/api/cards/:id/prices', async ({ env, params }) => {
    const rows = (await all(env, 'SELECT price, ts FROM sales WHERE card_id = ? ORDER BY id DESC LIMIT 30', +params.id)).reverse();
    const avg = rows.length ? Math.round(rows.reduce((t, r) => t + r.price, 0) / rows.length) : null;
    return { sales: rows, avg, last: rows.at(-1)?.price ?? null, min: rows.length ? Math.min(...rows.map(r => r.price)) : null, max: rows.length ? Math.max(...rows.map(r => r.price)) : null };
  });
  route('GET', '/api/trends', async ({ env, user }) => {
    await ensureGameSchema(env);
    const rows = await all(env, 'SELECT s.card_id, s.price, s.ts, c.title, c.rarity, c.image FROM sales s JOIN cards c ON c.id = s.card_id ORDER BY s.id DESC LIMIT 600');
    const by = new Map();
    for (const r of rows) { if (!by.has(r.card_id)) by.set(r.card_id, { id: r.card_id, title: r.title, rarity: r.rarity, image: r.image, prices: [] }); by.get(r.card_id).prices.push(r.price); }
    const list = [...by.values()].filter(c => c.prices.length >= 2).map(c => { const last = c.prices[0], prev = c.prices.slice(1, 5), avg = prev.reduce((t, x) => t + x, 0) / prev.length; return { id: c.id, title: c.title, rarity: c.rarity, image: c.image, last, avg: Math.round(avg), pct: Math.round((last - avg) / avg * 100), n: c.prices.length, series: c.prices.slice(0, 12).reverse() }; });
    const alerts = await all(env, 'SELECT a.card_id, a.dir, a.price, c.title FROM price_alerts a JOIN cards c ON c.id = a.card_id WHERE a.user_id = ?', user.id);
    return { up: list.filter(c => c.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 8), down: list.filter(c => c.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 8), alerts };
  });
  route('POST', '/api/alerts', async ({ env, user, body }) => {
    await ensureGameSchema(env);
    const cid = Math.floor(+body.card_id), price = Math.floor(+body.price), dir = body.dir === 'down' ? 'down' : 'up';
    if (!(price >= 1 && price <= 1e6)) bad('Prix invalide');
    if (!(await one(env, 'SELECT 1 x FROM cards WHERE id = ?', cid))) bad('Carte inconnue', 404);
    if ((await one(env, 'SELECT COUNT(*) n FROM price_alerts WHERE user_id = ?', user.id)).n >= 10) bad('10 alertes au maximum');
    await run(env, 'INSERT INTO price_alerts (user_id, card_id, dir, price) VALUES (?,?,?,?) ON CONFLICT (user_id, card_id, dir) DO UPDATE SET price = excluded.price', user.id, cid, dir, price);
    return { ok: true };
  });
  route('POST', '/api/alerts/remove', async ({ env, user, body }) => { await run(env, 'DELETE FROM price_alerts WHERE user_id = ? AND card_id = ? AND dir = ?', user.id, +body.card_id, body.dir === 'down' ? 'down' : 'up'); return { ok: true }; });

  // ======================= BANQUE (épargne) ET DIVIDENDES =======================
  const dayNo = t => Math.floor(t / DAY);
  /** Épargne avec intérêts composés par jour entier écoulé. */
  async function savings(env, uid) {
    const s = await one(env, 'SELECT * FROM savings WHERE user_id = ?', uid);
    if (!s) return { amount: 0, accDay: dayNo(now()), locked: 0, interest: 0 };
    const days = Math.max(0, dayNo(now()) - s.acc_day), amount = days ? Math.floor(s.amount * Math.pow(1 + BANK.rate, days)) : s.amount;
    return { amount, accDay: dayNo(now()), locked: s.locked_until, interest: amount - s.amount, stored: s.amount, since: s.acc_day };
  }
  const saveSavings = (env, uid, amount, locked) => run(env, `INSERT INTO savings (user_id, amount, acc_day, locked_until) VALUES (?,?,?,?) ON CONFLICT (user_id) DO UPDATE SET amount = excluded.amount, acc_day = excluded.acc_day, locked_until = excluded.locked_until`, uid, amount, dayNo(now()), locked);
  async function dividends(env, uid) {
    const [rows, albums, u] = await Promise.all([all(env, 'SELECT rar, sh, COUNT(*) n, COALESCE(SUM(lvl), 0) l FROM inventory WHERE user_id = ? GROUP BY rar, sh', uid), albumCount(env, uid), one(env, 'SELECT div_day FROM users WHERE id = ?', uid)]);
    const by = DIV.rate.map(() => 0); let daily = 0;
    for (const r of rows) { const v = (r.n + r.l * DIV.lvl) * DIV.rate[r.rar] * (r.sh ? DIV.shiny : 1); by[r.rar] += v; daily += v; }
    const bonus = albums * DIV.album; daily += bonus;
    const today = dayKey(), last = u?.div_day, gap = !last ? 1 : Math.max(0, Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(last + 'T12:00:00Z')) / DAY));
    const days = Math.min(DIV.maxDays, gap);
    return { daily: Math.floor(daily), byRarity: by.map(Math.floor), albums, bonus, days, claimable: Math.floor(daily) * days, today };
  }
  route('GET', '/api/bank', async ({ env, user }) => {
    await ensureGameSchema(env);
    const [s, dv] = await Promise.all([savings(env, user.id), dividends(env, user.id)]);
    return { coins: user.coins, savings: { amount: s.amount, interest: s.interest, locked: s.locked, rate: BANK.rate, cap: BANK.cap, lockDays: BANK.lockDays, fee: BANK.fee, perDay: Math.floor(s.amount * BANK.rate) }, dividends: dv, divRates: DIV.rate, divLvl: DIV.lvl };
  });
  route('POST', '/api/bank/deposit', async ({ env, user, body }) => {
    await ensureGameSchema(env);
    const amount = Math.floor(+body.amount); if (!(amount >= 1)) bad('Montant invalide');
    const s = await savings(env, user.id);
    if (s.amount + amount > BANK.cap) bad(`Plafond de ${BANK.cap} pièces d’épargne (il te reste ${Math.max(0, BANK.cap - s.amount)} de marge)`);
    const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', amount, user.id, amount);
    if (!paid.meta.changes) bad('Pas assez de pièces');
    await saveSavings(env, user.id, s.amount + amount, now() + BANK.lockDays * DAY);
    return { ok: true, amount: s.amount + amount };
  });
  route('POST', '/api/bank/withdraw', async ({ env, user, body }) => {
    await ensureGameSchema(env);
    const amount = Math.floor(+body.amount), s = await savings(env, user.id);
    if (!(amount >= 1) || amount > s.amount) bad('Montant invalide');
    const early = now() < s.locked, fee = early ? Math.ceil(amount * BANK.fee) : 0, left = s.amount - amount;
    const took = await run(env, 'UPDATE savings SET amount = ?, acc_day = ?, locked_until = ? WHERE user_id = ? AND amount = ?', left, dayNo(now()), s.locked, user.id, s.stored ?? s.amount);
    if (!took.meta.changes) bad('Réessaie');
    await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', amount - fee, user.id);
    return { ok: true, received: amount - fee, fee, amount: left };
  });
  route('POST', '/api/bank/dividends/claim', async ({ env, ctx, user }) => {
    await ensureGameSchema(env);
    const dv = await dividends(env, user.id);
    if (!dv.claimable) bad('Aucun dividende à récupérer pour le moment');
    const ok_ = await run(env, 'UPDATE users SET coins = coins + ?, div_day = ? WHERE id = ? AND (div_day IS NULL OR div_day < ?)', dv.claimable, dv.today, user.id, dv.today);
    if (!ok_.meta.changes) bad('Déjà récupérés aujourd’hui');
    bq(env, ctx, user.id, { dividend: 1 });
    return { ok: true, got: dv.claimable, days: dv.days };
  });

  // ======================= EXPÉDITIONS =======================
  route('GET', '/api/expeditions', async ({ env, user }) => {
    await ensureGameSchema(env);
    const rows = await all(env, "SELECT id, cards, hours, started, ends, rc, rp FROM expeditions WHERE user_id = ? AND status = 'out' ORDER BY ends", user.id);
    return { slots: EXPED.slots, maxCards: EXPED.maxCards, options: EXPED.hours.map(([h, m]) => ({ hours: h, mult: m })), base: EXPED.base,
      active: rows.map(r => ({ id: r.id, hours: r.hours, ends: r.ends, ready: r.ends <= now(), n: JSON.parse(r.cards).reduce((t, c) => t + c.n, 0), cards: JSON.parse(r.cards), rc: r.ends <= now() ? r.rc : null, rp: r.ends <= now() ? r.rp : null })) };
  });
  route('GET', '/api/expeditions/spare', async ({ env, user }) => ({
    cards: await all(env, 'SELECT c.id, c.title, c.rarity, c.image, i.qty - 1 spare FROM inventory i JOIN cards c ON c.id = i.card_id WHERE i.user_id = ? AND i.qty > 1 AND i.sh = 0 ORDER BY i.rar, i.qty DESC LIMIT 300', user.id),
  }));
  route('POST', '/api/expeditions/start', async ({ env, ctx, user, body }) => {
    await ensureGameSchema(env);
    const opt = EXPED.hours.find(([h]) => h === +body.hours); if (!opt) bad('Durée inconnue');
    const asked = (Array.isArray(body.cards) ? body.cards : []).map(c => ({ id: Math.floor(+c.id), n: Math.floor(+c.n) })).filter(c => c.id && c.n >= 1);
    if (!asked.length) bad('Choisis au moins une carte');
    const total = asked.reduce((t, c) => t + c.n, 0); if (total > EXPED.maxCards) bad(`${EXPED.maxCards} cartes au maximum par expédition`);
    if (new Set(asked.map(c => c.id)).size !== asked.length) bad('Carte en double');
    if ((await one(env, "SELECT COUNT(*) n FROM expeditions WHERE user_id = ? AND status = 'out'", user.id)).n >= EXPED.slots) bad(`${EXPED.slots} expéditions en même temps au maximum`);
    const info = new Map((await all(env, `SELECT i.card_id, i.qty, i.rar, i.sh FROM inventory i WHERE i.user_id = ? AND i.card_id IN (${placeholders(asked.length)})`, user.id, ...asked.map(c => c.id))).map(r => [r.card_id, r]));
    for (const c of asked) { const r = info.get(c.id); if (!r || r.sh || r.qty - 1 < c.n) bad('Seuls les exemplaires en double peuvent partir (un exemplaire reste toujours à la maison)'); }
    const res = await env.DB.batch(asked.map(c => st(env, 'UPDATE inventory SET qty = qty - ? WHERE user_id = ? AND card_id = ? AND qty - ? >= 1', c.n, user.id, c.id, c.n)));
    if (res.some(r => !r.meta.changes)) { for (const [i, c] of asked.entries()) if (res[i].meta.changes) await addCard(env, user.id, c.id, c.n).run(); bad('Une carte a changé entre-temps, réessaie'); }
    const base = asked.reduce((t, c) => t + c.n * EXPED.base[info.get(c.id).rar], 0), rc = Math.floor(base * opt[1] * rand(0.7, 1.4));
    const rp = Math.random() < EXPED.pack[opt[0]] * (1 + total / EXPED.maxCards) ? 1 : 0;
    await run(env, "INSERT INTO expeditions (user_id, cards, hours, started, ends, rc, rp, status) VALUES (?,?,?,?,?,?,?,'out')", user.id, JSON.stringify(asked), opt[0], now(), now() + opt[0] * 3600000, rc, rp);
    statsCache.delete(user.id);
    bq(env, ctx, user.id, { expedition: 1 });
    return { ok: true, ends: now() + opt[0] * 3600000 };
  });
  route('POST', '/api/expeditions/:id/collect', async ({ env, ctx, user, params }) => {
    await ensureGameSchema(env);
    const e = await one(env, "SELECT * FROM expeditions WHERE id = ? AND user_id = ? AND status = 'out'", +params.id, user.id);
    if (!e) bad('Expédition introuvable', 404);
    if (e.ends > now()) bad('Les explorateurs ne sont pas encore rentrés');
    const claim = await run(env, "UPDATE expeditions SET status = 'done' WHERE id = ? AND status = 'out'", e.id);
    if (!claim.meta.changes) bad('Déjà récupérée');
    const cards = JSON.parse(e.cards);
    await env.DB.batch([...cards.map(c => addCard(env, user.id, c.id, c.n)), st(env, 'UPDATE users SET coins = coins + ?, pack_stock = pack_stock + ? WHERE id = ?', e.rc, e.rp, user.id)]);
    statsCache.delete(user.id);
    return { ok: true, coins: e.rc, packs: e.rp, cards: cards.reduce((t, c) => t + c.n, 0) };
  });

  return { settleBourse };
}
