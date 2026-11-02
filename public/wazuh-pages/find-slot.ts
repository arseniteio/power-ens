import type { WazuhPage } from './wazuh-page';

const textIs = (element: Element, text: string): boolean => element.textContent?.trim() === text;

const findByText = (root: ParentNode, selector: string, text: string): Element | undefined =>
  Array.from(root.querySelectorAll(selector)).find(element => textIs(element, text));

const agentComplianceSlot = (root: ParentNode): Element | null | undefined =>
  findByText(root, 'h1, h2, h3, h4', 'Compliance')?.closest('.euiPanel');

const homeSlot = (root: ParentNode): Element | null | undefined =>
  findByText(root, '.euiBetaBadge', 'Agents summary')?.closest('.euiFlexGroup')?.parentElement;

// Wazuh offers no extension point on these pages: the slot is found by what they show, and a page that changes only leaves the block out.
export const findSlot = (page: WazuhPage, root: ParentNode): Element | undefined =>
  (page.kind === 'agent' ? agentComplianceSlot(root) : homeSlot(root)) || undefined;
