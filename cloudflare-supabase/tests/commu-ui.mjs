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
// Événement communiste vu par un joueur ordinaire (Bob) : annonce, inscription, thème, jeux, gains, classement, fin.
const mkAs = async (token, w = 390, h = 844) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); if (!localStorage.getItem('wm_seen_ver')) localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, token); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
await DB.prepare('UPDATE users SET coins = 1000 WHERE name = ?').bind('Bob').run();
const coinsOf = async n => +(await DB.prepare('SELECT coins c FROM users WHERE name = ?').bind(n).all()).results[0].c;
const quiet = p => p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
const SHS = '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/';
// 1. événement fermé : Bob ne voit rien du mode
let pb = await mkAs(B);
ok('fermé : pas de bandeau d\'inscription', !(await pb.$('#commu-join')));
ok('fermé : pas de thème rouge ni d\'onglets du Parti', await pb.evaluate(() => document.documentElement.dataset.theme !== 'urss' && !document.body.classList.contains('ussr-ui')));
ok('fermé : le Camp et le Plan sont inaccessibles à Bob', await pb.evaluate(async () => { tab = 'plan'; await render(); const a = tab; tab = 'gulag'; await render(); return a === 'packs' && tab === 'packs'; }));
await pb.context().close();
// 2. l'administrateur ouvre l'événement (via l'API, comme le fera le bouton de lancement)
const [s0] = await call(A, 'POST', '/api/commu/set', { on: true }); ok('l\'administrateur ouvre l\'événement', s0 === 200);
pb = await mkAs(B); await pb.waitForTimeout(1200);
ok('ouvert : bandeau d\'inscription sur l\'accueil', !!(await pb.$('#commu-join')));
await pb.screenshot({ path: SHS + 'commu-1-bandeau.png' });
await pb.click('#commu-join'); await pb.waitForSelector('#cm-join'); await pb.screenshot({ path: SHS + 'commu-2-inscription.png' });
ok('fenêtre d\'inscription : taxe de 300 wikibidou, 500 ₽ de départ, cagnotte', (await pb.textContent('.iconsheet')).includes('300') && (await pb.textContent('.iconsheet')).includes('500'));
await pb.click('#cm-join'); await pb.waitForTimeout(2000);
ok('inscription : 300 wikibidou prélevés', await coinsOf('Bob') === 700, await coinsOf('Bob'));
ok('inscrit : thème rouge et habillage appliqués automatiquement', await pb.evaluate(() => document.documentElement.dataset.theme === 'urss' && document.body.classList.contains('ussr-ui')));
ok('inscrit : la barre du bas passe à 4 onglets', await pb.evaluate(() => [...document.querySelectorAll('aside nav button')].filter(b => getComputedStyle(b).display !== 'none').length === 4));
await pb.screenshot({ path: SHS + 'commu-3-inscrit.png' });
// 3. jeux et Plan accessibles à un simple joueur
await pb.evaluate(async () => { duelDirect = false; tab = 'duel'; await render(); }); await pb.waitForSelector('[data-jeu]');
ok('Les Jeux : Camp, Patates et Tsar visibles pour un joueur inscrit', (await pb.$$('[data-jeu=gulag],[data-jeu=potato],[data-jeu=tsar]')).length === 3);
await pb.evaluate(async () => { tab = 'plan'; await render(); }); await pb.waitForSelector('.rd');
ok('Plan : 12 paliers, solde 500 ₽, boutons de démo cachés', (await pb.$$('.rd')).length === 12 && (await pb.textContent('.plan-wallet')).includes('500') && !(await pb.$('[data-earn]')));
await pb.screenshot({ path: SHS + 'commu-4-plan.png' });
// 4. un jeu rapporte des wikiroubles (calculés par le serveur)
await pb.evaluate(async () => { await commuEarn('tsar', { ending: 'samovar' }); }); await pb.waitForTimeout(800);
const [, st1] = await call(B, 'GET', '/api/commu'); ok('Tsar : première fin découverte = 40 ₽ (500 → 540)', st1.wr === 540 && st1.earned === 40, J({ wr: st1.wr, e: st1.earned }));
await pb.evaluate(async () => { await commuEarn('potato', { score: 2400 }); }); await pb.waitForTimeout(800);
const [, st2] = await call(B, 'GET', '/api/commu'); ok('Patates : 2 400 points = 60 ₽', st2.earned === 100, J({ e: st2.earned }));
// 5. un autre joueur simulé fait grimper son score ; classement et cagnotte
await call(null, 'POST', '/api/register', { name: 'Carole', password: 'secret3' }); const [, lc] = await call(null, 'POST', '/api/login', { name: 'Carole', password: 'secret3' }); const Cc = lc.token;
await DB.prepare("UPDATE users SET coins = 1000 WHERE name = 'Carole'").run(); await call(Cc, 'POST', '/api/commu/join', {});
await DB.prepare("UPDATE plan_progress SET earned = 900, earn_ts = 1 WHERE user_id = (SELECT id FROM users WHERE name = 'Carole')").run();
await pb.evaluate(async () => { tab = 'plan'; await render(); }); await pb.waitForSelector('#plan-top'); await pb.click('#plan-top'); await pb.waitForSelector('.st-row');
const rows = await pb.$$eval('.st-row', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim())); ok('classement : Carole 1re, Bob 2e, sa ligne mise en évidence', rows[0].includes('Carole') && rows[1].includes('Bob') && (await pb.$('.st-row.me')) !== null, J(rows));
ok('cagnotte affichée : 2 inscrits × 300 + admin 0', (await pb.textContent('.moresheet')).includes('600'), (await pb.textContent('.moresheet')).slice(0, 160));
await pb.screenshot({ path: SHS + 'commu-5-classement.png' }); await quiet(pb);
// 6. réglages : interrupteur du mode, retour au capitalisme
await pb.evaluate(async () => { tab = 'settings'; await render(); }); await pb.waitForSelector('#st-commu');
ok('Réglages : interrupteur « Mode communiste » pour un inscrit, panneau admin absent', !(await pb.$('#st-cm-on')));
await pb.click('#st-commu'); await pb.waitForTimeout(1500);
ok('mode coupé : retour au thème et aux menus d\'origine', await pb.evaluate(() => document.documentElement.dataset.theme !== 'urss' && !document.body.classList.contains('ussr-ui')));
await pb.click('#st-commu'); await pb.waitForTimeout(1500);
ok('mode rétabli : thème rouge de nouveau', await pb.evaluate(() => document.documentElement.dataset.theme === 'urss' && document.body.classList.contains('ussr-ui')));
// 7. fin de l'événement : Carole gagne, Bob garde le thème seulement s'il a atteint le palier 6
const [sf, vf] = await call(A, 'POST', '/api/commu/finish', {}); ok('fin : Carole gagne la cagnotte de 600', sf === 200 && vf.winner?.name === 'Carole' && vf.winner.prize === 600, J(vf));
await pb.evaluate(async () => { await loadCommu(true); await syncUssrUi(); tab = 'packs'; render(); }); await pb.waitForTimeout(1200);
ok('fin : Bob (sous le palier 6) retrouve son thème d\'origine', await pb.evaluate(() => document.documentElement.dataset.theme !== 'urss' && !document.body.classList.contains('ussr-ui')));
await pb.context().close();
// 8. un joueur qui avait atteint le palier 6 garde le thème rouge dans ses réglages
await call(A, 'POST', '/api/commu/set', { on: true });
await DB.prepare("UPDATE plan_progress SET earned = 3000 WHERE user_id = (SELECT id FROM users WHERE name = 'Bob')").run();
const [sc] = await call(B, 'POST', '/api/plan/claim', { id: 6 }); ok('Bob atteint le palier 6 : récompense réclamée', sc === 200, sc);
await call(A, 'POST', '/api/commu/finish', {}); const pb2 = await mkAs(B); await pb2.evaluate(async () => { await loadCommu(true); tab = 'settings'; await render(); }); await pb2.waitForTimeout(1200);
ok('après l\'événement, le palier 6 donne le thème « Camarade » dans les réglages', (await pb2.$('.themes button[data-th="urss"], .themes [data-theme="urss"], .themes button:has-text("Camarade")')) !== null);
ok('aucune erreur JS', pb2.errs.length === 0, J(pb2.errs)); await pb2.context().close();
process.exit(0);
