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
// Audit du mode communiste sur les tailles d'iPhone : débordements, textes coupés, blocs qui se chevauchent, émoticônes, textes cassés, erreurs JS.
const SIZES = (process.env.SIZES || '375x667,390x844,393x852,430x932').split(',').map(x => x.split('x').map(Number));
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{FE0F}]/u;
const probe = () => {
  const W = document.documentElement.clientWidth, H = innerHeight, out = { sw: document.documentElement.scrollWidth, W, over: [], clip: [], overlap: [], broken: [], texts: [] };
  const label = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const root = document.querySelector('.tsfull') || document.body;
  const vis = [];
  root.querySelectorAll('*').forEach(el => {
    if (el.closest('canvas,svg,#reveal') || ['SCRIPT', 'STYLE'].includes(el.tagName)) return;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    let sc = false; for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { sc = true; break; } }
    if (!sc && cs.position !== 'fixed' && (r.right > W + 1 || r.left < -1)) out.over.push(`${label(el)} ${Math.round(r.left)}..${Math.round(r.right)}`);
    if (!el.children.length && el.scrollWidth > el.clientWidth + 2 && ['hidden', 'clip'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis' && (el.textContent || '').trim()) out.clip.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth} "${el.textContent.trim().slice(0, 26)}"`);
    const t = !el.children.length ? (el.textContent || '').trim() : ''; if (t) { out.texts.push(t); if (/undefined|NaN|\[object|null\b/.test(t)) out.broken.push(t.slice(0, 40)); }
    if (['BUTTON', 'H1', 'H2', 'H3', 'P'].includes(el.tagName) || el.classList.contains('mtile') || el.classList.contains('plr-card') || el.classList.contains('us-news')) vis.push([el, r]);
  });
  // blocs qui se chevauchent (frères directs seulement, éléments de même type)
  for (const [a, ra] of vis) for (const [b, rb] of vis) { if (a === b || a.contains(b) || b.contains(a) || a.parentElement !== b.parentElement) continue; const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top); if (ix > 4 && iy > 4 && a.compareDocumentPosition(b) & 4) out.overlap.push(`${label(a)} × ${label(b)} (${Math.round(ix)}×${Math.round(iy)})`); }
  out.over = [...new Set(out.over)].slice(0, 6); out.clip = [...new Set(out.clip)].slice(0, 6); out.overlap = [...new Set(out.overlap)].slice(0, 6); out.texts = [...new Set(out.texts)];
  return out;
};
const rows = [], textsByScreen = {};
const note = (size, name, pr, emojiOk = false) => {
  const issues = [];
  if (pr.sw > pr.W + 1) issues.push(`défilement horizontal ${pr.sw}>${pr.W}`);
  pr.over.forEach(x => issues.push('dépasse : ' + x)); pr.clip.forEach(x => issues.push('coupé : ' + x)); pr.overlap.forEach(x => issues.push('chevauche : ' + x)); pr.broken.forEach(x => issues.push('texte cassé : ' + x));
  const em = pr.texts.filter(t => EMOJI.test(t)); if (em.length && !emojiOk) issues.push('émoticônes : ' + em.slice(0, 3).join(' | '));
  rows.push({ size, name, issues }); (textsByScreen[name] ??= new Set()); pr.texts.forEach(t => textsByScreen[name].add(t));
};
for (const [w, h] of SIZES) {
  const size = `${w}x${h}`, p = await mk(w, h); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
  await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); setPref('wm_sound', '0'); await syncUssrUi(); tab = 'packs'; render(); }); await p.waitForTimeout(1000);
  const closeModal = () => p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
  // pages principales du mode (4 onglets + hub + paliers + menu Plan + écran d'icône)
  for (const [name, setup] of [
    ['Distribution', () => { tab = 'packs'; render(); }], ['Archives', () => { tab = 'album'; render(); }], ['Les Jeux (hub)', () => { duelDirect = false; tab = 'duel'; render(); }],
    ['Paliers du Plan', () => { tab = 'plan'; render(); }], ['Quiz du jour', () => { tab = 'dquiz'; render(); }], ['Tableau d\'honneur', () => { tab = 'rank'; render(); }], ['Réglages', () => { tab = 'settings'; render(); }],
  ]) { await p.evaluate(setup); await p.waitForTimeout(1100); note(size, name, await p.evaluate(probe)); }
  await p.evaluate(() => { tab = 'plan'; render(); }); await p.waitForSelector('.plr'); await p.click('[data-earn="1000"]'); await p.waitForTimeout(400); await p.click('[data-earn="1000"]'); await p.waitForTimeout(400); await p.click('[data-earn="1000"]'); await p.waitForTimeout(500);
  note(size, 'Paliers (avec récompenses prêtes)', await p.evaluate(probe)); await p.evaluate(() => document.querySelector('#plan-reset').click()); await p.waitForTimeout(300);
  await p.evaluate(() => moreSheet()); await p.waitForSelector('.moresheet'); await p.waitForTimeout(400); note(size, 'Menu Plan', await p.evaluate(probe)); await closeModal();
  await p.evaluate(() => iconSheet()); await p.waitForSelector('.iconsheet'); await p.waitForTimeout(400); note(size, 'Écran nouvelle icône', await p.evaluate(probe)); await closeModal();
  // jeux plein écran : Camp, Patates, Le Dernier Tsar
  await p.evaluate(() => { tab = 'gulag'; render(); }); await p.waitForSelector('.glfull', { timeout: 10000 }); await p.waitForTimeout(1500); note(size, 'Le Camp', await p.evaluate(probe), true);
  for (const t of ['s', 'p', 'd']) { await p.evaluate(k => document.querySelector(`#gl-tabs [data-k=${k}]`)?.click(), t); await p.waitForTimeout(500); note(size, 'Le Camp : onglet ' + t, await p.evaluate(probe), true); }
  await p.evaluate(() => { tab = 'packs'; render(); }); await p.waitForTimeout(500);
  await p.evaluate(() => { tab = 'potato'; render(); }); await p.waitForSelector('.ptfull', { timeout: 10000 }); await p.waitForTimeout(2500); note(size, 'Les Patates (3D)', await p.evaluate(probe), true);
  await p.evaluate(() => { tab = 'packs'; render(); }); await p.waitForTimeout(500);
  await p.evaluate(() => { tab = 'tsar'; render(); }); await p.waitForSelector('#ts-go', { timeout: 10000 }); await p.waitForTimeout(500); note(size, 'Tsar : briefing', await p.evaluate(probe));
  await p.evaluate(() => { const real = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => real(fn, (ms || 0) * 0.3, ...a); });
  await p.click('#ts-go'); await p.waitForSelector('#ts-r', { timeout: 15000 }); await p.waitForTimeout(500); note(size, 'Tsar : dialogue', await p.evaluate(probe));
  for (const k of ['samovar', 'capi', 'rave', 'late']) { await p.evaluate(key => window.__tsar.forceEnd(key), k); await p.waitForSelector('.ts-panel.end', { timeout: 40000 }); await p.waitForTimeout(500); note(size, 'Tsar : fin ' + k, await p.evaluate(probe)); await p.evaluate(() => document.querySelector('#ts-again')?.click()); await p.waitForTimeout(500); }
  if (errs.length) rows.push({ size, name: 'ERREURS JS', issues: errs.slice(0, 3) });
  await p.context().close();
}
let bad = 0; const bySize = {};
for (const r of rows) { bySize[r.size] ??= { ok: 0, ko: 0 }; if (r.issues.length) { bad++; bySize[r.size].ko++; console.log('●', r.size, r.name, '\n   ', r.issues.join('\n    ')); } else bySize[r.size].ok++; }
console.log('\nRAPPORT_VISUEL ' + JSON.stringify({ bySize, ecrans: [...new Set(rows.map(r => r.name))].length }));
console.log('\nTEXTES ' + JSON.stringify(Object.fromEntries(Object.entries(textsByScreen).map(([k, v]) => [k, [...v].length]))));
console.log(bad ? `${bad} écran(s) avec un souci` : 'AUCUN SOUCI VISUEL');
process.exit(0);
