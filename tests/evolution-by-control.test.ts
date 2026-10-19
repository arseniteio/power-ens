/** The daily line of ONE control, the one in the detail view. */
import {
  mapCutsToControlPoints,
} from '../common/ens/core/timeline/control-timeline-points';
import { buildENSTimelineCuts } from '../common/ens/core/timeline/timeline-cuts';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (
  name: string,
  condition: boolean,
  detail?: unknown
): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  console.log(`  FAIL ${name}${detail !== undefined ? ` — ${String(detail)}` : ''}`);
  failures.push(name);
};

const section = (title: string): void => console.log(`\n${title}`);

let counter = 0;

const NOW = new Date(2026, 7, 7, 12, 0, 0);

const daysBefore = (days: number): Date => {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  when.setHours(9, 0, 0, 0);

  return when;
};

const event = (when: Date): ENSNormalizedEvent => ({
  id: `evt-${(counter += 1)}`,
  controlId: 'op.acc.1',
  eventType: 'account_active',
  sourceType: 'WAZUH_ALERT',
  timestamp: when.toISOString(),
  agentId: '024',
});

const cortes = (events: ENSNormalizedEvent[], days = 10) =>
  buildENSTimelineCuts(events, { now: NOW, days: days });

section('1. Each point is evaluated at the instant of its day, not today\'s');

{
  const events = [daysBefore(5), daysBefore(3), daysBefore(0)].map(event);

  const instantes: string[] = [];

  const series = mapCutsToControlPoints(
    cortes(events),
    (ofCut, cutoff) => {
      instantes.push(cutoff.toISOString());

      return { score: ofCut.length * 10, status: 'PARCIAL' };
    }
  );

  check(
    'the evaluator receives a different instant per point',
    new Set(instantes).size === instantes.length,
    instantes.join(' ')
  );

  check(
    'instants are in increasing order',
    instantes.every((value, i) => i === 0 || value >= instantes[i - 1]),
    instantes.join(' ')
  );

  check(
    'and the last is NOW, not the end of a day',
    instantes[instantes.length - 1] === NOW.toISOString(),
    instantes[instantes.length - 1]
  );

  check(
    'the last point is marked as the present',
    series[series.length - 1].isCurrent,
    JSON.stringify(series[series.length - 1])
  );

  check(
    'each point knows at least as many events as the previous one',
    series.every((punto, i) => i === 0 || punto.events >= series[i - 1].events),
    JSON.stringify(series.map(p => p.events))
  );
}

section('2. A day on which the control did not apply comes out WITHOUT a number');

{
  const events = [daysBefore(3), daysBefore(0)].map(event);

  const series = mapCutsToControlPoints(
    cortes(events),
    () => ({ score: undefined, status: 'NO_APLICA' })
  );

  check(
    'the point carries no number',
    series.every(punto => punto.score === undefined),
    JSON.stringify(series.map(p => p.score))
  );

  check(
    'and it is NOT turned into zero',
    series.every(punto => punto.score !== 0),
    JSON.stringify(series.map(p => p.score))
  );

  check(
    'y el estado lo dice',
    series.every(punto => punto.status === 'NO_APLICA'),
    JSON.stringify(series.map(p => p.status))
  );

  const withZero = mapCutsToControlPoints(
    cortes(events),
    () => ({ score: 0, status: 'NO_CUMPLE' })
  );

  check(
    'a truly measured 0 is kept',
    withZero.every(punto => punto.score === 0),
    JSON.stringify(withZero.map(p => p.score))
  );

  check(
    'and it is distinguished from NO_APLICA by the state',
    withZero.every(punto => punto.status === 'NO_CUMPLE'),
    JSON.stringify(withZero.map(p => p.status))
  );
}

section('3. If the engine returns nothing, the point is not invented');

{
  const series = mapCutsToControlPoints(
    cortes([daysBefore(2), daysBefore(0)].map(event)),
    () => undefined
  );

  check(
    'without a result, the state is NO_EVALUABLE',
    series.every(punto => punto.status === 'NO_EVALUABLE'),
    JSON.stringify(series.map(p => p.status))
  );

  check(
    'and without a number',
    series.every(punto => punto.score === undefined),
    JSON.stringify(series.map(p => p.score))
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
