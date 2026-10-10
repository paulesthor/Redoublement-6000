// Enregistre une vidéo de l'animation « ouvrir 10 paquets » (téléphone 390×844) : node tests/video-open10.mjs <dossier de sortie>
// Les raretés des 10 paquets sont fixées pour la démonstration (le serveur, lui, tire au hasard).
import './api.mjs';
import { CSP } from '../src/secure.js';
import { createRequire } from 'node:module';
import http from 'node:http'; import { readFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'; import path from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/'); const { chromium } = require('playwright');
const { call, DB, worker, env, ctx } = globalThis.__T;
const OUT = process.argv[2] || '.'; mkdirSync(OUT, { recursive: true });
const PUB = new URL('../../cloudflare/public/', import.meta.url).pathname;
let [, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
await DB.prepare('UPDATE users SET pack_stock = 30, coins = 900 WHERE name = ?').bind('Alice').run();
const srv = http.createServer(async (q, res) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of q) chunks.push(c);
    const rr = await worker.fetch(new Request('http://x' + q.url, { method: q.method, headers: q.headers, body: ['GET', 'HEAD'].includes(q.method) ? undefined : Buffer.concat(chunks) }), env, ctx);
    res.writeHead(rr.status, { 'content-type': rr.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' }); return res.end(Buffer.from(await rr.arrayBuffer()));
  }
  let p = path.join(PUB, u.pathname); if (p.endsWith('/')) p += 'index.html'; if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { ...(path.extname(p) === '.html' ? { 'content-security-policy': CSP } : {}), 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(8769);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', recordVideo: { dir: OUT, size: { width: 390, height: 844 } } });
await ctxB.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A);
const p = await ctxB.newPage();
// démonstration : 10 paquets aux raretés variées (meilleure carte de chaque paquet), images d'illustration générées
const BEST = ['common', 'uncommon', 'rare', 'common', 'super', 'rare', 'ultra', 'uncommon', 'legendary', 'ultra'], COL = { common: '#a4b5a0', uncommon: '#86c4f5', rare: '#c09aec', super: '#ee91bc', ultra: '#f2a34f', legendary: '#f4e9c0' };
const art = (t, col) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="#14141d"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><text x="60" y="76" font-size="46" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="700">${t.slice(0, 2)}</text></svg>`);
await p.route('**/api/packs/open10', async route => {
  const resp = await route.fetch(); const j = await resp.json();
  j.packs.forEach((pk, i) => { pk.cards.forEach((c, k) => { const rar = k === 0 ? BEST[i] : ['common', 'common', 'uncommon', 'common', 'rare', 'common'][k % 6]; c.rarity = rar; c.shiny = i === 8 && k === 0 ? 1 : 0; c.image = art(c.title || 'Wiki', COL[rar]); c.isNew = k % 3 === 0; }); });
  await route.fulfill({ response: resp, json: j });
});
await p.goto('http://localhost:8769/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900);
if (await p.$('.daily')) { await p.click('#d-claim').catch(() => {}); await p.waitForTimeout(500); await p.click('#d-claim').catch(() => {}); await p.waitForTimeout(400); }
await p.waitForSelector('#open10:not([disabled])'); await p.waitForTimeout(1500);
await p.click('#open10');
await p.waitForSelector('.tn-all:not([disabled])', { timeout: 30000 }); await p.waitForTimeout(2800);      // les dix paquets allumés
await p.click('.tn-all');
await p.waitForSelector('.tn-count', { timeout: 60000 }); await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('#reveal .sum')?.scrollTo?.({ top: 400, behavior: 'smooth' })); await p.waitForTimeout(1800);
await p.screenshot({ path: path.join(OUT, 'dix-paquets-resume.png') });
const errs = await p.evaluate(() => 0);
await ctxB.close(); await browser.close(); srv.close();
const v = readdirSync(OUT).find(f => f.endsWith('.webm')); if (v) renameSync(path.join(OUT, v), path.join(OUT, 'ouvrir-10-paquets.webm'));
console.log('vidéo :', path.join(OUT, 'ouvrir-10-paquets.webm'));
process.exit(0);
