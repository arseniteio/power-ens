import React, { useEffect, useMemo, useState } from 'react';
import { useEsSearch } from '../../../../common/hooks/use-es-search';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButtonIcon,
  EuiLink,
  EuiPopover,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENSControl } from '../../types';
import { getActiveENSConfiguration } from '../../configuration/services';

interface ControlDetailENSProps {
  control: ENSControl;
  agentId?: string;
  onBack: () => void;
}

import {
  buildENSEvaluationTimeRangeFilter,
  getENSComplianceResultByControl,
  normalizeWazuhAlerts,
} from '../../core';
import {
  buildENSScopeAgentQueryFilter,
  getActiveENSScopeAgents,
} from '../../core/scope';

const getBadgeColor = (status: string) => {
  if (status === 'CUMPLE') {
    return 'success';
  }
  if (status === 'PARCIAL') {
    return 'warning';
  }
  if (status === 'NO_CUMPLE') {
    return 'danger';
  }
  return 'default';
};

const formatTraceabilityTimestamp = (timestamp?: string) => {
  if (!timestamp) {
    return undefined;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleString('es-ES');
};

export const ControlDetailENS = ({
   control,
   agentId,
   onBack,
 }: ControlDetailENSProps) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const [tracePageIndex, setTracePageIndex] = useState(0);
  const [tracePageSize, setTracePageSize] = useState(10);
  const [expandedTraceIds, setExpandedTraceIds] = useState<string[]>([]);

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
            { match_phrase: { 'data.ensfacil': control.id } },
            { match_phrase: { 'data.control': control.id } },
            { match_phrase: { 'data.control_id': control.id } },
            { match_phrase: { 'data.ens': control.id } },
          ],
          minimum_should_match: 1,
        },
      },
    ],
    size: 1000,
    sorting: [{ timestamp: { order: 'desc' } }],
    refreshKey,
  });

  const getHitTimestamp = (hit: any) =>
    hit?.['@timestamp'] ||
    hit?.data?.ts ||
    hit?.fields?.['@timestamp']?.[0] ||
    hit?.sort?.[0];

  const ensHits = ((esResults?.hits?.hits || []) as any[])
    .map(hit => ({
      ...(hit._source || {}),
      fields: hit.fields,
      sort: hit.sort,
    }))
    .sort((a, b) => {
      const dateA = new Date(getHitTimestamp(a) || 0).getTime();
      const dateB = new Date(getHitTimestamp(b) || 0).getTime();
      return dateB - dateA;
    });

    const hits = esResults?.hits?.hits || [];

  const normalizedEvents = useMemo(
    () => normalizeWazuhAlerts(hits),
    [hits],
  );

  const complianceResult = useMemo(
    () =>
      getENSComplianceResultByControl(
        control.id,
        ensLevel,
        normalizedEvents,
        agentId,
        scopeAgents,
      ),
    [
      control.id,
      ensLevel,
      normalizedEvents,
      agentId,
      scopeAgents,
    ],
  );

  const latestEvaluationDate = ensHits[0]
    ? new Date(getHitTimestamp(ensHits[0])).toLocaleDateString('es-ES')
    : 'Sin datos';

  const agenteNombre = agentId
    ? ((ensHits.find(h => h?.agent?.name)?.agent?.name) ||
       (ensHits.find(h => h?.data?.host)?.data?.host) ||
       ('Agente ' + agentId))
    : 'Todos los agentes (vista general)';



  const requirementItems = control.requirements.map(requirement => ({
    id: requirement.id,
    title: requirement.title,
    level: requirement.level.join(', '),
    evidences: requirement.evidences.join(', '),
    active: requirement.active === false ? 'NO_APLICA' : 'ACTIVO',
    description: requirement.description,
  }));

  const evidenceItems = control.evidences.map(evidence => ({
    id: evidence.id,
    title: evidence.title,
    requirement: evidence.requirement.join(', '),
    level: evidence.level.join(', '),
    expectedStatus: evidence.expectedStatus,
    ruleIds: evidence.wazuhRuleIds.join(', '),
    format: evidence.format,
  }));

  const parameterItems = control.parameters.map(parameter => ({
    id: parameter.id,
    name: parameter.name,
    level: parameter.level.join(', '),
    requirements: parameter.requirements.join(', '),
    type: parameter.type,
    usage: parameter.usage,
  }));

  const motorStatus = complianceResult?.status || 'NO_EVALUABLE';
  const motorScore = complianceResult?.score ?? 0;
  const nivelesTexto = String(ensLevel);

  const evidenceStatusItems = (complianceResult?.evidences || []).map(evidence => ({
    id: evidence.id,
    title: evidence.description,
    requirement: evidence.requirements.join(', '),
    level: evidence.levels.join(', '),
    status: evidence.status,
    ruleId: evidence.relatedRules.join(', '),
    impact:
      evidence.status === 'NO_EVALUABLE'
        ? 'Evidencia pendiente o no evaluable por el motor ENS'
        : evidence.status === 'NO_APLICA'
        ? 'Fuera de alcance para el nivel ENS actual'
        : evidence.status === 'NO_CUMPLE'
        ? 'Genera incumplimiento del control ENS'
        : evidence.status === 'CUMPLE'
        ? 'Soporta cumplimiento del control ENS'
        : 'Estado evaluado por el motor ENS',
  }));

  const nonConformityItems = (complianceResult?.nonConformities || []).map(
    nonConformity => ({
      id: nonConformity.id,
      evidence: nonConformity.evidenceId,
      requirement: nonConformity.requirementId,
      finding: nonConformity.finding,
      impact: nonConformity.impact,
      requiredAction: nonConformity.requiredAction,
      expected: nonConformity.expected,
      actual: nonConformity.actual,
      status: 'ABIERTA',
    }),
  );

  const openNonConformitiesCount = nonConformityItems.filter(
    item => item.status === 'ABIERTA',
  ).length;

  const traceabilityItems = (complianceResult?.traceability || []).map(
    (item, index) => ({
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
    }),
  );

  // --- Trazabilidad: vista compacta, paginada y con detalle expandible ---
  const traceabilityPageItems = traceabilityItems.slice(
    tracePageIndex * tracePageSize,
    tracePageIndex * tracePageSize + tracePageSize,
  );

  const toggleTraceDetail = (key: string) =>
    setExpandedTraceIds(current =>
      current.includes(key)
        ? current.filter(id => id !== key)
        : [...current, key],
    );

  const renderTraceDetail = (item: (typeof traceabilityItems)[number]) => (
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
      const item = traceabilityItems.find(trace => trace.key === key);

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
      render: (item: (typeof traceabilityItems)[number]) => (
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

  const totalEvidences = evidenceStatusItems.length || 1;
  const cumplePercent = Math.round((evidenceSummary.cumple / totalEvidences) * 100);
  const noEvaluablePercent = Math.round((evidenceSummary.noEvaluable / totalEvidences) * 100);
  const noAplicaPercent = Math.round((evidenceSummary.noAplica / totalEvidences) * 100);

  const globalScore = motorScore;
  const globalStatus = motorStatus;



  const donutWarningStart = Math.max(0, globalScore - 15);
  const donutBackground = `conic-gradient(#00a69b 0 ${donutWarningStart}%, #f5a700 ${donutWarningStart}% ${globalScore}%, #d3dae6 ${globalScore}% 100%)`;

  const auditorAction =
    openNonConformitiesCount === 0
      ? 'Sin acciones pendientes'
      : 'Revisar las no conformidades generadas por el motor ENS.';


  // Sin agente seleccionado no se mezclan datos de varios agentes:
  // un cumplimiento combinado no es válido para auditoría.
  return (
    <EuiPage paddingSize='m'>
      <EuiPanel>
        <EuiButtonEmpty iconType='arrowLeft' onClick={onBack}>
          Volver a controles
        </EuiButtonEmpty>

        <EuiSpacer size='s' />

        <EuiText size='s' color='subdued'>
          {/* De lo general a lo concreto: marco (`family`) y luego grupo
              (`category`), segun la convencion de catalog/. */}
          ENS / {control.family} / {control.category} / {control.id}
        </EuiText>

        <EuiTitle size='m'>
          <h2>
            {control.id.toUpperCase()} - {control.title}
          </h2>
        </EuiTitle>

        <EuiText>
          <p>
            Control ENS orientado a auditoría, evidencias, scoring y trazabilidad
            Wazuh. El objetivo es evaluar el cumplimiento {nivelesTexto} sin mostrar
            eventos técnicos como controles.
          </p>
        </EuiText>

        <EuiSpacer size='s' />

        <EuiPanel paddingSize='s'>
          <EuiText size='s'>
            <p>
              <strong>Activo:</strong> {agenteNombre} &nbsp; | &nbsp;
              <strong>Fuente:</strong> Wazuh / OpenSearch &nbsp; | &nbsp;
              <strong>Nivel ENS:</strong> {nivelesTexto} &nbsp; | &nbsp;
              <strong>Última evaluación:</strong> {latestEvaluationDate}
            </p>
          </EuiText>
        </EuiPanel>

        <EuiSpacer size='l' />

        <EuiPanel>
          <EuiTitle size='s'>
            <h3>Panel ejecutivo {control.id.toUpperCase()}</h3>
          </EuiTitle>
          <EuiText size='s' color='subdued'>
            <p>
                Vista de cumplimiento ENS para el control {control.id}. Muestra
                el nivel configurado, el resultado del motor, las evidencias,
                las no conformidades y la trazabilidad del control.
            </p>
          </EuiText>

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
                      width: 170,
                      height: 170,
                      borderRadius: '50%',
                      background: donutBackground,
                      margin: '0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 108,
                        height: 108,
                        borderRadius: '50%',
                        background: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                      }}
                    >
                      <EuiText>
                        <strong style={{ fontSize: 30 }}>{globalScore}%</strong>
                        <br />
                        {globalStatus}
                      </EuiText>
                    </div>
                  </div>
                </div>
                  <EuiFlexGroup gutterSize='s' justifyContent='center'>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={getBadgeColor(motorStatus)}>
                        {nivelesTexto} · {motorScore}% · {motorStatus}
                      </EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                <EuiSpacer size='s' />
                <EuiFlexGroup gutterSize='s' justifyContent='center' wrap>
                  <EuiFlexItem grow={false}>
                    <EuiHealth color='success'>Cumplen {evidenceSummary.cumple}</EuiHealth>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiHealth color='subdued'>No aplica {evidenceSummary.noAplica}</EuiHealth>
                  </EuiFlexItem>
                  {evidenceSummary.noCumple > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiHealth color='danger'>No cumplen {evidenceSummary.noCumple}</EuiHealth>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiPanel>
            </EuiFlexItem>

            <EuiFlexItem grow={1}>
              <EuiPanel>
                <EuiTitle size='xs'>
                  <h4>Evidencias por estado</h4>
                </EuiTitle>
                <EuiSpacer size='m' />

                <EuiText size='s'>
                  <p><strong>Cumplen</strong> {evidenceSummary.cumple} / {totalEvidences}</p>
                </EuiText>
                <div style={{ background: '#eef2f7', height: 12, borderRadius: 8 }}>
                  <div style={{ width: `${cumplePercent}%`, background: '#00a69b', height: 12, borderRadius: 8 }} />
                </div>

                <EuiSpacer size='m' />

                <EuiText size='s'>
                  <p><strong>No evaluable</strong> {evidenceSummary.noEvaluable} / {totalEvidences}</p>
                </EuiText>
                <div style={{ background: '#eef2f7', height: 12, borderRadius: 8 }}>
                  <div style={{ width: `${noEvaluablePercent}%`, background: '#d3dae6', height: 12, borderRadius: 8 }} />
                </div>

                <EuiSpacer size='m' />

                <EuiText size='s'>
                  <p><strong>No aplica</strong> {evidenceSummary.noAplica} / {totalEvidences}</p>
                </EuiText>
                <div style={{ background: '#eef2f7', height: 12, borderRadius: 8 }}>
                  <div style={{ width: `${noAplicaPercent}%`, background: '#69707d', height: 12, borderRadius: 8 }} />
                </div>

                  <EuiSpacer size='m' />
                  <EuiBadge color={getBadgeColor(motorStatus)}>
                    Estado del control: {motorStatus}
                  </EuiBadge>
              </EuiPanel>
            </EuiFlexItem>

              <EuiFlexItem grow={1}>
                <EuiPanel>
                  <EuiTitle size='xs'>
                    <h4>Resultado actual del motor ENS</h4>
                  </EuiTitle>

                  <EuiSpacer size='m' />

                  <EuiStat
                    title={`${motorScore}%`}
                    description={`Nivel ENS activo: ${nivelesTexto}`}
                    titleColor={getBadgeColor(motorStatus)}
                  />

                  <EuiSpacer size='s' />

                  <EuiBadge color={getBadgeColor(motorStatus)}>
                    {motorStatus}
                  </EuiBadge>
                </EuiPanel>
              </EuiFlexItem>

              <EuiFlexItem grow={1}>
                <EuiPanel>
                  <EuiTitle size='xs'>
                    <h4>Detalle auditor</h4>
                  </EuiTitle>

                  <EuiSpacer size='s' />

                  <EuiText size='s'>
                    <p><strong>Activo:</strong> {agenteNombre}</p>
                    <p><strong>Fuente:</strong> Wazuh / OpenSearch</p>
                    <p><strong>Nivel ENS activo:</strong> {nivelesTexto}</p>
                    <p><strong>Última evaluación:</strong> {latestEvaluationDate}</p>
                  </EuiText>

                  <EuiSpacer size='s' />

                  <EuiBadge color={getBadgeColor(motorStatus)}>
                    {nivelesTexto} · {motorScore}% · {motorStatus}
                  </EuiBadge>

                  <EuiSpacer size='s' />

                  <EuiText size='s'>
                    <p><strong>No conformidades abiertas:</strong> {openNonConformitiesCount}</p>
                    <p><strong>Acción:</strong> {auditorAction}</p>
                  </EuiText>
                </EuiPanel>
              </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size='m' />

            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiPanel>
                  <EuiStat
                    title={nivelesTexto}
                    description='Nivel ENS activo'
                  />
                </EuiPanel>
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiPanel>
                  <EuiStat
                    title={`${motorScore}%`}
                    description='Score del control'
                    titleColor={getBadgeColor(motorStatus)}
                  />
                </EuiPanel>
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiPanel>
                  <EuiStat
                    title={motorStatus}
                    description='Estado del control'
                    titleColor={getBadgeColor(motorStatus)}
                  />
                </EuiPanel>
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiPanel>
                  <EuiStat
                    title={String(openNonConformitiesCount)}
                    description='No conformidades abiertas'
                    titleColor={openNonConformitiesCount > 0 ? 'danger' : 'success'}
                  />
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        <EuiSpacer size='l' />

        <EuiTitle size='s'>
          <h3>Evidencias ENS del control</h3>
        </EuiTitle>
        <EuiText>
          <p>
              Evidencias asociadas al control {control.id}. Cada evidencia muestra
              el estado resuelto por el motor, el requisito ENS, el nivel y
              su impacto sobre el cumplimiento {nivelesTexto}.
          </p>
        </EuiText>

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
            },
            {
              field: 'status',
              name: 'Estado',
              width: '150px',
              render: (status: string) => {
                const icon =
                  status === 'CUMPLE' ? 'check'
                  : status === 'NO_CUMPLE' ? 'cross'
                  : status === 'NO_EVALUABLE' ? 'clock'
                  : 'minus';
                return (
                  <EuiBadge color={getBadgeColor(status)} iconType={icon}>
                    {status}
                  </EuiBadge>
                );
              },
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
              field: 'impact',
              name: 'Impacto',
              render: (impact: string) => (
                <EuiText size='xs' color='subdued'>{impact}</EuiText>
              ),
            },
          ]}
        />

        <EuiSpacer size='l' />

          <EuiPanel>
            <EuiTitle size='s'>
              <h3>Remediación del control</h3>
            </EuiTitle>

            <EuiSpacer size='m' />

            {openNonConformitiesCount === 0 ? (
              <EuiCallOut
                title='No existen no conformidades abiertas'
                color='success'
                iconType='check'
              >
                El motor ENS no ha generado acciones de remediación pendientes.
              </EuiCallOut>
            ) : (
              <EuiCallOut
                title={`${openNonConformitiesCount} no conformidad(es) abierta(s)`}
                color='warning'
                iconType='alert'
              >
                {auditorAction}
              </EuiCallOut>
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
                {traceabilityItems.length} registro
                {traceabilityItems.length === 1 ? '' : 's'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size='s' />

          {traceabilityItems.length === 0 ? (
            <EuiText size='s' color='subdued'>
              <p>
                No hay información de trazabilidad disponible para este control.
              </p>
            </EuiText>
          ) : (
            <EuiBasicTable
              items={traceabilityPageItems}
              itemId='key'
              itemIdToExpandedRowMap={traceExpandedRowMap}
              isExpandable={true}
              compressed={true}
              columns={traceabilityColumns}
              pagination={{
                pageIndex: tracePageIndex,
                pageSize: tracePageSize,
                totalItemCount: traceabilityItems.length,
                pageSizeOptions: [5, 10, 25, 50],
              }}
              onChange={({ page }) => {
                if (page) {
                  setTracePageIndex(page.index);
                  setTracePageSize(page.size);
                }
              }}
            />
          )}
        </EuiPanel>


        <EuiSpacer size='l' />


        <EuiSpacer size='l' />

        <EuiTitle size='s'>
          <h3>No conformidades ENS</h3>
        </EuiTitle>
        <EuiText>
          <p>
            Hallazgos que impiden cerrar el cumplimiento completo del control.
            Cada tarjeta muestra evidencia afectada, requisito ENS, impacto y
            acción correctiva.
          </p>
        </EuiText>

        <EuiSpacer size='s' />

        <EuiFlexGroup>
          {nonConformityItems.map(nonConformity => (
            <EuiFlexItem key={nonConformity.id}>
              <EuiPanel>
                <EuiFlexGroup justifyContent='spaceBetween' alignItems='center'>
                  <EuiFlexItem grow={false}>
                    <EuiTitle size='xs'>
                      <h4>{nonConformity.id}</h4>
                    </EuiTitle>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge
                      color={
                        nonConformity.status === 'ABIERTA'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {nonConformity.status}
                    </EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size='s' />

                <EuiText size='s'>
                  <p>
                    <strong>{nonConformity.evidence}</strong> ·{' '}
                    {nonConformity.requirement}
                    <EuiPopover
                      button={
                        <EuiButtonIcon
                          iconType='iInCircle'
                          aria-label='Info del control'
                          onClick={() =>
                            setOpenInfoId(
                              openInfoId === nonConformity.id
                                ? null
                                : nonConformity.id,
                            )
                          }
                        />
                      }
                      isOpen={openInfoId === nonConformity.id}
                      closePopover={() => setOpenInfoId(null)}
                      anchorPosition='upCenter'
                    >
                      <div style={{ maxWidth: 320 }}>
                        <EuiText size='s'>
                          <p>
                            <strong>Control ENS:</strong> {control.id}
                          </p>
                          <p>
                            <strong>Requisito:</strong>{' '}
                            {nonConformity.requirement}
                          </p>
                          <p>
                            <strong>Evidencia:</strong>{' '}
                            {nonConformity.evidence}
                          </p>
                          <p>
                            <strong>Impacto ENS:</strong>{' '}
                            {nonConformity.impact}
                          </p>
                          <p>
                            <strong>Acción requerida:</strong>{' '}
                            {nonConformity.requiredAction}
                          </p>
                          <EuiLink
                            href='https://gobernanza.ccn-cert.cni.es/ens-navegable'
                            target='_blank'
                            external
                          >
                            Ver control en ENS navegable (CCN-CERT)
                          </EuiLink>
                        </EuiText>
                      </div>
                    </EuiPopover>
                  </p>
                  <p>{nonConformity.finding}</p>
                  <p>
                    <strong>Impacto ENS:</strong> {nonConformity.impact}
                  </p>
                  <p>
                    <strong>Acción requerida:</strong>{' '}
                    {nonConformity.requiredAction}
                  </p>
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>

      </EuiPanel>
    </EuiPage>
  );
};
