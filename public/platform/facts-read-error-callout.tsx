import React from 'react';
import { EuiCallOut } from '@elastic/eui';
import { FACTS_READ_ERROR_TITLE, factsReadErrorText } from './facts-read-error';

// En lugar de los números: los de la búsqueda anterior no valen como de ahora.
// Las pantallas con refresco automático vuelven solas con la primera búsqueda
// que salga bien.
export const FactsReadErrorCallOut = ({ error }: { error: unknown }) => (
  <EuiCallOut color="danger" iconType="alert" title={FACTS_READ_ERROR_TITLE}>
    <p>{factsReadErrorText(error)}</p>
  </EuiCallOut>
);
