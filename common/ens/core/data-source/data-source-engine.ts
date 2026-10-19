import { ENSNormalizedEvent } from './types';

// Event-name patterns that allow inferring a state when the event declares NO `estado`. They point only to NO_CUMPLE: name inference may push towards failure, never towards compliance
// (an `auth_success` fact means an authentication worked, not that the ENS control is met).
//   error / failed  the operation the evidence had to accredit did not complete
//   missing         the artifact the evidence requires is not there
//   unauthorized    access or identity outside what is authorised
// Known caveat of `missing`: an absence accuses only when the deployment guarantees the fact would have been observed, which the event name does not know. The event name does NOT suffice to decide a `*_missing`:
// the emitter should declare its `estado`. This file is shared by all controls.
const ADVERSE_EVENT_PATTERNS = [
  'error',
  'failed',
  'missing',
  'unauthorized',
];

const inferAdverseStatusFromEventType = (
  eventType?: string
): 'NO_CUMPLE' | undefined => {
  const event = String(eventType || '').toLowerCase();

  return ADVERSE_EVENT_PATTERNS.some(pattern =>
    event.includes(pattern)
  )
    ? 'NO_CUMPLE'
    : undefined;
};

const normalizeENSStatus = (status?: string, eventType?: string): string => {
  const value = String(status || '').toUpperCase();

  if (['CUMPLE', 'OK', 'SUCCESS', 'PASSED'].includes(value)) return 'CUMPLE';
  if (['PARCIAL', 'PARTIAL', 'WARNING'].includes(value)) return 'PARCIAL';
  if (['NO_CUMPLE', 'FAIL', 'FAILED', 'ERROR', 'KO'].includes(value)) return 'NO_CUMPLE';
  if (['NO_EVALUABLE', 'UNKNOWN', 'SIN_DATOS'].includes(value)) return 'NO_EVALUABLE';
  if (['NO_APLICA', 'NOT_APPLICABLE', 'N/A'].includes(value)) return 'NO_APLICA';

  // Without a declared `estado` the engine asserts no compliance. Before, any name containing `success`, `ok` or `configured` came out CUMPLE; now absence of data yields NO_EVALUABLE.
  return (
    inferAdverseStatusFromEventType(eventType) ||
    'NO_EVALUABLE'
  );
};

const normalizeBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;

  return ['true', '1', 'yes'].includes(
    String(value || '').trim().toLowerCase()
  );
};

const getFirstMeaningfulScalar = (
  ...values: unknown[]
): string | undefined => {
  for (const value of values) {
    if (
      typeof value !== 'string' &&
      typeof value !== 'number'
    ) {
      continue;
    }

    const normalized =
      String(value).trim();

    if (normalized) {
      return normalized;
    }
  }

  return undefined;
};

const buildEventAttributes = (
  data: any
): Record<string, unknown> => ({
  ...(data && typeof data === 'object' && !Array.isArray(data)
    ? data
    : {}),
  job_id: data?.job_id ?? data?.jobId,
  start_time: data?.start_time ?? data?.startTime,
  end_time: data?.end_time ?? data?.endTime,
  status: data?.status ?? data?.estado,
  bytes_written:
    data?.bytes_written ??
    data?.bytesWritten,
  tool: data?.tool ?? data?.herramienta,
  last_sync:
    getFirstMeaningfulScalar(
      data?.last_sync,
      data?.lastSync,
      data?.last_synced_at,
      data?.lastSyncedAt,
      data?.sync_timestamp,
      data?.syncTimestamp
    ),
  replication_time:
    getFirstMeaningfulScalar(
      data?.replication_time,
      data?.replicationTime,
      data?.sync_duration,
      data?.syncDuration,
      data?.replication_duration,
      data?.replicationDuration
    ),
  replication_lag:
    getFirstMeaningfulScalar(
      data?.replication_lag,
      data?.replicationLag,
      data?.sync_lag,
      data?.syncLag,
      data?.offsite_lag,
      data?.offsiteLag
    ),
  backup_path:
    data?.backup_path ??
    data?.backupPath ??
    data?.path,
  actor_user:
    getFirstMeaningfulScalar(
      data?.actor_user,
      data?.actorUser,
      data?.user,
      data?.username,
      data?.user_name,
      data?.srcuser,
      data?.dstuser,
      data?.audit?.user?.name,
      data?.syscheck?.audit?.user?.name,
      data?.win?.eventdata?.subjectUserName,
      data?.['audit.user.name'],
      data?.['syscheck.audit.user.name'],
      data?.['win.eventdata.subjectUserName']
    ),
  actor_process:
    getFirstMeaningfulScalar(
      data?.actor_process,
      data?.actorProcess,
      data?.process_name,
      data?.processName,
      data?.process?.name,
      data?.process?.executable,
      data?.executable,
      data?.exe,
      data?.program_name,
      data?.programName,
      data?.syscheck?.audit?.process?.name,
      data?.['process.name'],
      data?.['process.executable'],
      data?.['syscheck.audit.process.name']
    ),
  retention_days:
    data?.retention_days ??
    data?.retentionDays ??
    data?.retencion_dias ??
    data?.retencionDias,
});

