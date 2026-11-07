// Événement communiste : colis du Parti, collection indépendante (Archives) et souvenirs de fin.
// Le réservoir de cartes (catalog/commu.json) ne contient que des articles russes et soviétiques, vérifiés sur Wikipédia (extrait et vignette inclus).
// Les cartes de l'événement vivent dans la table des cartes sous un identifiant décalé (EVENT_OFFSET) pour ne jamais se mélanger aux cartes normales,
// et leur collection est rangée dans une colonne du joueur : aucune table de plus, la collection normale n'est jamais touchée.
import { stats, RANK, urlOf, cardRows } from './util.js';

export const EVENT_OFFSET = 200000000;
export const EVENT_WEIGHTS = { common: 55, uncommon: 20, rare: 14, super: 6, ultra: 4.5, legendary: 0.5 };   // légendaire : 0,5 % par carte (150 cartes dans le réservoir)
export const PACK = 10;
const RARITIES = ['common', 'uncommon', 'rare', 'super', 'ultra', 'legendary'];
let poolCache = null;

export function installCommuCards(d, h) {
  const { route, bad, one, all, run, st, assetJson, addCard } = d;
  const json = s => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } };
  async function pool(env, origin) {
    if (poolCache) return poolCache;
    const cards = (await assetJson(env, origin, '/catalog/commu.json')).cards, by = Object.fromEntries(RARITIES.map(r => [r, []]));
    for (const c of cards) (by[c.r] ??= []).push(c);
    return (poolCache = { cards, by, total: Object.fromEntries(RARITIES.map(r => [r, by[r].length])) });
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function rollRarity(by) {
    const avail = RARITIES.filter(r => by[r].length), sum = avail.reduce((t, r) => t + EVENT_WEIGHTS[r], 0); let x = Math.random() * sum;
    for (const r of avail) { x -= EVENT_WEIGHTS[r]; if (x < 0) return r; }
    return avail[0];
  }
  // un colis : 10 cartes, jamais deux fois la même dans le colis
  function drawPack(P) {
    const used = new Set(), out = [];
    for (let i = 0; i < PACK; i++) {
      let r = rollRarity(P.by), c = null;
      for (let t = 0; t < 30 && !c; t++) { const x = pick(P.by[r]); if (!used.has(x.id)) c = x; }
      if (!c) { r = 'common'; for (let t = 0; t < 60 && !c; t++) { const x = pick(P.by.common); if (!used.has(x.id)) c = x; } }
      if (c) { used.add(c.id); out.push(c); }
    }
    return out;
  }
  const rowOf = c => ({ id: EVENT_OFFSET + c.id, title: c.t, rarity: c.r });
  const insertStmt = (env, c) => { const a = stats(c.t, c.r, false); return st(env, 'INSERT OR IGNORE INTO cards (id, title, views, rarity, atk, def, shiny, url, extract, image, enriched) VALUES (?,?,?,?,?,?,?,?,?,?,?)', EVENT_OFFSET + c.id, c.t, c.v || 1, c.r, a.atk, a.def, 0, urlOf(c.t), c.x || '', c.i || null, c.x ? 2 : 0); };   // sans extrait fourni, l\'enrichissement habituel du jeu le lira sur Wikipédia au premier affichage
  const cardsView = async (env, uid, col) => {
    const ids = Object.keys(col).map(Number); const rows = await cardRows(env, ids);
    return rows.map(r => ({ ...r, qty: +col[r.id] })).sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || a.title.localeCompare(b.title, 'fr'));
  };

  // ouvrir n colis (1 ou plusieurs) : un colis consommé = une ouverture ; cartes ajoutées à la collection de l'événement
  route('POST', '/api/commu/open', async ({ env, origin, user }) => {
    await h.access(env, user, { play: true });
    const P = await pool(env, origin);
    const took = await run(env, 'UPDATE plan_progress SET packs = packs - 1 WHERE user_id = ? AND packs >= 1', user.id);
    if (!took.meta.changes) bad('Tu n\'as plus de colis : fais la queue pour en acheter (50 ₽)', 400);
    let drawn;
    try { drawn = drawPack(P); if (!drawn.length) throw new Error('réservoir vide'); await env.DB.batch(drawn.map(c => insertStmt(env, c))); }
    catch (e) { await run(env, 'UPDATE plan_progress SET packs = packs + 1 WHERE user_id = ?', user.id); throw e; }   // tirage impossible : le colis est rendu
    let before = {}, won = false;
    for (let essai = 0; essai < 12 && !won; essai++) {
      const r = await h.rowOf(env, user.id); before = json(r.cards); const next = { ...before };
      for (const c of drawn) next[EVENT_OFFSET + c.id] = (+next[EVENT_OFFSET + c.id] || 0) + 1;
      const upd = await run(env, 'UPDATE plan_progress SET cards = ?, opened = opened + 1 WHERE user_id = ? AND cards = ?', JSON.stringify(next), user.id, r.cards);
      won = !!upd.meta.changes;
    }
    if (!won) { await run(env, 'UPDATE plan_progress SET packs = packs + 1 WHERE user_id = ?', user.id); bad('Trop d\'ouvertures en même temps, réessaie', 409); }
    const seen = new Set(), ids = drawn.map(c => EVENT_OFFSET + c.id), rows = new Map((await cardRows(env, ids)).map(r => [r.id, r]));
    const cards = drawn.map(c => { const id = EVENT_OFFSET + c.id, isNew = !before[id] && !seen.has(id); seen.add(id); return { ...rows.get(id), isNew, fav: 0 }; }).sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
    const left = +(await h.rowOf(env, user.id)).packs;
    return { cards, packs: left, event: true };
  });
  // collection de l'événement : cartes possédées et avancement par rareté
  route('GET', '/api/commu/cards', async ({ env, origin, user }) => {
    const { r } = await h.access(env, user), P = await pool(env, origin), col = json(r.cards), list = await cardsView(env, user.id, col);
    const have = Object.fromEntries(RARITIES.map(x => [x, 0])); for (const c of list) have[c.rarity]++;
    return { cards: list, have, total: P.total, owned: list.length, copies: list.reduce((t, c) => t + c.qty, 0), opened: +(r.opened || 0), packs: +(r.packs || 0) };
  });
  // fin de l'événement : chaque souvenir gagné (paliers 2 et 11) permet de faire entrer UNE carte de l'événement, au choix, dans la collection normale (marquée « souvenir »)
  const entitledOf = r => { try { return JSON.parse(r.perks || '[]').filter(p => p.startsWith('souvenir_')).length; } catch { return 0; } };
  async function grantSouvenirs(env, uid, r, ids) {
    const col = json(r.cards), have = (() => { try { return JSON.parse(r.souvenirs || '[]'); } catch { return []; } })(), n = entitledOf(r);
    if (have.length) bad('Tes souvenirs sont déjà choisis, camarade : le Parti ne reprend pas ses cadeaux', 409);
    const pick = [...new Set(ids.map(Number))]; if (!pick.length || pick.length > n || pick.some(id => !(id in col))) bad(`Choisis de 1 à ${n} fiche${n > 1 ? 's' : ''} parmi celles que tu possèdes`, 400);
    const claim = await run(env, "UPDATE plan_progress SET souvenirs = ? WHERE user_id = ? AND souvenirs = '[]'", JSON.stringify(pick), uid);
    if (!claim.meta.changes) bad('Tes souvenirs sont déjà choisis, camarade', 409);
    await env.DB.batch(pick.map(id => addCard(env, uid, id)));
    return pick;
  }
  route('POST', '/api/commu/souvenirs', async ({ env, user, body }) => {
    const { r } = await h.access(env, user);
    if ((await h.setting(env, 'commu_done')) !== '1') bad('L\'événement n\'est pas terminé : les souvenirs se choisissent à la fin', 400);
    if ((await h.setting(env, 'commu_souv_closed')) === '1') bad('Le choix des souvenirs est clos', 400);
    const ids = Array.isArray(body.ids) ? body.ids : []; const pick = await grantSouvenirs(env, user.id, r, ids);
    const cards = (await cardRows(env, pick)).map(c => ({ ...c, souvenir: true }));
    return { ok: true, cards };
  });
  // administrateur : clôture le choix ; ceux qui n'ont pas choisi reçoivent leurs plus belles fiches
  async function souvenirs(env) {
    const rows = await all(env, 'SELECT user_id, perks, cards, souvenirs FROM plan_progress WHERE joined > 1'); let given = 0;
    for (const r of rows) {
      const n = entitledOf(r), col = json(r.cards); if (!n || !Object.keys(col).length) continue;
      if ((() => { try { return JSON.parse(r.souvenirs || '[]').length; } catch { return 0; } })()) continue;
      const owned = (await cardRows(env, Object.keys(col).map(Number))).sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || +col[a.id] - +col[b.id]);
      const ids = owned.slice(0, n).map(c => c.id); if (!ids.length) continue;
      await run(env, 'UPDATE plan_progress SET souvenirs = ? WHERE user_id = ?', JSON.stringify(ids), +r.user_id);
      await env.DB.batch(ids.map(id => addCard(env, +r.user_id, id))); given += ids.length;
    }
    return given;
  }
  route('POST', '/api/commu/souvenirs/close', async ({ env, user }) => {
    if (!user.is_admin) bad('Réservé à l\'administrateur', 403);
    if ((await h.setting(env, 'commu_done')) !== '1') bad('L\'événement n\'est pas terminé', 400);
    const given = await souvenirs(env); await h.putSetting(env, 'commu_souv_closed', '1');
    return { ok: true, given };
  });
  return { souvenirs, pool };
}
