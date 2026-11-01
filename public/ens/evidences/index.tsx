import { useActiveENSScopeAgents } from '../scope/use-active-scope-agents';
import React, { useMemo, useState } from 'react';
import { useRouterSearch, useSetRouterSearch } from '../../routing/use-router-search';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { EvaluationLoading, EvaluationStatusLine } from '../../evaluation/evaluation-status';
import type { ENSEvaluationMeta } from '../../../common/ens/evaluation/types';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
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
import { ENSControlsInAnnexOrder as ENSControls } from '../controls-in-order';
import { compareENSControlIdsByAnnex, getENSCatalogControl } from '../../../common/ens/catalog';
import {
  ENS_PENDING_MEASUREMENT_LABEL,
  isPendingMeasurement,
} from '../../../common/ens/catalog/support/measurement-plan';
// Import from the types file, never from the `../core` barrel: it avoids the transitive TDZ cycle of Settings.
import type { ENSComplianceResult, ENSGapCause, ENSObservationGroup } from '../../../common/ens/core/evaluation/types';
import { filterByENSPrefix, listENSFamilies, resolveENSSectionOpenState } from '../control-filter/prefix';
import { MotiveCell } from '../controls/control-detail/motive-cell';
import type { MotiveLine } from '../controls/control-detail/motive-cell';
import { machinesLabel, summarizeMotives } from '../controls/control-detail/general-view';
import { statusLabel } from '../../../common/ens/core/status-label';

// A row of the evidences table. No `control` column: the section header says it.
interface EvidenceRow {
  evidenceId: string;
  category: string;
  description: string;

  requirements: string[];
  levels: string[];
  ruleIds: string[];

  status: string;

  // Of a control without collector: its NO_APLICA is not the level's, it shows as «Sin medición todavía».
  pending: boolean;

  // Whose gap it is when the status is NO_EVALUABLE: COLLECTION is fixed by whoever operates Wazuh, CONFIGURATION by whoever configures Power ENS, CATALOG by the product.
  gapCauses: ENSGapCause[];

  lastValidation: string;
  agent: string;

  observations: string[];

  observationGroups: ENSObservationGroup[];

  auditQuestion: string;
}

interface ControlEvidenceGroup {
  controlId: string;
  title: string;

  filterableIds: string[];

  rows: EvidenceRow[];

  hasResult: boolean;

  // The counts travel SEPARATELY and are never summed: `failing` and `partial` are proven non-compliances, `unmeasured` is not.
  passing: number;
  failing: number;
  partial: number;
  unmeasured: number;
  notApplicable: number;
  // Evidences of a control without collector, apart from NO_APLICA.
  pendingMeasurement: number;
}

const statusColorOf = (status: string): string => {
  if (status === 'CUMPLE') {
    return 'success';
  }

  if (status === 'PARCIAL') {
    return 'warning';
  }

  if (status === 'NO_CUMPLE') {
    return 'danger';
  }

  if (status === 'NO_APLICA') {
    return 'hollow';
  }

  return 'default';
};

// NO_EVALUABLE has an icon and NO_APLICA does not: both are grey but one subtracts and the other leaves the denominator.
const statusIcon = (status: string): string | undefined =>
  status === 'NO_EVALUABLE' ? 'questionInCircle' : undefined;

const StatusBadge = ({ estado: status }: { estado: string }) => (
  <EuiBadge color={statusColorOf(status)} iconType={statusIcon(status)}>
    {statusLabel(status)}
  </EuiBadge>
);

const STATUS_LEGEND: { estado: string; glosa: string }[] = [
  { estado: 'CUMPLE', glosa: 'demostrado' },
  { estado: 'NO_CUMPLE', glosa: 'medido · resta · se corrige la máquina' },
  { estado: 'PARCIAL', glosa: 'conforma en parte · resta' },
  {
    estado: 'NO_EVALUABLE',
    glosa: 'no demostrado · resta igual · se habilita la prueba',
  },
  { estado: 'NO_APLICA', glosa: 'fuera del nivel activo · no resta' },
  { estado: ENS_PENDING_MEASUREMENT_LABEL, glosa: 'control sin recolector todavía · no entra en el índice' },
];

