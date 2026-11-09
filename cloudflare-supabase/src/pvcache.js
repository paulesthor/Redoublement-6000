// Statistiques de vues Wikipédia (API Wikimedia) : appels espacés, mémorisés, et mis au repos quand Wikimedia dit « trop de demandes ».
// Les adresses des Workers sont partagées avec beaucoup d'autres sites : Wikimedia répond souvent 429. Sans précaution, chaque visiteur relançait la construction du marché toutes les 15 s,
// ce qui aggravait la limitation. Maintenant : une série déjà obtenue n'est plus redemandée (rangée dans settings, clé « pv:<jour>:… »), et après un refus tout le monde attend (5 min).
import { one, run } from './util.js';
const UA = { 'User-Agent': 'WikimastersClone/1.0 (https://github.com/paulesthor/Redoublement-6000; jeu prive entre amis)' };
const DAY = 86400000;
const ymd = d => d.replace(/-/g, '');
const noCache = () => globalThis.__CACHE_MS === 0;   // les tests veulent des réponses fraîches et aucun délai de repos
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Vues Wikipédia par jour (UTC) d'un article entre deux jours « YYYY-MM-DD » : { 'YYYY-MM-DD': vues }, ou null si l'API ne répond pas. Un jour sans visite est absent. */
export const viewsError = { msg: null, code: null, retryAfter: 0 };     // dernière raison d'échec des statistiques Wikimedia (affichée à l'écran quand le marché est vide)
export async function pageViews(title, from, to, fetchFn = fetch) {
  viewsError.code = null;
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${ymd(from)}00/${ymd(to)}00`;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4500);
    const r = await fetchFn(url, { headers: { ...UA, 'Api-User-Agent': UA['User-Agent'] }, signal: ctl.signal }); clearTimeout(t);
    if (r.status === 404) return {};
    if (r.status === 429) viewsError.retryAfter = (+r.headers?.get?.('retry-after') || 60) * 1000;   // Wikimedia dit combien de temps attendre (30 à 60 s en pratique)
    if (!r.ok) { viewsError.code = r.status; viewsError.msg = `Wikimedia a répondu ${r.status}${r.status === 429 ? ' (trop de demandes)' : ''}`; return null; }
    viewsError.msg = null;
    return await readViews(r);
  } catch (e) { viewsError.code = 0; viewsError.msg = e?.name === 'AbortError' ? 'Wikimedia ne répond pas (délai dépassé)' : `Wikimedia injoignable : ${String(e?.message || e).slice(0, 80)}`; return null; }
}


async function readViews(r) {
  viewsError.msg = null;
  const j = await r.json(), out = {};
  for (const it of j.items ?? []) { const s = String(it.timestamp); out[`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`] = it.views; }
  return out;
}

// Mesure (9 novembre) : sans compte, Wikimedia accepte environ 5 demandes NON mémorisées par minute et par adresse, puis répond 429 avec « retry-after » de 30 à 60 s.
// Le marché demande une douzaine d'articles : il faut donc les espacer (13 s) et les répartir sur plusieurs passages de la tâche planifiée, jamais pendant la visite d'un joueur.
export const PV_PACE_MS = 13000;
export const pvMode = { patient: false, budget: 0, last: 0 };
/** Appelé par la tâche planifiée : autorise les demandes espacées, dans la limite de `budget` demandes par passage. */
export const pvStart = budget => { pvMode.patient = true; pvMode.budget = budget; };
export const pvStop = () => { pvMode.patient = false; pvMode.budget = 0; };
let rest = { until: 0, t: 0 };
export const pvForget = () => { rest = { until: 0, t: 0 }; };   // pour les tests
/** Fin du repos imposé après un refus de Wikimedia (ms), ou 0. Relu au plus toutes les 20 s. */
export async function pvRest(env) {
  if (noCache()) return 0;
  if (Date.now() - rest.t > 20000) { let u = 0; try { u = +((await one(env, "SELECT value FROM settings WHERE key = 'pv_rest'"))?.value || 0); } catch { u = 0; } rest = { until: u, t: Date.now() }; }
  return rest.until > Date.now() ? rest.until : 0;
}
async function pvSetRest(env, ms) {
  if (noCache()) return;
  const until = Date.now() + ms; rest = { until, t: Date.now() };
  await run(env, "INSERT INTO settings (key, value) VALUES ('pv_rest', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", String(until)).catch(() => {});
}
/** Vues d'un article entre deux jours : d'abord la mémoire de la base, sinon Wikimedia (sauf pendant un repos), avec mémorisation du résultat. null = indisponible. */
export async function pvGet(env, title, from, to) {
  const key = `pv:${to}:${title}|${from}`;
  if (!noCache()) { const c = await one(env, 'SELECT value FROM settings WHERE key = ?', key).catch(() => null); if (c) { try { return JSON.parse(c.value); } catch { /* entrée abîmée : on redemande */ } } }
  const until = await pvRest(env);
  if (!noCache() && !pvMode.patient) { viewsError.msg = 'Les statistiques de vues Wikipédia sont en cours de récupération : le marché apparaît dans quelques minutes'; return null; }   // les visiteurs ne sollicitent jamais Wikimedia
  if (!noCache() && pvMode.budget <= 0) { viewsError.msg = 'Les statistiques de vues Wikipédia continuent d\'arriver (quelques demandes par passage)'; return null; }
  if (until) { viewsError.msg = `Wikimedia limite les demandes : nouvel essai vers ${new Date(until).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`; return null; }
  if (!noCache()) { const wait = pvMode.last + (globalThis.__PV_PACE ?? PV_PACE_MS) - Date.now(); if (wait > 0) await sleep(wait); pvMode.last = Date.now(); pvMode.budget--; }   // cadence : 13 s entre deux demandes
  const v = await pageViews(title, from, to);
  if (v) { if (!noCache()) await run(env, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', key, JSON.stringify(v)).catch(() => {}); return v; }
  if (viewsError.code === 429 || viewsError.code === 0 || viewsError.code >= 500) await pvSetRest(env, viewsError.code === 429 ? Math.min(10 * 60000, (viewsError.retryAfter || 60000) + 5000) : 60000);   // le délai demandé par Wikimedia, plus une marge   // tout le monde patiente : on ne relance pas la limitation
  return null;
}
