// Migration des données D1 (SQLite) -> Supabase (PostgreSQL), pilotée depuis un navigateur (page /migrate).
// Active uniquement si le secret MIGRATE_KEY est défini ET que l'ancienne base est liée sous le nom OLD_DB.
// Rejouable à volonté : « Tout recopier » vide d'abord les tables Supabase puis recopie tout (à refaire juste avant le basculement).
const TABLES = ['users', 'sessions', 'cards', 'inventory', 'auctions', 'sales', 'trades', 'hits', 'friends', 'friend_requests', 'bids', 'achievements',
  'reserve', 'prepared', 'wanted', 'quizzes', 'favorites', 'settings', 'push_subs', 'fight_events', 'dms', 'convs'];
const IDENTITY = ['users', 'auctions', 'sales', 'trades', 'hits', 'friend_requests', 'bids', 'prepared', 'dms', 'push_msgs', 'fight_events'];
const RENAME = { hits: { user: 'username' } };
const CHUNK = 150;
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function handleMigrate(req, env, url) {
  if (url.pathname !== '/migrate' && url.pathname !== '/api/migrate') return null;
  if (!env.MIGRATE_KEY || !env.OLD_DB) return json({ error: 'Migration désactivée' }, 404);
  if (url.pathname === '/migrate') return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  let b; try { b = await req.json(); } catch { return json({ error: 'Corps invalide' }, 400); }
  if (String(b.key || '') !== env.MIGRATE_KEY) return json({ error: 'Clé incorrecte' }, 403);
  const DB = env.DB, old = env.OLD_DB;
  if (b.step === 'tables') return json({ tables: TABLES });
  if (b.step === 'reset') {
    await DB.exec(`TRUNCATE ${[...new Set([...TABLES, 'push_msgs'])].join(', ')} RESTART IDENTITY CASCADE`);
    return json({ ok: true });
  }
  if (b.step === 'copy') {
    const t = String(b.table); if (!TABLES.includes(t)) return json({ error: 'Table inconnue' }, 400);
    const after = +b.after || 0;
    const { results } = await old.prepare(`SELECT rowid AS _rid, * FROM ${t} WHERE rowid > ? ORDER BY rowid LIMIT ?`).bind(after, CHUNK).all();
    if (!results.length) return json({ rows: 0, next: after, done: true });
    const stmts = results.map(row => {
      const cols = Object.keys(row).filter(c => c !== '_rid'), map = RENAME[t] ?? {};
      return DB.prepare(`INSERT INTO ${t} (${cols.map(c => map[c] ?? c).join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`).bind(...cols.map(c => row[c]));
    });
    let skipped = 0, why = null;
    try { await DB.batch(stmts); }
    catch (e) {                                                       // une ligne pose problème (ligne orpheline, valeur invalide…) : on réessaie ligne par ligne et on compte celles ignorées
      for (const st of stmts) { try { await DB.batch([st]); } catch (e2) { skipped++; why ??= String(e2.message).slice(0, 160); } }
    }
    return json({ rows: results.length, skipped, why, next: results.at(-1)._rid, done: results.length < CHUNK });
  }
  if (b.step === 'finish') {                                          // les compteurs d'identifiants repartent après le plus grand identifiant copié
    const stmts = IDENTITY.map(t => DB.prepare(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1))`));
    await DB.batch(stmts);
    return json({ ok: true });
  }
  if (b.step === 'counts') {
    const out = {};
    for (const t of TABLES) {
      const o = await old.prepare(`SELECT COUNT(*) n FROM ${t}`).first(), n = await DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first();
      out[t] = [o.n, n.n];
    }
    return json({ counts: out });
  }
  return json({ error: 'Étape inconnue' }, 400);
}

const PAGE = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Migration</title>
<style>body{font:16px system-ui;background:#0b0b10;color:#eee;margin:0;padding:16px;max-width:640px}input,button{font:inherit;padding:12px;border-radius:10px;border:1px solid #444;background:#1a1a22;color:#eee;width:100%;box-sizing:border-box;margin:6px 0}button{background:#f2a34f;color:#111;font-weight:700;border:0}pre{background:#14141b;padding:12px;border-radius:10px;white-space:pre-wrap;font-size:13px}</style>
<h1>Migration D1 → Supabase</h1><p>Recopie toutes les données de l'ancienne base vers Supabase. Peut être relancée : elle vide d'abord Supabase.</p>
<input id="k" type="password" placeholder="Clé de migration (MIGRATE_KEY)" autocomplete="off">
<button id="go">Tout recopier</button><button id="cmp" style="background:#334;color:#eee">Comparer les nombres de lignes</button><pre id="log">Prêt.</pre>
<script>
const log = t => { const l = document.getElementById('log'); l.textContent += '\\n' + t; l.scrollTop = l.scrollHeight; };
const call = async b => { const r = await fetch('/api/migrate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: document.getElementById('k').value, ...b }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
document.getElementById('go').onclick = async () => { try {
  log('Vidage de Supabase…'); await call({ step: 'reset' });
  const { tables } = await call({ step: 'tables' });
  for (const t of tables) { let after = 0, n = 0, sk = 0, why = ''; for (;;) { const r = await call({ step: 'copy', table: t, after }); n += r.rows; sk += r.skipped || 0; why = why || r.why || ''; after = r.next; if (r.done) break; } log(t + ' : ' + n + ' lignes' + (sk ? ' (' + sk + ' ignorées : ' + why + ')' : '')); }
  await call({ step: 'finish' }); log('Compteurs d\\'identifiants réglés.'); document.getElementById('cmp').click();
} catch (e) { log('ERREUR : ' + e.message); } };
document.getElementById('cmp').onclick = async () => { try { const { counts } = await call({ step: 'counts' }); let bad = 0; log('Table : ancienne base / Supabase'); for (const [t, [o, n]] of Object.entries(counts)) { if (o !== n) bad++; log((o === n ? 'OK  ' : 'ÉCART ') + t + ' : ' + o + ' / ' + n); } log(bad ? bad + ' ÉCART(S) : relance « Tout recopier ».' : 'TOUT EST IDENTIQUE.'); } catch (e) { log('ERREUR : ' + e.message); } };
</script></html>`;