const getEvidenceIds = (data: any): string[] => {
  const values = [
    data.evidence_id,
    data.evidenceId,
    data.ev_id,
    data.evidencias,
  ];

  const evidenceIds: string[] = [];

  values.forEach(value => {
    if (Array.isArray(value)) {
      value.forEach(item => evidenceIds.push(String(item).trim()));
      return;
    }

    if (typeof value === 'string') {
      value
        .split(/[,;|]/)
        .forEach(item => evidenceIds.push(item.trim()));
      return;
    }

    if (value !== undefined && value !== null) {
      evidenceIds.push(String(value).trim());
    }
  });

  return Array.from(
    new Set(evidenceIds.filter(Boolean))
  );
};

export const normalizeWazuhAlert = (hit: any): ENSNormalizedEvent => {
  const source = hit?._source || hit || {};
  const data = source.data || {};
  const rule = source.rule || {};
  const agent = source.agent || {};

  // No per-control translations. A special case once turned `offsite_ok` into `offsite_success` for mp.info.6 EV-06: a control wired into a shared file. If a translation is needed again, fix the name in the rule instead.
  const eventType =
    data.event ||
    rule.groups?.join(',') ||
    'unknown';

  const status = normalizeENSStatus(
    data.estado || data.status,
    eventType
  );

  const evidenceIds = getEvidenceIds(data);

  return {
    id: hit?._id || source.id || `${agent.id || 'unknown'}-${source['@timestamp'] || Date.now()}`,

    controlId:
      data.ensfacil ||
      data.ens ||
      data.control_id ||
      data.control ||
      undefined,

    requirementId:
      data.requisito ||
      data.requirement ||
      data.requirement_id ||
      undefined,

    evidenceId: evidenceIds[0],

    status,
    eventType,

    sourceType: 'WAZUH_ALERT',

    ruleId:
      rule.id ||
      data.rule_id ||
      undefined,

    ruleDescription:
      rule.description ||
      undefined,

    agentId:
      agent.id ||
      data.agent_id ||
      undefined,

    agentName:
      agent.name ||
      data.agent_name ||
      data.host ||
      undefined,

    timestamp:
      source['@timestamp'] ||
      source.timestamp ||
      data.ts ||
      new Date().toISOString(),

    source:
      source.location ||
      source.input?.type ||
      'wazuh-alerts',

    tool:
      data.tool ||
      data.herramienta ||
      undefined,

    attributes: buildEventAttributes(data),

    isSynthetic:
      normalizeBoolean(
        data.demo ??
          data.synthetic ??
          data.is_synthetic ??
          data.isSynthetic
      ) ||
      Boolean(
        data.test_id ??
          data.testId
      ),

    score:
      data.score !== undefined && Number.isFinite(Number(data.score))
        ? Number(data.score)
        : undefined,

    compliance:
      data.compliance !== undefined && Number.isFinite(Number(data.compliance))
        ? Number(data.compliance)
        : undefined,
    // Sin `raw`: el documento entero no lo lee nadie, y guardarlo mantenía
    // vivo cada documento mientras vivía su evento.
  };
};

export const normalizeWazuhAlerts = (
  hits: any[]
): ENSNormalizedEvent[] =>
  hits.reduce<ENSNormalizedEvent[]>((events, hit) => {
    const normalizedEvent = normalizeWazuhAlert(hit);
    const source = hit?._source || hit || {};
    const evidenceIds = getEvidenceIds(source.data || {});

    if (!evidenceIds.length) {
      events.push(normalizedEvent);
      return events;
    }

    evidenceIds.forEach(evidenceId => {
      events.push({
        ...normalizedEvent,
        id:
          evidenceIds.length > 1
            ? `${normalizedEvent.id}#${evidenceId}`
            : normalizedEvent.id,
        evidenceId,
      });
    });

    return events;
  }, []);
