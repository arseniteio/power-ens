import type { WazuhPage } from './wazuh-page';

export const OWN_ELEMENT_ATTRIBUTE = 'data-power-ens';
export const OWN_ELEMENT_SELECTOR = `[${OWN_ELEMENT_ATTRIBUTE}]`;

const OPTION_VALUE = 'power-ens';
const OPTION_LABEL = 'ENS';
const WIDGET_CONTROLS = ['embPanel__header', 'euiSpacer'];

export interface ComplianceView {
  show(host: HTMLElement, agentId: string): void;
  clear(host: HTMLElement): void;
}

interface Attachment {
  select: HTMLSelectElement;
  option: HTMLOptionElement;
  onChange(event: Event): void;
  host?: HTMLElement;
  agentId?: string;
}

const isWazuhContent = (element: Element): boolean =>
  !element.hasAttribute(OWN_ELEMENT_ATTRIBUTE) && !WIDGET_CONTROLS.some(name => element.classList.contains(name));

const setWazuhContentHidden = (panel: Element, hidden: boolean): void => {
  Array.from(panel.children)
    .filter(isWazuhContent)
    .forEach(element => {
      const { style } = element as HTMLElement;
      if (hidden) style.display = 'none';
      else style.removeProperty('display');
    });
};

export const createComplianceOption = (view: ComplianceView) => {
  let attachment: Attachment | undefined;

  const deactivate = (current: Attachment) => {
    if (!current.host) return;
    view.clear(current.host);
    current.host.remove();
    current.host = undefined;
    const panel = current.select.closest('.euiPanel');
    if (panel) setWazuhContentHidden(panel, false);
  };

  const activate = (current: Attachment, agentId: string) => {
    const panel = current.select.closest('.euiPanel');
    if (!panel || current.host) return;
    const host = current.select.ownerDocument.createElement('div');
    host.setAttribute(OWN_ELEMENT_ATTRIBUTE, 'compliance-view');
    panel.insertBefore(host, panel.querySelector(OWN_ELEMENT_SELECTOR));
    current.host = host;
    current.agentId = agentId;
    view.show(host, agentId);
    setWazuhContentHidden(panel, true);
  };

  const attach = (select: HTMLSelectElement, agentId: string): Attachment => {
    const option = select.ownerDocument.createElement('option');
    option.value = OPTION_VALUE;
    option.text = OPTION_LABEL;
    select.appendChild(option);

    const current: Attachment = {
      select,
      option,
      agentId,
      // Wazuh would query rule.power-ens with this value, so React must never see the change.
      onChange: event => {
        if (select.value !== OPTION_VALUE) {
          deactivate(current);
          return;
        }
        event.stopPropagation();
        activate(current, current.agentId as string);
      },
    };
    select.addEventListener('change', current.onChange, true);
    return current;
  };

  const detach = () => {
    if (!attachment) return;
    deactivate(attachment);
    attachment.select.removeEventListener('change', attachment.onChange, true);
    attachment.option.remove();
    attachment = undefined;
  };

  // React resets the value of a controlled select and may replace the chart on every render.
  const keepActive = (current: Attachment, agentId: string) => {
    if (!current.host) {
      current.agentId = agentId;
      return;
    }
    if (current.select.value !== OPTION_VALUE) current.select.value = OPTION_VALUE;
    if (current.agentId !== agentId) {
      current.agentId = agentId;
      view.show(current.host, agentId);
    }
    const panel = current.select.closest('.euiPanel');
    if (panel) setWazuhContentHidden(panel, true);
  };

  return (page: WazuhPage | undefined, select: HTMLSelectElement | undefined): void => {
    if (page?.kind !== 'agent' || !select || attachment?.select !== select) detach();
    if (page?.kind !== 'agent' || !select) return;

    attachment = attachment || attach(select, page.agentId);
    keepActive(attachment, page.agentId);
  };
};
