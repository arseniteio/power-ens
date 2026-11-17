import React from 'react';
import ReactDOM from 'react-dom';
import { Router } from 'react-router-dom';
import type { AppMountParameters, CoreStart } from '../../../src/core/public';
import type { PowerEnsStartDeps } from './types';
import { EnsApp } from './app/ens-app';
import { SpanishEui } from './app/eui-spanish';

export const renderApp = (core: CoreStart, _deps: PowerEnsStartDeps, { element, history }: AppMountParameters) => {
  ReactDOM.render(
    <core.i18n.Context>
      <SpanishEui>
        <Router history={history}>
          <EnsApp />
        </Router>
      </SpanishEui>
    </core.i18n.Context>,
    element
  );

  return () => ReactDOM.unmountComponentAtNode(element);
};
