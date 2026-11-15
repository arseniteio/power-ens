import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ENS_EXCLUSIONS_INDEX } from '../../common/constants';
import { createExclusionHandlers } from '../../server/lib/exclusion-handlers';
import { createFakeIndexer, FakeDoc } from '../support/fake-indexer';

const ADMIN = { user_name: 'dioni', roles: ['power_ens_admin'] };
const READER = { user_name: 'ana', roles: ['readall'] };

const silentLogger: any = { info: () => {}, warn: () => {}, error: () => {} };

const response: any = {
  ok: ({ body }: any) => ({ status: 200, data: body.data }),
  customError: ({ statusCode, body }: any) => ({ status: statusCode, message: body.message }),
};

const exclusionDoc = (date: string, action: string, reason: string): FakeDoc => ({
  _id: date,
  _index: ENS_EXCLUSIONS_INDEX,
  _source: { agentId: '001', controlId: 'op.acc.1', action, reason, user: 'dioni', date },
});

const setUp = (user: any, docs: FakeDoc[] = [], currentUser?: any) => {
  const indexer = createFakeIndexer(docs, { user });
  const client = { asInternalUser: indexer, asCurrentUser: currentUser || indexer };
  const context = { core: { opensearch: { client } } };
  const handlers = createExclusionHandlers({ logger: silentLogger, securityEnabled: true });
  return { indexer, context, handlers };
};

const exclude = { agentId: '001', controlId: 'op.acc.1', action: 'EXCLUDED', reason: 'Servidor de pruebas sin datos reales.' };

describe('recording an exclusion', () => {
  test('stores the reason with the session user and the date', async () => {
    const { indexer, context, handlers } = setUp(ADMIN);

    const result = await handlers.record(context, { body: exclude }, response);

    assert.equal(result.status, 200);
    const stored = indexer.docs.find(doc => doc._index === ENS_EXCLUSIONS_INDEX)?._source;
    assert.equal(stored.user, 'dioni');
    assert.equal(stored.reason, exclude.reason);
    assert.ok(Date.parse(stored.date));
  });

  test('ignores a user name sent by the browser', async () => {
    const { indexer, context, handlers } = setUp(ADMIN);

    await handlers.record(context, { body: { ...exclude, user: 'someone-else' } }, response);

    assert.equal(indexer.docs[0]._source.user, 'dioni');
  });

  test('is refused without the power_ens_admin role', async () => {
    const { indexer, context, handlers } = setUp(READER);

    const result = await handlers.record(context, { body: exclude }, response);

    assert.equal(result.status, 403);
    assert.equal(indexer.docs.length, 0);
  });

  test('is refused without a reason', async () => {
    const { context, handlers } = setUp(ADMIN);

    const result = await handlers.record(context, { body: { ...exclude, reason: '   ' } }, response);

    assert.equal(result.status, 400);
    assert.equal(result.message, 'Hace falta un motivo.');
  });

  test('is refused for the Wazuh manager', async () => {
    const { context, handlers } = setUp(ADMIN);

    const result = await handlers.record(context, { body: { ...exclude, agentId: '000' } }, response);

    assert.equal(result.status, 400);
  });

  test('is refused for a control outside the catalog', async () => {
    const { context, handlers } = setUp(ADMIN);

    const result = await handlers.record(context, { body: { ...exclude, controlId: 'mp.info.99' } }, response);

    assert.equal(result.status, 400);
  });
});

describe('the exclusion status of a machine in a control', () => {
  test('is the latest record', async () => {
    const { context, handlers } = setUp(READER, [
      exclusionDoc('2026-11-01T10:00:00.000Z', 'EXCLUDED', 'Fuera de producción.'),
      exclusionDoc('2026-11-02T10:00:00.000Z', 'INCLUDED', 'Vuelve a producción.'),
    ]);

    const result = await handlers.status(context, { query: { agentId: '1', controlId: 'op.acc.1' } }, response);

    assert.equal(result.data.latest.action, 'INCLUDED');
  });

  test('is empty when nothing was recorded', async () => {
    const { context, handlers } = setUp(READER);

    const result = await handlers.status(context, { query: { agentId: '001', controlId: 'op.acc.1' } }, response);

    assert.equal(result.data.latest, null);
  });

  test('lets an administrator change it', async () => {
    const { context, handlers } = setUp(ADMIN);

    const result = await handlers.status(context, { query: { agentId: '001', controlId: 'op.acc.1' } }, response);

    assert.equal(result.data.canChange, true);
  });

  test('does not let a reader change it', async () => {
    const { context, handlers } = setUp(READER);

    const result = await handlers.status(context, { query: { agentId: '001', controlId: 'op.acc.1' } }, response);

    assert.equal(result.data.canChange, false);
  });

  test('is refused when the user cannot read the exclusions index', async () => {
    const indexer = createFakeIndexer([], { user: READER });
    const forbidden = {
      ...indexer,
      search: async () => {
        throw Object.assign(new Error('no permissions for [indices:data/read/search]'), { statusCode: 403 });
      },
    };
    const { context, handlers } = setUp(READER, [], forbidden);

    const result = await handlers.status(context, { query: { agentId: '001', controlId: 'op.acc.1' } }, response);

    assert.equal(result.status, 403);
  });

  test('is empty before the exclusions index exists', async () => {
    const indexer = createFakeIndexer([], { user: READER });
    const missing = {
      ...indexer,
      search: async () => {
        throw Object.assign(new Error('no such index'), { statusCode: 404, body: { error: { type: 'index_not_found_exception' } } });
      },
    };
    const { context, handlers } = setUp(READER, [], missing);

    const result = await handlers.status(context, { query: { agentId: '001', controlId: 'op.acc.1' } }, response);

    assert.equal(result.data.latest, null);
  });
});
