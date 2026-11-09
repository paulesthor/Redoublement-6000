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
export const viewsError = { msg: null, code: null };     // dernière raison d'échec des statistiques Wikimedia (affichée à l'écran quand le marché est vide)
export async function pageViews(title, from, to, fetchFn = fetch) {
  viewsError.code = null;
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${ymd(from)}00/${ymd(to)}00`;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4500);
    const r = await fetchFn(url, { headers: { ...UA, 'Api-User-Agent': UA['User-Agent'] }, signal: ctl.signal }); clearTimeout(t);
    if (r.status === 404) return {};
    if (!r.ok && r.status === 429 && !noCache()) { const wait = Math.min(2500, (+r.headers?.get?.('retry-after') || 1) * 1000); await sleep(wait); const r2 = await fetchFn(url, { headers: { ...UA, 'Api-User-Agent': UA['User-Agent'] }, signal: AbortSignal.timeout(4500) }).catch(() => null); if (r2?.ok) return await readViews(r2); }   // une seule nouvelle tentative, après la pause demandée
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
  if (until) { viewsError.msg = `Wikimedia limite les demandes : nouvel essai vers ${new Date(until).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`; return null; }
  const v = await pageViews(title, from, to);
  if (v) { if (!noCache()) await run(env, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', key, JSON.stringify(v)).catch(() => {}); return v; }
  if (viewsError.code === 429 || viewsError.code === 0 || viewsError.code >= 500) await pvSetRest(env, viewsError.code === 429 ? 5 * 60000 : 60000);   // tout le monde patiente : on ne relance pas la limitation
  return null;
}
