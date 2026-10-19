/**
 * El nivel de la dimensión de Trazabilidad (op.exp.8).
 *
 *     npx tsx tests/traceability-level.test.ts
 *
 * El Anexo II aplica op.exp.8 por el NIVEL de la Trazabilidad, no por la
 * categoría del sistema. La configuración global admite un `traceabilityLevel`
 * opcional y el catálogo de op.exp.8 declara `levelDimension: 'T'`.
 *
 * Qué se prueba:
 *   1. Sin nivel T, todo se evalúa exactamente igual que antes.
 *   2. Con T distinto del global, op.exp.8 se evalúa con T y NINGÚN otro control
 *      cambia (se compara el resultado entero, control a control).
 *   3. El validador acepta la clave ausente y un nivel; rechaza `null` y basura.
 *
 * Se prueba el MOTOR de verdad (`getENSComplianceResults`), no una réplica. El
 * motor arrastra `kibana-services`, que solo existe en el árbol del plugin
 * `main` de Wazuh; aquí se sustituye por un módulo vacío antes de cargarlo. La
 * evaluación no lo usa: solo lo importa el cliente HTTP de la configuración.
 */
import { ENSCatalog } from '../common/ens/catalog';
import { resolveControlLevel } from '../common/ens/core/control-level';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
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

const fallos: string[] = [];

