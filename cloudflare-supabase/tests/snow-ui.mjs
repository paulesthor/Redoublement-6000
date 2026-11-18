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
const mk = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_news_nui', '1'); if (localStorage.getItem('wm_nui_off') === null) localStorage.setItem('wm_nui_off', '1'); localStorage.setItem('wm_push_ask', '1'); if (!localStorage.getItem('wm_seen_ver')) localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900); return p; };
// Thèmes gagnés : le choix du joueur n'est jamais écrasé par l'événement, les textes suivent le thème, les cadres s'affichent. Captures dans le dossier de travail.
const SHT = process.env.SHOTS || '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/themes/';
await import('node:fs').then(f => f.mkdirSync(SHT, { recursive: true }));
const mkT = async (token, init = {}) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' }); await c.addInitScript(([tok, kv]) => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_news_nui', '1'); if (localStorage.getItem('wm_nui_off') === null) localStorage.setItem('wm_nui_off', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, [token, init]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
await DB.prepare("UPDATE users SET coins = 2000 WHERE name = 'Bob'").run();
await call(B, 'POST', '/api/daily/claim', {}); await call(A, 'POST', '/api/daily/claim', {});
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/commu/join', {});
const bobId = +(await DB.prepare("SELECT id FROM users WHERE name = 'Bob'").all()).results[0].id;
await DB.prepare("UPDATE plan_progress SET perks = ? WHERE user_id = ?").bind(JSON.stringify(['theme_urss', 'theme_siberie', 'theme_or', 'frame_star', 'frame_hammer', 'frame_gold', 'gold_outline']), bobId).run();
const th = p => p.evaluate(() => document.documentElement.dataset.theme);

await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
const DAY = +(process.env.SNOWDAY || 9);
let p = await mkT(A, { wm_noel_day: String(DAY), wm_ussr_ui: '0' });
await p.evaluate(async () => { await refreshMe(); tab = 'noelcal'; await render(); }); await p.waitForSelector('#sg-open', { timeout: 8000 });
await p.click('#sg-open'); await p.waitForSelector('#sg-go', { timeout: 8000 });
ok('intro : 3 essais restants', /3\s+essais/.test(await p.textContent('.sg-card')));
await p.screenshot({ path: SHT + 'snow-1-intro.png' });
// meilleur vecteur gagnant pour une boule donnée (même physique que le serveur)
const winFor = (k, hpArr) => p.evaluate(([n, k, hpArr]) => { const P = SnowPhys, lv = P.level(n); let best = null; for (let px = 14; px <= 100; px += 1) for (let py = -20; py <= 100; py += 1) { if (px * px + py * py > 1e4) continue; const r = P.throwBall(lv, { hp: hpArr.slice() }, k, px, py); if (r.down) return [px, py]; } return best; }, [DAY, k, hpArr]);
const getHp = () => p.evaluate(n => SnowPhys.level(n).targets.map(t => t.hp), DAY);
const shoot = async (v, hold) => {
  const { a, d } = await p.evaluate(v => { const c = SnowGame.cur; return { a: c.anchor(), d: c.delta(v) }; }, v);
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(a[0] + d[0], a[1] + d[1], { steps: 8 });
  if (hold) { await p.waitForTimeout(250); await p.screenshot({ path: SHT + hold }); }
  await p.mouse.up();
};
const ballsLeft = () => p.evaluate(() => 0);
async function playAttempt(tag, shots, pre = 'snow') {
  await p.click('#sg-go'); await p.waitForTimeout(900);
  const hp = await getHp(); const win = await winFor(0, hp); ok(tag + ' : vecteur gagnant trouvé', !!win, J(win));
  await shoot(win, shots ? pre + '-2-visee.png' : null);
  await p.waitForTimeout(shots ? 1200 : 3000); if (shots) await p.screenshot({ path: SHT + pre + '-3-vol.png' });
  await p.waitForTimeout(2600); if (shots) await p.screenshot({ path: SHT + pre + '-4-touche.png' });
  for (let k = 0; k < 4; k++) { await p.waitForTimeout(700); await shoot([32 + k * 6, 38 + k * 4], null); await p.waitForTimeout(3600); }
  await p.waitForSelector('.sg-score', { timeout: 15000 });
  await p.waitForTimeout(1500);
}
await playAttempt('portrait (écran pivoté)', true);
const sc = +(await p.textContent('#sg-sc')); ok('bilan : score du serveur', sc >= 90, String(sc));
ok('bilan : flocons gagnés', /\+\d+\s*flocons/.test(await p.textContent('.sg-card')));
await p.screenshot({ path: SHT + 'snow-5-bilan.png' });
// deuxième essai en vrai paysage
await p.click('#sg-again'); await p.waitForSelector('#sg-go');
await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(500);
await playAttempt('paysage', true, 'land'); await p.screenshot({ path: SHT + 'land-5-bilan.png' });
ok('rejouer proposé (1 essai restant)', /1 essai/.test(await p.textContent('#sg-again')));
await p.click('#sg-quit'); await p.waitForSelector('.nl-grid', { timeout: 8000 });
ok('aucune erreur JS', p.errs.length === 0, J(p.errs));
process.exit(0);
