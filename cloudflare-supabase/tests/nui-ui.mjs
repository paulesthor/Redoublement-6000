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
const mk = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_news_nui', '1'); localStorage.setItem('wm_news_collectif', '1'); if (localStorage.getItem('wm_nui_off') === null) localStorage.setItem('wm_nui_off', '1'); localStorage.setItem('wm_push_ask', '1'); if (!localStorage.getItem('wm_seen_ver')) localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900); return p; };
// Thèmes gagnés : le choix du joueur n'est jamais écrasé par l'événement, les textes suivent le thème, les cadres s'affichent. Captures dans le dossier de travail.
const SHT = process.env.SHOTS || '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/themes/';
await import('node:fs').then(f => f.mkdirSync(SHT, { recursive: true }));
const mkT = async (token, init = {}) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' }); await c.addInitScript(([tok, kv]) => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_news_nui', '1'); localStorage.setItem('wm_news_collectif', '1'); if (localStorage.getItem('wm_nui_off') === null) localStorage.setItem('wm_nui_off', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, [token, init]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
await DB.prepare("UPDATE users SET coins = 2000 WHERE name = 'Bob'").run();
await call(B, 'POST', '/api/daily/claim', {}); await call(A, 'POST', '/api/daily/claim', {});
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/commu/join', {});
const bobId = +(await DB.prepare("SELECT id FROM users WHERE name = 'Bob'").all()).results[0].id;
await DB.prepare("UPDATE plan_progress SET perks = ? WHERE user_id = ?").bind(JSON.stringify(['theme_urss', 'theme_siberie', 'theme_or', 'frame_star', 'frame_hammer', 'frame_gold', 'gold_outline']), bobId).run();
const th = p => p.evaluate(() => document.documentElement.dataset.theme);

await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
import { AUDIT } from './nui-audit.mjs';
const WIDTHS = [320, 360, 390, 430, 768, 1100];
const nuMock = { v: 84 };
let p = await mkT(A, { wm_nui_off: '0', wm_ussr_ui: '0' });
await p.route('**/api/bank', r => r.request().method() === 'GET' ? r.fulfill({ json: { coins: 690, savings: { amount: 0, rate: 0.006, perDay: 0, cap: 5000, lockDays: 7, fee: 0.1, locked: 0, frozen: 0, interest: 0 }, dividends: { daily: 12, cap: 100, raw: 12, maxDays: 7, byRarity: [3, 2, 0, 0, 0, 0], bonus: 0, albums: 0, claimable: nuMock.v, days: 1 } } }) : r.fallback());
await p.route('**/api/bank/dividends/claim', r => { nuMock.v = 0; return r.fulfill({ json: { got: 84 } }); });
await p.evaluate(async () => { await refreshMe(); const H = 3600000; me.ev = [{ id: 'album:x', kind: 'album', name: 'Album « Coupe du monde »', emoji: '🏆', end: Date.now() + 6 * 24 * H + 4 * H }, { id: 'golden:x', kind: 'golden', name: 'Heure dorée', emoji: '✨', end: Date.now() + 41 * 60000 }]; });
ok('la nouvelle interface est active pour l\'administrateur', await p.evaluate(() => nuiOn() && document.body.classList.contains('nui')));
ok('barre du bas : 5 entrées (Accueil, Collection, Jouer, Marché, Menu)', (await p.$$('aside nav button')).length === 5 && /Accueil/.test(await p.textContent('aside nav')) && /Menu/.test(await p.textContent('aside nav')));
const SCREENS = [['packs', 'accueil'], ['coll', 'collection'], ['jouer', 'jouer'], ['marche', 'marché'], ['bank', 'banque (sous-écran)'], ['dquiz', 'quiz du jour (sous-écran)'], ['albums', 'albums (sous-écran)'], ['settings', 'réglages (sous-écran)']];
for (const w of WIDTHS) {
  await p.setViewportSize({ width: w, height: w >= 1000 ? 900 : 844 });
  for (const [t, name] of SCREENS) {
    await p.evaluate(async t => { tab = t; await render(); }, t); await p.waitForTimeout(t === 'packs' ? 900 : 500);
    const iss = await p.evaluate(AUDIT);
    ok(`${w} px · ${name} : mise en forme propre`, iss.length === 0, [...new Set(iss)].slice(0, 5).join(' | '));
    if (w === 390 || (w === 320 && t === 'packs')) await p.screenshot({ path: SHT + `nui-${w}-${t}.png` });
  }
  for (const sec of ['profil', 'titres', 'badges', 'theme']) {
    await p.evaluate(async sec => { persoSec = sec; tab = 'perso'; await render(); document.querySelectorAll('details.nu-grp').forEach(d => { d.open = true; }); }, sec); await p.waitForTimeout(600);
    const is2 = await p.evaluate(AUDIT); ok(`${w} px · personnaliser (${sec}) : mise en forme propre`, is2.length === 0, [...new Set(is2)].slice(0, 5).join(' | '));
    if (w === 390) await p.screenshot({ path: SHT + `nui-390-perso-${sec}.png` });
  }
  await p.evaluate(() => nuMenu()); await p.waitForTimeout(400);
  const iss = await p.evaluate(AUDIT); ok(`${w} px · menu : mise en forme propre`, iss.length === 0, [...new Set(iss)].slice(0, 5).join(' | '));
  if (w === 390) await p.screenshot({ path: SHT + 'nui-390-menu.png' });
  await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; });
}
await p.setViewportSize({ width: 390, height: 844 });
// parcours
nuMock.v = 84;
await p.evaluate(async () => { tab = 'packs'; await render(); }); await p.waitForTimeout(900);
const tl = async () => (await p.$$eval('.nu-tiles .nu-tile b', e => e.map(x => x.textContent))).join(' | ');
ok('aujourd\'hui : quiz non fait, dividendes à récupérer, aucune expédition : Quiz | Banque | Expéditions', (await p.$$('.nu-tiles .nu-tile')).length === 3 && /\+84/.test(await p.textContent('#nu-bank')) && (await tl()) === 'Quiz du jour | Banque | Expéditions', await tl());
ok('aujourd\'hui : plus de tuile Quêtes', !/Quêtes/.test(await p.textContent('#nu-today')));
ok('accueil : l\'événement de Noël est présenté', /Calendrier de l'Avent/.test(await p.textContent('#view')));
ok('accueil : plus de tuile « Récompense »', !/Récompense/.test(await p.textContent('#nu-today')));
await p.click('#nu-bank'); await p.waitForTimeout(1500);
ok('toucher la tuile Banque récupère les dividendes : la tuile disparaît, une autre prend sa place (toujours trois)', (await p.$$('.nu-tiles .nu-tile')).length === 3 && !(await p.$('#nu-bank')), await tl());
const setMe = async o => { await p.evaluate(async o => { Object.assign(me, o); tab = 'packs'; await render(); }, o); await p.waitForTimeout(700); };
await setMe({ dq: 'done', ex: 0, exo: 0 }); ok('quiz fait : il laisse sa place (expédition à lancer, puis autre chose)', !/Quiz du jour/.test(await tl()) && /Expéditions/.test(await tl()) && (await p.$$('.nu-tiles .nu-tile')).length === 3, await tl());
await setMe({ dq: 'done', ex: 2, exo: 2 }); ok('expéditions de retour : tuile « 2 de retour » en tête', /^Expéditions/.test(await tl()) && /2 de retour/.test(await p.textContent('#nu-today')), await tl());
await setMe({ dq: 'done', ex: 0, exo: 1 }); ok('expédition en cours, rien à récupérer : plus de tuile Expéditions, on propose un jeu', !/Expéditions/.test(await tl()) && /Plus ou moins/.test(await tl()), await tl());
await setMe({ dq: 'new', ex: 0, exo: 0 });
{ const iss = await p.evaluate(AUDIT); ok('aujourd\'hui (nouvelles tuiles) : mise en forme propre', iss.length === 0, iss.slice(0, 3).join(' | ')); }
await p.screenshot({ path: SHT + 'nui-390-accueil-sans-banque.png' });
await p.click('aside nav [data-tab=coll]'); await p.waitForSelector('.nu-search'); ok('barre : Collection ouvre le hub', /Chercher une carte/.test(await p.textContent('#view')));
await p.click('.nu-row[data-nugo=albums]'); await p.waitForTimeout(700);
ok('sous-écran : bouton retour « Collection » et entrée Collection allumée', !!(await p.$('.nu-back')) && /Collection/.test(await p.textContent('.nu-back')) && /on/.test(await p.getAttribute('aside nav [data-tab=coll]', 'class')));
await p.click('.nu-back'); await p.waitForSelector('.nu-search'); ok('retour : revient au hub Collection', true);
await p.click('aside nav [data-tab=jouer]'); await p.waitForSelector('.nu-feat'); ok('barre : Jouer présente l\'événement et les combats', /Noël au Pôle Nord/.test(await p.textContent('#view')) && /Combats/.test(await p.textContent('#view')));
await p.click('aside nav [data-tab=menu]'); await p.waitForSelector('.nu-sheet'); ok('barre : Menu ouvre la liste (Communauté, Mon compte, Administration)', /Communauté/.test(await p.textContent('.nu-sheet')) && /Mon compte/.test(await p.textContent('.nu-sheet')) && /Administration/.test(await p.textContent('.nu-sheet')));
await p.click('.nu-sheet [data-go=settings]'); await p.waitForSelector('#st-nui'); ok('réglages : l\'interrupteur de la nouvelle interface est là', await p.isChecked('#st-nui'));
await p.evaluate(() => { const c = document.querySelector('#st-nui'); c.checked = false; c.dispatchEvent(new Event('change')); }); await p.waitForTimeout(600);
ok('interrupteur coupé : retour à l\'ancienne barre (Boosters…)', /Boosters/.test(await p.textContent('aside nav')) && !(await p.evaluate(() => document.body.classList.contains('nui'))));
// un joueur ordinaire a la nouvelle interface, sans pouvoir revenir en arrière ; le message de mise à jour s'affiche une fois
const Bt = (await call(null, 'POST', '/api/register', { name: 'Zoe', password: 'secret3' }))[1].token;
const pz = await mkT(Bt, { wm_nui_off: '1', wm_ussr_ui: '0' }); ok('joueur ordinaire : nouvelle interface, même avec un ancien réglage', await pz.evaluate(() => nuiOn() && document.body.classList.contains('nui') && /Accueil/.test(document.querySelector('aside nav').textContent)));
ok('joueur ordinaire : pas d\'interrupteur pour revenir à l\'ancienne', !(await pz.$('#st-nui')) && !(await pz.evaluate(async () => { tab = 'settings'; await render(); return !!document.querySelector('#st-nui'); })));
ok('message de mise à jour : affiché une seule fois, avec la phrase sur Justine', await pz.evaluate(() => { localStorage.removeItem('wm_news_nui'); const shown = newsScreen(() => {}); const t = document.querySelector('#modal').textContent; document.querySelector('#nw-go').click(); return shown && /Pas content \? Ce n'est pas le problème de Justine/.test(t) && localStorage.getItem('wm_news_nui') === '1' && !newsScreen(() => {}); }));
await pz.evaluate(() => { localStorage.removeItem('wm_news_nui'); newsScreen(() => {}); }); const isz = await pz.evaluate(AUDIT); ok('message de mise à jour : mise en forme propre', isz.length === 0, isz.slice(0, 3).join(' | '));
// communiqué « Fin de la propriété privée » et heure collective
ok('communiqué : affiché une seule fois, avec les trois articles', await pz.evaluate(() => { const md = document.querySelector('#modal'); md.hidden = true; md.innerHTML = ''; localStorage.removeItem('wm_news_collectif'); const shown = collectifScreen(() => {}); const t = document.querySelector('#modal').textContent; document.querySelector('#nc-gotit').click(); return shown && /Fin de la propriété privée/.test(t) && /Article 1/.test(t) && /Article 2/.test(t) && /Article 3/.test(t) && /Heure collective/.test(t) && localStorage.getItem('wm_news_collectif') === '1' && !collectifScreen(() => {}); }));
ok('mises à jour : la nouvelle interface d\'abord, puis le communiqué, puis la suite', await pz.evaluate(async () => { const md = document.querySelector('#modal'); md.hidden = true; md.innerHTML = ''; localStorage.removeItem('wm_news_nui'); localStorage.removeItem('wm_news_collectif'); const log = []; const shown = newsScreens(() => log.push('fin')); log.push(/Nouvelle interface/.test(document.querySelector('#modal').textContent) ? 'nui' : '?'); document.querySelector('#nw-go').click(); log.push(/Fin de la propriété/.test(document.querySelector('#modal').textContent) ? 'collectif' : '?'); document.querySelector('#nc-gotit').click(); return shown && log.join() === 'nui,collectif,fin'; }));
await pz.evaluate(() => { localStorage.removeItem('wm_news_collectif'); collectifScreen(() => {}); }); await pz.waitForTimeout(300);
for (const [w, h] of [[390, 844], [320, 568]]) { await pz.setViewportSize({ width: w, height: h }); await pz.waitForTimeout(200); const isc = await pz.evaluate(AUDIT); ok(`communiqué (${w} px) : mise en forme propre`, isc.length === 0, isc.slice(0, 3).join(' | ')); await pz.screenshot({ path: SHT + `communique-${w}.png` }); }
await pz.evaluate(() => { document.querySelector('#nc-gotit').click(); }); await pz.setViewportSize({ width: 390, height: 844 });
await pz.evaluate(async () => { me.ev = [{ id: 'nounique:x', kind: 'nounique', name: 'Heure collective', emoji: '★', end: Date.now() + 41 * 60000 }]; tab = 'packs'; await render(); }); await pz.waitForTimeout(700);
ok('heure collective : ligne rouge dans « En ce moment », avec son nom', await pz.evaluate(() => { const r = [...document.querySelectorAll('.nu-row.red')].find(x => /Heure collective/.test(x.textContent)); return !!r && /Propriété privée abolie/.test(r.textContent); }));
const ihc = await pz.evaluate(AUDIT); ok('heure collective : mise en forme propre', ihc.length === 0, ihc.slice(0, 3).join(' | ')); await pz.evaluate(() => document.querySelector('.nu-row.red')?.scrollIntoView({ block: 'center' })); await pz.waitForTimeout(200); await pz.screenshot({ path: SHT + 'heure-collective.png' });
await pz.evaluate(async () => { me.admin = true; setPref('wm_nui_off', '1'); syncNui(); paintEvBar(); }); await pz.waitForTimeout(300);
ok('heure collective : bandeau rouge dans l\'ancienne interface', await pz.evaluate(() => { const c = document.querySelector('#evb .evchip.nounique'); return !!c && /Heure collective/.test(c.textContent) && getComputedStyle(c).backgroundImage.includes('rgb(179, 20, 27)'); }));
await pz.screenshot({ path: SHT + 'heure-collective-ancienne.png' });
ok('aucune erreur JS', p.errs.length === 0 && pz.errs.length === 0, J([...p.errs, ...pz.errs]));
process.exit(0);
