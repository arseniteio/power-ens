// Una fila del catálogo.
//
// DESDE 1.2.0 LA FILA NO CONSULTA NADA. Hasta 1.1.0 cada fila pedía los
// 10.000 hechos más recientes de su control y lo evaluaba en el navegador: 23
// búsquedas a la vez, 170 MB de JSON en el laboratorio, y la pestaña colgada.
// Ahora la lista pide UNA vez el resumen de todos los controles al servidor,
// que evalúa cada control con TODOS sus hechos de la ventana (sin tope), y la
// fila solo lo pinta. La fila y la ficha siguen juzgando el mismo conjunto: el
// servidor usa la misma evaluación para las dos.
import React from 'react';
import { EuiBadge, EuiFacetButton } from '@elastic/eui';
import { EVALUATION_ERROR_TITLE, evaluationErrorText } from '../../platform/facts-read-error';
import type { ENSControlSummaryEntry } from '../../../common/ens/evaluation/types';
import { controlRowWaitLabel } from './control-row-state';

export interface ControlRowData {
  id: string;
  title: string;
  levels: string;
  status: string;
  alerts: number;
  pending: number;
}

// Lo que el servidor dice de un control (`include=summary`).
export type ControlRowSummary = ENSControlSummaryEntry;


interface ControlRowProps {
  controlId: string;
  title: string;
  levels: string;
  summary?: ControlRowSummary;
  isLoading: boolean;
  error?: Error;
  colorDelEstado: (estado: string) => string;
  badgeDelEstado: (estado: string) => string;
  onSelect: () => void;
}

export const ControlRow = ({
  controlId,
  title,
  levels,
  summary,
  isLoading,
  error,
  colorDelEstado,
  badgeDelEstado,
  onSelect,
}: ControlRowProps) => {
  // Sin resultado no es que el control incumpla: es que no está en el catálogo
  // del motor. Ése es el único gris de esta pantalla.
  const estado = summary?.status || 'NO_EVALUABLE';
  const noConformidades = summary?.requirementsNotMet || 0;
  const sinDemostrar = summary?.requirementsNotEvidenced || 0;

  // Mientras llega el resumen de ESTA vista no se pinta ningún veredicto: el
  // de la máquina anterior no es el de esta. Tampoco el de un control que aún
  // se está calculando.
  const espera = error ? undefined : controlRowWaitLabel(isLoading, summary);
  if (espera) {
    return (
      <EuiFacetButton
        isSelected={false}
        onClick={onSelect}
        style={{ borderLeft: '4px solid #D3DAE6', marginBottom: 8 }}
      >
        <strong>{controlId}</strong> — {title}
        <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
          {levels}
        </EuiBadge>
        <EuiBadge color='default' iconType='clock' style={{ marginLeft: 6 }}>
          {espera}
        </EuiBadge>
      </EuiFacetButton>
    );
  }

  // Sin los hechos de ahora, ni veredicto ni recuento: los de antes no valen.
  if (error) {
    return (
      <EuiFacetButton
        isSelected={false}
        onClick={onSelect}
        style={{ borderLeft: '4px solid #BD271E', marginBottom: 8 }}
      >
        <strong>{controlId}</strong> — {title}
        <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
          {levels}
        </EuiBadge>
        <EuiBadge color='danger' title={evaluationErrorText(error)} style={{ marginLeft: 6 }}>
          {EVALUATION_ERROR_TITLE}
        </EuiBadge>
      </EuiFacetButton>
    );
  }

  return (
    <EuiFacetButton
      quantity={noConformidades}
      isSelected={false}
      onClick={onSelect}
      style={{
        borderLeft: `4px solid ${colorDelEstado(estado)}`,
        marginBottom: 8,
      }}
    >
      <strong>{controlId}</strong> — {title}
      <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
        {levels}
      </EuiBadge>
      <EuiBadge
        color={badgeDelEstado(estado)}
        style={{ marginLeft: 6 }}
      >
        {estado}
      </EuiBadge>
      {sinDemostrar > 0 && (
        <EuiBadge
          color='default'
          iconType='questionInCircle'
          style={{ marginLeft: 6 }}
        >
          {sinDemostrar} no evidenciada{sinDemostrar === 1 ? '' : 's'}
        </EuiBadge>
      )}
    </EuiFacetButton>
  );
};
