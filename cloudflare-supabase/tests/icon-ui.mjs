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
const SHD = '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/';
const p = await mk(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
const icons = () => p.evaluate(() => ({ fav: document.querySelector('link[rel="icon"][sizes="48x48"]').getAttribute('href'), apple: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), ico: document.querySelector('link[rel="icon"][sizes="32x32"]').getAttribute('href') }));
const before = await icons();
ok('avant : icône d\'origine', before.apple === 'apple-touch-icon.png' && before.fav === 'favicon-48.png', J(before));
await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); await syncUssrUi(); }); await p.waitForTimeout(800);
const on = await icons();
ok('événement : icône de l\'ouvrier à toque', on.apple === 'ussr-icon-180.png' && on.fav === 'ussr-icon-48.png' && on.ico === 'ussr-icon-48.png', J(on));
ok('les fichiers d\'icône et la page d\'installation existent', await p.evaluate(async () => (await Promise.all(['ussr-icon-180.png', 'ussr-icon-48.png', 'install.html', 'manifest-evenement.webmanifest'].map(u => fetch(u).then(r => r.ok)))).every(Boolean)));
const inst = await p.evaluate(async () => { const t = await (await fetch('install.html')).text(); const mf = await (await fetch('manifest-evenement.webmanifest')).json(); return { apple: /rel="apple-touch-icon" href="ussr-icon-180.png"/.test(t), mf: mf.icons.every(i => i.src.startsWith('ussr-icon')), start: mf.start_url, redirect: /location\.replace\('\/'\)/.test(t) }; });
ok('page d\'installation : icône d\'événement, manifeste, redirection une fois installée', inst.apple && inst.mf && inst.start === '/' && inst.redirect, J(inst));
await p.evaluate(() => { tab = 'settings'; render(); }); await p.waitForSelector('#st-iconsheet'); await p.click('#st-iconsheet'); await p.waitForSelector('.iconsheet'); await p.waitForTimeout(500);
ok('écran nouvelle icône : bouton vers Safari', await p.evaluate(() => document.querySelector('#ic-go').getAttribute('href') === 'x-safari-https://wikimasters.clodowiki.workers.dev/install.html'));
await p.screenshot({ path: SHD + 'icon-sheet.png' });
await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
await p.evaluate(async () => { setPref('wm_ussr_ui', '0'); setPref('wm_ussr', '0'); setPref('wm_theme', 'dark'); await syncUssrUi(); }); await p.waitForTimeout(800);
const after = await icons();
ok('après : icône d\'origine rétablie', J(after) === J(before), J(after));
ok('aucune erreur JS', errs.length === 0, J(errs));
process.exit(0);
