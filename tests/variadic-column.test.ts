/**
 * Una tabla cuya última columna se repite.
 *
 *     npx tsx tests/variadic-column.test.ts
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
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import type { ENSControlParameter } from '../common/ens/configuration/types';

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

// --- 3. una celda con VARIOS valores --------------------------------------
//
// NACE DE UNA NO CONFORMIDAD FALSA QUE PROVOQUÉ YO el 07/08/2026.
//
// P-07 de op.acc.4 declara qué perfiles tienen necesidad de conocer sobre cada
// recurso. La columna se llama `perfiles` EN PLURAL y su ejemplo ya enseñaba
// `rrhh+dir`, pero el tipo era `identifier`, cuyo patrón es `^[^\s|,]+$`: ni
// espacios ni comas. Un recurso al que acceden dos perfiles legítimos no se
// podía declarar.
//
// Le pasa a /etc/shadow, donde root y el administrador tienen los dos
// justificación. Al declarar `root dioni` el parámetro quedó INVÁLIDO y el
// control entero cayó de 20 % a 0 %: peor que antes de tocarlo.
//
// `multiselect` sin `options` acepta cualquier valor y parte por comas, que es
// exactamente lo que hace el motor al contrastar (`splitCellOptions`): lo
// observado tiene que estar ENTRE los declarados, no ser igual a la celda.

bloque('3. Una celda puede declarar varios valores separados por coma');

{
  const conTipo = (
    tipo: string,
    value: string[]
  ): ENSControlParameter =>
    ({
      id: 'P-07',
      controlId: 'op.acc.4',
      name: 'recursos_sensibles',
      label: 'Recursos sensibles',
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
        { name: 'recurso', label: 'Recurso', type: 'path', required: true },
        { name: 'perfiles', label: 'Perfiles', type: tipo, required: false },
      ],
    } as unknown as ENSControlParameter);

  const DOS_PERFILES = ['/etc/shadow | root,dioni'];

  comprueba(
    'con `multiselect`, dos perfiles en una celda son válidos',
    validateParameterValue(conTipo('multiselect', DOS_PERFILES), DOS_PERFILES)
      .valid === true,
    validateParameterValue(conTipo('multiselect', DOS_PERFILES), DOS_PERFILES).reason
  );

  // LA REVERSIÓN QUE EXPLICA EL FALLO: con `identifier` la misma fila se
  // rechaza. Sin esta comprobación no quedaría constancia de por qué se cambió
  // el tipo, y alguien lo revertiría por «coherencia» con las demás columnas.
  comprueba(
    'con `identifier`, la misma fila se rechaza (es lo que rompió op.acc.4)',
    validateParameterValue(conTipo('identifier', DOS_PERFILES), DOS_PERFILES)
      .valid === false,
    'el validador la dio por buena'
  );

  // Y un solo perfil sigue valiendo: `multiselect` es «uno o más».
  const UNO = ['/root/.ssh/authorized_keys | root'];

  comprueba(
    'un solo perfil sigue siendo válido',
    validateParameterValue(conTipo('multiselect', UNO), UNO).valid === true,
    validateParameterValue(conTipo('multiselect', UNO), UNO).reason
  );

  // Y la celda vacía también: la columna no es obligatoria.
  const SIN_PERFIL = ['/datos/publico | '];

  comprueba(
    'y una celda vacía no rompe, porque la columna no es obligatoria',
    validateParameterValue(conTipo('multiselect', SIN_PERFIL), SIN_PERFIL)
      .valid === true,
    validateParameterValue(conTipo('multiselect', SIN_PERFIL), SIN_PERFIL).reason
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
