// Audit de mise en page : débordements et textes coupés, avec et sans l'habillage URSS, sur plusieurs tailles d'écran (Playwright, hors de all.mjs).
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
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const mk = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); if (!localStorage.getItem('wm_seen_ver')) localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900); return p; };
const p = await mk(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
const st = () => p.evaluate(() => window.UssrSkin?.hymnState?.() || null);
ok('le fichier de l\'hymne est servi', await p.evaluate(async () => { const r = await fetch('ussr-hymne.mp3'); return r.ok && (await r.arrayBuffer()).byteLength > 1000000; }));
await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); setPref('wm_sound', '1'); setPref('wm_hymn', '1'); await syncUssrUi(); }); await p.waitForTimeout(800);
ok('thème actif : le lecteur est prêt, fichier trouvé', (await st())?.manquant === false, J(await st()));
await p.mouse.click(195, 400); await p.waitForTimeout(1800);
const s1 = await st(); ok('au premier toucher, l\'hymne joue', s1?.enLecture === true && s1.durée > 100, J(s1));
await p.evaluate(() => { setPref('wm_hymn', '0'); window.UssrSkin.hymnRefresh(); }); await p.waitForTimeout(400); ok('interrupteur Réglages : l\'hymne se met en pause', (await st())?.enLecture === false);
await p.evaluate(() => { setPref('wm_hymn', '1'); window.UssrSkin.hymnRefresh(); }); await p.waitForTimeout(900); ok('réactivé : il reprend', (await st())?.enLecture === true, J(await st()));
await p.evaluate(() => { setPref('wm_sound', '0'); window.UssrSkin.hymnRefresh(); }); await p.waitForTimeout(400); ok('sons coupés : l\'hymne se coupe aussi', (await st())?.enLecture === false);
await p.evaluate(async () => { setPref('wm_sound', '1'); setPref('wm_ussr_ui', '0'); setPref('wm_ussr', '0'); setPref('wm_theme', 'dark'); await syncUssrUi(); }); await p.waitForTimeout(600);
ok('thème coupé : plus d\'hymne', (await st())?.chargé === false, J(await st()));
ok('aucune erreur JS', errs.length === 0, J(errs));
process.exit(0);
