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
    res.writeHead(rr.status, { 'content-type': rr.headers.get('content-type') || 'application/json' }); return res.end(Buffer.from(await rr.arrayBuffer()));
  }
  let p = path.join(PUB, u.pathname); if (p.endsWith('/')) p += 'index.html'; if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(8767);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const mk = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_news_nui', '1'); if (localStorage.getItem('wm_nui_off') === null) localStorage.setItem('wm_nui_off', '1'); localStorage.setItem('wm_push_ask', '1'); if (!localStorage.getItem('wm_seen_ver')) localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900); return p; };
// Thèmes gagnés : le choix du joueur n'est jamais écrasé par l'événement, les textes suivent le thème, les cadres s'affichent. Captures dans le dossier de travail.
const SHT = process.env.SHOTS || '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/themes/';
await import('node:fs').then(f => f.mkdirSync(SHT, { recursive: true }));
const mkT = async (token, init = {}) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' }); await c.addInitScript(([tok, kv]) => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_news_nui', '1'); if (localStorage.getItem('wm_nui_off') === null) localStorage.setItem('wm_nui_off', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, [token, init]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
await DB.prepare("UPDATE users SET coins = 2000 WHERE name = 'Bob'").run();
await call(B, 'POST', '/api/daily/claim', {}); await call(A, 'POST', '/api/daily/claim', {});
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/commu/join', {});
const bobId = +(await DB.prepare("SELECT id FROM users WHERE name = 'Bob'").all()).results[0].id;
await DB.prepare("UPDATE plan_progress SET perks = ? WHERE user_id = ?").bind(JSON.stringify(['theme_urss', 'theme_siberie', 'theme_or', 'frame_star', 'frame_hammer', 'frame_gold', 'gold_outline']), bobId).run();
const th = p => p.evaluate(() => document.documentElement.dataset.theme);
// Cartes de Noël (interface) : blocs du calendrier, hotte, ma carte, album, animation du 25, écran administrateur. Captures dans le dossier de travail.
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
await DB.prepare("INSERT INTO event_progress (key, user_id, n) VALUES ('nl:flocons', 1, 300) ON CONFLICT (key, user_id) DO UPDATE SET n = 300").run();
const tmp = await browser.newContext({ viewport: { width: 300, height: 400 } }); const tp = await tmp.newPage(); await tp.setContent('<body style="margin:0;background:linear-gradient(135deg,#c0392b,#f1c40f)"><h1 style="font:700 60px sans-serif;color:#fff;padding:60px 20px">Carte</h1></body>');
const JPG = (await tp.screenshot({ type: 'jpeg', quality: 70 })).toString('base64'); await tmp.close();
await call(A, 'POST', '/api/noel/card-art', { id: 90000001, data: JPG }); await call(A, 'POST', '/api/noel/card-art', { id: 90000003, data: JPG });
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/noel/photo', { data: JPG, consent: true }); await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
let p = await mkT(A, { wm_noel_day: '9', wm_ussr_ui: '0' });
const over = () => p.evaluate(() => { const W = document.documentElement.clientWidth, bad = []; document.querySelectorAll('#view *, .nc-gift *, #modal *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1) && !e.closest('.nl-grid')) bad.push((e.className || e.tagName) + ' ' + Math.round(r.left) + '→' + Math.round(r.right)); }); return [...new Set(bad)].slice(0, 5).concat(document.documentElement.scrollWidth > W + 1 ? ['scrollX ' + document.documentElement.scrollWidth] : []); });
for (const [w, h] of [[390, 844], [320, 568]]) {
  await p.setViewportSize({ width: w, height: h });
  await p.evaluate(async () => { await refreshMe(); tab = 'noelcal'; await render(); }); await p.waitForSelector('#nl-extra .nc-block', { timeout: 8000 }); await p.waitForTimeout(500);
  ok(`calendrier ${w} px : hotte, album et « ma carte » affichés`, (await p.$$('#nl-extra .nc-block')).length === 2 && !!(await p.$('.nc-mine')) && /La hotte/.test(await p.textContent('#nl-extra')));
  ok(`calendrier ${w} px : rien ne déborde`, (await over()).length === 0, J(await over()));
  await p.evaluate(() => document.querySelector('#nl-extra').scrollIntoView()); await p.screenshot({ path: SHT + `nc-calendrier-${w}.png` });
}
await p.setViewportSize({ width: 390, height: 844 });
await p.evaluate(async () => { await refreshMe(); tab = 'noelcal'; await render(); }); await p.waitForSelector('#nl-extra [data-n="1"]'); await p.waitForTimeout(400);
await p.click('#nl-extra [data-n="5"]'); await p.waitForSelector('.nc-grid .nc-card'); await p.waitForTimeout(500);
ok('hotte : cinq cartes tirées, présentées avec leur titre', (await p.$$('.nc-grid .nc-card')).length === 5 && /Il te reste 0 flocon|Il te reste/.test(await p.textContent('#modal')), await p.textContent('#modal'));
ok('hotte : mise en forme propre', (await over()).length === 0, J(await over())); await p.screenshot({ path: SHT + 'nc-hotte.png' });
await p.click('#nc-x'); await p.waitForTimeout(600);
ok('hotte : les flocons sont débités (300 → 0)', +(await DB.prepare("SELECT n FROM event_progress WHERE key = 'nl:flocons' AND user_id = 1").all()).results[0].n === 0);
// ma carte : consentement obligatoire, puis photo envoyée
await p.evaluate(async () => { tab = 'noelcal'; await render(); }); await p.waitForSelector('#nc-file', { state: 'attached' });
await p.setInputFiles('#nc-file', { name: 'moi.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPG, 'base64') }); await p.waitForTimeout(700);
ok('ma carte : sans case cochée, rien n\'est envoyé', (await DB.prepare('SELECT COUNT(*) n FROM noel_photos WHERE user_id = 1').all()).results[0].n == 0);
await p.check('#nc-ok'); await p.setInputFiles('#nc-file', { name: 'moi.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPG, 'base64') }); await p.waitForTimeout(1200);
ok('ma carte : photo envoyée après consentement', (await DB.prepare('SELECT COUNT(*) n FROM noel_photos WHERE user_id = 1').all()).results[0].n == 1);
await p.waitForSelector('#nc-del'); ok('ma carte : message d\'attente et bouton pour retirer la photo', /bien arrivée/.test(await p.textContent('.nc-mine')) && !!(await p.$('#nc-del')));
await p.evaluate(() => document.querySelector('.nc-mine').scrollIntoView()); await p.screenshot({ path: SHT + 'nc-macarte.png' });
// album de Noël
await p.evaluate(async () => { tab = 'albums'; await render(); }); await p.waitForTimeout(1200);
ok('album de Noël : présent dans la liste des albums', /Noël/.test(await p.textContent('#view')));
await p.screenshot({ path: SHT + 'nc-albums.png' });
// écran administrateur
await p.evaluate(async () => { adminTab = 'noel'; tab = 'admin'; await render(); }); await p.waitForSelector('.nc-prow', { timeout: 8000 }); await p.waitForTimeout(800);
ok('administrateur : photos des joueurs listées avec dessin, titre et article à remplir', (await p.$$('.nc-prow')).length === 2 && !!(await p.$('.nc-prow .nc-x')) && (await p.$$('.nc-base .nc-b')).length === 6, String((await p.$$('.nc-prow')).length));
ok('administrateur : la photo se charge (aperçu)', await p.evaluate(() => !!document.querySelector('.nc-thumb img')));
await p.evaluate(() => document.querySelector('.nc-admin').scrollIntoView()); await p.screenshot({ path: SHT + 'nc-admin.png' });
await p.fill('.nc-prow[data-uid="2"] .nc-t', 'Bob de l\'Atelier'); await p.fill('.nc-prow[data-uid="2"] .nc-x', 'Bob est un lutin. Il pense que le salaire est une légende.');
await p.click('.nc-prow[data-uid="2"] .nc-save'); await p.waitForTimeout(1200);
ok('administrateur : la carte de Bob est créée depuis l\'écran', (await DB.prepare('SELECT title FROM cards WHERE id = 91000002').all()).results[0]?.title === 'Bob de l\'Atelier');
// animation du 25
for (const [w, h] of [[390, 844], [320, 568], [1100, 800]]) {
  await p.setViewportSize({ width: w, height: h });
  await p.evaluate(async () => { adminTab = 'noel'; tab = 'admin'; await render(); }); await p.waitForSelector('#nc-prev'); await p.click('#nc-prev');
  await p.waitForSelector('.nc-gift'); await p.waitForTimeout(1300); await p.screenshot({ path: SHT + `nc-25-${w}-a.png` });
  await p.waitForTimeout(2200); await p.screenshot({ path: SHT + `nc-25-${w}-b.png` });
  await p.waitForSelector('#nc-take:not([hidden])', { timeout: 8000 }); await p.waitForTimeout(800); await p.screenshot({ path: SHT + `nc-25-${w}-c.png` });
  ok(`animation du 25 (${w} px) : titre, texte et bouton visibles, rien ne déborde`, /Il descend du ciel/.test(await p.textContent('.nc-gift')) && (await over()).length === 0, J(await over()));
  const bb = await p.evaluate(() => { const g = document.querySelector('.nc-gcard').getBoundingClientRect(), c = document.querySelector('.nc-copy').getBoundingClientRect(); return [Math.round(g.bottom), Math.round(c.top)]; });
  ok(`animation du 25 (${w} px) : la carte ne passe pas sous le texte`, bb[0] <= bb[1] + 4, J(bb));
  await p.click('#nc-take'); await p.waitForTimeout(500);
  ok(`animation du 25 (${w} px) : aperçu, aucune carte donnée`, !(await p.$('.nc-gift')) && (await DB.prepare("SELECT COUNT(*) n FROM inventory WHERE user_id = 1 AND card_id = 90000006").all()).results[0].n == 0);
}
// réception réelle (administrateur : jour simulé 25)
await p.setViewportSize({ width: 390, height: 844 });
await p.evaluate(async () => { adminTab = 'noel'; tab = 'admin'; await render(); }); await p.waitForSelector('#nc-give'); await p.click('#nc-give');
await p.waitForSelector('#nc-take:not([hidden])', { timeout: 8000 }); await p.click('#nc-take'); await p.waitForSelector('.nc-gcard.got', { timeout: 8000 }); await p.waitForTimeout(700);
await p.screenshot({ path: SHT + 'nc-25-recu.png' });
ok('cadeau du 25 : la carte légendaire est dans la collection', (await DB.prepare("SELECT COUNT(*) n FROM inventory WHERE user_id = 1 AND card_id = 90000006").all()).results[0].n == 1);
await p.click('#nc-take');
ok('aucune erreur JS', p.errs.length === 0, J(p.errs));
process.exit(0);
