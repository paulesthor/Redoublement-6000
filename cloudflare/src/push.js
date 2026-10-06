// Notifications Web Push (Android, iOS 16.4+ une fois l'appli ajoutée à l'écran d'accueil, ordinateur).
// Sans contenu chiffré : le serveur « réveille » l'appareil (requête signée VAPID, corps vide) ; le service worker vient alors lire le texte
// dans /api/push/pull. Les clés VAPID sont créées au premier besoin et gardées dans la table settings.
import { one, all, run } from './util.js';

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const enc = s => new TextEncoder().encode(s);

let vapidCache = null;
export async function getVapid(env) {
  if (vapidCache) return vapidCache;
  const row = await one(env, "SELECT value FROM settings WHERE key = 'vapid'");
  let v = row && JSON.parse(row.value);
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
    await run(env, "INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid', ?)", JSON.stringify(v));
    const again = await one(env, "SELECT value FROM settings WHERE key = 'vapid'");   // deux requêtes simultanées : une seule paire gagne
    v = JSON.parse(again.value);
  }
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return (vapidCache = { pub: v.pub, key });
}

/** En-tête Authorization VAPID (JWT ES256) pour un service de push donné. */
export async function vapidAuth(env, endpoint) {
  const { pub, key } = await getVapid(env);
  const head = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:clodowiki@example.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(`${head}.${claims}`));   // 64 octets r||s : le format attendu par JWT
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${pub}`;
}

/** Réveille un appareil. Renvoie false si l'abonnement n'existe plus (il est alors supprimé). */
export async function wake(env, endpoint) {
  try {
    const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: await vapidAuth(env, endpoint), TTL: '86400', Urgency: 'high', 'Content-Length': '0' } });
    if (r.status === 404 || r.status === 410) { await run(env, 'DELETE FROM push_subs WHERE endpoint = ?', endpoint); return false; }
    return r.ok;
  } catch { return false; }
}

/** Met un message en attente pour un joueur et réveille tous ses appareils. */
export async function pushTo(env, uid, title, body, tag = null) {
  const subs = await all(env, 'SELECT endpoint FROM push_subs WHERE user_id = ?', uid);
  if (!subs.length) return 0;
  await env.DB.batch(subs.map(s => env.DB.prepare('INSERT INTO push_msgs (user_id, endpoint, title, body, tag, ts) VALUES (?,?,?,?,?,?)').bind(uid, s.endpoint, title, String(body).slice(0, 200), tag, Date.now())));
  const ok = await Promise.all(subs.map(s => wake(env, s.endpoint)));
  return ok.filter(Boolean).length;
}

/** Texte de notification d'un message temps réel, ou null s'il n'en mérite pas (rafraîchissements, succès de jeu en cours…). */
export function textOf(msg) {
  if (msg.t === 'notify' && msg.msg) return { title: 'Clodo Wiki', body: msg.msg, tag: 'n' };
  if (msg.t === 'friend') {
    const n = msg.name;
    return { title: 'Clodo Wiki', tag: 'friend', body: msg.kind === 'request' ? `${n} t'a envoyé une demande d'ami` : msg.kind === 'accepted' ? `${n} a accepté ta demande d'ami` : `${n} t'a ajouté en ami` };
  }
  if (msg.t === 'challenge') return { title: 'Défi !', body: `${msg.name} te défie`, tag: 'challenge' };
  return null;
}

/** Un message vient d'être envoyé à un joueur : s'il n'est pas devant l'écran, on le notifie. */
export async function pushFor(env, uid, msg) {
  const t = textOf(msg);
  if (t) await pushTo(env, uid, t.title, t.body, t.tag).catch(e => console.error('push', e));
}

/** Messages en attente d'un appareil (lus puis effacés par le service worker). */
export async function pull(env, endpoint) {
  if (!endpoint) return [];
  const msgs = await all(env, 'SELECT id, title, body, tag FROM push_msgs WHERE endpoint = ? ORDER BY id DESC LIMIT 4', endpoint);
  if (msgs.length) await run(env, 'DELETE FROM push_msgs WHERE endpoint = ?', endpoint);
  return msgs.reverse();
}
