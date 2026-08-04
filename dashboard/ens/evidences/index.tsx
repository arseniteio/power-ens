import React, { useEffect, useMemo, useState } from 'react';
import { useRouterSearch } from '../../../common/hooks';
import { useEsSearch } from '../../../common/hooks/use-es-search';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldSearch,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
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
import {
  compareENSIds,
  filterByENSPrefix,
  listENSFamilies,
  resolveENSSectionOpenState,
} from '../control-filter/prefix';

// Una fila de la tabla de evidencias. Sin la columna `control`: el control lo
// dice la cabecera de la sección que la contiene, y repetirlo en cada fila
// gastaba ancho sin decir nada nuevo.
interface EvidenceRow {
  evidenceId: string;
  category: string;
  description: string;
  requirements: string;
  level: string;
  status: string;
  lastValidation: string;
  agent: string;
  ruleId: string;
  auditQuestion: string;
}

// Las evidencias de UN control, con lo que hace falta para pintar su cabecera
// sin abrirla.
interface ControlEvidenceGroup {
  controlId: string;
  title: string;

  // Identificadores por los que esta sección responde al filtro: el del control
  // y los de sus requisitos, que viven en el mismo espacio jerárquico
  // (`op.acc.1` y `op.acc.1.2`). Así «op.acc.1.2» encuentra el control que
  // declara ese requisito en vez de no encontrar nada.
  filterableIds: string[];

  rows: EvidenceRow[];

  // Si el motor ha llegado a pronunciarse. Un control sin resultado NO se
  // esconde: sale con su cabecera y lo dice, porque desaparecer de la lista se
  // lee igual que no tener nada que declarar.
  hasResult: boolean;

  // Los tres recuentos viajan SEPARADOS y no se suman nunca en un solo número
  // de "hallazgos". `failing` y `partial` son incumplimientos demostrados;
  // `unmeasured` es lo que no se ha podido medir, que no es un incumplimiento.
  // Es la misma distinción que la pestaña Controles hace entre el número en
  // rojo y «sin medir», y fundirlas aquí la desharía.
  failing: number;
  partial: number;
  unmeasured: number;
}

