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
// Simulation du Dernier Tsar : de vraies parties dans le vrai jeu, minuteries accélérées, avec plusieurs profils de joueurs.
const RUNS = +(process.env.RUNS || 10);
const p = await mk(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); setPref('wm_sound', '0'); await syncUssrUi(); tab = 'duel'; render(); });
await p.waitForSelector('[data-jeu=tsar]'); await p.click('[data-jeu=tsar]'); await p.waitForSelector('#ts-go', { timeout: 8000 });
await p.evaluate(() => { const real = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => real(fn, (ms || 0) * 0.05, ...a); });   // le jeu tourne 20 fois plus vite
const ROUTE_CARDS = ['Ivan', 'Dimitri', 'Orlov', 'Piotr', 'Majesté'];
const POLICIES = {
  'au hasard': () => Math.random() < .5 ? '#ts-l' : '#ts-r',
  'bâtisseur (accepte les pistes, refuse le reste)': name => ROUTE_CARDS.some(n => name.includes(n)) ? '#ts-r' : '#ts-l',
  'toujours oui': () => '#ts-r',
  'toujours non': () => '#ts-l',
  'prudent (aide le peuple, jamais d\'imprudence)': name => /paysan|banquier|comptable|Anatoli|Vera/.test(name) ? '#ts-r' : ROUTE_CARDS.some(n => name.includes(n)) && !/Dimitri/.test(name) ? '#ts-r' : '#ts-l',
};
const KIND = { samovar: 'réussite', train: 'réussite', bear: 'réussite', x_samovar: 'échec du coup', x_train: 'échec du coup', x_bear: 'échec du coup', late: 'trop lent', rave: 'fin débile', capi: 'fin débile', c0: 'jauge', c1: 'jauge', d0: 'jauge', d1: 'jauge', a0: 'jauge', a1: 'jauge', f0: 'jauge', f1: 'jauge' };
const report = {};
for (const [name, choose] of Object.entries(POLICIES)) {
  const ends = {}, days = [], bad = [];
  for (let r = 0; r < RUNS; r++) {
    await p.waitForSelector('#ts-go', { timeout: 20000 }); await p.click('#ts-go');
    let turns = 0;
    for (; turns < 60; turns++) {
      const st = await p.waitForFunction(() => document.querySelector('.ts-panel.end') ? 'end' : (!document.querySelector('.ts-panel.hide') && document.querySelector('#ts-r') ? 'card' : false), null, { timeout: 40000, polling: 40 }).then(h => h.jsonValue()).catch(() => 'timeout');
      if (st === 'end') break; if (st === 'timeout') { bad.push('blocage'); break; }
      const who = await p.textContent('.ts-name'); await p.click(choose(who)); await p.waitForTimeout(30);
    }
    const s = await p.evaluate(() => { const S = window.__tsar.state(); return { end: S.end, day: S.day, flags: Object.keys(S.flags) }; });
    if (!s.end) bad.push('pas de fin'); else { ends[s.end] = (ends[s.end] || 0) + 1; days.push(s.day); }
    if (turns >= 60) bad.push('plus de 60 tours');
    await p.evaluate(() => document.querySelector('#ts-again')?.click());
  }
  report[name] = { ends, days, bad };
}
console.log('\nRAPPORT_TSAR ' + JSON.stringify(report));
const all = Object.values(report).flatMap(r => Object.keys(r.ends));
ok('aucune partie bloquée ni sans fin', Object.values(report).every(r => r.bad.length === 0), J(Object.values(report).map(r => r.bad)));
ok('toutes les parties finissent dans les 14 jours (+ fenêtre de tir)', Object.values(report).every(r => r.days.every(d => d <= 16)), J(Object.values(report).map(r => Math.max(...r.days))));
ok('le coup d\'État peut réussir', all.some(k => ['samovar', 'train', 'bear'].includes(k)));
ok('le coup d\'État peut aussi échouer', all.some(k => ['x_samovar', 'x_train', 'x_bear', 'late'].includes(k)));
ok('plusieurs sortes de fins sont atteintes', new Set(all).size >= 5, J([...new Set(all)]));
ok('aucune erreur JS pendant les parties', errs.length === 0, J(errs.slice(0, 3)));
process.exit(0);
