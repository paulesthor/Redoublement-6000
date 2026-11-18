// Cartes de Noël : album de Noël, carte du 25 décembre, cartes des joueurs (créées à partir de leur photo, sur demande) et « hotte » pour les tirer avec les flocons.
// Tout dépend de l'ouverture de l'événement pour le joueur (isOn) : tant que l'événement est réservé à l'administrateur, personne d'autre n'en voit rien.
// Les photos envoyées par les joueurs ne sont JAMAIS affichées : seul l'administrateur les voit, pour les confier à l'IA. Seule l'image cartoon finale devient publique dans le jeu.

/** Cartes de l'album de Noël (identifiants hors de la plage du catalogue : jamais tirées en paquet). */
export const NCARD = { renne: 90000001, sapin: 90000002, jesus: 90000003, marie: 90000004, noah: 90000005, nativite: 90000006 };
export const PCARD_BASE = 91000000;                       // carte d'un joueur = PCARD_BASE + identifiant du joueur
export const HOTTE_COST = 60;                             // flocons par tirage
export const GIFT_DAY = '2026-12-25';
const RENDER_ART = id => `/api/noel/card/${id}`;
const ART = {
  [NCARD.renne]: { t: 'Renne du Père Noël', x: 'Le renne du Père Noël est un cervidé de la famille des rennes, employé à temps plein à la livraison de cadeaux. Il ne perçoit aucune rémunération, au motif que le nez rouge de l\'un d\'eux « fait déjà beaucoup ». Une grève des rennes est régulièrement annoncée chaque 24 décembre, puis réprimée avant la tombée de la nuit.' },
  [NCARD.sapin]: { t: 'Sapin de Noël', x: 'Le sapin de Noël est un conifère abattu à la fin du mois de novembre pour être exposé dans un salon, décoré de boules et de guirlandes, puis jeté sur le trottoir début janvier. Son espérance de vie en intérieur est de trois semaines. Il est le seul symbole de la fête dont la mort est annoncée dès l\'achat.' },
  [NCARD.jesus]: { t: 'Jésus de Nazareth', x: 'Jésus de Nazareth est, selon la tradition, né dans une étable faute de chambre disponible. Les avis des plateformes de réservation sur l\'établissement sont partagés. Sa naissance est fêtée le 25 décembre, date choisie sans que personne ne se souvienne vraiment pourquoi.' },
  [NCARD.marie]: { t: 'Marie', x: 'Marie est la mère de Jésus de Nazareth. Elle a accouché sans péridurale dans une étable non chauffée, ce qui lui vaut le respect de nombreux historiens et de toutes les sages-femmes. Elle n\'a jamais demandé de cadeau, ce qui reste à ce jour un cas isolé.' },
  [NCARD.noah]: { t: 'Noah', x: 'Noah est un joueur de la communauté, immortalisé ici pour l\'événement de Noël. Aucune source fiable ne permet d\'expliquer comment il est arrivé dans cet album, et personne n\'a posé la question.' },
  [NCARD.nativite]: { t: 'Le Petit Jésus de l\'entreprise', x: 'Le Petit Jésus de l\'entreprise est une apparition annuelle observée le 25 décembre au soir, au-dessus du siège social. Il descend du ciel dans un halo de lumière, remet une carte à chaque employé, puis repart sans avoir émargé. Le service des ressources humaines a ouvert un dossier. Il n\'a jamais été refermé.' },
};
const ALBUM_IDS = [NCARD.renne, NCARD.sapin, NCARD.jesus, NCARD.marie, NCARD.noah];   // la carte du 25 n'est pas dans l'album : c'est le cadeau

