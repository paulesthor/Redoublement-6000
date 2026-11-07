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
const SH = '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/';
const p = await mk(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); await syncUssrUi(); tab = 'duel'; render(); });
await p.waitForSelector('[data-jeu=tsar]'); await p.click('[data-jeu=tsar]'); await p.waitForSelector('.ts-card', { timeout: 8000 }); await p.waitForTimeout(700);
await p.screenshot({ path: SH + 'tsar-1.png' });
const box = await (await p.$('.ts-card')).boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 70, cy + 6, { steps: 6 }); await p.waitForTimeout(250);
await p.screenshot({ path: SH + 'tsar-2-glisse.png' });
ok('glissement : étiquette du choix visible', await p.evaluate(() => +getComputedStyle(document.querySelector('#ts-chr')).opacity > 0.3));
await p.mouse.up(); await p.waitForTimeout(250);
ok('relâché trop tôt : la carte revient', await p.evaluate(() => !!document.querySelector('.ts-card')));
let turns = 0;
for (let i = 0; i < 40 && !(await p.$('.ts-end')); i++) {
  const b = await (await p.$('.ts-card')).boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + (i % 3 ? 160 : -160), y + 10, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(900); turns++;
}
ok('une partie va jusqu\'à une fin', !!(await p.$('.ts-end')), 'tours ' + turns);
await p.screenshot({ path: SH + 'tsar-3-fin.png' });
ok('fin : titre, tampon et compteur', (await p.textContent('.ts-end')).includes('fins découvertes'));
for (const k of ['samovar', 'train', 'bear', 'a1', 'f1']) { await p.evaluate(k2 => window.__tsar.forceEnd(k2), k); await p.waitForTimeout(150); ok('fin ' + k, !!(await p.$('.ts-end h2'))); }
await p.evaluate(() => window.__tsar.forceEnd('samovar')); await p.waitForTimeout(900); await p.screenshot({ path: SH + 'tsar-4-samovar.png' });
await p.click('#ts-again'); await p.waitForSelector('.ts-card'); ok('rejouer', true);
const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: document.documentElement.clientWidth }));
ok('pas de défilement horizontal', o.sw <= o.W, J(o));
ok('aucune erreur JS', errs.length === 0, J(errs));
process.exit(0);
