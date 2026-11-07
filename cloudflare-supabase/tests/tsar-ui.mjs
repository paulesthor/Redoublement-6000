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
const p = await mk(390, 844); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.waitForTimeout(1200); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
await p.evaluate(async () => { setPref('wm_theme', 'urss'); setPref('wm_ussr', '1'); setPref('wm_ussr_ui', '1'); setPref('wm_sound', '0'); await syncUssrUi(); tab = 'duel'; render(); });
await p.waitForSelector('[data-jeu=tsar]'); await p.click('[data-jeu=tsar]'); await p.waitForSelector('.ts-actor', { timeout: 8000 }); await p.waitForSelector('#ts-go', { timeout: 8000 });
await p.screenshot({ path: SH + 'tsar-0-briefing.png' });
ok('briefing : objectif et bouton', (await p.textContent('.ts-panel')).includes('Prendre la place du tsar'));
ok('aucune émoticône, aucun bandeau de pistes', !(await p.$('.ts-route')) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(await p.evaluate(() => document.querySelector('.ts-root').textContent)));
ok('décor dessiné : lustre, bougies, aigle, chat, gardes, table', await p.evaluate(() => ['.ts-chand', '.ts-candle svg', '.ts-eagle svg', '.ts-cat svg', '.ts-actor.guard', '.ts-snow', '.ts-clock', '#ts-table .ts-prop.vial'].every(s => document.querySelector(s))));
const state = () => p.evaluate(() => { const t = document.querySelector('#ts-table'); return { loc: document.querySelector('#ts-scene').dataset.loc, vial: t.querySelector('.vial').classList.contains('on'), tt: t.querySelector('.timetable').classList.contains('on'), inv: t.querySelector('.invite').classList.contains('on'), bear: !!document.querySelector('[data-role=bear]'), ally: !!document.querySelector('.ts-actor.ally'), flags: Object.keys(window.__tsar.state().flags) }; });
const card = name => p.waitForFunction(n => !document.querySelector('.ts-panel.hide') && (document.querySelector('.ts-name')?.textContent || '').includes(n), name, { timeout: 60000 });
const deal = id => p.evaluate(x => window.__tsar.deal(x), id);
// 1. cuisinier : on va en cuisine, la fiole est posée sur la table du salon
await deal('cook'); await p.click('#ts-go'); await card('Ivan'); await p.waitForTimeout(400);
await p.screenshot({ path: SH + 'tsar-1-dialogue.png' });
await deal('general'); await p.click('#ts-r'); await p.waitForTimeout(4200); await p.screenshot({ path: SH + 'tsar-2-cuisine.png' });
ok('le décor change : la cuisine', (await state()).loc === 'kitchen', J(await state()));
await card('Orlov'); let st = await state(); ok('cuisinier : retour au salon, fiole posée sur la table', st.loc === 'throne' && st.vial && st.flags.includes('poison'), J(st)); await p.screenshot({ path: SH + 'tsar-3-fiole.png' });
// 2. général : gare, puis l'horaire sur la table
await deal('tamer'); await p.click('#ts-r'); await p.waitForTimeout(4600); await p.screenshot({ path: SH + 'tsar-4-gare.png' });
ok('le décor change : la gare', (await state()).loc === 'station');
await card('Piotr'); st = await state(); ok('général : horaire posé sur la table', st.loc === 'throne' && st.tt && st.flags.includes('train'), J(st));
// 3. dresseur : ménagerie, puis l'ours s'installe dans le salon
await deal('tsar'); await p.click('#ts-r'); await p.waitForTimeout(5200); await p.screenshot({ path: SH + 'tsar-5-menagerie.png' });
ok('le décor change : la ménagerie', (await state()).loc === 'menagerie');
await card('Majesté'); st = await state(); ok('dresseur : l\'ours attend dans le salon', st.loc === 'throne' && st.bear && st.flags.includes('bear'), J(st)); await p.screenshot({ path: SH + 'tsar-6-ours.png' });
// 4. le tsar : dîner dans une autre salle, puis l'invitation est posée sur la table
await deal('guard'); await p.click('#ts-r'); await p.waitForTimeout(5200); await p.screenshot({ path: SH + 'tsar-7-diner.png' });
ok('le décor change : la salle à manger', (await state()).loc === 'dining');
await card('Dimitri'); st = await state(); ok('dîner : invitation posée sur la table', st.loc === 'throne' && st.inv && st.flags.includes('access'), J(st));
// 5. le garde payé reste dans la salle, puis la fenêtre de tir est proposée
await p.click('#ts-r'); await p.waitForFunction(() => (document.querySelector('#ts-r')?.textContent || '').includes('signal') && !document.querySelector('.ts-panel.hide'), null, { timeout: 60000 });
st = await state(); ok('garde acheté : il reste dans la salle ; toutes les pistes sont prêtes', st.ally && ['poison', 'train', 'bear', 'access', 'guard'].every(f => st.flags.includes(f)), J(st));
await p.screenshot({ path: SH + 'tsar-8-signal.png' });
await p.click('#ts-r'); await p.waitForSelector('.ts-panel.end', { timeout: 60000 });
ok('le signal donné mène à une fin avec bilan', true); await p.screenshot({ path: SH + 'tsar-9-fin.png' });
for (const k of ['samovar', 'x_samovar', 'train', 'x_train', 'bear', 'x_bear', 'late', 'rave', 'capi', 'c0', 'f0', 'd1', 'f1']) {
  await p.evaluate(() => document.querySelector('#ts-again')?.click()); await p.waitForTimeout(600);
  await p.evaluate(key => window.__tsar.forceEnd(key), k); await p.waitForTimeout(['rave', 'capi', 'train', 'x_train'].includes(k) ? 4200 : 2800);
  await p.screenshot({ path: SH + `tsar-fin-${k}.png` });
  await p.waitForSelector('.ts-panel.end', { timeout: 30000 }).catch(() => {});
  ok('scène de fin ' + k, !!(await p.$('.ts-panel.end h2')));
}
await p.evaluate(() => document.querySelector('#ts-again')?.click()); await p.waitForSelector('#ts-go', { timeout: 8000 }); ok('rejouer : retour au briefing', true);
const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: document.documentElement.clientWidth }));
ok('pas de défilement horizontal', o.sw <= o.W, J(o));
ok('aucune erreur JS', errs.length === 0, J(errs));
process.exit(0);
