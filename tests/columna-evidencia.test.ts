/**
 * La columna «Evidencia» del informe dice qué sostiene cada fila.
 *
 *     ~/.bun/bin/bun run tests/columna-evidencia.test.ts
 *
 * Mismo montaje que `informe-por-control.test.ts`: TypeScript suelto con su
 * propio comprobador, sin `package.json` ni `tsconfig`. Hace falta un runtime
 * que ejecute TypeScript resolviendo imports sin extensión (`bun`, probado con
 * 1.3.14).
 *
 * QUÉ SE PRUEBA Y POR QUÉ EXISTE ESTE FICHERO. La tabla de los campos del
 * informe construía filas `{campo, valor, evidencia}` y su tercera columna leía
 * `ev` y `status`, dos claves que la fila no tuvo nunca. En pantalla la insignia
 * salía muda; en el PDF —el documento que se firma y se le entrega al auditor—
 * se imprimía literalmente «undefined · undefined» en la columna que dice en qué
 * se apoya cada veredicto. En los tres controles, desde el primer commit.
 *
 * Las afirmaciones son sobre la ESTRUCTURA de la fila y de la celda del PDF
 * (qué claves trae, qué estado, qué color), nunca sobre el texto de la interfaz.
 * Y el caso que separa incumplimiento de hueco de medida mueve UN SOLO eje: la
 * misma evaluación con una evidencia en NO_CUMPLE y la misma en NO_EVALUABLE.
 *
 * Imports desde el FICHERO, nunca desde un barrel de alto nivel: el barrel
 * reintroduce el ciclo transitivo del TDZ de `Settings` y arrastra
 * `kibana-services`, que solo existe en el árbol del plugin `main` de Wazuh.
 */
import {
  buildENSReportEvidencePdfCell,
  buildENSReportRows,
  ensReportStatusBadgeColor,
  ensReportStatusPdfColor,
  ENS_REPORT_EVIDENCE_FIELD,
  ENS_REPORT_SIN_EVIDENCIA,
} from '../dashboard/ens/informes/report-rows';
import type { ENSReportRow } from '../dashboard/ens/informes/report-rows';
import type { ENSReportModel } from '../dashboard/ens/informes/registry';
import { buildENSReportModel } from '../dashboard/ens/informes/registry';
import { buildOpAcc1ReportModel } from '../dashboard/ens/informes/op-acc-1-report-model';

import { opAcc1CatalogDefinition } from '../dashboard/ens/catalog/op-acc-1';
import { opAcc1Configuration } from '../dashboard/ens/configuration/data/op-acc-1-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../dashboard/ens/configuration/types';
import { evaluateENSControl } from '../dashboard/ens/core/evaluation/evaluation-engine';
import type {
  ENSComplianceResult,
  ENSComplianceStatus,
} from '../dashboard/ens/core/evaluation/types';
import { getEvidenceDefinitions } from '../dashboard/ens/core/evidence/registry';
import type { ENSEvidenceResolved } from '../dashboard/ens/core/evidence/types';

// El repo no tiene @types/node y no va a tenerlos.
declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle: string = ''
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

const CONTROLES = ['mp.info.6', 'op.acc.1', 'op.acc.2'];

const ESTADOS_VALIDOS = [
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
];

// Todo el texto que la celda del PDF imprime, en el orden en que se lee.
const textoPdf = (fila: ENSReportRow): string =>
  buildENSReportEvidencePdfCell(fila)
    .text.map(fragmento => fragmento.text)
    .join('');

