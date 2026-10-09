/**
 * Las filas de la tabla «Campos del informe»: la que se ve en pantalla y la que
 * se imprime en el PDF que se firma y se le entrega al auditor.
 *
 * POR QUÉ EXISTE ESTE FICHERO. La columna «Evidencia» leía de la fila dos
 * claves que la fila NUNCA tuvo, y lo hacía desde el primer commit del módulo:
 *
 *     const rows = reportModel.fields.map(field => ({
 *       campo, valor, evidencia,          // <- lo que la fila sí traía
 *     }));
 *
 *     { field: 'ev', name: 'Evidencia',
 *       render: (ev, item) => <EuiBadge …>{ev} · {item.status}</EuiBadge> }
 *
 * En pantalla `ev` e `item.status` salían `undefined`, React no pinta
 * `undefined` y la insignia quedaba muda —un separador « · » y nada más—. En el
 * PDF era peor, porque allí se interpolaban en una plantilla: cada fila del
 * documento firmado imprimía literalmente «undefined · undefined» en la columna
 * que sostiene el veredicto. Y afectaba a los TRES controles por igual, porque
 * la fila la construye la pantalla, no el modelo de informe de cada control.
 *
 * No era un fallo cosmético. El valor del producto es la cadena
 * `CUMPLE → evidencia → rule ID → evento crudo`, y esta columna es por donde el
 * auditor la empieza a recorrer: un veredicto sin la evidencia que lo sostiene
 * es del mismo género que el CUMPLE falso que prohíbe el principio rector.
 *
 * POR QUÉ VIVE APARTE DE `index.tsx`. Porque así se puede probar. `index.tsx`
 * arrastra React, EUI, pdfMake y los hooks de Wazuh —ninguno existe en este
 * repo—, así que nada de lo que hubiera dentro podía ejercitarse. Aquí no hay
 * nada de eso: entran datos y salen datos, y `tests/evidence-column.test.ts`
 * lo recorre con los tres controles.
 *
 * Tipos desde `./registry`, que es un fichero del propio módulo. Nunca desde el
 * barrel `../core`: por ahí vuelve el ciclo transitivo del TDZ de `Settings`.
 */
import type {
  ENSReportField,
  ENSReportFieldStatus,
  ENSReportModel,
} from './registry';

// Una fila de la tabla. Tener las claves en un tipo es lo que convierte el
// fallo de arriba —leer una clave que no existe— en un error de compilación en
// el árbol del plugin, en vez de en una insignia vacía que nadie mira.
export interface ENSReportRow {
  campo: string;

  // EL HALLAZGO: qué se observó en la máquina. Ya NO encabezado por el
  // estado, que tiene su columna, y ya no mezclado con la configuración.
  valor: string;

  // Contra qué se comparó: el eco de los parámetros declarados. Iba pegado al
  // hallazgo en la misma cadena, separado por ' · ', así que la columna
  // «Valor» empezaba por la configuración y enterraba el resultado. Va debajo,
  // en gris, porque es contexto y no veredicto. Cadena vacía si no aporta.
  contexto: string;

  // Qué evidencia sostiene la fila. Nunca vacío: si el campo no declara
  // ninguna, lo dice con todas las letras.
  evidencia: string;

  // Qué le falta al productor para que la fila esté completa, o cadena vacía.
  datosPendientes: string;

  // El veredicto del campo, tal y como lo calculó su modelo de informe. Aquí
  // no se recalcula nada: se transporta.
  estado: ENSReportFieldStatus;
}

// Un fragmento de texto del PDF (pdfMake). El repo no tiene los tipos de
// pdfMake, así que se declara lo poco que se usa: sin esto la celda volvería a
// ser un objeto anónimo que nadie puede comprobar.
export interface ENSReportPdfTextRun {
  text: string;
  color?: string;
  bold?: boolean;
}

export interface ENSReportPdfCell {
  style: string;
  text: ENSReportPdfTextRun[];
}

// Lo que dice la columna cuando el campo no declara ninguna evidencia. Decirlo
// es mejor que el hueco mudo que había: el auditor distingue «este campo no se
// apoya en ninguna evidencia» de «la insignia no ha cargado».
export const ENS_REPORT_SIN_EVIDENCIA = 'Evidencia no disponible';

// La clave por la que la columna «Evidencia» de la pantalla lee la fila. Vive
// aquí, y no como literal suelto en la tabla, porque ese literal suelto es
// exactamente lo que se desincronizó de la fila y nadie notó.
export const ENS_REPORT_EVIDENCE_FIELD = 'evidencia';

// Gris de EUI/pdfMake para lo que no se ha podido medir y para el texto
// secundario.
const COLOR_SIN_MEDIR = '#69707d';

const ESTADOS: ENSReportFieldStatus[] = [
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
];

// Un estado que no sea uno de los seis se publica como SIN_DATOS (gris), nunca
// como `undefined` y nunca como incumplimiento. Es la guarda que impide que
// vuelva a haber una insignia muda, y la que garantiza que un dato ausente no
// se pinte de rojo en un documento firmado.
const asEstado = (value: unknown): ENSReportFieldStatus =>
  ESTADOS.indexOf(value as ENSReportFieldStatus) >= 0
    ? (value as ENSReportFieldStatus)
    : 'SIN_DATOS';

