/** Shared utilities of the imperative policies (`policy-kit.ts`). */
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

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail !== '' ? ` — ${String(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

section('1. Measurements: empty does not comply, the worst prevails, the common cause');

check('worstStatus([]) is NO_EVALUABLE, never CUMPLE by emptiness', worstStatus([]) === 'NO_EVALUABLE', worstStatus([]));
check('combineMeasurements([]) is NO_EVALUABLE with a motive', combineMeasurements([]).estado === 'NO_EVALUABLE' && Boolean(combineMeasurements([]).motivo), combineMeasurements([]).estado);
check('all NO_APLICA → NO_APLICA', worstStatus([notApplicable('a'), notApplicable('b')]) === 'NO_APLICA');
check('NO_APLICA does not cover a CUMPLE', worstStatus([notApplicable('a'), compliant('b')]) === 'CUMPLE');

const mix = combineMeasurements([compliant('bien.'), notMeasured('falta un dato.', 'COLLECTION'), nonCompliant('mal.')]);
check('NO_CUMPLE prevails over NO_EVALUABLE, and the gap is stated with «Además»', mix.estado === 'NO_CUMPLE' && mix.motivo === 'mal. Además: falta un dato.', mix.motivo);

const gaps = combineMeasurements([notMeasured('a', 'COLLECTION'), notMeasured('b', 'CONFIGURATION')]);
check('two gaps: CONFIGURATION if any says so', gaps.estado === 'NO_EVALUABLE' && gaps.causa === 'CONFIGURATION', gaps.causa);
check('COLLECTION only if all say so', commonGapCause([notMeasured('a', 'COLLECTION'), notMeasured('b', 'COLLECTION')]) === 'COLLECTION');
check('no gaps, no cause', commonGapCause([compliant('a')]) === undefined);

section('2. Fact reader: freshness and degradations');

const NOW = Date.parse('2026-10-09T12:30:00Z');

const fact = (id: string, type: string, ts: string, attributes: Record<string, string> = {}): ENSNormalizedEvent =>
  ({ id, controlId: 'op.zzz.1', eventType: type, timestamp: ts, attributes: attributes } as unknown as ENSNormalizedEvent);

const context = (events: ENSNormalizedEvent[]): ENSPolicyContext =>
  ({ events } as unknown as ENSPolicyContext);

const lector = createFactReader('op.zzz.1', { recolector: 'el recolector de prueba' });
const estado = (ts: string) => fact(`h-${ts}`, 'algo_observado', ts);
const degraded = (ts: string) =>
  fact(`d-${ts}`, 'evidence_state', ts, { evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se pudo leer' });

check(
  'a state from 30 h ago does not describe today',
  lector.estadoVigente(context([estado('2026-10-08T06:30:00Z')]), 'algo_observado', NOW).vigentes.length === 0
);
check(
  'the last pass: only the previous hour\'s data relative to the last fact',
  lector.estadoVigente(context([estado('2026-10-09T06:00:00Z'), estado('2026-10-09T12:00:00Z'), estado('2026-10-09T12:00:30Z')]), 'algo_observado', NOW).vigentes.length === 2
);
check(
  'a fact from another control does not count',
  lector.hechos(context([{ ...estado('2026-10-09T12:00:00Z'), controlId: 'op.exp.8' } as ENSNormalizedEvent]), 'algo_observado').length === 0
);
check('a degradation from 2 days ago does not count', lector.degradacion(context([degraded('2026-10-07T12:00:00Z')]), 'EV-01', NOW) === undefined);
check('a degradation from the future does not count', lector.degradacion(context([degraded('2026-10-09T18:00:00Z')]), 'EV-01', NOW) === undefined);
check('REVERSAL: one from today does, with the collector\'s cause', lector.degradacion(context([degraded('2026-10-09T12:00:00Z')]), 'EV-01', NOW)?.causa === 'COLLECTION');

const after = context([estado('2026-10-09T12:00:00Z'), degraded('2026-10-09T12:05:00Z')]);
check(
  'a degradation after the last fact does not cover a measurement against',
  lector.conDegradacion(after, NOW, 'EV-01', 'algo_observado', nonCompliant('mal.')).estado === 'NO_CUMPLE'
);
check(
  'and leaves unproven what complied',
  lector.conDegradacion(after, NOW, 'EV-01', 'algo_observado', compliant('bien.')).estado === 'NO_EVALUABLE'
);
check(
  'without facts, the motive names the collector',
  /el recolector de prueba no está desplegado o no informa/.test(lector.sinHechos(context([]), 'EV-01', NOW, undefined, 'estado').motivo)
);

section('3. Parameters and decisions');

const withValue = (value: unknown): ENSPolicyContext =>
  ({ configuration: { parameters: [{ id: 'P-01', value }] } } as unknown as ENSPolicyContext);

check('a zero deadline is not a deadline', positiveScalar(withValue('0'), 'P-01') === undefined);
check('a negative deadline neither', positiveScalar(withValue('-3'), 'P-01') === undefined);
check('«26» es 26', positiveScalar(withValue('26'), 'P-01') === 26);

const decide = decisionBuilderFor('policy.op.zzz.1');
check('`attested` travels with CUMPLE', decide('op.zzz.1.1', 'CUMPLE', [], [], 'COVERAGE_REQUIRED', 'r', 'm', 'e', undefined, true).attested === true);
check('y no con NO_EVALUABLE', decide('op.zzz.1.1', 'NO_EVALUABLE', [], [], 'COVERAGE_REQUIRED', 'r', 'm', 'e', 'CONFIGURATION', true).attested === undefined);
check('the cause only with NO_EVALUABLE', decide('op.zzz.1.1', 'NO_CUMPLE', [], [], 'COVERAGE_REQUIRED', 'r', 'm', 'e', 'CONFIGURATION').cause === undefined);

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
