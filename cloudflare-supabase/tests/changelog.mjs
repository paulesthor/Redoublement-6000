// La page des nouveautés : une entrée par version, dans l'ordre, la dernière correspond au BUILD, les boutons « Voir » mènent à de vrais écrans.
import { readFileSync } from 'node:fs';
let fails = 0; const ok = (n, c, x = '') => { console.log(`  ${c ? 'ok ' : 'ÉCHEC'} ${n}${c ? '' : ' ' + x}`); if (!c) fails++; };
const read = f => readFileSync(new URL('../../wikimasters/public/' + f, import.meta.url), 'utf8');
const win = {}; new Function('window', read('changelog.js'))(win); const log = win.CHANGELOG, app = read('app.js');
const build = /const BUILD = '([^']+)'/.exec(app)[1], cfgv = /VERSION: '([^']+)'/.exec(readFileSync(new URL('../src/config.js', import.meta.url), 'utf8'))[1];
const num = v => v.split('.').reduce((t, x, i) => t + (+x || 0) / Math.pow(1000, i), 0);
console.log('— page des nouveautés');
ok(`la dernière entrée (${log[0].v}) correspond au BUILD (${build}) : pense à écrire les nouveautés à chaque mise à jour`, log[0].v === build, `BUILD ${build}`);
ok('le BUILD du client = la version du serveur', build === cfgv, `${build} / ${cfgv}`);
ok('versions uniques, de la plus récente à la plus ancienne', new Set(log.map(e => e.v)).size === log.length && log.every((e, i) => i === 0 || num(e.v) < num(log[i - 1].v)));
ok('chaque entrée a un titre, une icône et au moins une nouveauté décrite', log.every(e => e.title && e.icon && e.items.length && e.items.every(i => i.t && i.d)));
const missing = log.flatMap(e => e.items).filter(i => i.go && !new RegExp(`(views\\.${i.go}\\s*=|\\b${i.go}\\s*\\(v\\)|\\b${i.go}:\\s*async)`).test(app)).map(i => i.go);
ok('les boutons « Voir » mènent à des écrans qui existent', missing.length === 0, missing.join(', '));
ok('fichier chargé par la page et mis en cache hors ligne', read('index.html').includes('changelog.js') && read('sw.js').includes('changelog.js'));
process.exit(fails ? 1 : 0);
