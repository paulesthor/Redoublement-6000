// Couche d'accès « façon D1 » au-dessus de Supabase (PostgreSQL).
// Le reste du code continue d'écrire env.DB.prepare(sql).bind(...).run()/all()/first() et env.DB.batch([...]) :
//  - les paramètres (? ou ?1) sont placés dans la requête sous forme de littéraux sûrs ;
//  - un lot (batch) part en un seul appel HTTPS et s'exécute dans UNE transaction (comme sur D1) ;
//  - le transport est interchangeable : HTTPS vers Supabase en production, PGlite (PostgreSQL local) dans les tests.

const isRead = sql => /^\s*(select|with|values)\b/i.test(sql);
/** Tables dont la clé « id » est auto-incrémentée : on renvoie l'identifiant créé (meta.last_row_id, comme D1). */
const ID_TABLES = new Set(['users', 'auctions', 'sales', 'trades', 'hits', 'friend_requests', 'bids', 'prepared', 'dms', 'push_msgs', 'fight_events', 'tournaments']);

/** Valeur JavaScript -> littéral SQL. Les textes sont placés entre guillemets « dollar » dont l'étiquette n'apparaît pas dans le texte. */
export function literal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('Paramètre numérique invalide'); return v < 0 ? `(${v})` : String(v); }
  const s = String(v).replace(/\u0000/g, '');
  // la balise ne doit apparaître nulle part dans « texte + balise de fin », sinon un texte finissant par « $q » fermerait la chaîne trop tôt (injection possible entre deux paramètres)
  let tag = '$q$'; for (let i = 0; (s + tag).indexOf(tag) !== s.length; i++) tag = `$q${i}$`;
  return tag + s + tag;
}

/** Requête D1 (SQLite) + paramètres -> requête PostgreSQL prête à exécuter. */
export function compile(sql, params = []) {
  let out = '', i = 0, seq = 0, used = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {                                                 // texte entre apostrophes : copié tel quel
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; } j++; }
      out += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '?') {
      let j = i + 1; while (/\d/.test(sql[j] || '')) j++;
      const idx = j > i + 1 ? +sql.slice(i + 1, j) - 1 : seq++;
      if (idx >= params.length) throw new Error(`Paramètre ${idx + 1} manquant`);
      out += literal(params[idx]); used++; i = j; continue;
    }
    out += c; i++;
  }
  let ignore = false;
  out = out.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, () => { ignore = true; return 'INSERT INTO'; });
  out = out.trim().replace(/;$/, '');
  if (ignore) out += ' ON CONFLICT DO NOTHING';
  let wantId = false;
  const m = /^\s*INSERT\s+INTO\s+"?(\w+)"?/i.exec(out);
  if (m && ID_TABLES.has(m[1].toLowerCase()) && !/\bRETURNING\b/i.test(out)) { out += ' RETURNING id'; wantId = true; }
  return { sql: out, wantId };
}

/** Résultat façon D1. rows_read = lignes renvoyées par un SELECT, rows_written = lignes touchées par une écriture, bytes = taille des données renvoyées (transfert sortant de Supabase). */
const shape = (r, wantId, read = false) => ({ results: r.results, success: true, meta: {
  changes: r.changes, last_row_id: wantId ? (r.results?.[0]?.id ?? 0) : 0,
  rows_read: read ? r.changes : 0, rows_written: read ? 0 : r.changes, bytes: r.results?.length ? JSON.stringify(r.results).length : 0 } });

/** Base « façon D1 » au-dessus d'un transport : stmts [{sql}] -> [{results, changes}]. */
export function pgDB(transport) {
  const make = (sql, params = []) => ({
    _sql: sql, _params: params,
    bind: (...p) => make(sql, p),
    run: async function () { const c = compile(sql, params); return shape((await transport([{ sql: c.sql }]))[0], c.wantId, isRead(sql)); },
    all: async function () { return this.run(); },
    first: async function (col) { const r = (await this.run()).results[0] ?? null; return col && r ? r[col] : r; },
    raw: async function () { return (await this.run()).results.map(o => Object.values(o)); },
  });
  return {
    __pg: true,
    prepare: sql => make(sql),
    batch: async list => {
      const cs = list.map(s => compile(s._sql, s._params));
      const res = await transport(cs.map(c => ({ sql: c.sql })));
      return res.map((r, i) => shape(r, cs[i].wantId, isRead(list[i]._sql)));
    },
    exec: async sql => { await transport([{ sql }]); return { count: 1 }; },
  };
}

/** Transport de production : appel HTTPS de la fonction q() de Supabase (clé service_role, secrète). */
export function supabaseTransport(url, key) {
  const endpoint = url.replace(/\/$/, '') + '/rest/v1/rpc/q';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  return async stmts => {
    // Les lectures peuvent être rejouées sans risque après un incident réseau ; une écriture n'est JAMAIS rejouée (elle a pu passer).
    const readOnly = stmts.every(s => /^\s*(select|with)\b/i.test(s.sql));
    const body = JSON.stringify({ stmts });
    const headers = { 'Content-Type': 'application/json', apikey: key };
    if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;   // clé « service_role » classique (JWT) : envoyée aussi en Authorization ; les nouvelles clés « sb_secret_… » ne vont que dans apikey
    for (let attempt = 1; ; attempt++) {
      let r, t;
      try {
        r = await fetch(endpoint, { method: 'POST', headers: headers, body, signal: AbortSignal.timeout(10000) });
        t = await r.text();
      } catch (e) {
        if (readOnly && attempt < 3) { await wait(150 * attempt); continue; }
        throw new Error('Supabase injoignable : ' + e.message);
      }
      if (r.ok) return JSON.parse(t);
      if (readOnly && attempt < 3 && (r.status === 429 || r.status >= 500)) { await wait(150 * attempt); continue; }
      let j; try { j = JSON.parse(t); } catch { j = { message: t }; }
      if ((j.code === '40P01' || j.code === '40001') && attempt < 5) { await wait(40 * attempt + Math.random() * 120); continue; }   // blocage mutuel entre deux transactions : PostgreSQL a tout annulé, on peut rejouer sans risque
      const e = new Error(`Supabase ${r.status} ${j.code || ''} ${j.message || t}`.trim());
      e.status = r.status; throw e;
    }
  };
}

/** Copie de env avec des liaisons en plus. Reprend TOUTES les propriétés (même non énumérables, comme peut l'être la liaison Workers AI) : « {...env} » les perdait. */
export function extendEnv(env, extra) {
  const out = Object.create(Object.getPrototypeOf(env) ?? Object.prototype);
  for (const k of Object.getOwnPropertyNames(env)) { try { out[k] = env[k]; } catch { /* propriété illisible : ignorée */ } }
  return Object.assign(out, extra);
}
const cache = new WeakMap();
/** env avec env.DB branché sur Supabase (si env.DB n'existe pas déjà : les tests fournissent le leur). */
export function withDb(env) {
  if (env.DB) return env;
  let w = cache.get(env);
  if (!w) {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('Secrets SUPABASE_URL et SUPABASE_KEY manquants');
    w = extendEnv(env, { DB: pgDB(supabaseTransport(env.SUPABASE_URL, env.SUPABASE_KEY)) });
    cache.set(env, w);
  }
  return w;
}
