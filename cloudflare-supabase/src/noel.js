// Événement de Noël : calendrier de l'avent (24 portes), module indépendant de l'événement communiste.
// Une porte s'ouvre le jour même (heure de Paris) et reste ouvrable le lendemain seulement : si on se connecte le 3, on peut récupérer la porte 2 mais plus la porte 1.
// Chaque porte ne s'ouvre qu'une fois par joueur : la récompense est créditée dans la même transaction que l'enregistrement de l'ouverture (jamais l'un sans l'autre).
import { dayKey } from './game.js';
import './snowphys.js';
import './elfsim.js';
import { HEADS } from './noel-heads.js';
import { installNoelCards } from './noel-cards.js';

export const NOEL = { START: Date.parse('2026-12-01T00:00:00+01:00'), END: Date.parse('2026-12-25T18:00:00+01:00'), DOORS: 24 };
// Récompenses PROVISOIRES (à équilibrer avec le reste de l'événement) : wikibidou du jeu normal et paquets du jeu normal.
const COINS = [20, 20, 25, 25, 30, 45, 30, 30, 35, 35, 40, 60, 40, 45, 45, 50, 50, 80, 55, 55, 60, 65, 70, 150];
const PACKS = [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 2, 0, 0, 1, 0, 1, 2, 0, 1, 0, 0, 1, 5];
const TEXTS = [
  'Le Père Noël te souhaite la bienvenue dans l\'entreprise. Il te rappelle que le bonheur est facultatif, la productivité non.',
  'Une prime d\'ancienneté d\'une journée. Le service des ressources humaines a failli se tromper et t\'en donner deux.',
  'Le syndicat des lutins t\'offre un tract. Tu le lis, puis tu le jettes avant l\'arrivée du chef.',
  'Un colis oublié par un renne en burn-out. Trouvé, donc gardé.',
  'Le Père Noël a vérifié ta conduite. Il l\'a trouvée acceptable, ce qui relève de l\'exploit.',
  'Saint Nicolas passe en inspection. Il laisse des mandarines et un blâme.',
  'Un lutin t\'a glissé une enveloppe. Ne pose pas de questions, il ne répondra pas.',
  'La cheminée est trop étroite. Le Père Noël a perdu du poids, ou c\'est l\'inverse.',
  'Le syndicat obtient une pause. Elle dure quatre secondes. C\'est une victoire historique.',
  'Un renne a mangé les dossiers. Le bilan de l\'entreprise s\'en trouve nettement amélioré.',
  'Le Père Noël a relu sa liste deux fois. Tu es dessus, dans la colonne du milieu.',
  'La moitié du calendrier. Le Père Noël te remet une médaille en chocolat, déjà croquée.',
  'Superstitieux, le Père Noël a sauté ce numéro. Tu récupères le cadeau de personne.',
  'Un cadeau mal emballé. Le lutin responsable réfléchit à ses erreurs, dehors, par moins vingt.',
  'La neige tombe, le chiffre d\'affaires aussi. Le Père Noël accuse la météo.',
  'Une prime de fin d\'année, versée par anticipation, avec un sourire qui ne présage rien de bon.',
  'L\'inspection du travail est venue. Elle est repartie avec un cadeau et un souvenir flou.',
  'Les rennes ont voté la grève. Tu as voté contre, tu reçois quand même un lot de consolation.',
  'Le Père Noël te confie un secret : la barbe n\'est pas naturelle. Ce secret vaut des cadeaux.',
  'Les commandes explosent. Le Père Noël propose des heures supplémentaires, payables à crédit.',
  'Solstice d\'hiver : la nuit la plus longue, donc le plus d\'heures de travail. Voici ta part.',
  'On t\'a vu sourire à l\'atelier. C\'est interdit, mais on te le pardonne ce soir.',
  'Veille de la veille. Le Père Noël répète son discours. Il est très court : « Livrez. »',
  'La grande porte. Le Père Noël t\'adresse un remerciement sincère. Il a demandé un tampon pour le prouver.',
];
/** Les 24 cadeaux sont les mêmes, mais leur jour est tiré au hasard (graine fixe : identique pour tous les joueurs). Les textes restent liés au jour. Le gros lot tombe toujours entre le 18 et le 24. */
function giftOrder() {
  let a = 20261201 >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const perm = COINS.map((_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const jack = COINS.length - 1, at = perm.indexOf(jack);
  if (at < 17) { const to = 17 + Math.floor(rnd() * 7); [perm[at], perm[to]] = [perm[to], perm[at]]; }
  return perm;
}
const ORDER = giftOrder();
export const DOORS = TEXTS.map((text, i) => ({ n: i + 1, coins: COINS[ORDER[i]], packs: PACKS[ORDER[i]], text }));

/** Numéro de la dernière porte ouvrable à cet instant (0 avant le 1er décembre, 24 à partir du 24). */
export function doorToday(t = Date.now()) {
  const d = dayKey(t);
  if (d < '2026-12-01') return 0;
  if (d >= '2026-12-24') return 24;
  return +d.slice(8, 10);
}

export function installNoel(d) {
  const { route, bad, one, run, st, ensureGameSchema, now } = d;   // d.all, d.addCard et d.stats servent aux cartes de Noël
  const setting = async (env, k) => (await one(env, 'SELECT value FROM settings WHERE key = ?', k))?.value ?? null;
  const putSetting = (env, k, v) => run(env, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?', k, String(v), String(v));
  /** Événement ouvert POUR CE JOUEUR : en test seul l'administrateur le voit ; ouvert à tous, tout le monde. */
  const isOn = async (env, user) => (await setting(env, 'noel_on')) === '1' && (!!user.is_admin || (await setting(env, 'noel_scope')) === 'all');
  /** Jour simulé : réservé à l'administrateur (aperçu avant le 1er décembre) ; les joueurs n'ont que le vrai jour. */
  const dayFor = (user, q) => { const sim = Math.floor(+q); return user.is_admin && sim >= 0 && sim <= 24 && q !== null && q !== undefined && q !== '' ? sim : doorToday(); };

  /** Une porte s'ouvre le jour même ou le lendemain (rattrapage d'un jour), pas avant ni plus tard. */
  const canOpen = (n, day) => n === day || n === day - 1;
  async function state(env, user, day) {
    await ensureGameSchema(env);
    const rows = await d.all(env, "SELECT key FROM event_claims WHERE user_id = ? AND key LIKE 'nl:door:%'", user.id);
    const done = new Set(rows.map(r => +r.key.split(':')[2]));
    return {
      on: await isOn(env, user), scope: (await setting(env, 'noel_scope')) === 'all' ? 'all' : 'admin', start: NOEL.START, end: NOEL.END, today: day, simulated: user.is_admin && day !== doorToday(),
      opened: done.size, total: NOEL.DOORS,
      doors: DOORS.map(o => ({ n: o.n, opened: done.has(o.n), openable: canOpen(o.n, day) && !done.has(o.n), missed: !done.has(o.n) && o.n < day - 1, ...(done.has(o.n) ? { coins: o.coins, packs: o.packs, text: o.text } : {}) })),
    };
  }
  route('GET', '/api/noel', async ({ env, user, query }) => state(env, user, dayFor(user, query.get('day'))));
  route('POST', '/api/noel/door', async ({ env, user, body }) => {
    await ensureGameSchema(env);
    if (!(await isOn(env, user))) bad('Le calendrier de l\'avent n\'est pas ouvert', 403);
    if (Date.now() > NOEL.END && !user.is_admin) bad('Le calendrier est fermé : l\'événement est terminé', 403);
    const n = Math.floor(+body.n), day = dayFor(user, body.day === undefined ? null : body.day);
    if (!(n >= 1 && n <= NOEL.DOORS)) bad('Porte inconnue', 404);
    if (n > day) bad('Cette porte n\'est pas encore ouvrable : patience, le Père Noël n\'aime pas qu\'on le presse', 403);
    if (n < day - 1) bad('Trop tard : une porte se récupère le jour même ou le lendemain, pas après. Le Père Noël ne fait pas de rattrapage.', 403);
    const o = DOORS[n - 1], key = 'nl:door:' + n, token = now() * 1000 + Math.floor(Math.random() * 1000);
    // une seule transaction : l'ouverture est enregistrée ET la récompense créditée ; la récompense ne part que pour la requête qui a réellement enregistré l'ouverture (jeton unique)
    const res = await env.DB.batch([
      st(env, 'INSERT INTO event_claims (key, user_id, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', key, user.id, token),
      st(env, 'UPDATE users SET coins = coins + ?, pack_stock = pack_stock + ? WHERE id = ? AND EXISTS (SELECT 1 FROM event_claims WHERE key = ? AND user_id = ? AND ts = ?)', o.coins, o.packs, user.id, key, user.id, token),
    ]);
    if (!res[1].meta.changes) bad('Porte déjà ouverte', 409);
    return { ok: true, n, reward: { coins: o.coins, packs: o.packs }, text: o.text };
  });
  // ───── Jeux de l'événement : un niveau par porte, 3 essais par jour et par niveau, le serveur rejoue chaque partie ─────
  // Chaque jeu fournit : level(n), play(level, entrée) → { score, … }, flocons(score). L'entrée envoyée par le téléphone n'est jamais un score : seulement les gestes du joueur.
  const TRIES = 3, P = globalThis.SnowPhys, EL = globalThis.ElfSim;
  const prog = async (env, key, uid) => +((await one(env, 'SELECT n FROM event_progress WHERE key = ? AND user_id = ?', key, uid))?.n || 0);
  /** Niveau jouable : le jour même ou la veille (comme les portes). */
  async function gameGuard(env, user, body) {
    await ensureGameSchema(env);
    if (!(await isOn(env, user))) bad('L\'événement de Noël n\'est pas ouvert', 403);
    if (Date.now() > NOEL.END && !user.is_admin) bad('Événement terminé', 403);
    const day = dayFor(user, body.day === undefined ? null : body.day), n = Math.floor(+body.n || day);
    if (!(n >= 1 && n <= NOEL.DOORS) || !canOpen(n, day)) bad('Ce niveau n\'est pas jouable aujourd\'hui : il se joue le jour même ou le lendemain', 403);
    return n;
  }
  function installGame(id, g) {
    const base = '/api/noel/' + id;
    const view = async (env, user, n) => ({
      n, level: g.level(n), tries: TRIES, used: await prog(env, 'nl:' + id + ':att:' + n, user.id), best: await prog(env, 'nl:' + id + ':best:' + n, user.id),
      flocons: await prog(env, 'nl:flocons', user.id), max: g.flocons(1e9), ...(g.extra ? await g.extra(env, user) : {}),
    });
    route('GET', base, async ({ env, user, query }) => { const n = await gameGuard(env, user, { n: query.get('n') || undefined, day: query.get('day') === null ? undefined : query.get('day') }); return view(env, user, n); });
    route('POST', base + '/start', async ({ env, user, body }) => {
      const n = await gameGuard(env, user, body), key = 'nl:' + id + ':att:' + n;
      const r = await run(env, 'INSERT INTO event_progress (key, user_id, n) VALUES (?,?,1) ON CONFLICT (key, user_id) DO UPDATE SET n = event_progress.n + 1 WHERE event_progress.n < ?', key, user.id, TRIES);
      if (!r.meta.changes) bad('Plus d\'essai pour ce niveau. Le patron a posé un jour de repos, vous aussi.', 409);
      return { ...(await view(env, user, n)), attempt: await prog(env, key, user.id) };
    });
    route('POST', base + '/submit', async ({ env, user, body }) => {
      const n = await gameGuard(env, user, body), a = Math.floor(+body.a);
      const used = await prog(env, 'nl:' + id + ':att:' + n, user.id);
      if (!(a >= 1 && a <= used)) bad('Essai inconnu', 400);
      const input = g.parse(body), res = g.play(g.level(n), input), newFl = g.flocons(res.score);
      const before = await prog(env, 'nl:flocons', user.id);
      const claim = 'nl:' + id + ':done:' + n + ':' + a, bestKey = 'nl:' + id + ':best:' + n, flKey = 'nl:' + id + ':fl:' + n, token = now() * 1000 + Math.floor(Math.random() * 1000);
      const has = 'EXISTS (SELECT 1 FROM event_claims WHERE key = ? AND user_id = ? AND ts = ?)';
      // une seule transaction : l'essai est clos (une fois), le meilleur score retenu, et seule la progression en flocons est créditée
      const out = await env.DB.batch([
        st(env, 'INSERT INTO event_claims (key, user_id, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', claim, user.id, token),
        st(env, 'INSERT INTO event_progress (key, user_id, n) VALUES (?,?,0) ON CONFLICT DO NOTHING', 'nl:flocons', user.id),
        st(env, 'INSERT INTO event_progress (key, user_id, n) VALUES (?,?,0) ON CONFLICT DO NOTHING', flKey, user.id),
        st(env, 'INSERT INTO event_progress (key, user_id, n) VALUES (?,?,0) ON CONFLICT DO NOTHING', bestKey, user.id),
        st(env, `UPDATE event_progress t SET n = t.n + ? - f.n FROM event_progress f WHERE t.key = 'nl:flocons' AND t.user_id = ? AND f.key = ? AND f.user_id = ? AND f.n < ? AND ${has}`, newFl, user.id, flKey, user.id, newFl, claim, user.id, token),
        st(env, `UPDATE event_progress SET n = ? WHERE key = ? AND user_id = ? AND n < ? AND ${has}`, newFl, flKey, user.id, newFl, claim, user.id, token),
        st(env, `UPDATE event_progress SET n = ? WHERE key = ? AND user_id = ? AND n < ? AND ${has}`, res.score, bestKey, user.id, res.score, claim, user.id, token),
      ]);
      if (!out[0].meta.changes) bad('Cet essai est déjà terminé', 409);
      const v = await view(env, user, n);
      return { ok: true, ...res, ...v, gained: v.flocons - before };
    });
  }
  installGame('snow', { level: P.level, flocons: P.flocons, parse: body => { const t = Array.isArray(body.throws) ? body.throws.slice(0, P.BALLS).map(x => [Math.round(+x?.[0]) || 0, Math.round(+x?.[1]) || 0]) : []; if (!t.length) bad('Aucun lancer', 400); return t; }, play: P.play });
  // Atelier des lutins : deux lutins dont la tête peut être celle de joueurs VOLONTAIRES (liste réglée par l'administrateur, jamais par défaut)
  installGame('atel', {
    level: EL.level, flocons: EL.flocons, play: EL.play, parse: body => { if (!Array.isArray(body.inputs)) bad('Aucune action', 400); return body.inputs; },
    extra: async (env) => {
      if ((await setting(env, 'noel_heads_ok')) === '0') return { heads: [] };   // affichées par défaut (accord des deux joueurs confirmé) ; l'administrateur peut les masquer
      const heads = []; for (const k of [0, 1]) { const v = (await setting(env, 'noel_head_v' + k)) || (HEADS[k] ? '1' : null); if (v) heads.push({ slot: k, v: +v }); }
      return { heads };
    },
  });
  // Têtes des deux lutins : images envoyées par l'administrateur (jamais dans le code), stockées en base, affichées seulement après confirmation de l'accord des joueurs.
  route('GET', '/api/noel/atel/head/:slot', async ({ env, params }) => {
    const k = +params.slot, data = (k === 0 || k === 1) && (await setting(env, 'noel_heads_ok')) !== '0' ? ((await setting(env, 'noel_head_' + k)) || HEADS[k] || null) : null;
    if (!data) return new Response('', { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(Uint8Array.from(atob(data), c => c.charCodeAt(0)), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
  }, false);
  route('POST', '/api/noel/atel/head', async ({ env, user, body }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403);
    await ensureGameSchema(env); const k = Math.floor(+body.slot);
    if (k !== 0 && k !== 1) bad('Poste inconnu', 400);
    if (body.data === null) { await run(env, 'DELETE FROM settings WHERE key IN (?, ?)', 'noel_head_' + k, 'noel_head_v' + k); return { ok: true }; }
    const data = String(body.data || '');
    if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 260000) bad('Image invalide ou trop lourde', 400);
    let head; try { head = atob(data.slice(0, 8)); } catch { bad('Image invalide', 400); }
    if (head.charCodeAt(0) !== 0xFF || head.charCodeAt(1) !== 0xD8) bad('Seul le format JPEG est accepté', 400);
    await putSetting(env, 'noel_head_' + k, data); await putSetting(env, 'noel_head_v' + k, String(now())); return { ok: true, v: now() };
  });
  route('POST', '/api/noel/atel/heads-ok', async ({ env, user, body }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403);
    await ensureGameSchema(env); await putSetting(env, 'noel_heads_ok', body.ok ? '1' : '0'); return { ok: !!body.ok };
  });
  route('GET', '/api/noel/atel/heads-admin', async ({ env, user }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403);
    await ensureGameSchema(env); return { ok: (await setting(env, 'noel_heads_ok')) !== '0', custom: [!!(await setting(env, 'noel_head_0')), !!(await setting(env, 'noel_head_1'))], builtin: HEADS.map(h => !!h) };
  });
  route('POST', '/api/noel/set', async ({ env, user, body }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403);
    await ensureGameSchema(env);
    await putSetting(env, 'noel_on', body.on ? '1' : '0'); await putSetting(env, 'noel_scope', body.scope === 'all' ? 'all' : 'admin');
    return state(env, user, doorToday());
  });
  const nc = installNoelCards(d, { isOn, setting, putSetting, prog });
  return { isOn, album: nc.album, ensureCards: nc.ensureCards };
}
