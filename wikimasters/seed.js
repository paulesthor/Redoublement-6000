'use strict';
// Construit le catalogue des cartes (une carte = une page de Wikipédia FR).
//
//   node seed.js --dump                 catalogue complet depuis les exports officiels de Wikipédia :
//                                       - liste des pages : frwiki-latest-page.sql.gz (~500 Mo)
//                                       - vues du dernier mois complet : pageviews-AAAAMM-user.bz2 (~6 Go lus en flux,
//                                         arrêt dès la fin du bloc fr.wikipedia)
//                                       La rareté est fixée par le rang de popularité (voir config.js : CATALOG_SHARE).
//   node seed.js --dump --keep=300000   garde seulement les 300 000 pages les plus consultées (base plus légère)
//   options utiles : --skip-pages (réutilise la liste des pages déjà en base, ne refait que les consultations et le classement)
//   node seed.js --sample               40 cartes d'exemple, hors-ligne, pour tester
//
// Options : --month=AAAA-MM  --sql=<fichier|url>  --pageviews=<fichier.bz2|skip>
// Les descriptions et images ne sont PAS téléchargées ici : le jeu les récupère via l'API MediaWiki à la demande
// (et les conserve en base), voir live.js.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const readline = require('node:readline');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const { db } = require('./db');
const CFG = require('./config');
const { SHINY_OFFSET, rankRanges } = require('./cardutil');
const live = require('./live');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
db.exec('PRAGMA synchronous = OFF');

const UA = { 'User-Agent': 'WikimastersClone/1.0 (jeu prive entre amis)' }; // les serveurs Wikimedia refusent les clients sans User-Agent identifiable
const urlOf = title => 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));

function lastFullMonth(back = 1) {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------- 1. liste des pages ----------
async function loadPages(src) {
  let input, size = 0, read = 0;
  if (/^https?:/.test(src)) {
    const res = await fetch(src, { headers: UA });
    if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}) : ${src}`);
    size = +res.headers.get('content-length') || 0;
    input = Readable.fromWeb(res.body);
  } else { size = fs.statSync(src).size; input = fs.createReadStream(src); }
  input.on('data', c => { read += c.length; });
  const text = (src.endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input);
  const ins = db.prepare("INSERT OR IGNORE INTO cards (id, title, views, rarity, length, url) VALUES (?,?,0,'common',?,'')");
  const re = /^\((\d+),0,'((?:[^'\\]|\\.)*)',0,\d+,[\d.e+-]+,'\d+',(?:'\d+'|NULL),\d+,(\d+),/;
  let n = 0, tx = 0;
  db.exec('BEGIN');
  for await (const line of readline.createInterface({ input: text, crlfDelay: Infinity })) {
    const m = re.exec(line);
    if (!m) continue;
    const title = m[2].replace(/\\(['"\\])/g, '$1').replace(/_/g, ' ');
    if (title.endsWith(' (homonymie)')) continue;
    ins.run(+m[1], title, +m[3]); n++;
    if (++tx >= 50000) {
      db.exec('COMMIT; BEGIN'); tx = 0;
      process.stdout.write(`\rpages: ${n.toLocaleString('fr-FR')} (${size ? Math.round(read / size * 100) + ' %' : ''})   `);
    }
  }
  db.exec('COMMIT');
  console.log(`\r${n.toLocaleString('fr-FR')} pages (articles, hors redirections et homonymies)        `);
  return n;
}

// ---------- 2. consultations du dernier mois complet ----------
async function pageviewsUrl() {
  for (let back = 1; back <= 3; back++) {
    const m = args.month && back === 1 ? args.month : lastFullMonth(back), [y] = m.split('-');
    const url = `https://dumps.wikimedia.org/other/pageview_complete/monthly/${y}/${m}/pageviews-${m.replace('-', '')}-user.bz2`;
    if ((await fetch(url, { method: 'HEAD', headers: UA }).catch(() => ({ ok: false }))).ok) return { url, month: m };
  }
  throw new Error('Aucun fichier de consultations trouvé sur dumps.wikimedia.org');
}
async function loadPageviews(src) {
  db.exec('DROP TABLE IF EXISTS temp.pv; CREATE TEMP TABLE pv (title TEXT PRIMARY KEY, v INTEGER) WITHOUT ROWID');
  // Le fichier est trié par projet : on s'arrête dès que le bloc fr.wikipedia est terminé.
  const awk = `$1=="fr.wikipedia"{seen=1;print $2"\\t"$5;next} seen{exit}`;
  // Téléchargement par blocs de 128 Mo, chacun repris en cas de coupure réseau (un proxy ou une box coupe parfois les très longs transferts).
  const download = `UA="WikimastersClone/1.0 (jeu prive entre amis)"; URL="${src}"
    size=$(curl -sSI -L -A "$UA" "$URL" | tr -d '\r' | awk 'tolower($1)=="content-length:"{n=$2} END{print n}')
    [ -n "$size" ] || { echo "taille du fichier introuvable" >&2; exit 1; }
    tmp=$(mktemp); off=0; chunk=134217728
    while [ "$off" -lt "$size" ]; do
      end=$((off+chunk-1)); [ "$end" -ge "$size" ] && end=$((size-1)); tries=0
      until curl -sS --fail -A "$UA" -r "$off-$end" -o "$tmp" "$URL"; do tries=$((tries+1)); [ "$tries" -ge 6 ] && { echo "échec du téléchargement" >&2; rm -f "$tmp"; exit 1; }; sleep 3; done
      cat "$tmp" || break
      off=$((end+1))
    done
    rm -f "$tmp"`;
  const open = /^https?:/.test(src) ? `{ ${download}\n}` : `cat "${src}"`;
  const cmd = `${open} | ${src.endsWith('.bz2') ? 'bzip2 -dc' : 'cat'} | awk '${awk}'`;
  const child = spawn('sh', ['-c', cmd], { stdio: ['ignore', 'pipe', 'inherit'] });
  const up = db.prepare('INSERT INTO pv (title, v) VALUES (?,?) ON CONFLICT(title) DO UPDATE SET v = v + excluded.v');
  let n = 0;
  db.exec('BEGIN');
  for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
    const t = line.indexOf('\t'); if (t < 0) continue;
    up.run(line.slice(0, t).replace(/_/g, ' '), +line.slice(t + 1) || 0);
    if (++n % 100000 === 0) { db.exec('COMMIT; BEGIN'); process.stdout.write(`\rconsultations lues: ${n.toLocaleString('fr-FR')}   `); }
  }
  db.exec('COMMIT');
  console.log(`\r${n.toLocaleString('fr-FR')} lignes de consultations lues.            `);
  console.log('Association aux pages…');
  db.exec('UPDATE cards SET views = COALESCE((SELECT v FROM temp.pv WHERE temp.pv.title = cards.title), 0) WHERE shiny = 0');
}

