// Una fila del catálogo, con SU PROPIA consulta al índice.
//
// POR QUÉ UNA CONSULTA POR CONTROL Y NO UNA PARA TODOS.
//
// El listado hacía UNA búsqueda de 10.000 hechos para los cinco controles y
// evaluaba los cinco sobre ese mismo montón. Como los hechos vienen ordenados
// por fecha descendente y op.acc.3 emite casi veinte mil en la ventana, los
// 10.000 más recientes eran casi todos suyos: op.acc.2 se quedaba con las
// migajas y el motor, viendo cuatro hechos, lo declaraba PARCIAL.
//
// Y a diez centímetros, su ficha —que sí pide 10.000 para ese control solo—
// decía 100 % CUMPLE. Dos pantallas del mismo producto dando veredictos
// distintos del mismo control, sin que nada avisara de cuál creer.
//
// Un control con mucho volumen no puede robarle la medida a los demás. Cada
// fila pide lo suyo, que es exactamente lo que hace la ficha, así que las dos
// pantallas ven el mismo conjunto y no pueden discrepar.
//
// El coste son cinco búsquedas en vez de una. Es el precio de que el semáforo
// diga la verdad, y un semáforo que miente no vale nada.
import React, { useMemo } from 'react';
import { EuiBadge, EuiFacetButton } from '@elastic/eui';
import { useEsSearch } from '../../../common/hooks/use-es-search';
import {
  buildENSEvaluationTimeRangeFilter,
  getENSComplianceResultByControl,
  normalizeWazuhAlerts,
} from '../core';
import { ENSAgentScope } from '../core/scope/types';
import { ENSLevel } from '../configuration/types';

export interface ControlRowData {
  id: string;
  title: string;
  levels: string;
  status: string;
  alerts: number;
  pending: number;
}

interface ControlRowProps {
  controlId: string;
  title: string;
  levels: string;
  ensLevel: ENSLevel;
  evaluationPeriod: string;
  agentId?: string;
  scopeAgents: ENSAgentScope[];
  scopeFilter: unknown;
  colorDelEstado: (estado: string) => string;
  badgeDelEstado: (estado: string) => string;
  onSelect: () => void;
}

export const ControlRow = ({
  controlId,
  title,
  levels,
  ensLevel,
  evaluationPeriod,
  agentId,
  scopeAgents,
  scopeFilter,
  colorDelEstado,
  badgeDelEstado,
  onSelect,
}: ControlRowProps) => {
  const { esResults } = useEsSearch({
    preAppliedFilters: [
      buildENSEvaluationTimeRangeFilter(evaluationPeriod),
      scopeFilter,
      {
        bool: {
          should: [
            { match_phrase: { 'data.ensfacil': controlId } },
            { match_phrase: { 'data.control': controlId } },
          ],
          minimum_should_match: 1,
        },
      },
    ],
    // Los 10.000 MÁS RECIENTES, como el detalle del control: sin orden, el
    // índice devuelve primero los más antiguos y la fila juzgaría el principio
    // de la ventana en vez del estado actual.
    size: 10000,
    sorting: [{ timestamp: { order: 'desc' } }],
  });

  const hits = esResults?.hits?.hits || [];

  const normalizedEvents = useMemo(
    () => normalizeWazuhAlerts(hits),
    [hits],
  );

  const resultado = useMemo(
    () =>
      getENSComplianceResultByControl(
        controlId,
        ensLevel,
        normalizedEvents,
        agentId,
        scopeAgents,
      ),
    [controlId, ensLevel, normalizedEvents, agentId, scopeAgents],
  );

  // Sin resultado no es que el control incumpla: es que no está en el catálogo
  // del motor. Ése es el único gris de esta pantalla.
  const estado = resultado?.status || 'NO_EVALUABLE';

  const noConformidades = (resultado?.requirements || []).filter(
    requisito =>
      requisito.applicable && requisito.status !== 'CUMPLE'
  ).length;

  const sinDemostrar = (resultado?.requirements || []).filter(
    requisito =>
      requisito.applicable &&
      requisito.status !== 'CUMPLE' &&
      (requisito as { evidenced?: boolean }).evidenced === false
  ).length;

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
