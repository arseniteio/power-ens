import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createExclusionService, readCookie } from '../../public/ens/exclusions/exclusion-service';

const EXCLUDE = { agentId: '001', controlId: 'op.acc.1', action: 'EXCLUDED' as const, reason: 'Máquina de pruebas.' };
const INCLUDE = { ...EXCLUDE, action: 'INCLUDED' as const, reason: 'Vuelve a producción.' };

const OK = { error: 0, data: { affected_items: ['001'], failed_items: [] } };

const fakeHttp = (options: { recordFails?: boolean; wazuh?: (method: string, path: string) => any } = {}) => {
  const wazuhCalls: string[] = [];
  const recorded: any[] = [];
  const http = {
    get: async (_path: string, _options?: any): Promise<any> => ({ data: { latest: null, canChange: true } }),
    post: async (path: string, { body }: any = {}): Promise<any> => {
      const parsed = JSON.parse(body);
      if (path === '/api/request') {
        wazuhCalls.push(`${parsed.method} ${parsed.path}`);
        return options.wazuh ? options.wazuh(parsed.method, parsed.path) : OK;
      }
      if (options.recordFails) throw Object.assign(new Error('Bad Request'), { body: { message: 'Hace falta un motivo.' } });
      recorded.push(parsed);
      return { data: { ...parsed, user: 'dioni', date: '2026-11-15T17:00:00.000Z' } };
    },
  };
  return { http, wazuhCalls, recorded };
};

const withApiCookie = () => `other=1; currentApi=${encodeURIComponent(encodeURIComponent(JSON.stringify({ name: 'wazuh.manager', id: 'default' })))}`;

describe('excluding a machine from a control', () => {
  test('adds the agent to the control exclusion group and records the reason', async () => {
    const { http, wazuhCalls, recorded } = fakeHttp();

    await createExclusionService(http, withApiCookie).change(EXCLUDE);

    assert.deepEqual(wazuhCalls, ['PUT /agents/001/group/ens-excluir-op.acc.1']);
    assert.equal(recorded[0].reason, 'Máquina de pruebas.');
  });

  test('undoes the group change when the reason cannot be recorded', async () => {
    const { http, wazuhCalls } = fakeHttp({ recordFails: true });

    await assert.rejects(createExclusionService(http, withApiCookie).change(EXCLUDE), /se ha deshecho/);

    assert.deepEqual(wazuhCalls, ['PUT /agents/001/group/ens-excluir-op.acc.1', 'DELETE /agents/001/group/ens-excluir-op.acc.1']);
  });

  test('records nothing when Wazuh refuses the group change', async () => {
    const refused = { error: 1, data: { affected_items: [], failed_items: [{ error: { message: 'Permission denied' } }] } };
    const { http, recorded } = fakeHttp({ wazuh: () => refused });

    await assert.rejects(createExclusionService(http, withApiCookie).change(EXCLUDE), /Permission denied/);

    assert.equal(recorded.length, 0);
  });

  test('calls the Wazuh API the Wazuh app has selected', async () => {
    const ids: string[] = [];
    const { http } = fakeHttp();
    const post = http.post;
    http.post = async (path: string, options: any) => {
      if (path === '/api/request') ids.push(JSON.parse(options.body).id);
      return post(path, options);
    };

    await createExclusionService(http, withApiCookie).change(EXCLUDE);

    assert.deepEqual(ids, ['default']);
  });

  test('asks to open Wazuh when no Wazuh API is selected', async () => {
    const { http } = fakeHttp();

    await assert.rejects(createExclusionService(http, () => '').change(EXCLUDE), /Abre una página de Wazuh/);
  });
});

describe('including a machine again', () => {
  test('removes the agent from the control exclusion group', async () => {
    const { http, wazuhCalls } = fakeHttp();

    await createExclusionService(http, withApiCookie).change(INCLUDE);

    assert.deepEqual(wazuhCalls, ['DELETE /agents/001/group/ens-excluir-op.acc.1']);
  });

  test('puts the agent back in the group when the reason cannot be recorded', async () => {
    const { http, wazuhCalls } = fakeHttp({ recordFails: true });

    await assert.rejects(createExclusionService(http, withApiCookie).change(INCLUDE));

    assert.equal(wazuhCalls[1], 'PUT /agents/001/group/ens-excluir-op.acc.1');
  });
});

describe('whether a machine is excluded', () => {
  test('is read from its live Wazuh groups', async () => {
    const groups = { error: 0, data: { affected_items: [{ group: ['default', 'ens-excluir-op.acc.1'] }], failed_items: [] } };
    const { http } = fakeHttp({ wazuh: () => groups });
    const service = createExclusionService(http, withApiCookie);

    assert.equal(await service.isExcluded('001', 'op.acc.1'), true);
    assert.equal(await service.isExcluded('001', 'op.acc.2'), false);
  });
});

describe('reading a cookie', () => {
  test('finds the value by name', () => {
    assert.equal(readCookie('a=1; wz-api=default; b=2', 'wz-api'), 'default');
  });

  test('is empty when the cookie is missing', () => {
    assert.equal(readCookie('a=1', 'wz-api'), undefined);
  });
});
