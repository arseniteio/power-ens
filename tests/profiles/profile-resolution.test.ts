import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHostParameters } from '../../common/ens/profiles/resolve';
import { planProfileImport } from '../../common/ens/profiles/import-plan';
import { listProfiles, ENS_BUILTIN_PROFILES } from '../../common/ens/profiles/builtin';
import type { ENSProfile } from '../../common/ens/profiles/types';
import { parseProfileFile, profilesToYaml, ENSProfileFileError } from '../../server/lib/profiles/profile-files';
import { pendingParametersOf } from '../../server/lib/hosts/host-queries';

const LIST = ['op.acc.1', 'P-03'];
const NUMBER = ['op.acc.1', 'P-10'];

const profile = (id: string, layer: string, values: ENSProfile['values'], extra: Partial<ENSProfile> = {}): ENSProfile => ({
  id,
  name: id,
  layer,
  match: [{ field: 'role', op: 'is', value: 'server' }],
  values,
  ...extra,
});

const valueOf = (params: ReturnType<typeof resolveHostParameters>, [controlId, parameterId]: string[]) =>
  params.find(p => p.controlId === controlId && p.parameterId === parameterId)!;

const empty = { controls: [], agents: {}, templates: [] } as any;

describe('resolving one machine', () => {
  test('lists add up from the most specific layer; other values come from it', () => {
    const matched = [
      profile('site', 'site', { 'op.acc.1': { 'P-03': ['zimbra'], 'P-10': 2000 } }),
      profile('distro', 'distro', { 'op.acc.1': { 'P-03': ['root', 'ZIMBRA'], 'P-10': 1000 } }),
    ];
    const params = resolveHostParameters({ configuration: empty, agentId: '001', matched });
    assert.deepEqual(valueOf(params, LIST).value, ['zimbra', 'root']);
    assert.deepEqual(valueOf(params, LIST).sources.map(s => s.id), ['site', 'distro']);
    assert.equal(valueOf(params, NUMBER).value, 2000);
    assert.deepEqual(valueOf(params, NUMBER).sources, [{ kind: 'profile', id: 'site', name: 'site' }]);
  });

  test('replace stops the less specific layers', () => {
    const matched = [
      profile('site', 'site', { 'op.acc.1': { 'P-03': ['only'] } }, { replace: { 'op.acc.1': ['P-03'] } }),
      profile('distro', 'distro', { 'op.acc.1': { 'P-03': ['root'] } }),
    ];
    assert.deepEqual(valueOf(resolveHostParameters({ configuration: empty, agentId: '001', matched }), LIST).value, ['only']);
  });

  test('the machine value and the assigned template win over profiles; "none" skips them', () => {
    const matched = [profile('distro', 'distro', { 'op.acc.1': { 'P-03': ['root'] } })];
    const own = { ...empty, agents: { '001': { controls: { 'op.acc.1': { parameters: { 'P-03': ['mine'] } } } } } };
    assert.deepEqual(valueOf(resolveHostParameters({ configuration: own, agentId: '1', matched }), LIST).sources, [{ kind: 'agent', id: '001' }]);

    const none = { ...empty, agents: { '001': { controls: { 'op.acc.1': { templateId: 'none' } } } } };
    assert.deepEqual(valueOf(resolveHostParameters({ configuration: none, agentId: '001', matched }), LIST).sources, []);
  });

  test('without profiles the type template applies, then the organisation value', () => {
    const params = resolveHostParameters({ configuration: empty, agentId: '001', matched: [], inventoryType: 'linux' });
    assert.equal(valueOf(params, LIST).sources[0]?.kind, 'type-template');
  });

  test('«Sin plantilla» skips the type template but keeps the groups', () => {
    const withoutTemplate = { ...empty, agents: { '001': { typeOverride: 'none' } } };
    const alone = resolveHostParameters({ configuration: withoutTemplate, agentId: '001', matched: [], inventoryType: 'linux' });
    assert.notEqual(valueOf(alone, LIST).sources[0]?.kind, 'type-template');
    const matched = [profile('distro', 'distro', { 'op.acc.1': { 'P-03': ['root'] } })];
    const grouped = resolveHostParameters({ configuration: withoutTemplate, agentId: '001', matched, inventoryType: 'linux' });
    assert.equal(valueOf(grouped, LIST).sources[0]?.kind, 'profile');
  });
});

