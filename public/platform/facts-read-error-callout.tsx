import React from 'react';
import { EuiButton, EuiCallOut, EuiSpacer } from '@elastic/eui';
import {
  EVALUATION_ERROR_TITLE,
  evaluationErrorText,
  FACTS_READ_ERROR_TITLE,
  factsReadErrorText,
} from './facts-read-error';

export const FactsReadErrorCallOut = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) =>
  onRetry ? (
    <EuiCallOut color="danger" iconType="alert" title={EVALUATION_ERROR_TITLE}>
      <p>{evaluationErrorText(error)}</p>
      <EuiSpacer size="s" />
      <EuiButton size="s" color="danger" iconType="refresh" onClick={onRetry}>
        Reintentar
      </EuiButton>
    </EuiCallOut>
  ) : (
    <EuiCallOut color="danger" iconType="alert" title={FACTS_READ_ERROR_TITLE}>
      <p>{factsReadErrorText(error)}</p>
    </EuiCallOut>
  );