// La evidencia resuelta se construye desde la definición REAL del catálogo, no
// a mano: una fixture inventada probaría un control que no existe.
const evidencia = (
  controlId: string,
  evidenciaId: string,
  status: ENSComplianceStatus
): ENSEvidenceResolved => {
  const definicion = getEvidenceDefinitions(controlId).find(
    item => item.id === evidenciaId
  );

  if (!definicion) {
    throw new Error(`El catálogo no define ${evidenciaId} para ${controlId}`);
  }

  return {
    id: definicion.id,
    controlId: definicion.controlId,
    title: definicion.title,
    description: definicion.description,
    requirements: definicion.requirements,
    levels: definicion.levels,
    category: definicion.category,
    criticality: definicion.criticality,
    sourceTypes: definicion.sourceTypes,
    expectedEventTypes: definicion.expectedEventTypes,
    relatedRules: definicion.relatedRules,
    auditQuestion: definicion.auditQuestion,
    status,
    observations: [],
  };
};

// Valor válido para el tipo de cada parámetro: hace falta para que el eje
// «configuración incompleta» esté quieto mientras se mueve el de las evidencias.
const valorValido = (
  parametro: ENSControlParameter
): ENSControlParameter['value'] => {
  if (parametro.options && parametro.options.length) {
    return parametro.options[0];
  }

  switch (parametro.type) {
    case 'number':
    case 'duration_days':
    case 'duration_hours':
      return typeof parametro.minValue === 'number'
        ? Math.max(parametro.minValue, 1)
        : 7;
    case 'boolean':
      return true;
    case 'list':
      // Una lista que declara la forma de su elemento (`columns[0]`) no admite
      // cualquier cosa: 'valor-uno' no es una ruta absoluta. El ejemplo de la
      // ficha sí vale, y `config/test_control_blocks.py` ya obliga a que sea un
      // elemento válido.
      return parametro.columns && parametro.columns.length
        ? [parametro.example || '']
        : ['valor-uno', 'valor-dos'];
    case 'table':
      // Una fila entera. Con el `default: 'valor'` de antes, toda tabla
      // obligatoria salía INVALID y el eje «configuración» dejaba de estar
      // quieto: esta prueba mediría el hueco de configuración creyendo que mide
      // el de evidencias.
      return [parametro.example || ''];
    case 'path':
      return '/var/lib/ensfacil';
    case 'url':
      return 'https://ensfacil.example.org/api';
    default:
      return 'valor';
  }
};

const CONFIGURACION_OPACC1: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parametro => ({
    ...parametro,
    value: valorValido(parametro),
  })),
};

const EVIDENCIAS_OPACC1 = getEvidenceDefinitions('op.acc.1').map(
  definicion => definicion.id
);

// Todas las evidencias de op.acc.1 en CUMPLE salvo la que se diga.
const evaluaOpAcc1 = (
  excepciones: Record<string, ENSComplianceStatus> = {},
  nivel: ENSLevel = 'MEDIO'
): ENSComplianceResult =>
  evaluateENSControl(
    opAcc1CatalogDefinition,
    CONFIGURACION_OPACC1,
    nivel,
    EVIDENCIAS_OPACC1.map(id =>
      evidencia('op.acc.1', id, excepciones[id] || 'CUMPLE')
    ),
    undefined,
    []
  );

const filaDe = (filas: ENSReportRow[], campoId: string): ENSReportRow => {
  const fila = filas.find(item => item.campo.startsWith(`${campoId} ·`));

  if (!fila) {
    throw new Error(`fixture rota: el informe no trae el campo ${campoId}`);
  }

  return fila;
};

// ---------------------------------------------------------------------------
bloque('1 · la fila trae lo que la columna «Evidencia» necesita');

