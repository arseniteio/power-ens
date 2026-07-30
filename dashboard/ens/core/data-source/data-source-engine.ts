import { ENSNormalizedEvent } from './types';

// Patrones de nombre de evento que permiten inferir un estado cuando el evento
// NO declara `estado`. Solo apuntan a NO_CUMPLE: la inferencia por nombre puede
// empujar hacia el incumplimiento, nunca hacia el cumplimiento.
//
// Por qué solo en esa dirección: el nombre de un evento describe un hecho
// observado, no un veredicto. Que un hecho se llame `auth_success` significa que
// una autenticación funcionó, no que el control ENS se cumpla. Afirmar
// cumplimiento a partir del nombre convierte cualquier hecho técnico
// desconocido en un CUMPLE, que es exactamente el falso verde que el producto
// no puede permitirse.
//
// Cada patrón, justificado:
//   error / failed  la operación que la evidencia debía acreditar no se completó
//   missing         el artefacto que la evidencia exige no está
//   unauthorized    acceso o identidad fuera de lo autorizado; no conformidad
//
// Salvedad conocida de `missing`: las reglas del propio producto no le dan
// siempre el mismo estado (106601 `backup_missing` declara NO_CUMPLE, pero
// 106606 `restore_missing` declara NO_EVALUABLE). Como ambos eventos vienen del
// emisor con su `estado`, la inferencia no llega a aplicarse sobre ellos y la
// discrepancia no se manifiesta. Si algún día un evento `*_missing` llegara sin
// `estado`, este patrón lo pondría en rojo: revisar entonces si procede sacarlo.
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

  // Sin `estado` declarado el motor no afirma cumplimiento. Antes, cualquier
  // nombre que contuviera `success`, `ok` o `configured` —y `authorized_access`
  // literal— salia CUMPLE: la ausencia de dato producia una afirmacion de
  // conformidad. Ahora la ausencia de dato produce NO_EVALUABLE.
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

  const rawEventType =
    data.event ||
    rule.groups?.join(',') ||
    'unknown';

  const eventType =
    String(rawEventType).toLowerCase() === 'offsite_ok'
      ? 'offsite_success'
      : rawEventType;

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

    raw: source,
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
