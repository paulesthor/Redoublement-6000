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
const rs = ['common', 'uncommon', 'rare', 'super', 'ultra', 'legendary'];
const aid = (await DB.prepare("SELECT id FROM users WHERE name = 'Bob'").all()).results[0].id;
const before = +(await DB.prepare("SELECT COUNT(*) n FROM auctions WHERE status = 'open'").all()).results[0].n, T = before + 75;
const maxPrice = 10 + 75;
for (let i = 1; i <= 75; i++) { await DB.prepare("INSERT INTO cards (id, title, rarity, views) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING").bind(7000000 + i, 'Carte ' + (i % 7 === 0 ? 'Loup ' : '') + i, rs[i % 6], 100 + i).run(); await DB.prepare("INSERT INTO auctions (seller_id, card_id, start_price, bid, ends_at, status) VALUES (?, ?, ?, 0, ?, 'open')").bind(aid, 7000000 + i, 10 + i, Date.now() + (i + 5) * 3600000).run(); }
const p = await mk(390, 844); await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
await p.evaluate(async () => { tab = 'market'; await render(); }); await p.waitForSelector('#lots .lot', { timeout: 10000 });
let n = (await p.$$('#lots .lot')).length; ok('première page : 30 enchères seulement (sur beaucoup plus)', n === 30, n);
ok('titre : le total des enchères est annoncé', new RegExp(T + ' enchère').test(await p.textContent('#view')), T);
await p.click('#mk-more'); await p.waitForTimeout(1200); n = (await p.$$('#lots .lot')).length; ok('« Voir plus » : 60 enchères', n === 60, n);
while (await p.$('#mk-more')) { await p.click('#mk-more'); await p.waitForTimeout(900); }
n = (await p.$$('#lots .lot')).length; ok('en continuant : toutes les enchères, plus de bouton', n === T, n + ' / ' + T);
await p.fill('#mk-q', 'Loup'); await p.waitForTimeout(1500); n = (await p.$$('#lots .lot')).length; ok('recherche « Loup » faite par le serveur (10 résultats)', n === 10, n);
await p.fill('#mk-q', ''); await p.selectOption('#mk-s', 'down'); await p.waitForTimeout(1500);
const firstPrice = await p.$eval('#lots .lot .price', e => +e.textContent.replace(/\D/g, '')); ok('tri « prix décroissant » : le plus cher en premier', firstPrice >= maxPrice, firstPrice);
await p.click('#mk-c [data-f=legendary]'); await p.waitForTimeout(1500); n = (await p.$$('#lots .lot')).length; ok('filtre légendaires : seulement des légendaires', n > 0 && n <= 13 && (await p.$$eval('#lots .lot .rar', e => e.every(x => x.classList.contains('legendary')))), n);
await p.click('#lots .lot [data-lot]'); await p.waitForSelector('.detail', { timeout: 6000 }); ok('ouvrir une enchère hors première page fonctionne (chargée par identifiant)', !!(await p.$('#bid-v')));
await p.screenshot({ path: SH + 'market-ui.png' });
process.exit(0);
