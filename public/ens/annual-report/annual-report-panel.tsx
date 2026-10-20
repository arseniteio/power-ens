// «Informe anual (art. 32)»: the period's data set, its export (JSON, CSV), its freeze and, in op.mon.2, the measures
// without engine. The server checks the role of every record and freeze.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
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
import { fetchAnnualReport, freezeAnnualReport } from '../../../common/ens/annual-report/annual-report-http-client';
import { annualReportFileName, describeAnnualReport, toAnnualReportCsv, toAnnualReportJson } from '../../../common/ens/annual-report/annual-report-export';
import type { ENSAnnualReport, ENSAnnualReportResponse } from '../../../common/ens/annual-report/annual-report-types';
import { ENS_ANNUAL_REPORT_CONTROL } from '../../../common/ens/annual-report/declared-measures';
import type { ENSMaturityRecordKind } from '../../../common/ens/maturity/types';
import { MaturityEntryModal } from '../maturity/maturity-panel';
import {
  ANNUAL_REPORT_GUIDE_URL,
  declarationInitial,
  describeFreezeStatus,
  freezeActionOf,
  periodOptions,
  resourcesInitial,
  withoutEngineRows,
  WithoutEngineRow,
} from './annual-report-view';

const PENDING_RETRY_MS = 5000;

const download = (name: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

// The period's response, asked again every 5 s while the evaluation is pending.
export const useAnnualReport = (period?: string) => {
  const [response, setResponse] = useState<ENSAnnualReportResponse | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    fetchAnnualReport(period ? { period } : {})
      .then(data => {
        if (!alive.current) return;
        setResponse(data);
        setError(undefined);
        if (data.pending) timer = setTimeout(() => setTick(value => value + 1), PENDING_RETRY_MS);
      })
      .catch(failure => alive.current && setError(failure))
      .finally(() => alive.current && setLoading(false));
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [period, tick]);
  return { response, error, loading, reload: useCallback(() => setTick(value => value + 1), []) };
};

