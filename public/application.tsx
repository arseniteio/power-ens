import React from 'react';
import ReactDOM from 'react-dom';
import { EuiPage, EuiPageBody, EuiText } from '@elastic/eui';
import type { AppMountParameters, CoreStart } from '../../../src/core/public';
import type { EnsfacilStartDeps } from './types';

export const renderApp = (
  core: CoreStart,
  _deps: EnsfacilStartDeps,
  { element }: AppMountParameters
) => {
  ReactDOM.render(
    <core.i18n.Context>
      <EuiPage>
        <EuiPageBody>
          <EuiText>
            <p>ENSFácil</p>
          </EuiText>
        </EuiPageBody>
      </EuiPage>
    </core.i18n.Context>,
    element
  );

  return () => ReactDOM.unmountComponentAtNode(element);
};