// El informe recién desplegado, sin ninguna evidencia todavía: es el estado
// REAL de un control el día que se instala, y es cuando alguien abre su informe
// por primera vez. Los tres modelos lo aceptan.
{
  for (const controlId of CONTROLES) {
    const modelo = buildENSReportModel(controlId, undefined);
    const filas = buildENSReportRows(modelo);

    comprueba(
      `${controlId} · el informe produce filas`,
      filas.length > 0,
      String(filas.length)
    );

    comprueba(
      `${controlId} · ninguna fila se queda sin evidencia`,
      filas.every(fila => fila.evidencia.length > 0),
      JSON.stringify(
        filas.filter(fila => !fila.evidencia).map(fila => fila.campo)
      )
    );

    comprueba(
      `${controlId} · ninguna fila se queda sin estado válido`,
      filas.every(fila => ESTADOS_VALIDOS.indexOf(fila.estado) >= 0),
      JSON.stringify(filas.map(fila => fila.estado))
    );

    // La clave por la que lee la columna de la pantalla. Es EXACTAMENTE lo que
    // estaba roto: la columna pedía `ev` y la fila traía `evidencia`. Aquí el
    // nombre sale del mismo sitio del que lo saca la tabla.
    comprueba(
      `${controlId} · la columna lee una clave que la fila sí tiene`,
      filas.every(fila => {
        const valor = (fila as unknown as Record<string, unknown>)[
          ENS_REPORT_EVIDENCE_FIELD
        ];

        return typeof valor === 'string' && valor.length > 0;
      }),
      ENS_REPORT_EVIDENCE_FIELD
    );

    // Y el PDF. Antes cada fila del documento firmado imprimía la cadena
    // «undefined» dos veces; el `indexOf` la busca en el texto ya montado.
    comprueba(
      `${controlId} · el PDF no imprime «undefined» en la columna Evidencia`,
      filas.every(fila => textoPdf(fila).indexOf('undefined') === -1),
      JSON.stringify(filas.map(textoPdf).filter(t => t.indexOf('undefined') >= 0))
    );

    comprueba(
      `${controlId} · el PDF imprime el estado y la evidencia de cada fila`,
      filas.every(
        fila =>
          textoPdf(fila).indexOf(fila.estado) >= 0 &&
          textoPdf(fila).indexOf(fila.evidencia) >= 0
      ),
      JSON.stringify(filas.slice(0, 2).map(textoPdf))
    );

    // El estado ya no encabeza «Valor»: sale una vez, en su columna. Si volviera
    // a duplicarse, la insignia podría vaciarse otra vez sin que se notara.
    comprueba(
      `${controlId} · la columna «Valor» ya no repite el estado`,
      filas.every(fila => !fila.valor.startsWith(`${fila.estado} · `)),
      JSON.stringify(
        filas
          .filter(fila => fila.valor.startsWith(`${fila.estado} · `))
          .map(fila => fila.campo)
      )
    );
  }
}

// ---------------------------------------------------------------------------
bloque('2 · la evidencia que aparece es la que el modelo declara');

{
  // Un control con evidencias de verdad: los identificadores de la fila tienen
  // que ser los del campo, no una lista fija ni la del control de al lado.
  const modelo = buildOpAcc1ReportModel(evaluaOpAcc1());
  const filas = buildENSReportRows(modelo);

  for (const campo of modelo.fields) {
    const fila = filaDe(filas, campo.id);

    comprueba(
      `op.acc.1 · ${campo.id} cita sus evidencias (${campo.evidenceIds.join(
        ', '
      )})`,
      fila.evidencia === campo.evidenceIds.join(', '),
      fila.evidencia
    );
  }

  // Control negativo del comparador de arriba: dos campos distintos de este
  // informe citan evidencias distintas, así que la comprobación no puede estar
  // pasando por comparar algo consigo mismo.
  comprueba(
    'op.acc.1 · dos campos del mismo informe citan evidencias distintas',
    filaDe(filas, 'op.acc.1.inventario').evidencia !==
      filaDe(filas, 'op.acc.1.genericas').evidencia,
    `${filaDe(filas, 'op.acc.1.inventario').evidencia} / ${
      filaDe(filas, 'op.acc.1.genericas').evidencia
    }`
  );
}

// ---------------------------------------------------------------------------
bloque('3 · un hueco de medida no se pinta como un incumplimiento');
//
// EJE ÚNICO: la misma evaluación, la misma configuración, el mismo nivel y las
// mismas ocho evidencias; solo EV-05 cambia de NO_CUMPLE a NO_EVALUABLE. El
// motor mantiene las dos cosas separadas (`nonConformities` / `measurementGaps`)
// y el documento firmado no las puede fundir.

