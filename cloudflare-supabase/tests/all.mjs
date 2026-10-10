// Lance tous les tests l'un après l'autre : npm test
import { spawnSync } from 'node:child_process';
let bad = 0;
for (const f of ['smoke', 'transport', 'migrate', 'run', 'security', 'economy', 'events', 'sanctions', 'prank', 'aiq', 'shiny', 'bets', 'lobby', 'tourney', 'stake']) {
  console.log(`\n===== ${f} =====`);
  const r = spawnSync('node', ['--no-warnings', new URL(`./${f}.mjs`, import.meta.url).pathname], { stdio: 'inherit' });
  if (r.status !== 0) { bad++; console.log(`>>> ${f} : ÉCHEC`); }
}
console.log(bad ? `\n${bad} fichier(s) de tests en échec` : '\nTOUS LES TESTS PASSENT');
process.exit(bad ? 1 : 0);
