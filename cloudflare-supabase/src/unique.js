// Cartes légendaires uniques : chaque article légendaire n'existe qu'en un exemplaire normal et un exemplaire shiny dans tout le jeu.
// La table legend_taken liste les cartes légendaires « qui existent » (clé = identifiant de la carte, shiny = identifiant + SHINY_OFFSET). Un tirage ne peut donner qu'une carte absente de la table ;
// les échanges, enchères et duels déplacent la carte sans toucher à la table (la carte existe toujours). Elle n'en sort que si elle est détruite ou si un tirage échoue avant d'être donné.
// Tant que le réglage « unique_on » n'est pas activé (remise à zéro), rien ne change : le jeu se comporte comme avant.
import { one, run } from './util.js';
import { ensureGameSchema } from './game.js';

let cache = { t: 0, on: false };
/** Les légendaires uniques sont-elles actives ? (relu au plus toutes les 20 s) */
export async function uniqueOn(env) {
  if (Date.now() - cache.t > 20000) {
    await ensureGameSchema(env);
    cache = { t: Date.now(), on: (await one(env, "SELECT value FROM settings WHERE key = 'unique_on'"))?.value === '1' };
  }
  return cache.on;
}
export const refreshUnique = () => { cache.t = 0; };
/** Réserve l'existence d'une carte légendaire : vrai si elle n'existait pas encore. */
export async function claimLegend(env, cardId) {
  return (await run(env, 'INSERT INTO legend_taken (card_id, ts) VALUES (?,?) ON CONFLICT DO NOTHING', cardId, Date.now())).meta.changes > 0;
}
/** Rend à la réserve les légendaires d'un tirage qui n'a finalement pas été donné (jamais si une copie est dans une collection). */
export async function releaseLegends(env, cards) {
  const ids = cards.filter(c => c.rarity === 'legendary').map(c => c.id);
  for (const id of ids) await run(env, 'DELETE FROM legend_taken WHERE card_id = ? AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.card_id = ? AND i.qty > 0)', id, id).catch(() => {});
}
