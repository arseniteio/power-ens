/** Registry of report models per control. */
import {
  buildENSReportModel,
  buildENSReportModelRegistry,
  getENSReportModelDefinition,
  getRegisteredENSReportControls,
  listENSControlsWithoutReportModel,
} from '../public/ens/reports/registry';
import type { ENSReportModelDefinition } from '../public/ens/reports/registry';
import { ENSControls } from '../public/ens/data';

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

const throws = (action: () => unknown): boolean => {
  try {
    action();

    return false;
  } catch (error) {
    return true;
  }
};

const CONTROL_WITHOUT_MODEL = 'ens.control.sin.modelo';

const resultWithoutEvidences = undefined;

const registeredDefinition = (
  controlId: string
): ENSReportModelDefinition => {
  const definition = getENSReportModelDefinition(controlId);

  if (!definition) {
    throw new Error(`broken fixture: ${controlId} should be registered`);
  }

  return definition;
};

{
  section('1. The registry answers for the registered controls');

  const registered2 = getRegisteredENSReportControls();

  check(
    'registry · the twenty-three catalog controls are there, and only those',
    registered2.join(',') ===
      'mp.info.6,op.acc.1,op.acc.2,op.acc.3,op.acc.4,' +
      'op.acc.5,op.acc.6,op.cont.2,op.cont.3,op.exp.1,op.exp.2,op.exp.3,op.exp.4,' +
      'op.exp.5,op.exp.6,op.exp.7,op.exp.8,op.exp.9,op.exp.10,op.mon.1,op.mon.2,op.mon.3,op.nub.1',
    registered2.join(',')
  );

  for (const controlId of registered2) {
    const definition = registeredDefinition(controlId);

    check(
      `registry · ${controlId} returns itself, not another`,
      definition.controlId === controlId,
      definition.controlId
    );

    check(
      `registry · ${controlId}'s title starts with its identifier`,
      definition.name.startsWith(`${controlId} `),
      definition.name
    );
  }
}

{
  section('2. The built model is the requested control\'s');

  for (const controlId of getRegisteredENSReportControls()) {
    const model = buildENSReportModel(controlId, resultWithoutEvidences);

    check(
      `model · ${controlId} builds a model`,
      model !== undefined
    );

    check(
      `model · ${controlId}'s model is declared of ${controlId}`,
      model?.controlId === controlId,
      String(model?.controlId)
    );

    check(
      `model · ${controlId} brings its own fields`,
      (model?.fields.length || 0) > 0,
      String(model?.fields.length)
    );
  }

  const fieldsOf = (controlId: string): string =>
    (buildENSReportModel(controlId, resultWithoutEvidences)?.fields || [])
      .map(campo => campo.id)
      .join(',');

  const sets = new Set([
    fieldsOf('mp.info.6'),
    fieldsOf('op.acc.1'),
    fieldsOf('op.acc.2'),
  ]);

  check(
    'model · the three controls produce different field sets',
    sets.size === 3,
    `${sets.size} juego(s) distintos de 3`
  );
}

{
  section('3. A control without a model does not receive another\'s');

  check(
    'no model · the registry returns undefined, not a spare model',
    getENSReportModelDefinition(CONTROL_WITHOUT_MODEL) === undefined,
    String(getENSReportModelDefinition(CONTROL_WITHOUT_MODEL)?.controlId)
  );

  const foreignModel = buildENSReportModel(
    CONTROL_WITHOUT_MODEL,
    resultWithoutEvidences
  );

  check(
    'no model · building the report returns undefined',
    foreignModel === undefined,
    String(foreignModel?.controlId)
  );

  const mpInfo6Model = buildENSReportModel(
    'mp.info.6',
    resultWithoutEvidences
  );

  check(
    'no model · what is returned is NOT mp.info.6\'s model',
    JSON.stringify(foreignModel ?? null) !==
      JSON.stringify(mpInfo6Model ?? null),
    'un control sin modelo estaba recibiendo el informe de mp.info.6'
  );

  check(
    'no model · the comparator does see two mp.info.6 models as equal',
    JSON.stringify(mpInfo6Model ?? null) ===
      JSON.stringify(
        buildENSReportModel('mp.info.6', resultWithoutEvidences) ?? null
      )
  );
}

{
  section('4. Every control listed in Reports has a model');

  const fromCatalog = ENSControls.map(control => control.id);

  check(
    'catalog · the screen list is not empty',
    fromCatalog.length > 0,
    String(fromCatalog.length)
  );

  const withoutModel = listENSControlsWithoutReportModel(fromCatalog);

  check(
    'catalog · no listed control is left without a report model',
    withoutModel.length === 0,
    withoutModel.join(', ')
  );

  const withIncoming = listENSControlsWithoutReportModel([
    ...getRegisteredENSReportControls(),
    CONTROL_WITHOUT_MODEL,
    `${CONTROL_WITHOUT_MODEL}.2`,
  ]);

  check(
    'catalog · the helper does name the controls without a model',
    withIncoming.join(',') ===
      `${CONTROL_WITHOUT_MODEL},${CONTROL_WITHOUT_MODEL}.2`,
    withIncoming.join(',')
  );
}

{
  section('5. Registry guards');

  const definition = (
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

  check(
    'guard · a healthy list does not throw',
    !throws(() =>
      buildENSReportModelRegistry([
        definition(CONTROL_WITHOUT_MODEL),
        definition('op.acc.4'),
      ])
    )
  );

  check(
    'guard · two models for the same control throw',
    throws(() =>
      buildENSReportModelRegistry([
        definition(CONTROL_WITHOUT_MODEL),
        definition(CONTROL_WITHOUT_MODEL),
      ])
    )
  );

  check(
    'guard · a model without controlId throws',
    throws(() => buildENSReportModelRegistry([definition('   ')]))
  );
}

console.log('');

if (failures.length > 0) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  · ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
