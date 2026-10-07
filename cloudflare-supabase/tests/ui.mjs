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
const bctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await bctx.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('token', tok); localStorage.setItem('wm_push_ask', '1'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A);
const pg = await bctx.newPage(); const errors = [];
pg.on('pageerror', e => errors.push('PAGE ' + e.message)); pg.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push('CONSOLE ' + m.text()));
await pg.goto('http://localhost:8767/'); await pg.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await pg.waitForTimeout(800);
await pg.evaluate(() => { document.querySelector('#profile')?.click(); }); await pg.waitForTimeout(500);
const adminBtn = await pg.$('text=Administration'); if (adminBtn) await adminBtn.click(); await pg.waitForSelector('#adm-tabs', { timeout: 8000 });
await pg.click('#adm-tabs [data-k=stats]'); await pg.waitForSelector('.hbars', { timeout: 8000 }); await pg.waitForTimeout(500);
await pg.screenshot({ path: 'admin-stats.png', fullPage: true });
ok('tableau de bord affiché', (await pg.$$('.strow')).length > 5);
await pg.click('#st-sort [data-s=nw]'); await pg.waitForSelector('.hbars'); await pg.waitForTimeout(300);
ok('tri par écritures', (await pg.textContent('#st-sort .on')).includes('Écritures'));
await pg.click('#adm-tabs [data-k=logs]'); await pg.waitForSelector('#lg-box', { timeout: 8000 }); await pg.waitForTimeout(500);
await pg.screenshot({ path: 'admin-logs.png', fullPage: false });
ok('journal affiché', (await pg.$$('#lg-box > div')).length > 3);
await pg.click('#lg-f [data-f=warn]'); await pg.waitForTimeout(700);
ok('filtre alertes', (await pg.$$('#lg-box .lg-info')).length === 0 && (await pg.$$('#lg-box > div')).length >= 1);
ok('aucune erreur JavaScript', errors.length === 0, J(errors));
await browser.close(); srv.close(); await done();
