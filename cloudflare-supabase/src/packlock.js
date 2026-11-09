// Verrou d'ouverture des paquets (maintenance volontaire de la base) : message rangé dans settings (clé « pack_lock »), relu au plus toutes les 10 s.
// Quand il est posé, aucun joueur (sauf l'administrateur) ne peut ouvrir ni acheter de paquet ni récupérer une expédition : la table des cartes est réécrite pendant ce temps.
import { one } from './util.js';
let cache = { t: 0, msg: '' };
export async function packLockMsg(env) {
  if (!cache.t || Date.now() - cache.t >= (globalThis.__CACHE_MS ?? 10000)) {
    let msg = ''; try { msg = (await one(env, "SELECT value FROM settings WHERE key = 'pack_lock'"))?.value || ''; } catch { msg = ''; }
    cache = { t: Date.now(), msg };
  }
  return cache.msg;
}
export const forgetPackLock = () => { cache = { t: 0, msg: '' }; };
export const PACK_LOCK_ROUTES = /^\/api\/(packs\/(open|buy)|commu\/(open|buy)|expeditions\/[^/]+\/collect)$/;
