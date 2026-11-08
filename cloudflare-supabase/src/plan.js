// Mode communiste : les 12 paliers du Plan quinquennal et leurs récompenses.
// Les paliers se calculent sur le total de wikiroubles GAGNÉS depuis le début de l'événement (les 500 de départ ne comptent pas). Seuils calés par simulation : un joueur régulier (~30 min/jour) finit les 12 paliers en 4 à 5 jours.
// L'économie en wikiroubles n'existe pas encore : en attendant, l'administrateur dispose d'un bouton de démonstration qui ajoute des wikiroubles gagnés.
// Récompenses : paquets, wikiroubles, titres de profil, cadres, souvenirs (cartes à garder après l'événement) et, au palier 6, le thème rouge conservé.
import { installCommuCards } from './commu-cards.js';
import { installCommuBourse } from './commu-bourse.js';
export const PLAN_MILESTONES = [
  { id: 1, at: 120, coins: 30, name: 'Camarade', text: 'Première distribution : le Parti note ton nom, avec une faute, et le jette dans un tiroir à côté des autres cons.', packs: 1, wr: 0, title: 'plan_1' },
  { id: 2, at: 400, coins: 60, name: 'Premier souvenir', text: 'Une fiche rare sort des archives, un peu poisseuse. Elle est à toi pour toujours, même quand le Plan sera mort et enterré.', packs: 0, wr: 100, perk: 'souvenir_1' },
  { id: 3, at: 720, coins: 60, name: 'Cadre de l\'Étoile rouge', text: 'Un cadre rouge pour ton profil : l\'étoile brille, le budget aussi, mais pas pour toi, connard.', packs: 2, wr: 0, perk: 'frame_star' },
  { id: 4, at: 1100, coins: 90, name: 'Brigadier', text: 'Tu encadres maintenant d\'autres camarades. Ils n\'ont rien demandé, et ils te détestent déjà. C\'est ça, la promotion.', packs: 0, wr: 150, title: 'plan_2' },
  { id: 5, at: 1600, coins: 90, name: 'Colis de ravitaillement', text: 'Trois colis, une saucisse suspecte et une lettre d\'excuses signée « va te faire voir, cordialement ». Et le droit de garder le colis du Parti et son animation dans le jeu normal, pour toujours.', packs: 3, wr: 0, perk: 'anim_urss' },
  { id: 6, at: 2100, coins: 150, name: 'Héros du Plan', text: 'Le Parti te laisse le drapeau : le thème rouge « Camarade » reste dans tes Réglages après l\'événement. Plante-le où tu veux.', packs: 0, wr: 200, title: 'plan_3', perk: 'theme_urss' },
  { id: 7, at: 2550, coins: 120, name: 'Cadre Faucille et Marteau', text: 'Un deuxième cadre, plus lourd. Il ne se porte pas à la légère, ni sans un petit coup de vodka avant.', packs: 0, wr: 200, perk: 'frame_hammer' },
  { id: 8, at: 3050, coins: 150, name: 'Stakhanoviste', text: 'Tu as dépassé la norme de 300 %. Le Parti relève la norme, et ton cul avec.', packs: 3, wr: 0, title: 'plan_4' },
  { id: 9, at: 3500, coins: 180, name: 'Prime du Politburo', text: 'Une enveloppe épaisse, prise sur la prime de quelqu\'un d\'autre. Ne pose pas de questions, il ne pose plus rien non plus.', packs: 0, wr: 300, perk: 'theme_siberie' },
  { id: 10, at: 3900, coins: 225, name: 'Cadre du Politburo', text: 'Cadre doré. Il est en plastique, mais la dorure est réglementaire. Comme ta dignité, il est en option.', packs: 4, wr: 0, perk: 'frame_gold' },
  { id: 11, at: 4300, coins: 300, name: 'Second souvenir', text: 'Une carte légendaire sortie des archives secrètes. On ne pose pas de questions, on se les pose, en silence, aux chiottes.', packs: 0, wr: 0, title: 'plan_5', perk: 'souvenir_2' },
  { id: 12, at: 4800, coins: 450, name: 'Héros de l\'Union soviétique', text: 'Le Plan est accompli. Tu entres dans les manuels, au chapitre des remerciements, entre le tampon et la tache de graisse.', packs: 5, wr: 500, title: 'plan_6', perk: 'theme_or' },
];
export const PLAN_TITLES = [
  { id: 'plan_1', label: 'Camarade', desc: 'Plan quinquennal : atteins le palier 1' },
  { id: 'plan_2', label: 'Brigadier', desc: 'Plan quinquennal : atteins le palier 4' },
  { id: 'plan_3', label: 'Héros du Plan', desc: 'Plan quinquennal : atteins le palier 6' },
  { id: 'plan_4', label: 'Stakhanoviste', desc: 'Plan quinquennal : atteins le palier 8' },
  { id: 'plan_5', label: 'Commissaire du peuple', desc: 'Plan quinquennal : atteins le palier 11' },
  { id: 'plan_6', label: 'Héros de l\'Union soviétique', desc: 'Plan quinquennal : atteins le palier 12' },
  { id: 'commu_staline', label: 'Staline', desc: 'Remporte l\'événement communiste : le plus de wikiroubles gagnés' },
];
export const PLAN_TABLES = [
  'CREATE TABLE IF NOT EXISTS plan_progress (user_id BIGINT PRIMARY KEY, earned BIGINT NOT NULL DEFAULT 0, wr BIGINT NOT NULL DEFAULT 0, claimed TEXT NOT NULL DEFAULT \'[]\', perks TEXT NOT NULL DEFAULT \'[]\')',
  'ALTER TABLE plan_progress ADD COLUMN IF NOT EXISTS joined BIGINT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS packs BIGINT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS earn_ts BIGINT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS camp_plans INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS last_camp BIGINT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS last_tsar BIGINT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS last_potato BIGINT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS tsar_ends TEXT NOT NULL DEFAULT \'[]\', ADD COLUMN IF NOT EXISTS cards TEXT NOT NULL DEFAULT \'{}\', ADD COLUMN IF NOT EXISTS opened INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS souvenirs TEXT NOT NULL DEFAULT \'[]\'',
  'ALTER TABLE plan_progress ENABLE ROW LEVEL SECURITY',
];