{
  const conIncumplimiento = evaluaOpAcc1({ 'EV-05': 'NO_CUMPLE' });
  const conHueco = evaluaOpAcc1({ 'EV-05': 'NO_EVALUABLE' });

  // Primero, que el eje sea el que se dice: el motor los separa.
  comprueba(
    'motor · EV-05 en NO_CUMPLE abre no conformidad',
    conIncumplimiento.nonConformities.length > 0 &&
      conIncumplimiento.measurementGaps.every(
        hueco => hueco.evidenceIds.indexOf('EV-05') === -1
      ),
    `${conIncumplimiento.nonConformities.length} NC / ${conIncumplimiento.measurementGaps.length} PM`
  );

  comprueba(
    'motor · EV-05 sin medir NO abre no conformidad, abre hueco de medida',
    conHueco.nonConformities.length === 0 &&
      conHueco.measurementGaps.some(
        hueco => hueco.evidenceIds.indexOf('EV-05') >= 0
      ),
    `${conHueco.nonConformities.length} NC / ${conHueco.measurementGaps.length} PM`
  );

  const filaIncumple = filaDe(
    buildENSReportRows(buildOpAcc1ReportModel(conIncumplimiento)),
    'op.acc.1.servicio'
  );

  const filaHueco = filaDe(
    buildENSReportRows(buildOpAcc1ReportModel(conHueco)),
    'op.acc.1.servicio'
  );

  comprueba(
    'informe · el incumplimiento demostrado sale NO_CUMPLE',
    filaIncumple.estado === 'NO_CUMPLE',
    filaIncumple.estado
  );

  comprueba(
    'informe · el hueco de medida NO sale como NO_CUMPLE',
    filaHueco.estado === 'NO_EVALUABLE',
    filaHueco.estado
  );

  // Y en el PDF, que es el documento que se firma: colores distintos, y el del
  // hueco no es el rojo del incumplimiento.
  comprueba(
    'PDF · el hueco de medida no se imprime del color del incumplimiento',
    ensReportStatusPdfColor(filaHueco.estado) !==
      ensReportStatusPdfColor(filaIncumple.estado),
    `${ensReportStatusPdfColor(filaHueco.estado)} / ${ensReportStatusPdfColor(
      filaIncumple.estado
    )}`
  );

  comprueba(
    'pantalla · la insignia del hueco no lleva el color de peligro',
    ensReportStatusBadgeColor(filaHueco.estado) !== 'danger' &&
      ensReportStatusBadgeColor(filaIncumple.estado) === 'danger',
    `${ensReportStatusBadgeColor(
      filaHueco.estado
    )} / ${ensReportStatusBadgeColor(filaIncumple.estado)}`
  );

  // Control negativo del comparador de colores: si devolviera cualquier cosa
  // distinta para cualquier par, esta línea también fallaría, y no falla.
  comprueba(
    'PDF · dos filas del mismo estado sí comparten color',
    ensReportStatusPdfColor(filaHueco.estado) ===
      ensReportStatusPdfColor('NO_EVALUABLE')
  );

  // La otra mitad del eje: en el informe entero solo se mueven las filas que
  // citan EV-05 —la suya y las dos que resumen el control—, y ninguna otra. Sin
  // esto, el caso podría estar moviendo el informe entero y no notarse.
  const modeloIncumple = buildOpAcc1ReportModel(conIncumplimiento);
  const filasIncumple = buildENSReportRows(modeloIncumple);
  const filasHueco = buildENSReportRows(buildOpAcc1ReportModel(conHueco));

  const citaEv05 = (posicion: number): boolean =>
    modeloIncumple.fields[posicion].evidenceIds.indexOf('EV-05') >= 0;

  const movidas = filasIncumple
    .map((fila, posicion) => ({ fila, posicion }))
    .filter(({ fila, posicion }) => fila.estado !== filasHueco[posicion].estado);

  comprueba(
    'informe · toda fila que se mueve cita EV-05, la evidencia del eje',
    movidas.every(({ posicion }) => citaEv05(posicion)),
    JSON.stringify(
      movidas
        .filter(({ posicion }) => !citaEv05(posicion))
        .map(({ fila }) => fila.campo)
    )
  );

  // Control negativo del criterio de arriba: si «cita EV-05» valiera para todas
  // las filas, la comprobación anterior pasaría sin decir nada. No vale: hay
  // filas que no la citan, y son exactamente las que no se han movido.
  comprueba(
    'informe · hay filas que no citan EV-05, y ninguna se ha movido',
    filasIncumple.some((fila, posicion) => !citaEv05(posicion)) &&
      filasIncumple.every(
        (fila, posicion) =>
          citaEv05(posicion) || fila.estado === filasHueco[posicion].estado
      ),
    JSON.stringify(
      filasIncumple
        .filter((fila, posicion) => !citaEv05(posicion))
        .map(fila => fila.campo)
    )
  );
}

