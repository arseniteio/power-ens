import React, { useEffect, useMemo, useState } from 'react';
import { useRouterSearch } from '../../../common/hooks';
import { useEsSearch } from '../../../common/hooks/use-es-search';
import {
  EuiBadge,
  EuiBasicTable,
  EuiFacetButton,
  EuiFacetGroup,
  EuiButtonEmpty,
  EuiHealth,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENSControls } from '../data';
import { ENSControl } from '../types';
import { ControlDetailENS } from './control-detail';
import { getActiveENSConfiguration } from '../configuration/services';
import {
  buildENSEvaluationTimeRangeFilter,
  getENSComplianceResultByControl,
  normalizeWazuhAlerts,
} from '../core';
import {
  buildENSScopeAgentQueryFilter,
  getActiveENSScopeAgents,
} from '../core/scope';

export const ControlsENS = () => {
  const [selectedControl, setSelectedControl] = useState<ENSControl | null>(
    null,
  );

  const { control, agentId } = useRouterSearch();

  useEffect(() => {
    if (!control || selectedControl) {
      return;
    }

    const controlFromUrl = ENSControls.find(
      item => item.id === control,
    );

    if (controlFromUrl) {
      setSelectedControl(controlFromUrl);
    }
  }, [control, selectedControl]);

  const activeConfiguration = getActiveENSConfiguration();
  const ensLevel = activeConfiguration.global.ensLevel;
  const evaluationTimeFilter = buildENSEvaluationTimeRangeFilter(
    activeConfiguration.global.evaluationPeriod,
  );

   const scopeAgents =
     getActiveENSScopeAgents();

   const scopeAgentQueryFilter =
     buildENSScopeAgentQueryFilter(
       scopeAgents,
       agentId,
     );

   const ensControlIds = ENSControls.map(control => control.id);

   const { esResults } = useEsSearch({
     preAppliedFilters: [
       evaluationTimeFilter,
       scopeAgentQueryFilter,
       {
         bool: {
           should: ensControlIds.flatMap(controlId => [
             { match_phrase: { 'data.ensfacil': controlId } },
             { match_phrase: { 'data.control': controlId } },
           ]),
           minimum_should_match: 1,
         },
       },
     ],
     // Mismo tope que el detalle y que el panel: si el listado juzga sobre
     // menos hechos que la ficha del control, el semaforo de la lista y el
     // porcentaje de dentro pueden contradecirse.
     size: 10000,
  });
  const hits = esResults?.hits?.hits || [];

  const normalizedEvents = useMemo(
    () => normalizeWazuhAlerts(hits),
    [hits],
  );

  const complianceResultByControl = ENSControls.reduce((acc, ensControl) => {
    const result = getENSComplianceResultByControl(
      ensControl.id,
      ensLevel,
      normalizedEvents,
      agentId,
      scopeAgents,
    );

    if (result) {
      acc[ensControl.id] = result;
    }

    return acc;
  }, {} as Record<string, ReturnType<typeof getENSComplianceResultByControl>>);

  if (selectedControl) {
    return (
      <ControlDetailENS
        control={selectedControl}
        agentId={agentId}
        onBack={() => setSelectedControl(null)}
      />
    );
  }

  const items = ENSControls.map(control => ({
    control,
    id: control.id,
    title: control.title,
    levels: control.scope.activeLevels.join(', '),
    requirements: control.requirements.length,
    evidences: control.evidences.length,
    // Sin resultado no es que el control incumpla: es que no está en el
    // catálogo del motor. Ése es el único gris que queda en esta pantalla.
    status: complianceResultByControl[control.id]?.status || 'NO_EVALUABLE',
    // TODAS las no conformidades, un solo número. Desde el 04/08 lo que no se
    // ha podido demostrar cuenta igual que lo demostrado: partir el contador
    // era lo que permitía leer una mitad como «esto no cuenta».
    alerts: complianceResultByControl[control.id]?.nonConformities.length || 0,
    // Cuántas de ésas lo son por falta de prueba. No es otro contador de
    // hallazgos: es el desglose del mismo, y sirve para saber qué acción toca.
    pending:
      complianceResultByControl[control.id]?.nonConformities.filter(
        nonConformity => nonConformity.origin === 'NO_EVIDENCIADA',
      ).length || 0,
    hasData: !!complianceResultByControl[control.id],
  }));

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel>
        <EuiTitle size='m'>
          <h2>ENS Controls</h2>
        </EuiTitle>
        <EuiText>
          <p>
            Catálogo de controles ENS. El número en rojo son las no
            conformidades abiertas del control: la carga de la prueba es del
            auditado, así que lo que no se ha podido demostrar cuenta igual que
            lo demostrado. «No evidenciadas» dice cuántas de ellas lo son por
            falta de prueba —otra acción y otra persona—, no otro hallazgo.
            Pulsa un control para ver su detalle completo.
          </p>
        </EuiText>
        <EuiSpacer size='l' />
        <EuiFacetGroup>
          {items.map(item => (
            <EuiFacetButton
              key={item.id}
              quantity={item.alerts}
              isSelected={false}
              onClick={() => setSelectedControl(item.control)}
              style={{
                borderLeft: item.alerts > 0 ? '4px solid #BD271E' : (item.hasData ? '4px solid #00A65A' : '4px solid #98A2B3'),
                marginBottom: 8,
              }}
            >
              <strong>{item.id}</strong> — {item.title}
              <EuiBadge color='hollow' style={{ marginLeft: 8 }}>{item.levels}</EuiBadge>
              <EuiBadge color={item.alerts > 0 ? 'danger' : (item.hasData ? 'success' : 'default')} style={{ marginLeft: 6 }}>
                {item.status}
              </EuiBadge>
              {item.pending > 0 && (
                <EuiBadge color='default' iconType='questionInCircle' style={{ marginLeft: 6 }}>
                  {item.pending} no evidenciada{item.pending === 1 ? '' : 's'}
                </EuiBadge>
              )}
            </EuiFacetButton>
          ))}
        </EuiFacetGroup>
      </EuiPanel>
    </EuiPage>
  );
};
