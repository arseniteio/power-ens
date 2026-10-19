/** Deleting the declared configuration of a control. */
import {
  buildClearedControlConfiguration,
  summarizeControlConfigurationReset,
} from '../common/ens/configuration/services/configuration-reset-service';
import { opAcc1Configuration } from '../common/ens/configuration/data/op-acc-1-parameters';
import type {
  ENSControlConfiguration,
} from '../common/ens/configuration/types';

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

const configured = (): ENSControlConfiguration => ({
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map((parameter, index) => {
    if (index === 0) {
      return { ...parameter, value: 'unix' };
    }

    if (index === 1) {
      return { ...parameter, value: ['admin', 'guest'] };
    }

    if (index === 2) {
      return { ...parameter, value: 90 };
    }

    const withoutValue = { ...parameter };
    delete withoutValue.value;

    return withoutValue;
  }),
});

section('1. The summary says what will be deleted, without deleting anything');

{
  const control = configured();
  const summary = summarizeControlConfigurationReset(control);

  check(
    'counts exactly the parameters WITH a value',
    summary.clearedParameters === 3,
    String(summary.clearedParameters)
  );

  check(
    'and names them, so nobody deletes blindly',
    summary.parameterIds.length === 3,
    summary.parameterIds.join(',')
  );

  check(
    'the summary does not modify the control',
    control.parameters[0].value === 'unix',
    String(control.parameters[0].value)
  );

  const unconfigured: ENSControlConfiguration = {
    ...opAcc1Configuration,
    parameters: opAcc1Configuration.parameters.map(parameter => {
      const copy = { ...parameter };
      delete copy.value;
      return copy;
    }),
  };
  const pristine = summarizeControlConfigurationReset(unconfigured);

  check(
    'on an unconfigured control, there is nothing to delete',
    pristine.clearedParameters === 0,
    String(pristine.clearedParameters)
  );
}

{
  const summary = summarizeControlConfigurationReset(opAcc1Configuration);
  check(
    'the summary includes the initial lists of P-03 and P-04',
    ['P-03', 'P-04'].every(id => summary.parameterIds.includes(id))
  );

  const clean = buildClearedControlConfiguration(opAcc1Configuration, 'op.acc.1');
  check(
    'the deletion also removes the catalog\'s initial lists',
    clean.parameters.every(parameter => parameter.value === undefined)
  );
  check(
    'the original catalog keeps its initial lists',
    ['P-03', 'P-04'].every(id => {
      const parameter = opAcc1Configuration.parameters.find(item => item.id === id);
      return Array.isArray(parameter?.value) && parameter.value.length > 0;
    })
  );
}

section('2. A `false` and a `0` ARE declared values');

{
  const control: ENSControlConfiguration = {
    ...opAcc1Configuration,
    parameters: [
      { ...opAcc1Configuration.parameters[0], value: false },
      { ...opAcc1Configuration.parameters[1], value: 0 },
    ],
  } as ENSControlConfiguration;

  check(
    'a false and a 0 count as configured',
    summarizeControlConfigurationReset(control).clearedParameters === 2,
    String(summarizeControlConfigurationReset(control).clearedParameters)
  );

  const empties: ENSControlConfiguration = {
    ...opAcc1Configuration,
    parameters: [
      { ...opAcc1Configuration.parameters[0], value: '   ' },
      { ...opAcc1Configuration.parameters[1], value: [] },
    ],
  } as ENSControlConfiguration;

  check(
    'but a blank string and an empty list do not',
    summarizeControlConfigurationReset(empties).clearedParameters === 0,
    String(summarizeControlConfigurationReset(empties).clearedParameters)
  );
}

section('3. Values are deleted, not the control');

{
  const control = configured();
  const clean = buildClearedControlConfiguration(control, 'op.acc.1');

  check(
    'no parameter keeps a value',
    clean.parameters.every(
      parameter => parameter.value === undefined
    ),
    clean.parameters
      .filter(p => p.value !== undefined)
      .map(p => p.id)
      .join(',')
  );

  check(
    'the control keeps its identity',
    clean.controlId === 'op.acc.1' &&
      clean.controlName === opAcc1Configuration.controlName,
    clean.controlId
  );

  check(
    'and keeps ALL its parameters, with their definition',
    clean.parameters.length === opAcc1Configuration.parameters.length,
    `${clean.parameters.length} vs ${opAcc1Configuration.parameters.length}`
  );

  check(
    'including name, type and mandatoriness of each one',
    clean.parameters.every((parameter, index) => {
      const original = opAcc1Configuration.parameters[index];

      return (
        parameter.id === original.id &&
        parameter.name === original.name &&
        parameter.type === original.type &&
        parameter.required === original.required
      );
    })
  );

  check(
    'and the defaultValue, which belongs to the definition and not to the customer',
    clean.parameters.every((parameter, index) =>
      parameter.defaultValue ===
        opAcc1Configuration.parameters[index].defaultValue
    )
  );

  check(
    'and the original control stays intact (no mutation)',
    control.parameters[0].value === 'unix',
    String(control.parameters[0].value)
  );
}

section('4. The wrong control cannot be deleted');

{
  const control = configured();

  let threw = false;

  try {
    buildClearedControlConfiguration(control, 'op.acc.2');
  } catch (error) {
    threw = true;
  }

  check(
    'confirming ANOTHER control does not delete: it throws',
    threw,
    'un borrado que se dispara con el control equivocado es peor que no tener botón'
  );

  let threwEmpty = false;

  try {
    buildClearedControlConfiguration(control, '');
  } catch (error) {
    threwEmpty = true;
  }

  check(
    'confirming with the empty string does not either',
    threwEmpty
  );

  check(
    'and with the right id it does delete',
    buildClearedControlConfiguration(control, 'op.acc.1')
      .parameters.every(parameter => parameter.value === undefined)
  );

  check(
    'spaces around the id do not prevent the deletion',
    buildClearedControlConfiguration(control, '  op.acc.1  ')
      .parameters.every(parameter => parameter.value === undefined)
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
