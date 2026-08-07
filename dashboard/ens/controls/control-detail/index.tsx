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
// Del fichero de tipos, nunca del barrel `../../core`: `import type` se borra
// entero al compilar, así que esto no añade ninguna arista al grafo de módulos
// (el ciclo transitivo del TDZ de `Settings` vive justo ahí).
import type { ENSObservationGroup } from '../../core/evaluation/types';
// Cuánto se enseña de la vista general y cómo se nombran las máquinas. Es
// lógica pura y vive aparte para poder comprobarla sin `react` ni `@elastic/eui`.
import {
  describirAlcance,
  etiquetaDeMaquinas,
  resumirMotivos,
} from './general-view';
import { getActiveENSConfiguration } from '../../configuration/services';
import { ControlEvolutionChart } from './evolution-chart';
import { buildENSControlComplianceTimeline } from '../../core/timeline/control-timeline';

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

  // La serie diaria DE ESTE CONTROL. Se calcula con los mismos eventos y el
  // mismo alcance que el resultado de arriba, así que su último punto es el
  // mismo número: es lo que la hace comprobable de un vistazo.
  const controlTimeline = useMemo(
    () =>
      buildENSControlComplianceTimeline(
        control.id,
        ensLevel,
        normalizedEvents,
        {
          agentId,
          scopeAgents,
          days: 30,
        }
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

  // Sobre cuántas máquinas se ha resumido la vista general. Solo existe
  // consolidando: con un agente seleccionado, la máquina es el contexto entero
  // de la pantalla y no hay nada que contar.
  const totalMaquinas = (complianceResult?.consolidatedAgents || []).length;

  const agenteNombre = agentId
    ? ((ensHits.find(h => h?.agent?.name)?.agent?.name) ||
       (ensHits.find(h => h?.data?.host)?.data?.host) ||
       ('Agente ' + agentId))
    // Decir cuántas máquinas hay detrás es lo que convierte «6 de ellas fallan»
    // en un dato: sin el total, un recuento no se puede leer.
    : totalMaquinas > 0
    ? `Todos los agentes (vista general · ${totalMaquinas} máquina${
        totalMaquinas === 1 ? '' : 's'
      })`
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

  // Desde el 04/08 todo lo que aplica trae número. El único caso sin número es
  // el control que no rige en el nivel activo (o el que no está en el catálogo
  // del motor), y ahí sigue sin pintarse un "0 %" en rojo.
  const motorScore =
    typeof complianceResult?.score === 'number'
      ? complianceResult.score
      : undefined;

  const motorScoreTexto =
    motorScore !== undefined
      ? `${motorScore}%`
      : motorStatus === 'NO_APLICA'
      ? 'no aplica'
      : 'sin datos';

  const requisitosAplicables = complianceResult?.applicableRequirements ?? 0;

  // Requisitos que CUMPLEN, que es de donde sale el porcentaje. No se deduce
  // del `score`: un requisito PARCIAL ya no existe, pero uno NO_APLICA sí, y
  // dividir mal aquí produciría justo la contradicción que esta pantalla
  // acaba de dejar de tener.
  const requisitosCumplen = (complianceResult?.requirements || []).filter(
    (requisito: any) => requisito.status === 'CUMPLE'
  ).length;
  const requisitosMedidos = complianceResult?.measuredRequirements ?? 0;

  // EL DENOMINADOR TIENE QUE SER EL MISMO CONJUNTO QUE EL NUMERADOR.
  //
  // `applicableRequirements` viene sumado POR MÁQUINA cuando se consolidan
  // varias: con dos máquinas y ocho requisitos aplicables vale 16. Pero
  // `requisitosCumplen` cuenta sobre la lista CONSOLIDADA, que tiene ocho
  // entradas —una por requisito, con el peor estado—. «4 de 16» no era una
  // fracción: eran dos conjuntos distintos puestos uno al lado del otro.
  //
  // Se cuenta sobre la lista consolidada, igual que el numerador. Cuántas
  // máquinas hay detrás se dice en la cabecera, que es donde toca.
  const requisitosConsolidados = (complianceResult?.requirements || []).filter(
    (requisito: any) => requisito.status !== 'NO_APLICA'
  ).length;

  const esVistaAgregada = !agentId && totalMaquinas > 1;

  const requisitosDelDenominador = esVistaAgregada
    ? requisitosConsolidados
    : requisitosAplicables;

  // Qué mide el porcentaje. El denominador son los APLICABLES: lo que no se ha
  // podido demostrar resta, porque la carga de la prueba es del auditado. Los
  // demostrados se dicen al lado, que es el diagnóstico: «60 %, 5 de 8
  // demostrados» y «60 %, 8 de 8 demostrados» son dos máquinas muy distintas.
  const baseDelScore =
    `${requisitosAplicables} requisito${
      requisitosAplicables === 1 ? '' : 's'
    } aplicable${requisitosAplicables === 1 ? '' : 's'}` +
    ` · ${requisitosMedidos} demostrado${requisitosMedidos === 1 ? '' : 's'}`;

  const nivelesTexto = String(ensLevel);

  const evidenceStatusItems = (complianceResult?.evidences || []).map(evidence => ({
    id: evidence.id,
    title: evidence.description,
    requirement: evidence.requirements.join(', '),
    level: evidence.levels.join(', '),
    status: evidence.status,
    ruleId: evidence.relatedRules.join(', '),
    // El motivo que resolvió el motor: qué cuenta concreta incumple, qué
    // parámetro falta, por qué la cobertura del recolector no basta. Es lo
    // primero que pregunta quien ve una evidencia en gris o en rojo, y hasta
    // ahora no estaba en ninguna pantalla.
    //
    // Con un agente seleccionado se lee tal cual. En la vista general se lee de
    // `motivos`: ahí, concatenar el de las siete máquinas llenaba la celda de
    // quince líneas que decían casi lo mismo.
    motivo: (evidence.observations || []).join(' · '),
    motivos: evidence.observationGroups || [],
    impact:
      evidence.status === 'NO_EVALUABLE'
        ? 'Sin evidencia: no se ha podido demostrar, y lo no demostrado cuenta como incumplimiento del control'
        : evidence.status === 'NO_APLICA'
        ? 'Fuera de alcance para el nivel ENS actual'
        : evidence.status === 'NO_CUMPLE'
        ? 'Genera incumplimiento del control ENS'
        : evidence.status === 'CUMPLE'
        ? 'Soporta cumplimiento del control ENS'
        : 'Estado evaluado por el motor ENS',
  }));

  // UNA sola lista y UN solo contador. Lo que hasta el 04/08 eran tarjetas `PM-`
  // en una lista propia son ahora no conformidades con `origin` a
  // NO_EVIDENCIADA: el veredicto es el mismo, así que el número también, y lo
  // que las distingue —el motivo y la acción— vive dentro de la tarjeta.
  const nonConformityItems = (complianceResult?.nonConformities || []).map(
    nonConformity => ({
      id: nonConformity.id,
      evidence: nonConformity.evidenceId,
      evidences: (nonConformity.evidenceIds || []).join(', '),
      requirement: nonConformity.requirementId,
      finding: nonConformity.finding,
      impact: nonConformity.impact,
      requiredAction: nonConformity.requiredAction,
      expected: nonConformity.expected,
      actual: nonConformity.actual,
      parameters: (nonConformity.parameterIds || []).join(', '),
      origin: nonConformity.origin,
      cause: nonConformity.cause,
      // Las máquinas en las que se ha observado ESTE hallazgo. Una tarjeta
      // idéntica en seis máquinas es una tarjeta con seis máquinas; si el
      // hallazgo difiere (otra cuenta, otro motivo), el motor ya las separa.
      agents: nonConformity.agents || [],
      status: 'ABIERTA',
    }),
  );

  const openNonConformitiesCount = nonConformityItems.length;

  // El desglose del MISMO número, no otro contador: cuántas se han demostrado
  // midiendo y cuántas cuentan por no haberse podido demostrar. Son dos
  // acciones distintas y las ejecutan personas distintas.
  const medidas = nonConformityItems.filter(item => item.origin === 'MEDIDA');

  const noEvidenciadas = nonConformityItems.filter(
    item => item.origin === 'NO_EVIDENCIADA',
  );

  // Dos números que no miden lo mismo y los dos hacen falta: cuántos problemas
  // DISTINTOS hay (el recuento de tarjetas) y cuánto parque tocan.
  const maquinasConNoConformidad = new Set(
    nonConformityItems.flatMap(item =>
      item.agents.map(agent => agent.agentId),
    ),
  ).size;

  // Lo que es del catálogo se cuenta aparte porque el arreglo no lo tiene el
  // cliente: «op.acc.1.5 no declara evidencia» es cierto en todas las máquinas
  // por igual y no se desbloquea configurando ni tocando un agente.
  const catalogGapsCount = noEvidenciadas.filter(
    item => item.cause === 'CATALOG',
  ).length;

  // El agente caído tiene su propio recuento: no es un hallazgo sobre ninguna
  // máquina, es que la recogida no funciona, y quien lo arregla no es quien
  // corrige el sistema auditado.
  const collectionGapsCount = noEvidenciadas.filter(
    item => item.cause === 'COLLECTION',
  ).length;

  const maquinasSinDemostrar = new Set(
    noEvidenciadas.flatMap(item => item.agents.map(agent => agent.agentId)),
  ).size;

  // Etiqueta de la insignia de cada tarjeta. Dice en una línea qué clase de
  // incumplimiento es y, si no está demostrado, de quién es el arreglo.
  const etiquetaDeOrigen = (item: (typeof nonConformityItems)[number]): string =>
    item.origin === 'MEDIDA'
      ? 'Medido'
      : item.cause === 'CATALOG'
      ? 'No evidenciado · del catálogo'
      : item.cause === 'CONFIGURATION'
      ? 'No evidenciado · sin configurar'
      : item.cause === 'COLLECTION'
      ? 'No evidenciado · fallo de recogida'
      : 'No evidenciado · evidencia insuficiente';

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

  const globalStatus = motorStatus;

  // Sin número no hay rosco que pintar: el anillo entero en gris dice "no se ha
  // medido", y no un 0 % en rojo.
  const donutBackground =
    motorScore === undefined
      ? 'conic-gradient(#d3dae6 0 100%)'
      : `conic-gradient(#00a69b 0 ${Math.max(
          0,
          motorScore - 15,
        )}%, #f5a700 ${Math.max(0, motorScore - 15)}% ${motorScore}%, #d3dae6 ${motorScore}% 100%)`;

  // Acciones distintas para cosas distintas, aunque el veredicto sea el mismo.
  // Un incumplimiento no evidenciado no se "revisa": se configura el parámetro
  // que falta, se restablece la recogida o lo arregla el producto.
  const auditorAction =
    openNonConformitiesCount === 0
      ? 'Sin acciones pendientes'
      : medidas.length > 0 && noEvidenciadas.length > 0
      ? `Dos frentes: corregir ${medidas.length} incumplimiento(s) medido(s) en el sistema y habilitar la prueba de ${noEvidenciadas.length} que no se han podido demostrar.`
      : medidas.length > 0
      ? 'Corregir en el sistema los incumplimientos medidos por el motor ENS.'
      : catalogGapsCount === noEvidenciadas.length
      ? 'Ningún incumplimiento medido. Lo que falta por demostrar es del catálogo del producto, no de la configuración ni de los agentes.'
      : collectionGapsCount === noEvidenciadas.length
      ? 'Ningún incumplimiento medido: no llega el dato. Es un fallo de RECOGIDA (agente o recolector), no una corrección en el sistema auditado.'
      : 'Ningún incumplimiento medido: falta habilitar la prueba. Ver el detalle de cada no conformidad no evidenciada.';


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
                        <strong style={{ fontSize: 30 }}>{motorScoreTexto}</strong>
                        <br />
                        {globalStatus}
                      </EuiText>
                    </div>
                  </div>
                </div>
                  <EuiFlexGroup gutterSize='s' justifyContent='center'>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={getBadgeColor(motorStatus)}>
                        {nivelesTexto} · {motorScoreTexto} · {motorStatus}
                      </EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                <EuiSpacer size='s' />

                {/* CADA NÚMERO DICE DE QUÉ ES, y no es un detalle de estilo.
                    Aquí se pintaba «38 %» —que es de REQUISITOS— y justo
                    debajo «Cumplen 6» —que es de EVIDENCIAS—, sin decir ni
                    una cosa ni la otra. Dos denominadores distintos bajo el
                    mismo título es una contradicción aparente que hace
                    desconfiar del número entero, y el número es lo único que
                    el auditor se lleva.

                    Que 6 evidencias en verde convivan con un 38 % es correcto:
                    un requisito con tres evidencias buenas y una mala NO
                    cumple. Lo que faltaba era decirlo. */}
                <EuiFlexGroup gutterSize='s' justifyContent='center' wrap>
                  <EuiFlexItem grow={false}>
                    <EuiText size='xs' color='subdued'>
                      <strong>Requisitos</strong>{' '}
                      {requisitosCumplen} de {requisitosDelDenominador} cumplen
                      {' · '}
                      {/* CON UNA MÁQUINA la fracción ES el porcentaje y se
                          puede decir. AGREGANDO VARIAS no: el numerador cuenta
                          requisitos deduplicados —uno por requisito, con el
                          peor estado— y el denominador los sumaba por máquina,
                          así que «4 de 16» ni siquiera era una fracción del
                          mismo conjunto y el 57 % de al lado salía de otra
                          cuenta. Se decía «el 57 % sale de aquí» y era mentira.
                          Ahora el denominador es el mismo conjunto que el
                          numerador, y de dónde sale el porcentaje se dice
                          aparte, que es lo que de verdad ocurre. */}
                      {esVistaAgregada
                        ? `el ${motorScoreTexto} es la media de las ${totalMaquinas} máquinas`
                        : `el ${motorScoreTexto} sale de aquí`}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size='xs' />

                <EuiFlexGroup gutterSize='s' justifyContent='center' wrap>
                  <EuiFlexItem grow={false}>
                    <EuiText size='xs' color='subdued'>
                      <strong>Evidencias</strong>{' '}
                      {evidenceSummary.cumple} de {totalEvidences} cumplen
                      {evidenceSummary.noCumple > 0
                        ? ` · ${evidenceSummary.noCumple} no`
                        : ''}
                      {evidenceSummary.noEvaluable > 0
                        ? ` · ${evidenceSummary.noEvaluable} sin prueba`
                        : ''}
                    </EuiText>
                  </EuiFlexItem>
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
                  {/* «No evaluable» era el nombre de un veredicto que ya no
                      existe. La evidencia sigue saliendo en gris porque el gris
                      describe la PRUEBA —no ha llegado—, pero el requisito que
                      depende de ella no cumple, y el rótulo tiene que decirlo. */}
                  <p><strong>Sin evidencia (cuenta como incumplimiento)</strong> {evidenceSummary.noEvaluable} / {totalEvidences}</p>
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
                    title={motorScoreTexto}
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
                    {nivelesTexto} · {motorScoreTexto} · {motorStatus}
                  </EuiBadge>

                  <EuiSpacer size='s' />

                  {/* Los recuentos cuentan HALLAZGOS DISTINTOS, no
                      hallazgo × máquina: el mismo problema en siete servidores
                      es un problema. Cuánto parque toca se dice al lado, que es
                      la otra mitad del dato. */}
                  <EuiText size='s'>
                    <p>
                      <strong>No conformidades abiertas:</strong>{' '}
                      {openNonConformitiesCount}
                      {maquinasConNoConformidad > 0 &&
                        ` · en ${maquinasConNoConformidad} máquina${
                          maquinasConNoConformidad === 1 ? '' : 's'
                        }`}
                    </p>
                    {/* El desglose del MISMO número, sangrado para que se lea
                        como tal y no como un segundo contador. */}
                    <p style={{ paddingLeft: 12 }}>
                      <strong>· medidas:</strong> {medidas.length}
                      <br />
                      <strong>· no evidenciadas:</strong>{' '}
                      {noEvidenciadas.length}
                      {maquinasSinDemostrar > 0 &&
                        ` · en ${maquinasSinDemostrar} máquina${
                          maquinasSinDemostrar === 1 ? '' : 's'
                        }`}
                      {catalogGapsCount > 0 &&
                        ` · ${catalogGapsCount} del catálogo`}
                      {collectionGapsCount > 0 &&
                        ` · ${collectionGapsCount} por fallo de recogida`}
                    </p>
                    <p><strong>Base del score:</strong> {baseDelScore}</p>
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
                    title={motorScoreTexto}
                    description={`Score del control · ${baseDelScore}`}
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

              {/* Desglose, no un segundo total: la suma de las dos cifras es
                  exactamente el contador de arriba. Se enseña porque la acción
                  y quien la ejecuta son distintas, no porque una cuente menos. */}
              <EuiFlexItem>
                <EuiPanel>
                  <EuiStat
                    title={String(noEvidenciadas.length)}
                    description={`No evidenciadas (de ${openNonConformitiesCount})`}
                    titleColor={noEvidenciadas.length > 0 ? 'danger' : 'success'}
                  />
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
          />
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

          {!agentId && totalMaquinas > 1 && (
            <p>
              Vista general de {totalMaquinas} máquinas: el mismo motivo
              observado en varias se escribe <strong>una vez</strong>, diciendo
              en cuántas ocurre. Los motivos que difieren entre máquinas salen
              por separado.
            </p>
          )}
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
            {
              field: 'motivos',
              name: 'Motivo',
              render: (
                motivos: ENSObservationGroup[],
                item: (typeof evidenceStatusItems)[number],
              ) => {
                // Vista de un agente: no hay nada que agrupar, la máquina es la
                // pantalla entera.
                if (motivos.length === 0) {
                  return item.motivo ? (
                    <EuiText size='xs'>{item.motivo}</EuiText>
                  ) : (
                    <EuiText size='xs' color='subdued'>
                      Sin motivo registrado
                    </EuiText>
                  );
                }

                const { visibles, ocultos } = resumirMotivos(motivos);

                return (
                  <EuiText size='xs'>
                    {visibles.map(grupo => (
                      <p key={grupo.text} style={{ marginBottom: 6 }}>
                        {/* En cuántas máquinas ocurre, delante del texto: es lo
                            que distingue «pasa en toda la flota» de «pasa en
                            una». Con una sola, se la nombra. */}
                        <EuiBadge color='hollow'>
                          {etiquetaDeMaquinas(grupo.agents, totalMaquinas)}
                        </EuiBadge>{' '}
                        {grupo.text}
                      </p>
                    ))}

                    {/* Lo que no cabe se anuncia, nunca se calla: agregar no es
                        esconder. El detalle entero está seleccionando el agente. */}
                    {ocultos > 0 && (
                      <p style={{ color: '#69707D' }}>
                        y {ocultos} motivo{ocultos === 1 ? '' : 's'} más ·
                        seleccione un agente para verlos todos
                      </p>
                    )}
                  </EuiText>
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

            <EuiSpacer size='m' />

            {openNonConformitiesCount === 0 ? (
              <EuiCallOut
                title='No existen no conformidades abiertas'
                color='success'
                iconType='check'
              >
                Todo lo aplicable en este control se ha demostrado conforme.
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

            {/* Aviso informativo (`color='primary'`, nunca `warning`): no
                rebaja el veredicto —la tarjeta ya está contada arriba— sino que
                dice a QUIÉN le toca. El fallo de recogida se avisa aparte
                porque no lo arregla quien corrige el sistema auditado. */}
            {collectionGapsCount > 0 && (
              <>
                <EuiSpacer size='s' />

                <EuiCallOut
                  title={`${collectionGapsCount} de ellas no llegan por un fallo de RECOGIDA`}
                  color='primary'
                  iconType='offline'
                >
                  Cuentan como incumplimiento —sin prueba no hay cumplimiento—
                  pero no son hallazgos sobre la máquina: el agente no reporta,
                  el recolector no ha ejecutado o no hay latido. Lo arregla quien
                  opera Wazuh y los agentes.
                </EuiCallOut>
              </>
            )}

            {catalogGapsCount > 0 && (
              <>
                <EuiSpacer size='s' />

                <EuiCallOut
                  title={`${catalogGapsCount} de ellas dependen del catálogo del producto`}
                  color='primary'
                  iconType='package'
                >
                  El requisito no declara ninguna evidencia con la que
                  demostrarse. No hay nada que configurar en el cliente ni
                  ningún agente que arreglar.
                </EuiCallOut>
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
            Todo lo que el control no cumple, en una sola lista y con un solo
            número. Desde el 04/08 la carga de la prueba es del auditado: lo que
            se ha medido y falla y lo que no se ha podido demostrar cuentan
            igual. Lo que <strong>no</strong> es igual es qué hacer con cada
            cosa, y eso lo dice cada tarjeta.
          </p>

          {!agentId && totalMaquinas > 1 && (
            <p>
              Una tarjeta por <strong>hallazgo</strong>, no por máquina: el mismo
              hallazgo en varias se agrupa y las nombra. Si difiere (otra cuenta,
              otro motivo), son tarjetas distintas. Las marcadas «del catálogo»
              no dependen de ninguna máquina.
            </p>
          )}
        </EuiText>

        <EuiSpacer size='s' />

        {nonConformityItems.length === 0 && (
          <EuiText size='s' color='subdued'>
            <p>Todo lo aplicable en este control se ha demostrado conforme.</p>
          </EuiText>
        )}

        {/* Dos bloques, un contador. El orden es el de la acción: primero lo
            que hay que corregir en el sistema, después lo que hay que poder
            demostrar. */}
        {[
          {
            clave: 'medidas',
            titulo: `Medidas · ${medidas.length}`,
            explicacion:
              'El motor ha mirado y el resultado no conforma. Hay algo que corregir en el sistema auditado.',
            items: medidas,
          },
          {
            clave: 'no-evidenciadas',
            titulo: `No evidenciadas · ${noEvidenciadas.length}`,
            explicacion:
              'No se ha podido demostrar. Cuentan igual —sin prueba no hay cumplimiento— pero la acción no es corregir la máquina: es habilitar la prueba, y cada tarjeta dice quién y dónde.',
            items: noEvidenciadas,
          },
        ]
          .filter(bloque => bloque.items.length > 0)
          .map(bloque => (
            <div key={bloque.clave}>
              <EuiSpacer size='m' />

              <EuiTitle size='xxs'>
                <h4>{bloque.titulo}</h4>
              </EuiTitle>

              <EuiText size='xs' color='subdued'>
                <p>{bloque.explicacion}</p>
              </EuiText>

              <EuiSpacer size='s' />

              <EuiFlexGroup wrap>
                {bloque.items.map(nonConformity => (
                  <EuiFlexItem key={nonConformity.id}>
                    <EuiPanel
                      color={
                        nonConformity.origin === 'MEDIDA' ? 'plain' : 'subdued'
                      }
                    >
                      <EuiFlexGroup
                        justifyContent='spaceBetween'
                        alignItems='center'
                      >
                        <EuiFlexItem grow={false}>
                          <EuiTitle size='xs'>
                            <h4>{nonConformity.id}</h4>
                          </EuiTitle>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiFlexGroup gutterSize='xs' alignItems='center'>
                            {/* Qué clase de incumplimiento es. Es lo que
                                sustituye al prefijo `PM-`: la distinción sigue
                                a la vista, pero ya no en un contador aparte. */}
                            <EuiFlexItem grow={false}>
                              <EuiBadge
                                color='hollow'
                                iconType={
                                  nonConformity.origin === 'MEDIDA'
                                    ? 'inspect'
                                    : nonConformity.cause === 'CATALOG'
                                    ? 'package'
                                    : nonConformity.cause === 'COLLECTION'
                                    ? 'offline'
                                    : 'gear'
                                }
                              >
                                {etiquetaDeOrigen(nonConformity)}
                              </EuiBadge>
                            </EuiFlexItem>
                            <EuiFlexItem grow={false}>
                              <EuiBadge color='warning'>
                                {nonConformity.status}
                              </EuiBadge>
                            </EuiFlexItem>
                          </EuiFlexGroup>
                        </EuiFlexItem>
                      </EuiFlexGroup>

                      <EuiSpacer size='s' />

                      <EuiText size='s'>
                        <p>
                          <strong>
                            {nonConformity.evidences || nonConformity.evidence}
                          </strong>{' '}
                          · {nonConformity.requirement}
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
                                  {nonConformity.evidences ||
                                    nonConformity.evidence}
                                </p>
                                <p>
                                  <strong>Clase:</strong>{' '}
                                  {etiquetaDeOrigen(nonConformity)}
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

                        {/* Dónde. Antes esto iba pegado al texto («[srv (025)]
                            El requisito...») y obligaba a repetir la tarjeta
                            entera una vez por máquina. */}
                        {nonConformity.cause === 'CATALOG' ? (
                          <p style={{ color: '#69707D' }}>
                            Igual en todas las máquinas: no depende de ninguna, y
                            seleccionar un agente no dará otra respuesta.
                          </p>
                        ) : (
                          describirAlcance(
                            nonConformity.agents,
                            totalMaquinas,
                          ) && (
                            <p>
                              <strong>
                                {nonConformity.origin === 'MEDIDA'
                                  ? 'Demostrado en:'
                                  : 'Sin demostrar en:'}
                              </strong>{' '}
                              {describirAlcance(
                                nonConformity.agents,
                                totalMaquinas,
                              )}
                            </p>
                          )
                        )}

                        <p>
                          <strong>Impacto ENS:</strong> {nonConformity.impact}
                        </p>
                        <p>
                          <strong>
                            {nonConformity.origin === 'MEDIDA'
                              ? 'Acción requerida:'
                              : 'Para poder demostrarlo:'}
                          </strong>{' '}
                          {nonConformity.requiredAction}
                        </p>
                        {nonConformity.parameters && (
                          <p>
                            <strong>Parámetros implicados:</strong>{' '}
                            {nonConformity.parameters}
                          </p>
                        )}
                      </EuiText>
                    </EuiPanel>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </div>
          ))}

      </EuiPanel>
    </EuiPage>
  );
};