const columns = [
  {
    field: 'evidenceId',
    name: 'ID',
    render: (value: string) => <EuiBadge color='primary'>{value}</EuiBadge>,
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

// Cabecera plegable de un control: lo que se ve sin abrir la sección.
const ControlGroupHeader = ({ group }: { group: ControlEvidenceGroup }) => (
  <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false} wrap>
    <EuiFlexItem grow={false}>
      <EuiText size='s'>
        <strong>{group.controlId}</strong> — {group.title}
      </EuiText>
    </EuiFlexItem>

    <EuiFlexItem grow={false}>
      <EuiBadge color='hollow'>
        {group.rows.length} evidencia(s)
      </EuiBadge>
    </EuiFlexItem>

    {group.failing > 0 && (
      <EuiFlexItem grow={false}>
        <EuiBadge color='danger'>{group.failing} NO_CUMPLE</EuiBadge>
      </EuiFlexItem>
    )}

    {group.partial > 0 && (
      <EuiFlexItem grow={false}>
        <EuiBadge color='warning'>{group.partial} PARCIAL</EuiBadge>
      </EuiFlexItem>
    )}

    {group.unmeasured > 0 && (
      <EuiFlexItem grow={false}>
        <EuiBadge color='default' iconType='clock'>
          {group.unmeasured} sin medir
        </EuiBadge>
      </EuiFlexItem>
    )}

    {!group.hasResult && (
      <EuiFlexItem grow={false}>
        <EuiBadge color='default'>Sin datos en el periodo evaluado</EuiBadge>
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
);

export const EvidencesENS = () => {
  const { agentId } = useRouterSearch();
  const [refreshKey, setRefreshKey] = useState(0);

  // Filtro por prefijo del identificador ENS. Vacío = sin filtro = se ve todo.
  const [prefix, setPrefix] = useState<string>('');

  // Secciones que el operador ha abierto o cerrado a mano. Lo que no está aquí
  // usa el criterio por defecto (ver `isOpen`).
  const [openControlIds, setOpenControlIds] = useState<
    Record<string, boolean | undefined>
  >({});

  // Cambiar el filtro devuelve las secciones a su estado por defecto: si no, al
  // filtrar hasta un solo control seguiría cerrado el que se acaba de buscar
  // porque se cerró a mano tres búsquedas antes.
  const applyPrefix = (value: string) => {
    setPrefix(value);
    setOpenControlIds({});
  };

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

  // La query trae eventos de todos los controles del scope activo.
  const allControlIds = useMemo(
    () => ENSControls.map(control => control.id),
    [],
  );

  const families = useMemo(
    () => listENSFamilies(allControlIds),
    [allControlIds],
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

  // Se evalúan SIEMPRE todos los controles, también los que el filtro deja
  // fuera. Es lo que permite decir «8 de 24 evidencias» y avisar de lo que se
  // está escondiendo: si solo se evaluara lo filtrado, el denominador sería el
  // propio filtro y la pantalla no podría contradecirse a sí misma.
  const groups: ControlEvidenceGroup[] = useMemo(() => {
    const normalizedEvents = normalizeWazuhAlerts(hits);

    return ENSControls.map(control => {
      const complianceResult = getENSComplianceResultByControl(
        control.id,
        ensLevel,
        normalizedEvents,
        agentId,
        scopeAgents,
      );

      const evidences = complianceResult?.evidences || [];

      const countByStatus = (status: string) =>
        evidences.filter(evidence => evidence.status === status).length;

      return {
        controlId: control.id,
        title: control.title,
        filterableIds: [
          control.id,
          ...control.requirements.map(requirement => requirement.id),
        ],
        rows: evidences.map(evidence => ({
          evidenceId: evidence.id,
          category: evidence.category,
          description: evidence.description,
          requirements: evidence.requirements.join(', '),
          level: evidence.levels.join(', '),
          status: evidence.status,
          lastValidation: evidence.lastSeen || '-',
          agent: evidence.agentName || evidence.agentId || '-',
          ruleId: evidence.relatedRules.join(', '),
          auditQuestion: evidence.auditQuestion,
        })),
        hasResult: !!complianceResult,
        failing: countByStatus('NO_CUMPLE'),
        partial: countByStatus('PARCIAL'),
        unmeasured: countByStatus('NO_EVALUABLE'),
      };
    }).sort((a, b) => compareENSIds(a.controlId, b.controlId));
  }, [hits, ensLevel, agentId, scopeAgents]);

  const filtered = useMemo(
    () => filterByENSPrefix(groups, prefix, group => group.filterableIds),
    [groups, prefix],
  );

  const countEvidences = (list: ControlEvidenceGroup[]) =>
    list.reduce((total, group) => total + group.rows.length, 0);

  const shownEvidences = countEvidences(filtered.matched);
  const totalEvidences = countEvidences(groups);

  // Lo que el filtro esconde, contado por tipo y NUNCA sumado en uno solo.
  const hiddenFailing = filtered.hidden.reduce(
    (total, group) => total + group.failing + group.partial,
    0,
  );

  const hiddenUnmeasured = filtered.hidden.reduce(
    (total, group) => total + group.unmeasured,
    0,
  );

  const isOpen = (controlId: string): boolean =>
    resolveENSSectionOpenState(
      openControlIds,
      controlId,
      filtered.matched.length,
    );

  const toggleControl = (controlId: string, nextIsOpen: boolean) =>
    setOpenControlIds(current => ({
      ...current,
      [controlId]: nextIsOpen,
    }));

  return (
    <EuiPanel paddingSize='l'>
      <EuiTitle size='s'>
        <h2>Repositorio de Evidencias ENS</h2>
      </EuiTitle>

      <EuiSpacer size='s' />

      <EuiText size='s'>
        <p>
          Evidencias ENS resueltas por el motor ENSFácil a partir de eventos
          reales de Wazuh/OpenSearch, agrupadas por control. Las evidencias en
          rojo son incumplimientos demostrados; «sin medir» son evidencias que
          el motor todavía no ha podido evaluar, que no es lo mismo.
        </p>
      </EuiText>

      <EuiSpacer size='m' />

      <EuiFlexGroup gutterSize='m' alignItems='center' wrap>
        <EuiFlexItem grow={false}>
          <EuiFilterGroup>
            <EuiFilterButton
              hasActiveFilters={!filtered.isActive}
              onClick={() => applyPrefix('')}
            >
              Todos
            </EuiFilterButton>
            {/* Atajos por familia, no por control: las familias crecen mucho
                más despacio que los controles y la barra sigue cabiendo. */}
            {families.map(family => (
              <EuiFilterButton
                key={family}
                hasActiveFilters={filtered.query === family}
                onClick={() => applyPrefix(family)}
              >
                {family}
              </EuiFilterButton>
            ))}
          </EuiFilterGroup>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiFieldSearch
            fullWidth
            incremental
            isClearable
            placeholder='Filtrar por prefijo: op.acc, op.acc.1, op.acc.1.2…'
            aria-label='Filtrar controles por prefijo del identificador ENS'
            value={prefix}
            onChange={(event: { target: { value: string } }) =>
              applyPrefix(event.target.value)
            }
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size='s' />

      <EuiFlexGroup gutterSize='s' alignItems='center' wrap responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size='xs' color='subdued'>
            <p>
              {filtered.isActive
                ? `Mostrando ${filtered.matched.length} de ${groups.length} control(es) · ${shownEvidences} de ${totalEvidences} evidencia(s).`
                : `${groups.length} control(es) · ${totalEvidences} evidencia(s). Sin filtro.`}
            </p>
          </EuiText>
        </EuiFlexItem>

        {filtered.isActive && (
          <EuiFlexItem grow={false}>
            <EuiBadge color='accent'>Filtro: {filtered.query}</EuiBadge>
          </EuiFlexItem>
        )}

        {filtered.isActive && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size='xs'
              iconType='cross'
              onClick={() => applyPrefix('')}
            >
              Quitar filtro
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {/* Un filtro que esconde un incumplimiento sin decirlo es como se pierde
          una no conformidad: el panel se ve corto y se lee como «no hay nada».
          Los dos recuentos van por separado, con el vocabulario de siempre. */}
      {filtered.isActive && (hiddenFailing > 0 || hiddenUnmeasured > 0) && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut
            size='s'
            color={hiddenFailing > 0 ? 'danger' : 'primary'}
            iconType={hiddenFailing > 0 ? 'alert' : 'iInCircle'}
            title='El filtro está dejando hallazgos fuera'
          >
            <EuiText size='xs'>
              <p>
                Fuera del filtro «{filtered.query}» quedan{' '}
                <strong>
                  {hiddenFailing} evidencia(s) en NO_CUMPLE o PARCIAL
                </strong>{' '}
                (incumplimientos demostrados) y{' '}
                <strong>{hiddenUnmeasured} sin medir</strong> (pendientes de
                medición, que no son incumplimientos).
              </p>
            </EuiText>
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size='m' />

      {filtered.matched.length === 0 ? (
        <EuiCallOut
          size='s'
          color='warning'
          iconType='search'
          title={`Ningún control coincide con «${filtered.query}»`}
        >
          <EuiText size='s'>
            <p>
              No se está ocultando ningún hallazgo por otro motivo: sin filtro
              hay {groups.length} control(es) y {totalEvidences} evidencia(s).
            </p>
          </EuiText>
          <EuiSpacer size='s' />
          <EuiButtonEmpty
            size='s'
            iconType='cross'
            onClick={() => applyPrefix('')}
          >
            Quitar filtro
          </EuiButtonEmpty>
        </EuiCallOut>
      ) : (
        filtered.matched.map(group => (
          <React.Fragment key={group.controlId}>
            <EuiAccordion
              id={`ens-evidencias-${group.controlId.replace(/\./g, '-')}`}
              buttonContent={<ControlGroupHeader group={group} />}
              forceState={isOpen(group.controlId) ? 'open' : 'closed'}
              onToggle={(nextIsOpen: boolean) =>
                toggleControl(group.controlId, nextIsOpen)
              }
              paddingSize='s'
            >
              {group.rows.length > 0 ? (
                <EuiBasicTable items={group.rows} columns={columns} />
              ) : (
                <EuiText size='s' color='subdued'>
                  <p>
                    El motor no ha resuelto ninguna evidencia de{' '}
                    {group.controlId} en el periodo evaluado. No es un
                    incumplimiento: es que no ha llegado el dato.
                  </p>
                </EuiText>
              )}
            </EuiAccordion>
            <EuiSpacer size='s' />
          </React.Fragment>
        ))
      )}
    </EuiPanel>
  );
};
