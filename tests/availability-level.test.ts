/**
 * El nivel de la dimensión de Disponibilidad (op.cont.2 y op.cont.3).
 *
 *     npx --yes tsx tests/availability-level.test.ts
 *
 * Calcada de `traceability-level.test.ts`. El Anexo II aplica op.cont.2 y
 * op.cont.3 por el NIVEL de la Disponibilidad, no por la categoría del sistema:
 * solo rigen con D en ALTO. La configuración global admite un
 * `availabilityLevel` opcional y el catálogo de esos controles declara
 * `levelDimension: 'D'`. Sin esto, un sistema de categoría ALTA con D en MEDIO
 * exigiría op.cont.2 por error.
 *
 * Qué se prueba:
 *   1. La resolución: con D, el control de D usa D; sin D, el global; T y D no
 *      se mezclan.
 *   2. El motor: sin D, nada cambia; con D distinto del global, solo cambia el
 *      control que se rige por D (se compara el resultado entero, control a
 *      control), y lo exigible sigue a D.
 *   3. El validador acepta la clave ausente y un nivel; rechaza `null` y basura.
 *   4. Guardar la configuración global sin D QUITA la clave, no la resucita.
 *
 * Mientras op.cont.2 y op.cont.3 no estén en el catálogo, el motor se prueba con
 * un SUPLENTE: op.acc.3 (rige en MEDIO y ALTO) declarado `levelDimension: 'D'`
 * solo durante esta prueba, y restaurado al final. Los controles que de verdad
 * declaren D entran también en la comparación.
 *
 * El motor arrastra `kibana-services`, que solo existe en el árbol del plugin
 * `main` de Wazuh; aquí se sustituye por un módulo vacío antes de cargarlo.
 */
import { ENSCatalog } from '../common/ens/catalog';
import type { ENSControlDefinition } from '../common/ens/catalog/types';
import { resolveControlLevel } from '../common/ens/core/control-level';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import type {
  ENSConfigurationVersion,
  ENSLevel,
} from '../common/ens/configuration/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

// `kibana-services` de mentira, ANTES de cargar el motor.
{
  const Module = require('module');
  const cargar = Module._load;

  Module._load = function (peticion: string, ...resto: unknown[]) {
    if (/kibana-services$/.test(peticion)) {
      return {};
    }

    return cargar.call(this, peticion, ...resto);
  };
}

const { getENSComplianceResults } = require('../common/ens/core/ens-engine') as typeof import('../common/ens/core/ens-engine');
const { setServices } = require('../public/services') as typeof import('../public/services');
const { updateActiveGlobalConfiguration } = require('../common/ens/configuration/services/configuration-state-service') as typeof import('../common/ens/configuration/services/configuration-state-service');

const fallos: string[] = [];

