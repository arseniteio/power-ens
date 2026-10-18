// Lo que enseñan las pantallas mientras llega la evaluación y cuando lo que se
// ve es algo guardado que el servidor está recalculando.
import React from 'react';
import { EuiBadge, EuiButtonEmpty, EuiCallOut, EuiText } from '@elastic/eui';
import { LoadingSpinner } from '../platform/loading-spinner';
import type { ENSEvaluationMeta } from '../../common/ens/evaluation/types';

// La primera evaluación del día lee la ventana entera en el servidor (en el
// laboratorio, 20-30 s): decirlo evita que se recargue la página, que la
// empezaría de nuevo.
export const EvaluationLoading = ({ message }: { message: string }) => (
  <LoadingSpinner message={`${message} La primera vez puede tardar hasta un minuto.`} />
);

const hora = (iso?: string) => {
  const d = iso ? new Date(iso) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-ES') : undefined;
};

// «Calculado el …» y, si se está recalculando, «Actualizando…». Si el
// refresco en segundo plano falló, el motivo, a la vista y con «Reintentar»:
// lo que se enseña es el último resultado bueno.
export const EvaluationStatusLine = ({
  meta,
  refreshing,
  onRetry,
  label,
}: {
  meta?: ENSEvaluationMeta;
  refreshing?: boolean;
  onRetry?: () => void;
  // De qué es la línea, si hay más de una (el panorama de un informe).
  label?: string;
}) => {
  if (!meta) return null;
  if (meta.refreshError) {
    return (
      <EuiCallOut
        size="s"
        color="warning"
        iconType="alert"
        title={label ? `${label}: no se pudo actualizar` : 'No se pudo actualizar la evaluación'}
      >
        <p>
          {meta.refreshError.message} (a las {hora(meta.refreshError.at) || '—'}). Se muestra el resultado calculado el{' '}
          {hora(meta.computedAt) || '—'}.
        </p>
        {onRetry ? (
          <EuiButtonEmpty size="xs" iconType="refresh" onClick={onRetry}>
            Reintentar
          </EuiButtonEmpty>
        ) : null}
      </EuiCallOut>
    );
  }
  const actualizando = Boolean(meta.refreshing || refreshing);
  return (
    <EuiText size="xs" color="subdued">
      <p>
        {label ? `${label}: ` : ''}Resultado calculado el {hora(meta.computedAt) || hora(meta.evaluatedAt) || '—'} con todos los hechos de la
        ventana.{' '}
        {actualizando ? (
          <EuiBadge color="warning" iconType="clock">
            {meta.timelinePending && !meta.refreshError ? 'Calculando la evolución…' : 'Actualizando…'}
          </EuiBadge>
        ) : null}
      </p>
    </EuiText>
  );
};
