import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ENSCatalog } from '../../common/ens/catalog';
import { describeEvidenceGuide, describeRequirementGuide, getControlRelation } from '../../common/ens/catalog/guide';
import criteria from '../../common/ens/catalog/guide/template-criteria.json';
import relations from '../../common/ens/catalog/guide/control-relations.json';
import { engineCatalogEntry } from '../../common/ens/catalog/engine-catalog';

const THIRD_PARTY_MARK = new RegExp(['ens', 'f[aá]cil'].join('\\s*'), 'i');

describe('control guide', () => {
  test('every catalog control has a summary and its relation with Wazuh', () => {
    assert.equal(Object.keys(relations).length, ENSCatalog.length);
    for (const control of ENSCatalog) {
      const relation = getControlRelation(control.id);
      assert.ok(relation?.summary && relation.regulates && relation.wazuh && relation.powerEns, control.id);
    }
  });

  test('every requirement and evidence of the catalog resolves to an explanation', () => {
    for (const control of ENSCatalog) {
      for (const requirement of control.requirements) {
        const guide = describeRequirementGuide(control.id, requirement.id);
        assert.ok(guide?.normText, requirement.id);
        guide.evidences.forEach(evidence => assert.ok(evidence.title, `${requirement.id} ${evidence.id}`));
      }
      for (const evidence of engineCatalogEntry(control.id).evidences) {
        const guide = describeEvidenceGuide(control.id, evidence.id);
        assert.ok(guide?.measurement, `${control.id} ${evidence.id}`);
        guide.requirements.forEach(requirement => assert.ok(requirement.title, `${evidence.id} ${requirement.id}`));
      }
    }
  });

  test('template criteria only name evidences and requirements of the catalog', () => {
    for (const [controlId, control] of Object.entries(criteria as Record<string, any>)) {
      const entry = engineCatalogEntry(controlId);
      Object.keys(control.evidences).forEach(id => assert.ok(entry.evidences.some((e: any) => e.id === id), `${controlId} ${id}`));
      Object.keys(control.requirements).forEach(id => assert.ok(entry.requirements.some((r: any) => r.id === id), `${controlId} ${id}`));
    }
  });

  test('conditions of the whole control stay apart from those of the requirement', () => {
    const guide = describeRequirementGuide('op.acc.5', 'op.acc.5.8');
    assert.ok(guide?.controlConditions.some(condition => /solo contraseña/.test(condition.text)));
    assert.ok(guide?.conditions.every(condition => !/solo contraseña/.test(condition.text)));
  });

  test('conditions only link evidences of their control', () => {
    for (const control of ENSCatalog) {
      const ids = engineCatalogEntry(control.id).evidences.map((evidence: any) => evidence.id);
      for (const requirement of control.requirements) {
        const guide = describeRequirementGuide(control.id, requirement.id);
        [...(guide?.conditions || []), ...(guide?.controlConditions || [])].forEach(condition =>
          condition.evidences.forEach(id => assert.ok(ids.includes(id), `${requirement.id} ${id}`))
        );
      }
    }
  });

  test('no text carries the third-party trademark', () => {
    assert.doesNotMatch(JSON.stringify(relations), THIRD_PARTY_MARK);
    assert.doesNotMatch(JSON.stringify(criteria), THIRD_PARTY_MARK);
  });

  test('an evidence the template does not have is reported as own', () => {
    const guide = describeEvidenceGuide('op.exp.3', 'EV-11');
    assert.ok(guide?.measurement);
    assert.equal(guide?.proof, undefined);
  });

  test('mp.info.6 follows the correspondence with the template, not its numbering', () => {
    assert.match(describeEvidenceGuide('mp.info.6', 'EV-03')?.proof || '', /se conservan el tiempo/);
  });
});
