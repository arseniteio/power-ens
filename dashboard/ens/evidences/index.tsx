import React, { useEffect, useMemo, useState } from 'react';
import { useRouterSearch } from '../../../common/hooks';
import { useEsSearch } from '../../../common/hooks/use-es-search';
import {
  EuiBadge,
  EuiBasicTable,
  EuiFilterButton,
  EuiFilterGroup,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENSControls } from '../data';
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

const GENERAL = '__ALL__';

const columns = [
  {
    field: 'evidenceId',
    name: 'ID',
    render: (value: string) => <EuiBadge color='primary'>{value}</EuiBadge>,
  },
  {
    field: 'control',
    name: 'Control ENS',
  },
  {
    field: 'category',
    name: 'Categoría',
  },
  {
    field: 'description',
    name: 'Descripción de la evidencia',
  },
  {
    field: 'requirements',
    name: 'Requisito(s) ENS cubiertos',
  },
  {
    field: 'level',
    name: 'Nivel',
  },
  {
    field: 'status',
    name: 'Estado',
    render: (value: string) => (
      <EuiBadge
        color={
          value === 'CUMPLE'
            ? 'success'
            : value === 'NO_CUMPLE'
            ? 'danger'
            : value === 'PARCIAL'
            ? 'warning'
            : value === 'NO_APLICA'
            ? 'hollow'
            : 'default'
        }
      >
        {value}
      </EuiBadge>
    ),
  },
  {
    field: 'lastValidation',
    name: 'Última validación',
  },
  {
    field: 'agent',
    name: 'Agente',
  },
  {
    field: 'ruleId',
    name: 'Rule ID',
  },
  {
    field: 'auditQuestion',
    name: 'Pregunta auditoría',
  },
];

export const EvidencesENS = () => {
  const { agentId } = useRouterSearch();
  const [refreshKey, setRefreshKey] = useState(0);

  // Control seleccionado: por defecto General (todos los controles mezclados).
  const [selectedControlId, setSelectedControlId] = useState<string>(GENERAL);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshKey(current => current + 1);
    }, 15000);

    return () => window.clearInterval(interval);
  }, []);

  const activeConfiguration = getActiveENSConfiguration();
  const ensLevel = activeConfiguration.global.ensLevel;
  const evaluationTimeFilter = buildENSEvaluationTimeRangeFilter(
    activeConfiguration.global.evaluationPeriod,
  );

  const scopeAgents = getActiveENSScopeAgents();

  const scopeAgentQueryFilter = buildENSScopeAgentQueryFilter(
    scopeAgents,
    agentId,
  );

  // Controles a consultar: uno concreto o todos (General).
  const controlIds = useMemo(
    () =>
      selectedControlId === GENERAL
        ? ENSControls.map(control => control.id)
        : [selectedControlId],
    [selectedControlId],
  );

  // La query trae eventos de todos los controles del scope activo.
  const allControlIds = useMemo(
    () => ENSControls.map(control => control.id),
    [],
  );

  const { esResults } = useEsSearch({
    preAppliedFilters: [
      evaluationTimeFilter,
      scopeAgentQueryFilter,
      {
        bool: {
          should: allControlIds.flatMap(controlId => [
            { match_phrase: { 'data.ensfacil': controlId } },
            { match_phrase: { 'data.control': controlId } },
            { match_phrase: { 'rule.groups': `ENS_${controlId}` } },
          ]),
          minimum_should_match: 1,
        },
      },
    ],
    size: 5000,
    refreshKey,
  });

  const hits = esResults?.hits?.hits || [];

  const evidences = useMemo(() => {
    const normalizedEvents = normalizeWazuhAlerts(hits);

    // Se evalúa cada control seleccionado y se concatenan sus evidencias.
    return controlIds.flatMap(controlId => {
      const complianceResult = getENSComplianceResultByControl(
        controlId,
        ensLevel,
        normalizedEvents,
        agentId,
        scopeAgents,
      );

      return (complianceResult?.evidences || []).map(evidence => ({
        evidenceId: evidence.id,
        control: evidence.controlId,
        category: evidence.category,
        description: evidence.description,
        requirements: evidence.requirements.join(', '),
        level: evidence.levels.join(', '),
        status: evidence.status,
        lastValidation: evidence.lastSeen || '-',
        agent: evidence.agentName || evidence.agentId || '-',
        ruleId: evidence.relatedRules.join(', '),
        auditQuestion: evidence.auditQuestion,
      }));
    });
  }, [hits, ensLevel, agentId, scopeAgents, controlIds]);

  const isGeneral = selectedControlId === GENERAL;
  const selectedControlName = isGeneral
    ? 'todos los controles'
    : ENSControls.find(c => c.id === selectedControlId)?.id || selectedControlId;

  return (
    <EuiPanel paddingSize='l'>
      <EuiTitle size='s'>
        <h2>Repositorio de Evidencias ENS</h2>
      </EuiTitle>

      <EuiSpacer size='s' />

      <EuiText size='s'>
        <p>
          Relación de evidencias ENS resueltas por el motor ENSFácil a partir de
          eventos reales de Wazuh/OpenSearch para {selectedControlName}.
        </p>
      </EuiText>

      <EuiSpacer size='m' />

      <EuiFilterGroup>
        <EuiFilterButton
          hasActiveFilters={isGeneral}
          onClick={() => setSelectedControlId(GENERAL)}
        >
          General
        </EuiFilterButton>
        {ENSControls.map(control => (
          <EuiFilterButton
            key={control.id}
            hasActiveFilters={selectedControlId === control.id}
            onClick={() => setSelectedControlId(control.id)}
          >
            {control.id}
          </EuiFilterButton>
        ))}
      </EuiFilterGroup>

      <EuiSpacer size='m' />

      <EuiBasicTable items={evidences} columns={columns} />
    </EuiPanel>
  );
};
