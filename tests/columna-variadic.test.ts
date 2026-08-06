/**
 * Una tabla cuya última columna se repite.
 *
 *     npx tsx tests/columna-variadic.test.ts
 *
 * POR QUÉ EXISTE ESTE FICHERO. El 06/08/2026 se le declararon columnas a P-03 de
 * op.acc.3 —«Acciones por función»— y el control entero cayó a «configuración
 * incompleta»: la tabla decía dos columnas y las filas reales traen cuatro,
 *
 *     configuracion | /usr/bin/nano | /usr/bin/vim | /usr/bin/tee
 *
 * porque su evaluador las lee literalmente así: `const [fn, ...indicators] =
 * cells`. La primera celda es la función y TODAS las demás son indicadores.
 *
 * La salida fácil era quitarle las columnas, y es peor: sin columnas el motor no
 * puede repartir las celdas y las primitivas que nombran una columna se quedan
 * sin nada contra qué contrastar — que es el fallo que se corrigió esa misma
 * mañana en op.acc.4. Se declara lo que hay: una columna fija y una repetible.
 *
 * Se prueba en las dos direcciones, porque `variadic` abre un agujero si se
 * aplica donde no toca: una tabla normal TIENE que seguir rechazando la fila
 * con celdas de más.
 */
import { validateParameterValue } from '../dashboard/ens/configuration/services/parameter-value-validator';
import type { ENSControlParameter } from '../dashboard/ens/configuration/types';

declare const process: { exit(code: number): void };

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle?: unknown
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  console.log(`  FALLA ${nombre}${detalle !== undefined ? ` — ${String(detalle)}` : ''}`);
  fallos.push(nombre);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

const tabla = (
  variadic: boolean,
  value: string[]
): ENSControlParameter =>
  ({
    id: 'P-03',
    controlId: 'op.acc.3',
    name: 'acciones_por_funcion',
    label: 'Acciones por función',
    description: 'd',
    type: 'table',
    required: true,
    levels: ['MEDIO'],
    requirements: [],
    ruleIds: [],
    evidenceIds: [],
    wazuhUsage: '-',
    ensfacilUsage: '-',
    ifNotConfigured: '-',
    value,
    columns: [
      { name: 'funcion', label: 'Función', type: 'identifier', required: true },
      {
        name: 'indicadores',
        label: 'Indicadores',
        type: 'string',
        required: false,
        ...(variadic ? { variadic: true } : {}),
      },
    ],
  } as unknown as ENSControlParameter);

// Las filas REALES de wazuh-real el 06/08/2026.
const FILAS_REALES = [
  'desarrollo | /usr/bin/git',
  'operacion | /usr/bin/systemctl',
  'configuracion | /usr/bin/nano | /usr/bin/vim | /usr/bin/tee',
  'mantenimiento | /usr/bin/apt | /usr/bin/dpkg | /usr/bin/apt-get',
  'auditoria | /usr/sbin/ausearch | /usr/sbin/auditctl | /var/log/audit',
];

// --- 1. con `variadic`, las filas reales pasan ----------------------------

bloque('1. La última columna repetible admite las filas reales');

{
  const veredicto = validateParameterValue(
    tabla(true, FILAS_REALES),
    FILAS_REALES
  );

  comprueba(
    'las 5 filas de wazuh-real son válidas',
    veredicto.valid === true,
    veredicto.reason
  );

  // Y una fila de DOS celdas también: `variadic` significa «una o más», no
  // «obligatoriamente varias».
  const dosCeldas = ['desarrollo | /usr/bin/git'];

  comprueba(
    'una fila con solo dos celdas sigue siendo válida',
    validateParameterValue(tabla(true, dosCeldas), dosCeldas).valid === true
  );
}

// --- 2. sin `variadic`, la fila larga se rechaza --------------------------

bloque('2. Una tabla normal sigue rechazando las celdas de más');

{
  // LA REVERSIÓN, y es la mitad importante. `variadic` abre un agujero si se
  // aplica donde no toca: una tabla de aridad fija tiene que seguir cazando la
  // fila mal escrita, que es para lo que existe la comprobación.
  const veredicto = validateParameterValue(
    tabla(false, FILAS_REALES),
    FILAS_REALES
  );

  comprueba(
    'sin `variadic`, la fila de cuatro celdas se rechaza',
    veredicto.valid === false,
    veredicto.reason
  );

  comprueba(
    'y el motivo dice qué fila y cuántos campos trae',
    (veredicto.reason || '').includes('4 campos'),
    veredicto.reason
  );

  // Una tabla de aridad fija con filas correctas sigue pasando: sin esto, un
  // validador que rechazara todo también pasaría la comprobación de arriba.
  const bienEscritas = [
    'desarrollo | /usr/bin/git',
    'operacion | /usr/bin/systemctl',
  ];

  comprueba(
    'y con filas de dos celdas, la tabla de aridad fija es válida',
    validateParameterValue(tabla(false, bienEscritas), bienEscritas).valid === true,
    validateParameterValue(tabla(false, bienEscritas), bienEscritas).reason
  );
}

// --- salida ---------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
