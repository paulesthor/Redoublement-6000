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

const SIZES = (process.env.SIZES || '375x667,390x844,393x852,430x932').split(',').map(x => x.split('x').map(Number));
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
  // texte tronqué (points de suspension, lignes limitées, masqué par un conteneur) et textes qui se chevauchent
  out.trunc = []; out.overlap = [];
  const leaves = [];
  document.querySelectorAll('body *').forEach(el => {
    if (el.closest('canvas,svg,#reveal,#toast') || ['SCRIPT', 'STYLE', 'OPTION', 'SELECT'].includes(el.tagName)) return;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    if (cs.display === 'inline') return;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()); if (!hasText) return;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
    const t = (el.textContent || '').trim().slice(0, 30);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.trunc.push(`ELLIPSE ${label(el)} "${t}"`);
    if ((cs.webkitLineClamp && cs.webkitLineClamp !== 'none' || ['hidden', 'clip'].includes(cs.overflowY) && cs.display !== 'inline') && el.scrollHeight > el.clientHeight + 2 && !el.matches('main,body,html,.moresheet,#modal,.gl-body,.ptfull *')) out.trunc.push(`HAUTEUR ${label(el)} ${el.scrollHeight}>${el.clientHeight} "${t}"`);
    if (['hidden', 'clip'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2) out.trunc.push(`LARGEUR ${label(el)} ${el.scrollWidth}>${el.clientWidth} "${t}"`);
    // masqué par un ancêtre qui rogne
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const ac = getComputedStyle(a); if (['hidden', 'clip'].includes(ac.overflow) || ['hidden', 'clip'].includes(ac.overflowX) || ['hidden', 'clip'].includes(ac.overflowY)) { const ar = a.getBoundingClientRect(); if (a.matches('.hero,.stage,#reveal,.rc,.card,.img,.ph,.thumb,.bigspark,.packart,.us-obj') ) break; if (r.right > ar.right + 2 || r.bottom > ar.bottom + 2 || r.left < ar.left - 2) { out.trunc.push(`ROGNÉ ${label(el)} par ${label(a)} "${t}"`); break; } } }
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width, 20) / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + Math.min(r.height, 14) / 2)), top = r.bottom > 0 && r.top < innerHeight ? document.elementFromPoint(cx, cy) : null;
    if (top && (top === el || el.contains(top) || top.contains(el))) leaves.push({ el, r, t, pos: cs.position });
  });
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ox > 4 && oy > 4 && (a.pos !== 'fixed' || b.pos !== 'fixed') && !a.el.closest('nav,#topbar') && !b.el.closest('nav,#topbar') && !a.el.matches('.mb,.chip,.newtag,.betatag,.ttl,.stamp,i') && !b.el.matches('.mb,.chip,.newtag,.betatag,.ttl,.stamp,i')) out.overlap.push(`CHEVAUCHE ${label(a.el)} "${a.t}" ↔ ${label(b.el)} "${b.t}"`);
  }
  // blocs (fond, bordure ou ombre) : ils ne doivent ni se chevaucher ni dépasser du bloc qui les contient
  out.blocks = [];
  const boxes = [];
  document.querySelectorAll('body *').forEach(el => {
    if (el.closest('canvas,svg,#reveal,#toast,.pt-ui,.glfull,aside,#topbar,.pushbar') || ['SCRIPT', 'STYLE', 'OPTION', 'SELECT', 'INPUT', 'TEXTAREA', 'IMG', 'I', 'LABEL'].includes(el.tagName) && el.tagName !== 'INPUT') return;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.display === 'inline' || cs.visibility === 'hidden' || +cs.opacity === 0 || cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky') return;
    const bg = cs.backgroundColor, hasBg = bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg), hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some(k => parseFloat(cs['border' + k + 'Width']) > 0 && cs['border' + k + 'Style'] !== 'none'), hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
    if (!(hasBg || hasBorder) && !(hasShadow && el.matches('.card,.panel,.item,button'))) return;
    const r = el.getBoundingClientRect(); if (r.width < 24 || r.height < 14 || r.width > innerWidth + 2) return;
    if (r.bottom < 0 || r.top > innerHeight) return;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + Math.min(r.height / 2, 30))), top = document.elementFromPoint(cx, cy);
    if (!top || !(top === el || el.contains(top) || top.contains(el))) return;
    boxes.push({ el, r });
  });
  const nested = (a, b) => a.contains(b) || b.contains(a);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]; if (nested(a.el, b.el)) continue;
    const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ox > 2 && oy > 2) out.blocks.push(`BLOCS SUPERPOSÉS ${label(a.el)} "${(a.el.textContent || '').trim().slice(0, 16)}" ↔ ${label(b.el)} "${(b.el.textContent || '').trim().slice(0, 16)}" (${Math.round(ox)}×${Math.round(oy)} px)`);
  }
  for (const c of boxes) { for (let a = c.el.parentElement; a && a !== document.body; a = a.parentElement) { const pb = boxes.find(x => x.el === a); if (!pb) continue; const d = Math.max(c.r.right - pb.r.right, pb.r.left - c.r.left, c.r.bottom - pb.r.bottom + 0, pb.r.top - c.r.top); if (d > 1.5 && !c.el.closest('.scrollrow,.chips,.tabs')) out.blocks.push(`DÉPASSE DU BLOC ${label(c.el)} "${(c.el.textContent || '').trim().slice(0, 16)}" dans ${label(a)} (+${Math.round(d)} px)`); break; } }
  out.blocks = [...new Set(out.blocks)].slice(0, 10);
  out.trunc = [...new Set(out.trunc)].slice(0, 12); out.overlap = [...new Set(out.overlap)].slice(0, 8);
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
  const keyOf = x => x.replace(/^\S+ /, '').replace(/"[^"]*"/g, '').trim();
  const offKeys = new Set([...(off?.trunc || []), ...(off?.overlap || [])].map(keyOf));
  news.push(...[...(on.trunc || []), ...(on.overlap || [])].filter(x => !offKeys.has(keyOf(x))).map(x => '(nouveau) ' + x));
  const bKey = x => x.replace(/"[^"]*"/g, '').replace(/\(\d+×\d+ px\)|\(\+\d+ px\)/g, '');
  const offB = new Set((off?.blocks || []).map(bKey));
  news.push(...(on.blocks || []).filter(x => !offB.has(bKey(x))).map(x => '(nouveau) ' + x));
  const sw = on.sw > on.W + 1 ? [`défilement horizontal de la page : ${on.sw} > ${on.W}`, ...on.over.map(x => '(tout) DÉBORDE ' + x)] : [];
  if (news.length || sw.length) { bad++; console.log('●', k, '\n   ', [...sw, ...news].join('\n    ')); }
}
console.log(bad ? `${bad} écran(s) avec un souci` : 'AUCUN DÉBORDEMENT');
process.exit(0);
