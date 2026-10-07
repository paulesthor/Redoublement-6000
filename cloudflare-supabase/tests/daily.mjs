// Captures d'écran de l'interface d'administration (tableau de bord, journal) sur téléphone, avec le vrai Worker et un vrai PostgreSQL.
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
}).listen(8768);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const mk = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_push_ask', '1'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('http://localhost:8768/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900); return p; };
env.AI = { run: async () => ({ response: JSON.stringify({ questions: Array.from({ length: 9 }, (_, i) => ({ type: ['annee', 'lieu', 'personne', 'chiffre', 'cause', 'relation', 'calcul', 'langue'][i % 8], question: `Question ${i + 1} : vers quelle ${['époque', 'année', 'période', 'date', 'ère', 'datation', 'moment', 'phase', 'siècle'][i]} Paris a-t-elle été fondée selon l'article ?`, choices: ['250 av. J.-C.', '150 av. J.-C.', '350 av. J.-C.', '450 av. J.-C.'], answer: 0 })) }) }) };
const shot = async (p, n) => p.screenshot({ path: n + '.png' });
console.log('— première connexion du jour (téléphone)');
let p = await mk(390, 844);
await p.waitForSelector('.daily', { timeout: 8000 }); await p.waitForTimeout(500);
ok('la récompense du jour s\'affiche à la connexion', true);
ok('7 jours affichés, jour 1 en cours', (await p.$$('.dslot')).length === 7 && (await p.$$('.dslot.now')).length === 1);
await shot(p, 'daily-1');
const c0 = await p.evaluate(() => me.coins);
await p.click('#d-claim'); await p.waitForSelector('.daily.claimed'); await p.waitForTimeout(700); await shot(p, 'daily-2');
ok('récompense créditée', (await p.evaluate(() => me.coins)) - c0 === 50);
await p.click('#d-claim'); await p.waitForTimeout(300);
ok('fenêtre fermée', await p.$('.daily') === null);
ok('pastille Plus: quiz à faire', await p.$('nav button.more.has-badge') !== null);
await p.click('nav button.more'); await p.waitForSelector('.moresheet'); await p.waitForTimeout(450); await shot(p, 'daily-menu');
ok('section « Jouer » dans Plus', (await p.textContent('.moresheet')).includes('Quiz du jour') && (await p.textContent('.moresheet')).includes('Quêtes'));
await p.click('.mtile[data-go=quests]'); await p.waitForSelector('.quest'); await p.waitForTimeout(500); await shot(p, 'quests');
ok('3 quêtes + bonus affichés', (await p.$$('.quest')).length === 4);
// une quête terminée → bouton Récupérer
await DB.prepare("UPDATE quests SET progress = 99 WHERE user_id = 1 AND qid <> 'bonus'").run();
await p.evaluate(() => render()); await p.waitForSelector('[data-claim]'); await shot(p, 'quests-ready');
await p.click('[data-claim]'); await p.waitForTimeout(1200);
ok('une quête récupérée', (await p.$$('.quest.done')).length >= 1);
await p.click('nav button.more'); await p.click('.mtile[data-go=dquiz]'); await p.waitForSelector('#dq-go'); await p.waitForTimeout(400); await shot(p, 'dquiz-intro');
await p.click('#dq-go'); await p.waitForSelector('.dqtext'); await p.waitForTimeout(300); await shot(p, 'dquiz-q');
for (let i = 0; i < 5; i++) { await p.waitForSelector('.dqtext'); await p.click('.opt'); await p.waitForTimeout(700); }
await p.waitForSelector('.dqscore', { timeout: 8000 }); await p.waitForTimeout(1400); await shot(p, 'dquiz-end');
ok('écran de fin : score et corrections', (await p.$$('.dqrow')).length === 5 && (await p.textContent('.dqscore')).includes('/ 5'));
ok('classement du jour sous le récapitulatif', (await p.$$('.dqrank .item')).length >= 1);
await p.evaluate(() => window.scrollTo(0, 99999)); await p.waitForTimeout(300); await shot(p, 'dquiz-rank');
console.log('— fusion');
const own = (await DB.prepare('SELECT card_id FROM inventory WHERE user_id = 1 AND sh = 0 AND rar < 5 ORDER BY rar LIMIT 1').all()).results[0].card_id;
await DB.prepare('UPDATE inventory SET qty = 6, lvl = 0 WHERE user_id = 1 AND card_id = ?').bind(own).run();
await p.evaluate(() => { tab = 'album'; render(); }); await p.waitForSelector('.card[data-id="' + own + '"]'); await p.waitForTimeout(500);
await p.click('.card[data-id="' + own + '"] .body'); await p.waitForSelector('#fuse-go'); await p.waitForTimeout(300); await shot(p, 'fuse-1');
await p.click('#fuse-go'); await p.waitForSelector('.detail.fused'); await p.waitForTimeout(900); await shot(p, 'fuse-2');
ok('fusion depuis la fiche : niveau 1 affiché', (await p.textContent('.fusebox')).includes('Bonus actuel'));
ok('aucune erreur JavaScript', p.errs.length === 0, J(p.errs));
await browser.close(); srv.close(); await done();
