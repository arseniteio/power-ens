import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { handPickedHosts, isHandPicked, loadTemplate, newHandPickedGroup, setGroupValue, withHosts, withoutHosts } from '../../common/ens/profiles/groups';
import { matchedProfiles } from '../../common/ens/profiles/match';
import { validateProfile } from '../../common/ens/profiles/validate';

const facts = (hostname: string) => ({ distro: 'ubuntu-24', family: 'debian', role: 'server', hostname, services: [], groups: [] });

describe('groups', () => {
  test('a hand-picked group lists its machines and matches only them', () => {
    const group = newHandPickedGroup('contabilidad', 'Contabilidad', ['srv-01', ' srv-02 ']);
    assert.ok(isHandPicked(group));
    assert.deepEqual(handPickedHosts(group), ['srv-01', 'srv-02']);
    assert.deepEqual(validateProfile(group), []);
    assert.equal(matchedProfiles([group], facts('SRV-02')).length, 1);
    assert.equal(matchedProfiles([group], facts('srv-03')).length, 0);
  });

  test('machines are added once and removed by name', () => {
    const group = withHosts(newHandPickedGroup('g', 'G', ['a']), ['b', 'a']);
    assert.deepEqual(handPickedHosts(group), ['a', 'b']);
    assert.deepEqual(handPickedHosts(withoutHosts(group, ['A'])), ['b']);
  });

  test('loading a template copies its values and replaces the ones it also sets', () => {
    const group = { id: 'g', name: 'G', layer: 'distro', match: [], values: { 'op.acc.1': { 'P-11': ['wheel'], 'P-03': 'x' } }, match_modes: { 'op.acc.1': { 'P-03': 'regex' as const } } };
    const loaded = loadTemplate(group, { values: { 'op.acc.1': { 'P-11': ['sudo'] }, 'op.exp.8': { 'P-02': ['a'] } } });
    assert.deepEqual(loaded.values, { 'op.acc.1': { 'P-11': ['sudo'], 'P-03': 'x' }, 'op.exp.8': { 'P-02': ['a'] } });
    assert.deepEqual(loaded.match_modes, { 'op.acc.1': { 'P-03': 'regex' } });
  });

  test('a group value is set and cleared', () => {
    const group = { id: 'g', name: 'G', layer: 'distro', match: [], values: {} };
    const set = setGroupValue(group, 'op.acc.1', 'P-11', ['adm']);
    assert.deepEqual(set.values, { 'op.acc.1': { 'P-11': ['adm'] } });
    assert.deepEqual(setGroupValue(set, 'op.acc.1', 'P-11', undefined).values, {});
  });
});
