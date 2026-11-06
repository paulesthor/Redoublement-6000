// Habillage URSS complet de l'interface (aperçu admin). Test d'interface (Playwright), hors de all.mjs.
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

let p = await mk(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
const navLabels = async () => p.$$eval('nav button em', es => es.map(e => e.textContent.trim()));
const before = await navLabels(); ok('avant : menus d\'origine', before.includes('Boosters') && before.includes('Collection'), JSON.stringify(before));
await p.evaluate(() => { tab = 'settings'; render(); }); await p.waitForSelector('#st-ussrui', { timeout: 8000 });
await p.click('#st-ussrui'); await p.waitForTimeout(1500);
ok('thème rouge appliqué', await p.evaluate(() => document.documentElement.dataset.theme === 'urss' && document.body.classList.contains('ussr-ui')));
const after = await navLabels(); ok('menus renommés (Distribution, Archives, Marché noir, Pravda…)', after.includes('Distribution') && after.includes('Archives') && after.includes('Marché noir') && after.includes('Pravda'), JSON.stringify(after));
ok('bandeau Pravda affiché', await p.isVisible('.us-news') && (await p.textContent('.us-news b')) === 'ПРАВДА');
ok('titre de la page traduit', (await p.textContent('.pagehead h1')).includes('Règlement intérieur'), await p.textContent('.pagehead h1'));
await p.screenshot({ path: '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/pt/skin-settings.png' });
const goto = async (t, shot) => { await p.evaluate(x => { tab = x; render(); }, t); await p.waitForTimeout(1200); await p.screenshot({ path: `/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/pt/skin-${shot}.png` }); };
await goto('packs', 'packs'); ok('accueil : colis à la place du paquet noir', await p.$('.us-home .us-svg') !== null);
ok('accueil : boutons renommés', (await p.textContent('#open')).includes('colis'), await p.textContent('#open'));
await goto('album', 'archives'); await goto('market', 'marche'); await goto('feed', 'pravda'); await goto('duel', 'front'); await goto('rank', 'honneur');
await p.evaluate(() => moreSheet()); await p.waitForSelector('.moresheet'); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/pt/skin-plan.png' });
ok('menu Plan : tuiles renommées', (await p.textContent('.moresheet')).includes('Dossier personnel') || (await p.textContent('.moresheet')).includes('Décorations'));
await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
// retour : l'habillage se coupe et les textes d'origine reviennent
await p.evaluate(() => { tab = 'settings'; render(); }); await p.waitForSelector('#st-ussrui'); await p.click('#st-ussrui'); await p.waitForTimeout(1500);
const back = await navLabels(); ok('désactivé : menus d\'origine retrouvés', back.includes('Boosters') && back.includes('Collection'), JSON.stringify(back));
ok('thème d\'origine rétabli', await p.evaluate(() => document.documentElement.dataset.theme !== 'urss' && !document.body.classList.contains('ussr-ui')));
ok('aucune erreur JavaScript', errs.length === 0, J(errs));
process.exit(0);
