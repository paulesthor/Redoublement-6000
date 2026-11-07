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
const hy = () => p.evaluate(() => window.UssrSkin?.hymnState?.());
const mu = () => p.evaluate(() => window.__tsar?.music?.() || null);
for (const f of ['tsar-usa.mp3', 'tsar-hardbass.mp3', 'ussr-hymne.mp3']) ok('fichier audio servi : ' + f, await p.evaluate(async u => { const r = await fetch(u); return r.ok && (await r.arrayBuffer()).byteLength > 200000; }, f));
await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); setPref('wm_sound', '1'); setPref('wm_hymn', '1'); await syncUssrUi(); tab = 'duel'; render(); });
await p.waitForSelector('[data-jeu=tsar]'); await p.mouse.click(195, 300); await p.waitForTimeout(1500);
ok('avant le jeu : l\'hymne de l\'URSS joue', (await hy())?.enLecture === true, J(await hy()));
await p.click('[data-jeu=tsar]'); await p.waitForSelector('#ts-go', { timeout: 8000 }); await p.waitForTimeout(600);
ok('pendant le Dernier Tsar : l\'hymne de l\'URSS est coupé', (await hy())?.enLecture === false, J(await hy()));
await p.click('#ts-go'); await p.waitForSelector('#ts-r', { timeout: 15000 });
await p.evaluate(() => { const real = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => real(fn, (ms || 0) * 0.2, ...a); });
await p.evaluate(() => window.__tsar.forceEnd('capi')); await p.waitForTimeout(1500);
const m1 = await mu(); ok('fin fast-food : l\'hymne américain joue', m1?.src === 'tsar-usa.mp3' && m1.playing, J(m1));
await p.waitForSelector('.ts-panel.end', { timeout: 30000 }); await p.click('#ts-again'); await p.waitForTimeout(500);
ok('rejouer : la musique s\'arrête', (await mu()) === null, J(await mu()));
await p.evaluate(() => window.__tsar.forceEnd('rave')); await p.waitForTimeout(1500);
const m2 = await mu(); ok('fin hardbass : la techno joue', m2?.src === 'tsar-hardbass.mp3' && m2.playing, J(m2));
await p.waitForSelector('.ts-panel.end', { timeout: 30000 }); await p.click('#ts-quit'); await p.waitForTimeout(1200);
ok('après le jeu : l\'hymne de l\'URSS reprend', (await hy())?.enLecture === true, J(await hy()));
ok('aucune erreur JS', errs.length === 0, J(errs));
process.exit(0);
