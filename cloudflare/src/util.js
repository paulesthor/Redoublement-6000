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

export class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
export const bad = (msg, code = 400) => { throw new HttpError(code, msg); };
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// ---- accès D1 ----
export const one = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).first();
export const all = async (env, sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results;
export const run = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).run();
export const st = (env, sql, ...p) => env.DB.prepare(sql).bind(...p);          // statement pour env.DB.batch([...])
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
