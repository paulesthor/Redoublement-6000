// Captures d'écran de l'interface d'administration (tableau de bord, journal) sur téléphone, avec le vrai Worker et un vrai PostgreSQL.
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
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const mk = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_push_ask', '1'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900); return p; };
const vis = async p => p.$$eval('nav button', bs => bs.filter(b => b.offsetParent !== null).map(b => b.dataset.tab));
console.log('— téléphone 390 px');
let p = await mk(390, 844);
let v = await vis(p); ok('4 onglets + Plus', J(v) === J(['packs', 'album', 'duel', 'market', 'more']), J(v));
ok('pastille rouge sur Plus (message non lu)', await p.$('nav button.more.has-badge') !== null);
await p.screenshot({ path: 'nav-mobile.png' });
await p.click('nav button.more'); await p.waitForSelector('.moresheet'); await p.waitForTimeout(450);
await p.screenshot({ path: 'nav-plus.png' });
ok('menu Plus : tuiles', (await p.$$('.mtile')).length >= 8, (await p.$$('.mtile')).length);
ok('badge Messages dans le menu', (await p.textContent('.mtile[data-go=msg] .mb')) === '1');
await p.click('.mtile[data-go=msg]'); await p.waitForSelector('text=Nouveau message'); 
ok('Messages ouvert, Plus en surbrillance', (await p.$('nav button.more.on')) !== null && (await p.$('nav button.on[data-tab=more]')) !== null);
await p.click('nav button.more'); await p.click('.mtile[data-go=search]'); await p.waitForTimeout(600);
ok('Chercher ouvert depuis le menu', (await p.textContent('h1')).toLowerCase().includes('cherch') || (await p.$('#sq, input[placeholder*="cherch" i]')) !== null);
await p.click('nav button.more'); await p.click('.mtile[data-go=admin]'); await p.waitForSelector('#adm-tabs', { timeout: 8000 });
ok('Admin accessible depuis Plus', true);
await p.click('nav button.more'); await p.click('#mo-x'); ok('fermeture par la croix', await p.$('.moresheet') === null);
await p.click('nav button[data-tab=market]'); await p.waitForTimeout(500); ok('onglet Marché normal', (await p.$('nav button.on[data-tab=market]')) !== null && (await p.$('nav button.more.on')) === null);
ok('aucune erreur JavaScript (téléphone)', p.errs.length === 0, J(p.errs));
console.log('— ordinateur 1100 px');
p = await mk(1100, 800); v = await vis(p);
ok('8 onglets en barre latérale, pas de Plus', v.length === 8 && !v.includes('more'), J(v));
await p.screenshot({ path: 'nav-desktop.png' });
ok('aucune erreur JavaScript (ordinateur)', p.errs.length === 0, J(p.errs));
await browser.close(); srv.close(); await done();
