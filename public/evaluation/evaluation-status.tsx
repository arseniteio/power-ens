import React from 'react';
import { EuiBadge, EuiButtonEmpty, EuiCallOut, EuiText } from '@elastic/eui';
import { LoadingSpinner } from '../platform/loading-spinner';
import type { ENSEvaluationMeta } from '../../common/ens/evaluation/types';
import { dateTimeLabel } from '../../common/ens/core/date-label';

// The first evaluation of the day reads the whole window on the server (20-30 s): saying so avoids a page reload, which would restart it.
export const EvaluationLoading = ({ message }: { message: string }) => (
  <LoadingSpinner message={`${message} La primera vez puede tardar hasta un minuto.`} />
);

const hour = (iso?: string) => dateTimeLabel(iso) || undefined;

export const EvaluationStatusLine = ({
  meta,
  refreshing,
  onRetry,
  label,
}: {
  meta?: ENSEvaluationMeta;
  refreshing?: boolean;
  onRetry?: () => void;
  label?: string;
}) => {
  if (!meta) return null;
  if (meta.refreshError) {
    const retrying = Boolean(refreshing);
    return (
      <EuiCallOut
        size="s"
        color="warning"
        iconType={retrying ? 'clock' : 'alert'}
        title={
          retrying
            ? `${label ? `${label}: r` : 'R'}eintentando la actualización…`
            : label
            ? `${label}: no se pudo actualizar`
            : 'No se pudo actualizar la evaluación'
        }
      >
        <p>
          {meta.refreshError.message} (a las {hour(meta.refreshError.at) || '—'}). Se muestra el resultado calculado el{' '}
          {hour(meta.computedAt) || '—'}.
        </p>
        {onRetry && !retrying ? (
          <EuiButtonEmpty size="xs" iconType="refresh" onClick={onRetry}>
            Reintentar
          </EuiButtonEmpty>
        ) : null}
      </EuiCallOut>
    );
  }
  const updating = Boolean(meta.refreshing || refreshing);
  return (
    <EuiText size="xs" color="subdued">
      <p>
        {label ? `${label}: ` : ''}
        {updating ? 'Actualizando. Calculado el' : 'Resultados actualizados. Comprobado el'} {hour(meta.computedAt) || hour(meta.evaluatedAt) || '—'} con
        todos los hechos de la ventana.{' '}
        {updating ? (
          <EuiBadge color="warning" iconType="clock">
            {meta.pending
              ? `Calculando: ${meta.pending.total - meta.pending.rows} de ${meta.pending.total} filas listas…`
              : meta.seriesPending
              ? 'Calculando la evolución…'
              : 'Actualizando…'}
          </EuiBadge>
        ) : null}
      </p>
    </EuiText>
  );
};