const FreezeModal = ({
  response,
  label,
  expectedRevision,
  onClose,
  onFrozen,
}: {
  response: ENSAnnualReportResponse;
  label: string;
  expectedRevision: number | null;
  onClose: () => void;
  onFrozen: () => void;
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!reason.trim()) {
      setError('Motivo: obligatorio; queda en el historial del informe.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await freezeAnnualReport({ period: response.period, reason: reason.trim(), expectedRevision });
      onFrozen();
      onClose();
    } catch (failure: any) {
      setError(failure?.message || String(failure));
    } finally {
      setSaving(false);
    }
  };
  return (
    <EuiModal onClose={onClose} style={{ width: 560 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          {label} el informe {response.period}
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText size='s'>
          <p>
            {expectedRevision === null
              ? 'Se guarda el conjunto con las cifras de hoy como el del periodo.'
              : `Se guarda una revisión nueva con las cifras de hoy; la revisión ${expectedRevision} se conserva en el historial.`}
          </p>
        </EuiText>
        <EuiSpacer size='s' />
        <EuiFormRow label='Motivo' fullWidth>
          <EuiTextArea value={reason} onChange={(event: any) => setReason(event.target.value)} rows={3} fullWidth />
        </EuiFormRow>
        {error && (
          <EuiCallOut color='danger' iconType='alert' size='s' title='No se ha congelado'>
            <p>{error}</p>
          </EuiCallOut>
        )}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
        <EuiButton fill isLoading={saving} onClick={save}>
          {label}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};

const MeasuresWithoutEngine = ({
  report,
  frozen,
  version,
  onRecorded,
}: {
  report: ENSAnnualReport;
  frozen: boolean;
  version: ENSAnnualReportResponse['maturityVersion'];
  onRecorded: () => void;
}) => {
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const rows = withoutEngineRows(report);
  const columns = [
    { field: 'id', name: 'Medida', width: '90px', render: (id: string, row: WithoutEngineRow) => <span title={row.name}>{id}</span> },
    { field: 'name', name: 'Nombre' },
    { field: 'engine', name: 'Motor', width: '130px' },
    { field: 'level', name: 'Nivel', width: '70px' },
    { field: 'requirement', name: 'Anexo II', width: '110px' },
    { field: 'applies', name: 'Aplica', width: '90px', render: (applies: string, row: WithoutEngineRow) => `${applies}${row.appliesSource ? ` (${row.appliesSource})` : ''}` },
    { field: 'assessed', name: 'Madurez', width: '80px', render: (assessed: string, row: WithoutEngineRow) => `${assessed} / ${row.target}` },
    { field: 'reference', name: 'Referencia', render: (reference: string, row: WithoutEngineRow) => [reference, row.owner, row.date].filter(Boolean).join(' · ') || '—' },
    {
      name: '',
      width: '90px',
      render: (row: WithoutEngineRow) => (
        <EuiButtonEmpty size='xs' onClick={() => setEditing(row.id)} isDisabled={version === undefined}>
          Declarar
        </EuiButtonEmpty>
      ),
    },
  ];
  return (
    <>
      <EuiTitle size='xs'>
        <h4>Medidas sin motor</h4>
      </EuiTitle>
      <EuiText size='xs' color='subdued'>
        <p>
          Medidas del Anexo II que ENSFácil no mide: fuera del catálogo o sin medición todavía. Cada una lleva su entrada declarada (aplica, madurez,
          referencia documental, responsable y fecha). {frozen ? 'El periodo mostrado está congelado: una entrada nueva cuenta en el periodo en curso.' : ''}
        </p>
      </EuiText>
      <EuiSpacer size='s' />
      <EuiBasicTable items={rows} columns={columns as any} compressed tableLayout='auto' />
      {editing && (
        <MaturityEntryModal
          key={editing}
          controlId={editing}
          kind='declaration'
          version={version ?? null}
          initial={declarationInitial(report.measures.find(measure => measure.id === editing))}
          onClose={() => setEditing(undefined)}
          onSaved={onRecorded}
        />
      )}
    </>
  );
};

export const AnnualReportPanel = ({
  showMeasures,
  onReport,
}: {
  // op.mon.2 detail: also the «Medidas sin motor» section.
  showMeasures?: boolean;
  // The reports screen draws field 8 of the PDF from this data set.
  onReport?: (report: ENSAnnualReport | undefined) => void;
}) => {
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const { response, error, loading, reload } = useAnnualReport(period);
  const [form, setForm] = useState<{ kind: 'freeze' } | { kind: ENSMaturityRecordKind } | undefined>(undefined);
  const report = response?.report;
  useEffect(() => {
    if (onReport) onReport(report);
  }, [report, onReport]);
  const action = response ? freezeActionOf(response) : undefined;

  return (
    <EuiPanel>
      <EuiFlexGroup alignItems='center' justifyContent='spaceBetween' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiTitle size='s'>
            <h3>Informe anual (art. 32)</h3>
          </EuiTitle>
        </EuiFlexItem>
        {response && (
          <EuiFlexItem grow={false}>
            <EuiSelect
              compressed
              prepend='Periodo'
              options={periodOptions(response).map(value => ({ value, text: value }))}
              value={response.period}
              onChange={(event: any) => setPeriod(event.target.value)}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiText size='xs' color='subdued'>
        <p>
          Conjunto de datos del informe anual del art. 32 por medida del Anexo II, con identificadores estables y el origen de cada cifra.{' '}
          <EuiLink href={ANNUAL_REPORT_GUIDE_URL} target='_blank' external>
            Guía 11
          </EuiLink>
        </p>
      </EuiText>
      <EuiSpacer size='s' />

      {error && (
        <EuiCallOut color='danger' iconType='alert' size='s' title='No se ha podido generar el informe anual'>
          <p>{error.message}</p>
          <EuiButton size='s' iconType='refresh' onClick={reload}>
            Reintentar
          </EuiButton>
        </EuiCallOut>
      )}
      {!response && !error && loading && <EuiText size='s'>Generando el informe anual…</EuiText>}
      {response?.freezeError && (
        <>
          <EuiCallOut color='warning' iconType='alert' size='s' title={response.freezeError} />
          <EuiSpacer size='s' />
        </>
      )}
      {response && (
        <EuiText size='s'>
          <p>
            <strong>{describeFreezeStatus(response)}</strong>
          </p>
        </EuiText>
      )}
      {response?.pending && <EuiText size='s'>Evaluando todos los controles…</EuiText>}
      {report && (
        <>
          <EuiText size='s'>
            <ul>
              {describeAnnualReport(report)
                .slice(2, -1)
                .map(line => (
                  <li key={line}>{line}</li>
                ))}
            </ul>
          </EuiText>
          <EuiSpacer size='s' />
          <EuiFlexGroup gutterSize='s' responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiButton size='s' iconType='download' onClick={() => download(annualReportFileName(report, 'json'), toAnnualReportJson(report), 'application/json')}>
                Descargar JSON
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton size='s' iconType='download' onClick={() => download(annualReportFileName(report, 'csv'), toAnnualReportCsv(report), 'text/csv;charset=utf-8')}>
                Descargar CSV
              </EuiButton>
            </EuiFlexItem>
            {action && (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size='s' iconType='lock' onClick={() => setForm({ kind: 'freeze' })}>
                  {action.label}
                </EuiButtonEmpty>
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size='s' onClick={() => setForm({ kind: 'resources' })} isDisabled={response?.maturityVersion === undefined}>
                Recursos TIC totales
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}

      {showMeasures && report && response && (
        <>
          <EuiSpacer size='m' />
          <MeasuresWithoutEngine report={report} frozen={Boolean(response.frozen)} version={response.maturityVersion} onRecorded={reload} />
        </>
      )}

      {form?.kind === 'freeze' && response && action && (
        <FreezeModal response={response} label={action.label} expectedRevision={action.expectedRevision} onClose={() => setForm(undefined)} onFrozen={reload} />
      )}
      {form?.kind === 'resources' && report && response && (
        <MaturityEntryModal
          controlId={ENS_ANNUAL_REPORT_CONTROL}
          kind='resources'
          version={response.maturityVersion ?? null}
          initial={resourcesInitial(report)}
          onClose={() => setForm(undefined)}
          onSaved={reload}
        />
      )}
    </EuiPanel>
  );
};
