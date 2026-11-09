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
const mkN = async token => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '1'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, token); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); return p; };
await DB.prepare("UPDATE users SET coins = 1000 WHERE name = 'Bob'").run();
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/commu/join', {});
// 1. l'administrateur prépare le communiqué avec le modèle et l'aperçu (rien n'est publié)
const pa = await mkN(A); await pa.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
await pa.evaluate(async () => { adminTab = 'event'; tab = 'admin'; await render(); }); await pa.waitForTimeout(1500); await pa.evaluate(async () => { await render(); }); await pa.waitForSelector('#nt-tpl', { timeout: 8000 });
await pa.click('#nt-tpl'); await pa.click('#nt-prev'); await pa.waitForSelector('.notice', { timeout: 5000 }); await pa.waitForTimeout(500);
await pa.screenshot({ path: SH + 'notice-apercu.png' });
ok('aperçu admin : titre, tampon DÉNONCÉ, +50 et −50 affichés, mention « rien n\'est envoyé »', await pa.evaluate(() => { const t = document.querySelector('.notice').textContent; return /Dénonciation exemplaire/.test(t) && /DÉNONCÉ/.test(t) && /\+50 ₽/.test(t) && /−50 ₽/.test(t) && /rien n'est envoyé/.test(t); }));
const [, still] = await call(B, 'GET', '/api/commu'); ok('l\'aperçu ne publie rien', !still.notice, J(still.notice));
// 2. publication réelle (compte de test) : le joueur voit l'écran une seule fois
await pa.click('#nt-ok');
await call(A, 'POST', '/api/commu/notice', { title: 'Dénonciation exemplaire', text: 'Le camarade a dénoncé.\n\nLe Parti remercie.', stamp: 'DÉNONCÉ', btn: 'Vive la vigilance !', adjust: [] });
await call(A, 'POST', '/api/commu/notice', { title: 'Insulte à la patrie : le Parti sévit', text: 'Le camarade a insulté.\n\nLe Parti sévit.', stamp: 'CONDAMNÉ', btn: 'Je regrette, camarade', adjust: [] });
const pb = await mkN(B); await pb.waitForTimeout(1500);
ok('joueur : le communiqué s\'affiche tout seul', !!(await pb.$('.notice')));
console.log('DBG', await pb.evaluate(() => JSON.stringify({ n: commu?.notices?.map(x => x.id + ':' + x.title.slice(0, 12)), seen: localStorage.getItem('wm_notice'), txt: document.querySelector('.notice')?.textContent.slice(0, 80) })));
ok('premier communiqué affiché', /Dénonciation exemplaire/i.test(await pb.textContent('.notice')));
await pb.click('#nt-ok'); await pb.waitForTimeout(900);
ok('le second communiqué suit automatiquement', !!(await pb.$('.notice')) && /Insulte à la patrie/i.test(await pb.textContent('.notice')));
await pb.screenshot({ path: SH + 'notice-2.png' });
await pb.click('#nt-ok'); await pb.waitForTimeout(600); ok('fermé : le joueur peut continuer', !(await pb.$('.notice')) || await pb.$eval('#modal', m => m.hidden));
await pb.reload(); await pb.waitForSelector('#app:not([hidden])'); await pb.waitForTimeout(2000);
ok('jamais montré deux fois au même joueur', !(await pb.$('.notice')) || await pb.$eval('#modal', m => m.hidden));
ok('aucune erreur JS', pa.errs.length + pb.errs.length === 0, J([...pa.errs, ...pb.errs]));
process.exit(0);
