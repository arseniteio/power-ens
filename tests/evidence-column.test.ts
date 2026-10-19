/** The report's Evidence column states what supports each row. */
import {
  buildENSReportEvidencePdfCell,
  buildENSReportRows,
  ensReportStatusBadgeColor,
  ensReportStatusPdfColor,
  ENS_REPORT_EVIDENCE_FIELD,
  ENS_REPORT_NO_EVIDENCE,
} from '../public/ens/reports/report-rows';
import type { ENSReportRow } from '../public/ens/reports/report-rows';
import type { ENSReportModel } from '../public/ens/reports/registry';
import { buildENSReportModel } from '../public/ens/reports/registry';
import { buildOpAcc1ReportModel } from '../public/ens/reports/op-acc-1-report-model';

import { opAcc1CatalogDefinition } from '../common/ens/catalog/op-acc-1';
import { opAcc1Configuration } from '../common/ens/configuration/data/op-acc-1-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../common/ens/configuration/types';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import type {
  ENSComplianceResult,
  ENSComplianceStatus,
} from '../common/ens/core/evaluation/types';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';

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

const CONTROLS = ['mp.info.6', 'op.acc.1', 'op.acc.2'];

const VALID_STATES = [
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
];

const pdfText = (row: ENSReportRow): string =>
  buildENSReportEvidencePdfCell(row)
    .text.map(fragment => fragment.text)
    .join('');

const evidence = (
  controlId: string,
  evidenceId: string,
  status: ENSComplianceStatus
): ENSEvidenceResolved => {
  const definition = getEvidenceDefinitions(controlId).find(
    item => item.id === evidenceId
  );

  if (!definition) {
    throw new Error(`The catalog does not define ${evidenceId} for ${controlId}`);
  }

  return {
    id: definition.id,
    controlId: definition.controlId,
    title: definition.title,
    description: definition.description,
    requirements: definition.requirements,
    levels: definition.levels,
    category: definition.category,
    criticality: definition.criticality,
    sourceTypes: definition.sourceTypes,
    expectedEventTypes: definition.expectedEventTypes,
    relatedRules: definition.relatedRules,
    auditQuestion: definition.auditQuestion,
    status,
    observations: [],
  };
};

const validValue = (
  parameter: ENSControlParameter
): ENSControlParameter['value'] => {
  if (parameter.options && parameter.options.length) {
    return parameter.options[0];
  }

  switch (parameter.type) {
    case 'number':
    case 'duration_days':
    case 'duration_hours':
      return typeof parameter.minValue === 'number'
        ? Math.max(parameter.minValue, 1)
        : 7;
    case 'boolean':
      return true;
    case 'list':
      return parameter.columns && parameter.columns.length
        ? [parameter.example || '']
        : ['valor-uno', 'valor-dos'];
    case 'table':
      return [parameter.example || ''];
    case 'path':
      return '/var/lib/ensfacil';
    case 'url':
      return 'https://ensfacil.example.org/api';
    default:
      return 'valor';
  }
};

const OPACC1_CONFIGURATION: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parameter => ({
    ...parameter,
    value: validValue(parameter),
  })),
};

const OPACC1_EVIDENCES = getEvidenceDefinitions('op.acc.1').map(
  definition => definition.id
);

const evaluaOpAcc1 = (
  exceptions: Record<string, ENSComplianceStatus> = {},
  level: ENSLevel = 'MEDIO'
): ENSComplianceResult =>
  evaluateENSControl(
    opAcc1CatalogDefinition,
    OPACC1_CONFIGURATION,
    level,
    OPACC1_EVIDENCES.map(id =>
      evidence('op.acc.1', id, exceptions[id] || 'CUMPLE')
    ),
    undefined,
    []
  );

const rowOf = (rows: ENSReportRow[], campoId: string): ENSReportRow => {
  const row = rows.find(item => item.campo.startsWith(`${campoId} ·`));

  if (!row) {
    throw new Error(`broken fixture: the report has no field ${campoId}`);
  }

  return row;
};

section('1 · the row carries what the «Evidencia» column needs');

