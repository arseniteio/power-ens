/**
 * El registro de modelos de informe por control.
 *
 *     ~/.bun/bin/bun run tests/report-by-control.test.ts
 *
 * Mismo montaje que `prefix-filter.test.ts`: TypeScript suelto con su propio
 * comprobador, sin `package.json` ni `tsconfig`. Hace falta un runtime que
 * ejecute TypeScript resolviendo imports sin extensión (`bun`, probado con
 * 1.3.14).
 *
 * QUÉ SE PRUEBA Y POR QUÉ EXISTE ESTE FICHERO. La pantalla de Informes elegía
 * el modelo con una cadena de ternarios cuya RAMA POR DEFECTO era mp.info.6:
 * un control que no estuviera contemplado explícitamente —y ninguno de los que
 * están por llegar lo está— se registraba bien en `data/`, salía en la lista
 * con su nombre y su nivel correctos, y al abrir su informe generaba el de las
 * copias de seguridad, con los requisitos y las evidencias de mp.info.6 bajo su
 * propia cabecera. No rompía nada visible: producía un documento PLAUSIBLE Y
 * EQUIVOCADO, y ese documento va firmado ante un auditor.
 *
 * La comprobación que fija el arreglo es la del bloque 3: un control sin modelo
 * devuelve `undefined`, y lo que devuelve NO es el modelo de mp.info.6. Con el
 * código anterior las dos fallan; la segunda es la que distingue «no hay
 * informe» de «hay informe, y es el de otro».
 *
 * Todas las afirmaciones son sobre la ESTRUCTURA —qué controles responden, qué
 * `controlId` y qué identificadores de campo trae el modelo construido—, nunca
 * sobre el texto de un mensaje. Los identificadores de campo son el
 * discriminador fuerte entre modelos: mp.info.6 los numera `REP-0x` y los dos
 * op.acc.* los nombran `<control>.<campo>`, así que un modelo cambiado por otro
 * se ve sin mirar ningún literal de la interfaz.
 *
 * Imports desde el FICHERO, nunca desde un barrel de alto nivel.
 */
import {
  buildENSReportModel,
  buildENSReportModelRegistry,
  getENSReportModelDefinition,
  getRegisteredENSReportControls,
  listENSControlsWithoutReportModel,
} from '../dashboard/ens/reports/registry';
import type { ENSReportModelDefinition } from '../dashboard/ens/reports/registry';
import { ENSControls } from '../dashboard/ens/data';

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

const lanza = (accion: () => unknown): boolean => {
  try {
    accion();

    return false;
  } catch (error) {
    return true;
  }
};

// --- fixtures --------------------------------------------------------------

// Un control que NO existe en el producto, y que NUNCA va a existir.
//
// Aquí ponía `op.acc.3`, elegido porque era el siguiente control que iba a
// llegar. Llegó —el 06/08, generado del Excel y con su modelo de informe— y
// estas cuatro comprobaciones se pusieron rojas sin que nada estuviera mal:
// el papel de «control sin modelo» se lo había dado a un control real que
// acabó teniéndolo. Una prueba que caduca cuando el producto avanza no
// protege nada, molesta.
//
// El identificador es sintético a propósito: ningún control del ENS se llama
// así, así que el papel no se lo puede quitar nadie.
const CONTROL_SIN_MODELO = 'ens.control.sin.modelo';

// Resultado del motor con la forma que devuelve `getENSComplianceResultByControl`
// cuando todavía no ha llegado ninguna evidencia: es el estado REAL de un
// control recién desplegado, que es justo cuando alguien abriría su informe por
// primera vez. Los tres builders lo aceptan y ninguno necesita más para
// producir su lista de campos.
const resultadoSinEvidencias = undefined;

const definicionRegistrada = (
  controlId: string
): ENSReportModelDefinition => {
  const definicion = getENSReportModelDefinition(controlId);

  if (!definicion) {
    throw new Error(`fixture rota: ${controlId} debería estar registrado`);
  }

  return definicion;
};

