/**
 * Las utilidades compartidas de las policies imperativas (`policy-kit.ts`).
 *
 *     npx tsx tests/policy-kit.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba: lo que una policy nueva da por hecho al importarlo. Una lista
 * vacía de medidas no cumple; la peor medida manda y lo demás se dice; la causa
 * común sigue el orden del motor; una degradación caducada o del futuro no
 * cuenta y nunca tapa una medida en contra; un plazo a cero no es un plazo; y
 * la marca `attested` solo viaja con CUMPLE.
 *
 * Se importa por la ruta del fichero, como lo hacen las policies.
 */
import {
  commonGapCause,
  combineMeasurements,
  compliant,
  decisionBuilderFor,
  positiveScalar,
  createFactReader,
  notApplicable,
  nonCompliant,
  worstStatus,
  notMeasured,
} from '../common/ens/core/policy-runtime/policies/policy-kit';
import type { ENSPolicyContext } from '../common/ens/core/policy-runtime/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

declare const process: { exit(code: number): void };

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

// --- 1. la medida --------------------------------------------------------------

bloque('1. Medidas: vacío no cumple, la peor manda, la causa común');

comprueba('worstStatus([]) es NO_EVALUABLE, nunca CUMPLE por vacío', worstStatus([]) === 'NO_EVALUABLE', worstStatus([]));
comprueba('combineMeasurements([]) es NO_EVALUABLE con motivo', combineMeasurements([]).estado === 'NO_EVALUABLE' && Boolean(combineMeasurements([]).motivo), combineMeasurements([]).estado);
comprueba('todas NO_APLICA → NO_APLICA', worstStatus([notApplicable('a'), notApplicable('b')]) === 'NO_APLICA');
comprueba('NO_APLICA no tapa un CUMPLE', worstStatus([notApplicable('a'), compliant('b')]) === 'CUMPLE');

const mezcla = combineMeasurements([compliant('bien.'), notMeasured('falta un dato.', 'COLLECTION'), nonCompliant('mal.')]);
comprueba('NO_CUMPLE manda sobre NO_EVALUABLE, y el hueco se dice con «Además»', mezcla.estado === 'NO_CUMPLE' && mezcla.motivo === 'mal. Además: falta un dato.', mezcla.motivo);

const huecos = combineMeasurements([notMeasured('a', 'COLLECTION'), notMeasured('b', 'CONFIGURATION')]);
comprueba('dos huecos: CONFIGURATION si lo dice alguno', huecos.estado === 'NO_EVALUABLE' && huecos.causa === 'CONFIGURATION', huecos.causa);
comprueba('COLLECTION solo si lo dicen todos', commonGapCause([notMeasured('a', 'COLLECTION'), notMeasured('b', 'COLLECTION')]) === 'COLLECTION');
comprueba('sin huecos, sin causa', commonGapCause([compliant('a')]) === undefined);

// --- 2. los hechos ---------------------------------------------------------------

bloque('2. Lector de hechos: frescura y degradaciones');

const AHORA = Date.parse('2026-10-09T12:30:00Z');

const hecho = (id: string, tipo: string, ts: string, atributos: Record<string, string> = {}): ENSNormalizedEvent =>
  ({ id, controlId: 'op.zzz.1', eventType: tipo, timestamp: ts, attributes: atributos } as unknown as ENSNormalizedEvent);

const contexto = (events: ENSNormalizedEvent[]): ENSPolicyContext =>
  ({ events } as unknown as ENSPolicyContext);

const lector = createFactReader('op.zzz.1', { recolector: 'el recolector de prueba' });
const estado = (ts: string) => hecho(`h-${ts}`, 'algo_observado', ts);
const degradado = (ts: string) =>
  hecho(`d-${ts}`, 'evidence_state', ts, { evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se pudo leer' });

comprueba(
  'un estado de hace 30 h no describe hoy',
  lector.estadoVigente(contexto([estado('2026-10-08T06:30:00Z')]), 'algo_observado', AHORA).vigentes.length === 0
);
comprueba(
  'la última pasada: solo lo de la hora anterior al último hecho',
  lector.estadoVigente(contexto([estado('2026-10-09T06:00:00Z'), estado('2026-10-09T12:00:00Z'), estado('2026-10-09T12:00:30Z')]), 'algo_observado', AHORA).vigentes.length === 2
);
comprueba(
  'un hecho de otro control no cuenta',
  lector.hechos(contexto([{ ...estado('2026-10-09T12:00:00Z'), controlId: 'op.exp.8' } as ENSNormalizedEvent]), 'algo_observado').length === 0
);
comprueba('una degradación de hace 2 días no cuenta', lector.degradacion(contexto([degradado('2026-10-07T12:00:00Z')]), 'EV-01', AHORA) === undefined);
comprueba('una degradación del futuro no cuenta', lector.degradacion(contexto([degradado('2026-10-09T18:00:00Z')]), 'EV-01', AHORA) === undefined);
comprueba('REVERSIÓN: una de hoy sí, con la causa del recolector', lector.degradacion(contexto([degradado('2026-10-09T12:00:00Z')]), 'EV-01', AHORA)?.causa === 'COLLECTION');

const despues = contexto([estado('2026-10-09T12:00:00Z'), degradado('2026-10-09T12:05:00Z')]);
comprueba(
  'una degradación posterior al último hecho no tapa una medida en contra',
  lector.conDegradacion(despues, AHORA, 'EV-01', 'algo_observado', nonCompliant('mal.')).estado === 'NO_CUMPLE'
);
comprueba(
  'y deja sin demostrar lo que cumplía',
  lector.conDegradacion(despues, AHORA, 'EV-01', 'algo_observado', compliant('bien.')).estado === 'NO_EVALUABLE'
);
comprueba(
  'sin hechos, el motivo nombra al recolector',
  /el recolector de prueba no está desplegado o no informa/.test(lector.sinHechos(contexto([]), 'EV-01', AHORA, undefined, 'estado').motivo)
);

// --- 3. parámetros y decisiones ----------------------------------------------------

bloque('3. Parámetros y decisiones');

const conValor = (value: unknown): ENSPolicyContext =>
  ({ configuration: { parameters: [{ id: 'P-01', value }] } } as unknown as ENSPolicyContext);

comprueba('un plazo a cero no es un plazo', positiveScalar(conValor('0'), 'P-01') === undefined);
comprueba('un plazo negativo tampoco', positiveScalar(conValor('-3'), 'P-01') === undefined);
comprueba('«26» es 26', positiveScalar(conValor('26'), 'P-01') === 26);

const decide = decisionBuilderFor('policy.op.zzz.1');
comprueba('`attested` viaja con CUMPLE', decide('op.zzz.1.1', 'CUMPLE', [], [], 'COVERAGE_REQUIRED', 'r', 'm', 'e', undefined, true).attested === true);
comprueba('y no con NO_EVALUABLE', decide('op.zzz.1.1', 'NO_EVALUABLE', [], [], 'COVERAGE_REQUIRED', 'r', 'm', 'e', 'CONFIGURATION', true).attested === undefined);
comprueba('la causa solo con NO_EVALUABLE', decide('op.zzz.1.1', 'NO_CUMPLE', [], [], 'COVERAGE_REQUIRED', 'r', 'm', 'e', 'CONFIGURATION').cause === undefined);

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
