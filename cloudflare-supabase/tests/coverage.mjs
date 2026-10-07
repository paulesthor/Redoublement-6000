// Quelles requêtes SQL du code n'ont jamais été exécutées par les tests ? (on les relit alors à la main)
import { readFileSync, readdirSync } from 'node:fs';
export const norm = s => s.toLowerCase().replace(/\$q\d*\$.*?\$q\d*\$/gs, '?').replace(/\$\{[^}]*\}/g, '?').replace(/\b\d+(\.\d+)?\b/g, '?').replace(/\s+/g, ' ').replace(/ or ignore/g, '').replace(/ on conflict do nothing/g, '').replace(/ returning id$/, '').replace(/[?,() ]+/g, ' ').trim();
const key = s => norm(s).slice(0, 45);
export function report(executedLog) {
  const ran = new Set(executedLog.map(key));
  const ranAll = [...executedLog.map(norm)];
  const dir = new URL('../src/', import.meta.url).pathname, missing = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js') && !['migrate.js', 'pg.js'].includes(f))) {
    const src = readFileSync(dir + f, 'utf8');
    for (const m of src.matchAll(/(['"`])((?:SELECT|INSERT|UPDATE|DELETE|WITH)\b(?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      const sql = m[2]; if (!/\b(FROM|INTO|SET)\b/i.test(sql) || sql.length < 25) continue;
      if (!ran.has(key(sql))) missing.push(f + ' : ' + sql.replace(/\s+/g, ' ').slice(0, 150));
    }
  }
  return missing;
}
