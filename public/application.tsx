import React from 'react';
import ReactDOM from 'react-dom';
import { Router } from 'react-router-dom';
import type { AppMountParameters, CoreStart } from '../../../src/core/public';
import type { EnsfacilStartDeps } from './types';
import { EnsApp } from './app/ens-app';

export const renderApp = (core: CoreStart, _deps: EnsfacilStartDeps, { element, history }: AppMountParameters) => {
  ReactDOM.render(
    <core.i18n.Context>
      <Router history={history}>
        <EnsApp />
      </Router>
    </core.i18n.Context>,
    element
  );

  return () => ReactDOM.unmountComponentAtNode(element);
};
