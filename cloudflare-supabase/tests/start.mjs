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
const mkS = async (token, w = 390, h = 844) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, token); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
const SHT = '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/';
await DB.prepare("UPDATE users SET coins = 1000 WHERE name = 'Bob'").run();
// 1. l'administrateur lance l'événement pour tous depuis son menu
const pa = await mkS(A);
await pa.evaluate(async () => { adminTab = 'event'; tab = 'admin'; await render(); }); await pa.waitForSelector('#ev-all', { timeout: 8000 });
ok('menu admin : état « Fermé » et bouton pour lancer', (await pa.textContent('#adm')).includes('Fermé') && (await pa.textContent('#ev-all')).includes('Lancer'));
await pa.screenshot({ path: SHT + 'start-0-admin.png' });
await pa.click('#ev-all'); await pa.waitForTimeout(500);
await pa.evaluate(() => { const b = [...document.querySelectorAll('#modal button')].find(x => /Lancer/.test(x.textContent)); b?.click(); }); await pa.waitForTimeout(1500);
const [, cv] = await call(B, 'GET', '/api/commu'); ok('événement ouvert à tous, avec une date de début', cv.on === true && cv.scope === 'all' && cv.since > 0, J(cv).slice(0, 100));
ok('le menu admin affiche « ouvert à tous »', (await pa.textContent('#adm')).includes('ouvert à tous'));
// 2. un joueur ouvre l'appli : la page d'annonce s'affiche toute seule
const pb = await mkS(B); await pb.waitForTimeout(1500);
ok('annonce affichée automatiquement sur l\'accueil', await pb.evaluate(() => tab === 'commustart') && !!(await pb.$('.cs-hero')));
await pb.screenshot({ path: SHT + 'start-1-annonce.png' });
ok('page : taxe de 300 et bouton d\'entrée actif', (await pb.textContent('#view')).includes('300') && !(await pb.$eval('#cs-join', b => b.disabled)));
await pb.click('#cs-icon'); await pb.waitForSelector('.iconsheet #ic-go', { timeout: 5000 }); ok('annonce : bouton « nouvelle icône » avec lien Safari vers le site', (await pb.getAttribute('#ic-go', 'href')).includes('wikimasters.clodowiki.workers.dev/install.html')); await pb.click('#ic-x'); await pb.waitForTimeout(300);
await pb.click('#cs-later'); await pb.waitForTimeout(800);
ok('« Plus tard » : retour à la distribution, bandeau d\'inscription présent', await pb.evaluate(() => tab === 'packs') && !!(await pb.$('#commu-join')));
await pb.click('#commu-join'); await pb.waitForTimeout(800);
ok('le bandeau rouvre la page d\'annonce', await pb.evaluate(() => tab === 'commustart'));
const c0 = +(await DB.prepare("SELECT coins c FROM users WHERE name = 'Bob'").all()).results[0].c;
await pb.click('#cs-join'); await pb.waitForTimeout(2500);
const c1 = +(await DB.prepare("SELECT coins c FROM users WHERE name = 'Bob'").all()).results[0].c;
ok('taxe payée : 300 wikibidou prélevés', c0 - c1 === 300, c0 - c1);
const [, cj] = await call(B, 'GET', '/api/commu'); ok('joueur inscrit avec 500 ₽', cj.joined && cj.wr === 500, J(cj).slice(0, 80));
ok('retour sur la distribution soviétique', await pb.evaluate(() => tab === 'packs'));
const pills = await pb.$$eval('#me .pill', e => e.map(x => x.textContent.trim()));
ok('bandeau du haut : 10 colis et 500 ₽ du Plan (pas ceux du jeu normal)', pills[0] === '10' && /^500\s*₽$/.test(pills[1]), J(pills));
await DB.prepare("UPDATE plan_progress SET packs = 2 WHERE user_id = (SELECT id FROM users WHERE name = 'Bob')").run(); await pb.evaluate(async () => { await loadCommu(true); tab = 'packs'; await render(); }); await pb.waitForTimeout(800);
ok('colis du Parti : décompte avant le prochain colis offert', /prochain (colis )?dans/.test(await pb.textContent('.stock')) && !!(await pb.$('#cd')) && /^\d+:\d\d$/.test((await pb.textContent('#cd')).trim()), await pb.textContent('.stock'));
await pb.evaluate(async () => { tab = 'dquiz'; await render(); }); await pb.waitForTimeout(1000);
ok('quiz en mode communiste : colis du Parti et ₽, pas de minuteur de paquet', /colis du Parti/.test(await pb.textContent('#view')) && !/minuteur remis/.test(await pb.textContent('#view')), (await pb.textContent('#view')).slice(0, 200));
await pb.evaluate(async () => { tab = 'packs'; await render(); }); await pb.waitForTimeout(500);
await pb.screenshot({ path: SHT + 'start-2-inscrit.png' });
// retour au mode classique : un bouton sur l'accueil permet de revenir au mode communiste
await pb.evaluate(async () => { setPref('wm_ussr_ui', '0'); setPref('wm_ussr', '0'); await syncUssrUi(); tab = 'packs'; await render(); }); await pb.waitForTimeout(800);
ok('accueil classique : bouton pour accéder au mode communiste', !!(await pb.$('#commu-enter')));
await pb.click('#commu-enter'); await pb.waitForTimeout(1500);
ok('le bouton rétablit le mode communiste (colis du Parti, plus de bouton)', await pb.evaluate(() => ussrUiOn() && eventUi()) && !(await pb.$('#commu-enter')));
// pause depuis le menu admin : bandeau côté joueur, boutons d'ouverture désactivés, reprise
await pa.evaluate(async () => { adminTab = 'event'; tab = 'admin'; await render(); }); await pa.waitForSelector('#ev-pause', { timeout: 8000 });
await pa.click('#ev-pause'); await pa.waitForTimeout(1500);
ok('menu admin : état EN PAUSE et bouton « Reprendre »', (await pa.textContent('#adm')).includes('EN PAUSE') && (await pa.textContent('#ev-pause')).includes('Reprendre'));
await pb.evaluate(async () => { await loadCommu(true); tab = 'packs'; await render(); }); await pb.waitForTimeout(800);
ok('joueur : bandeau « Événement en pause » et ouverture désactivée', !!(await pb.$('.commu-pause')) && await pb.$eval('#open', b => b.disabled));
await pa.click('#ev-pause'); await pa.waitForTimeout(1500);
await pb.evaluate(async () => { await loadCommu(true); tab = 'packs'; await render(); }); await pb.waitForTimeout(800);
ok('reprise : bandeau disparu', !(await pb.$('.commu-pause')));
// remise à zéro du compte admin : rien dans la collection, sortie automatique du mode communiste
await call(A, 'POST', '/api/commu/join', {}); await pa.evaluate(async () => { await refreshMe(); await loadCommu(true); await syncUssrUi(); adminTab = 'event'; tab = 'admin'; await render(); }); await pa.waitForTimeout(1500); await pa.evaluate(async () => { await render(); }); await pa.waitForSelector('#ev-reset', { timeout: 8000 });
await pa.click('#ev-reset'); await pa.waitForTimeout(500);
await pa.evaluate(() => { const b = [...document.querySelectorAll('#modal button')].find(x => /Repartir de zéro/.test(x.textContent)); b?.click(); }); await pa.waitForTimeout(2500);
ok('remise à zéro : l\'administrateur sort tout seul du mode communiste', await pa.evaluate(() => !ussrUiOn() && !document.body.classList.contains('ussr-ui')));
const [, cz] = await call(A, 'GET', '/api/commu'); ok('remise à zéro : collection, colis et paliers vides, non inscrit', !cz.joined && cz.packs === 0 && cz.wr === 0 && cz.earned === 0, J(cz).slice(0, 120));
const pz = (await DB.prepare("SELECT claimed, cards FROM plan_progress WHERE user_id = (SELECT id FROM users WHERE name = 'Alice')").all()).results[0]; ok('remise à zéro : aucune récompense réclamée, aucune carte', pz.claimed === '[]' && pz.cards === '{}', J(pz));
// 3. un joueur qui rouvre l'appli ne revoit pas l'annonce une seconde fois (déjà inscrit) ; l'annonce n'est montrée qu'une fois pour les autres
await call(null, 'POST', '/api/register', { name: 'Dora', password: 'secret4' }); const [, ld] = await call(null, 'POST', '/api/login', { name: 'Dora', password: 'secret4' });
await DB.prepare("UPDATE users SET coins = 100 WHERE name = 'Dora'").run();
const pd = await mkS(ld.token); await pd.waitForTimeout(1200);
ok('joueur trop pauvre : annonce visible, bouton désactivé', await pd.evaluate(() => tab === 'commustart') && await pd.$eval('#cs-join', b => b.disabled));
await pd.click('#cs-later'); await pd.reload(); await pd.waitForSelector('#app:not([hidden])'); await pd.waitForTimeout(1500);
ok('annonce montrée une seule fois', await pd.evaluate(() => tab !== 'commustart'));
ok('aucune erreur JS', pa.errs.length + pb.errs.length + pd.errs.length === 0, J([...pa.errs, ...pb.errs, ...pd.errs]));
process.exit(0);
