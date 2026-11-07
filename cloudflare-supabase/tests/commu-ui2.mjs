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
// Événement ouvert en test réel pour l'administrateur : vraie inscription, pages, jeux, colis, Archives, classement, règlement.
const mkAs2 = async (token, w = 390, h = 844) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); if (!localStorage.getItem('wm_seen_ver')) localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, token); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
const SHP = '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/';
await DB.prepare('UPDATE users SET coins = 1000 WHERE name IN (?, ?)').bind('Alice', 'Bob').run();
const coinsOf = async n => +(await DB.prepare('SELECT coins c FROM users WHERE name = ?').bind(n).all()).results[0].c;
// 1. ouvert en test : Bob ne voit rien, Alice voit le bandeau
await call(A, 'POST', '/api/commu/set', { on: true });
let pb = await mkAs2(B); ok('test réel : un joueur ordinaire ne voit aucun bandeau', !(await pb.$('#commu-join'))); await pb.context().close();
let pa = await mkAs2(A); await pa.waitForTimeout(800);
ok('test réel : l\'administrateur voit le bandeau d\'inscription', !!(await pa.$('#commu-join')));
await pa.click('#commu-join'); await pa.waitForSelector('#cs-rules'); await pa.click('#cs-rules'); await pa.waitForSelector('.rules', { timeout: 8000 }); await pa.waitForTimeout(500);
const rulesTxt = await pa.textContent('#view');
ok('règlement du Parti : taxe, ₽ de départ, plafonds, colis, paliers, Staline, ton du Parti', ['300 wikibidou', '500 ₽', '150 fiches', '12 paliers', 'Staline', 'camarade'].every(t => rulesTxt.includes(t)), rulesTxt.slice(0, 140));
await pa.screenshot({ path: SHP + 'commu2-1-reglement.png' });
await pa.click('#ru-join'); await pa.waitForSelector('#cm-join'); await pa.click('#cm-join'); await pa.waitForTimeout(2200);
ok('inscription réelle de l\'administrateur : 300 wikibidou prélevés', await coinsOf('Alice') === 700, await coinsOf('Alice'));
ok('thème rouge et 4 onglets', await pa.evaluate(() => document.documentElement.dataset.theme === 'urss' && [...document.querySelectorAll('aside nav button')].filter(b => getComputedStyle(b).display !== 'none').length === 4));
// 2. Les Jeux : 3 jeux, quiz, marché noir ; plus de duels
await pa.evaluate(async () => { duelDirect = false; tab = 'duel'; await render(); }); await pa.waitForSelector('[data-jeu]');
const jeux = await pa.$$eval('[data-jeu]', e => e.map(x => x.dataset.jeu)); ok('Les Jeux : Camp, Kolkhoze, Tsar, quiz, Marché noir (pas de duels)', ['gulag', 'potato', 'tsar', 'dquiz', 'bourse'].every(k => jeux.includes(k)) && !jeux.includes('duel'), J(jeux));
await pa.screenshot({ path: SHP + 'commu2-2-jeux.png' });
// 3. colis et Archives
await call(A, 'POST', '/api/commu/buy', { n: 3 }); const [, o1] = await call(A, 'POST', '/api/commu/open', {}); await call(A, 'POST', '/api/commu/open', {});
await pa.evaluate(async () => { await loadCommu(true); tab = 'packs'; await render(); }); await pa.waitForSelector('#open'); await pa.screenshot({ path: SHP + 'commu2-3-distribution.png' });
ok('Distribution : stock de colis de l\'événement et solde en ₽', (await pa.textContent('.stock')).includes('1') && (await pa.textContent('.stock')).includes('₽') && !(await pa.$('#cd')));
await pa.evaluate(async () => { tab = 'album'; await render(); }); await pa.waitForSelector('.ev-grid .card', { timeout: 10000 }); await pa.waitForTimeout(1500);
ok('Archives : fiches de l\'événement et avancement par grade', (await pa.$$('.ev-grid .card')).length >= 10 && (await pa.textContent('.ev-chips')).includes('/ 150'), (await pa.textContent('.ev-chips')).slice(0, 120));
await pa.screenshot({ path: SHP + 'commu2-4-archives.png' });
await pa.click('.ev-grid .card'); await pa.waitForSelector('#ec-x'); ok('fiche : détail avec grade et exemplaires', (await pa.textContent('.moresheet')).includes('exemplaires')); await pa.click('#ec-x');
// 4. Marché noir et quiz
await pa.evaluate(async () => { tab = 'bourse'; await render(); }); await pa.waitForTimeout(1800);
ok('Marché noir : titres soviétiques, mises en ₽', (await pa.textContent('#view')).includes('Marché noir') && !(await pa.textContent('#view')).includes('pièces misables'), (await pa.textContent('#view')).slice(0, 120));
await pa.screenshot({ path: SHP + 'commu2-5-marchenoir.png' });
// 5. classement général et avance des paliers
await call(null, 'POST', '/api/register', { name: 'Eva', password: 'secret3' }); const [, le] = await call(null, 'POST', '/api/login', { name: 'Eva', password: 'secret3' });
await DB.prepare("UPDATE users SET coins = 1000 WHERE name = 'Eva'").run(); await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(le.token, 'POST', '/api/commu/join', {});
await DB.prepare("UPDATE plan_progress SET earned = 2500 WHERE user_id = (SELECT id FROM users WHERE name = 'Eva')").run(); await call(B, 'POST', '/api/commu/join', {});
await pa.evaluate(async () => { await loadCommu(true); tab = 'commutop'; await render(); }); await pa.waitForSelector('.ct-row', { timeout: 8000 }); await pa.waitForTimeout(500);
const top = await pa.textContent('#view');
ok('classement général : cagnotte, avance des paliers (histogramme), classement avec paliers atteints', top.includes('Avance des paliers') && (await pa.$$('.ct-lv')).length === 13 && (await pa.$$('.ct-row')).length === 3 && top.includes('Eva') && top.includes('6 / 12'), top.slice(0, 200));
ok('ma ligne est mise en évidence', !!(await pa.$('.ct-row.me')));
await pa.screenshot({ path: SHP + 'commu2-6-classement.png' });
// 6. menu Plan : paliers, classement, règlement
await pa.evaluate(() => moreSheet()); await pa.waitForSelector('.moresheet'); const tiles = await pa.$$eval('.mtile', t => t.map(x => x.dataset.go));
ok('menu Plan : paliers, classement général et règlement', ['plan', 'commutop', 'commurules'].every(k => tiles.includes(k)), J(tiles)); await pa.screenshot({ path: SHP + 'commu2-7-menuplan.png' });
ok('aucune erreur JS', pa.errs.length === 0, J(pa.errs)); await pa.context().close();
process.exit(0);
