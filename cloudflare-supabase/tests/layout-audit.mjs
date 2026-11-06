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

const SIZES = (process.env.SIZES || '320x568,390x844,768x1024,1100x800').split(',').map(x => x.split('x').map(Number));
const TABS = (process.env.TABS || 'packs,album,search,duel,rank,ach,market,trades,friends,msg,quests,dquiz,bourse,hilo,trends,bank,expeditions,events,albums,themepacks,settings,customize,tournaments,feed,profile').split(',');
const MODALS = ['more', 'card', 'price'];
const probe = () => {
  const W = document.documentElement.clientWidth, out = { sw: document.documentElement.scrollWidth, W, over: [], clip: [] };
  const scrollable = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const label = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  document.querySelectorAll('body *').forEach(el => {
    if (el.closest('canvas,svg,#reveal') || el.tagName === 'SCRIPT') return;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    if ((r.right > W + 1 || r.left < -1) && !scrollable(el) && cs.position !== 'fixed' || (cs.position === 'fixed' && r.right > W + 1 && el.id !== 'toast')) out.over.push(`${label(el)} ${Math.round(r.left)}..${Math.round(r.right)} "${(el.textContent || '').trim().slice(0, 28)}"`);
    if (!el.children.length && el.scrollWidth > el.clientWidth + 2 && ['hidden', 'clip'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis' && (el.textContent || '').trim()) out.clip.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth} "${(el.textContent || '').trim().slice(0, 28)}"`);
  });
  out.over = [...new Set(out.over)].slice(0, 10); out.clip = [...new Set(out.clip)].slice(0, 6); return out;
};
const report = {};
for (const [w, h] of SIZES) {
  for (const skin of [false, true]) {
    const p = await mk(w, h); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
    if (skin) { await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); await syncUssrUi(); }); await p.waitForTimeout(500); }
    for (const t of TABS) {
      await p.evaluate(x => { document.querySelectorAll('.pushbar').forEach(b => b.remove()); const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; tab = x; render(); }, t); await p.waitForTimeout(900);
      const pr = await p.evaluate(probe); (report[`${w}x${h} ${t}`] ??= {})[skin ? 'on' : 'off'] = pr;
    }
    for (const mname of MODALS) {
      await p.evaluate(async x => { tab = 'album'; await render(); if (x === 'more') moreSheet(); else if (x === 'card') { const c = document.querySelector('.card[data-id]'); if (c) showCard(c.dataset.id); } else if (x === 'price') { const c = document.querySelector('.card[data-id]'); if (c) priceSheet(+c.dataset.id, 'Test'); } }, mname); await p.waitForTimeout(900);
      const pr = await p.evaluate(probe); (report[`${w}x${h} modal:${mname}`] ??= {})[skin ? 'on' : 'off'] = pr;
    }
    if (errs.length) console.log(`ERREURS JS ${w}x${h} skin=${skin}:`, errs.slice(0, 3));
    await p.context().close();
  }
}
let bad = 0;
for (const [k, v] of Object.entries(report)) {
  const on = v.on, off = v.off; if (!on) continue;
  const offSet = new Set([...(off?.over || []), ...(off?.clip || [])].map(x => x.replace(/\s.*$/, '')));
  const news = [...on.over.map(x => 'DÉBORDE ' + x), ...on.clip.map(x => 'COUPÉ ' + x)].filter(x => !offSet.has(x.replace(/^\S+ /, '').replace(/\s.*$/, '')));
  const sw = on.sw > on.W + 1 ? [`défilement horizontal de la page : ${on.sw} > ${on.W}`, ...on.over.map(x => '(tout) DÉBORDE ' + x)] : [];
  if (news.length || sw.length) { bad++; console.log('●', k, '\n   ', [...sw, ...news].join('\n    ')); }
}
console.log(bad ? `${bad} écran(s) avec un souci` : 'AUCUN DÉBORDEMENT');
process.exit(0);
