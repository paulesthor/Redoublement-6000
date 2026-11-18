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
import { AUDIT } from './nui-audit.mjs';
// Personnaliser (nouvelle interface) : titres groupés, badges groupés, thème / taille du texte / cadre appliqués, ancien écran Réglages inchangé, avis système alignés.
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
const uid = (await DB.prepare("SELECT id FROM users WHERE name = 'Alice'").all()).results[0].id;
for (const id of ['duelist', 'streak_7', 'ev_alb_monde', 'plan_1', 'camp_1', 'ev_season_podium', 'noel_x']) await DB.prepare('INSERT INTO user_titles (user_id, tid, ts) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(uid, id, Date.now()).run();
await call(A, 'GET', '/api/plan'); await DB.prepare("UPDATE plan_progress SET perks = ? WHERE user_id = ?").bind(JSON.stringify(['theme_siberie', 'frame_gold', 'frame_star']), uid).run();
let p = await mkT(A, { wm_nui_off: '0', wm_ussr_ui: '0' });
await p.evaluate(async () => { await refreshMe(); persoSec = 'profil'; tab = 'perso'; await render(); }); await p.waitForSelector('#pe-seg');
ok('Personnaliser : un seul onglet avec Profil, Titres, Badges et Apparence', (await p.$$('#pe-seg button')).length === 4 && /Profil/.test(await p.textContent('#pe-seg')) && /Apparence/.test(await p.textContent('#pe-seg')));
ok('Menu : « Personnaliser » ouvre cet onglet, et l\'ancien écran y renvoie', await p.evaluate(async () => { tab = 'customize'; await render(); return tab === 'perso' && !!document.querySelector('#pe-seg'); }));
// titres groupés
await p.click('[data-pe=titres]'); await p.waitForSelector('.nu-grp');
const groups = await p.$$eval('.nu-grp > summary b', els => els.map(e => e.textContent));
ok('titres : rangés par thème ou événement (modes, exploits, albums éphémères, défis, saisons, Plan, Camp)', ['Modes de jeu', 'Exploits et collection', 'Albums éphémères', 'Défis et objectifs', 'Saisons', 'Événement communiste · Plan quinquennal', 'Camp du Goulag'].every(g => groups.includes(g)), groups.join(' | '));
ok('titres : le groupe « Albums éphémères » contient les titres d\'album, sans émoji', await p.evaluate(() => { const g = [...document.querySelectorAll('.nu-grp')].find(d => /Albums éphémères/.test(d.querySelector('summary b').textContent)); const t = g.textContent; return /Coupe du monde/.test(t) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t); }));
ok('titres : compteurs par groupe (débloqués / total)', await p.evaluate(() => [...document.querySelectorAll('.nu-grp > summary .nu-cnt')].every(c => /^\d+ \/ \d+$/.test(c.textContent))));
ok('titres : les groupes sans titre équipé sont repliés', await p.evaluate(() => [...document.querySelectorAll('.nu-grp')].filter(d => d.open).length <= 1));
ok('titres : un titre débloqué propose « Équiper »', await p.evaluate(() => [...document.querySelectorAll('.nu-title.ok')].some(b => /Équiper/.test(b.textContent))));
await p.evaluate(() => { document.querySelectorAll('.nu-grp').forEach(d => { d.open = true; }); });
await p.click('.nu-title.ok'); await p.waitForTimeout(900);
ok('titres : toucher un titre l\'équipe (« Équipé »)', (await p.evaluate(() => !!me.title)) && /Équipé/.test(await p.textContent('#pe-body')), await p.evaluate(() => String(me.title)));
await p.click('#ti-none'); await p.waitForTimeout(800); ok('titres : « Ne plus afficher de titre » retire le titre', !(await p.evaluate(() => me.title)));
// badges groupés
await p.click('[data-pe=badges]'); await p.waitForSelector('.nu-badges');
const bg = await p.$$eval('.nu-grp > summary b', els => els.map(e => e.textContent));
ok('badges : rangés par famille (Paquets, Collection, Raretés, Combats, Marché, Social, Économie)', ['Paquets', 'Collection', 'Raretés', 'Combats', 'Marché', 'Social', 'Économie'].every(g => bg.includes(g)) && !bg.includes('Autres'), bg.join(' | '));
ok('badges : 22 badges au total, tous rangés', (await p.evaluate(() => document.querySelectorAll('.nu-badge').length)) === 22);
// apparence : thème et taille du texte
await p.click('[data-pe=theme]'); await p.waitForSelector('.nu-themes');
ok('apparence : thèmes classiques puis thèmes d\'événement, avec verrou pour ceux non gagnés', (await p.$$eval('.nu-sec > h3 span', e => e.map(x => x.textContent))).join() .includes('Classiques,Événements') && (await p.$eval('[data-th=urss]', e => e.disabled)) && !(await p.$eval('[data-th=siberie]', e => e.disabled)));
await p.click('[data-th=ocean]'); await p.waitForTimeout(300);
ok('apparence : toucher un thème l\'applique tout de suite', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'ocean' && (await p.$eval('[data-th=ocean]', e => e.classList.contains('on'))));
await p.click('[data-th=siberie]'); await p.waitForTimeout(800);
ok('apparence : un thème d\'événement gagné s\'applique avec ses textes (menus renommés)', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'siberie' && /Camp de base/.test(await p.textContent('aside nav')), await p.textContent('aside nav'));
const iss = await p.evaluate(AUDIT); ok('apparence (Sibérie) : mise en forme propre', iss.length === 0, iss.slice(0, 3).join(' | '));
await p.click('[data-th=dark]'); await p.waitForTimeout(500);
ok('apparence : retour au thème d\'origine, menus d\'origine', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && /Accueil/.test(await p.textContent('aside nav')));
await p.click('[data-tx=l]'); ok('apparence : taille du texte appliquée', (await p.evaluate(() => document.documentElement.dataset.text)) === 'l'); await p.click('[data-tx=m]');
// profil : cadre de la photo
await p.click('[data-pe=profil]'); await p.waitForSelector('.nu-profile');
ok('profil : le cadre de la photo propose Automatique, Aucun et les cadres gagnés', (await p.$$('.nu-opt')).length === 4, String((await p.$$('.nu-opt')).length));
await p.click('[data-fr=frame_gold]'); await p.waitForTimeout(900);
ok('profil : choisir un cadre l\'enregistre', await p.evaluate(async () => (await api('/me/frame')).choice === 'frame_gold'));
const iss2 = await p.evaluate(AUDIT); ok('profil : mise en forme propre', iss2.length === 0, iss2.slice(0, 3).join(' | '));
// Réglages : l'apparence n'y est plus (nouvelle interface) mais reste complète dans l'ancienne
await p.evaluate(async () => { tab = 'settings'; await render(); }); await p.waitForTimeout(500);
ok('Réglages (nouvelle interface) : plus de thèmes ni de taille du texte, un renvoi vers Personnaliser', !(await p.$('.themes')) && !(await p.$('#tx-seg')) && !!(await p.$('#st-perso')));
await p.click('#st-perso'); await p.waitForSelector('#pe-seg'); ok('Réglages : le renvoi ouvre Personnaliser', true);
await p.evaluate(async () => { setPref('wm_nui_off', '1'); syncNui(); tab = 'settings'; await render(); }); await p.waitForTimeout(600);
ok('Réglages (ancienne interface) : thèmes, cadre et taille du texte toujours là', !!(await p.$('.themes')) && !!(await p.$('#tx-seg')) && (await p.$$('[data-th]')).length >= 7 && !(await p.$('#st-perso')));
await p.click('[data-th=forest]'); await p.waitForTimeout(300); ok('Réglages (ancienne interface) : le thème s\'applique toujours', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'forest');
await p.click('[data-th=dark]'); await p.waitForTimeout(1500); await p.evaluate(async () => { setPref('wm_nui_off', '0'); syncNui(); });   // on attend la fin du rendu lancé par le clic
// avis système alignés sur la marge de la page
await p.evaluate(async () => { me.ev = [{ id: 'reset:1', kind: 'reset', name: 'Remise à zéro', emoji: '♻️', end: Date.now() + 3600000 }, { id: 'album:x', kind: 'album', name: 'Album « Coupe du monde »', emoji: '🏆', end: Date.now() + 5 * 86400000 }]; paintEvBar(); tab = 'packs'; await render(); });
await p.waitForTimeout(700);
const geo = await p.evaluate(() => { const h = document.querySelector('#hits').getBoundingClientRect(), chips = [...document.querySelectorAll('#evb .evchip')].map(c => c.getBoundingClientRect()); return { hl: h.left, hr: h.right, chips: chips.map(c => [Math.round(c.left), Math.round(c.right)]), n: chips.length, text: document.querySelector('#evb').textContent }; });
ok('avis système : alignés sur la barre des légendaires (même marge gauche et droite)', geo.n === 1 && Math.abs(geo.chips[0][0] - geo.hl) <= 1 && Math.abs(geo.chips[0][1] - geo.hr) <= 1, J(geo));
ok('avis système : sans émoji, et les événements ordinaires n\'y sont plus', !/[\u{1F300}-\u{1FAFF}\u{267B}]/u.test(geo.text) && !/Coupe du monde/.test(geo.text));
ok('accueil : l\'album « Coupe du monde » est dans « En ce moment », « » sans retour à la ligne orphelin', await p.evaluate(() => { const r = [...document.querySelectorAll('.nu-row')].find(x => /Coupe du monde/.test(x.textContent)); if (!r) return false; const b = r.querySelector('b'); return /« Coupe du monde »/.test(b.textContent) && b.getClientRects().length >= 1 && !/^»/.test(b.innerText.split('\n').pop().trim()); }));
ok('aucune erreur JS', p.errs.length === 0, J(p.errs));
process.exit(0);