describe('planning an import', () => {
  const listed = listProfiles([{ profile: profile('web', 'service', {}), version: { seqNo: 4, primaryTerm: 1 } }]);

  test('marks new, changed, same and invalid profiles', () => {
    const items = planProfileImport(
      [
        profile('nuevo', 'service', {}),
        { ...profile('web', 'service', {}), name: 'Web' },
        ENS_BUILTIN_PROFILES[0],
        { id: 'MAL', name: '', layer: 'x', match: [], values: {}, colour: 1 },
      ],
      listed
    );
    assert.deepEqual(items.map(i => i.status), ['new', 'changed', 'same', 'invalid']);
    assert.deepEqual(items[1].changes, ['nombre']);
    assert.deepEqual(items[1].expectedVersion, { seqNo: 4, primaryTerm: 1 });
    assert.equal(items[0].expectedVersion, null);
    assert.match(items[3].errors.join(), /clave «colour»/);
  });

  test('a profile twice in the file is an error', () => {
    const items = planProfileImport([profile('a', 'site', {}), profile('a', 'site', {})], listed);
    assert.ok(items.every(i => i.status === 'invalid'));
  });
});

describe('profile files', () => {
  test('export and import round-trip through the engine layout', () => {
    const yaml = profilesToYaml([profile('b', 'site', { 'op.acc.1': { 'P-10': 1000, 'P-03': ['x'] } }), profile('a', 'role', {})]);
    assert.match(yaml, /^id: b\nname: b\nlayer: site\nmatch:\n {2}- field: role/);
    assert.match(yaml, /\n---\nid: a\n/);
    assert.ok(yaml.indexOf('P-03') < yaml.indexOf('P-10'));
    assert.deepEqual(parseProfileFile(yaml).map((p: any) => p.id), ['b', 'a']);
  });

  test('reads JSON, lists and a profiles key', () => {
    assert.equal(parseProfileFile(JSON.stringify([profile('a', 'site', {}), profile('b', 'site', {})])).length, 2);
    assert.equal(parseProfileFile(JSON.stringify({ profiles: [profile('a', 'site', {})] })).length, 1);
  });

  test('a syntax error names the document', () => {
    assert.throws(() => parseProfileFile('id: a\n---\nid: [b\n'), (error: any) => error instanceof ENSProfileFileError && /documento 2/.test(error.message));
    assert.throws(() => parseProfileFile('\n'), ENSProfileFileError);
  });
});

describe('pending parameters from the verdicts', () => {
  test('groups evidences by control and parameter', () => {
    const body = {
      aggregations: {
        agents: { value: 3 },
        unset: {
          controls: {
            buckets: [
              {
                key: 'op.acc.4',
                evidences: {
                  buckets: [
                    { key: 'E-01', agents: { value: 3 }, samples: { hits: { hits: [{ _source: { reason_args: { param: 'P-05' } } }] } } },
                    { key: 'E-02', agents: { value: 2 }, samples: { hits: { hits: [{ _source: { reason_args: { param: 'P-05' } } }] } } },
                  ],
                },
              },
            ],
          },
        },
      },
    };
    assert.deepEqual(pendingParametersOf(body), { agents: 3, parameters: [{ controlId: 'op.acc.4', parameterId: 'P-05', evidences: ['E-01', 'E-02'], agents: 3 }] });
  });

  test('a parameter of another control is filed under that control', () => {
    const body = {
      aggregations: {
        unset: {
          controls: {
            buckets: [
              {
                key: 'op.exp.5',
                evidences: { buckets: [{ key: 'E-03', agents: { value: 2 }, samples: { hits: { hits: [{ _source: { reason_args: { param: 'op.exp.4 P-06' } } }] } } }] },
              },
            ],
          },
        },
      },
    };
    assert.deepEqual(pendingParametersOf(body).parameters, [{ controlId: 'op.exp.4', parameterId: 'P-06', evidences: ['op.exp.5 E-03'], agents: 2 }]);
  });
});
