/** Daily series of the evolution chart. */
import { opAcc1CatalogDefinition } from '../common/ens/catalog/op-acc-1';
import { mpInfo6CatalogDefinition } from '../common/ens/catalog/mp-info-6';
import { mpInfo6Configuration } from '../common/ens/configuration/data/mp-info-6-parameters';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../common/ens/core/policy-runtime/policy-runtime';
import {
  buildENSTimelineCuts,
  startOfDay,
} from '../common/ens/core/timeline/timeline-cuts';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (
  name: string,
  condition: boolean,
  detail: string = ''
): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const onDay = (
  day: number,
  hora: number = 9
): string =>
  new Date(2026, 7, day, hora, 0, 0).toISOString();

let counter = 0;

const event = (
  timestamp: string,
  extra: Partial<ENSNormalizedEvent> = {}
): ENSNormalizedEvent => ({
  id: `evt-${(counter += 1)}`,
  controlId: 'op.acc.1',
  eventType: 'account_active',
  sourceType: 'WAZUH_ALERT',
  timestamp,
  ...extra,
});

const NOW = new Date(2026, 7, 5, 12, 0, 0);

section('1. One point per day, and the last is the present');

{
  const cortes = buildENSTimelineCuts(
    [
      event(onDay(3)),
      event(onDay(4)),
      event(onDay(5)),
    ],
    { now: NOW, days: 7 }
  );

  check(
    'three days with events produce three points',
    cortes.length === 3,
    `${cortes.length}`
  );

  check(
    'labels are dd/mm, not the week',
    cortes.map(cut => cut.label).join(' ') ===
      '03/08 04/08 05/08',
    cortes.map(cut => cut.label).join(' ')
  );

  check(
    'only the last point is the present',
    cortes.filter(cut => cut.isCurrent).length === 1 &&
      cortes[2].isCurrent,
    cortes.map(cut => String(cut.isCurrent)).join(',')
  );

  check(
    'the present point is evaluated NOW, not at the end of the day',
    cortes[2].cutoff.getTime() === NOW.getTime(),
    cortes[2].cutoff.toISOString()
  );

  check(
    'and past points, at the end of THEIR day',
    cortes[0].cutoff.getHours() === 23 &&
      cortes[0].cutoff.getMinutes() === 59 &&
      cortes[0].cutoff.getDate() === 3,
    cortes[0].cutoff.toISOString()
  );
}

section('2. The events of a point are CUMULATIVE, not those of the single day');

{
  const cortes = buildENSTimelineCuts(
    [
      event(onDay(3)),
      event(onDay(4)),
      event(onDay(5)),
    ],
    { now: NOW, days: 7 }
  );

  check(
    'the first day knows 1 event, the second 2 and the third 3',
    cortes.map(cut => cut.events.length).join(',') === '1,2,3',
    cortes.map(cut => cut.events.length).join(',')
  );

  check(
    'which rules out the «only those of the day» reading: it is not 1,1,1',
    cortes.map(cut => cut.events.length).join(',') !== '1,1,1'
  );

  check(
    'and day 3\'s evidence is still there at day 5\'s point',
    cortes[2].events.some(
      item => item.timestamp === onDay(3)
    )
  );
}

section('3. A day without own events DOES have a point, if there was one before');

{
  const cortes = buildENSTimelineCuts(
    [event(onDay(3)), event(onDay(5))],
    { now: NOW, days: 7 }
  );

  check(
    'the silent day is not skipped: three points, not two',
    cortes.length === 3,
    `${cortes.length}`
  );

  check(
    'and it carries the last known: 1 event',
    cortes[1].events.length === 1,
    `${cortes[1].events.length}`
  );
}

section('4. Before the first event there is NO point');

{
  const cortes = buildENSTimelineCuts(
    [event(onDay(4)), event(onDay(5))],
    { now: NOW, days: 7 }
  );

  check(
    'a 7-day window with evidence from 2 produces 2 points, not 7',
    cortes.length === 2,
    `${cortes.length}`
  );

  check(
    'the series starts on the day of the first event',
    cortes[0].label === '04/08',
    cortes[0].label
  );

  const long2 = buildENSTimelineCuts(
    [
      event(onDay(1)),
      event(onDay(2)),
      event(onDay(3)),
      event(onDay(4)),
      event(onDay(5)),
    ],
    { now: NOW, days: 7 }
  );

  check(
    'and with evidence from day 1, the series reaches day 1',
    long2.length === 5 && long2[0].label === '01/08',
    `${long2.length} puntos, empieza ${long2[0].label}`
  );

  const trimmed = buildENSTimelineCuts(
    [
      event(onDay(1)),
      event(onDay(2)),
      event(onDay(3)),
      event(onDay(4)),
      event(onDay(5)),
    ],
    { now: NOW, days: 3 }
  );

  check(
    'with days=3 the series is trimmed to the last 3 days',
    trimmed.length === 3 && trimmed[0].label === '03/08',
    `${trimmed.length} puntos, empieza ${trimmed[0].label}`
  );
}

section('5. No events, no series, and a skewed clock does not lengthen it');

{
  check(
    'with no event, the series is empty (the card falls back to the current value)',
    buildENSTimelineCuts([], { now: NOW }).length === 0
  );

  const withFuture = buildENSTimelineCuts(
    [event(onDay(5)), event(onDay(9))],
    { now: NOW, days: 7 }
  );

  check(
    'an event with a future date adds no points ahead of today',
    withFuture.length === 1 &&
      startOfDay(withFuture[0].day).getDate() === 5,
    `${withFuture.length} puntos`
  );

  check(
    'and even so the present point sees the same events as the panel',
    withFuture[0].events.length === 2,
    `${withFuture[0].events.length}`
  );

  check(
    'with ONLY future events there is no series',
    buildENSTimelineCuts([event(onDay(9))], { now: NOW }).length === 0
  );
}

