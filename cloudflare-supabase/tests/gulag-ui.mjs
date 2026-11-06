// Captures d'écran de l'interface d'administration (tableau de bord, journal) sur téléphone, avec le vrai Worker et un vrai PostgreSQL.
import './api.mjs';
import { createRequire } from 'node:module';
import http from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/'); const { chromium } = require('playwright');
const { call, settle, DB, worker, env, ctx, ok, done, J } = globalThis.__T;
const PUB = new URL('../../cloudflare/public/', import.meta.url).pathname;
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(null, 'POST', '/api/register', { name: 'Bob', password: 'secret2' }); const B = r.token;
await DB.prepare('UPDATE users SET is_admin = 1 WHERE name = ?').bind('Alice').run();
await call(B, 'POST', '/api/dm/1', { body: 'coucou' }); await settle();
for (let i = 0; i < 4; i++) { await call(A, 'POST', '/api/packs/open', {}); await call(B, 'POST', '/api/packs/open', {}); }
await call(A, 'GET', '/api/auctions'); await call(B, 'GET', '/api/auctions'); await call(A, 'GET', '/api/inconnue'); await call(null, 'POST', '/api/login', { name: 'Bob', password: 'faux' }); await settle();
const srv = http.createServer(async (q, res) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of q) chunks.push(c);
    const rr = await worker.fetch(new Request('http://x' + q.url, { method: q.method, headers: q.headers, body: ['GET', 'HEAD'].includes(q.method) ? undefined : Buffer.concat(chunks) }), env, ctx);
    res.writeHead(rr.status, { 'content-type': 'application/json' }); return res.end(await rr.text());
  }
  let p = path.join(PUB, u.pathname); if (p.endsWith('/')) p += 'index.html'; if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(8767);
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const mk = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); if (!localStorage.getItem('wm_seen_ver')) localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900); return p; };

await call(A, 'GET', '/api/camp'); await DB.prepare('UPDATE camp_progress SET start = ?').bind(Date.now() - 3 * 3600e3).run();   // 3 h de jeu déjà écoulées côté serveur
let p = await mk(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
await p.click('nav button.more', { timeout: 8000 }); await p.waitForSelector('.moresheet'); await p.waitForTimeout(300); await p.click('.mtile[data-go=gulag]'); await p.waitForSelector('.gl-card', { timeout: 20000 }); await p.waitForTimeout(1500);
await p.click('#gl-tabp'); await p.waitForSelector('.gl-sum', { timeout: 8000 }); await p.screenshot({ path: '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/pt/primes-1.png' });
ok('onglet Primes : 10 paliers listés', (await p.$$('#gl-body .gl-card')).length === 11);
ok('rien de prêt au départ', await p.$('[data-claim]') === null);
const coin0 = +(await DB.prepare('SELECT coins FROM users WHERE name = ?').bind('Alice').first()).coins;
await p.evaluate(() => window.__gulag._debug.set({ planProd: 1e6 })); await p.click('#gl-tabp'); await p.waitForTimeout(500);
ok('palier 1 prêt (progression et délai)', await p.$('[data-claim="1"]') !== null);
ok('l\'onglet affiche le nombre de primes prêtes', (await p.textContent('#gl-tabp')).includes('1'));
await p.click('[data-claim="1"]'); await p.waitForSelector('.gl-event', { timeout: 5000 }); const t1 = await p.textContent('.gl-event'); await p.screenshot({ path: '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/pt/primes-2.png' });
ok('prime récupérée : wikibidou et titre annoncés', t1.includes('PRIME DU PARTI') && t1.includes('40 wikibidou') && t1.includes('Contremaître stagiaire'), t1.slice(0, 200));
const coin1 = +(await DB.prepare('SELECT coins FROM users WHERE name = ?').bind('Alice').first()).coins; ok('les wikibidou sont réellement crédités (mode classique)', coin1 === coin0 + 40, J([coin0, coin1]));
await p.click('[data-close]'); await p.waitForTimeout(400);
ok('palier marqué « récupérée », plus de bouton', await p.$('[data-claim="1"]') === null && (await p.textContent('#gl-body')).includes('Prime récupérée'));
await DB.prepare('UPDATE camp_progress SET perks = ?').bind('["theme_urss"]').run();
await p.click('#gl-exit'); await p.waitForTimeout(1000); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; tab = 'settings'; render(); }); await p.waitForSelector('.themes', { timeout: 8000 }); await p.waitForTimeout(400);
ok('réglages : le thème « Camarade » est proposé', (await p.textContent('.themes')).includes('Camarade'));
await p.click('[data-th=urss]'); await p.waitForTimeout(300); ok('thème rouge appliqué', await p.evaluate(() => document.documentElement.dataset.theme === 'urss'));
await p.screenshot({ path: '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/pt/theme-urss.png' });
ok('aucune erreur JavaScript', errs.length === 0, J(errs));
process.exit(0);
