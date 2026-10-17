/**
 * Ninguna pantalla enseña como de ahora los hechos de una búsqueda anterior:
 * si `useEsSearch` falla, la pantalla lo dice en lugar de los números, y el
 * informe no se puede exportar.
 *
 *   npx --yes tsx tests/facts-read-error.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { FACTS_READ_ERROR_TITLE, factsReadErrorCause, factsReadErrorText } from '../public/platform/facts-read-error';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

comprueba('la causa: el mensaje del fallo', factsReadErrorCause(new Error('Request Timeout')) === 'Request Timeout');
comprueba('un texto suelto también vale', factsReadErrorCause('403 Forbidden') === '403 Forbidden');
for (const raro of [undefined, null, {}, new Error(''), { message: '   ' }]) {
  const c = factsReadErrorCause(raro);
  comprueba(`sin motivo (${JSON.stringify(raro)}): ni vacío ni «undefined» ni «[object Object]»`, !!c && !/undefined|object Object/.test(c), c);
}
const t = factsReadErrorText(new Error('Request Timeout'));
comprueba('el aviso dice la causa', t.startsWith(`${FACTS_READ_ERROR_TITLE}: Request Timeout.`), t);
comprueba('y que lo de antes no vale como de ahora', /búsqueda anterior/.test(t), t);

// Cada pantalla que busca hechos lee el `error` de `useEsSearch` y, con él,
// no enseña lo que quedó de la búsqueda anterior. Desde 1.2.0 las que evalúan
// no buscan hechos: piden la evaluación al servidor (`useEnsEvaluation`), y
// con un fallo tampoco enseñan nada de antes (ver más abajo).
const raiz = path.join(__dirname, '..');
const EVALUAN = [
  'public/ens/dashboard/ens-dashboard-main.tsx',
  'public/ens/controls/control-detail/index.tsx',
  'public/ens/controls/index.tsx',
  'public/ens/reports/index.tsx',
  'public/ens/evidences/index.tsx',
];
const PANTALLAS = [
  'public/ens/traceability/index.tsx',
  'public/requirements/requirements-view.tsx',
  'public/requirements/requirement-flyout.tsx',
  'public/events/events-view.tsx',
];
const recorre = (dir: string, fuera: string[] = []): string[] => {
  for (const n of fs.readdirSync(dir)) {
    const r = path.join(dir, n);
    if (fs.statSync(r).isDirectory()) recorre(r, fuera);
    else if (/\.tsx?$/.test(n)) fuera.push(r);
  }
  return fuera;
};
const usan = recorre(path.join(raiz, 'public'))
  .filter(f => /=\s*useEsSearch\(/.test(fs.readFileSync(f, 'utf8')))
  .map(f => path.relative(raiz, f).replace(/\\/g, '/'))
  .sort();
comprueba('las pantallas que buscan hechos son las previstas', JSON.stringify(usan) === JSON.stringify([...PANTALLAS].sort()), usan);
for (const p of usan) {
  const texto = fs.readFileSync(path.join(raiz, p), 'utf8');
  const lee = [...texto.matchAll(/const\s*\{([^}]*)\}\s*=\s*useEsSearch\(/g)].every(m => /\berror\b/.test(m[1]));
  comprueba(`${p}: lee el error de la búsqueda`, lee);
  comprueba(`${p}: y lo usa`, /if \(error\)|error \?|error=\{|isDisabled=\{Boolean\(error\)\}/.test(texto));
}
const evaluan = recorre(path.join(raiz, 'public', 'ens'))
  .filter(f => /useEnsEvaluation[<(]/.test(fs.readFileSync(f, 'utf8')))
  .map(f => path.relative(raiz, f).replace(/\\/g, '/'))
  .sort();
comprueba('las pantallas que piden la evaluación al servidor son las previstas', JSON.stringify(evaluan) === JSON.stringify([...EVALUAN].sort()), evaluan);
for (const p of evaluan) {
  const texto = fs.readFileSync(path.join(raiz, p), 'utf8');
  comprueba(`${p}: lee el error de la evaluación`, /const \{ error \} = evaluacion;/.test(texto) || /error=\{resumen\.error\}/.test(texto));
  comprueba(`${p}: y lo usa`, /if \(error\)|error \?|error=\{|isDisabled=\{Boolean\(error\)\}/.test(texto));
}
const fila = fs.readFileSync(path.join(raiz, 'public/ens/controls/control-row.tsx'), 'utf8');
comprueba('la fila de la lista: con un fallo, el aviso y no un veredicto', /if \(error\)/.test(fila) && !/useEsSearch|useEnsEvaluation/.test(fila));
const informes = fs.readFileSync(path.join(raiz, 'public/ens/reports/index.tsx'), 'utf8');
comprueba('Informes: el PDF no se exporta con un fallo', /const exportarPDF = \(\) => \{\s*(\/\/[^\n]*\n\s*)*if \(error\) return;/.test(informes));
// El informe que recopila todos los controles (op.mon.2) lo desactiva además
// mientras su segunda consulta no ha vuelto: `Boolean(error) || …`.
comprueba('Informes: el botón, desactivado', /isDisabled=\{Boolean\(error\)(\s*\|\|[^}]*)?\}/.test(informes) && /fill isDisabled>/.test(informes));

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