// --- 1. el registro responde por los controles que tienen modelo ------------

{
  bloque('1. El registro responde por los controles registrados');

  const registrados = getRegisteredENSReportControls();

  // op.acc.3 y op.acc.4 entraron el 06/08 en `status: 'DRAFT'`: no emiten
  // evidencia todavía y quedan fuera del índice, pero SÍ tienen que tener
  // modelo de informe. Un control que se ve en la pantalla y al abrir su
  // informe recibe el de otro es el defecto que este fichero vigila, y no
  // depende de que el control esté activo.
  comprueba(
    'registro · están los once controles del catálogo, y solo esos',
    registrados.join(',') ===
      'mp.info.6,op.acc.1,op.acc.2,op.acc.3,op.acc.4,' +
      'op.acc.5,op.acc.6,op.exp.1,op.exp.2,op.exp.3,op.exp.4',
    registrados.join(',')
  );

  for (const controlId of registrados) {
    const definicion = definicionRegistrada(controlId);

    comprueba(
      `registro · ${controlId} se devuelve a sí mismo, no a otro`,
      definicion.controlId === controlId,
      definicion.controlId
    );

    // El título es lo que encabeza el informe en pantalla y el PDF. Que empiece
    // por el identificador del control es lo que impide que un copiar-pegar
    // deje a un control con el encabezado de otro: es el mismo error del
    // modelo, pero en la portada del documento firmado.
    comprueba(
      `registro · el título de ${controlId} empieza por su identificador`,
      definicion.name.startsWith(`${controlId} `),
      definicion.name
    );
  }
}

// --- 2. el modelo construido es el del control pedido -----------------------

{
  bloque('2. El modelo construido es el del control pedido');

  for (const controlId of getRegisteredENSReportControls()) {
    const modelo = buildENSReportModel(controlId, resultadoSinEvidencias);

    comprueba(
      `modelo · ${controlId} construye modelo`,
      modelo !== undefined
    );

    comprueba(
      `modelo · el modelo de ${controlId} se declara de ${controlId}`,
      modelo?.controlId === controlId,
      String(modelo?.controlId)
    );

    comprueba(
      `modelo · ${controlId} trae campos propios`,
      (modelo?.fields.length || 0) > 0,
      String(modelo?.fields.length)
    );
  }

  // Y los tres modelos son DISTINTOS entre sí. Sin esta comprobación, un
  // registro que devolviera siempre el mismo builder pasaría las de arriba
  // salvo la del `controlId`, que los tres builders rellenan a mano.
  const camposDe = (controlId: string): string =>
    (buildENSReportModel(controlId, resultadoSinEvidencias)?.fields || [])
      .map(campo => campo.id)
      .join(',');

  const juegos = new Set([
    camposDe('mp.info.6'),
    camposDe('op.acc.1'),
    camposDe('op.acc.2'),
  ]);

  comprueba(
    'modelo · los tres controles producen juegos de campos distintos',
    juegos.size === 3,
    `${juegos.size} juego(s) distintos de 3`
  );
}

// --- 3. un control sin modelo NO recibe el de otro --------------------------
//
// Es el bloque que fija el arreglo. Con la cadena de ternarios anterior las
// tres comprobaciones fallan: la primera y la segunda porque se devolvía un
// modelo, y la tercera porque el modelo devuelto era EXACTAMENTE el de
// mp.info.6.