// ---- économie de l'événement communiste ----
export const COMMU = { START_WR: 500, START_PACKS: 10, FREE_EVERY_MS: 10 * 60000, FREE_MAX: 30, TAX: 300, PACK_PRICE: 50, CAPS: { tsar: 100, camp: 250, potato: 150, quiz: 120, bourse: 150 }, CAMP_GAP_H: 3, CAMP_PLAN_WR: 90, POTATO_GAP_MS: 5 * 60000, TSAR_GAP_MS: 20000, TSAR_NEW: 40, TSAR_AGAIN: 8, QUIZ_PER_ANSWER: 20, DUEL_WIN: 40,
  ENDINGS: ['samovar', 'train', 'bear', 'x_samovar', 'x_train', 'x_bear', 'late', 'rave', 'capi', 'vodka', 'babouchka', 'cat', 'strike', 'c0', 'c1', 'd0', 'd1', 'a0', 'a1', 'f0', 'f1'] };
const dayOf = () => new Date().toISOString().slice(0, 10);

export function installPlan(d) {
  const { route, bad, one, run, st, ensureGameSchema, grantTitle } = d;
  const list = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  async function rowOf(env, uid) {
    await ensureGameSchema(env);
    let r = await one(env, 'SELECT * FROM plan_progress WHERE user_id = ?', uid);
    if (!r) { await run(env, "INSERT INTO plan_progress (user_id) VALUES (?) ON CONFLICT DO NOTHING", uid); r = await one(env, 'SELECT * FROM plan_progress WHERE user_id = ?', uid); }
    return r;
  }
  const setting = async (env, k) => (await one(env, 'SELECT value FROM settings WHERE key = ?', k))?.value ?? null;
  const putSetting = (env, k, v) => run(env, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?', k, String(v), String(v));
  const rawOn = async env => { await ensureGameSchema(env); return (await setting(env, 'commu_on')) === '1'; };
  const scopeAll = async env => (await setting(env, 'commu_scope')) === 'all';
  /** Événement ouvert POUR CE JOUEUR : en test, seul l'administrateur le voit ; ouvert à tous, tout le monde. */
  const isOn = async (env, user) => (await rawOn(env)) && (!!user?.is_admin || await scopeAll(env));
  const joinedReal = r => +r.joined > 1;                        // joined = 1 : simple aperçu administrateur, sans taxe
  const pot = async env => +((await setting(env, 'commu_pot')) || 0);
  const players = async env => +((await one(env, 'SELECT COUNT(*) n FROM plan_progress WHERE joined > 1'))?.n || 0);
  const view = r => ({
    milestones: PLAN_MILESTONES.map(m => ({ ...m, title: m.title ? PLAN_TITLES.find(t => t.id === m.title)?.label : null })),
    earned: +r.earned, wr: +r.wr, packs: +(r.packs || 0), joined: +(r.joined || 0), claimed: list(r.claimed), perks: list(r.perks),
    totals: { coins: PLAN_MILESTONES.reduce((t, m) => t + (m.coins || 0), 0), packs: PLAN_MILESTONES.reduce((t, m) => t + m.packs, 0), wr: PLAN_MILESTONES.reduce((t, m) => t + m.wr, 0), max: PLAN_MILESTONES[PLAN_MILESTONES.length - 1].at },
  });
  /** Colis gratuits du Parti : un toutes les 10 minutes, jusqu'à 30 en réserve (au-delà, rien ne se recharge). Horodatage rangé dans event_progress (en secondes), sans nouvelle colonne. */
  async function regen(env, uid, r) {
    if ((await setting(env, 'commu_paused')) === '1') return { r, nextIn: 0, frozen: true };   // pause : le compte à rebours est gelé
    const key = 'cm:packts', nowS = Math.floor(Date.now() / 1000), every = COMMU.FREE_EVERY_MS / 1000;
    const row = await one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', key, uid);
    if (!row) { await run(env, 'INSERT INTO event_progress (key, user_id, n) VALUES (?,?,?) ON CONFLICT DO NOTHING', key, uid, nowS); return { r, nextIn: COMMU.FREE_EVERY_MS }; }
    let ts = +row.n, packs = +(r.packs || 0);
    if (packs >= COMMU.FREE_MAX) { if (nowS - ts > 0) await run(env, 'UPDATE event_progress SET n = ? WHERE key = ? AND user_id = ?', nowS, key, uid); return { r, nextIn: 0 }; }
    const elapsed = Math.floor((nowS - ts) / every);
    if (elapsed > 0) {
      const gain = Math.min(COMMU.FREE_MAX - packs, elapsed), newTs = packs + elapsed >= COMMU.FREE_MAX ? nowS : ts + elapsed * every;
      const upd = await run(env, 'UPDATE event_progress SET n = ? WHERE key = ? AND user_id = ? AND n = ?', newTs, key, uid, ts);   // un seul appareil encaisse la recharge
      if (upd.meta.changes) { await run(env, 'UPDATE plan_progress SET packs = packs + ? WHERE user_id = ?', gain, uid); r = await rowOf(env, uid); ts = newTs; packs = +(r.packs || 0); }
      else { r = await rowOf(env, uid); const again = await one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', key, uid); ts = +again.n; packs = +(r.packs || 0); }
    }
    return { r, nextIn: packs >= COMMU.FREE_MAX ? 0 : Math.max(0, (ts + every - nowS) * 1000) };
  }
  // qui peut voir / jouer : l'administrateur toujours ; un joueur seulement s'il est inscrit (voir) et si l'événement est ouvert (jouer)
  async function access(env, user, { play = false } = {}) {
    const r = await rowOf(env, user.id), on = await isOn(env, user);
    if (user.is_admin && !on) {                                   // événement fermé : l'administrateur garde un aperçu gratuit
      if (!+r.joined) await run(env, 'UPDATE plan_progress SET joined = 1, wr = wr + ?, packs = packs + ? WHERE user_id = ? AND joined = 0', COMMU.START_WR, COMMU.START_PACKS, user.id);
      return { r: await rowOf(env, user.id), on, admin: true };
    }
    if (!joinedReal(r)) bad('Tu n\'es pas inscrit à l\'événement communiste', 403);
    if (play && !on) bad('L\'événement communiste est terminé', 403);
    if (play && !user.is_admin && (await setting(env, 'commu_paused')) === '1') bad('L\'événement est en pause, camarade : le Parti fait une sieste. Rien n\'est perdu, reviens bientôt.', 423);
    if (on) { const g = await regen(env, user.id, r); return { r: g.r, on, admin: !!user.is_admin, nextIn: g.nextIn }; }
    return { r, on, admin: !!user.is_admin };
  }
  // crédit de wikiroubles gagnés, plafonné par jeu et par jour (compare-and-swap : deux appareils ne dépassent jamais le plafond)
  async function credit(env, uid, game, amount) {
    const cap = COMMU.CAPS[game]; if (!cap || !(amount > 0)) return 0;
    const key = 'cm:' + dayOf() + ':' + game; await run(env, 'INSERT INTO event_progress (key, user_id, n) VALUES (?,?,0) ON CONFLICT DO NOTHING', key, uid);   // plafond du jour : même table que les autres événements, aucune table en plus
    let allowed = 0;
    for (let essai = 0; essai < 12; essai++) {
      const row = await one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', key, uid), got = +row.n;
      allowed = Math.max(0, Math.min(Math.floor(amount), cap - got)); if (!allowed) return 0;
      const upd = await run(env, 'UPDATE event_progress SET n = ? WHERE key = ? AND user_id = ? AND n = ?', got + allowed, key, uid, got);
      if (upd.meta.changes) break; if (essai === 11) return 0;
    }
    await run(env, 'UPDATE plan_progress SET earned = earned + ?, wr = wr + ?, earn_ts = ? WHERE user_id = ?', allowed, allowed, Date.now(), uid);
    return allowed;
  }
  const commuView = async (env, user) => {
    let r = await rowOf(env, user.id); const on = await isOn(env, user), day = dayOf(); let nextIn = 0;
    if (on && +r.joined >= 1) { const g = await regen(env, user.id, r); r = g.r; nextIn = g.nextIn; }
    const today = Object.fromEntries((await d.all(env, "SELECT key, n FROM event_progress WHERE user_id = ? AND key LIKE ?", user.id, 'cm:' + day + ':%')).map(x => [x.key.split(':')[2], +x.n]));
    const done = (await setting(env, 'commu_done')) === '1', winnerRaw = done ? await setting(env, 'commu_winner') : null, perksList = list(r.perks);
    return { on, done, winner: winnerRaw ? JSON.parse(winnerRaw) : null, entitled: perksList.filter(p => p.startsWith('souvenir_')).length, chosen: list(r.souvenirs), souvenirOpen: done && (await setting(env, 'commu_souv_closed')) !== '1', level: PLAN_MILESTONES.filter(m => +r.earned >= m.at).length, admin: !!user.is_admin, joined: joinedReal(r) || (!!user.is_admin && !on && +r.joined > 0), wr: +r.wr, earned: +r.earned, packs: +(r.packs || 0), perks: list(r.perks), pot: await pot(env), players: await players(env),
      paused: on && (await setting(env, 'commu_paused')) === '1', scope: (await scopeAll(env)) ? 'all' : 'admin', since: +(await setting(env, 'commu_start')) || 0, tax: COMMU.TAX, startWr: COMMU.START_WR, startPacks: COMMU.START_PACKS, quizPer: COMMU.QUIZ_PER_ANSWER, nextPackIn: nextIn, freeEveryMin: COMMU.FREE_EVERY_MS / 60000, freeMax: COMMU.FREE_MAX, packPrice: COMMU.PACK_PRICE, caps: COMMU.CAPS, today };
  };

  route('GET', '/api/commu', async ({ env, user }) => commuView(env, user));
  // inscription : taxe d'État versée à la cagnotte, 500 wikiroubles de départ
  route('POST', '/api/commu/join', async ({ env, user }) => {
    const on = await isOn(env, user); if (!on) bad('L\'événement communiste n\'est pas ouvert', 403);
    if (!user.is_admin && (await setting(env, 'commu_paused')) === '1') bad('L\'événement est en pause : les inscriptions reprendront avec lui', 423);
    const r = await rowOf(env, user.id); if (joinedReal(r)) bad('Tu es déjà inscrit, camarade', 409);
    // un administrateur qui n'avait qu'un aperçu repart de zéro : même parcours qu'un joueur (taxe, 500 ₽, paliers vierges)
    const claim = await run(env, "UPDATE plan_progress SET joined = ?, wr = ?, earned = 0, claimed = '[]', perks = '[]', packs = ?, cards = '{}', opened = 0, camp_plans = 0, last_camp = 0, last_tsar = 0, last_potato = 0, tsar_ends = '[]' WHERE user_id = ? AND joined <= 1", Date.now(), COMMU.START_WR, COMMU.START_PACKS, user.id);
    if (!claim.meta.changes) bad('Tu es déjà inscrit, camarade', 409);
    {
      const paid = await run(env, 'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', COMMU.TAX, user.id, COMMU.TAX);
      if (!paid.meta.changes) { await run(env, 'UPDATE plan_progress SET joined = ?, wr = 0 WHERE user_id = ?', +r.joined, user.id); bad(`La taxe de l'État est de ${COMMU.TAX} wikibidou, tu n'as pas assez`, 400); }
      await run(env, "INSERT INTO settings (key, value) VALUES ('commu_pot', ?) ON CONFLICT (key) DO UPDATE SET value = CAST(CAST(settings.value AS BIGINT) + ? AS TEXT)", String(COMMU.TAX), COMMU.TAX);
    }
    return commuView(env, user);
  });
  // gains des jeux : le serveur calcule la somme, jamais le téléphone
  route('POST', '/api/commu/earn', async ({ env, user, body }) => {
    const { r } = await access(env, user, { play: true }), game = String(body.game || ''), now = Date.now(); let gain = 0, extra = {};
    if (game === 'tsar') {
      const e = String(body.ending || ''); if (!COMMU.ENDINGS.includes(e)) bad('Fin inconnue', 400);
      if (now - +r.last_tsar >= COMMU.TSAR_GAP_MS) {
        const seen = list(r.tsar_ends), first = !seen.includes(e);
        await run(env, 'UPDATE plan_progress SET last_tsar = ?, tsar_ends = ? WHERE user_id = ?', now, JSON.stringify(first ? [...seen, e] : seen), user.id);
        gain = await credit(env, user.id, 'tsar', first ? COMMU.TSAR_NEW : COMMU.TSAR_AGAIN); extra = { first };
      }
    } else if (game === 'camp') {
      const plans = Math.floor(+body.plans); if (!Number.isFinite(plans) || plans < 0 || plans > 50) bad('Plans invalides', 400);
      const since = Math.max(+r.last_camp, +r.joined), possible = Math.floor((now - since) / (COMMU.CAMP_GAP_H * 3600000)), fresh = Math.max(0, Math.min(plans - +r.camp_plans, possible));
      if (fresh > 0) { const upd = await run(env, 'UPDATE plan_progress SET camp_plans = camp_plans + ?, last_camp = ? WHERE user_id = ? AND camp_plans = ?', fresh, now, user.id, +r.camp_plans); if (upd.meta.changes) gain = await credit(env, user.id, 'camp', fresh * COMMU.CAMP_PLAN_WR); }
    } else if (game === 'potato') {
      const score = Math.floor(+body.score); if (!Number.isFinite(score) || score < 0 || score > 6000) bad('Score invalide', 400);
      if (now - +r.last_potato >= COMMU.POTATO_GAP_MS) { await run(env, 'UPDATE plan_progress SET last_potato = ? WHERE user_id = ?', now, user.id); gain = await credit(env, user.id, 'potato', Math.min(60, Math.floor(score / 40))); }
    } else bad('Jeu inconnu', 400);
    const v = await commuView(env, user); return { ok: true, gained: gain, ...extra, wr: v.wr, earned: v.earned, today: v.today };
  });
  // boutique : des colis à 50 ₽ (stock de colis de l'événement)
  route('POST', '/api/commu/buy', async ({ env, user, body }) => {
    await access(env, user, { play: true }); const n = Math.floor(+body.n); if (!Number.isFinite(n) || n < 1 || n > 20) bad('Quantité invalide (1 à 20)', 400);
    const upd = await run(env, 'UPDATE plan_progress SET wr = wr - ?, packs = packs + ? WHERE user_id = ? AND wr >= ?', n * COMMU.PACK_PRICE, n, user.id, n * COMMU.PACK_PRICE);
    if (!upd.meta.changes) bad('Pas assez de wikiroubles', 400);
    return commuView(env, user);
  });
  // classement des wikiroubles gagnés (la cagnotte revient au premier)
  route('GET', '/api/commu/standings', async ({ env, user, query }) => {
    await access(env, user);
    const all_ = await d.all(env, 'SELECT p.user_id id, u.name, p.earned, p.earn_ts FROM plan_progress p JOIN users u ON u.id = p.user_id WHERE p.joined > 1 ORDER BY p.earned DESC, p.earn_ts ASC, p.user_id ASC');
    const lvl = e => PLAN_MILESTONES.filter(m => +e >= m.at).length, max = PLAN_MILESTONES.length, levels = Array(max + 1).fill(0);
    for (const x of all_) levels[lvl(x.earned)]++;
    const full = query?.get?.('all') === '1', rows = all_.slice(0, full ? 50 : 20), me = all_.findIndex(x => +x.id === user.id);
    return { pot: await pot(env), players: all_.length, levels, avgLevel: all_.length ? all_.reduce((t, x) => t + lvl(x.earned), 0) / all_.length : 0, atLeast6: all_.filter(x => lvl(x.earned) >= 6).length, done: levels[max],
      top: rows.map((x, i) => ({ rank: i + 1, id: +x.id, name: x.name, earned: +x.earned, level: lvl(x.earned), me: +x.id === user.id })), myRank: me >= 0 ? me + 1 : null };
  });
  // administrateur : ouvre / ferme l'événement (le bouton de lancement viendra plus tard)
  route('POST', '/api/commu/set', async ({ env, user, body }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403);
    await ensureGameSchema(env); await putSetting(env, 'commu_on', body.on ? '1' : '0'); await putSetting(env, 'commu_scope', body.scope === 'all' ? 'all' : 'admin'); if (body.on) { await putSetting(env, 'commu_done', '0'); if ((await setting(env, 'commu_on_prev')) !== '1') await putSetting(env, 'commu_start', String(Date.now())); }
    await putSetting(env, 'commu_on_prev', body.on ? '1' : '0'); if (!body.on) await putSetting(env, 'commu_paused', '0');
    return commuView(env, user);
  });
  // pause : plus aucun gain, achat, ouverture, réclamation ni inscription ; rien n'est coupé ni remis à zéro, l'état reprend tel quel
  route('POST', '/api/commu/pause', async ({ env, user, body }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403);
    await ensureGameSchema(env); if (!(await rawOn(env))) bad('L\'événement n\'est pas ouvert', 409);
    await putSetting(env, 'commu_paused', body.paused ? '1' : '0');
    if (!body.paused) await run(env, "UPDATE event_progress SET n = ? WHERE key = 'cm:packts'", Math.floor(Date.now() / 1000));   // reprise : le compte à rebours repart de maintenant
    return commuView(env, user);
  });
  // fin de l'événement : la cagnotte au meilleur, titre « Staline » et contour doré ; les avantages gagnés restent
  route('POST', '/api/commu/finish', async ({ env, user }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403);
    await ensureGameSchema(env); if ((await setting(env, 'commu_done')) === '1') bad('L\'événement est déjà terminé', 409);
    const win = await one(env, 'SELECT p.user_id id, u.name, p.earned FROM plan_progress p JOIN users u ON u.id = p.user_id WHERE p.joined > 1 AND p.earned > 0 ORDER BY p.earned DESC, p.earn_ts ASC, p.user_id ASC LIMIT 1');
    const prize = await pot(env); let winner = null;
    if (win) {
      const rw = await rowOf(env, +win.id); await run(env, 'UPDATE plan_progress SET perks = ? WHERE user_id = ?', JSON.stringify([...new Set([...list(rw.perks), 'gold_outline'])]), +win.id);
      if (prize > 0) await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', prize, +win.id);
      await grantTitle(env, +win.id, 'commu_staline'); winner = { id: +win.id, name: win.name, earned: +win.earned, prize };
    }
    const souv = 0;
    if (winner) await putSetting(env, 'commu_winner', JSON.stringify(winner)); else await putSetting(env, 'commu_winner', '');
    await putSetting(env, 'commu_souv_closed', '0');
    await putSetting(env, 'commu_done', '1'); await putSetting(env, 'commu_on', '0'); await putSetting(env, 'commu_pot', 0);
    return { ok: true, winner, souvenirs: souv, players: await players(env) };
  });

  route('GET', '/api/plan', async ({ env, user }) => { const { r } = await access(env, user); return view(r); });
  // démonstration (administrateur) : ajoute des wikiroubles « gagnés »
  route('POST', '/api/plan/earn', async ({ env, user, body }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403);
    const n = Math.floor(+body.amount); if (!Number.isFinite(n) || n < 1 || n > 2000) bad('Montant invalide (1 à 2000)', 400);
    await access(env, user); await run(env, 'UPDATE plan_progress SET earned = earned + ?, earn_ts = ? WHERE user_id = ?', n, Date.now(), user.id);
    return view(await rowOf(env, user.id));
  });
  route('POST', '/api/plan/reset', async ({ env, user }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403); await rowOf(env, user.id);
    await run(env, "UPDATE plan_progress SET earned = 0, wr = 0, claimed = '[]', perks = '[]', joined = 0, packs = 0, camp_plans = 0, last_camp = 0, last_tsar = 0, last_potato = 0, tsar_ends = '[]', cards = '{}', opened = 0, souvenirs = '[]' WHERE user_id = ?", user.id);
    await run(env, "DELETE FROM event_progress WHERE user_id = ? AND key LIKE 'cm:%'", user.id);   // plafonds du jour remis à zéro aussi
    return view(await rowOf(env, user.id));
  });
  route('POST', '/api/plan/claim', async ({ env, user, body }) => {
    await access(env, user, { play: true });
    const m = PLAN_MILESTONES.find(x => x.id === Math.floor(+body.id)); if (!m) bad('Palier inconnu', 404);
    // compare-and-swap sur la liste réclamée : si une autre réclamation (autre palier, autre appareil) passe en même temps, on relit et on réessaie
    let won = false, perks;
    for (let essai = 0; essai < 12 && !won; essai++) {
      const r = await rowOf(env, user.id), claimed = list(r.claimed);
      if (claimed.includes(m.id)) bad('Récompense déjà récupérée', 409);
      if (+r.earned < m.at) bad('Pas assez de wikiroubles gagnés pour ce palier', 400);
      const next = JSON.stringify([...claimed, m.id].sort((a, b) => a - b));
      perks = m.perk ? JSON.stringify([...new Set([...list(r.perks), m.perk])]) : r.perks;
      const upd = await run(env, 'UPDATE plan_progress SET claimed = ?, wr = wr + ?, perks = ? WHERE user_id = ? AND claimed = ?', next, m.wr, perks, user.id, r.claimed);
      won = !!upd.meta.changes;
    }
    if (!won) bad('Trop de réclamations en même temps, réessaie', 409);
    if (m.coins) await run(env, 'UPDATE users SET coins = coins + ? WHERE id = ?', m.coins, user.id);   // wikibidou du mode classique
    if (m.packs) await run(env, 'UPDATE plan_progress SET packs = packs + ? WHERE user_id = ?', m.packs, user.id);   // les colis des paliers rejoignent le stock de colis de l\'événement
    const titleNew = m.title ? await grantTitle(env, user.id, m.title) : false;
    return { ok: true, id: m.id, packs: m.packs, wr: m.wr, coins: m.coins || 0, title: m.title ? PLAN_TITLES.find(t => t.id === m.title).label : null, titleNew, perk: m.perk ?? null };
  });
  const cc = installCommuCards(d, { access, rowOf, setting, putSetting, list });
  installCommuBourse(d, { access, credit, cc });
  return { PLAN_MILESTONES, credit, isOn, rowOf, access, cc, joinedReal };
}
