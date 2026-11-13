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
// Thèmes gagnés : le choix du joueur n'est jamais écrasé par l'événement, les textes suivent le thème, les cadres s'affichent. Captures dans le dossier de travail.
const SHT = process.env.SHOTS || '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/themes/';
await import('node:fs').then(f => f.mkdirSync(SHT, { recursive: true }));
const mkT = async (token, init = {}) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' }); await c.addInitScript(([tok, kv]) => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, [token, init]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
await DB.prepare("UPDATE users SET coins = 2000 WHERE name = 'Bob'").run();
await call(B, 'POST', '/api/daily/claim', {}); await call(A, 'POST', '/api/daily/claim', {});
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/commu/join', {});
const bobId = +(await DB.prepare("SELECT id FROM users WHERE name = 'Bob'").all()).results[0].id;
await DB.prepare("UPDATE plan_progress SET perks = ? WHERE user_id = ?").bind(JSON.stringify(['theme_urss', 'theme_siberie', 'theme_or', 'frame_star', 'frame_hammer', 'frame_gold', 'gold_outline']), bobId).run();
const th = p => p.evaluate(() => document.documentElement.dataset.theme);

await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
const DAY = 9;
let p = await mkT(A, { wm_noel_day: String(DAY), wm_ussr_ui: '0' });
await p.evaluate(async () => { await refreshMe(); tab = 'noelcal'; await render(); }); await p.waitForSelector('#sg-open', { timeout: 8000 });
ok('calendrier : bouton Tir au patron', /Niveau 9/.test(await p.textContent('.nl-game')));
await p.screenshot({ path: SHT + 'snow-0-calendrier.png' });
await p.click('#sg-open'); await p.waitForSelector('#sg-go', { timeout: 8000 });
ok('intro : 3 essais restants', /3\s+essais/.test(await p.textContent('.sg-panel')));
await p.screenshot({ path: SHT + 'snow-1-intro.png' });
await p.click('#sg-go'); await p.waitForSelector('#sg-c', { timeout: 8000 }); await p.waitForTimeout(400);
// un vecteur gagnant pour la première boule (même physique que le serveur)
const win = await p.evaluate(n => { const P = SnowPhys, lv = P.level(n); for (let px = 20; px <= 100; px++) for (let py = 0; py <= 100; py++) { if (px * px + py * py > 1e4) continue; const r = P.throwBall(lv, { hp: lv.targets.map(t => t.hp) }, 0, px, py); if (r.down) return [px, py]; } return null; }, DAY);
ok('vecteur gagnant trouvé', !!win, J(win));
const shoot = async (v, hold) => {
  const b = await (await p.$('#sg-c')).boundingBox(), W = 160, GH = 6, Hh = 100 + GH;
  const wx = 14 - v[0] / 1.6, wy = 9 - v[1] / 1.6, sx = b.x + wx / W * b.width, sy = b.y + b.height - (wy + GH) / Hh * b.height;
  const lx = b.x + 14 / W * b.width, ly = b.y + b.height - (9 + GH) / Hh * b.height;
  await p.mouse.move(lx, ly); await p.mouse.down(); await p.mouse.move(sx, sy, { steps: 6 });
  if (hold) { await p.waitForTimeout(150); await p.screenshot({ path: SHT + hold }); }
  await p.mouse.up();
};
await shoot(win, 'snow-2-visee.png');
await p.waitForFunction(() => /Boules : 4/.test(document.querySelector('#sg-balls').textContent), null, { timeout: 8000 });
await p.waitForTimeout(2500);
ok('première boule : cible tombée, score affiché', /^[1-9]/.test(await p.textContent('#sg-score')) && /\S/.test(await p.textContent('#sg-msg')), await p.textContent('#sg-msg'));
await p.screenshot({ path: SHT + 'snow-3-touche.png' });
for (let k = 0; k < 4; k++) { await shoot([30 + k * 5, 40], null); await p.waitForTimeout(2300); }
await p.waitForSelector('.sg-panel .nl-bignum', { timeout: 12000 });
const sc = +(await p.textContent('.sg-panel .nl-bignum'));
ok('bilan : score du serveur', sc >= 90, String(sc));
ok('bilan : flocons gagnés', /\+\d+\s*flocons/.test(await p.textContent('.sg-panel')), await p.textContent('.sg-panel .nl-chips'));
await p.screenshot({ path: SHT + 'snow-4-bilan.png' });
ok('rejouer proposé (2 essais restants)', /2 essais/.test(await p.textContent('#sg-again')));
await p.click('#sg-quit'); await p.waitForSelector('.nl-grid', { timeout: 8000 });
ok('aucune erreur JS', p.errs.length === 0, J(p.errs));
process.exit(0);