export function installNoelCards(d, h) {
  const { route, bad, one, all, run, st, ensureGameSchema, now, addCard, stats } = d, { isOn, setting, putSetting, prog } = h;
  const isJpeg64 = data => { if (!/^[A-Za-z0-9+/=]+$/.test(data)) return false; try { const b = atob(data.slice(0, 8)); return b.charCodeAt(0) === 0xFF && b.charCodeAt(1) === 0xD8; } catch { return false; } };
  let seeded = false;
  /** Crée (une fois) les cartes de l'album dans la base. */
  async function ensureCards(env) {
    if (seeded) return; await ensureGameSchema(env);
    for (const [id, a] of Object.entries(ART)) {
      const s = stats(a.t, 'legendary', 0);
      await run(env, 'INSERT INTO cards (id, title, extract, image, url, views, rarity, atk, def, shiny, enriched) VALUES (?,?,?,?,?,?,?,?,?,0,2) ON CONFLICT (id) DO NOTHING', +id, a.t, a.x, null, '', 1000, 'legendary', s.atk, s.def);
      const v = await setting(env, 'noel_cimg_v' + id); if (v) await run(env, 'UPDATE cards SET image = ? WHERE id = ?', RENDER_ART(id) + '?v=' + v, +id);
    }
    seeded = true;
  }
  const cardOut = (c, isNew = false) => ({ id: c.id, title: c.title, rarity: c.rarity, image: c.image || null, isNew });
  /** Album de Noël (réclamable comme les autres albums). */
  const album = () => ({ id: 'noel', name: 'Noël', emoji: '', blurb: 'Le renne, le sapin et la sainte famille. Plus Noah, qu\'on n\'attendait pas.', noel: true, cards: ALBUM_IDS.map(id => ({ id, t: ART[id].t })) });
  /** Cartes qu'on peut tirer à la hotte : l'album, plus les cartes de joueurs publiées. */
  const pool = async env => [...ALBUM_IDS, ...(await all(env, 'SELECT id FROM cards WHERE id >= ? AND id < ?', PCARD_BASE, PCARD_BASE + 1000000)).map(r => +r.id)];
  const gate = async (env, user) => { if (!(await isOn(env, user))) bad('L\'événement de Noël n\'est pas ouvert', 403); await ensureCards(env); };
  const admin = user => { if (!user.is_admin) bad('Réservé à l\'administrateur', 403); };

  // ───── Hotte : on y dépense les flocons gagnés aux jeux ─────
  route('GET', '/api/noel/hotte', async ({ env, user }) => {
    await gate(env, user);
    const ids = await pool(env), own = new Set((await all(env, 'SELECT card_id FROM inventory WHERE user_id = ? AND card_id >= 90000000 AND card_id < 92000000', user.id)).map(r => +r.card_id));
    return { cost: HOTTE_COST, flocons: await prog(env, 'nl:flocons', user.id), pool: ids.length, owned: ids.filter(i => own.has(i)).length };
  });
  route('POST', '/api/noel/hotte', async ({ env, user, body }) => {
    await gate(env, user);
    const n = Math.floor(+body.n || 1); if (!(n >= 1 && n <= 5)) bad('1 à 5 tirages à la fois', 400);
    const cost = n * HOTTE_COST, ids = await pool(env);
    const paid = await run(env, "UPDATE event_progress SET n = n - ? WHERE key = 'nl:flocons' AND user_id = ? AND n >= ?", cost, user.id, cost);
    if (!paid.meta.changes) bad(`Il te faut ${cost} flocons. Les lutins ne font pas crédit.`, 400);
    try {
      const picks = Array.from({ length: n }, () => ids[Math.floor(Math.random() * ids.length)]);
      const before = new Set((await all(env, `SELECT card_id FROM inventory WHERE user_id = ? AND card_id IN (${picks.map(() => '?').join(',')})`, user.id, ...picks)).map(r => +r.card_id));
      for (const id of picks) await addCard(env, user.id, id).run();
      const rows = await all(env, `SELECT id, title, rarity, image FROM cards WHERE id IN (${picks.map(() => '?').join(',')})`, ...picks), by = new Map(rows.map(r => [+r.id, r])), seen = new Set();
      const cards = picks.map(id => { const isNew = !before.has(id) && !seen.has(id); seen.add(id); return cardOut(by.get(id), isNew); });
      return { ok: true, cards, flocons: await prog(env, 'nl:flocons', user.id), cost: HOTTE_COST };
    } catch (e) { await run(env, "UPDATE event_progress SET n = n + ? WHERE key = 'nl:flocons' AND user_id = ?", cost, user.id).catch(() => {}); throw e; }
  });

  // ───── Cadeau du 25 décembre : une carte légendaire pour tous ─────
  const giftOpen = (user, q) => (user.is_admin && String(q) === '25') || new Date(Date.now() + 3600000).toISOString().slice(0, 10) >= GIFT_DAY;
  route('GET', '/api/noel/gift', async ({ env, user, query }) => {
    if (!(await isOn(env, user))) return { available: false, claimed: false };
    const claimed = !!(await one(env, 'SELECT 1 x FROM event_claims WHERE key = ? AND user_id = ?', 'nl:gift25', user.id));
    return { available: giftOpen(user, query.get('day')), claimed };
  });
  route('POST', '/api/noel/gift', async ({ env, user, body }) => {
    await gate(env, user);
    if (!giftOpen(user, body.day)) bad('Pas avant le 25 décembre. Le Petit Jésus ne se déplace pas pour rien.', 403);
    const token = now() * 1000 + Math.floor(Math.random() * 1000);
    const first = await run(env, 'INSERT INTO event_claims (key, user_id, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING', 'nl:gift25', user.id, token);
    if (!first.meta.changes) bad('Tu as déjà reçu la visite du Petit Jésus', 409);
    try { await addCard(env, user.id, NCARD.nativite).run(); } catch (e) { await run(env, 'DELETE FROM event_claims WHERE key = ? AND user_id = ?', 'nl:gift25', user.id).catch(() => {}); throw e; }
    const c = await one(env, 'SELECT id, title, rarity, image FROM cards WHERE id = ?', NCARD.nativite);
    return { ok: true, card: cardOut(c, true) };
  });
  // aperçu pour l'administrateur : permet de revoir l'animation et de reprendre le cadeau
  route('POST', '/api/noel/gift/reset', async ({ env, user }) => {
    admin(user);
    await run(env, 'DELETE FROM event_claims WHERE key = ? AND user_id = ?', 'nl:gift25', user.id);
    await run(env, 'DELETE FROM inventory WHERE user_id = ? AND card_id = ?', user.id, NCARD.nativite);
    return { ok: true };
  });

  // ───── Image publique d'une carte de Noël (l'image cartoon finale uniquement) ─────
  route('GET', '/api/noel/card/:id', async ({ env, params }) => {
    const id = Math.floor(+params.id);
    if (!(id >= 90000000 && id < 92000000)) return new Response('', { status: 404 });
    const data = await setting(env, 'noel_cimg_' + id);
    if (!data) return new Response('', { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(Uint8Array.from(atob(data), c => c.charCodeAt(0)), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
  }, false);
  async function setArt(env, id, data) {
    if (data === null) { await run(env, 'DELETE FROM settings WHERE key IN (?, ?)', 'noel_cimg_' + id, 'noel_cimg_v' + id); await run(env, 'UPDATE cards SET image = NULL WHERE id = ?', id); return; }
    data = String(data || '');
    if (data.length > 330000 || !isJpeg64(data)) bad('Image invalide : JPEG de 250 Ko au plus', 400);
    const v = String(now()); await putSetting(env, 'noel_cimg_' + id, data); await putSetting(env, 'noel_cimg_v' + id, v);
    await run(env, 'UPDATE cards SET image = ? WHERE id = ?', `${RENDER_ART(id)}?v=${v}`, id);
  }
  route('POST', '/api/noel/card-art', async ({ env, user, body }) => {
    admin(user); await ensureCards(env);
    const id = Math.floor(+body.id); if (!ART[id]) bad('Carte inconnue', 404);
    await setArt(env, id, body.data === null ? null : body.data); return { ok: true };
  });

  // ───── Photos des joueurs et cartes personnelles ─────
  route('GET', '/api/noel/photo', async ({ env, user }) => {
    await gate(env, user);
    const p = await one(env, 'SELECT ts FROM noel_photos WHERE user_id = ?', user.id), c = await one(env, 'SELECT id, title, image FROM cards WHERE id = ?', PCARD_BASE + user.id);
    return { sent: !!p, ts: p?.ts ?? null, card: c ? cardOut(c) : null };
  });
  route('POST', '/api/noel/photo', async ({ env, user, body }) => {
    await gate(env, user);
    if (body.consent !== true) bad('Il faut accepter que ta photo serve à créer ta carte', 400);
    const data = String(body.data || '');
    if (data.length > 330000 || !isJpeg64(data)) bad('Photo invalide : JPEG de 250 Ko au plus', 400);
    await run(env, 'INSERT INTO noel_photos (user_id, data, ts) VALUES (?,?,?) ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, ts = excluded.ts', user.id, data, now());
    return { ok: true };
  });
  route('POST', '/api/noel/photo/delete', async ({ env, user }) => { await gate(env, user); await run(env, 'DELETE FROM noel_photos WHERE user_id = ?', user.id); return { ok: true }; });
  route('GET', '/api/noel/photos-admin', async ({ env, user }) => {
    admin(user); await ensureGameSchema(env);
    const rows = await all(env, 'SELECT p.user_id, p.ts, u.name FROM noel_photos p JOIN users u ON u.id = p.user_id ORDER BY p.ts');
    const cards = await all(env, 'SELECT id, title, extract, image FROM cards WHERE id >= ? AND id < ?', PCARD_BASE, PCARD_BASE + 1000000);
    const by = new Map(cards.map(c => [+c.id - PCARD_BASE, c]));
    const base = []; for (const id of Object.keys(ART)) base.push({ id: +id, title: ART[id].t, art: !!(await setting(env, 'noel_cimg_' + id)) });
    return { photos: rows.map(r => ({ uid: +r.user_id, name: r.name, ts: +r.ts, card: by.has(+r.user_id) ? { title: by.get(+r.user_id).title, extract: by.get(+r.user_id).extract, image: by.get(+r.user_id).image } : null })), orphans: cards.filter(c => !rows.some(r => +r.user_id === +c.id - PCARD_BASE)).map(c => ({ uid: +c.id - PCARD_BASE, title: c.title })), base };
  });
  route('GET', '/api/noel/photo-img/:uid', async ({ env, user, params }) => {
    admin(user); const p = await one(env, 'SELECT data FROM noel_photos WHERE user_id = ?', +params.uid);
    if (!p) return new Response('', { status: 404 });
    return new Response(Uint8Array.from(atob(p.data), c => c.charCodeAt(0)), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
  });
  route('POST', '/api/noel/pcard', async ({ env, user, body }) => {
    admin(user); await ensureCards(env);
    const uid = Math.floor(+body.uid), who = await one(env, 'SELECT id, name FROM users WHERE id = ? AND is_bot = 0', uid);
    if (!who) bad('Joueur introuvable', 404);
    if (body.remove) { await run(env, 'DELETE FROM inventory WHERE card_id = ?', PCARD_BASE + uid); await run(env, 'DELETE FROM cards WHERE id = ?', PCARD_BASE + uid); await run(env, 'DELETE FROM settings WHERE key IN (?, ?)', 'noel_cimg_' + (PCARD_BASE + uid), 'noel_cimg_v' + (PCARD_BASE + uid)); return { ok: true }; }
    const title = String(body.title || '').trim().slice(0, 80), extract = String(body.extract || '').trim().slice(0, 4000);
    if (title.length < 2) bad('Titre de l\'article manquant', 400);
    const id = PCARD_BASE + uid, s = stats(title, 'ultra', 0);
    await run(env, "INSERT INTO cards (id, title, extract, image, url, views, rarity, atk, def, shiny, enriched) VALUES (?,?,?,?,?,?,?,?,?,0,2) ON CONFLICT (id) DO UPDATE SET title = excluded.title, extract = excluded.extract", id, title, extract, null, '', 800, 'ultra', s.atk, s.def);
    if (body.data !== undefined) await setArt(env, id, body.data); else { const v = await setting(env, 'noel_cimg_v' + id); if (v) await run(env, 'UPDATE cards SET image = ? WHERE id = ?', `${RENDER_ART(id)}?v=${v}`, id); }
    await run(env, 'UPDATE inventory SET nk = ? WHERE card_id = ?', title.toLowerCase(), id);
    return { ok: true, id };
  });
  return { album, ensureCards };
}
