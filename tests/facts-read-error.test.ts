/** No screen shows the facts of an earlier search as current: a failed read is reported and the report cannot be exported. */
import * as fs from 'fs';
import * as path from 'path';
import { FACTS_READ_ERROR_TITLE, factsReadErrorCause, factsReadErrorText } from '../public/platform/facts-read-error';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

check('the cause: the failure message', factsReadErrorCause(new Error('Request Timeout')) === 'Request Timeout');
check('a plain text is also valid', factsReadErrorCause('403 Forbidden') === '403 Forbidden');
for (const odd2 of [undefined, null, {}, new Error(''), { message: '   ' }]) {
  const c = factsReadErrorCause(odd2);
  check(`without a motive (${JSON.stringify(odd2)}): neither empty nor «undefined» nor «[object Object]»`, !!c && !/undefined|object Object/.test(c), c);
}
const t = factsReadErrorText(new Error('Request Timeout'));
check('the notice states the cause', t.startsWith(`${FACTS_READ_ERROR_TITLE}: Request Timeout.`), t);
check('and that the earlier data is not valid as current', /búsqueda anterior/.test(t), t);

const root = path.join(__dirname, '..');
const EVALUATE = [
  'public/ens/dashboard/ens-dashboard-main.tsx',
  'public/ens/controls/control-detail/index.tsx',
  'public/ens/controls/index.tsx',
  'public/ens/reports/index.tsx',
  'public/ens/evidences/index.tsx',
  'public/ens/overview/index.tsx',
];
const SCREENS = [
  'public/requirements/requirements-view.tsx',
  'public/requirements/requirement-flyout.tsx',
  'public/events/events-view.tsx',
];
const walk = (dir: string, outside: string[] = []): string[] => {
  for (const n of fs.readdirSync(dir)) {
    const r = path.join(dir, n);
    if (fs.statSync(r).isDirectory()) walk(r, outside);
    else if (/\.tsx?$/.test(n)) outside.push(r);
  }
  return outside;
};
const use = walk(path.join(root, 'public'))
  .filter(f => /=\s*useEsSearch\(/.test(fs.readFileSync(f, 'utf8')))
  .map(f => path.relative(root, f).replace(/\\/g, '/'))
  .sort();
check('the screens that search facts are the expected ones', JSON.stringify(use) === JSON.stringify([...SCREENS].sort()), use);
for (const p of use) {
  const text = fs.readFileSync(path.join(root, p), 'utf8');
  const lee = [...text.matchAll(/const\s*\{([^}]*)\}\s*=\s*useEsSearch\(/g)].every(m => /\berror\b/.test(m[1]));
  check(`${p}: reads the search error`, lee);
  check(`${p}: and uses it`, /if \(error\)|error \?|error=\{|isDisabled=\{Boolean\(error\)\}/.test(text));
}
const evaluate = walk(path.join(root, 'public', 'ens'))
  .filter(f => /useEnsEvaluation[<(]/.test(fs.readFileSync(f, 'utf8')))
  .map(f => path.relative(root, f).replace(/\\/g, '/'))
  .sort();
check('the screens that request the evaluation from the server are the expected ones', JSON.stringify(evaluate) === JSON.stringify([...EVALUATE].sort()), evaluate);
for (const p of evaluate) {
  const text = fs.readFileSync(path.join(root, p), 'utf8');
  check(`${p}: reads the evaluation error`, /const \{ error \} = evaluation;/.test(text) || /error=\{summary\.error\}/.test(text) || /decideDetailView\(request, evaluation,/.test(text) || /error=\{(general|trend)\.error\}/.test(text));
  check(`${p}: shows it with «Reintentar»`, /<FactsReadErrorCallOut error=\{(error|summary\.error|view\.error as Error|general\.error|trend\.error)\} onRetry=\{(evaluation|summary|general|trend)\.retry\} \/>/.test(text));
  check(`${p}: with loading while there is no result`, /<EvaluationLoading\s/.test(text) || /isLoading=\{summary\.isLoading\}/.test(text));
}
const row = fs.readFileSync(path.join(root, 'public/ens/controls/control-row.tsx'), 'utf8');
check('the list row: with a failure, the notice and not a verdict', /if \(error\)/.test(row) && !/useEsSearch|useEnsEvaluation/.test(row));
const reports = fs.readFileSync(path.join(root, 'public/ens/reports/index.tsx'), 'utf8');
check('Reports: the PDF is exported only with the report ready', /const exportPdf = \(\) => \{\s*(\/\/[^\n]*\n\s*)*if \(!exportable \|\| !complianceResult\) return;/.test(reports) && /const exportable = canExportReport\(view\);/.test(reports));
check('Reports: the button, disabled except with the report ready', /onClick=\{exportPdf\} isDisabled=\{!exportable\}/.test(reports) && /fill isDisabled>/.test(reports));
check('Reports: no result yet (or with the overview in progress), the loading and the disabled button (never filler NO_EVALUABLE or SIN_DATOS)', /if \(view\.kind === 'loading' \|\| view\.kind === 'panorama-loading'\) \{[\s\S]{0,400}<EvaluationLoading[\s\S]{0,500}fill isDisabled>/.test(reports));
check('Reports: arrival without a result for this machine, «no se mide» with its motive and the disabled button', /if \(view\.kind === 'not-measured'\) \{[\s\S]{0,600}\{view\.text\}[\s\S]{0,300}fill isDisabled>/.test(reports) && /describeNotMeasuredOnAgent\(/.test(reports));

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
