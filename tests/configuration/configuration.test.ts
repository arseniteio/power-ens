import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultENSConfigurationTemplate } from '../../common/ens/configuration/data/default-configuration';
import { resolveControlConfigurationWithOrigins } from '../../common/ens/configuration/agents/configuration-resolver';
import { setAgentParameterValue, setControlTemplateAssignment } from '../../common/ens/configuration/agents/agent-configuration-actions';
import { validateENSConfigurationStructure } from '../../common/ens/configuration/services/configuration-structure-validator';
import { validateControlConfiguration } from '../../common/ens/configuration/services/validation-engine';
import { compileParameterPattern } from '../../common/ens/configuration/services/parameter-pattern';
import { normalizeOrganizationData } from '../../common/ens/configuration/organization/organization-data-migration';
import { isAgentLevelParameter } from '../../common/ens/configuration/agents/parameter-classes';
import type { ENSConfigurationVersion } from '../../common/ens/configuration/types';

const freshConfiguration = (): ENSConfigurationVersion => JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));

const valueOf = (configuration: ENSConfigurationVersion, controlId: string, parameterId: string, agentId?: string) =>
  resolveControlConfigurationWithOrigins(configuration, controlId, agentId)?.configuration.parameters.find(p => p.id === parameterId)?.value;

describe('the default configuration', () => {
  test('is a valid document', () => {
    const validation = validateENSConfigurationStructure(freshConfiguration());
    assert.equal(validation.valid, true, validation.errors.join('; '));
  });

  test('declares every engine control', () => {
    assert.deepEqual(freshConfiguration().controls.map(control => control.controlId).sort(), ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4', 'op.acc.5', 'op.acc.6']);
  });

  test('rejects a document that is not one', () => {
    assert.equal(validateENSConfigurationStructure({ controls: 'nope' }).valid, false);
  });
});

describe('a value for a machine', () => {
  test('wins over the common value of the control', () => {
    const configuration = setAgentParameterValue(freshConfiguration(), '001', 'op.acc.1', 'P-07', ['ana | srv-a | admin']);
    assert.deepEqual(valueOf(configuration, 'op.acc.1', 'P-07', '001'), ['ana | srv-a | admin']);
    assert.notDeepEqual(valueOf(configuration, 'op.acc.1', 'P-07', '002'), ['ana | srv-a | admin']);
  });

  test('is refused for an organisation parameter', () => {
    assert.equal(isAgentLevelParameter('op.acc.1', 'P-04'), false);
    assert.throws(() => setAgentParameterValue(freshConfiguration(), '001', 'op.acc.1', 'P-04', ['x']));
  });

  test('comes from the template assigned to the machine', () => {
    const configuration = setControlTemplateAssignment(freshConfiguration(), 'op.acc.1', ['001'], 'linux-ubuntu');
    assert.equal(valueOf(configuration, 'op.acc.1', 'P-10', '001'), 1000);
  });

  test('cannot come from a template the control does not have', () => {
    assert.throws(() => setControlTemplateAssignment(freshConfiguration(), 'op.acc.1', ['001'], 'no-such-template'));
  });
});

describe('a control configuration', () => {
  test('reports the parameters still without value', () => {
    const control = freshConfiguration().controls.find(item => item.controlId === 'op.acc.1')!;
    const validation = validateControlConfiguration(control, 'MEDIO');
    assert.ok(validation.parameters.some(parameter => parameter.status === 'NOT_CONFIGURED'));
  });
});

describe('a regular expression parameter', () => {
  test('compiles with RE2', () => {
    assert.equal(compileParameterPattern('^svc_.*$').matches('svc_backup'), true);
  });

  test('is refused empty, padded or invalid', () => {
    assert.throws(() => compileParameterPattern(''));
    assert.throws(() => compileParameterPattern(' ^a$'));
    assert.throws(() => compileParameterPattern('(unclosed'));
  });
});

describe('organisation data', () => {
  test('writes an item into every parameter that reads it', () => {
    const configuration: any = freshConfiguration();
    configuration.organizationData = { values: { grupos_privilegiados: ['sudo', 'wheel'] } };
    const { configuration: next } = normalizeOrganizationData(configuration);
    for (const [controlId, parameterId] of [['op.acc.1', 'P-11'], ['op.acc.2', 'P-12'], ['op.acc.4', 'P-06']]) {
      assert.deepEqual(valueOf(next, controlId, parameterId), ['sudo', 'wheel'], `${controlId} ${parameterId}`);
    }
  });
});