{
  for (const controlId of CONTROLS) {
    const model = buildENSReportModel(controlId, undefined);
    const rows = buildENSReportRows(model);

    check(
      `${controlId} · the report produces rows`,
      rows.length > 0,
      String(rows.length)
    );

    check(
      `${controlId} · no row is left without evidence`,
      rows.every(row => row.evidencia.length > 0),
      JSON.stringify(
        rows.filter(row => !row.evidencia).map(row => row.campo)
      )
    );

    check(
      `${controlId} · no row is left without a valid state`,
      rows.every(row => VALID_STATES.indexOf(row.estado) >= 0),
      JSON.stringify(rows.map(row => row.estado))
    );

    check(
      `${controlId} · the column reads a key the row does have`,
      rows.every(row => {
        const value = (row as unknown as Record<string, unknown>)[
          ENS_REPORT_EVIDENCE_FIELD
        ];

        return typeof value === 'string' && value.length > 0;
      }),
      ENS_REPORT_EVIDENCE_FIELD
    );

    check(
      `${controlId} · the PDF does not print «undefined» in the Evidencia column`,
      rows.every(row => pdfText(row).indexOf('undefined') === -1),
      JSON.stringify(rows.map(pdfText).filter(t => t.indexOf('undefined') >= 0))
    );

    check(
      `${controlId} · the PDF prints each row's state and evidence`,
      rows.every(
        row =>
          pdfText(row).indexOf(row.estado) >= 0 &&
          pdfText(row).indexOf(row.evidencia) >= 0
      ),
      JSON.stringify(rows.slice(0, 2).map(pdfText))
    );

    check(
      `${controlId} · the «Valor» column no longer repeats the state`,
      rows.every(row => !row.valor.startsWith(`${row.estado} · `)),
      JSON.stringify(
        rows
          .filter(row => row.valor.startsWith(`${row.estado} · `))
          .map(row => row.campo)
      )
    );
  }
}

section('2 · the evidence shown is the one the model declares');

{
  const model = buildOpAcc1ReportModel(evaluaOpAcc1());
  const rows = buildENSReportRows(model);

  for (const campo of model.fields) {
    const row = rowOf(rows, campo.id);

    check(
      `op.acc.1 · ${campo.id} cites its evidences (${campo.evidenceIds.join(
        ', '
      )})`,
      row.evidencia === campo.evidenceIds.join(', '),
      row.evidencia
    );
  }

  check(
    'op.acc.1 · two fields of the same report cite different evidences',
    rowOf(rows, 'op.acc.1.inventario').evidencia !==
      rowOf(rows, 'op.acc.1.genericas').evidencia,
    `${rowOf(rows, 'op.acc.1.inventario').evidencia} / ${
      rowOf(rows, 'op.acc.1.genericas').evidencia
    }`
  );
}

