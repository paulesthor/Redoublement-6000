// Événement communiste : « Marché noir », paris sur les vues d'articles russes et soviétiques, misés en wikiroubles.
// Mêmes tables que la Bourse normale (créneaux 100 et plus pour ne jamais se croiser), mêmes statistiques de vues Wikimedia.
import { BOURSE } from './economy.js';
import { pvGet, pvRest, pvMode } from './pvcache.js';

export const BM = { slot0: 100, slots: 6, minStake: 10, maxStake: 200, maxBets: 6, dayStake: 600, payout: 1.8, popular: ['legendary', 'ultra', 'super'] };
const DAY = 86400000;
const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);

export function installCommuBourse(d, h) {
  const { route, bad, one, all, run, st, ensureGameSchema, dayKey, msToMidnight, hash, now } = d;
  let buildTry = 0;
  async function ensureMarket(env, origin) {
    await ensureGameSchema(env);
    const day = dayKey(), have = (await all(env, 'SELECT slot FROM bourse_market WHERE day = ? AND slot >= ?', day, BM.slot0)).map(r => +r.slot);
    if (have.length >= BM.slots || now() - buildTry < 15000) return day;
    if (await pvRest(env)) return day;
    buildTry = now();
    const P = (await h.cc.pool(env, origin)).cards.filter(c => BM.popular.includes(c.r)), from = addDays(day, -7), to = addDays(day, -1), out = []; let calls = 0;
    for (let i = 0; i < BM.slots; i++) {
      const slot = BM.slot0 + i; if (have.includes(slot)) continue;
      let m = null;
      for (let k = 0; k < 6 && !m; k++) {
        const c = P[(hash(`cbourse${day}${slot}`) + k * 104729) % P.length]; if (calls >= 12) break; calls++;
        const v = await pvGet(env, c.t, from, to); if (!v) { calls = 99; break; }
        const series = []; for (let j = -7; j <= -1; j++) series.push(v[addDays(day, j)] ?? 0);
        if (series.filter(Boolean).length < 6) continue;
        m = { slot, id: c.id, title: c.t, series, ref: Math.round(series.reduce((t, x) => t + x, 0) / 7) };
      }
      if (m) out.push(m); if (calls >= 99) break;
      await new Promise(r => setTimeout(r, 250));
    }
    if (out.length) await env.DB.batch(out.map(m => st(env, "INSERT INTO bourse_market (day, slot, id, title, series, ref, status) VALUES (?,?,?,?,?,?,'open') ON CONFLICT DO NOTHING", day, m.slot, m.id, m.title, JSON.stringify(m.series), m.ref)));
    return day;
  }
  // règlement : les vues du jour sont publiées le lendemain ; mise rendue + gain (plafonné par jour) en cas de pari gagné
  /** Reprise des paris restés en attente alors que leur marché est déjà réglé (règlement interrompu) ; chaque pari n'est payé qu'une fois (verrou sur le pari). */
  async function recover(env) {
    const mk = await all(env, "SELECT m.day, m.slot, m.ref, m.actual, m.status FROM bourse_market m WHERE m.slot >= ? AND m.status IN ('done','void') AND EXISTS (SELECT 1 FROM bourse_bets b WHERE b.day = m.day AND b.slot = m.slot AND b.settled = 0) ORDER BY m.day LIMIT 3", BM.slot0);
    for (const m of mk) {
      const void_ = m.status === 'void' || m.actual === null, actual = m.actual === null ? null : +m.actual;
      for (const b of await all(env, 'SELECT user_id, dir, stake FROM bourse_bets WHERE day = ? AND slot = ? AND settled = 0 LIMIT 30', m.day, m.slot)) {
        const won = !void_ && ((b.dir === 'up' && actual > m.ref) || (b.dir === 'down' && actual < m.ref)), tie = void_ || actual === m.ref, gain = won ? Math.floor(b.stake * (BM.payout - 1)) : 0, pay = tie || won ? b.stake : 0;
        const res = await env.DB.batch([
          st(env, 'UPDATE plan_progress SET wr = wr + ? WHERE user_id = ? AND EXISTS (SELECT 1 FROM bourse_bets WHERE user_id = ? AND day = ? AND slot = ? AND settled = 0 FOR UPDATE)', pay, b.user_id, b.user_id, m.day, m.slot),
          st(env, 'UPDATE bourse_bets SET settled = 1, payout = ?, actual = ? WHERE user_id = ? AND day = ? AND slot = ? AND settled = 0', pay + gain, actual ?? 0, b.user_id, m.day, m.slot)]);
        if (res[1].meta.changes && gain) await h.credit(env, +b.user_id, 'bourse', gain);
      }
    }
  }
  async function settle(env) {
    if (pvMode.patient) await recover(env).catch(e => console.error('reprise des paris du marché noir', e));   // tâche planifiée seulement
    const today = dayKey(), open = await all(env, "SELECT day, slot, id, title, ref FROM bourse_market WHERE status = 'open' AND slot >= ? AND day < ? ORDER BY day LIMIT 8", BM.slot0, today);
    for (const m of open) {
      if (await pvRest(env)) break;
      const v = await pvGet(env, m.title, m.day, m.day); let actual = v ? (v[m.day] ?? null) : null, void_ = false;
      if (actual === null) { if (v && m.day <= addDays(today, -4)) void_ = true; else continue; }
      const claim = await run(env, "UPDATE bourse_market SET status = ?, actual = ? WHERE day = ? AND slot = ? AND status = 'open'", void_ ? 'void' : 'done', actual, m.day, m.slot);
      if (!claim.meta.changes) continue;
      for (const b of await all(env, 'SELECT user_id, dir, stake FROM bourse_bets WHERE day = ? AND slot = ? AND settled = 0', m.day, m.slot)) {
        const won = !void_ && ((b.dir === 'up' && actual > m.ref) || (b.dir === 'down' && actual < m.ref)), tie = void_ || actual === m.ref, gain = won ? Math.floor(b.stake * (BM.payout - 1)) : 0;
        const pay = tie || won ? b.stake : 0;   // la mise est rendue sauf pari perdu
        await run(env, 'UPDATE bourse_bets SET settled = 1, payout = ?, actual = ? WHERE user_id = ? AND day = ? AND slot = ?', pay + gain, actual ?? 0, b.user_id, m.day, m.slot);
        if (pay) await run(env, 'UPDATE plan_progress SET wr = wr + ? WHERE user_id = ?', pay, b.user_id);
        if (gain) await h.credit(env, +b.user_id, 'bourse', gain);
      }
    }
  }
  route('GET', '/api/commu/bourse', async ({ env, user, origin }) => {
    await h.access(env, user);
    const day = await ensureMarket(env, origin).catch(e => { console.error('marché noir', e); return dayKey(); }); await settle(env).catch(() => {});
    const [market, bets, past] = await Promise.all([
      all(env, 'SELECT slot, id, title, series, ref FROM bourse_market WHERE day = ? AND slot >= ? ORDER BY slot', day, BM.slot0),
      all(env, 'SELECT slot, dir, stake FROM bourse_bets WHERE user_id = ? AND day = ? AND slot >= ?', user.id, day, BM.slot0),
      all(env, 'SELECT b.day, b.dir, b.stake, b.payout, b.settled, b.actual, m.title, m.ref FROM bourse_bets b JOIN bourse_market m ON m.day = b.day AND m.slot = b.slot WHERE b.user_id = ? AND b.day < ? AND b.slot >= ? ORDER BY b.day DESC, b.slot LIMIT 20', user.id, day, BM.slot0),
    ]);
    const my = new Map(bets.map(b => [b.slot, b]));
    return { day, why: market.length ? null : 'Les statistiques de vues ne répondent pas pour le moment', resetIn: msToMidnight(), payout: BM.payout, min: BM.minStake, max: BM.maxStake, left: BM.maxBets - bets.length, dayStake: BM.dayStake - bets.reduce((t, b) => t + b.stake, 0), unit: '₽', event: true,
      market: market.map(m => ({ slot: m.slot, id: m.id, title: m.title, series: JSON.parse(m.series), ref: m.ref, bet: my.get(m.slot) ?? null })),
      past: past.map(p => ({ ...p, result: !p.settled ? 'wait' : p.payout > p.stake ? 'won' : p.payout === p.stake ? 'tie' : 'lost' })) };
  });
  route('POST', '/api/commu/bourse/bet', async ({ env, user, body, origin }) => {
    await h.access(env, user, { play: true });
    const day = await ensureMarket(env, origin), slot = Math.floor(+body.slot), stake = Math.floor(+body.stake), dir = body.dir === 'down' ? 'down' : body.dir === 'up' ? 'up' : null;
    if (!dir) bad('Choisis hausse ou baisse');
    if (!(slot >= BM.slot0) || !(stake >= BM.minStake && stake <= BM.maxStake)) bad(`Mise entre ${BM.minStake} et ${BM.maxStake} ₽`);
    if (!(await one(env, 'SELECT 1 x FROM bourse_market WHERE day = ? AND slot = ?', day, slot))) bad('Titre inconnu', 404);
    const today = await one(env, 'SELECT COUNT(*) n, COALESCE(SUM(stake), 0) s FROM bourse_bets WHERE user_id = ? AND day = ? AND slot >= ?', user.id, day, BM.slot0);
    if (+today.n >= BM.maxBets) bad(`Maximum ${BM.maxBets} paris par jour`);
    if (+today.s + stake > BM.dayStake) bad(`Maximum ${BM.dayStake} ₽ misés par jour`);
    const paid = await run(env, 'UPDATE plan_progress SET wr = wr - ? WHERE user_id = ? AND wr >= ?', stake, user.id, stake);
    if (!paid.meta.changes) bad('Pas assez de wikiroubles');
    const ins = await run(env, 'INSERT INTO bourse_bets (user_id, day, slot, dir, stake) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING', user.id, day, slot, dir, stake);
    if (!ins.meta.changes) { await run(env, 'UPDATE plan_progress SET wr = wr + ? WHERE user_id = ?', stake, user.id); bad('Tu as déjà parié sur ce titre aujourd\'hui'); }
    return { ok: true };
  });
  return { settle, ensureMarket };
}
