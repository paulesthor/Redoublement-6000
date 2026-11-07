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
const p = await mk(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); await syncUssrUi(); tab = 'duel'; render(); });
await p.waitForSelector('[data-jeu=tsar]'); await p.click('[data-jeu=tsar]'); await p.waitForSelector('.ts-actor', { timeout: 8000 }); await p.waitForTimeout(700);
await p.screenshot({ path: SH + 'tsar-1-marche.png' });
await p.waitForSelector('.ts-choices button', { timeout: 8000 }); await p.waitForTimeout(400);
await p.screenshot({ path: SH + 'tsar-2-dialogue.png' });
ok('le visiteur est arrivé et les choix sont affichés', (await p.$$('.ts-choices button')).length === 2);
ok('décor : coffre, tableau, portrait, fenêtre, joueur et tsar', await p.evaluate(() => ['#ts-chest svg', '#ts-board', '#ts-portrait svg', '#ts-win', '.ts-actor.player', '.ts-actor.tsar'].every(s => document.querySelector(s))));
let acted = false;
for (let i = 0; i < 60 && !(await p.$('.ts-panel.end')); i++) {
  await p.waitForSelector('.ts-choices button', { timeout: 15000 }).catch(() => {});
  if (await p.$('.ts-panel.end')) break;
  const btn = i % 3 ? '#ts-r' : '#ts-l';
  await p.click(btn, { timeout: 5000 }).catch(() => {});
  if (!acted && i === 0) { await p.waitForTimeout(700); await p.screenshot({ path: SH + 'tsar-3-action.png' }); acted = true; }
  await p.waitForTimeout(2600);
}
ok('une partie va jusqu\'à une fin avec bilan', !!(await p.$('.ts-panel.end')), J(await p.evaluate(() => window.__tsar.state())));
await p.screenshot({ path: SH + 'tsar-4-fin.png' });
for (const k of ['samovar', 'train', 'bear', 'c0', 'f0', 'd1', 'f1']) {
  await p.evaluate(() => document.querySelector('#ts-again')?.click()); await p.waitForTimeout(500);
  await p.evaluate(key => window.__tsar.forceEnd(key), k); await p.waitForTimeout(k === 'bear' ? 2900 : k === 'samovar' ? 3400 : 2400);
  await p.screenshot({ path: SH + `tsar-fin-${k}.png` });
  await p.waitForSelector('.ts-panel.end', { timeout: 12000 }).catch(() => {});
  ok('scène de fin ' + k, !!(await p.$('.ts-panel.end h2')));
}
await p.evaluate(() => document.querySelector('#ts-again')?.click()); await p.waitForSelector('.ts-choices button', { timeout: 8000 }); ok('rejouer', true);
const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: document.documentElement.clientWidth }));
ok('pas de défilement horizontal', o.sw <= o.W, J(o));
ok('aucune erreur JS', errs.length === 0, J(errs));
process.exit(0);
