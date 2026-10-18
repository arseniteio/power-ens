// Lo que enseñan las pantallas mientras llega la evaluación y cuando lo que se
// ve es algo guardado que el servidor está recalculando.
import React from 'react';
import { EuiBadge, EuiText } from '@elastic/eui';
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

// «Calculado el …» y, si se está recalculando, «Actualizando…».
export const EvaluationStatusLine = ({ meta, refreshing }: { meta?: ENSEvaluationMeta; refreshing?: boolean }) => {
  if (!meta) return null;
  const actualizando = Boolean(meta.refreshing || refreshing);
  return (
    <EuiText size="xs" color="subdued">
      <p>
        Resultado calculado el {hora(meta.computedAt) || hora(meta.evaluatedAt) || '—'} con todos los hechos de la
        ventana.{' '}
        {actualizando ? (
          <EuiBadge color="warning" iconType="clock">
            Actualizando…
          </EuiBadge>
        ) : null}
      </p>
    </EuiText>
  );
};