{
  bloque('3. Un control sin modelo no recibe el de otro');

  comprueba(
    'sin modelo · el registro devuelve undefined, no un modelo de repuesto',
    getENSReportModelDefinition(CONTROL_SIN_MODELO) === undefined,
    String(getENSReportModelDefinition(CONTROL_SIN_MODELO)?.controlId)
  );

  const modeloAjeno = buildENSReportModel(
    CONTROL_SIN_MODELO,
    resultadoSinEvidencias
  );

  comprueba(
    'sin modelo · construir el informe devuelve undefined',
    modeloAjeno === undefined,
    String(modeloAjeno?.controlId)
  );

  // La comprobación que separa «no hay informe» de «hay informe, y es el de
  // las copias de seguridad»: antes las dos cosas eran el mismo objeto.
  const modeloMpInfo6 = buildENSReportModel(
    'mp.info.6',
    resultadoSinEvidencias
  );

  comprueba(
    'sin modelo · lo devuelto NO es el modelo de mp.info.6',
    JSON.stringify(modeloAjeno ?? null) !==
      JSON.stringify(modeloMpInfo6 ?? null),
    'un control sin modelo estaba recibiendo el informe de mp.info.6'
  );

  // Control negativo del propio comparador de arriba: si comparase mal, esta
  // línea también pasaría, y no pasa.
  comprueba(
    'sin modelo · el comparador sí ve iguales dos modelos de mp.info.6',
    JSON.stringify(modeloMpInfo6 ?? null) ===
      JSON.stringify(
        buildENSReportModel('mp.info.6', resultadoSinEvidencias) ?? null
      )
  );
}

// --- 4. todo control de la pantalla de Informes tiene modelo ----------------
//
// `ENSControls` es literalmente la lista que la pestaña Informes recorre para
// pintar una sección por control. Cruzarla con el registro es la comprobación
// que se dispara sola el día que entre un control sin su modelo. El 06/08
// entraron dos —op.acc.3 y op.acc.4— y no saltó: el generador los registra.

{
  bloque('4. Todo control listado en Informes tiene modelo');

  const delCatalogo = ENSControls.map(control => control.id);

  comprueba(
    'catálogo · la lista de la pantalla no está vacía',
    delCatalogo.length > 0,
    String(delCatalogo.length)
  );

  const sinModelo = listENSControlsWithoutReportModel(delCatalogo);

  comprueba(
    'catálogo · ningún control listado se queda sin modelo de informe',
    sinModelo.length === 0,
    sinModelo.join(', ')
  );

  // Control negativo del ayudante: un `[]` verde arriba no puede venir de una
  // función que devuelva `[]` siempre. Se le pasan los dos controles que entran
  // mañana y tiene que nombrarlos a los dos, y solo a los dos.
  //
  // La lista de partida son los controles REGISTRADOS, no los del catálogo: así
  // esta comprobación mueve un solo eje —añadir dos controles sin modelo— y no
  // se contamina con el resultado de la de arriba.
  const conLosQueVienen = listENSControlsWithoutReportModel([
    ...getRegisteredENSReportControls(),
    CONTROL_SIN_MODELO,
    `${CONTROL_SIN_MODELO}.2`,
  ]);

  comprueba(
    'catálogo · el ayudante sí nombra a los controles que no tienen modelo',
    conLosQueVienen.join(',') ===
      `${CONTROL_SIN_MODELO},${CONTROL_SIN_MODELO}.2`,
    conLosQueVienen.join(',')
  );
}

// --- 5. las guardas del registro ------------------------------------------

{
  bloque('5. Las guardas del registro');

  const definicion = (
    controlId: string
  ): ENSReportModelDefinition => ({
    controlId,
    name: `${controlId} - de prueba`,
    build: () => ({
      controlId,
      status: 'SIN_DATOS',
      score: null,
      coverage: null,
      level: 'SIN_DATOS',
      fields: [],
    }),
  });

  comprueba(
    'guarda · una lista sana no lanza',
    !lanza(() =>
      buildENSReportModelRegistry([
        definicion(CONTROL_SIN_MODELO),
        definicion('op.acc.4'),
      ])
    )
  );

  comprueba(
    'guarda · dos modelos para el mismo control lanzan',
    lanza(() =>
      buildENSReportModelRegistry([
        definicion(CONTROL_SIN_MODELO),
        definicion(CONTROL_SIN_MODELO),
      ])
    )
  );

  comprueba(
    'guarda · un modelo sin controlId lanza',
    lanza(() => buildENSReportModelRegistry([definicion('   ')]))
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
