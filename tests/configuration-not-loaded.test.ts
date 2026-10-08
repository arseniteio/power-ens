/**
 * Un fallo de configuración tiene que VERSE, no quedarse cargando.
 *
 *     npx tsx tests/configuration-not-loaded.test.ts
 *
 * POR QUÉ EXISTE ESTE FICHERO. El 06/08/2026 la pantalla de ENS se quedó en
 * «Cargando configuración y alcance ENS…» para siempre, en producción. La causa
 * era un documento de configuración con columnas sin `required` booleano, y el
 * validador lo decía con el camino exacto del campo:
 *
 *     configuration.controls[3].parameters[0].columns[1].required must be a boolean
 *
 * Ese mensaje resolvía el problema en un minuto y NO LLEGÓ A LA PANTALLA. El
 * alcance se hidrata después de la configuración y solo si la configuración fue
 * bien; al fallar, se quedaba en NOT_STARTED, que era uno de los estados que
 * pintaban el spinner, y la comprobación del spinner venía ANTES que la del
 * error. La combinación «configuración en ERROR + alcance sin empezar» daba
 * carga infinita.
 *
 * Se prueban las dos mitades: que el validador detecta el documento malo con su
 * camino, y que esa combinación de estados resuelve a ERROR y no a LOADING.
 */
import { assertENSConfigurationVersion } from '../public/ens/configuration/services/configuration-structure-validator';
import { defaultENSConfigurationTemplate } from '../public/ens/configuration/data/default-configuration';

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

// --- 1. el validador detecta la columna sin `required` --------------------

bloque('1. Una columna sin `required` booleano no pasa, y se dice cuál');

{
  // Se parte de la PLANTILLA REAL del producto, que es válida por construcción,
  // y se le injerta una tabla. Escribir la configuración a mano en la prueba no
  // vale: el validador exige una veintena de campos y una fixture incompleta
  // falla por los campos que faltan, no por lo que se quiere probar — que es
  // justo lo que pasó al escribir este fichero.
  const conTabla = (requiredDeLaSegunda: boolean | undefined) => {
    const cfg = JSON.parse(
      JSON.stringify(defaultENSConfigurationTemplate)
    );

    const columnas: Record<string, unknown>[] = [
      { name: 'rol', label: 'Rol', type: 'identifier', required: true },
      { name: 'recurso', label: 'Recurso', type: 'string' },
    ];

    if (requiredDeLaSegunda !== undefined) {
      columnas[1].required = requiredDeLaSegunda;
    }

    cfg.controls[0].parameters.push({
      id: 'P-ZZ',
      controlId: cfg.controls[0].controlId,
      name: 'matriz_de_prueba',
      label: 'Matriz de prueba',
      description: 'Tabla injertada para esta prueba.',
      type: 'table',
      required: false,
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      ruleIds: [],
      evidenceIds: [],
      wazuhUsage: '-',
      ensfacilUsage: '-',
      ifNotConfigured: '-',
      value: [],
      columns: columnas,
    });

    return cfg;
  };

  // Control positivo: la plantilla intacta pasa. Sin esto, un validador roto
  // haría pasar la comprobación de abajo por el motivo equivocado.
  let plantillaPasa = true;
  let porQue = '';

  try {
    assertENSConfigurationVersion(
      JSON.parse(JSON.stringify(defaultENSConfigurationTemplate))
    );
  } catch (error) {
    plantillaPasa = false;
    porQue = error instanceof Error ? error.message : String(error);
  }

  comprueba(
    'la plantilla del producto es válida (control positivo)',
    plantillaPasa,
    porQue
  );

  let mensaje = '';

  try {
    assertENSConfigurationVersion(conTabla(undefined));
  } catch (error) {
    mensaje = error instanceof Error ? error.message : String(error);
  }

  comprueba(
    'una columna sin `required` booleano se rechaza',
    Boolean(mensaje),
    'el validador la dio por buena'
  );

  comprueba(
    'y el mensaje dice EXACTAMENTE qué columna, con su camino',
    mensaje.includes('columns[1].required'),
    mensaje
  );

  // La reversión: con `required` explícito, el mismo documento pasa.
  let arregladoPasa = true;
  let motivo = '';

  try {
    assertENSConfigurationVersion(conTabla(false));
  } catch (error) {
    arregladoPasa = false;
    motivo = error instanceof Error ? error.message : String(error);
  }

  comprueba(
    'con `required: false` explícito, el mismo documento pasa',
    arregladoPasa,
    motivo
  );
}

// --- 2. ERROR gana a NOT_STARTED ------------------------------------------

bloque('2. Configuración en ERROR con alcance sin empezar: se ve el error');

{
  // La decisión que toma la pantalla, aislada de React: exactamente el orden de
  // los dos `if` de `configuration/index.tsx`.
  type Estado = 'NOT_STARTED' | 'LOADING' | 'READY' | 'ERROR';

  const decide = (config: Estado, alcance: Estado): string => {
    if (config === 'ERROR' || alcance === 'ERROR') {
      return 'ERROR';
    }

    if (
      config === 'NOT_STARTED' ||
      config === 'LOADING' ||
      alcance === 'NOT_STARTED' ||
      alcance === 'LOADING'
    ) {
      return 'CARGANDO';
    }

    return 'CONTENIDO';
  };

  // EL CASO DE PRODUCCIÓN. La configuración falló, así que el alcance nunca
  // llegó a arrancar.
  comprueba(
    'config ERROR + alcance NOT_STARTED → se pinta el ERROR',
    decide('ERROR', 'NOT_STARTED') === 'ERROR',
    decide('ERROR', 'NOT_STARTED')
  );

  comprueba(
    'config ERROR + alcance LOADING → se pinta el ERROR',
    decide('ERROR', 'LOADING') === 'ERROR',
    decide('ERROR', 'LOADING')
  );

  comprueba(
    'y al revés: alcance ERROR con la config lista → ERROR',
    decide('READY', 'ERROR') === 'ERROR',
    decide('READY', 'ERROR')
  );

  // La reversión: una carga normal SIGUE mostrando el spinner. Sin esto, poner
  // ERROR primero podría haberse llevado por delante el estado de carga.
  comprueba(
    'una carga de verdad sigue mostrando el spinner',
    decide('LOADING', 'NOT_STARTED') === 'CARGANDO',
    decide('LOADING', 'NOT_STARTED')
  );

  comprueba(
    'y con todo listo se pinta el contenido',
    decide('READY', 'READY') === 'CONTENIDO',
    decide('READY', 'READY')
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
