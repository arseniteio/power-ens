import { ENSControls } from '../data';
import { getActiveENSConfiguration } from '../configuration/services';
import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { useRouterSearch } from '../../../common/hooks';
import { useEsSearch } from '../../../common/hooks/use-es-search';
import {
  buildControlTrace,
  buildENSEvaluationTimeRangeFilter,
  getENSComplianceResultByControl,
  normalizeWazuhAlerts,
} from '../core';
import {
  buildENSScopeAgentQueryFilter,
  getActiveENSScopeAgents,
} from '../core/scope';

export const TraceabilityENS = () => {
  const { control, agentId } = useRouterSearch();

  const selectedControl =
    ENSControls.find(item => item.id === control) ||
    ENSControls[0];

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

  const { esResults } = useEsSearch({
    preAppliedFilters: [
      evaluationTimeFilter,
      scopeAgentQueryFilter,
      {
        bool: {
          should: [
            { match_phrase: { 'data.ensfacil': selectedControl.id } },
            { match_phrase: { 'data.control': selectedControl.id } },
            { match_phrase: { 'data.control_id': selectedControl.id } },
            { match_phrase: { 'data.ens': selectedControl.id } },
          ],
          minimum_should_match: 1,
        },
      },
    ],
    size: 2000,
  });

  const hits = esResults?.hits?.hits || [];

  const trace = useMemo(() => {
    const events = normalizeWazuhAlerts(hits);
    const result = getENSComplianceResultByControl(
      selectedControl.id,
      ensLevel,
      events,
      agentId,
      scopeAgents,
    );

    return result ? buildControlTrace(result) : undefined;
  }, [
    hits,
    agentId,
    ensLevel,
    selectedControl.id,
    scopeAgents,
  ]);

  if (!trace) {
    return (
      <EuiPanel paddingSize='l'>
        <EuiTitle size='m'>
          <h2>Trazabilidad ENS</h2>
        </EuiTitle>
        <EuiText>
          <p>No hay datos suficientes para generar trazabilidad.</p>
        </EuiText>
      </EuiPanel>
    );
  }

  return (
    <EuiPanel paddingSize='l'>
      <EuiTitle size='m'>
        <h2>
          Trazabilidad ENS · {trace.controlId} · {trace.controlName}
        </h2>
      </EuiTitle>

      <EuiSpacer size='m' />

      <EuiText>
        <p>
          Estado del control:{' '}
          <EuiBadge color='hollow'>{trace.status}</EuiBadge> · Score:{' '}
          <strong>{trace.score}%</strong>
        </p>
      </EuiText>

      <EuiSpacer size='l' />

      {trace.policyDecisions && trace.policyDecisions.length > 0 && (
        <>
          <EuiTitle size='s'>
            <h3>Decisiones del Policy Runtime</h3>
          </EuiTitle>

          <EuiSpacer size='s' />

          {trace.policyDecisions.map(decision => (
            <EuiPanel key={decision.ruleId} paddingSize='m'>
              <EuiText size='s'>
                <p>
                  <strong>{decision.requirementId}</strong> ·{' '}
                  {decision.ruleType}{' '}
                  <EuiBadge color='hollow'>{decision.status}</EuiBadge>
                </p>
                <p>
                  Expresión: <strong>{decision.expression}</strong>
                </p>
                <p>{decision.reason}</p>
              </EuiText>
            </EuiPanel>
          ))}

          <EuiSpacer size='l' />
        </>
      )}

      {trace.requirements.map(requirement => (
        <EuiPanel key={requirement.requirementId} paddingSize='m'>
          <EuiTitle size='s'>
            <h3>
              {requirement.requirementId} · {requirement.title}{' '}
              <EuiBadge color='hollow'>{requirement.status}</EuiBadge>
            </h3>
          </EuiTitle>

          <EuiSpacer size='s' />

          {requirement.evidences.map(evidence => (
            <EuiText size='s' key={evidence.evidenceId}>
              <p>
                <strong>{evidence.evidenceId}</strong> · {evidence.title} ·{' '}
                <EuiBadge color='hollow'>{evidence.status}</EuiBadge>
              </p>
            </EuiText>
          ))}

          <EuiSpacer size='s' />

          {requirement.observations.map((observation, index) => (
            <EuiText size='s' color='subdued' key={index}>
              <p>{observation}</p>
            </EuiText>
          ))}
        </EuiPanel>
      ))}
    </EuiPanel>
  );
};
