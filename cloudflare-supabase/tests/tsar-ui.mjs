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
await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); setPref('wm_sound', '0'); await syncUssrUi(); tab = 'duel'; render(); });
await p.waitForSelector('[data-jeu=tsar]'); await p.click('[data-jeu=tsar]'); await p.waitForSelector('.ts-actor', { timeout: 8000 }); await p.waitForSelector('#ts-go', { timeout: 8000 });
await p.screenshot({ path: SH + 'tsar-0-briefing.png' });
ok('briefing : objectif, 3 étapes et bouton', (await p.textContent('.ts-panel')).includes('Prendre la place du tsar') && (await p.$$('.ts-brief li')).length === 3);
ok('bandeau des 3 pistes (Samovar, Train, Ours)', (await p.$$('.ts-route')).length === 3);
ok('décor détaillé : lustre, bougies, aigle, tapis, chat, gardes', await p.evaluate(() => ['.ts-chand', '.ts-candle', '.ts-eagle', '.ts-cat', '.ts-actor.guard', '.ts-snow', '.ts-clock'].every(s => document.querySelector(s))));
await p.click('#ts-go'); await p.waitForSelector('.ts-choices button', { timeout: 8000 }); await p.waitForTimeout(400);
await p.screenshot({ path: SH + 'tsar-2-dialogue.png' });
ok('le visiteur est arrivé, choix et étiquettes affichés', (await p.$$('.ts-choices button')).length === 2);
// piste prête → la fenêtre de tir est proposée avec ses chances
await p.evaluate(() => { const S = window.__tsar.state(); S.flags.poison = true; S.flags.access = true; S.day = 4; });
await p.click('#ts-l'); await p.waitForSelector('.ts-choices button', { timeout: 15000 }); await p.waitForTimeout(500);
ok('carte finale : « Chances » affichées', /Chances : \d+ %/.test(await p.textContent('#ts-r')), await p.textContent('.ts-panel'));
await p.screenshot({ path: SH + 'tsar-3-signal.png' });
let acted = false;
for (let i = 0; i < 60 && !(await p.$('.ts-panel.end')); i++) {
  await p.waitForSelector('.ts-choices button', { timeout: 15000 }).catch(() => {});
  if (await p.$('.ts-panel.end')) break;
  await p.click(i % 3 ? '#ts-r' : '#ts-l', { timeout: 5000 }).catch(() => {});
  if (!acted) { await p.waitForTimeout(700); await p.screenshot({ path: SH + 'tsar-3-action.png' }); acted = true; }
  await p.waitForTimeout(2800);
}
ok('une partie va jusqu\'à une fin avec bilan', !!(await p.$('.ts-panel.end')), J(await p.evaluate(() => window.__tsar.state())));
await p.screenshot({ path: SH + 'tsar-4-fin.png' });
for (const k of ['samovar', 'x_samovar', 'train', 'x_train', 'bear', 'x_bear', 'late', 'rave', 'capi', 'c0', 'f0', 'd1', 'f1']) {
  await p.evaluate(() => document.querySelector('#ts-again')?.click()); await p.waitForTimeout(500);
  await p.evaluate(key => window.__tsar.forceEnd(key), k); await p.waitForTimeout((k === 'rave' || k === 'capi') ? 3200 : 2600);
  await p.screenshot({ path: SH + `tsar-fin-${k}.png` });
  await p.waitForSelector('.ts-panel.end', { timeout: 14000 }).catch(() => {});
  ok('scène de fin ' + k, !!(await p.$('.ts-panel.end h2')));
}
await p.evaluate(() => document.querySelector('#ts-again')?.click()); await p.waitForSelector('#ts-go', { timeout: 8000 }); ok('rejouer : retour au briefing', true);
const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: document.documentElement.clientWidth }));
ok('pas de défilement horizontal', o.sw <= o.W, J(o));
ok('aucune erreur JS', errs.length === 0, J(errs));
process.exit(0);