const PendingBadge = () => (
  <EuiBadge color='hollow' iconType='clock'>
    {ENS_PENDING_MEASUREMENT_LABEL}
  </EuiBadge>
);

const StatusLegend = () => (
  <EuiFlexGroup gutterSize='m' alignItems='center' wrap responsive={false}>
    {STATUS_LEGEND.map(({ estado: status, glosa: gloss }) => (
      <EuiFlexItem grow={false} key={status}>
        <EuiFlexGroup gutterSize='xs' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            {status === ENS_PENDING_MEASUREMENT_LABEL ? <PendingBadge /> : <StatusBadge estado={status} />}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              {gloss}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

const GAP_CAUSES: ENSGapCause[] = [
  'COLLECTION',
  'CONFIGURATION',
  'CATALOG',
  'EVIDENCE',
];

const CAUSE_GLOSS: Record<ENSGapCause, string> = {
  COLLECTION: 'no llegó nada · agente o recolector',
  CONFIGURATION: 'falta parámetro · pestaña Configuración',
  CATALOG: 'no declarado · producto',
  EVIDENCE: 'llegó incompleta · productor de la evidencia',
};

const CauseBadge = ({ causa: cause }: { causa: ENSGapCause }) => (
  <EuiBadge color='hollow' title={CAUSE_GLOSS[cause]}>
    {cause}
  </EuiBadge>
);

const CauseLegend = () => (
  <EuiFlexGroup gutterSize='m' alignItems='center' wrap responsive={false}>
    <EuiFlexItem grow={false}>
      <EuiText size='xs' color='subdued'>
        Causa del NO_EVALUABLE
      </EuiText>
    </EuiFlexItem>
    {GAP_CAUSES.map(cause => (
      <EuiFlexItem grow={false} key={cause}>
        <EuiFlexGroup gutterSize='xs' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            <CauseBadge causa={cause} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              {CAUSE_GLOSS[cause]}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

// An empty list is shown as a dash, not as a blank cell.
const BadgeList = ({
  valores: values,
  color = 'hollow',
}: {
  valores: string[];
  color?: string;
}) => {
  if (!values || values.length === 0) {
    return (
      <EuiText size='xs' color='subdued'>
        —
      </EuiText>
    );
  }

  return (
    <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
      {values.map(value => (
        <EuiFlexItem grow={false} key={value}>
          <EuiBadge color={color}>{value}</EuiBadge>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

const shortDate = (iso: string): string => {
  if (!iso || iso === '-') {
    return '—';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

const QUESTION_PREFIX = 'Pregunta de auditoría:';

// Motive lines, with the machine in front when there are several; they use the control detail functions so both screens format a motive the same way.
const motiveLines = (
  row: EvidenceRow,
  totalMachines: number,
): { visibles: MotiveLine[]; ocultos: number } => {
  let lines: MotiveLine[];
  let hidden = 0;

  if (row.observationGroups.length > 0) {
    // Consolidating agents: each motive says on which machines it was observed. The audit question is extracted BEFORE the split because the engine appends it to the motive of every machine.
    const question = row.observationGroups.find(group =>
      group.text.startsWith(QUESTION_PREFIX),
    );

    const summary = summarizeMotives(
      row.observationGroups.filter(
        group => !group.text.startsWith(QUESTION_PREFIX),
      ),
    );

    hidden = summary.ocultos;
    lines = summary.visibles.map(group => ({
      texto: group.text,
      etiqueta: machinesLabel(group.agents, totalMachines),
    }));

    if (question) {
      lines.push({ texto: question.text });
    }
  } else {
    lines = row.observations.map(text => ({ texto: text }));
  }

  // The audit question is never lost: if the motive lacks it, it is added.
  const hasQuestion = lines.some(line =>
    line.texto.startsWith(QUESTION_PREFIX),
  );

  return {
    visibles:
      hasQuestion || !row.auditQuestion
        ? lines
        : [...lines, { texto: `${QUESTION_PREFIX} ${row.auditQuestion}` }],
    ocultos: hidden,
  };
};

// `totalMachines` is a parameter because the '(todas)' label depends on the scope size, known only at render time.
const buildColumns = (totalMachines: number) => [
  {
    field: 'evidenceId',
    name: 'ID',
    render: (value: string) => <EuiBadge color='primary'>{value}</EuiBadge>,
  },
  {
    field: 'status',
    name: 'Estado',
    render: (value: string, item: EvidenceRow) => (
      <EuiFlexGroup
        gutterSize='xs'
        direction='column'
        alignItems='flexStart'
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          {item.pending ? <PendingBadge /> : <StatusBadge estado={value} />}
        </EuiFlexItem>
        {item.gapCauses.map(cause => (
          <EuiFlexItem grow={false} key={cause}>
            <CauseBadge causa={cause} />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    ),
  },
  {
    field: 'description',
    name: 'Descripción',
    render: (value: string, item: EvidenceRow) => (
      <>
        <EuiText size='xs'>{value}</EuiText>
        <EuiText size='xs' color='subdued'>
          {[
            item.category,
            item.levels.join(' · '),
            item.agent && item.agent !== '—' ? item.agent : '',
            shortDate(item.lastValidation),
          ]
            .filter(Boolean)
            .join(' · ')}
        </EuiText>
      </>
    ),
  },
  {
    field: 'requirements',
    name: 'Requisitos ENS',
    render: (value: string[]) => <BadgeList valores={value} />,
  },
  {
    field: 'ruleIds',
    name: 'Rule ID',
    render: (value: string[]) => <BadgeList valores={value} />,
  },
  {
    field: 'observations',
    name: 'Motivo',
    render: (_value: string[], item: EvidenceRow) => {
      const { visibles: visibleItems, ocultos: hidden } = motiveLines(item, totalMachines);

      return (
          <MotiveCell
            lineas={visibleItems}
            ocultos={hidden}
            titulo={`Motivo · ${item.evidenceId}`}
          />
        );
    },
  },
];

const CountBadge = ({
  valor: value,
  color,
  etiqueta: label,
  icono: icon,
}: {
  valor: number;
  color: string;
  etiqueta: string;
  icono?: string;
}) =>
  value > 0 ? (
    <EuiFlexItem grow={false}>
      <EuiBadge color={color} iconType={icon}>
        {value} {label}
      </EuiBadge>
    </EuiFlexItem>
  ) : null;

const ControlGroupHeader = ({ group }: { group: ControlEvidenceGroup }) => (
  <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false} wrap>
    <EuiFlexItem grow={false}>
      <EuiText size='s'>
        <strong>{group.controlId}</strong> — {group.title}
      </EuiText>
    </EuiFlexItem>

    <EuiFlexItem grow={false}>
      <EuiBadge color='hollow'>{`${group.rows.length} evidencias`}</EuiBadge>
    </EuiFlexItem>

    <CountBadge valor={group.passing} color='success' etiqueta='cumplen' />
    <CountBadge valor={group.failing} color='danger' etiqueta='no cumplen' />
    <CountBadge valor={group.partial} color='warning' etiqueta='parciales' />
    <CountBadge
      valor={group.unmeasured}
      color='default'
      etiqueta='no evaluables'
      icono='questionInCircle'
    />
    <CountBadge
      valor={group.notApplicable}
      color='hollow'
      etiqueta='no aplican'
    />
    <CountBadge
      valor={group.pendingMeasurement}
      color='hollow'
      etiqueta={ENS_PENDING_MEASUREMENT_LABEL.toLowerCase()}
      icono='clock'
    />

    {!group.hasResult && (
      <EuiFlexItem grow={false}>
        <EuiBadge color='default' iconType='clock'>
          Sin datos en el periodo
        </EuiBadge>
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
);

export const EvidencesENS = () => {
  const { agentId, evidenceControl } = useRouterSearch();
  const updateUrl = useSetRouterSearch();

  // Prefix filter on the ENS identifier; empty means no filter. It starts filtered only when arriving from an evidence pressed in the control detail (`evidenceControl=`, its own parameter): the `control=` left open by the detail does NOT filter.
  const [prefix, setPrefix] = useState<string>(() => evidenceControl || '');

  const [openControlIds, setOpenControlIds] = useState<
    Record<string, boolean | undefined>
  >({});

  const applyPrefix = (value: string) => {
    setPrefix(value);
    if (evidenceControl) updateUrl({ evidenceControl: undefined });
    setOpenControlIds({});
  };

  const scopeAgents = useActiveENSScopeAgents();

  const allControlIds = useMemo(
    () => ENSControls.map(control => control.id),
    [],
  );

  const families = useMemo(
    () => listENSFamilies(allControlIds),
    [allControlIds],
  );

  const columns = useMemo(
    () => buildColumns(scopeAgents.length),
    [scopeAgents.length],
  );

  // Results of ALL controls, evaluated by the server with all facts of the window.
  const evaluation = useEnsEvaluation<{ results: ENSComplianceResult[]; meta: ENSEvaluationMeta }>({
    include: 'results',
    agentId,
  });
  const { error } = evaluation;

  const results = useMemo(
    () => new Map((evaluation.data?.results || []).map(result => [result.control.id, result])),
    [evaluation.data],
  );

  // All controls are ALWAYS evaluated, including those the filter hides: it allows '8 de 24 evidencias' and the hidden count.
  const groups: ControlEvidenceGroup[] = useMemo(() => {
    return ENSControls.map(control => {
      const complianceResult = results.get(control.id);

      const evidences = complianceResult?.evidences || [];
      // A control without collector: its evidences are counted apart, never as «fuera del nivel activo».
      const pending = isPendingMeasurement(getENSCatalogControl(control.id));

      const countByStatus = (status: string) =>
        pending ? 0 : evidences.filter(evidence => evidence.status === status).length;

      // Gap cause per evidence: each NO_EVIDENCIADA non-conformity names in `evidenceIds` the evidences that block its requirement, so giving them its `cause` repeats what the card states.
      const causesByEvidence = new Map<string, ENSGapCause[]>();

      (complianceResult?.nonConformities || []).forEach(nonConformity => {
        const cause = nonConformity.cause;

        if (nonConformity.origin !== 'NO_EVIDENCIADA' || !cause) {
          return;
        }

        (nonConformity.evidenceIds || []).forEach(evidenceId => {
          const accumulated = causesByEvidence.get(evidenceId) || [];

          if (!accumulated.includes(cause)) {
            causesByEvidence.set(evidenceId, [...accumulated, cause]);
          }
        });
      });

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
          requirements: evidence.requirements || [],
          levels: evidence.levels || [],
          ruleIds: evidence.relatedRules || [],
          status: evidence.status,
          pending,
          // Only for NO_EVALUABLE: any other status has no gap.
          gapCauses:
            evidence.status === 'NO_EVALUABLE'
              ? causesByEvidence.get(evidence.id) || []
              : [],
          lastValidation: evidence.lastSeen || '-',
          agent: evidence.agentName || evidence.agentId || '—',
          observations: evidence.observations || [],
          observationGroups: evidence.observationGroups || [],
          auditQuestion: evidence.auditQuestion,
        })),
        hasResult: !!complianceResult,
        passing: countByStatus('CUMPLE'),
        failing: countByStatus('NO_CUMPLE'),
        partial: countByStatus('PARCIAL'),
        unmeasured: countByStatus('NO_EVALUABLE'),
        notApplicable: countByStatus('NO_APLICA'),
        pendingMeasurement: pending ? evidences.length : 0,
      };
    }).sort((a, b) => compareENSControlIdsByAnnex(a.controlId, b.controlId));
  }, [results]);

  const filtered = useMemo(
    () => filterByENSPrefix(groups, prefix, group => group.filterableIds),
    [groups, prefix],
  );

  const countEvidences = (list: ControlEvidenceGroup[]) =>
    list.reduce((total, group) => total + group.rows.length, 0);

  const shownEvidences = countEvidences(filtered.matched);
  const totalEvidences = countEvidences(groups);

  // What the filter hides, counted by type and NEVER summed.
  const hiddenFailing = filtered.hidden.reduce(
    (total, group) => total + group.failing + group.partial,
    0,
  );

  const hiddenUnmeasured = filtered.hidden.reduce(
    (total, group) => total + group.unmeasured,
    0,
  );

  const hasNonEvaluable = groups.some(group => group.unmeasured > 0);

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

  if (error) {
    return (
      <EuiPanel paddingSize='l'>
        <EuiTitle size='s'>
          <h2>Evidencias</h2>
        </EuiTitle>
        <EuiSpacer size='m' />
        <FactsReadErrorCallOut error={error} onRetry={evaluation.retry} />
      </EuiPanel>
    );
  }

  // While the evaluation of THIS machine arrives no status is drawn.
  if (!evaluation.data) {
    return (
      <EuiPanel paddingSize='l'>
        <EuiTitle size='s'>
          <h2>Evidencias</h2>
        </EuiTitle>
        <EvaluationLoading message='Calculando…' />
      </EuiPanel>
    );
  }

  return (
    <EuiPanel paddingSize='l'>
      <EuiTitle size='s'>
        <h2>Evidencias</h2>
      </EuiTitle>
      <EvaluationStatusLine meta={evaluation.data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />

      <EuiSpacer size='s' />

      <EuiAccordion
        id='leyenda-evidencias'
        buttonContent={
          <EuiText size='xs' color='subdued'>
            Qué significa cada estado
          </EuiText>
        }
        paddingSize='s'
      >
        <StatusLegend />

        {hasNonEvaluable && (
          <>
            <EuiSpacer size='xs' />
            <CauseLegend />
          </>
        )}
      </EuiAccordion>

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
            placeholder='Filtrar: op.acc, op.acc.1…'
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
          <EuiBadge color='hollow'>
            {filtered.isActive
              ? `${filtered.matched.length} de ${groups.length} controles`
              : `${groups.length} controles`}
          </EuiBadge>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiBadge color='hollow'>
            {filtered.isActive
              ? `${shownEvidences} de ${totalEvidences} evidencias`
              : `${totalEvidences} evidencias`}
          </EuiBadge>
        </EuiFlexItem>

        {filtered.isActive && (
          <EuiFlexItem grow={false}>
            <EuiBadge color='accent'>
              {`Filtro: ${filtered.query}${evidenceControl && prefix === evidenceControl ? ' (desde el Detalle del control)' : ''}`}
            </EuiBadge>
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

      {filtered.isActive && (hiddenFailing > 0 || hiddenUnmeasured > 0) && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut
            size='s'
            color={hiddenFailing > 0 ? 'danger' : 'primary'}
            iconType={hiddenFailing > 0 ? 'alert' : 'iInCircle'}
            title={`Fuera del filtro «${filtered.query}»`}
          >
            <EuiFlexGroup
              gutterSize='s'
              alignItems='center'
              wrap
              responsive={false}
            >
              <CountBadge
                valor={hiddenFailing}
                color='danger'
                etiqueta='no cumplen o parciales'
              />
              <CountBadge
                valor={hiddenUnmeasured}
                color='default'
                etiqueta='no evaluables'
                icono='questionInCircle'
              />
            </EuiFlexGroup>
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
          <EuiText size='xs'>
            <p>
              Sin filtro: {groups.length} controles, {totalEvidences}{' '}
              evidencias.
            </p>
          </EuiText>
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
            <EuiPanel hasBorder paddingSize='s'>
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
                <EuiBadge color='default' iconType='clock'>
                  Sin evidencias resueltas en el periodo
                </EuiBadge>
              )}
            </EuiAccordion>
            </EuiPanel>
            <EuiSpacer size='s' />
          </React.Fragment>
        ))
      )}
    </EuiPanel>
  );
};