// Lo observado en la máquina, sin la configuración con la que se contrastó.
const hallazgoDe = (field: ENSReportField): string =>
  (field.details || []).filter(Boolean).join(' · ');

const esPuntuacion = (field: ENSReportField): boolean =>
  field.id.endsWith('.puntuacion');

const buildENSReportRow = (field: ENSReportField): ENSReportRow => ({
  campo: `${field.id} · ${field.title}`,

  // El estado ya no encabeza el valor. Lo hacía, y ese duplicado es lo que
  // disimulaba el hueco: la columna «Valor» decía «NO_CUMPLE · …» mientras la
  // de al lado, la que tenía que decir en qué evidencia se apoya ese
  // NO_CUMPLE, estaba en blanco. Ahora el estado sale una vez, al lado de su
  // evidencia.
  //
  // Y manda el HALLAZGO. `details` es lo observado —el motivo que trae el
  // motor, la cuenta concreta que incumple—; `value` es contra qué se comparó.
  // Unidos por ' · ' en una sola cadena, la celda abría con «Fuente de
  // identidad: … · Sistemas en scope: …» y el resultado quedaba al final,
  // detrás de la configuración que ya tiene su propia tabla. Cuando no hay
  // hallazgo que contar —un campo que conforma sin desviaciones— el contraste
  // pasa a ser el valor, porque entonces sí es lo único que hay que decir.
  // La puntuación es la excepción: su número es el resultado y sus detalles
  // (nivel evaluado, parámetros) son el contexto.
  valor: esPuntuacion(field)
    ? field.value || '—'
    : hallazgoDe(field) || field.value || '—',

  contexto: esPuntuacion(field)
    ? hallazgoDe(field)
    : hallazgoDe(field) ? field.value || '' : '',

  evidencia:
    (field.evidenceIds || []).length > 0
      ? field.evidenceIds.join(', ')
      : ENS_REPORT_SIN_EVIDENCIA,

  datosPendientes:
    (field.producerGaps || []).length > 0
      ? `Datos pendientes: ${field.producerGaps.join(', ')}`
      : '',

  estado: asEstado(field.status),
});

// Las filas de un modelo de informe ya construido. Sirve para los tres
// controles sin saber cuál es: los tres modelos tienen la misma forma, que es
// lo único que promete `ENSReportModel`.
export const buildENSReportRows = (
  model: ENSReportModel | undefined,
): ENSReportRow[] => (model?.fields || []).map(buildENSReportRow);

// La línea de PRUEBA bajo el veredicto de cada requisito del informe. El
// veredicto es el mismo a propósito —lo no demostrado cuenta en contra—, así
// que lo que separa un requisito de otro es cómo se demostró: con un documento
// (`attested`), midiendo (`evidenced`) o no demostrado, con las causas de sus
// no conformidades. Un cumplimiento documental se lee «acreditado
// documentalmente», nunca como una medida. En un NO_APLICA no hay nada que
// decir: no había nada que medir.
export const ensRequirementProofLabel = (
  requirement: { status: string; attested?: boolean; evidenced?: boolean },
  causes: string[] = [],
): string => {
  if (requirement.status === 'NO_APLICA') {
    return '';
  }

  if (requirement.attested) {
    return 'Acreditado documentalmente';
  }

  if (requirement.evidenced) {
    return 'Medido';
  }

  return causes.length > 0
    ? `No evidenciado · ${causes.join(', ')}`
    : 'No evidenciado';
};

// Color de la insignia de estado en pantalla (paleta de EuiBadge).
export const ensReportStatusBadgeColor = (estado: string): string =>
  estado === 'CUMPLE'
    ? 'success'
    : estado === 'PARCIAL'
    ? 'warning'
    : estado === 'NO_CUMPLE'
    ? 'danger'
    : estado === 'NO_APLICA'
    ? 'hollow'
    : 'default';

// Color del estado en el PDF.
//
// NO_CUMPLE va en rojo; NO_EVALUABLE y SIN_DATOS, en gris. Es la misma
// separación que el motor mantiene entre `nonConformities` (incumplimiento
// DEMOSTRADO) y `measurementGaps` (hueco de medida, que no es incumplimiento),
// y el documento firmado no la puede fundir: un requisito que no se ha podido
// medir no puede salir del mismo color que uno que falla.
export const ensReportStatusPdfColor = (estado: string): string =>
  estado === 'CUMPLE'
    ? '#4caf50'
    : estado === 'PARCIAL'
    ? '#f5a700'
    : estado === 'NO_CUMPLE'
    ? '#e53935'
    : COLOR_SIN_MEDIR;

// La celda «Evidencia» del PDF: el veredicto y, debajo, qué lo sostiene.
//
// La construye este fichero y no `index.tsx` porque allí era donde se
// interpolaban las dos claves inexistentes. Con la celda aquí, lo que se
// imprime en el documento firmado se puede comprobar sin abrir un PDF.
export const buildENSReportEvidencePdfCell = (
  row: ENSReportRow,
): ENSReportPdfCell => ({
  style: 'td',
  text: [
    {
      text: row.estado,
      color: ensReportStatusPdfColor(row.estado),
      bold: true,
    },
    {
      text: `\n${row.evidencia}`,
    },
    ...(row.datosPendientes
      ? [
          {
            text: `\n${row.datosPendientes}`,
            color: COLOR_SIN_MEDIR,
          },
        ]
      : []),
  ],
});
