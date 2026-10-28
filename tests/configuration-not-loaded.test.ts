/** A configuration failure must be visible, not left loading. */
import { assertENSConfigurationVersion } from '../common/ens/configuration/services/configuration-structure-validator';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

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

section('1. A column without a boolean `required` does not pass, and it says which');

{
  const withTable = (requiredOfSecond: boolean | undefined) => {
    const cfg = JSON.parse(
      JSON.stringify(defaultENSConfigurationTemplate)
    );

    const columns: Record<string, unknown>[] = [
      { name: 'rol', label: 'Rol', type: 'identifier', required: true },
      { name: 'recurso', label: 'Recurso', type: 'string' },
    ];

    if (requiredOfSecond !== undefined) {
      columns[1].required = requiredOfSecond;
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
      powerEnsUsage: '-',
      ifNotConfigured: '-',
      value: [],
      columns: columns,
    });

    return cfg;
  };

  let templatePasses = true;
  let why = '';

  try {
    assertENSConfigurationVersion(
      JSON.parse(JSON.stringify(defaultENSConfigurationTemplate))
    );
  } catch (error) {
    templatePasses = false;
    why = error instanceof Error ? error.message : String(error);
  }

  check(
    'the product template is valid (positive control)',
    templatePasses,
    why
  );

  let message = '';

  try {
    assertENSConfigurationVersion(withTable(undefined));
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  check(
    'a column without a boolean `required` is rejected',
    Boolean(message),
    'el validador la dio por buena'
  );

  check(
    'and the message says EXACTLY which column, with its path',
    message.includes('columns[1].required'),
    message
  );

  let fixedPasses = true;
  let motive = '';

  try {
    assertENSConfigurationVersion(withTable(false));
  } catch (error) {
    fixedPasses = false;
    motive = error instanceof Error ? error.message : String(error);
  }

  check(
    'with an explicit `required: false`, the same document passes',
    fixedPasses,
    motive
  );
}

section('2. Configuration in ERROR with scope not started: the error is visible');

{
  type Estado = 'NOT_STARTED' | 'LOADING' | 'READY' | 'ERROR';

  const decide = (config: Estado, scope: Estado): string => {
    if (config === 'ERROR' || scope === 'ERROR') {
      return 'ERROR';
    }

    if (
      config === 'NOT_STARTED' ||
      config === 'LOADING' ||
      scope === 'NOT_STARTED' ||
      scope === 'LOADING'
    ) {
      return 'CARGANDO';
    }

    return 'CONTENIDO';
  };

  check(
    'config ERROR + scope NOT_STARTED -> the ERROR is rendered',
    decide('ERROR', 'NOT_STARTED') === 'ERROR',
    decide('ERROR', 'NOT_STARTED')
  );

  check(
    'config ERROR + scope LOADING -> the ERROR is rendered',
    decide('ERROR', 'LOADING') === 'ERROR',
    decide('ERROR', 'LOADING')
  );

  check(
    'and the other way round: scope ERROR with config ready -> ERROR',
    decide('READY', 'ERROR') === 'ERROR',
    decide('READY', 'ERROR')
  );

  check(
    'a real load still shows the spinner',
    decide('LOADING', 'NOT_STARTED') === 'CARGANDO',
    decide('LOADING', 'NOT_STARTED')
  );

  check(
    'and with everything ready the content is rendered',
    decide('READY', 'READY') === 'CONTENIDO',
    decide('READY', 'READY')
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
