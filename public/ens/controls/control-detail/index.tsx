import { useActiveENSScopeAgents } from '../../scope/use-active-scope-agents';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEnsEvaluation } from '../../../evaluation/use-evaluation';
import { fetchTraceabilityPage } from '../../../evaluation/evaluation-client';
import { FactsReadErrorCallOut } from '../../../platform/facts-read-error-callout';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonIcon,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENSControl } from '../../types';
// Import from the types file, never from the `../../core` barrel: it avoids the transitive TDZ cycle of Settings.
import type { ENSObservationGroup } from '../../../../common/ens/core/evaluation/types';
import { describeScope, machinesLabel, compliantRequirementLabel, summarizeMotives } from './general-view';
import {
  getActiveControlConfiguration,
  getActiveENSConfiguration,
} from '../../../../common/ens/configuration/services';
import { ControlEvolutionChart } from './evolution-chart';
import { MotiveCell } from './motive-cell';
import { NonConformityCard } from './nonconformity-card';
import { classifyNonConformity } from './nonconformity-class';
import type { KnownReasonParts } from '../../../../common/ens/evaluation/motive-parser';
import type { MotiveViewHandlers } from './motive-view';
import { describeParameterForMachine } from '../parameter-origins';
import { statusBadgeColor } from '../../status-colors';
import type { MotiveLine } from './motive-cell';
import type { ENSTraceabilityResult } from '../../../../common/ens/core/evaluation/types';
import type { ENSControlEvaluationResponse } from '../../../../common/ens/evaluation/types';
import { traceabilityPageSource } from '../../../evaluation/traceability-paging';
import { EvaluationLoading, EvaluationStatusLine } from '../../../evaluation/evaluation-status';
import { useSetRouterSearch } from '../../../routing/use-router-search';
import { detailConfigurationChanges } from '../../../routing/configuration-link';
import { AddControlWithDefaultsButton } from '../add-control-button';
import { isAgentLevelParameter } from '../../../../common/ens/configuration/agents/parameter-classes';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import {
  ENS_PROPOSAL_TEXT_PROVENANCE,
  describeAnnexSection,
  describeControlSource,
} from '../../../../common/ens/catalog/support/provenance';
import {
  describeApplicableLevel,
  describeApplicableLevelLabel,
  describeControlAxis,
} from '../../../../common/ens/core/control-level';
import { ProvenanceLabel, RequirementTextsPanel, TemplateCorrespondencePanel } from './requirement-texts';
import { describeNotMeasuredOnAgent } from '../../../../common/ens/core/scope/measurement-planes';
import {
  ENS_PENDING_MEASUREMENT_LABEL,
  describePendingMeasurement,
  describeRequiredSource,
  isPendingMeasurement,
} from '../../../../common/ens/catalog/support/measurement-plan';
import {
  ENSRetainedEvaluation,
  decideDetailView,
  describeComputedAt,
  isFromAnotherMachine,
  nextRetained,
} from './detail-view-state';
import { statusLabel } from '../../../../common/ens/core/status-label';
import { dateLabel, dateTimeLabel } from '../../../../common/ens/core/date-label';

interface ControlDetailENSProps {
  control: ENSControl;
  agentId?: string;
  onBack: () => void;
}

const getBadgeColor = (status: string) => statusBadgeColor(status);

const getStatusIcon = (status: string) =>
  status === 'CUMPLE'
    ? 'check'
    : status === 'NO_CUMPLE'
    ? 'cross'
    : status === 'NO_EVALUABLE'
    ? 'clock'
    : 'minus';