const comprueba = (nombre: string, condicion: boolean, detalle: unknown = ''): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle !== '' ? ` — ${String(detalle)}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

const AHORA = new Date('2026-10-09T12:00:00Z');

const configuracion = (
  global: Record<string, unknown>
): ENSConfigurationVersion => ({
  ...defaultENSConfigurationTemplate,
  global: {
    ...defaultENSConfigurationTemplate.global,
    clientName: 'Cliente de prueba',
    organization: 'Organización de prueba',
    scope: 'Laboratorio',
    ...global,
  } as ENSConfigurationVersion['global'],
});

const evalua = (global: Record<string, unknown>, nivel: ENSLevel) => {
  ensConfigurationRepository.replaceActive(configuracion(global));

  return getENSComplianceResults(nivel, [], undefined, undefined, AHORA);
};

// El resultado entero, sin el instante de cálculo (`evaluatedAt`).
const huella = (valor: unknown): string =>
  JSON.stringify(valor, (clave, v) => (clave === 'evaluatedAt' ? undefined : v));

const porControl = (resultados: ReturnType<typeof evalua>) =>
  new Map(resultados.map(r => [r.control.id, r]));

// ---------------------------------------------------------------------------

bloque('1. La resolución del nivel por control');

comprueba(
  'sin nivel D, un control de D usa el global',
  resolveControlLevel({ levelDimension: 'D' }, 'ALTO', { ensLevel: 'ALTO' }) === 'ALTO'
);
comprueba(
  'con nivel D, un control de D usa D',
  resolveControlLevel({ levelDimension: 'D' }, 'ALTO', { ensLevel: 'ALTO', availabilityLevel: 'MEDIO' }) === 'MEDIO'
);
comprueba(
  'un control sin dimensión ignora D',
  resolveControlLevel({}, 'MEDIO', { ensLevel: 'MEDIO', availabilityLevel: 'ALTO' }) === 'MEDIO'
);
comprueba(
  'un control de T ignora D',
  resolveControlLevel({ levelDimension: 'T' }, 'MEDIO', { ensLevel: 'MEDIO', availabilityLevel: 'ALTO' }) === 'MEDIO'
);
comprueba(
  'y un control de D ignora T',
  resolveControlLevel({ levelDimension: 'D' }, 'MEDIO', { ensLevel: 'MEDIO', traceabilityLevel: 'ALTO' }) === 'MEDIO'
);

const declaranD = ENSCatalog.filter(c => c.levelDimension === 'D');

comprueba(
  'solo op.cont.2 y op.cont.3 pueden declarar que se rigen por la Disponibilidad',
  declaranD.every(c => ['op.cont.2', 'op.cont.3'].includes(c.id)),
  declaranD.map(c => c.id).join(', ')
);

bloque('2. El motor: sin D nada cambia; con D solo cambian los controles de D');

const SUPLENTE = 'op.acc.3';
const suplente = ENSCatalog.find(c => c.id === SUPLENTE) as ENSControlDefinition;
const dimensionOriginal = suplente.levelDimension;

comprueba(
  `el suplente ${SUPLENTE} rige solo en MEDIO y ALTO, como un control de D rige solo en ALTO`,
  suplente.levels.join(',') === 'MEDIO,ALTO',
  suplente.levels.join(',')
);

try {
  suplente.levelDimension = 'D';

  const deD = new Set([SUPLENTE, ...declaranD.map(c => c.id)]);

  for (const global of ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]) {
    const base = evalua({ ensLevel: global }, global);
    const igual = evalua({ ensLevel: global, availabilityLevel: global }, global);

    comprueba(
      `${global} · D igual al global da el mismo resultado en todos los controles`,
      huella(base) === huella(igual)
    );

    for (const d of (['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]).filter(l => l !== global)) {
      const antes = porControl(base);
      const despues = porControl(evalua({ ensLevel: global, availabilityLevel: d }, global));

      comprueba(
        `${global} con D=${d} · el control de D se evalúa con ${d}`,
        Array.from(deD).every(id => despues.get(id)?.level === d),
        Array.from(deD).map(id => `${id}=${despues.get(id)?.level}`).join(' ')
      );

      const cambiados = Array.from(antes.keys()).filter(
        id => !deD.has(id) && huella(antes.get(id)) !== huella(despues.get(id))
      );

      comprueba(
        `${global} con D=${d} · ningún otro control cambia (op.exp.8 incluido)`,
        cambiados.length === 0,
        cambiados.join(', ')
      );
    }
  }

  // Lo que el cambio de nivel mueve de verdad: lo exigible. Es el caso que
  // obliga a tener la dimensión: categoría ALTA con D por debajo de ALTO.
  const estado = (global: Record<string, unknown>, nivel: ENSLevel) =>
    porControl(evalua(global, nivel)).get(SUPLENTE)?.status;

  comprueba(
    'categoría ALTA con D BAJA · el control de D NO_APLICA',
    estado({ ensLevel: 'ALTO', availabilityLevel: 'BAJO' }, 'ALTO') === 'NO_APLICA',
    estado({ ensLevel: 'ALTO', availabilityLevel: 'BAJO' }, 'ALTO')
  );
  comprueba(
    'la reversión · categoría ALTA sin D se exige (el comportamiento de antes)',
    estado({ ensLevel: 'ALTO' }, 'ALTO') !== 'NO_APLICA',
    estado({ ensLevel: 'ALTO' }, 'ALTO')
  );
  comprueba(
    'categoría BÁSICA con D ALTA · el control de D se exige',
    estado({ ensLevel: 'BAJO', availabilityLevel: 'ALTO' }, 'BAJO') !== 'NO_APLICA',
    estado({ ensLevel: 'BAJO', availabilityLevel: 'ALTO' }, 'BAJO')
  );
  comprueba(
    'y declarar T no lo mueve: categoría ALTA con T BAJA sigue exigiéndose',
    estado({ ensLevel: 'ALTO', traceabilityLevel: 'BAJO' }, 'ALTO') !== 'NO_APLICA',
    estado({ ensLevel: 'ALTO', traceabilityLevel: 'BAJO' }, 'ALTO')
  );
} finally {
  if (dimensionOriginal === undefined) {
    delete suplente.levelDimension;
  } else {
    suplente.levelDimension = dimensionOriginal;
  }
}

comprueba(
  'el suplente queda como estaba',
  suplente.levelDimension === dimensionOriginal,
  String(suplente.levelDimension)
);

bloque('3. El validador de la configuración global');

const valida = (global: Record<string, unknown>) =>
  validateENSConfigurationStructure(configuracion(global));

const sinD = configuracion({});
delete (sinD.global as { availabilityLevel?: unknown }).availabilityLevel;

comprueba('la clave ausente es válida', validateENSConfigurationStructure(sinD).valid, validateENSConfigurationStructure(sinD).errors.join('; '));
comprueba('un nivel es válido', valida({ availabilityLevel: 'ALTO' }).valid);
comprueba('con T y D a la vez, válido', valida({ traceabilityLevel: 'MEDIO', availabilityLevel: 'ALTO' }).valid);
comprueba('null NO es válido', !valida({ availabilityLevel: null }).valid);
comprueba('una cadena vacía NO es válida', !valida({ availabilityLevel: '' }).valid);
comprueba(
  'un valor fuera de BAJO/MEDIO/ALTO NO es válido, y el error lo nombra',
  valida({ availabilityLevel: 'ALTA' }).errors.includes('configuration.global.availabilityLevel is invalid.'),
  valida({ availabilityLevel: 'ALTA' }).errors.join('; ')
);

// ---------------------------------------------------------------------------

(async () => {
  bloque('4. Guardar la configuración global sin D quita la clave');

  // El servidor de mentira devuelve lo que recibe, como el de verdad.
  const enviados: any[] = [];

  setServices(
    {
      http: {
        put: async (_ruta: string, opciones: { body: string }) => {
          const cuerpo = JSON.parse(opciones.body);

          enviados.push(cuerpo.configuration);

          return { statusCode: 200, error: 0, data: { configuration: cuerpo.configuration, metadata: null } };
        },
      },
    } as any,
    {} as any
  );

  ensConfigurationRepository.replaceActive(
    configuracion({ ensLevel: 'ALTO', traceabilityLevel: 'MEDIO', availabilityLevel: 'MEDIO' })
  );

  // Lo que manda el panel cuando se elige «El mismo que el nivel ENS»: la
  // clave ausente.
  const delPanel = { ...configuracion({ ensLevel: 'ALTO', traceabilityLevel: 'MEDIO' }).global };
  delete (delPanel as { availabilityLevel?: unknown }).availabilityLevel;

  await updateActiveGlobalConfiguration(delPanel);

  comprueba(
    'la configuración enviada NO lleva availabilityLevel (no se resucita de la activa)',
    enviados.length === 1 && !('availabilityLevel' in enviados[0].global),
    JSON.stringify(enviados[0]?.global)
  );
  comprueba(
    'y conserva el nivel de Trazabilidad declarado',
    enviados[0]?.global?.traceabilityLevel === 'MEDIO',
    enviados[0]?.global?.traceabilityLevel
  );

  // La reversión: declarado, viaja.
  await updateActiveGlobalConfiguration({ ...delPanel, availabilityLevel: 'BAJO' });

  comprueba(
    'la reversión · declarado, se guarda',
    enviados[1]?.global?.availabilityLevel === 'BAJO',
    JSON.stringify(enviados[1]?.global)
  );

  ensConfigurationRepository.reset();

  if (fallos.length) {
    console.log(`\n${fallos.length} comprobación(es) fallan:`);
    fallos.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\nTodo correcto.');
})().catch(error => {
  console.log(`  FALLA excepción: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