section('6. Each point measures age against ITS day, not against today');

{
  const copy = onDay(3);
  const pass = (timestamp: string): ENSNormalizedEvent =>
    event(timestamp, {
      controlId: 'mp.info.6',
      eventType: 'backup_run',
      evidenceId: 'EV-02',
      attributes: {
        origen: 'pbs',
        objeto: 'fichero',
        ultima_correcta: copy,
        ultima_fallida: '-',
        resultado_ultima: 'ok',
      },
    });

  const facts = [
    pass(new Date(2026, 7, 3, 9, 5, 0).toISOString()),
    pass(new Date(2026, 7, 5, 11, 0, 0).toISOString()),
  ];

  const configuration = {
    ...mpInfo6Configuration,
    parameters: mpInfo6Configuration.parameters.map(parameter =>
      parameter.id === 'P-01'
        ? { ...parameter, value: '24' }
        : parameter.id === 'P-04'
        ? { ...parameter, value: 'srv-01' }
        : parameter
    ),
  };

  const measuredOn = (instant?: Date) => {
    const runtime = runPolicyRuntime(
      buildPolicyContext(
        mpInfo6CatalogDefinition,
        configuration,
        'BAJO',
        facts,
        [],
        instant
      )
    );

    const variable = runtime.runtimeVariables.find(
      item => item.name === 'medida_EV02'
    );

    return {
      estado: variable?.value,
      motivo: variable?.description || '',
    };
  };

  const endOfDay3 = new Date(2026, 7, 3, 23, 59, 59, 999);

  const onItsDay = measuredOn(endOfDay3);

  check(
    'evaluated on its own day, the copy is under 24 h old',
    onItsDay.estado === 'CUMPLE' && /hace 15\.0 h/.test(onItsDay.motivo),
    `${onItsDay.estado} ${onItsDay.motivo}`
  );

  const hoy = measuredOn(NOW);

  check(
    'and the same copy measured against today exceeds 24 h',
    hoy.estado === 'NO_CUMPLE' && /hace 51\.0 h/.test(hoy.motivo),
    `${hoy.estado} ${hoy.motivo}`
  );

  check(
    'which are different measurements: the instant really reaches the runtime',
    onItsDay.estado !== hoy.estado,
    `${onItsDay.estado} vs ${hoy.estado}`
  );

  const byDefault = measuredOn(undefined);

  check(
    'without an instant, it still measures against the real clock (the panel does not change)',
    byDefault.estado !== undefined && byDefault.estado !== 'CUMPLE',
    `${byDefault.estado} ${byDefault.motivo}`
  );
}

section('7. The series does not depend on the agent\'s score_snapshot');

{
  const cortes = buildENSTimelineCuts(
    [
      event(onDay(3), {
        eventType: 'score_snapshot',
        score: 100,
      }),
      event(onDay(4)),
      event(onDay(5)),
    ],
    { now: NOW, days: 7 }
  );

  check(
    'a score_snapshot is just one more event: it neither creates nor suppresses points',
    cortes.length === 3,
    `${cortes.length}`
  );

  const withoutSnapshots = buildENSTimelineCuts(
    [event(onDay(3)), event(onDay(4)), event(onDay(5))],
    { now: NOW, days: 7 }
  );

  check(
    'and without any score_snapshot the series exists all the same',
    withoutSnapshots.length === 3,
    `${withoutSnapshots.length}`
  );
}

section('8. The catalog the chart no longer queries');

{
  check(
    'the op.acc.1 catalog loads (positive control of the imports)',
    opAcc1CatalogDefinition.id === 'op.acc.1',
    opAcc1CatalogDefinition.id
  );
}

section('9. With high volume, fewer points — but never fewer events');

{
  const many: ENSNormalizedEvent[] = [];
  for (let day = 29; day >= 0; day -= 1) {
    const when = new Date(NOW);
    when.setDate(when.getDate() - day);
    when.setHours(9, 0, 0, 0);
    for (let i = 0; i < 1333; i += 1) {
      many.push(event(when.toISOString()));
    }
  }

  const series = buildENSTimelineCuts(many, { now: NOW, days: 30 });

  const evaluated = series.reduce(
    (total, cut) => total + cut.events.length,
    0
  );

  check(
    'the series stays within the evaluation budget',
    evaluated <= 500000,
    `${evaluated} eventos evaluados en total`
  );

  check(
    'and therefore has fewer than 30 points',
    series.length < 30 && series.length >= 2,
    `${series.length} puntos`
  );

  check(
    'the present point is still there, whatever the step',
    series.filter(cut => cut.isCurrent).length === 1,
    `${series.filter(cut => cut.isCurrent).length} puntos marcados como presente`
  );

  check(
    'and it is the LAST, with ALL events: it is the panel\'s number',
    series[series.length - 1].isCurrent &&
      series[series.length - 1].events.length === many.length,
    `${series[series.length - 1].events.length} de ${many.length}`
  );

  const few = [
    event(new Date(2026, 7, 1, 9).toISOString()),
    event(new Date(2026, 7, 3, 9).toISOString()),
  ];

  const shortSeries = buildENSTimelineCuts(few, { now: NOW, days: 30 });

  check(
    'with low volume the step is still DAILY',
    shortSeries.length >= 5,
    `${shortSeries.length} puntos`
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
