// A control's maturity in its detail: headline, gates, what was recorded and the forms (the server checks the role).
import React, { useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLink,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import { describeAssessment, describeMaturityHeadline } from '../../../common/ens/maturity/maturity-engine';
import {
  ENS_MATURITY_FEEDBACK_SOURCES,
  ENS_MATURITY_REVIEW_RESULTS,
  listOrganizationPeople,
  ownLabel,
  validateMaturityEntry,
} from '../../../common/ens/maturity/maturity-records';
import type { ENSControlMaturity, ENSMaturityGate, ENSMaturityRecordKind, ENSMaturityVersion } from '../../../common/ens/maturity/types';
import { getActiveENSConfiguration, recordMaturityEntry } from '../../../common/ens/configuration/services/configuration-state-service';
import {
  initialMaturityDraft,
  MATURITY_FORM_FIELDS,
  MATURITY_FORM_TITLES,
  MATURITY_GUIDE_URL,
  MATURITY_NOTE,
  MATURITY_ORIGIN_LABELS,
  maturityEntryFromDraft,
} from './maturity-view';

const headlineColor = (maturity?: ENSControlMaturity): string => {
  if (!maturity || !maturity.applicable) return 'hollow';
  const level = maturity.assessed?.level ?? maturity.accredited;
  return level === undefined ? 'default' : level >= maturity.target ? 'success' : 'warning';
};

// «Madurez: L3 (acreditado L3, objetivo L3)», next to the traffic light (never inside it).
export const MaturityHeadline = ({ maturity, error, pending }: { maturity?: ENSControlMaturity; error?: string; pending?: boolean }) => (
  <EuiBadge
    color={pending ? 'default' : headlineColor(maturity)}
    iconType='visGauge'
    title={
      maturity?.accreditedDropped
        ? 'La evidencia acredita hoy menos que al valorarlo: revisar la valoración.'
        : maturity?.aboveAccredited
        ? 'Valorado por encima de lo acreditado al registrarlo.'
        : 'Madurez del proceso (CMM): valoración normativa, aparte del semáforo.'
    }
  >
    {maturity ? `${describeMaturityHeadline(maturity)}${pending ? ' · actualizando' : ''}` : error ? 'Madurez: no disponible' : 'Madurez: calculando…'}
  </EuiBadge>
);

export const MaturityEntryModal = ({
  controlId,
  kind,
  maturity,
  version,
  onClose,
  onSaved,
}: {
  controlId: string;
  kind: ENSMaturityRecordKind;
  maturity?: ENSControlMaturity;
  // The maturity version this screen shows: a newer one is refused (409) instead of being overwritten.
  version: ENSMaturityVersion | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [draft, setDraft] = useState<Record<string, string>>(
    initialMaturityDraft(kind, maturity, new Date(), getActiveENSConfiguration()?.global?.timezone)
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const people = listOrganizationPeople(getActiveENSConfiguration());
  const listId = `ensfacil-maturity-people-${kind}`;

  const save = async () => {
    const entry = maturityEntryFromDraft(kind, draft);
    // The same rules as the server: what it would refuse is not sent.
    const accredited = maturity ? (maturity.measured ? maturity.accredited : 0) : undefined;
    const checked = validateMaturityEntry(kind, entry, new Date(), accredited);
    if (checked.errors.length) {
      setErrors(checked.errors);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      await recordMaturityEntry(controlId, kind, entry, version);
      onSaved();
      onClose();
    } catch (error: any) {
      setErrors([error?.message || String(error)]);
    } finally {
      setSaving(false);
    }
  };

  const set = (name: string, value: string) => setDraft(current => ({ ...current, [name]: value }));

  return (
    <EuiModal onClose={onClose} style={{ width: 640 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          {MATURITY_FORM_TITLES[kind]} · {controlId}
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        {kind === 'assessment' && maturity && (
          <>
            <EuiText size='s'>
              <p>
                {maturity.measured
                  ? `La evidencia acredita L${maturity.accredited ?? 0}. Confirma ese nivel o ajústalo; por encima, justifícalo.`
                  : 'Sin medición todavía: el control está en borrador. Se puede declarar el nivel valorado con su justificación.'}
              </p>
            </EuiText>
            <EuiSpacer size='s' />
          </>
        )}
        {MATURITY_FORM_FIELDS[kind].map(field => (
          <EuiFormRow key={field.name} label={`${field.label}${field.required ? '' : ' (opcional)'}`} helpText={field.help} fullWidth>
            {field.type === 'select' ? (
              <EuiSelect options={field.options || []} value={draft[field.name] ?? ''} onChange={(event: any) => set(field.name, event.target.value)} fullWidth />
            ) : field.type === 'textarea' ? (
              <EuiTextArea value={draft[field.name] ?? ''} onChange={(event: any) => set(field.name, event.target.value)} rows={3} fullWidth />
            ) : (
              <EuiFieldText
                type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                value={draft[field.name] ?? ''}
                onChange={(event: any) => set(field.name, event.target.value)}
                list={field.people && people.length ? listId : undefined}
                fullWidth
              />
            )}
          </EuiFormRow>
        ))}
        {people.length > 0 && (
          <datalist id={listId}>
            {people.map(person => (
              <option key={person} value={person} />
            ))}
          </datalist>
        )}
        {errors.length > 0 && (
          <>
            <EuiSpacer size='s' />
            <EuiCallOut color='danger' iconType='alert' size='s' title='No se ha guardado'>
              {errors.map(error => (
                <p key={error}>{error}</p>
              ))}
            </EuiCallOut>
          </>
        )}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
        <EuiButton fill isLoading={saving} onClick={save}>
          Guardar
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};

const gateColumns = [
  { field: 'level', name: 'Nivel', width: '60px', render: (level: number) => <strong>L{level}</strong> },
  { field: 'label', name: 'Puerta' },
  { field: 'origin', name: 'Origen', width: '150px', render: (origin: ENSMaturityGate['origin']) => MATURITY_ORIGIN_LABELS[origin] || origin },
  {
    field: 'passed',
    name: 'Estado',
    width: '110px',
    render: (passed: boolean) => <EuiBadge color={passed ? 'success' : 'danger'}>{passed ? 'Se cumple' : 'No se cumple'}</EuiBadge>,
  },
  { field: 'reason', name: 'Motivo', render: (reason: string) => <EuiText size='xs'>{reason}</EuiText> },
];

export const MaturityPanel = ({
  controlId,
  maturity,
  version,
  pending,
  error,
  onRecorded,
  onRetry,
}: {
  controlId: string;
  maturity?: ENSControlMaturity;
  version?: ENSMaturityVersion | null;
  // The maturity shown is being recomputed (a record, new facts): nothing is recorded over it until it arrives.
  pending?: boolean;
  error?: string;
  onRecorded: () => void;
  onRetry?: () => void;
}) => {
  const [form, setForm] = useState<ENSMaturityRecordKind | undefined>(undefined);
  const assessment = maturity ? describeAssessment(maturity) : {};
  const attestation = maturity?.attestation;
  const review = maturity?.lastReview;
  const indicators = maturity?.indicators;

  return (
    <EuiPanel>
      <EuiFlexGroup alignItems='center' justifyContent='spaceBetween' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiTitle size='s'>
            <h3>Madurez · {controlId}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <MaturityHeadline maturity={maturity} error={error} pending={pending} />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiText size='xs' color='subdued'>
        <p>
          {MATURITY_NOTE}{' '}
          <EuiLink href={MATURITY_GUIDE_URL} target='_blank' external>
            Guía 10
          </EuiLink>
        </p>
      </EuiText>
      <EuiSpacer size='s' />

      {error && (
        <>
          <EuiCallOut color='warning' iconType='alert' size='s' title={error}>
            {onRetry && (
              <EuiButton size='s' iconType='refresh' onClick={onRetry}>
                Reintentar
              </EuiButton>
            )}
          </EuiCallOut>
          <EuiSpacer size='s' />
        </>
      )}

      {pending && maturity && (
        <>
          <EuiCallOut color='primary' iconType='clock' size='s' title='Actualizando la madurez…' />
          <EuiSpacer size='s' />
        </>
      )}

      {maturity && !maturity.applicable && (
        <EuiCallOut color='primary' iconType='iInCircle' size='s' title='No aplica en este nivel: la madurez no se valora.' />
      )}

      {maturity && maturity.applicable && (
        <>
          {!maturity.measured && (
            <>
              <EuiCallOut
                color='primary'
                iconType='clock'
                size='s'
                title='Sin medición todavía'
              >
                <p>El control está en borrador: ningún agente lo mide aún. Se puede declarar el nivel valorado con su justificación.</p>
              </EuiCallOut>
              <EuiSpacer size='s' />
            </>
          )}
          {assessment.mark && (
            <>
              <EuiCallOut color='warning' iconType='alert' size='s' title={assessment.mark} />
              <EuiSpacer size='s' />
            </>
          )}
          {assessment.dropped && (
            <>
              <EuiCallOut color='warning' iconType='clock' size='s' title={assessment.dropped} />
              <EuiSpacer size='s' />
            </>
          )}
          {assessment.line && (
            <EuiText size='s'>
              <p>
                <strong>Valoración:</strong> {assessment.line} ({maturity.assessments} {maturity.assessments === 1 ? 'valoración' : 'valoraciones'} en el historial).
              </p>
            </EuiText>
          )}
          {maturity.gates.length > 0 && (
            <>
              <EuiSpacer size='s' />
              <EuiBasicTable items={maturity.gates} columns={gateColumns} compressed />
            </>
          )}
          <EuiSpacer size='m' />
          <EuiText size='s'>
            <p>
              <strong>Procedimiento:</strong>{' '}
              {attestation
                ? `${attestation.reference} versión ${attestation.version}, aprobado el ${attestation.approvedAt}, vigente hasta ${attestation.validUntil}; difundido el ${attestation.disseminatedAt} a ${attestation.disseminatedTo}. Responsable: ${attestation.owner}.`
                : 'sin registrar.'}
            </p>
            <p>
              <strong>Última revisión:</strong>{' '}
              {review
                ? `${review.date} por ${review.reviewer} (${ownLabel(ENS_MATURITY_REVIEW_RESULTS, review.result) || review.result})${review.actions ? `: ${review.actions}` : ''}. ${maturity.reviews} en el historial.`
                : 'ninguna registrada.'}
            </p>
            <p>
              <strong>Umbral:</strong>{' '}
              {indicators ? `${indicators.minScore} %, revisión cada ${indicators.reviewPeriodDays} días.` : 'sin declarar.'}
            </p>
            <p>
              <strong>Realimentación:</strong>{' '}
              {maturity.feedback.length
                ? maturity.feedback
                    .map(
                      entry =>
                        `${entry.reference} (${ownLabel(ENS_MATURITY_FEEDBACK_SOURCES, entry.source) || entry.source}) ${
                          entry.closedAt ? `cerrada el ${entry.closedAt}${entry.procedureVersion ? ` con la versión ${entry.procedureVersion}` : ''}` : 'abierta'
                        }`
                    )
                    .join('; ')
                : 'ninguna registrada.'}
            </p>
          </EuiText>
        </>
      )}

      <EuiSpacer size='s' />
      <EuiFlexGroup gutterSize='s' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiButton size='s' fill iconType='check' onClick={() => setForm('assessment')} isDisabled={!maturity || version === undefined}>
            Valorar
          </EuiButton>
        </EuiFlexItem>
        {(['attestation', 'review', 'indicators', 'feedback'] as ENSMaturityRecordKind[]).map(kind => (
          <EuiFlexItem grow={false} key={kind}>
            <EuiButtonEmpty size='s' onClick={() => setForm(kind)} isDisabled={!maturity || version === undefined}>
              {MATURITY_FORM_TITLES[kind]}
            </EuiButtonEmpty>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>

      {form && (
        <MaturityEntryModal key={form} controlId={controlId} kind={form} maturity={maturity} version={version ?? null} onClose={() => setForm(undefined)} onSaved={onRecorded} />
      )}
    </EuiPanel>
  );
};