// ---------- 3. classement, raretés, variantes shiny ----------
function finalize(shares = CFG.CATALOG_SHARE) {
  console.log('Classement par popularité…');
  db.exec('DROP TABLE IF EXISTS temp.r');
  db.exec('CREATE TEMP TABLE r AS SELECT id, ROW_NUMBER() OVER (ORDER BY views DESC, length DESC, id) - 1 AS rk FROM cards WHERE shiny = 0');
  db.exec('CREATE UNIQUE INDEX temp.r_id ON r(id)');
  db.exec('DELETE FROM cards WHERE shiny = 1');
  db.exec('UPDATE cards SET rank = (SELECT rk FROM temp.r WHERE temp.r.id = cards.id) WHERE shiny = 0');
  if (+args.keep) { db.exec(`DELETE FROM cards WHERE rank >= ${+args.keep | 0}`); }
  const n = db.prepare('SELECT COUNT(*) n FROM cards').get().n;
  const ranges = rankRanges(n, shares);
  const set = db.prepare('UPDATE cards SET rarity = ? WHERE rank >= ? AND rank < ?');
  for (const [r, [a, b]] of Object.entries(ranges)) set.run(r, a, b);
  // une variante shiny par légendaire (statistiques propres, calculées au premier tirage)
  db.prepare(`INSERT INTO cards (id, title, views, rarity, length, rank, shiny, url)
    SELECT id + ?, title, views, 'legendary', length, NULL, 1, '' FROM cards WHERE rarity = 'legendary' AND shiny = 0`).run(SHINY_OFFSET);
  db.prepare("INSERT INTO meta (k, v) VALUES ('ranges', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(JSON.stringify(ranges));
  console.log(`Catalogue : ${n.toLocaleString('fr-FR')} cartes.`);
  for (const r of CFG.RARITIES) console.log(`  ${CFG.LABELS[r].padEnd(12)} ${(ranges[r][1] - ranges[r][0]).toLocaleString('fr-FR')}`);
}

(async () => {
  if (args.sample) {
    const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sample-cards.json'), 'utf8'));
    const ins = db.prepare("INSERT OR REPLACE INTO cards (id, title, extract, views, rarity, length, url, enriched) VALUES (?,?,?,?,'common',?,?,1)");
    db.exec('BEGIN'); rows.forEach((c, i) => ins.run(i + 1, c.title, c.extract, c.views, c.extract.length, urlOf(c.title))); db.exec('COMMIT');
    finalize({ common: 30, uncommon: 20, rare: 20, super: 15, ultra: 10, legendary: 5 }); // parts gonflées pour que les 40 cartes couvrent toutes les raretés
    for (const { id } of db.prepare('SELECT id FROM cards').all()) live.ensureStats(id);
    return;
  }
  if (!args.dump) { console.log('Utilise --dump (catalogue complet) ou --sample (40 cartes de test). Voir l’en-tête de seed.js.'); return; }
  if (args['skip-pages']) console.log('Liste des pages déjà chargée (--skip-pages).');
  else await loadPages(args.sql || 'https://dumps.wikimedia.org/frwiki/latest/frwiki-latest-page.sql.gz');
  if (args.pageviews !== 'skip') {
    if (args.pageviews) await loadPageviews(args.pageviews);
    else { const { url, month } = await pageviewsUrl(); console.log(`Consultations de ${month} : lecture en flux de ${url}`); await loadPageviews(url); }
  } else console.log('Consultations ignorées : classement par taille d’article.');
  finalize();
})().catch(e => { console.error('\n' + e.message); process.exit(1); });