const comprueba = (nombre: string, condicion: boolean, detalle: unknown = ''): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FAIL ${nombre}${detalle !== '' ? ` — ${String(detalle)}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

const AHORA = new Date('2026-09-26T12:00:00Z');

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

const evalua = (global: Record<string, unknown>, nivel: ENSLevel, eventos: ENSNormalizedEvent[] = []) => {
  ensConfigurationRepository.replaceActive(configuracion(global));

  return getENSComplianceResults(nivel, eventos, undefined, undefined, AHORA);
};

// El resultado entero, sin el instante de cálculo (`evaluatedAt`), que es lo
// único que cambia entre dos evaluaciones idénticas.
const huella = (valor: unknown): string =>
  JSON.stringify(valor, (clave, v) => (clave === 'evaluatedAt' ? undefined : v));

const porControl = (resultados: ReturnType<typeof evalua>) =>
  new Map(resultados.map(r => [r.control.id, r]));

const requisito = (
  resultados: ReturnType<typeof evalua>,
  control: string,
  id: string
) =>
  porControl(resultados)
    .get(control)
    ?.requirements.find(r => r.id === id);

// ---------------------------------------------------------------------------

bloque('1. La resolución del nivel por control');

const opExp8 = ENSCatalog.find(c => c.id === 'op.exp.8');
const otros = ENSCatalog.filter(c => c.id !== 'op.exp.8');

comprueba('op.exp.8 declara que se rige por la Trazabilidad', opExp8?.levelDimension === 'T');
// Solo la Trazabilidad: op.cont.2 y op.cont.3 se rigen por la Disponibilidad
// (`availability-level.test.ts`), y eso no es asunto de esta prueba.
comprueba(
  'ningún otro control se rige por la Trazabilidad',
  otros.every(c => c.levelDimension !== 'T'),
  otros.filter(c => c.levelDimension === 'T').map(c => c.id).join(', ')
);
comprueba(
  'sin nivel T, op.exp.8 usa el global',
  resolveControlLevel({ levelDimension: 'T' }, 'ALTO', { ensLevel: 'ALTO' }) === 'ALTO'
);
comprueba(
  'con nivel T, op.exp.8 usa T',
  resolveControlLevel({ levelDimension: 'T' }, 'ALTO', { ensLevel: 'ALTO', traceabilityLevel: 'BAJO' }) === 'BAJO'
);
comprueba(
  'un control sin dimensión ignora T',
  resolveControlLevel({}, 'MEDIO', { ensLevel: 'MEDIO', traceabilityLevel: 'ALTO' }) === 'MEDIO'
);

bloque('2. El motor: sin T nada cambia; con T solo cambia op.exp.8');

for (const global of ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]) {
  const base = evalua({ ensLevel: global }, global);

  // Declarar T igual al global no puede cambiar nada.
  const igual = evalua({ ensLevel: global, traceabilityLevel: global }, global);

  comprueba(
    `${global} · T igual al global da el mismo resultado en todos los controles`,
    huella(base) === huella(igual)
  );

  for (const t of (['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]).filter(l => l !== global)) {
    const conT = evalua({ ensLevel: global, traceabilityLevel: t }, global);
    const antes = porControl(base);
    const despues = porControl(conT);

    comprueba(
      `${global} con T=${t} · op.exp.8 se evalúa con ${t}`,
      despues.get('op.exp.8')?.level === t,
      despues.get('op.exp.8')?.level
    );

    const cambiados = Array.from(antes.keys()).filter(
      id => id !== 'op.exp.8' && huella(antes.get(id)) !== huella(despues.get(id))
    );

    comprueba(
      `${global} con T=${t} · ningún otro control cambia`,
      cambiados.length === 0,
      cambiados.join(', ')
    );
  }
}

// Lo que el cambio de nivel mueve de verdad: lo exigible. Con global ALTO y T
// BAJO, las evidencias de R5 no aplican; con global BAJO y T ALTO, sí. Se mira
// la evidencia y, si el control está activo, también el requisito.
const evidencia = (
  resultados: ReturnType<typeof evalua>,
  id: string
) =>
  porControl(resultados)
    .get('op.exp.8')
    ?.evidences.find(e => e.id === id)?.status;

// El latido del recolector del MANAGER: sin él, la policy de op.exp.8 trata la
// fila como la de un servidor corriente y R5 (que es del plano central) no
// aplicaría en ningún nivel.
const LATIDO_MANAGER: ENSNormalizedEvent[] = [
  {
    id: 'latido-000',
    agentId: '000',
    agentName: 'Wazuh-4',
    controlId: 'op.exp.8',
    eventType: 'collector_run',
    sourceType: 'WAZUH_ALERT',
    timestamp: '2026-09-26T11:47:00Z',
    attributes: { resultado: 'completada', tipo_servidor: 'manager', evidencias_cubiertas: '' },
  },
];

const altoConTBajo = evalua({ ensLevel: 'ALTO', traceabilityLevel: 'BAJO' }, 'ALTO', LATIDO_MANAGER);
const bajoConTAlto = evalua({ ensLevel: 'BAJO', traceabilityLevel: 'ALTO' }, 'BAJO', LATIDO_MANAGER);
const bajoSinT = evalua({ ensLevel: 'BAJO' }, 'BAJO', LATIDO_MANAGER);

comprueba(
  'categoría ALTA con T BAJA · EV-11 (R5) NO_APLICA',
  evidencia(altoConTBajo, 'EV-11') === 'NO_APLICA',
  evidencia(altoConTBajo, 'EV-11')
);
comprueba(
  'categoría BÁSICA con T ALTA · EV-11 (R5) se exige',
  evidencia(bajoConTAlto, 'EV-11') !== 'NO_APLICA',
  evidencia(bajoConTAlto, 'EV-11')
);
comprueba(
  'y sin T, en BÁSICA, no se exige (el comportamiento de antes)',
  evidencia(bajoSinT, 'EV-11') === 'NO_APLICA',
  evidencia(bajoSinT, 'EV-11')
);

if (opExp8?.status === 'ACTIVE') {
  comprueba(
    'ACTIVE · categoría BÁSICA con T ALTA · op.exp.8.r5.2 se exige',
    requisito(bajoConTAlto, 'op.exp.8', 'op.exp.8.r5.2')?.status !== 'NO_APLICA'
  );
  comprueba(
    'ACTIVE · categoría ALTA con T BAJA · op.exp.8.r5.2 NO_APLICA',
    requisito(altoConTBajo, 'op.exp.8', 'op.exp.8.r5.2')?.status === 'NO_APLICA'
  );
}

bloque('3. El validador de la configuración global');

const valida = (global: Record<string, unknown>) =>
  validateENSConfigurationStructure(configuracion(global));

const sinT = configuracion({});
delete (sinT.global as { traceabilityLevel?: unknown }).traceabilityLevel;

comprueba('la clave ausente es válida', validateENSConfigurationStructure(sinT).valid, validateENSConfigurationStructure(sinT).errors.join('; '));
comprueba('un nivel es válido', valida({ traceabilityLevel: 'ALTO' }).valid);
comprueba('null NO es válido', !valida({ traceabilityLevel: null }).valid);
comprueba('una cadena vacía NO es válida', !valida({ traceabilityLevel: '' }).valid);
comprueba('un valor fuera de BAJO/MEDIO/ALTO NO es válido', !valida({ traceabilityLevel: 'MEDIA' }).valid);

// ---------------------------------------------------------------------------

ensConfigurationRepository.reset();

if (fallos.length) {
  console.log(`\n${fallos.length} check(s) FAIL:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('\nALL OK');
