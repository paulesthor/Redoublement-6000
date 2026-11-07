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
const SHT = '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/';
const p = await mk(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); setPref('wm_sound', '0'); await syncUssrUi(); await loadUssr(); });
const run = ussr => p.evaluate(async u => {
  const order = ['common', 'uncommon', 'rare', 'super', 'ultra', 'legendary', 'common', 'rare', 'ultra', 'legendary'];
  const packs = order.map((best, k) => Array.from({ length: 10 }, (_, i) => ({ id: k * 100 + i, title: 'Fiche ' + (k * 10 + i), rarity: i === 0 ? best : 'common', image: null, atk: 10, def: 10, shiny: 0, isNew: i < 2 })));
  window.__tenDone = playTen(Promise.resolve(packs), { ussr: u, labels: u ? ussrLabels() : RAR, rank: RANK, fmt, cardHtml, again: () => ({ ok: true, label: 'Ouvrir 10 autres' }) });
  return true;
}, ussr);
await run(true); await p.waitForSelector('#reveal.r-ten.ussr', { timeout: 5000 }); await p.waitForTimeout(500);
await p.screenshot({ path: SHT + 'ten-1-camion.png' });
ok('×10 URSS : le camion du Parti arrive', await p.evaluate(() => !!document.querySelector('.tn-truck svg') && document.querySelector('.tn-head b').textContent.includes('Livraison')));
await p.waitForTimeout(2300); await p.screenshot({ path: SHT + 'ten-2-dechargement.png' });
await p.waitForFunction(() => document.querySelector('.tn-row.show') && [...document.querySelectorAll('.tn-pack')].every(e => e.classList.contains('lit')), null, { timeout: 25000 });
await p.waitForTimeout(600); await p.screenshot({ path: SHT + 'ten-3-ligne.png' });
const shapes = await p.evaluate(() => [...document.querySelectorAll('.tn-pack .tn-art')].map(a => a.innerHTML.includes('#b08457') ? 'colis' : a.innerHTML.includes('#7d858d') ? 'dossier' : 'matriochka'));
ok('chaque colis a la forme de sa meilleure carte (colis, dossier, matriochka)', shapes.includes('colis') && shapes.includes('dossier') && shapes.includes('matriochka'), J(shapes));
await p.click('.tn-pack[data-i="5"]'); await p.waitForSelector('.tn-ustamp', { timeout: 6000 }); await p.waitForTimeout(900); await p.screenshot({ path: SHT + 'ten-4-ouverture.png' });
ok('ouverture d\'un colis : tampon ПРИНЯТО et fiche affichée', !!(await p.$('.tn-card')) && (await p.textContent('.tn-ustamp')).includes('ПРИНЯТО'));
await p.click('.tn-skip'); await p.waitForSelector('.sum', { timeout: 6000 }); await p.screenshot({ path: SHT + 'ten-5-resume.png' });
ok('résumé : « 10 colis distribués » avec les grades du Parti', (await p.textContent('.sum h2')).includes('10 colis') && /Maréchal|Général|Soldat/.test(await p.textContent('.tn-count')));
await p.click('.finish'); await p.waitForTimeout(500);
ok('l\'animation se ferme proprement', !(await p.$('#reveal')));
// la version classique n'est pas touchée
await run(false); await p.waitForSelector('#reveal.r-ten:not(.ussr)', { timeout: 5000 }); await p.waitForTimeout(400);
ok('hors événement : l\'animation ×10 classique reste inchangée', !(await p.$('.tn-truck')) && (await p.textContent('.tn-head b')).includes('10 paquets'));
await p.evaluate(() => document.querySelector('#reveal')?.remove());
ok('aucune erreur JS', errs.length === 0, J(errs));
process.exit(0);
