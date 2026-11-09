// Suspension de compte : liste des identifiants suspendus rangée dans settings (clé « banned_users »), relue au plus toutes les 15 s.
// Un joueur suspendu ne peut plus rien faire (toutes les routes sauf /me, /config, /logout sont fermées, y compris le salon des duels), ne reçoit plus de paquets gratuits,
// et ses gains de pièces sont mis de côté (déclencheur coin_freeze) jusqu'à la levée de la suspension.
import { one } from './util.js';
let cache = { t: 0, ids: new Set() };
export const banMs = () => globalThis.__CACHE_MS ?? 15000;
export async function bannedIds(env) {
  if (Date.now() - cache.t >= banMs() || !cache.t) {
    let ids = []; try { ids = JSON.parse((await one(env, "SELECT value FROM settings WHERE key = 'banned_users'"))?.value || '[]'); } catch { ids = []; }
    cache = { t: Date.now(), ids: new Set(ids.map(Number)) };
  }
  return cache.ids;
}
export const isBanned = async (env, id) => (await bannedIds(env)).has(+id);
export const forgetBans = () => { cache = { t: 0, ids: new Set() }; };
export const BAN_MSG = 'Ton compte est suspendu par l\'administration. Tu ne peux rien faire pour l\'instant : ni jouer, ni gagner de paquets ou de pièces. Contacte l\'administrateur.';
