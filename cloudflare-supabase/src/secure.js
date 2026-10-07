// En-têtes de sécurité ajoutés à toutes les réponses du Worker.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",                         // le script de thème de index.html est en ligne
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",                         // images des articles (Wikimedia) et photos de profil
  "connect-src 'self' wss: https:",
  "manifest-src 'self'", "worker-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
/** Renvoie une copie de la réponse avec les en-têtes de sécurité (CSP seulement pour les pages HTML). */
export function secure(res) {
  if (res.status === 101 || !res.headers) return res;                    // WebSocket : on n'y touche pas
  const h = new Headers(res.headers);
  h.set('X-Content-Type-Options', 'nosniff'); h.set('Referrer-Policy', 'no-referrer'); h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');   // la caméra sert à scanner le QR code d'un ami
  if ((h.get('content-type') || '').includes('text/html')) h.set('Content-Security-Policy', CSP);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
