import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createComplianceOption } from '../../public/wazuh-pages/compliance-option';

class FakeElement {
  children: FakeElement[] = [];
  parent?: FakeElement;
  attributes = new Map<string, string>();
  style = { display: '', removeProperty: (_: string) => { this.style.display = ''; } };
  classList = { contains: (name: string) => this.classes.includes(name) };
  listeners = new Map<string, (event: unknown) => void>();
  value = 'pci_dss';
  text = '';
  ownerDocument = { createElement: () => new FakeElement() };

  constructor(public classes: string[] = []) {}

  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
  }
  insertBefore(child: FakeElement, before: FakeElement | null) {
    child.parent = this;
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, child);
  }
  remove() {
    this.parent!.children = this.parent!.children.filter(child => child !== this);
  }
  closest() {
    return this.parent;
  }
  querySelector() {
    return this.children.find(child => child.hasAttribute('data-power-ens')) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, listener);
  }
  removeEventListener(type: string) {
    this.listeners.delete(type);
  }
}

const AGENT = { kind: 'agent', agentId: '001' } as const;

describe('compliance option', () => {
  let panel: FakeElement;
  let select: FakeElement;
  let chart: FakeElement;
  let shown: string[];
  let cleared: number;
  let sync: ReturnType<typeof createComplianceOption>;

  const syncAgent = (page: typeof AGENT | { kind: 'agent'; agentId: string } = AGENT) => sync(page, select as never);

  const choose = (value: string) => {
    select.value = value;
    let propagationStopped = false;
    select.listeners.get('change')!({ stopPropagation: () => { propagationStopped = true; } });
    return propagationStopped;
  };

  beforeEach(() => {
    panel = new FakeElement(['euiPanel']);
    select = new FakeElement();
    chart = new FakeElement();
    panel.appendChild(select);
    select.classes = ['embPanel__header'];
    panel.appendChild(chart);
    shown = [];
    cleared = 0;
    sync = createComplianceOption({ show: (_, agentId) => shown.push(agentId), clear: () => { cleared += 1; } });
  });

  test('adds a single ENS option however many times it syncs', () => {
    syncAgent();
    syncAgent();

    assert.deepEqual(select.children.map(option => option.text), ['ENS']);
  });

  test('choosing ENS hides the Wazuh chart from the Wazuh handler and shows the verdicts', () => {
    syncAgent();

    assert.equal(choose('power-ens'), true);
    assert.equal(chart.style.display, 'none');
    assert.deepEqual(shown, ['001']);
  });

  test('choosing another framework restores the Wazuh chart and reaches Wazuh', () => {
    syncAgent();
    choose('power-ens');

    assert.equal(choose('gdpr'), false);
    assert.equal(chart.style.display, '');
    assert.equal(cleared, 1);
  });

  test('keeps ENS selected and the chart hidden after Wazuh renders again', () => {
    syncAgent();
    choose('power-ens');
    select.value = 'pci_dss';
    const replacedChart = new FakeElement();
    panel.insertBefore(replacedChart, panel.children[1]);

    syncAgent();

    assert.equal(select.value, 'power-ens');
    assert.equal(replacedChart.style.display, 'none');
  });

  test('shows the new machine when the agent changes while ENS is selected', () => {
    syncAgent();
    choose('power-ens');

    syncAgent({ kind: 'agent', agentId: '002' });

    assert.deepEqual(shown, ['001', '002']);
  });

  test('leaves Wazuh as it found it when leaving the agent page', () => {
    syncAgent();
    choose('power-ens');

    sync({ kind: 'home' }, undefined);

    assert.deepEqual(select.children, []);
    assert.equal(chart.style.display, '');
    assert.equal(select.listeners.size, 0);
  });
});
