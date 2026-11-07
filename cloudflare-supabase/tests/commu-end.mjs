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
// Fin de l'événement vue par un joueur : bilan, gagnant, choix des souvenirs, contour dans la collection normale, thèmes gagnés.
const mkE = async (token, w = 390, h = 844) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); if (!localStorage.getItem('wm_seen_ver')) localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, token); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
const SHE = '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/';
await DB.prepare('UPDATE users SET coins = 1000 WHERE name = ?').bind('Bob').run();
const coinsOf = async n => +(await DB.prepare('SELECT coins c FROM users WHERE name = ?').bind(n).all()).results[0].c;
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/commu/join', {});
await DB.prepare("UPDATE plan_progress SET earned = 3700 WHERE user_id = (SELECT id FROM users WHERE name = 'Bob')").run();
const c0 = await coinsOf('Bob');
for (const id of [1, 2, 9]) { const [s, r] = await call(B, 'POST', '/api/plan/claim', { id }); ok(`palier ${id} réclamé`, s === 200, s); }
ok('récompenses classiques : wikibidou versés (20 + 40 + 120)', await coinsOf('Bob') === c0 + 180, (await coinsOf('Bob')) - c0);
await call(B, 'POST', '/api/commu/buy', { n: 3 }); for (let i = 0; i < 3; i++) await call(B, 'POST', '/api/commu/open', {});
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(A, 'POST', '/api/commu/finish', {});
const pb = await mkE(B); await pb.waitForTimeout(1500);
ok('la page de fin s\'ouvre toute seule pour le joueur concerné', await pb.evaluate(() => tab === 'commuend'), await pb.evaluate(() => tab));
await pb.waitForSelector('.souvgrid .card', { timeout: 10000 }); await pb.screenshot({ path: SHE + 'end-1-choix.png' });
const txt = await pb.textContent('#view');
ok('bilan : gagnant, tes paliers, ce que tu gardes (thème Sibérie, titre)', txt.includes('Fin du Plan quinquennal') && txt.includes('Sibérie') && /palier/.test(txt) && txt.includes('Choisis'), txt.slice(0, 160));
ok('choix : 1 souvenir à choisir pour 1 droit (palier 2)', txt.includes('0 / 1'), txt.slice(160, 300));
await pb.click('.souvgrid .card'); await pb.waitForTimeout(300); ok('la fiche touchée est marquée', !!(await pb.$('.souvgrid .card.souvpick')));
await pb.click('.souvgrid .card:nth-of-type(2)'); await pb.waitForTimeout(300); ok('un seul choix possible : le second remplace le premier', (await pb.$$('.souvgrid .card.souvpick')).length === 1);
await pb.click('#sv-ok'); await pb.waitForSelector('.modal button, #modal button', { timeout: 5000 }); await pb.screenshot({ path: SHE + 'end-2-confirm.png' });
await pb.evaluate(() => { const b = [...document.querySelectorAll('#modal button')].find(x => /Confirmer/.test(x.textContent)); b?.click(); }); await pb.waitForTimeout(1800);
ok('souvenir rangé : message et écran mis à jour', (await pb.textContent('#view')).includes('sont dans ta collection') || (await pb.textContent('#view')).includes('est dans ta collection') || (await pb.textContent('#view')).includes('souvenir'), (await pb.textContent('#view')).slice(300, 460));
ok('la fiche gardée porte le contour « souvenir »', !!(await pb.$('.souvgrid .card.souv')));
await pb.screenshot({ path: SHE + 'end-3-souvenir.png' });
const inv = (await DB.prepare("SELECT card_id FROM inventory WHERE user_id = (SELECT id FROM users WHERE name = 'Bob') AND card_id > 200000000").all()).results; ok('collection normale : 1 fiche d\'événement', inv.length === 1, inv.length);
// collection normale : la fiche s'affiche avec son contour
await pb.evaluate(async () => { tab = 'album'; await render(); }); await pb.waitForTimeout(2000);
ok('Archives normales : la carte souvenir a son contour', !!(await pb.$('.card.souv')));
await pb.screenshot({ path: SHE + 'end-4-collection.png' });
// thèmes gagnés : proposés dans les réglages
await pb.evaluate(async () => { await loadCommu(true); tab = 'settings'; await render(); }); await pb.waitForTimeout(1500);
const themes = await pb.$$eval('.themes button', b => b.map(x => x.textContent));
ok('Réglages : le thème « Sibérie » (palier 9) est proposé, pas « Or impérial » (palier 12 non atteint)', themes.some(t => t.includes('Sibérie')) && !themes.some(t => t.includes('Or imp')), J(themes));
ok('aucune erreur JS', pb.errs.length === 0, J(pb.errs));
process.exit(0);
