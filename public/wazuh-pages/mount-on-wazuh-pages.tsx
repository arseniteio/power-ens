import React from 'react';
import ReactDOM from 'react-dom';
import type { CoreStart } from '../../../../src/core/public';

import { findSlot } from './find-slot';
import { wazuhPageOf, type WazuhPage } from './wazuh-page';

const samePage = (a: WazuhPage | undefined, b: WazuhPage | undefined): boolean => JSON.stringify(a) === JSON.stringify(b);

// Renders the block inside Wazuh's own pages and follows their navigation; it never touches what Wazuh renders.
export const mountOnWazuhPages = (core: CoreStart): void => {
  let appId: string | undefined;
  let host: HTMLElement | undefined;
  let hostPage: WazuhPage | undefined;

  const remove = () => {
    if (!host) return;
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    host = undefined;
    hostPage = undefined;
  };

  const place = () => {
    const page = wazuhPageOf(appId, window.location.hash);
    if (!page) {
      remove();
      return;
    }

    if (host && (!host.isConnected || !samePage(page, hostPage))) {
      remove();
    }
    if (host) return;

    const slot = findSlot(page, document.body);
    if (!slot) return;

    host = document.createElement('div');
    host.style.marginTop = '12px';
    hostPage = page;
    slot.appendChild(host);
    const target = host;
    import('./power-ens-block').then(({ PowerEnsBlock }) => {
      if (target !== host) return;
      ReactDOM.render(
        <core.i18n.Context>
          <PowerEnsBlock page={page} />
        </core.i18n.Context>,
        target
      );
    });
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
