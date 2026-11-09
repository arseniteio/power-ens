import React from 'react';
import ReactDOM from 'react-dom';
import type { CoreStart } from '../../../../src/core/public';

import { createComplianceOption, OWN_ELEMENT_ATTRIBUTE, type ComplianceView } from './compliance-option';
import { findComplianceSelect, findSecurityOperationsGrid, findSlot } from './find-slot';
import { wazuhPageOf, type WazuhPage } from './wazuh-page';

interface Placement {
  name: string;
  hostClass?: string;
  hostMarginTop?: string;
  slotOf(page: WazuhPage, root: ParentNode): Element | undefined;
  load(page: WazuhPage): Promise<React.ReactElement>;
}

const SUMMARY_BLOCK: Placement = {
  name: 'summary-block',
  hostMarginTop: '12px',
  slotOf: findSlot,
  load: page => import('./power-ens-block').then(({ PowerEnsBlock }) => <PowerEnsBlock page={page} />),
};

const SECURITY_OPERATIONS_CARD: Placement = {
  name: 'security-operations-card',
  hostClass: 'euiFlexItem',
  slotOf: (page, root) => (page.kind === 'home' ? findSecurityOperationsGrid(root) : undefined),
  load: () => import('./security-operations-card').then(({ SecurityOperationsCard }) => <SecurityOperationsCard />),
};

const samePage = (a: WazuhPage | undefined, b: WazuhPage | undefined): boolean => JSON.stringify(a) === JSON.stringify(b);

const createPlacementSync = (core: CoreStart, placement: Placement) => {
  let host: HTMLElement | undefined;
  let hostPage: WazuhPage | undefined;

  const remove = () => {
    if (!host) return;
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    host = undefined;
    hostPage = undefined;
  };

  const createHost = (): HTMLElement => {
    const element = document.createElement('div');
    element.setAttribute(OWN_ELEMENT_ATTRIBUTE, placement.name);
    if (placement.hostClass) element.className = placement.hostClass;
    if (placement.hostMarginTop) element.style.marginTop = placement.hostMarginTop;
    return element;
  };

  return (page: WazuhPage | undefined): void => {
    if (!page) {
      remove();
      return;
    }

    if (host && (!host.isConnected || !samePage(page, hostPage))) {
      remove();
    }
    if (host) return;

    const slot = placement.slotOf(page, document.body);
    if (!slot) return;

    const target = createHost();
    host = target;
    hostPage = page;
    slot.appendChild(target);
    placement.load(page).then(element => {
      if (target !== host) return;
      ReactDOM.render(<core.i18n.Context>{element}</core.i18n.Context>, target);
    });
  };
};

const createComplianceView = (core: CoreStart): ComplianceView => ({
  show: (host, agentId) => {
    import('./compliance-ens-view').then(({ ComplianceEnsView }) => {
      if (!host.isConnected) return;
      ReactDOM.render(
        <core.i18n.Context>
          <ComplianceEnsView agentId={agentId} />
        </core.i18n.Context>,
        host
      );
    });
  },
  clear: host => {
    ReactDOM.unmountComponentAtNode(host);
  },
});

export const mountOnWazuhPages = (core: CoreStart): void => {
  let appId: string | undefined;
  const syncPlacements = [SUMMARY_BLOCK, SECURITY_OPERATIONS_CARD].map(placement => createPlacementSync(core, placement));
  const syncComplianceOption = createComplianceOption(createComplianceView(core));

  const place = () => {
    const page = wazuhPageOf(appId, window.location.hash);
    syncPlacements.forEach(sync => sync(page));
    syncComplianceOption(page, page?.kind === 'agent' ? findComplianceSelect(document.body) : undefined);
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      place();
    });
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  core.application.currentAppId$.subscribe(id => {
    appId = id;
    place();
  });
};
