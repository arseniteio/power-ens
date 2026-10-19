/** Parameter patterns. */

import assert from 'node:assert/strict';
import { compileParameterPattern } from '../common/ens/configuration/services/parameter-pattern';
import {
  parseParameterInput,
  supportsParameterPattern,
} from '../common/ens/configuration/services/parameter-input';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { validateControlParameterValues } from '../common/ens/configuration/services/validation-engine';
import { assertENSConfigurationVersion } from '../common/ens/configuration/services/configuration-structure-validator';
import { buildClearedControlConfiguration } from '../common/ens/configuration/services/configuration-reset-service';
import { applyENSControlParameterValues } from '../public/ens/configuration/engine';
import { opAcc1Configuration } from '../common/ens/configuration/data/op-acc-1-parameters';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import { judgeEvidence } from '../common/ens/core/evidence/judgment';
import type { ENSControlParameter } from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

const account = opAcc1Configuration.parameters.find((p) => p.id === 'P-04')!;
const service = opAcc1Configuration.parameters.find((p) => p.id === 'P-03')!;
for (const input of [
  'admin,test,administrador',
  'admin test administrador',
  'admin, test\nadministrador;admin',
]) {
  assert.deepEqual(parseParameterInput(account, input), [
    'admin',
    'test',
    'administrador',
  ]);
}
assert.deepEqual(parseParameterInput(account, '  , ; \n'), []);
assert.deepEqual(
  parseParameterInput({ ...account, id: 'P-01' }, 'Active Directory, Azure AD'),
  ['Active Directory', 'Azure AD']
);
assert.deepEqual(
  parseParameterInput(
    { ...account, id: 'P-07', type: 'table' },
    'ana | srv01 | ops'
  ),
  ['ana | srv01 | ops']
);

const configured = (parameter: ENSControlParameter) => ({
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map((p) =>
    p.id === parameter.id ? parameter : p
  ),
});
const regex: ENSControlParameter = {
  ...account,
  matchMode: 'regex',
  value: '^(admin|test|svc_.+)$',
};
assert(supportsParameterPattern(regex));
assert(validateParameterValue(regex, regex.value).valid);
for (const value of [
  '[',
  '(?=admin)admin',
  '(a)\\1',
  '',
  'a'.repeat(513),
  ['admin'],
]) {
  assert.equal(
    validateParameterValue(regex, value).valid,
    false,
    String(value)
  );
}
assert.equal(
  validateParameterValue({ ...regex, type: 'number' }, regex.value).valid,
  false
);
assert.equal(
  validateParameterValue(
    {
      ...regex,
      columns: [
        { name: 'cuenta', label: 'Cuenta', type: 'identifier', required: true },
      ],
    },
    regex.value
  ).valid,
  false
);
assert(
  validateControlParameterValues(configured(regex), { [regex.name]: '[' }).some(
    (p) => p.parameterId === regex.id
  )
);

const saved = applyENSControlParameterValues(configured(regex), {
  [regex.name]: '^svc_.*$',
});
const document = JSON.parse(
  JSON.stringify({ ...defaultENSConfigurationTemplate, controls: [saved] })
);
assertENSConfigurationVersion(document);
const reloaded = document.controls[0].parameters.find(
  (p: ENSControlParameter) => p.id === regex.id
);
assert.equal(reloaded.matchMode, 'regex');
assert.equal(reloaded.value, '^svc_.*$');
const invalidMode = JSON.parse(JSON.stringify(document));
invalidMode.controls[0].parameters[0].matchMode = 'javascript';
assert.throws(() => assertENSConfigurationVersion(invalidMode), /matchMode/);
const cleared = buildClearedControlConfiguration(saved, 'op.acc.1');
assert(
  cleared.parameters.every(
    (p) => p.value === undefined && p.matchMode === undefined
  )
);
assert.equal(regex.value, '^(admin|test|svc_.+)$');

const evaluate = (
  parameter: ENSControlParameter,
  user?: string,
  primitive?: 'TODOS_EN_LISTA' | 'NINGUNO_FUERA_DE_LISTA'
) => {
  const definition = ENSEvidenceCatalog.find(
    (e) =>
      e.controlId === 'op.acc.1' &&
      e.id === (parameter.id === 'P-03' ? 'EV-05' : 'EV-03')
  )!;
  const judgment = {
    ...definition.judgment!,
    ...(primitive ? { primitive } : {}),
  };
  const events: ENSNormalizedEvent[] =
    user === undefined
      ? []
      : [
          {
            id: 'login-1',
            controlId: 'op.acc.1',
            eventType: 'account_authenticated',
            sourceType: 'WAZUH_ALERT',
            timestamp: '2026-10-15T10:00:00Z',
            attributes: { usuario: user },
          },
        ];
  const { judgment: _, ...base } = definition;
  return judgeEvidence(
    definition,
    judgment,
    base,
    events,
    configured(parameter),
    new Date('2026-10-15T10:01:00Z')
  );
};
assert.equal(evaluate(regex, 'admin').status, 'NO_CUMPLE');
assert.equal(evaluate(regex, 'svc_backup').status, 'NO_CUMPLE');
assert.equal(evaluate(regex, 'maria').status, 'CUMPLE');
assert.equal(
  evaluate(regex, 'superadmin').status,
  'CUMPLE',
  'full match'
);
assert.equal(
  evaluate(regex, 'ADMIN').status,
  'CUMPLE',
  'regex is case-sensitive'
);
assert.equal(
  evaluate({ ...regex, value: '(?i)admin' }, 'ADMIN').status,
  'NO_CUMPLE'
);
assert.equal(
  evaluate({ ...service, matchMode: 'regex', value: '^svc_.*$' }, 'svc_backup')
    .status,
  'NO_CUMPLE'
);
assert.equal(evaluate(regex, 'admin', 'TODOS_EN_LISTA').status, 'CUMPLE');
assert.equal(evaluate(regex, 'maria', 'TODOS_EN_LISTA').status, 'NO_CUMPLE');
assert.equal(
  evaluate(regex, 'maria', 'NINGUNO_FUERA_DE_LISTA').status,
  'NO_CUMPLE'
);
assert.equal(
  evaluate(regex).status,
  'NO_EVALUABLE',
  'no coverage, no compliance'
);
const invalid = evaluate({ ...regex, value: '[' }, 'admin');
assert.equal(invalid.status, 'NO_EVALUABLE');
assert.equal(invalid.gapCause, 'CONFIGURATION');
assert(invalid.observations.some((text) => text.includes('regular')));
assert.equal(
  evaluate({ ...account, value: ['admin.*'] }, 'admin2').status,
  'CUMPLE',
  'stored values stay literal'
);
assert.equal(
  evaluate({ ...account, value: ['admin.*'] }, 'admin.*').status,
  'NO_CUMPLE'
);
assert.equal(
  compileParameterPattern('(a+)+$').matches('a'.repeat(20000) + '!'),
  false
);
console.log(
  'ALL OK: multiple input, patterns, persistence, clearing and evidence judgment.'
);
