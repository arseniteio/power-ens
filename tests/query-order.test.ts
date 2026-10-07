/**
 * Toda consulta del módulo ENS que se corta en un tope pide los hechos MÁS
 * RECIENTES. Sin orden, el índice devuelve primero los más antiguos y la
 * pantalla juzga el principio de la ventana: el panel enseñaba un 2 % en una
 * máquina que informa cada hora porque juzgaba hechos de hace semanas.
 *
 *   npx --yes tsx tests/query-order.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';

// Todo el código del navegador: las pantallas de `public/ens` y las que el
// plugin añade fuera (Controles, Eventos).
const raiz = path.join(__dirname, '..', 'public');
const ficheros: string[] = [];
const recorre = (dir: string) => {
  for (const nombre of fs.readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    if (fs.statSync(ruta).isDirectory()) recorre(ruta);
    else if (/\.(ts|tsx)$/.test(nombre)) ficheros.push(ruta);
  }
};
recorre(raiz);

let fallos = 0;
let llamadas = 0;
for (const fichero of ficheros) {
  const texto = fs.readFileSync(fichero, 'utf8');
  const marca = 'useEsSearch({';
  let desde = 0;
  for (;;) {
    const i = texto.indexOf(marca, desde);
    if (i < 0) break;
    // El objeto de la llamada, hasta su llave de cierre.
    let nivel = 0;
    let j = i + marca.length - 1;
    for (; j < texto.length; j++) {
      if (texto[j] === '{') nivel++;
      else if (texto[j] === '}' && --nivel === 0) break;
    }
    const llamada = texto.slice(i, j + 1);
    desde = j + 1;
    llamadas++;
    // `size: 0` no trae hechos (solo agregaciones): no hay principio de la
    // ventana que juzgar ni orden que pedir. Cualquier otro tamaño, número o
    // variable (`size: pageSize` en la tabla de Eventos), es un tope.
    const conTope = /\bsize:\s*(?!0\b)[\w.]+/.test(llamada);
    const recientes = /sorting:\s*\[\s*\{\s*timestamp:\s*\{\s*order:\s*'desc'/.test(llamada);
    const sitio = path.relative(path.join(__dirname, '..'), fichero);
    if (conTope && !recientes) {
      fallos++;
      console.log(`  FALLA ${sitio}: consulta con tope sin pedir los más recientes`);
    } else {
      console.log(`  ok   ${sitio}${conTope ? ': con tope, los más recientes' : ': sin tope'}`);
    }
  }
}

if (llamadas === 0) {
  console.log('  FALLA no se ha encontrado ninguna consulta useEsSearch');
  fallos++;
}
console.log(fallos ? `\n${fallos} consulta(s) sin orden.` : '\nTodas las consultas con tope piden los más recientes.');
process.exit(fallos ? 1 : 0);
