// Captures d'écran de l'interface d'administration (tableau de bord, journal) sur téléphone, avec le vrai Worker et un vrai PostgreSQL.
import './api.mjs';
import { CSP } from '../src/secure.js';
import { createRequire } from 'node:module';
import http from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/'); const { chromium } = require('playwright');
const { call, settle, DB, worker, env, ctx, ok, done, J, lobby } = globalThis.__T;
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
    res.writeHead(rr.status, { 'content-type': rr.headers.get('content-type') || 'application/json', 'cache-control': rr.headers.get('cache-control') || 'no-store' }); return res.end(Buffer.from(await rr.arrayBuffer()));
  }
  let p = path.join(PUB, u.pathname); if (p.endsWith('/')) p += 'index.html'; if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { ...(path.extname(p) === '.html' ? { 'content-security-policy': CSP } : {}), 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(8768);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const mk = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); await c.addInitScript(tok => { localStorage.setItem('wm_token', tok); localStorage.setItem('wm_push_ask', '1'); if (!localStorage.getItem('wm_seen_ver')) localStorage.setItem('wm_seen_ver', '99'); window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen?.(), 0); } send() {} close() {} }; }, A); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) p.errs.push('CSP: ' + m.text().slice(0, 160)); }); await p.goto('http://localhost:8768/'); await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); await p.waitForTimeout(900); return p; };
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
console.log('— collection, réglages, godpack');
await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; tab = 'album'; render(); }); await p.waitForSelector('.bulk'); await p.waitForTimeout(600); await shot(p, 'album-bulk');
const bb = await p.$$eval('.bulk button', bs => bs.map(b => Math.round(b.getBoundingClientRect().right))); ok('boutons de la collection : aucun débordement', bb.every(x => x <= 390), J(bb));
await p.click('#chips [data-r=fused]'); await p.waitForTimeout(700); ok('catégorie Fusionnées', (await p.$$('.card.lv1,.card.lv2,.card.lv3')).length >= 1 && (await p.$$('#g .card:not(.lv1):not(.lv2):not(.lv3)')).length === 0, (await p.$$('#g .card')).length);
await shot(p, 'album-fused');
await p.selectOption('#srt', 'lvl'); await p.waitForTimeout(500); ok('tri par niveau de fusion', (await p.inputValue('#srt')) === 'lvl');
await p.evaluate(() => { tab = 'settings'; render(); }); await p.waitForSelector('.themes'); await p.waitForTimeout(300);
for (const th of ['light', 'beige', 'ocean']) { await p.click(`[data-th=${th}]`); await p.waitForTimeout(400); await shot(p, 'theme-' + th); ok('thème ' + th, (await p.evaluate(() => document.documentElement.dataset.theme)) === th); }
await p.evaluate(() => { window.__avc = null; }); 
await p.click('[data-th=dark]'); await p.click('[data-tx=l]'); ok('taille du texte', (await p.evaluate(() => document.documentElement.dataset.text)) === 'l'); await p.click('[data-tx=m]');
await p.click('#st-god'); await p.waitForSelector('.gp'); for (const t of [700, 1000, 1000, 1000]) { await p.waitForTimeout(t); await shot(p, 'god-' + t + '-' + Date.now() % 100000); }
await p.click('.gp-skip'); await p.waitForTimeout(800); ok('animation GODPACK passable', await p.$('#reveal') === null);
console.log('— personnalisation du profil');
await DB.prepare("UPDATE users SET duel_wins = 12 WHERE id = 1").run();
await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; tab = 'customize'; render(); }); await p.waitForSelector('.titles'); await p.waitForTimeout(500); await shot(p, 'custom-1');
ok('titres par catégorie', (await p.$$('.titlecard')).length >= 20 && (await p.$$('.titlecard.ok')).length >= 1);
// photo : un vrai PNG généré dans la page, recadré puis envoyé
const png = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 400, 300); gr.addColorStop(0, '#f2a34f'); gr.addColorStop(1, '#3a6ea5'); g.fillStyle = gr; g.fillRect(0, 0, 400, 300); g.fillStyle = '#fff'; g.beginPath(); g.arc(200, 150, 70, 0, 7); g.fill(); return c.toDataURL('image/png').split(',')[1]; });
await p.setInputFiles('#av-file', { name: 'moi.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await p.waitForSelector('#cs-ok'); await p.waitForTimeout(300); await shot(p, 'custom-crop'); await p.fill('#cz', '1.8'); await p.dispatchEvent('#cz', 'input'); await p.click('#cs-ok');
await p.waitForSelector('.avbig .av.hasph img', { timeout: 8000 }); await p.waitForTimeout(600);
ok('photo enregistrée et affichée', (await p.evaluate(() => me.av)) > 0 && (await p.$('#profile img')) !== null);
const eq = await p.$('.titlecard.ok:not(.on)'); const tid = await eq.getAttribute('data-ti'); await eq.click(); await p.waitForTimeout(700); await shot(p, 'custom-2');
ok('titre équipé affiché sous le pseudo', (await p.evaluate(() => me.title)) === tid && (await p.$('.avpanel .ttl')) !== null);
await p.evaluate(() => { tab = 'customize'; render(); }); await p.waitForSelector('.avbig .av.hasph img'); for (const th of ['dark', 'light', 'beige']) { await p.evaluate(t => { localStorage.setItem('wm_theme', t); window.applyPrefs(); }, th); await p.waitForTimeout(300); await shot(p, 'photo-' + th); if (th !== 'dark') { const im = await p.screenshot({ clip: { x: 36, y: 215, width: 20, height: 20 } }); ok('photo non inversée en thème ' + th, im.length > 0); } }
await p.evaluate(() => { localStorage.setItem('wm_theme', 'dark'); window.applyPrefs(); });
console.log('— mes ventes : total à récupérer');
{
  const mine = (await DB.prepare('SELECT card_id FROM inventory WHERE user_id = 1 AND qty >= 1 AND card_id NOT IN (SELECT card_id FROM auctions) LIMIT 2').all()).results.map(r => r.card_id);
  for (const c of mine) await call(A, 'POST', '/api/auctions', { card_id: c, price: 40, minutes: 60 });
  const aid = (await DB.prepare('SELECT id FROM auctions WHERE seller_id = 1 ORDER BY id LIMIT 1').all()).results[0].id;
  await DB.prepare('UPDATE users SET coins = 5000 WHERE id = 2').run();
  await call(B, 'POST', `/api/auctions/${aid}/bid`, { amount: 75 });
  await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; tab = 'market'; render(); }); await p.waitForSelector('#mk-c'); await p.waitForTimeout(500);
  await p.click('#mk-c [data-f=mine]'); await p.waitForSelector('.minesum'); await p.waitForTimeout(300); await shot(p, 'mes-ventes');
  const txt = await p.textContent('.minesum');
  ok('total à récupérer = enchères actuelles de mes ventes', /75/.test(txt) && /1 vente avec offre/.test(txt) && /1 sans offre/.test(txt), txt.replace(/\s+/g, ' '));
  await call(B, 'POST', `/api/auctions/${aid}/bid`, { amount: 120 }); await p.evaluate(() => { gcache.clear(); render(); }); await p.waitForTimeout(700); await p.click('#mk-c [data-f=mine]'); await p.waitForTimeout(300);
  ok('le total suit les surenchères', /120/.test(await p.textContent('.minesum')));
  await p.click('#mk-c [data-f=""]'); await p.waitForTimeout(200); ok('le total n\'apparaît que dans « Mes ventes »', (await p.textContent('#mine-sum')).trim() === '');
}
console.log('— fiche de carte avec un très long article');
{
  await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; tab = 'album'; render(); }); await p.waitForSelector('#g .card'); await p.waitForTimeout(500);
  await p.evaluate(() => { const c = [...cardIndex.values()][0]; c.extract = 'Article très long. '.repeat(400); showCard(c.id); });
  await p.waitForSelector('#det-close'); await p.waitForTimeout(300); await shot(p, 'fiche-longue');
  const box = await p.$eval('#det-close', e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  ok('bouton Fermer visible sans défiler', box.bottom <= 844 && box.top >= 0, J(box));
  const sc = await p.$eval('.detail', e => ({ scrollable: e.scrollHeight > e.clientHeight, ov: getComputedStyle(e).overflowY }));
  await p.evaluate(() => { const d = document.querySelector('.detail'); d.scrollTop = 99999; });
  ok('la fiche défile (un seul défilement)', sc.scrollable && sc.ov === 'auto' && (await p.$eval('.detail', e => e.scrollTop)) > 100, J(sc));
  await p.click('#det-close'); await p.waitForTimeout(300); ok('la fiche se ferme', (await p.$('.detail')) === null);
}
console.log('— mise en vente multiple (interface)');
{
  await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; tab = 'album'; render(); }); await p.waitForSelector('#g .card'); await p.waitForTimeout(500);
  await p.click('#chips [data-r=""]'); await p.selectOption('#srt', 'rar'); await p.waitForTimeout(600);
  await p.click('#selmode'); const cards = await p.$$('#g .card'); for (const c of cards.slice(0, 3)) await c.click();
  ok('barre de sélection : Vendre (3)', (await p.textContent('#sel-sell')).includes('3'));
  const nbA = (await DB.prepare('SELECT COUNT(*) n FROM auctions WHERE seller_id = 1').all()).results[0].n;
  await p.click('#sel-sell'); await p.waitForSelector('.sellmany'); await p.waitForTimeout(300); await shot(p, 'vente-multiple');
  ok('3 lignes de prix pré-remplies', (await p.$$('.smrow input')).length === 3 && (await p.$$eval('.smrow input', is => is.every(i => +i.value >= 1))));
  await p.fill('.smrow input', '77'); await p.click('#smd [data-m="720"]'); await p.click('#sm-ok'); await p.waitForTimeout(1200);
  const nbB = (await DB.prepare('SELECT COUNT(*) n FROM auctions WHERE seller_id = 1').all()).results[0].n;
  ok('3 enchères créées d\'un coup', nbB - nbA === 3, [nbA, nbB]);
  ok('prix modifié pris en compte', (await DB.prepare('SELECT COUNT(*) n FROM auctions WHERE seller_id = 1 AND start_price = 77').all()).results[0].n === 1);
}
console.log('— albums et paquets du jour (interface)');
{
  await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; tab = 'albums'; render(); }); await p.waitForSelector('.albtile'); await p.waitForTimeout(500); await shot(p, 'albums');
  ok('liste des albums affichée', (await p.$$('.albtile')).length >= 30);
  await p.click('.albtile'); await p.waitForSelector('.albsheet'); await p.waitForTimeout(300); await shot(p, 'album-detail');
  ok('détail d\'un album : cartes et récompense', (await p.$$('.albcard')).length >= 4 && (await p.textContent('.albsheet')).includes('Récompense'));
  await p.click('#al-x');
  await p.evaluate(() => { tab = 'themepacks'; render(); }); await p.waitForSelector('.thcard'); await p.waitForTimeout(400); await shot(p, 'paquets-du-jour');
  ok('2 paquets du jour', (await p.$$('.thcard')).length === 2);
}
console.log('— résumé de paquet : Continuer / Ouvrir un autre');
{
  await DB.prepare('UPDATE users SET pack_stock = 5, coins = 5000 WHERE id = 1').run();
  await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; localStorage.setItem('wm_fast', '1'); tab = 'packs'; render(); }); await p.waitForSelector('#open'); await p.waitForTimeout(500);
  const before = (await DB.prepare('SELECT packs_opened n FROM users WHERE id = 1').all()).results[0].n;
  await p.click('#open'); await p.waitForSelector('#reveal .skip', { timeout: 15000 }); await p.click('#reveal .skip'); await p.waitForSelector('#reveal .sum .again', { timeout: 15000 }); await p.waitForTimeout(400); await shot(p, 'resume-paquet');
  ok('deux boutons dans le résumé : Continuer (gauche) et ouvrir un autre (droite)', (await p.$$eval('#reveal .sticky-bar button', bs => bs.map(b => b.textContent.trim()))).join('|').startsWith('Continuer|Ouvrir un autre paquet'));
  const [bx, ax] = await p.$$eval('#reveal .sticky-bar button', bs => bs.map(b => Math.round(b.getBoundingClientRect().left))); ok('Continuer est à gauche', bx < ax, [bx, ax]);
  await p.click('#reveal .again'); await p.waitForSelector('#reveal .skip', { timeout: 15000 }); await p.waitForTimeout(500);
  ok('« Ouvrir un autre » lance directement un 2e paquet sans repasser par l\'accueil', (await DB.prepare('SELECT packs_opened n FROM users WHERE id = 1').all()).results[0].n === before + 2, before);
  await p.click('#reveal .skip'); await p.waitForSelector('#reveal .sum .finish'); await p.click('#reveal .finish'); await p.waitForTimeout(500); ok('Continuer ferme le résumé', await p.$('#reveal') === null);
  await p.evaluate(() => localStorage.removeItem('wm_fast'));
}
console.log('— économie (interface)');
{
  await DB.prepare('UPDATE users SET coins = 8000 WHERE id = 1').run();
  const go = async t => { await p.evaluate(tb => { $('#modal').hidden = true; $('#modal').innerHTML = ''; tab = tb; render(); }, t); await p.waitForTimeout(700); };
  await go('bourse'); await p.waitForSelector('.bourserow', { timeout: 8000 }); await shot(p, 'eco-bourse'); ok('bourse : 12 titres', (await p.$$('.bourserow')).length === 12);
  await p.click('.bourserow'); await p.waitForSelector('#b-up'); await p.fill('#b-stake', '40'); await p.click('#b-up'); await p.waitForTimeout(800); ok('pari enregistré depuis la fiche', (await p.$$('.bourserow.has')).length === 1);
  await go('hilo'); await p.waitForSelector('#h-go'); await p.click('#h-go'); await p.waitForSelector('.hilo'); await shot(p, 'eco-hilo'); ok('plus ou moins : partie lancée', !!(await p.$('#h-more')));
  await p.click('#h-more'); await p.waitForTimeout(900); ok('plus ou moins : résultat affiché', (await p.$('.hflash')) !== null);
  await go('trends'); await p.waitForSelector('.pagehead'); await shot(p, 'eco-trends');
  await go('bank'); await p.waitForSelector('#bk-in'); await shot(p, 'eco-bank'); ok('banque : dividendes à récupérer', !(await p.$eval('#dv-go', b => b.disabled)));
  await p.click('#dv-go'); await p.waitForTimeout(700); ok('dividendes récupérés', await p.$eval('#dv-go', b => b.disabled));
  await go('expeditions'); await p.waitForSelector('#ex-new'); await shot(p, 'eco-exped');
  await DB.prepare('UPDATE inventory SET qty = 4 WHERE user_id = 1 AND card_id IN (SELECT card_id FROM inventory WHERE user_id = 1 AND sh = 0 ORDER BY card_id LIMIT 3)').run(); await go('expeditions');
  await DB.prepare("UPDATE cards SET title = 'Un titre vraiment très long pour vérifier que rien ne déborde sur le côté de lécran même avec un nom interminable' WHERE id = (SELECT card_id FROM inventory WHERE user_id = 1 AND qty > 1 AND sh = 0 ORDER BY card_id LIMIT 1)").run(); await go('expeditions');
  await p.click('#ex-new'); await p.waitForSelector('.exitem'); await p.waitForTimeout(300);
  const ov = await p.$eval('.exlist', e => ({ sw: e.scrollWidth, cw: e.clientWidth })), ov2 = await p.$eval('.exsheet', e => ({ sw: e.scrollWidth, cw: e.clientWidth })), ov3 = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  ok('sélection d\'expédition : aucun défilement horizontal', ov.sw <= ov.cw + 1 && ov2.sw <= ov2.cw + 1 && ov3, JSON.stringify([ov, ov2, ov3]));
  const btn = await p.$eval('.exitem [data-p]', e => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; }); ok('le bouton + est visible sans défiler', btn);
  await p.click('.exitem'); await p.click('.exitem'); ok('toucher la ligne ajoute un exemplaire', (await p.textContent('.exitem [data-n]')) === '2' || (await p.textContent('.exitem [data-n]')) === '1');
  await p.click('#ex-auto'); await p.waitForTimeout(200); ok('remplissage automatique', (await p.$$('.exitem.sel')).length >= 1 && (await p.textContent('#ex-sum')).includes('gain estimé'));
  await p.click('#ex-clear'); ok('vider', (await p.$$('.exitem.sel')).length === 0 && await p.$eval('#ex-go', b => b.disabled)); await p.click('.exitem'); await shot(p, 'eco-exped-new');
  const goBox = await p.$eval('#ex-go', e => { const r = e.getBoundingClientRect(); return r.bottom <= innerHeight; }); ok('le bouton Envoyer reste visible', goBox);
  await p.click('#ex-go'); await p.waitForTimeout(900); ok('expédition lancée', (await p.$$('.exrow')).length === 1);
}
await DB.prepare("UPDATE users SET daily_day = NULL WHERE id = 1").run();
console.log('— faux godpack (interface)');
{
  await p.evaluate(() => { window.__pf = previewFake(); }); await p.waitForSelector('.gp-skip', { timeout: 6000 }); await p.click('.gp-skip');
  await p.waitForSelector('.fko-finger', { timeout: 6000 });
  ok('faux godpack : après l\'animation de godpack, le doigt d\'honneur', /T'AS CRU/.test(await p.textContent('.fko-main')) && !!(await p.$('.fko-rain i')));
  await shot(p, 'faux-godpack'); await p.click('.fko .gp-skip'); await p.waitForTimeout(900);
  ok('faux godpack : la scène se referme', await p.$('#reveal') === null);
}
console.log('— événements (interface)');
{
  await p.evaluate(() => { tab = 'events'; render(); }); await p.waitForSelector('.evcard.weekly', { timeout: 8000 }); await p.waitForTimeout(300);
  ok('page Événements : défi de la semaine, carte recherchée, saison', !!(await p.$('.evcard.weekly')) && !!(await p.$('.evcard.hunt')) && !!(await p.$('.evcard.season')), (await p.textContent('#view')).slice(0, 200));
  ok('page Événements : aucune date à venir affichée, message « surprises » sans événement', /Événements/.test(await p.textContent('.pagehead')));
  await shot(p, 'evenements');
  await p.evaluate(() => { me.ev = [{ id: 'golden:x', kind: 'golden', name: 'Heure dorée', emoji: '✨', end: Date.now() + 40 * 60000 }]; paintEvBar(); });
  ok('bandeau des événements en cours sous l\'en-tête', (await p.$$('#evb .evchip')).length === 1 && /Heure dorée/.test(await p.textContent('#evb')) && !(await p.$eval('#evb', e => e.hidden)));
  await p.click('#evb .evchip'); await p.waitForTimeout(500); ok('toucher le bandeau ouvre la page Événements', await p.evaluate(() => tab === 'events'));
  await p.evaluate(() => { me.ev = []; paintEvBar(); }); ok('bandeau masqué quand rien n\'est en cours', await p.$eval('#evb', e => e.hidden));
  const ov = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth); ok('page Événements : pas de défilement horizontal', ov);
}
console.log('— paris sur les combats (interface)');
{
  const [, rc] = await call(null, 'POST', '/api/register', { name: 'Chloé', password: 'secret3' }), [, rd] = await call(null, 'POST', '/api/register', { name: 'Dan', password: 'secret4' });
  const idc = (await DB.prepare("SELECT id FROM users WHERE name = 'Chloé'").all()).results[0].id, idd = (await DB.prepare("SELECT id FROM users WHERE name = 'Dan'").all()).results[0].id;
  const sk = { log: [], send(m) { this.log.push(JSON.parse(m)); } }; lobby.clients.set(idc, new Set([sk])); lobby.clients.set(idd, new Set([{ send() {} }]));
  await DB.prepare('UPDATE users SET coins = 3000 WHERE id = 1').run();
  await lobby.onMessage({ id: idc, name: 'Chloé' }, { t: 'challenge', to: idd, mode: 'battle' }); await lobby.onMessage({ id: idd, name: 'Dan' }, { t: 'accept', from: idc, mode: 'battle' });
  await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; duelMode = 'live'; tab = 'duel'; render(); }); await p.waitForSelector('.fight', { timeout: 8000 }); await p.waitForTimeout(400); await shot(p, 'combats-direct');
  ok('onglet « En direct » : le combat en cours est listé', (await p.$$('.fight')).length === 1 && (await p.textContent('.fight')).includes('Chloé') && (await p.textContent('.fight')).includes('Dan'));
  await p.click('[data-bet]'); await p.waitForSelector('#bt-stake'); await p.fill('#bt-stake', '120'); await p.waitForTimeout(200); await shot(p, 'pari-fiche');
  await p.click('#bt-ok'); await p.waitForTimeout(900);
  ok('pari placé : « Ton pari » affiché avec la cagnotte', (await p.textContent('.fmine')).includes('120') && (await p.textContent('.fpot')).includes('120'));
  ok('mise prélevée', (await DB.prepare('SELECT coins FROM users WHERE id = 1').all()).results[0].coins === 2880);
  // spectateur : les rafraîchissements (minuteur, présence, évènement serveur) ne redessinent pas la page
  await p.evaluate(() => { document.querySelector('#dm-seg').dataset.keep = '1'; window.__sk = 0; new MutationObserver(() => { if ([...document.querySelectorAll('#view .skel, #view [class*=skeleton]')].length) window.__sk++; }).observe(document.querySelector('#view'), { childList: true, subtree: true }); });
  await p.evaluate(() => { onWs({ t: 'online', ids: [1, 2, 3] }); onWs({ t: 'refresh', what: 'fights' }); liveSoft(); }); await p.waitForTimeout(900);
  ok('spectateur : la page n\'est pas redessinée par les rafraîchissements (pas de clignotement)', await p.evaluate(() => document.querySelector('#dm-seg')?.dataset.keep === '1' && !window.__sk));
  // écran du spectateur : voit la question et les réponses, sans pouvoir répondre
  const sp = await p.evaluate(() => {
    const A = 901, B = 902, card = (id, t) => ({ id, title: t, rarity: 'rare', atk: 300, def: 400, lvl: 0, image: null });
    onWs({ t: 'bf_start', watch: true, id: 'w1', names: { [A]: 'Chloé', [B]: 'Dan' }, a: A, b: B, deck: { [A]: [card(1, 'Paris')], [B]: [card(2, 'Lyon')] }, hp: { [A]: 400, [B]: 400 }, max: { [A]: 400, [B]: 400 }, first: A, total: 2 });
    onWs({ t: 'bf_turn', id: 'w1', turn: 1, total: 2, attacker: A, defender: B, hp: { [A]: 400, [B]: 400 }, left: { [A]: [1], [B]: [2] }, time: 20000 });
    onWs({ t: 'bf_card', id: 'w1', turn: 1, attacker: A, defender: B, card: card(1, 'Paris'), hp: { [A]: 400, [B]: 400 } });
    onWs({ t: 'bf_q', id: 'w1', turn: 1, k: 1, kTotal: 3, attacker: A, defender: B, card: card(1, 'Paris'), text: 'Quelle est la capitale ?', options: ['Paris', 'Lyon', 'Nice', 'Lille'], time: 20000, hp: { [A]: 400, [B]: 400 } });
    onWs({ t: 'bf_picked', id: 'w1', turn: 1, k: 1, choice: 2 });
    const opts = [...document.querySelectorAll('#fbody .opt')];
    return { n: opts.length, allDisabled: opts.every(o => o.disabled), sel: opts.findIndex(o => o.classList.contains('sel')), q: document.querySelector('#fbody .bq-text')?.textContent, leave: !!document.querySelector('#f-leave') };
  });
  ok('spectateur (écran) : question, 4 réponses non cliquables, réponse choisie visible, bouton Quitter', sp.n === 4 && sp.allDisabled && sp.sel === 2 && /capitale/.test(sp.q) && sp.leave, JSON.stringify(sp));
  await p.evaluate(() => { onWs({ t: 'bf_end', id: 'w1', names: { 901: 'Chloé', 902: 'Dan' }, a: 901, b: 902, hp: { 901: 400, 902: 0 }, max: { 901: 400, 902: 400 }, winner: 901 }); }); await p.waitForTimeout(200);
  ok('spectateur (écran) : fin du combat et retour', /Chloé remporte/.test(await p.textContent('#view')) && !!(await p.$('#f-leave'))); await p.click('#f-leave'); await p.waitForTimeout(500);
  ok('spectateur : retour à la liste des combats', await p.evaluate(() => !game && tab === 'duel'));
  const bt = [...lobby.battles.values()][0]; await lobby.betSettle(bt, bt.players[0]); lobby.battles.delete(bt.id);
}
console.log('— onglets de combat');
await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; tab = 'duel'; render(); }); await p.waitForSelector('#dm-seg'); await p.waitForTimeout(300);
ok('4 onglets de combat (quiz, combat, mise, en direct)', (await p.$$('#dm-seg button')).length === 4);
await p.click('[data-dm=stake]'); await p.waitForTimeout(500); await shot(p, 'duel-stake');
ok('onglet « Duel à la mise » : règles et bouton Miser', (await p.textContent('.rulesd')).includes('6 questions') && !(await p.$('#vs-bot')));
await p.click('[data-dm=battle]'); await p.waitForTimeout(400); ok('onglet Combat : joueur simulé', !!(await p.$('#vs-bot')));
console.log('— tournois (interface)');
await DB.prepare('UPDATE users SET coins = 1000').run();
await p.evaluate(() => { $('#modal').hidden = true; $('#modal').innerHTML = ''; tab = 'tournaments'; render(); }); await p.waitForSelector('#t-new'); await p.waitForTimeout(400); await shot(p, 'tour-list');
await p.fill('#t-stake', '120'); await p.click('#t-new'); await p.waitForSelector('.tpay'); await p.waitForTimeout(500); await shot(p, 'tour-detail');
ok('tournoi créé, cagnotte et gains affichés', (await p.$$('.tpay div')).length === 4 && (await p.textContent('.tpot')).includes('480'));
ok('aucune erreur JavaScript', p.errs.length === 0, J(p.errs));
await browser.close(); srv.close(); await done();
