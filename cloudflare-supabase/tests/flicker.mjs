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
const mkF = async token => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '1'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, token); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
await DB.prepare("UPDATE users SET coins = 1000 WHERE name = 'Bob'").run();
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/commu/join', {});
await DB.prepare("UPDATE plan_progress SET packs = 3 WHERE user_id = (SELECT id FROM users WHERE name = 'Bob')").run();
await DB.prepare("INSERT INTO event_progress (key, user_id, n) VALUES ('cm:packts', (SELECT id FROM users WHERE name = 'Bob'), 0) ON CONFLICT (key, user_id) DO UPDATE SET n = ?").bind(Math.floor(Date.now() / 1000) - 585).run();
const pb = await mkF(B);
await pb.evaluate(async () => { await loadCommu(true); await syncUssrUi(); tab = 'packs'; await render(); }); await pb.waitForTimeout(1500);
const rep = await pb.evaluate(() => new Promise(res => {
  const log = { view: 0, body: 0, me: 0, pack: 0, cls: [] }; const v = document.querySelector('#view');
  new MutationObserver(m => { for (const x of m) if (x.type === 'childList' && x.target === v) log.view++; }).observe(v, { childList: true });
  new MutationObserver(m => { for (const x of m) if (x.type === 'childList' && x.target === document.querySelector('#me')) log.me++; }).observe(document.querySelector('#me'), { childList: true });
  new MutationObserver(m => { for (const x of m) if (x.type === 'attributes') log.cls.push(x.target.tagName + '.' + (x.target.id || x.target.className?.baseVal || x.target.className) + ':' + x.attributeName); }).observe(document.body, { attributes: true, subtree: false });
  const t0 = performance.now(), rr = window.render; let renders = 0; const orig = window.render; 
  setTimeout(() => res({ ...log, cls: [...new Set(log.cls)].slice(0, 10), secs: Math.round((performance.now() - t0) / 1000) }), 25000);
}));
console.log('FLICKER', JSON.stringify(rep));
ok('accueil : pas de réaffichage en boucle (1 à 3 réaffichages en 25 s : le colis offert qui arrive, puis plus rien)', rep.view >= 1 && rep.view <= 3, JSON.stringify(rep));
process.exit(0);
