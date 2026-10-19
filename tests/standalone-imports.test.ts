/** No import leaves the plugin or touches Wazuh code. */
import * as fs from 'fs';
import * as path from 'path';

declare const process: { exit(code: number): void };

const root = path.join(__dirname, '..');
const failures: string[] = [];
const walk = (dir: string, outside: string[] = []): string[] => {
  for (const n of fs.readdirSync(dir)) {
    const r = path.join(dir, n);
    if (fs.statSync(r).isDirectory()) walk(r, outside);
    else if (/\.(ts|tsx|js|jsx)$/.test(n)) outside.push(r);
  }
  return outside;
};

const isFile = (r: string): boolean => fs.existsSync(r) && fs.statSync(r).isFile();
const resolves = (r: string): boolean =>
  isFile(r) ||
  ['.ts', '.tsx', '.js', '.jsx', '.json'].some(e => isFile(r + e)) ||
  ['index.ts', 'index.tsx', 'index.js', 'index.jsx'].some(i => isFile(path.join(r, i)));

const CORE = /^(\.\.\/)+src\/(core|plugins\/(data|navigation))\//;
const ALLOWED = /^(react|react-dom|react-router-dom|@elastic\/eui|@osd\/(config-schema|i18n|ui-shared-deps\/theme)|pdfmake|re2js|rxjs|lodash|moment|crypto|fs|path|zlib|https)(\/|$)/;

for (const f of ['public', 'server', 'common'].flatMap(d => walk(path.join(root, d)))) {
  const text = fs.readFileSync(f, 'utf8');
  if (f.startsWith(path.join(root, 'public') + path.sep)) {
    for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s*['"]((?:\.\.\/)+src\/[^'"]+)['"]/gm)) {
      failures.push(`${path.relative(root, f)}: importa valores del núcleo (${m[1]}); solo \`import type\``);
    }
  }
  for (const m of text.matchAll(/(?:from|import\(|require\(|^\s*import)\s*['"]([^'"]+)['"]/gm)) {
    const destination = m[1];
    const rel = path.relative(root, f);
    if (/wazuh|kibana-services/i.test(destination) && !/wazuh-alerts|wazuh-monitoring/.test(destination)) {
      failures.push(`${rel}: importa ${destination}`);
      continue;
    }
    if (destination.startsWith('.')) {
      const resolvedOne = path.resolve(path.dirname(f), destination);
      if (resolvedOne.startsWith(root + path.sep)) {
        if (!resolves(resolvedOne)) failures.push(`${rel}: no resuelve dentro del plugin ${destination}`);
        const since = path.relative(root, f).split(path.sep)[0];
        const towards = path.relative(root, resolvedOne).split(path.sep)[0];
        if ((since === 'server' || since === 'common') && towards === 'public') {
          failures.push(`${rel}: ${since}/ no puede importar de public/ (${destination})`);
        }
      } else {
        const fromRoot = path.relative(path.join(root, 'x', 'y'), resolvedOne);
        if (!CORE.test(fromRoot.replace(/\\/g, '/') + '/')) failures.push(`${rel}: sale del plugin hacia ${destination}`);
      }
    } else if (!ALLOWED.test(destination)) {
      failures.push(`${rel}: paquete no previsto ${destination}`);
    }
  }
}

failures.forEach(f => console.log(`  FAIL ${f}`));
console.log(failures.length ? `\n${failures.length} FAILURES` : 'ALL OK');
process.exit(failures.length ? 1 : 0);