section('3 · what is not proven counts, and the report keeps distinguishing it');
{
  const withBreach = evaluaOpAcc1({ 'EV-05': 'NO_CUMPLE' });
  const withGap = evaluaOpAcc1({ 'EV-05': 'NO_EVALUABLE' });

  const cardOf = (
    result: ENSComplianceResult,
    requirementId: string,
  ) =>
    result.nonConformities.find(
      item => item.requirementId === requirementId,
    );

  check(
    'engine · EV-05 in NO_CUMPLE opens a MEASURED nonconformity',
    cardOf(withBreach, 'op.acc.1.2')?.origin === 'MEDIDA',
    String(cardOf(withBreach, 'op.acc.1.2')?.origin),
  );

  check(
    'engine · EV-05 unproven ALSO opens a nonconformity, but NO_EVIDENCIADA',
    cardOf(withGap, 'op.acc.1.2')?.origin === 'NO_EVIDENCIADA',
    String(cardOf(withGap, 'op.acc.1.2')?.origin),
  );

  check(
    'engine · both count: neither evaluation comes out without a card',
    withBreach.nonConformities.length > 0 &&
      withGap.nonConformities.length > 0,
    `${withBreach.nonConformities.length} / ${withGap.nonConformities.length}`,
  );

  const breachRow = rowOf(
    buildENSReportRows(buildOpAcc1ReportModel(withBreach)),
    'op.acc.1.servicio',
  );

  const gapRow = rowOf(
    buildENSReportRows(buildOpAcc1ReportModel(withGap)),
    'op.acc.1.servicio',
  );

  check(
    'report · the proven breach comes out NO_CUMPLE',
    breachRow.estado === 'NO_CUMPLE',
    breachRow.estado,
  );

  check(
    'report · what is not proven is still distinguished from what was measured',
    gapRow.estado === 'NO_EVALUABLE',
    gapRow.estado,
  );

  check(
    'PDF · what is not proven is not printed in the colour of the measured breach',
    ensReportStatusPdfColor(gapRow.estado) !==
      ensReportStatusPdfColor(breachRow.estado),
    `${ensReportStatusPdfColor(gapRow.estado)} / ${ensReportStatusPdfColor(
      breachRow.estado,
    )}`,
  );

  check(
    'screen · the badge for what is not proven does not carry the danger colour',
    ensReportStatusBadgeColor(gapRow.estado) !== 'danger' &&
      ensReportStatusBadgeColor(breachRow.estado) === 'danger',
    `${ensReportStatusBadgeColor(
      gapRow.estado,
    )} / ${ensReportStatusBadgeColor(breachRow.estado)}`,
  );

  check(
    'PDF · two rows of the same state do share colour',
    ensReportStatusPdfColor(gapRow.estado) ===
      ensReportStatusPdfColor('NO_EVALUABLE'),
  );

  const gapScore = rowOf(
    buildENSReportRows(buildOpAcc1ReportModel(withGap)),
    'op.acc.1.puntuacion',
  );

  const breachScore = rowOf(
    buildENSReportRows(buildOpAcc1ReportModel(withBreach)),
    'op.acc.1.puntuacion',
  );

  check(
    'report · the control\'s verdict no longer comes out without a number because of a gap',
    gapScore.valor.indexOf('N/A') === -1 &&
      gapScore.valor.indexOf('%') >= 0,
    gapScore.valor,
  );

  check(
    'report · and its state is no longer NO_EVALUABLE',
    gapScore.estado !== 'NO_EVALUABLE',
    gapScore.estado,
  );

  check(
    'report · the measured breach still brings its number',
    breachScore.valor.indexOf('N/A') === -1 &&
      breachScore.valor.indexOf('%') >= 0,
    breachScore.valor,
  );

  const breachModel = buildOpAcc1ReportModel(withBreach);
  const breachRows = buildENSReportRows(breachModel);
  const gapRows = buildENSReportRows(buildOpAcc1ReportModel(withGap));

  const citesEv05 = (position: number): boolean =>
    breachModel.fields[position].evidenceIds.indexOf('EV-05') >= 0;

  const moved = breachRows
    .map((row, position) => ({ fila: row, posicion: position }))
    .filter(({ fila: row, posicion: position }) => row.estado !== gapRows[position].estado);

  check(
    'report · every row that moves cites EV-05, the axis evidence',
    moved.every(({ posicion: position }) => citesEv05(position)),
    JSON.stringify(
      moved
        .filter(({ posicion: position }) => !citesEv05(position))
        .map(({ fila: row }) => row.campo)
    )
  );

  check(
    'report · some rows do not cite EV-05, and none has moved',
    breachRows.some((row, position) => !citesEv05(position)) &&
      breachRows.every(
        (row, position) =>
          citesEv05(position) || row.estado === gapRows[position].estado
      ),
    JSON.stringify(
      breachRows
        .filter((row, position) => !citesEv05(position))
        .map(row => row.campo)
    )
  );
}

section('4 · guards: no silent gaps or invented reds');
{
  const oddModel: ENSReportModel = {
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
        status: undefined as unknown as ENSReportModel['status'],
        value: 'lo que sea',
        evidenceIds: ['EV-01'],
        details: [],
        producerGaps: ['P-04'],
      },
    ],
  };

  const [withoutEvidences, estadoRoto] = buildENSReportRows(oddModel);

  check(
    'guard · a field without evidences SAYS so, it does not leave a silent gap',
    withoutEvidences.evidencia === ENS_REPORT_NO_EVIDENCE,
    withoutEvidences.evidencia
  );

  check(
    'guard · a state outside the list falls to SIN_DATOS, not to undefined',
    estadoRoto.estado === 'SIN_DATOS',
    String(estadoRoto.estado)
  );

  check(
    'guard · that state is not printed in red in the PDF',
    ensReportStatusPdfColor(estadoRoto.estado) !==
      ensReportStatusPdfColor('NO_CUMPLE'),
    ensReportStatusPdfColor(estadoRoto.estado)
  );

  check(
    'guard · the producer\'s pending data reaches the PDF cell',
    pdfText(estadoRoto).indexOf('P-04') >= 0,
    pdfText(estadoRoto)
  );

  check(
    'guard · without pending data the cell does not invent an empty line',
    buildENSReportEvidencePdfCell(withoutEvidences).text.length === 2 &&
      buildENSReportEvidencePdfCell(estadoRoto).text.length === 3,
    `${buildENSReportEvidencePdfCell(withoutEvidences).text.length} / ${
      buildENSReportEvidencePdfCell(estadoRoto).text.length
    }`
  );
}

console.log('');

if (failures.length > 0) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  · ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
