// Una fila del catálogo.
//
// DESDE 1.2.0 LA FILA NO CONSULTA NADA. Hasta 1.1.0 cada fila pedía los
// 10.000 hechos más recientes de su control y lo evaluaba en el navegador: 23
// búsquedas a la vez, 170 MB de JSON en el laboratorio, y la pestaña colgada.
// Ahora la lista pide UNA vez el resumen de todos los controles al servidor,
// que evalúa cada control con TODOS sus hechos de la ventana (sin tope), y la
// fila solo lo pinta. La fila y la ficha siguen juzgando el mismo conjunto: el
// servidor usa la misma evaluación para las dos.
//
// Y LA FILA NO DESAPARECE: un control que no se mide en la máquina elegida sale
// al final, en gris, con el motivo y sin número; uno que no está en la
// configuración activa lo dice y ofrece añadirlo (`controls-list-model.ts`).
import React from 'react';
import { EuiBadge, EuiFacetButton, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText, EuiToolTip } from '@elastic/eui';
import { EVALUATION_ERROR_TITLE, evaluationErrorText } from '../../platform/facts-read-error';
import type { ENSControlSummaryEntry } from '../../../common/ens/evaluation/types';
import type { ENSControlListEntry, ENSMachineTally } from './controls-list-model';
import { describeTally } from './controls-list-model';
import { AddControlWithDefaultsButton, NOT_IN_CONFIGURATION_TEXT } from './add-control-button';

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
  entry: ENSControlListEntry;
  isLoading: boolean;
  error?: Error;
  colorDelEstado: (estado: string) => string;
  badgeDelEstado: (estado: string) => string;
  onSelect: () => void;
  onConfigurationChanged?: () => void;
}

// La barra de máquinas de un control: un tramo por estado, del ancho de su
// recuento. Solo con todas las máquinas a la vista.
export const MachineTallyBar = ({ tally, colorDelEstado }: { tally: ENSMachineTally; colorDelEstado: (estado: string) => string }) => {
  const tramos = [
    { estado: 'CUMPLE', n: tally.cumple },
    { estado: 'PARCIAL', n: tally.parcial },
    { estado: 'NO_CUMPLE', n: tally.noCumple },
    { estado: 'NO_EVALUABLE', n: tally.sinDatos },
    { estado: 'NO_APLICA', n: tally.noAplica },
  ].filter(tramo => tramo.n > 0);
  return (
    <EuiToolTip content={describeTally(tally)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
        <span style={{ display: 'inline-flex', width: 96, height: 8, borderRadius: 4, overflow: 'hidden', background: '#EEF2F7' }}>
          {tramos.map(tramo => (
            <span
              key={tramo.estado}
              style={{
                width: `${(tramo.n / tally.total) * 100}%`,
                background: tramo.estado === 'NO_EVALUABLE' ? '#D3DAE6' : colorDelEstado(tramo.estado),
              }}
            />
          ))}
        </span>
        <span style={{ fontSize: 12, color: '#69707D' }}>{describeTally(tally)}</span>
      </span>
    </EuiToolTip>
  );
};

export const ControlRow = ({ entry, isLoading, error, colorDelEstado, badgeDelEstado, onSelect, onConfigurationChanged }: ControlRowProps) => {
  const { id: controlId, title, levels, summary } = entry;
  const accion = !entry.configured ? (
    <EuiFlexItem grow={false}>
      <AddControlWithDefaultsButton controlId={controlId} onAdded={onConfigurationChanged} />
    </EuiFlexItem>
  ) : null;
  const sinConfigurar = !entry.configured ? (
    <EuiBadge color='warning' iconType='gear' style={{ marginLeft: 6 }}>
      {NOT_IN_CONFIGURATION_TEXT}
    </EuiBadge>
  ) : null;

  const fila = (contenido: React.ReactNode) => (
    <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} style={{ marginBottom: 8 }}>
      <EuiFlexItem>{contenido}</EuiFlexItem>
      {accion}
    </EuiFlexGroup>
  );

  // NO SE MIDE EN ESTA MÁQUINA: al final, en gris, con el motivo. Sin número:
  // no es un cumplimiento ni un incumplimiento.
  if (entry.notMeasured) {
    return fila(
      <EuiFacetButton isSelected={false} onClick={onSelect} style={{ borderLeft: '4px dashed #D3DAE6', opacity: 0.7 }}>
        <strong>{controlId}</strong> — {title}
        <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
          {levels}
        </EuiBadge>
        <EuiBadge color='hollow' iconType='minusInCircle' style={{ marginLeft: 6 }} title={entry.notMeasured.text}>
          No se mide en esta máquina
        </EuiBadge>
        {sinConfigurar}
        <EuiText size='xs' color='subdued'>
          <span>{entry.notMeasured.text}</span>
        </EuiText>
      </EuiFacetButton>
    );
  }

  // Mientras llega el resumen de ESTA vista no se pinta ningún veredicto: el
  // de la máquina anterior no es el de esta.
  if (isLoading && !summary) {
    return fila(
      <EuiFacetButton isSelected={false} onClick={onSelect} style={{ borderLeft: '4px solid #D3DAE6' }}>
        <strong>{controlId}</strong> — {title}
        <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
          {levels}
        </EuiBadge>
        <span style={{ marginLeft: 8 }}>
          <EuiLoadingSpinner size='s' />
        </span>
        {sinConfigurar}
      </EuiFacetButton>
    );
  }

  // Sin los hechos de ahora, ni veredicto ni recuento: los de antes no valen.
  if (error) {
    return fila(
      <EuiFacetButton isSelected={false} onClick={onSelect} style={{ borderLeft: '4px solid #BD271E' }}>
        <strong>{controlId}</strong> — {title}
        <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
          {levels}
        </EuiBadge>
        <EuiBadge color='danger' title={evaluationErrorText(error)} style={{ marginLeft: 6 }}>
          {EVALUATION_ERROR_TITLE}
        </EuiBadge>
        {sinConfigurar}
      </EuiFacetButton>
    );
  }

  // Sin resultado no es que el control incumpla: es que no está en el catálogo
  // del motor. Ése es el único gris de esta pantalla.
  const estado = summary?.status || 'NO_EVALUABLE';
  const noConformidades = summary?.requirementsNotMet || 0;
  const sinDemostrar = summary?.requirementsNotEvidenced || 0;

  return fila(
    <EuiFacetButton
      quantity={noConformidades}
      isSelected={false}
      onClick={onSelect}
      style={{ borderLeft: `4px solid ${colorDelEstado(estado)}` }}
    >
      <strong>{controlId}</strong> — {title}
      <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
        {levels}
      </EuiBadge>
      <EuiBadge color={badgeDelEstado(estado)} style={{ marginLeft: 6 }}>
        {estado}
      </EuiBadge>
      {sinDemostrar > 0 && (
        <EuiBadge color='default' iconType='questionInCircle' style={{ marginLeft: 6 }}>
          {sinDemostrar} no evidenciada{sinDemostrar === 1 ? '' : 's'}
        </EuiBadge>
      )}
      {sinConfigurar}
      {entry.machines && <MachineTallyBar tally={entry.machines} colorDelEstado={colorDelEstado} />}
    </EuiFacetButton>
  );
};
