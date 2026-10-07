import CFG from './config.js';

export const SHINY_OFFSET = 100000000; // id d'une variante shiny = id de la page + SHINY_OFFSET
export const SHARD = 10000;            // pages par fichier de catalogue
export const RANK = Object.fromEntries(CFG.RARITIES.map((r, i) => [r, i]));

export const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Statistiques fixes d'une page (identiques à la version Node : titre + rareté). */
export function stats(title, rarity, shiny = false) {
  const [lo, hi] = shiny ? CFG.SHINY_RANGE : CFG.STAT_RANGE[rarity];
  const best = lo + hash(title + '|best') % (hi - lo + 1);
  const other = Math.round(best * (0.5 + (hash(title + '|other') % 501) / 1000));
  return hash(title + '|side') % 2 === 0 ? { atk: best, def: other } : { atk: other, def: best };
}

export const urlOf = title => 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
export const caseSql = (col, map) => `CASE ${col} ${CFG.RARITIES.map(r => `WHEN '${r}' THEN ${map[r]}`).join(' ')} END`;

/** Limite gratuite de la base atteinte (5 millions de lectures / 100 000 écritures par jour) : D1 renvoie alors une erreur jusqu'à minuit UTC. */
export const isQuotaError = e => e?.status === 402 || /Supabase 402|fair use|quota|exceeded|restricted|read-only|read only/i.test(String(e?.message ?? e));   // Supabase renvoie 402 (ou un message de quota) quand le plan gratuit est dépassé
export const nextResetMs = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };
export const QUOTA_MSG = 'Limite de la base de données atteinte : le jeu est ralenti ou suspendu par l’hébergeur. Il revient dès que le quota est rétabli.';
export class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
export const bad = (msg, code = 400) => { throw new HttpError(code, msg); };
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// ---- accès D1 ----
// Chaque requête comptabilise les lignes lues (limite gratuite : 5 millions par jour) ; le total par type de requête est enregistré dans la table usage (consultable dans l'admin).
const usage = new Map(); let lastFlush = Date.now();
export const track = (sql, rows) => { const k = sql.replace(/\s+/g, ' ').trim().slice(0, 100); const x = usage.get(k) ?? { n: 0, rows: 0 }; x.n++; x.rows += rows || 0; usage.set(k, x); };
export async function flushUsage(env) {
  if (!usage.size || Date.now() - lastFlush < 900000) return;
  lastFlush = Date.now();
  const day = new Date().toISOString().slice(0, 10), items = [...usage]; usage.clear();
  await env.DB.batch(items.map(([k, x]) => env.DB.prepare('INSERT INTO usage (day, sig, n, rows) VALUES (?,?,?,?) ON CONFLICT(day, sig) DO UPDATE SET n = usage.n + excluded.n, rows = usage.rows + excluded.rows').bind(day, k, x.n, x.rows))).catch(() => {});
}
export const one = async (env, sql, ...p) => { const r = await env.DB.prepare(sql).bind(...p).all(); track(sql, r.meta?.rows_read); return r.results[0] ?? null; };
export const all = async (env, sql, ...p) => { const r = await env.DB.prepare(sql).bind(...p).all(); track(sql, r.meta?.rows_read); return r.results; };
export const run = async (env, sql, ...p) => { const r = await env.DB.prepare(sql).bind(...p).run(); track(sql, r.meta?.rows_read); return r; };
export const st = (env, sql, ...p) => env.DB.prepare(sql).bind(...p);          // statement pour env.DB.batch([...])
/** Quelques articles complets pris au hasard (mauvaises réponses des questions) : on part d'un identifiant tiré au hasard au lieu de trier toute la table. */
export async function randomPool(env, n) {
  const max = (await one(env, 'SELECT MAX(id) m FROM cards'))?.m ?? 0, start = Math.floor(Math.random() * max);
  const sel = 'SELECT id, title, extract, views FROM cards WHERE enriched >= 1 AND shiny = 0 AND length(extract) > 80 AND id ';
  const a = await all(env, sel + '>= ? ORDER BY id LIMIT ?', start, n);
  return a.length >= n ? a : [...a, ...await all(env, sel + '< ? ORDER BY id LIMIT ?', start, n - a.length)];
}
export const placeholders = n => Array(n).fill('?').join(',');
export const cardRows = (env, ids) => (ids.length ? all(env, `SELECT * FROM cards WHERE id IN (${placeholders(ids.length)})`, ...ids) : Promise.resolve([]));

export const userFromToken = (env, token) => token
  ? one(env, 'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', token) : Promise.resolve(null);

export async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 10000 }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

/** Envoie un message aux joueurs connectés via le Durable Object (to = id joueur, ou null pour tous). */
export function notify(env, ctx, msg, to = null) {
  const stub = env.LOBBY.get(env.LOBBY.idFromName('main'));
  const p = stub.fetch('https://lobby/push', { method: 'POST', body: JSON.stringify({ to, msg }) }).catch(() => {});
  ctx?.waitUntil(p);
  return p;
}

/** Seau de l'index de recherche (public/catalog/s/N.json) d'un titre : même fonction que scripts/build-search-index.mjs. */
export const searchBucket = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0; return h & 4095; };

// ---- compteur d'écritures D1 : qui écrit, par quelle route, avec quelle requête (limite gratuite : 100 000 lignes écrites par jour) ----
const meterAcc = new Map();                                       // 'R:route' | 'U:joueur' | 'Q:requête' -> { n, r, w }
const sigOf = sql => sql.replace(/\s+/g, ' ').trim().slice(0, 90);
function rec(tags, sql, meta) {
  const r = meta?.rows_read || 0, w = meta?.rows_written || 0;
  for (const k of [...tags.filter(Boolean), 'Q:' + sigOf(sql)]) { const x = meterAcc.get(k) ?? { n: 0, r: 0, w: 0 }; x.n++; x.r += r; x.w += w; meterAcc.set(k, x); }
}
/** Copie de `env` dont la base compte les lignes lues et écrites de chaque requête, rattachées aux étiquettes données (route, joueur). */
export function meter(env, ...tags) {
  if (!env.DB || env.DB.__metered) return env;
  const wrap = (s, sql) => ({
    _s: s, _sql: sql,
    bind: (...a) => wrap(s.bind(...a), sql),
    run: async () => { const r = await s.run(); rec(tags, sql, r.meta); return r; },
    all: async () => { const r = await s.all(); rec(tags, sql, r.meta); return r; },
    first: (...a) => s.first(...a), raw: (...a) => s.raw(...a),
  });
  const DB = { __metered: true, prepare: sql => wrap(env.DB.prepare(sql), sql), exec: (...a) => env.DB.exec(...a),
    batch: async list => { const res = await env.DB.batch(list.map(x => x._s ?? x)); res.forEach((r, i) => rec(tags, list[i]._sql ?? '?', r.meta)); return res; } };
  return { ...env, DB };
}
/** Vide le compteur local et renvoie son contenu. */
export function takeMeter() { const o = [...meterAcc]; meterAcc.clear(); return o; }
