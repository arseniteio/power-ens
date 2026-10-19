/**
 * Ni un import sale del plugin ni toca código de Wazuh. Es lo que permite
 * elegir licencia: un solo import de Wazuh vuelve el plugin obra derivada GPL.
 *
 *   npx --yes tsx tests/standalone-imports.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';

declare const process: { exit(code: number): void };

const raiz = path.join(__dirname, '..');
const fallos: string[] = [];
const recorre = (dir: string, fuera: string[] = []): string[] => {
  for (const n of fs.readdirSync(dir)) {
    const r = path.join(dir, n);
    if (fs.statSync(r).isDirectory()) recorre(r, fuera);
    else if (/\.(ts|tsx|js|jsx)$/.test(n)) fuera.push(r);
  }
  return fuera;
};

const esFichero = (r: string): boolean => fs.existsSync(r) && fs.statSync(r).isFile();
const resuelve = (r: string): boolean =>
  esFichero(r) ||
  ['.ts', '.tsx', '.js', '.jsx', '.json'].some(e => esFichero(r + e)) ||
  ['index.ts', 'index.tsx', 'index.js', 'index.jsx'].some(i => esFichero(path.join(r, i)));

// Lo único que puede salir del plugin: el núcleo de OpenSearch Dashboards.
const NUCLEO = /^(\.\.\/)+src\/(core|plugins\/(data|navigation))\//;
// Cada paquete entero o una ruta dentro de él: `react` no deja pasar
// `react-redux`, ni `lodash` a `lodash-es`, ni `fs` a `fs-extra`. De
// `@osd/ui-shared-deps`, solo `theme` (las variables del tema, que siguen el
// modo oscuro; el dashboard las comparte con los plugins).
const PERMITIDOS = /^(react|react-dom|react-router-dom|@elastic\/eui|@osd\/(config-schema|i18n|ui-shared-deps\/theme)|pdfmake|re2js|rxjs|lodash|moment|crypto|fs|path|zlib|https)(\/|$)/;

for (const f of ['public', 'server', 'common'].flatMap(d => recorre(path.join(raiz, d)))) {
  const texto = fs.readFileSync(f, 'utf8');
  // En el navegador, del núcleo solo tipos. El plugin se compila solo (sin
  // las referencias a los paquetes de los demás plugins), así que un import de
  // valor de `src/plugins/data/public` mete una copia entera del plugin data
  // en el nuestro (comprobado el 07/10/2026: de 15 a 58 s de compilación y
  // +2 MB). Lo que haga falta en ejecución, del contrato de arranque
  // (`getData()`, `getNavigation()`, `getCore()`).
  if (f.startsWith(path.join(raiz, 'public') + path.sep)) {
    for (const m of texto.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s*['"]((?:\.\.\/)+src\/[^'"]+)['"]/gm)) {
      fallos.push(`${path.relative(raiz, f)}: importa valores del núcleo (${m[1]}); solo \`import type\``);
    }
  }
  // `from '…'`, `import('…')`, `require('…')` y también el import desnudo
  // (`import '…';`), que no trae nada con nombre pero carga el módulo entero.
  for (const m of texto.matchAll(/(?:from|import\(|require\(|^\s*import)\s*['"]([^'"]+)['"]/gm)) {
    const destino = m[1];
    const rel = path.relative(raiz, f);
    if (/wazuh|kibana-services/i.test(destino) && !/wazuh-alerts|wazuh-monitoring/.test(destino)) {
      fallos.push(`${rel}: importa ${destino}`);
      continue;
    }
    if (destino.startsWith('.')) {
      const resuelto = path.resolve(path.dirname(f), destino);
      if (resuelto.startsWith(raiz + path.sep)) {
        // Dentro del plugin tiene que existir: una ruta que no resuelve es la
        // huella de un import que apuntaba al árbol de Wazuh antes de mudarse.
        if (!resuelve(resuelto)) fallos.push(`${rel}: no resuelve dentro del plugin ${destino}`);
        // El servidor solo lleva `server/` y `common/`: el empaquetado del
        // plugin deja fuera todo `public/` (`**/public/**` en las plugin
        // helpers de OSD). Un import de `public/` desde ahí compila en local y
        // revienta al arrancar el dashboard con el zip.
        const desde = path.relative(raiz, f).split(path.sep)[0];
        const hacia = path.relative(raiz, resuelto).split(path.sep)[0];
        if ((desde === 'server' || desde === 'common') && hacia === 'public') {
          fallos.push(`${rel}: ${desde}/ no puede importar de public/ (${destino})`);
        }
      } else {
        const desdeRaiz = path.relative(path.join(raiz, 'x', 'y'), resuelto);
        if (!NUCLEO.test(desdeRaiz.replace(/\\/g, '/') + '/')) fallos.push(`${rel}: sale del plugin hacia ${destino}`);
      }
    } else if (!PERMITIDOS.test(destino)) {
      fallos.push(`${rel}: paquete no previsto ${destino}`);
    }
  }
}

fallos.forEach(f => console.log(`  FAIL ${f}`));
console.log(fallos.length ? `\n${fallos.length} FAILURES` : 'ALL OK');
process.exit(fallos.length ? 1 : 0);
