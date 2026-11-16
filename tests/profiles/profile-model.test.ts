import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { globMatches, globToLuceneRegexp, isValidGlob } from '../../common/ens/profiles/glob';
import { ENS_BUILTIN_PROFILES, effectiveProfiles, listProfiles } from '../../common/ens/profiles/builtin';
import { hostFactsOf, matchedProfiles, profileMatchesHost, profileQuery } from '../../common/ens/profiles/match';
import { validateProfile } from '../../common/ens/profiles/validate';
import type { ENSHostFacts, ENSProfile } from '../../common/ens/profiles/types';

const facts = (over: Partial<ENSHostFacts> = {}): ENSHostFacts => ({
  distro: 'ubuntu-24.04',
  family: 'debian',
  role: 'server',
  hostname: 'web-01',
  services: ['nginx'],
  groups: ['ens', 'default'],
  ...over,
});

const profile = (over: Partial<ENSProfile> = {}): ENSProfile => ({
  id: 'web',
  name: 'Servidor web',
  layer: 'service',
  match: [{ field: 'service', op: 'has', value: 'nginx' }],
  values: {},
  ...over,
});

describe('glob patterns as Go path.Match reads them', () => {
  test('star and question mark stop at a slash', () => {
    assert.equal(globMatches('ubuntu-*', 'ubuntu-24.04'), true);
    assert.equal(globMatches('a*', 'a/b'), false);
    assert.equal(globMatches('a?c', 'abc'), true);
    assert.equal(globMatches('a?c', 'a/c'), false);
  });

  test('classes, ranges, negation and escapes', () => {
    assert.equal(globMatches('web-0[1-3]', 'web-02'), true);
    assert.equal(globMatches('web-0[^1-3]', 'web-02'), false);
    assert.equal(globMatches('a\\*b', 'a*b'), true);
    assert.equal(globMatches('a.b', 'axb'), false);
  });

  test('malformed patterns are rejected', () => {
    for (const bad of ['[', '[]', '[a-]', '[-a]', 'a\\', '[^]']) assert.equal(isValidGlob(bad), false, bad);
    assert.equal(isValidGlob('ubuntu-*'), true);
  });

  test('the Lucene form escapes reserved characters', () => {
    assert.equal(globToLuceneRegexp('ubuntu-2?.*'), 'ubuntu-2[^/]\\.[^/]*');
  });
});

describe('profile validation mirrors the engine', () => {
  test('the built-in profiles are valid', () => {
    for (const builtin of ENS_BUILTIN_PROFILES) assert.deepEqual(validateProfile(builtin), [], builtin.id);
  });

  test('reports id, layer, conditions and values', () => {
    const errors = validateProfile(
      profile({
        id: 'Web',
        layer: 'site-x',
        match: [
          { field: 'group', op: 'has', value: 'ens-perfil-otro' },
          { field: 'distro', op: 'has', value: 'x' },
          { field: 'colour', op: 'is', value: '' },
        ],
        values: { 'op.acc.1': { 'P-03': 7, 'P-99': [] }, 'op.nope': {} },
        replace: { 'op.acc.1': ['P-11'] },
      })
    );
    const text = errors.join('\n');
    assert.match(text, /identificador/);
    assert.match(text, /capa/);
    assert.match(text, /ens-perfil-/);
    assert.match(text, /distro admite is, is_not, matches/);
    assert.match(text, /campo «colour» no existe/);
    assert.match(text, /valor está vacío/);
    assert.match(text, /op.nope no existe/);
    assert.match(text, /P-99 no existe/);
    assert.match(text, /op.acc.1 P-03: debe ser una lista/);
    assert.match(text, /replace op.acc.1 P-11/);
  });

  test('refuses organisation parameters', () => {
    const organisationParam = Object.entries<any>(require('../../common/ens/catalog/engine/op.acc.1.json').parameters).find(
      ([, p]) => p.class === 'organisation'
    )![0];
    const errors = validateProfile(profile({ values: { 'op.acc.1': { [organisationParam]: [] } } }));
    assert.match(errors.join(), /toda la organización/);
  });

  test('a regex value must be one non-empty text', () => {
    const errors = validateProfile(profile({ values: { 'op.acc.1': { 'P-03': ['a'] } }, match_modes: { 'op.acc.1': { 'P-03': 'regex' } } }));
    assert.match(errors.join(), /expresión regular/);
  });
});

describe('matching a host', () => {
  test('all conditions must hold, case-insensitively', () => {
    assert.equal(profileMatchesHost(profile({ match: [{ field: 'service', op: 'has', value: 'NGINX' }, { field: 'role', op: 'is', value: 'server' }] }), facts()), true);
    assert.equal(profileMatchesHost(profile({ match: [{ field: 'role', op: 'is_not', value: 'server' }] }), facts()), false);
    assert.equal(profileMatchesHost(profile({ match: [{ field: 'group', op: 'has_not', value: 'ens' }] }), facts()), false);
    assert.equal(profileMatchesHost(profile({ match: [] }), facts()), false);
  });

  test('the agent name stands in for an empty hostname', () => {
    const f = hostFactsOf({ agent: { id: '001', name: 'db-01' }, services: [] });
    assert.equal(f.hostname, 'db-01');
  });

  test('matched profiles come most specific first', () => {
    const list = [profile({ id: 'b', layer: 'distro', match: [{ field: 'role', op: 'is', value: 'server' }] }), profile({ id: 'a', layer: 'site', match: [{ field: 'role', op: 'is', value: 'server' }] })];
    assert.deepEqual(matchedProfiles(list, facts()).map(p => p.id), ['a', 'b']);
  });

  test('the indexer query covers a missing field when the pattern matches nothing', () => {
    const query = JSON.stringify(profileQuery({ match: [{ field: 'distro', op: 'matches', value: '*' }] }));
    assert.match(query, /must_not.*exists.*distro/);
    const hostname = JSON.stringify(profileQuery({ match: [{ field: 'hostname', op: 'is', value: 'web-01' }] }));
    assert.match(hostname, /agent\.name/);
  });
});

describe('built-in and stored profiles', () => {
  test('a stored profile replaces the built-in one with the same id', () => {
    const replacement = { ...ENS_BUILTIN_PROFILES[0], name: 'Propio' };
    const listed = listProfiles([{ profile: replacement, version: { seqNo: 1, primaryTerm: 1 } }]);
    const effective = effectiveProfiles(listed);
    assert.equal(effective.filter(p => p.id === replacement.id).length, 1);
    assert.equal(effective.find(p => p.id === replacement.id)!.name, 'Propio');
    assert.equal(listed.find(e => e.profile.id === replacement.id)!.origin, 'override');
  });

  test('an invalid stored profile is left out and the built-in stays', () => {
    const broken = { ...ENS_BUILTIN_PROFILES[0], match: [] };
    const listed = listProfiles([{ profile: broken }]);
    assert.equal(listed.filter(e => e.profile.id === broken.id).length, 2);
    assert.equal(effectiveProfiles(listed).find(p => p.id === broken.id)!.name, ENS_BUILTIN_PROFILES[0].name);
  });
});