// ---------------------------------------------------------------------------
bloque('4 · las guardas: nada de huecos mudos ni de rojos inventados');
//
// Modelos escritos a mano, y solo aquí: es la única forma de ejercitar las dos
// guardas, porque los tres modelos reales nunca producen ni un estado fuera de
// la lista ni un campo sin evidencias. Una guarda que ninguna fixture ejecuta no
// es una guarda, es un comentario.

{
  const modeloRaro: ENSReportModel = {
    controlId: 'op.acc.1',
    status: 'SIN_DATOS',
    score: null,
    coverage: null,
    level: 'MEDIO',
    fields: [
      {
        id: 'campo.sin.evidencias',
        title: 'Campo que no declara evidencias',
        status: 'CUMPLE',
        value: 'lo que sea',
        evidenceIds: [],
        details: [],
        producerGaps: [],
      },
      {
        id: 'campo.con.estado.roto',
        title: 'Campo con un estado que no existe',
        // Justo lo que producía el fallo: un valor que la columna imprimía tal
        // cual. Va forzado porque el tipo, con razón, no lo permite.
        status: undefined as unknown as ENSReportModel['status'],
        value: 'lo que sea',
        evidenceIds: ['EV-01'],
        details: [],
        producerGaps: ['P-04'],
      },
    ],
  };

  const [sinEvidencias, estadoRoto] = buildENSReportRows(modeloRaro);

  comprueba(
    'guarda · un campo sin evidencias lo DICE, no deja el hueco mudo',
    sinEvidencias.evidencia === ENS_REPORT_SIN_EVIDENCIA,
    sinEvidencias.evidencia
  );

  comprueba(
    'guarda · un estado fuera de la lista cae a SIN_DATOS, no a undefined',
    estadoRoto.estado === 'SIN_DATOS',
    String(estadoRoto.estado)
  );

  comprueba(
    'guarda · ese estado no se imprime en rojo en el PDF',
    ensReportStatusPdfColor(estadoRoto.estado) !==
      ensReportStatusPdfColor('NO_CUMPLE'),
    ensReportStatusPdfColor(estadoRoto.estado)
  );

  comprueba(
    'guarda · los datos pendientes del productor llegan a la celda del PDF',
    textoPdf(estadoRoto).indexOf('P-04') >= 0,
    textoPdf(estadoRoto)
  );

  comprueba(
    'guarda · sin datos pendientes la celda no inventa una línea vacía',
    buildENSReportEvidencePdfCell(sinEvidencias).text.length === 2 &&
      buildENSReportEvidencePdfCell(estadoRoto).text.length === 3,
    `${buildENSReportEvidencePdfCell(sinEvidencias).text.length} / ${
      buildENSReportEvidencePdfCell(estadoRoto).text.length
    }`
  );
}

// --- resultado --------------------------------------------------------------

console.log('');

if (fallos.length > 0) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(fallo => console.log(`  · ${fallo}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
