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
const mkP = async token => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, token); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
for (const n of ['Carole', 'Dimitri', 'Eva']) { await call(null, 'POST', '/api/register', { name: n, password: 'secret3' }); }
await DB.prepare("UPDATE users SET coins = 1000 WHERE name = 'Bob'").run();
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/commu/join', {});
await DB.prepare("UPDATE users SET coins = 1000 WHERE name IN ('Carole','Dimitri','Eva')").run();
for (const n of ['Carole', 'Dimitri', 'Eva']) { const [, lg] = await call(null, 'POST', '/api/login', { name: n, password: 'secret3' }); await call(lg.token, 'POST', '/api/commu/join', {}); }
await DB.prepare("UPDATE plan_progress SET earned = 500, earn_ts = 1 WHERE user_id = (SELECT id FROM users WHERE name = 'Carole')").run();
await DB.prepare("UPDATE plan_progress SET earned = 300, earn_ts = 2 WHERE user_id = (SELECT id FROM users WHERE name = 'Dimitri')").run();
await DB.prepare("UPDATE plan_progress SET earned = 100, earn_ts = 3 WHERE user_id = (SELECT id FROM users WHERE name = 'Bob')").run();
await DB.prepare("UPDATE plan_progress SET earned = 50, earn_ts = 4 WHERE user_id = (SELECT id FROM users WHERE name = 'Eva')").run();
const pb = await mkP(B);
await pb.evaluate(async () => { tab = 'rank'; await render(); }); await pb.waitForTimeout(1200);
ok('podium : 3 marches, le 1er avec le ruban Staline', (await pb.$$('.podium .pd')).length === 3 && !!(await pb.$('.pd1 .pd-rib')));
ok('le reste du tableau liste les autres joueurs avec leurs points de Plan', (await pb.$$('.list .item')).length === 1 && /Eva/.test(await pb.textContent('.list')) && /paliers/.test(await pb.textContent('.list')));
ok('podium : la cagnotte et « le premier la remporte » sont affichés', /remporte la cagnotte/.test(await pb.textContent('.pd-pot')));
await pb.evaluate(async () => { tab = 'commutop'; await render(); }); await pb.waitForTimeout(1000); ok('classement général : précise que le premier remporte la cagnotte', /remporte toute la cagnotte/.test(await pb.textContent('#view')));
await pb.evaluate(async () => { tab = 'rank'; await render(); }); await pb.waitForTimeout(800);
const names = await pb.$$eval('.podium .pd', e => e.map(x => x.querySelector('.pd-nm').textContent + ' ' + x.querySelector('.pd-sc').textContent));
ok('podium : classement sur le score de l\'événement (Carole 500, Dimitri 300, Bob 100), pas sur le compte', names.some(x => /Carole 500 pts/.test(x)) && names.some(x => /Dimitri 300 pts/.test(x)) && names.some(x => /Bob 100 pts/.test(x)) && !names.some(x => /Alice/.test(x)), J(names));
const box = await pb.$eval('.podium', e => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; }); ok('podium dans l\'écran', box);
await pb.screenshot({ path: '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/podium.png' });
ok('aucune erreur JS', pb.errs.length === 0, J(pb.errs));
process.exit(0);
