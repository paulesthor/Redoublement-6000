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
// Thèmes gagnés : le choix du joueur n'est jamais écrasé par l'événement, les textes suivent le thème, les cadres s'affichent. Captures dans le dossier de travail.
const SHT = process.env.SHOTS || '/tmp/claude-0/-home-user-Redoublement-6000/37801998-3ced-5dcb-85ba-95e236d12c04/scratchpad/themes/';
await import('node:fs').then(f => f.mkdirSync(SHT, { recursive: true }));
const mkT = async (token, init = {}) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' }); await c.addInitScript(([tok, kv]) => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } localStorage.setItem('wm_token', tok); localStorage.setItem('wm_news_feed', '1'); localStorage.setItem('wm_push_ask', '1'); localStorage.setItem('wm_sound', '0'); localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, [token, init]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8767/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); return p; };
await DB.prepare("UPDATE users SET coins = 2000 WHERE name = 'Bob'").run();
await call(B, 'POST', '/api/daily/claim', {}); await call(A, 'POST', '/api/daily/claim', {});
await call(A, 'POST', '/api/commu/set', { on: true, scope: 'all' }); await call(B, 'POST', '/api/commu/join', {});
const bobId = +(await DB.prepare("SELECT id FROM users WHERE name = 'Bob'").all()).results[0].id;
await DB.prepare("UPDATE plan_progress SET perks = ? WHERE user_id = ?").bind(JSON.stringify(['theme_urss', 'theme_siberie', 'theme_or', 'frame_star', 'frame_hammer', 'frame_gold', 'gold_outline']), bobId).run();
const th = p => p.evaluate(() => document.documentElement.dataset.theme);

await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
import { AUDIT, CONTRAST, CONTRAST_SEL } from './nui-audit.mjs';
// Vérification de la nouvelle interface dans TOUS les thèmes : mise en forme (débordements, textes coupés, recouvrements…), contraste mesuré sur l'image affichée,
// thème réellement appliqué, textes des thèmes d'événement. THEMES=dark,light,… pour n'en tester que certains.
await call(A, 'POST', '/api/noel/set', { on: true, scope: 'admin' });
const ALL = [['dark', 'dark'], ['midnight', 'midnight'], ['ocean', 'ocean'], ['forest', 'forest'], ['violet', 'violet'], ['light', 'light'], ['beige', 'beige'], ['auto-sombre', 'auto', 'dark'], ['auto-clair', 'auto', 'light'], ['urss', 'urss'], ['siberie', 'siberie'], ['or', 'or']];
const want = (process.env.THEMES || '').split(',').filter(Boolean), THEMES = want.length ? ALL.filter(t => want.includes(t[0])) : ALL;
const SCREENS = [['packs', 'accueil'], ['coll', 'collection'], ['jouer', 'jouer'], ['marche', 'marché'], ['perso:profil', 'perso-profil'], ['perso:titres', 'perso-titres'], ['perso:badges', 'perso-badges'], ['perso:theme', 'perso-apparence'], ['menu', 'menu'], ['settings', 'réglages']];
const MIN = 4.0;   // contraste minimal accepté (mesure sur pixels : on garde une marge sous le 4,5 théorique)
const NAV = { urss: 'Le Parti', siberie: 'Camp de base', or: 'Salon' };
for (const [name, theme, scheme] of THEMES) {
  const p = await mkT(A, { wm_nui: '1', wm_ussr_ui: '0', wm_theme: theme });
  if (scheme) { await p.emulateMedia({ colorScheme: scheme }); await p.reload(); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(1500); await p.evaluate(() => { const m = document.querySelector('#modal'); m.hidden = true; m.innerHTML = ''; }); }
  await p.evaluate(async () => { await refreshMe(); const H = 3600000; me.ev = [{ id: 'album:x', kind: 'album', name: 'Album « Coupe du monde »', emoji: '🏆', end: Date.now() + 6 * 24 * H }, { id: 'golden:x', kind: 'golden', name: 'Heure dorée', emoji: '✨', end: Date.now() + 41 * 60000 }]; });
  const applied = await p.evaluate(() => ({ th: document.documentElement.dataset.theme, nav: document.querySelector('aside nav').textContent, skin: [...document.body.classList].join(' ') }));
  const expect = theme === 'auto' ? (scheme === 'light' ? 'light' : 'dark') : theme;
  ok(`${name} : thème appliqué`, applied.th === expect, J(applied));
  if (NAV[theme]) ok(`${name} : menus renommés par le thème (« ${NAV[theme]} »)`, applied.nav.includes(NAV[theme]) && /skin|ussr/.test(applied.skin), applied.nav.slice(0, 80) + ' | ' + applied.skin);
  const lows = [];
  for (const w of [390, 320]) {
    await p.setViewportSize({ width: w, height: 844 });
    for (const [t, label] of SCREENS) {
      await p.evaluate(async t => {
        document.querySelector('#modal').hidden = true; document.querySelector('#modal').innerHTML = '';
        if (t === 'menu') { tab = 'packs'; await render(); return nuMenu(); }
        const [tb, sec] = t.split(':'); if (sec) persoSec = sec; tab = tb; await render(); document.querySelectorAll('details.nu-grp').forEach(d => { d.open = true; });
      }, t); await p.waitForTimeout(t === 'packs' ? 1000 : 600);
      const iss = await p.evaluate(AUDIT);
      ok(`${name} · ${w} px · ${label} : mise en forme propre`, iss.length === 0, [...new Set(iss)].slice(0, 4).join(' | '));
      if (w === 390) {
        const png = (await p.screenshot({ type: 'png' })).toString('base64');
        await p.screenshot({ path: SHT + `th-${name}-${label}.png` });
        const res = await p.evaluate(CONTRAST, [png, 2, CONTRAST_SEL]);
        const low = res.filter(x => x.ratio < MIN); lows.push(...low.map(x => `${label}: ${x.ratio} ${x.label}`));
        ok(`${name} · ${label} : contraste suffisant (≥ ${MIN})`, low.length === 0, low.slice(0, 4).map(x => `${x.ratio} ${x.label}`).join(' | '));
      }
    }
  }
  ok(`${name} : aucune erreur JS`, p.errs.length === 0, J(p.errs));
  await p.context().close();
}
process.exit(0);