const formatTraceabilityTimestamp = (timestamp?: string) => {
  if (!timestamp) {
    return undefined;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? timestamp : dateTimeLabel(date);
};

export const ControlDetailENS = ({
   control,
   agentId,
   onBack,
 }: ControlDetailENSProps) => {
  const [tracePageIndex, setTracePageIndex] = useState(0);
  const [tracePageSize, setTracePageSize] = useState(10);
  const [expandedTraceIds, setExpandedTraceIds] = useState<string[]>([]);

  const scopeAgents = useActiveENSScopeAgents();

  // The server evaluates the control with all its facts of the window; there is no cut-off.
  const evaluation = useEnsEvaluation<ENSControlEvaluationResponse>({
    include: 'control',
    controlId: control.id,
    agentId,
    timelineDays: 30,
  });
  const updateUrl = useSetRouterSearch();

  // What is shown (detail-view-state.ts): the current request; while loading or on failure, the last result of this control labelled with its machine and time.
  const request = { controlId: control.id, agentId };
  const computedAt = (data: ENSControlEvaluationResponse) => data?.meta?.computedAt || data?.meta?.evaluatedAt;
  const retained = useRef<ENSRetainedEvaluation<ENSControlEvaluationResponse> | undefined>(undefined);
  const view = decideDetailView(request, evaluation, retained.current, computedAt);
  retained.current = nextRetained(request, evaluation, retained.current, computedAt);
  const data = view.kind === 'shown' ? view.data : undefined;
  const displayedAgent = view.kind === 'shown' ? view.agentId : agentId;

  const ensLevel = data?.meta?.level || getActiveENSConfiguration().global.ensLevel;
  const complianceResult = data?.result;
  const traceabilityTotal = data?.traceabilityTotal || 0;

  const controlTimeline = useMemo(
    () =>
      (data?.timeline || []).map(point => ({
        ...point,
        status: point.status || 'NO_EVALUABLE',
        date: new Date(point.date),
      })),
    [data],
  );

  useEffect(() => {
    setTracePageIndex(0);
  }, [control.id, agentId]);

  const newestVerdict = data?.meta?.verdicts?.newest;
  const latestEvaluationDate = newestVerdict
    ? dateLabel(newestVerdict)
    : 'Sin datos';

  const totalMachines = (complianceResult?.consolidatedAgents || []).length;

  const nameOf = (id?: string) => (id ? scopeAgents.find(agent => agent.id === id)?.name : undefined);
  const labelOf = (id?: string) => (id ? `${id} · ${nameOf(id) || 'sin nombre'}` : 'todas las máquinas');

  const agentName = displayedAgent
    ? (nameOf(displayedAgent) ||
       ('Agente ' + displayedAgent))
    : totalMachines > 0
    ? `Todos los agentes (vista general · ${totalMachines} máquina${
        totalMachines === 1 ? '' : 's'
      })`
    : 'Todos los agentes (vista general)';

  const engineStatus = complianceResult?.status || 'NO_EVALUABLE';

  const engineScore =
    typeof complianceResult?.score === 'number'
      ? complianceResult.score
      : undefined;

  const engineScoreText =
    engineScore !== undefined
      ? `${engineScore}%`
      : engineStatus === 'NO_APLICA'
      ? 'no aplica'
      : 'sin datos';

  const applicableRequirements = complianceResult?.applicableRequirements ?? 0;

  const compliantRequirements = (complianceResult?.requirements || []).filter(
    (requirement: any) => requirement.status === 'CUMPLE'
  ).length;
  const measuredRequirements = complianceResult?.measuredRequirements ?? 0;

  // The denominator must be the same set as the numerator: applicableRequirements is summed per machine when consolidating, so it is not used.
  const consolidatedRequirements = (complianceResult?.requirements || []).filter(
    (requirement: any) => requirement.status !== 'NO_APLICA'
  ).length;

  const isAggregatedView = !displayedAgent && totalMachines > 1;

  const denominatorRequirements = isAggregatedView
    ? consolidatedRequirements
    : applicableRequirements;

  // The level this control is evaluated with: the global one or that of its dimensions.
  const levelsText = String(complianceResult?.level || ensLevel);

  const evidenceStatusItems = (complianceResult?.evidences || []).map(evidence => ({
    id: evidence.id,
    title: evidence.description,
    requirement: evidence.requirements.join(', '),
    level: evidence.levels.join(', '),
    status: evidence.status,
    ruleId: evidence.relatedRules.join(', '),
    motivo: (evidence.observations || []).join(' · '),
    motivos: evidence.observationGroups || [],
  }));

  // One list and one counter: the former PM- cards are non-conformities with origin NO_EVIDENCIADA.
  const nonConformityItems = (complianceResult?.nonConformities || []).map(
    nonConformity => ({
      id: nonConformity.id,
      evidence: nonConformity.evidenceId,
      evidenceIds: nonConformity.evidenceIds || [],
      requirement: nonConformity.requirementId,
      finding: nonConformity.finding,
      impact: nonConformity.impact,
      requiredAction: nonConformity.requiredAction,
      expected: nonConformity.expected,
      actual: nonConformity.actual,
      parameterIds: nonConformity.parameterIds || [],
      origin: nonConformity.origin,
      cause: nonConformity.cause,
      documental: nonConformity.documental === true,
      agents: nonConformity.agents || [],
      status: 'ABIERTA',
    }),
  );

  const openNonConformitiesCount = nonConformityItems.length;

  const measures = nonConformityItems.filter(item => item.origin === 'MEDIDA');

  const documentary = measures.filter(item => item.documental);
  const technicalMeasures = measures.filter(item => !item.documental);

  const unevidenced = nonConformityItems.filter(
    item => item.origin === 'NO_EVIDENCIADA',
  );

  const machinesWithNonConformity = new Set(
    nonConformityItems.flatMap(item =>
      item.agents.map(agent => agent.agentId),
    ),
  ).size;

  const catalogGapsCount = unevidenced.filter(
    item => item.cause === 'CATALOG',
  ).length;

  const collectionGapsCount = unevidenced.filter(
    item => item.cause === 'COLLECTION',
  ).length;

  const unprovenMachines = new Set(
    unevidenced.flatMap(item => item.agents.map(agent => agent.agentId)),
  ).size;

  const configuredControl = Boolean(getActiveControlConfiguration(control.id));
  const classify = (item: (typeof nonConformityItems)[number]) =>
    classifyNonConformity(item, { controlConfigured: configuredControl });

  const knownParts: KnownReasonParts[] = [];

  const handlers: MotiveViewHandlers = {
    // Configuration of the CHOSEN machine, the one the user returns to.
    onParameter: parameterId =>
      updateUrl(
        detailConfigurationChanges({
          controlId: control.id,
          agentId,
          parameterId,
          parameterIsAgentLevel: isAgentLevelParameter(control.id, parameterId),
        })
      ),
    // Own parameter: the detail's `control=` does not filter Evidencias.
    onEvidence: () => updateUrl({ tabView: 'evidences', evidenceControl: control.id }),
    parameterInfo: parameterId => {
      const info = describeParameterForMachine(getActiveENSConfiguration(), control.id, displayedAgent, parameterId);
      return info && { id: info.id, label: info.label, value: info.value, origin: info.origin };
    },
  };

  const findEvidence = (evidenceId: string) =>
    (complianceResult?.evidences || []).find(
      (item: any) => item.id === evidenceId,
    );

  const evidenceMotives = (evidenceIds: string[]): MotiveLine[] => {
    const lines: MotiveLine[] = [];

    evidenceIds.forEach(evidenceId => {
      const evidence = findEvidence(evidenceId);

      if (!evidence) {
        return;
      }

      const groups = evidence.observationGroups || [];

      if (groups.length > 0) {
        summarizeMotives(groups).visibles.forEach(group => {
          lines.push({
            texto: group.text,
            etiqueta: group.agents.length
              ? `${evidenceId} · ${machinesLabel(
                  group.agents,
                  totalMachines,
                )}`
              : evidenceId,
          });
        });

        return;
      }

      (evidence.observations || []).forEach(text => {
        if (text && text.trim()) {
          lines.push({ texto: text.trim(), etiqueta: evidenceId });
        }
      });
    });

    return lines;
  };

  // Criticality is declared by the catalogue per evidence; the highest wins.
  const criticalityOf = (evidenceIds: string[]): string | undefined => {
    const order: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
    const labels: Record<string, string> = {
      LOW: 'baja',
      MEDIUM: 'media',
      HIGH: 'alta',
    };

    let highest: string | undefined;

    evidenceIds.forEach(evidenceId => {
      const level = findEvidence(evidenceId)?.criticality;

      if (!level || !order[level]) {
        return;
      }

      if (!highest || order[level] > order[highest]) {
        highest = level;
      }
    });

    return highest ? labels[highest] : undefined;
  };

  const actionSummary =
    openNonConformitiesCount === 0
      ? 'Sin acciones pendientes'
      : [
          technicalMeasures.length > 0 ? `Corregir ${technicalMeasures.length}` : '',
          documentary.length > 0
            ? `Renovar documentación ${documentary.length}`
            : '',
          unevidenced.length > 0
            ? `Habilitar prueba ${unevidenced.length}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ');

  const auditorSheet: { etiqueta: string; valor: string }[] = [
    { etiqueta: 'Score', valor: `${engineScoreText} · ${engineStatus}` },
    {
      // In aggregated view this fraction differs from the adjacent one: applicableRequirements is summed per machine.
      etiqueta: isAggregatedView
        ? 'Demostrados · requisito × máquina'
        : 'Requisitos demostrados',
      valor: `${measuredRequirements}/${applicableRequirements}`,
    },
    {
      etiqueta: 'No conformidades',
      valor: `${openNonConformitiesCount}${
        machinesWithNonConformity > 0
          ? ` · ${machinesWithNonConformity} máquina${
              machinesWithNonConformity === 1 ? '' : 's'
            }`
          : ''
      }`,
    },
    {
      etiqueta: 'Medidas',
      valor: `${measures.length}${
        documentary.length > 0 ? ` · ${documentary.length} documental${documentary.length === 1 ? '' : 'es'}` : ''
      }`,
    },
    {
      etiqueta: 'No evidenciadas',
      valor: `${unevidenced.length}${
        unprovenMachines > 0
          ? ` · ${unprovenMachines} máquina${
              unprovenMachines === 1 ? '' : 's'
            }`
          : ''
      }`,
    },
    ...(catalogGapsCount > 0
      ? [{ etiqueta: 'Del catálogo', valor: String(catalogGapsCount) }]
      : []),
    ...(collectionGapsCount > 0
      ? [{ etiqueta: 'Fallo de recogida', valor: String(collectionGapsCount) }]
      : []),
    { etiqueta: 'Acción', valor: actionSummary },
  ];

  const remediationTotals = [
    {
      etiqueta: 'medidas · corregir el sistema',
      valor: technicalMeasures.length,
      color: 'danger' as const,
    },
    {
      etiqueta: 'documentales · renovar o completar la documentación',
      valor: documentary.length,
      color: 'danger' as const,
    },
    {
      etiqueta: 'no evidenciadas · habilitar la prueba',
      valor: unevidenced.length,
      color: 'warning' as const,
    },
  ].filter(item => item.valor > 0);

  const remediationBreakdown = [
    {
      etiqueta: 'del catálogo · producto Power ENS',
      valor: catalogGapsCount,
      color: 'default' as const,
    },
    {
      etiqueta: 'fallo de recogida · operación Wazuh',
      valor: collectionGapsCount,
      color: 'primary' as const,
    },
  ].filter(item => item.valor > 0);

  const toTraceItem = (item: ENSTraceabilityResult, index: number) => ({
      key: `${item.source}-${item.reference}-${index}`,
      source: item.source,
      reference: item.reference,
      controlId:
        item.controlId ||
        complianceResult?.control.id ||
        control.id,
      requirements:
        item.requirementIds && item.requirementIds.length > 0
          ? item.requirementIds.join(', ')
          : item.requirementId || '',
      evidenceId: item.evidenceId,
      status: item.status,
      eventId: item.eventId,
      eventType: item.eventType,
      ruleId: item.ruleId,
      ruleDescription: item.ruleDescription,
      agent: [item.agentId, item.agentName]
        .filter(Boolean)
        .join(' · '),
      origin: [item.eventSourceType, item.eventSource]
        .filter(Boolean)
        .join(' · '),
      timestamp: formatTraceabilityTimestamp(item.timestamp),
      auditAttributes: item.auditAttributes || {},
      auditorMeaning: item.description,
    });

  // The table is paginated on the server: the card carries the first entries and each further page is requested with its own loading and error state.
  const initials = complianceResult?.traceability || [];
  const pageFrom = tracePageIndex * tracePageSize;
  const traceabilityAvailable = data?.traceabilityAvailable ?? initials.length;
  const [remotePage, setRemotePage] = useState<
    { key: string; items?: ENSTraceabilityResult[]; error?: Error } | undefined
  >();
  const [traceRetry, setTraceRetry] = useState(0);
  const remoteKey = `${control.id}|${displayedAgent || ''}|${pageFrom}|${tracePageSize}|${data?.meta?.fingerprint || ''}|${traceRetry}`;
  const needsRemote =
    Boolean(complianceResult) &&
    traceabilityPageSource({ initialCount: initials.length, available: traceabilityAvailable, pageFrom, pageSize: tracePageSize }) === 'remote';

  useEffect(() => {
    if (!needsRemote) return;
    const controller = new AbortController();
    // Only cancellations made by the screen are silenced; a timeout also aborts the controller and must show.
    let cancelled = false;
    fetchTraceabilityPage({ controlId: control.id, agentId: displayedAgent, from: pageFrom, size: tracePageSize }, controller)
      .then(page => {
        if (!cancelled) setRemotePage({ key: remoteKey, items: page.items || [] });
      })
      .catch(error => {
        if (!cancelled) setRemotePage({ key: remoteKey, error });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteKey, needsRemote]);

  const remotePageIndex = remotePage?.key === remoteKey ? remotePage : undefined;
  const traceLoading = needsRemote && !remotePageIndex;
  const traceError = needsRemote ? remotePageIndex?.error : undefined;

  const traceabilityPageItems = (needsRemote
    ? remotePageIndex?.items || []
    : initials.slice(pageFrom, pageFrom + tracePageSize)
  ).map((item, index) => toTraceItem(item, pageFrom + index));

  const toggleTraceDetail = (key: string) =>
    setExpandedTraceIds(current =>
      current.includes(key)
        ? current.filter(id => id !== key)
        : [...current, key],
    );

  const renderTraceDetail = (item: (typeof traceabilityPageItems)[number]) => (
    <EuiText size='xs'>
      <p>
        <strong>Referencia:</strong> {item.reference}
      </p>

      {item.requirements && (
        <p>
          <strong>Requisito(s):</strong> {item.requirements}
        </p>
      )}

      {item.eventId && (
        <p>
          <strong>ID del evento:</strong> {item.eventId}
        </p>
      )}

      {item.ruleDescription && (
        <p>
          <strong>Descripción de la regla:</strong> {item.ruleDescription}
        </p>
      )}

      {item.agent && (
        <p>
          <strong>Agente:</strong> {item.agent}
        </p>
      )}

      {item.origin && (
        <p>
          <strong>Origen:</strong> {item.origin}
        </p>
      )}

      {Object.keys(item.auditAttributes).length > 0 && (
        <>
          <p>
            <strong>Atributos técnicos auditables:</strong>
          </p>

          <ul>
            {Object.entries(item.auditAttributes).map(
              ([attribute, value]) => (
                <li key={attribute}>
                  <strong>{attribute}:</strong> {String(value)}
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {item.auditorMeaning && (
        <p style={{ color: '#69707D' }}>{item.auditorMeaning}</p>
      )}
    </EuiText>
  );

  const traceExpandedRowMap = expandedTraceIds.reduce(
    (acc: Record<string, React.ReactNode>, key) => {
      const item = traceabilityPageItems.find(trace => trace.key === key);

      if (item) {
        acc[key] = renderTraceDetail(item);
      }

      return acc;
    },
    {},
  );

  const traceabilityColumns = [
    {
      field: 'source',
      name: 'Fuente',
      width: '110px',
      render: (value: string) => <EuiBadge color='hollow'>{value}</EuiBadge>,
    },
    {
      field: 'evidenceId',
      name: 'Evidencia',
      width: '100px',
      render: (value?: string) =>
        value ? <EuiBadge color='default'>{value}</EuiBadge> : '-',
    },
    {
      field: 'eventType',
      name: 'Evento',
      width: '160px',
      render: (value?: string) => value || '-',
    },
    {
      field: 'ruleId',
      name: 'Regla',
      width: '110px',
      render: (value?: string) => value || '-',
    },
    {
      field: 'status',
      name: 'Estado',
      width: '130px',
      render: (value?: string) =>
        value ? <EuiBadge color={getBadgeColor(value)}>{value}</EuiBadge> : '-',
    },
    {
      field: 'timestamp',
      name: 'Fecha',
      width: '160px',
      render: (value?: string) => value || '-',
    },
    {
      align: 'right' as const,
      width: '40px',
      isExpander: true,
      render: (item: (typeof traceabilityPageItems)[number]) => (
        <EuiButtonIcon
          onClick={() => toggleTraceDetail(item.key)}
          aria-label={
            expandedTraceIds.includes(item.key) ? 'Contraer' : 'Ver detalle'
          }
          iconType={
            expandedTraceIds.includes(item.key) ? 'arrowUp' : 'arrowDown'
          }
        />
      ),
    },
  ];

  const evidenceSummary = evidenceStatusItems.reduce(
    (acc, evidence) => {
      if (evidence.status === 'CUMPLE') {
        acc.cumple += 1;
      } else if (evidence.status === 'NO_EVALUABLE') {
        acc.noEvaluable += 1;
      } else if (evidence.status === 'NO_APLICA') {
        acc.noAplica += 1;
      } else if (evidence.status === 'NO_CUMPLE') {
        acc.noCumple += 1;
      }

      return acc;
    },
    { cumple: 0, noEvaluable: 0, noAplica: 0, noCumple: 0 },
  );

  const evaluableEvidences =
    evidenceSummary.cumple + evidenceSummary.noCumple + evidenceSummary.noEvaluable;

  const compliantEvidencesText =
    evaluableEvidences > 0
      ? `${Math.round((evidenceSummary.cumple / evaluableEvidences) * 100)}%`
      : 'sin datos';

  const globalStatus = engineStatus;

  // The arc is the number and its colour is the status; without a number the whole ring is grey.
  const arcColor =
    engineStatus === 'CUMPLE'
      ? '#00A69B'
      : engineStatus === 'PARCIAL'
      ? '#F5A700'
      : engineStatus === 'NO_CUMPLE'
      ? '#BD271E'
      : '#98A2B3';

  const donutBackground =
    engineScore === undefined
      ? 'conic-gradient(#D3DAE6 0 100%)'
      : `conic-gradient(${arcColor} 0 ${engineScore}%, #EEF2F7 ${engineScore}% 100%)`;

  const evidenceCounts = [
    {
      etiqueta: 'conforman',
      valor: evidenceSummary.cumple,
      color: 'success' as const,
    },
    {
      etiqueta: 'con hallazgo',
      valor: evidenceSummary.noCumple,
      color: 'danger' as const,
    },
    {
      etiqueta: 'sin medir',
      valor: evidenceSummary.noEvaluable,
      color: 'default' as const,
    },
    {
      etiqueta: `fuera del nivel ${levelsText}`,
      valor: evidenceSummary.noAplica,
      color: 'hollow' as const,
    },
  ].filter(item => item.valor > 0);

  const configureControl = () =>
    updateUrl(
      detailConfigurationChanges({
        controlId: control.id,
        agentId,
        hasAgentLevelParameters: (getActiveControlConfiguration(control.id)?.parameters || []).some(parameter =>
          isAgentLevelParameter(control.id, parameter.id)
        ),
      })
    );

  const headerCatalog = getENSCatalogControl(control.id);

  const header = (
    <div className='power-ens-control-header' style={{ padding: '4px 8px 12px' }}>
      <EuiButtonEmpty iconType='arrowLeft' size='s' flush='left' onClick={onBack}>
        Volver a controles
      </EuiButtonEmpty>
      <EuiSpacer size='m' />
      <EuiFlexGroup alignItems='flexStart' justifyContent='spaceBetween' gutterSize='l' wrap>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiBadge color='hollow'>{control.id}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size='s' color='subdued'>
                {control.family} · {control.category}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size='s' />
          <EuiTitle size='l'>
            <h2>{control.title}</h2>
          </EuiTitle>
          {headerCatalog && (
            <EuiText size='xs' color='subdued'>
              {[describeAnnexSection(headerCatalog), describeControlAxis(headerCatalog), describeControlSource(headerCatalog)]
                .filter(Boolean)
                .join(' · ')}
            </EuiText>
          )}
          <EuiSpacer size='s' />
          <EuiFlexGroup gutterSize='s' responsive={false} wrap alignItems='center'>
            {data?.result && (
              <EuiFlexItem grow={false}>
                <EuiBadge color={getBadgeColor(data.result.status)} iconType={getStatusIcon(data.result.status)}>
                  {statusLabel(data.result.status)}
                  {typeof data.result.score === 'number' ? ` · ${data.result.score}%` : ''}
                </EuiBadge>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton iconType='gear' onClick={configureControl}>
            Configurar este control
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );

  if (view.kind === 'error') {
    return (
      <EuiPage paddingSize='m'>
        <EuiPanel>
          {header}
          <EuiSpacer size='m' />
          <FactsReadErrorCallOut error={view.error as Error} onRetry={evaluation.retry} />
        </EuiPanel>
      </EuiPage>
    );
  }

  if (view.kind === 'loading') {
    return (
      <EuiPage paddingSize='m'>
        <EuiPanel>
          {header}
          <EvaluationLoading message={'Calculando…'} />
        </EuiPanel>
      </EuiPage>
    );
  }

  const fromOtherMachine = isFromAnotherMachine(request, view);
  const displayedHour = describeComputedAt(view.computedAt);
  const validityNotice = !view.current ? (
    <>
      {view.loading && <EuiProgress size='xs' color='accent' position='absolute' />}
      {view.error ? (
        <>
          <FactsReadErrorCallOut error={view.error as Error} onRetry={evaluation.retry} />
          <EuiSpacer size='s' />
          <EuiCallOut
            size='s'
            color='warning'
            iconType='clock'
            title={`Resultado de ${labelOf(view.agentId)}${displayedHour ? ` · ${displayedHour}` : ''}`}
          >
            {fromOtherMachine && (
              <p>No es el de {labelOf(agentId)}: el de esa máquina no se ha podido calcular.</p>
            )}
          </EuiCallOut>
        </>
      ) : (
        <EuiCallOut
          size='s'
          color='primary'
          iconType='clock'
          title={
            fromOtherMachine
              ? `Cargando ${labelOf(agentId)}…`
              : 'Actualizando…'
          }
        />
      )}
      <EuiSpacer size='m' />
    </>
  ) : null;

  const unconfiguredNotice = !getActiveControlConfiguration(control.id) ? (
    <>
      <EuiCallOut color='warning' iconType='gear' title={`${control.id} no está en la configuración activa`}>
        <p>
          Añádelo y declara sus parámetros obligatorios: hasta entonces sus requisitos no se evidencian.
        </p>
        <AddControlWithDefaultsButton controlId={control.id} onAdded={() => evaluation.retry()} />
      </EuiCallOut>
      <EuiSpacer size='m' />
    </>
  ) : null;

  // In the catalog without collector yet: its evidences have no instrument, so nothing is judged (the engine leaves it out of the index).
  const pendingMeasurement = isPendingMeasurement(headerCatalog);
  const pendingMeasurementNotice = pendingMeasurement && headerCatalog ? (
    <>
      <EuiCallOut color='primary' iconType='clock' title={`${ENS_PENDING_MEASUREMENT_LABEL}: ${control.id} es documental de momento`}>
        <p>{describePendingMeasurement(headerCatalog)}</p>
        <p>
          Se puede configurar y declarar en la Declaración de Aplicabilidad. Cada evidencia indica la fuente de datos que
          necesitará («Fuente necesaria»).
        </p>
      </EuiCallOut>
      <EuiSpacer size='m' />
    </>
  ) : null;

  // The control is not measured on this machine: neither 'no data' nor 'all compliant'.
  if (!complianceResult) {
    const catalog = getENSCatalogControl(control.id);
    const motive =
      displayedAgent && catalog
        ? describeNotMeasuredOnAgent(
            catalog,
            displayedAgent,
            nameOf(displayedAgent),
            getActiveControlConfiguration(control.id, displayedAgent)
          )
        : undefined;
    const scopeParameter = motive?.parameterId;

    return (
      <EuiPage paddingSize='m'>
        <EuiPanel style={{ position: 'relative' }}>
          {header}
          <EuiSpacer size='m' />
          {validityNotice}
          {unconfiguredNotice}
          {pendingMeasurementNotice}
          <EuiCallOut
            color='primary'
            iconType='iInCircle'
            title={
              displayedAgent
                ? `${control.id} no se mide en ${labelOf(displayedAgent)}`
                : `${control.id} no tiene resultado en ninguna máquina`
            }
          >
            <p>
              {motive?.text ||
                (displayedAgent
                  ? `${control.id} no se mide en esta máquina.`
                  : `Ninguna máquina mide ${control.id}.`)}
            </p>
                        <EuiFlexGroup gutterSize='s' responsive={false} wrap>
              {displayedAgent && (
                <EuiFlexItem grow={false}>
                  <EuiButton size='s' iconType='list' onClick={() => updateUrl({ agentId: undefined })}>
                    Ver todas las máquinas
                  </EuiButton>
                </EuiFlexItem>
              )}
              {scopeParameter && (
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    size='s'
                    iconType='gear'
                    onClick={() =>
                      updateUrl(
                        detailConfigurationChanges({
                          controlId: control.id,
                          agentId,
                          parameterId: scopeParameter,
                          parameterIsAgentLevel: isAgentLevelParameter(control.id, scopeParameter),
                        })
                      )
                    }
                  >
                    Configurar {scopeParameter}
                  </EuiButtonEmpty>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiCallOut>
          <EuiSpacer size='s' />
          <EvaluationStatusLine meta={data?.meta} refreshing={evaluation.isRefreshing} />
        </EuiPanel>
      </EuiPage>
    );
  }

  // Without a selected agent data of several agents is not mixed: a combined compliance is not valid for audit.
  return (
    <EuiPage paddingSize='m'>
      <EuiPanel style={{ position: 'relative' }}>
        {header}

        <EuiSpacer size='s' />

        {validityNotice}
        {unconfiguredNotice}
        {pendingMeasurementNotice}

        <EuiText>
          <p>
            Control ENS orientado a auditoría, evidencias, scoring y
            trazabilidad Wazuh.
          </p>
        </EuiText>

        <EuiSpacer size='s' />

        <EuiPanel paddingSize='s'>
          <EuiText size='s'>
            <p>
              <strong>Activo:</strong> {agentName} &nbsp; | &nbsp;
              <strong>Fuente:</strong> Wazuh / OpenSearch &nbsp; | &nbsp;
              <strong>{describeApplicableLevelLabel(headerCatalog || {})}:</strong> {levelsText} &nbsp; | &nbsp;
              <strong>Último hecho:</strong> {latestEvaluationDate}
            </p>
          </EuiText>
          <EvaluationStatusLine meta={data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />
        </EuiPanel>

        <EuiSpacer size='l' />

        <EuiPanel>
          <EuiTitle size='s'>
            <h3>Panel ejecutivo {control.id.toUpperCase()}</h3>
          </EuiTitle>

          <EuiSpacer size='m' />

          <EuiFlexGroup>
            <EuiFlexItem grow={1}>
              <EuiPanel>
                <EuiTitle size='xs'>
                  <h4>Cumplimiento global del control</h4>
                </EuiTitle>
                <div style={{ textAlign: 'center', padding: '14px 0' }}>
                  <div
                    style={{
                      width: 176,
                      height: 176,
                      borderRadius: '50%',
                      background: donutBackground,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      margin: '0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 122,
                        height: 122,
                        borderRadius: '50%',
                        background: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 34,
                          fontWeight: 700,
                          lineHeight: 1.1,
                          color: arcColor,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {engineScoreText}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          color: '#69707D',
                          marginTop: 2,
                        }}
                      >
                        {globalStatus}
                      </span>
                    </div>
                  </div>
                </div>

                <EuiFlexGroup gutterSize='s' justifyContent='center'>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={getBadgeColor(engineStatus)}>
                      {levelsText} · {engineScoreText} · {engineStatus}
                    </EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size='s' />

                <EuiFlexGroup
                  gutterSize='xs'
                  justifyContent='center'
                  wrap
                  responsive={false}
                >
                  {evidenceCounts.map(item => (
                    <EuiFlexItem grow={false} key={item.etiqueta}>
                      <EuiBadge color={item.color}>
                        {item.valor} {item.etiqueta}
                      </EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              </EuiPanel>
            </EuiFlexItem>

            <EuiFlexItem grow={1}>
              <EuiPanel>
                <EuiTitle size='xs'>
                  <h4>Requisitos</h4>
                </EuiTitle>

                <EuiSpacer size='s' />

                {(complianceResult?.requirements || [])
                  .filter((requirement: any) => requirement.status !== 'NO_APLICA')
                  .map((requirement: any) => {
                    const culprits = (requirement.evidenceIds || [])
                      .map((evidenceId: string) => {
                        const evidence = findEvidence(evidenceId);

                        return evidence &&
                          evidence.status !== 'CUMPLE' &&
                          evidence.status !== 'NO_APLICA'
                          ? { id: evidenceId, status: evidence.status }
                          : undefined;
                      })
                      .filter(Boolean) as {
                      id: string;
                      status: string;
                    }[];

                    const isCompliant = requirement.status === 'CUMPLE';

                    return (
                      <EuiFlexGroup
                        key={requirement.id}
                        gutterSize='s'
                        alignItems='center'
                        responsive={false}
                        style={{
                          padding: '4px 0',
                          borderBottom: '1px solid #F1F4FA',
                        }}
                      >
                        <EuiFlexItem grow={false}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: isCompliant ? '#00A69B' : '#BD271E',
                              display: 'block',
                            }}
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false} style={{ minWidth: 96 }}>
                          <EuiText size='xs'>
                            <strong>{requirement.id}</strong>
                          </EuiText>
                        </EuiFlexItem>

                        <EuiFlexItem>
                          {isCompliant ? (
                            <EuiText size='xs' color='subdued'>
                              {compliantRequirementLabel(requirement)}
                            </EuiText>
                          ) : culprits.length ? (
                            <EuiFlexGroup
                              gutterSize='xs'
                              wrap
                              responsive={false}
                            >
                              {culprits.map(culprit => (
                                <EuiFlexItem grow={false} key={culprit.id}>
                                  <EuiBadge
                                    color={getBadgeColor(culprit.status)}
                                    iconType={getStatusIcon(culprit.status)}
                                  >
                                    {culprit.id}
                                  </EuiBadge>
                                </EuiFlexItem>
                              ))}
                            </EuiFlexGroup>
                          ) : (requirement.evidenceIds || []).length === 0 ? (
                            <EuiText size='xs' color='subdued'>
                              sin evidencia declarada
                            </EuiText>
                          ) : (
                            <EuiText size='xs' color='subdued'>
                              {requirement.evidenced === false
                                ? 'no demostrado'
                                : 'no cumple'}
                            </EuiText>
                          )}
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    );
                  })}

                <EuiSpacer size='s' />

                <EuiText size='xs' color='subdued'>
                  <strong>
                    {compliantRequirements}/{denominatorRequirements} cumplen
                  </strong>{' '}
                  ·{' '}
                  {isAggregatedView
                    ? `${engineScoreText} media de ${totalMachines} máquinas`
                    : engineScoreText}
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>

              <EuiFlexItem grow={1}>
                <EuiPanel>
                  <EuiTitle size='xs'>
                    <h4>Resultado del motor ENS</h4>
                  </EuiTitle>

                  <EuiSpacer size='s' />

                  <EuiStat
                    title={engineScoreText}
                    titleSize='m'
                    description='Score del control · requisitos'
                    titleColor={getBadgeColor(engineStatus)}
                  />

                  <EuiSpacer size='m' />

                  <EuiStat
                    title={compliantEvidencesText}
                    titleSize='m'
                    description={`Evidencias conformes · ${evidenceSummary.cumple}/${evaluableEvidences}`}
                  />

                  <EuiSpacer size='m' />

                  <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={getBadgeColor(engineStatus)}>
                        {engineStatus}
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color='hollow'>{describeApplicableLevel(headerCatalog || {}, levelsText)}</EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>

              <EuiFlexItem grow={1}>
                <EuiPanel>
                  <EuiTitle size='xs'>
                    <h4>Detalle auditor</h4>
                  </EuiTitle>

                  <EuiSpacer size='s' />

                  {auditorSheet.map(pair => (
                    <EuiFlexGroup
                      key={pair.etiqueta}
                      gutterSize='s'
                      responsive={false}
                      style={{ padding: '2px 0' }}
                    >
                      <EuiFlexItem grow={false} style={{ minWidth: 128 }}>
                        <EuiText size='xs' color='subdued'>
                          {pair.etiqueta}
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size='xs'>
                          <strong>{pair.valor}</strong>
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  ))}
                </EuiPanel>
              </EuiFlexItem>
          </EuiFlexGroup>

        </EuiPanel>

        <EuiSpacer size='l' />

        <EuiPanel>
          <EuiTitle size='s'>
            <h3>Evolución del cumplimiento · {control.id}</h3>
          </EuiTitle>

          <EuiSpacer size='xs' />

          <EuiText size='s' color='subdued'>
            <p>
              Cumplimiento diario de este control en los últimos 30 días.
            </p>
          </EuiText>

          <EuiSpacer size='s' />

          <ControlEvolutionChart
            points={controlTimeline}
            controlId={control.id}
            pending={Boolean(data?.meta?.seriesPending)}
          />
        </EuiPanel>

        <EuiSpacer size='l' />


        <EuiPanel>
          <RequirementTextsPanel controlId={control.id} />
          <TemplateCorrespondencePanel controlId={control.id} />
        </EuiPanel>

        <EuiSpacer size='l' />

        <EuiTitle size='s'>
          <h3>Evidencias ENS del control</h3>
        </EuiTitle>

        {!displayedAgent && totalMachines > 1 && (
          <>
            <EuiSpacer size='xs' />

            <EuiText size='xs' color='subdued'>
              Vista general de {totalMachines} máquinas: el mismo motivo
              observado en varias se escribe una vez, con el recuento delante.
            </EuiText>
          </>
        )}

        <EuiSpacer size='s' />

        <EuiBasicTable
          items={evidenceStatusItems}
          columns={[
            {
              field: 'id',
              name: 'Evidencia',
              width: '90px',
              render: (id: string) => <strong>{id}</strong>,
            },
            {
              field: 'title',
              name: 'Descripción',
              render: (title: string, item: (typeof evidenceStatusItems)[number]) => {
                const requiredSource = describeRequiredSource(control.id, item.id);

                return (
                  <EuiText size='s'>
                    {title} <ProvenanceLabel provenance={ENS_PROPOSAL_TEXT_PROVENANCE} />
                    {requiredSource && (
                      <EuiText size='xs' color='subdued'>
                        Fuente necesaria: {requiredSource}
                      </EuiText>
                    )}
                  </EuiText>
                );
              },
            },
            {
              field: 'status',
              name: 'Estado',
              width: '150px',
              render: (status: string) =>
                pendingMeasurement ? (
                  <EuiBadge color='hollow' iconType='clock'>
                    {ENS_PENDING_MEASUREMENT_LABEL}
                  </EuiBadge>
                ) : (
                  <EuiBadge
                    color={getBadgeColor(status)}
                    iconType={getStatusIcon(status)}
                  >
                    {statusLabel(status)}
                  </EuiBadge>
                ),
            },
            {
              field: 'requirement',
              name: 'Requisito ENS',
              width: '150px',
              render: (req: string) => (
                <EuiText size='xs' color='subdued'>{req}</EuiText>
              ),
            },
            {
              field: 'level',
              name: 'Nivel',
              width: '110px',
              render: (level: string) => <EuiBadge color='hollow'>{level}</EuiBadge>,
            },
            {
              field: 'motivos',
              name: 'Motivo',
              render: (
                motives: ENSObservationGroup[],
                item: (typeof evidenceStatusItems)[number],
              ) => {
                if (motives.length === 0) {
                  return (
                    <MotiveCell
                      lineas={(item.motivo || '')
                        .split(' · ')
                        .map(text => text.trim())
                        .filter(Boolean)
                        .map(text => ({ texto: text }))}
                      titulo={`Motivo · ${item.id}`}
                      evidenceId={item.id}
                      conocidos={knownParts}
                      handlers={handlers}
                    />
                  );
                }

                const { visibles: visibleItems, ocultos: hidden } = summarizeMotives(motives);

                return (
                  <MotiveCell
                    lineas={visibleItems.map(group => ({
                      texto: group.text,
                      etiqueta: machinesLabel(
                        group.agents,
                        totalMachines
                      ),
                    }))}
                    ocultos={hidden}
                    titulo={`Motivo · ${item.id}`}
                    evidenceId={item.id}
                    conocidos={knownParts}
                    handlers={handlers}
                  />
                );
              },
            },
          ]}
        />

        <EuiSpacer size='l' />

          <EuiPanel>
            <EuiTitle size='s'>
              <h3>Remediación del control</h3>
            </EuiTitle>

            <EuiSpacer size='s' />

            {pendingMeasurement ? (
              // Not a green «all clear»: nothing has been measured.
              <EuiCallOut
                title={`${ENS_PENDING_MEASUREMENT_LABEL}: nada que remediar hasta que exista el recolector`}
                color='primary'
                iconType='clock'
              />
            ) : openNonConformitiesCount === 0 ? (
              <EuiCallOut
                title='Sin no conformidades abiertas'
                color='success'
                iconType='check'
              />
            ) : (
              <>
                <EuiTitle size='xxs'>
                  <h4>{openNonConformitiesCount} no conformidades abiertas</h4>
                </EuiTitle>

                <EuiSpacer size='s' />

                <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
                  {remediationTotals.map(item => (
                    <EuiFlexItem grow={false} key={item.etiqueta}>
                      <EuiBadge color={item.color}>
                        {item.valor} {item.etiqueta}
                      </EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>

                {remediationBreakdown.length > 0 && (
                  <>
                    <EuiSpacer size='s' />

                    <EuiFlexGroup
                      gutterSize='xs'
                      alignItems='center'
                      wrap
                      responsive={false}
                    >
                      <EuiFlexItem grow={false}>
                        <EuiText size='xs' color='subdued'>
                          De las no evidenciadas:
                        </EuiText>
                      </EuiFlexItem>

                      {remediationBreakdown.map(item => (
                        <EuiFlexItem grow={false} key={item.etiqueta}>
                          <EuiBadge color={item.color}>
                            {item.valor} {item.etiqueta}
                          </EuiBadge>
                        </EuiFlexItem>
                      ))}
                    </EuiFlexGroup>
                  </>
                )}
              </>
            )}
          </EuiPanel>

        <EuiSpacer size='l' />

        <EuiPanel>
          <EuiFlexGroup
            alignItems='center'
            justifyContent='spaceBetween'
            gutterSize='s'
          >
            <EuiFlexItem grow={false}>
              <EuiTitle size='s'>
                <h3>Trazabilidad ENS ↔ Wazuh</h3>
              </EuiTitle>
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiText size='xs' color='subdued'>
                {traceabilityTotal.toLocaleString('es-ES')} registro
                {traceabilityTotal === 1 ? '' : 's'}
                {traceabilityTotal > traceabilityAvailable
                  ? ` · se pueden recorrer los ${traceabilityAvailable.toLocaleString('es-ES')} primeros; todos los hechos están en Eventos`
                  : ''}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size='s' />

          {traceError ? (
            <>
              <FactsReadErrorCallOut error={traceError} onRetry={() => setTraceRetry(n => n + 1)} />
              <EuiSpacer size='s' />
            </>
          ) : null}

          {traceabilityTotal === 0 ? (
            <EuiText size='s' color='subdued'>
              <p>
                No hay información de trazabilidad disponible para este control.
              </p>
            </EuiText>
          ) : (
            <EuiBasicTable
              items={traceabilityPageItems}
              loading={traceLoading}
              noItemsMessage={traceLoading ? 'Cargando la página…' : traceError ? 'No se pudo leer esta página.' : undefined}
              itemId='key'
              itemIdToExpandedRowMap={traceExpandedRowMap}
              isExpandable={true}
              compressed={true}
              columns={traceabilityColumns}
              pagination={{
                pageIndex: tracePageIndex,
                pageSize: tracePageSize,
                totalItemCount: traceabilityAvailable,
                pageSizeOptions: [5, 10, 25, 50],
              }}
              onChange={({ page }: { page?: { index: number; size: number } }) => {
                if (page) {
                  setTracePageIndex(page.index);
                  setTracePageSize(page.size);
                }
              }}
            />
          )}
        </EuiPanel>

        <EuiSpacer size='l' />

        <EuiTitle size='s'>
          <h3>No conformidades ENS</h3>
        </EuiTitle>

        <EuiSpacer size='xs' />

        <EuiText size='xs' color='subdued'>
          Una tarjeta por hallazgo, no por máquina. Medido y no evidenciado
          cuentan igual; la acción es distinta.
        </EuiText>

        <EuiSpacer size='s' />

        {nonConformityItems.length === 0 && (
          <EuiText size='s' color='subdued'>
            <p>
              {pendingMeasurement
                ? `${control.id} no tiene medición todavía: no hay no conformidades que medir.`
                : complianceResult.status === 'NO_APLICA'
                ? `${control.id} no aplica en el nivel ${levelsText}: no hay no conformidades que medir.`
                : 'Todo lo aplicable en este control se ha demostrado conforme.'}
            </p>
          </EuiText>
        )}

        {[
          {
            clave: 'medidas',
            titulo: `Medidas · ${technicalMeasures.length}`,
            pie: 'Corregir el sistema auditado.',
            items: technicalMeasures,
          },
          {
            clave: 'documentales',
            titulo: `Documentales · ${documentary.length}`,
            pie: 'Cuentan igual. La acción es renovar o completar la documentación.',
            items: documentary,
          },
          {
            clave: 'no-evidenciadas',
            titulo: `No evidenciadas · ${unevidenced.length}`,
            pie: 'Cuentan igual. La acción es habilitar la prueba.',
            items: unevidenced,
          },
        ]
          .filter(block => block.items.length > 0)
          .map(block => (
            <div key={block.clave}>
              <EuiSpacer size='m' />

              <EuiTitle size='xxs'>
                <h4>{block.titulo}</h4>
              </EuiTitle>

              <EuiText size='xs' color='subdued'>
                {block.pie}
              </EuiText>

              <EuiSpacer size='s' />

              <EuiFlexGroup wrap>
                {block.items.map(nonConformity => {
                  const kind = classify(nonConformity);

                  // The anchor (`evidence`) is only used without a list: 'CONFIG' for configuration ones, 'ENS' for catalogue ones.
                  const involvedEvidences =
                    nonConformity.evidenceIds.length > 0
                      ? nonConformity.evidenceIds
                      : nonConformity.evidence
                      ? [nonConformity.evidence]
                      : [];

                  // Evidence motive first, engine verdict after: MotiveCell shows the first line and folds the rest.
                  const motiveRows: MotiveLine[] = [
                    ...evidenceMotives(nonConformity.evidenceIds),
                    ...(nonConformity.finding
                      ? [
                          {
                            texto: nonConformity.finding,
                            etiqueta: 'Motor',
                          },
                        ]
                      : []),
                  ];

                  const criticality = criticalityOf(nonConformity.evidenceIds);

                  const scope = describeScope(
                    nonConformity.agents,
                    totalMachines,
                  );

                  const scopeLabel =
                    nonConformity.cause === 'CATALOG'
                      ? 'Ámbito'
                      : nonConformity.origin === 'MEDIDA'
                      ? 'Observado en'
                      : 'Sin demostrar en';

                  const scopeText =
                    nonConformity.cause === 'CATALOG'
                      ? 'Todas las máquinas · no depende de ninguna'
                      : scope || '';

                  return (
                    <EuiFlexItem
                      key={nonConformity.id}
                      style={{ minWidth: 380 }}
                    >
                      <NonConformityCard
                        item={nonConformity}
                        clase={kind}
                        criticidad={criticality}
                        etiquetaAlcance={scopeLabel}
                        textoAlcance={scopeText}
                        lineasMotivo={motiveRows}
                        evidenciasImplicadas={involvedEvidences}
                        controlId={control.id}
                        conocidos={knownParts}
                        handlers={handlers}
                      />
                    </EuiFlexItem>
                  );
                })}
              </EuiFlexGroup>
            </div>
          ))}

      </EuiPanel>
    </EuiPage>
  );
};
