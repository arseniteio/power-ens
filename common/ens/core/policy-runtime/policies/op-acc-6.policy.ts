// op.acc.6 · Authentication mechanism (organization users).
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSPolicyRuleType,
} from '../types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSEvidenceDefinition } from '../../evidence/types';
import {
  getEventFieldValue,
  hasMeaningfulValue,
  sortByTimestampDesc,
} from '../../evidence/normalized-events';
import {
  parseReferenceList,
  parseReferenceRows,
  resolveCollectorCoverage,
} from '../../evidence/judgment';

const CONTROL_ID = 'op.acc.6';
const POLICY_ID = 'policy.op.acc.6';


const decide = (
  requirementId: string,
  status: ENSPolicyDecision['status'],
  reason: string,
  ruleType: ENSPolicyRuleType,
  extra: {
    parameterIds?: string[];
    evidenceIds?: string[];
    eventIds?: string[];
    expected?: string;
    actual?: string;
  } = {}
): ENSPolicyDecision => ({
  policyId: POLICY_ID,
  requirementId,
  status,
  parameterIds: extra.parameterIds || [],
  evidenceIds: extra.evidenceIds || [],
  eventIds: extra.eventIds || [],
  runtimeVariables: [],
  trace: {
    ruleId: requirementId,
    ruleType,
    expression: requirementId,
    expected: extra.expected || '',
    actual: extra.actual || '',
    result: status === 'CUMPLE',
  },
  reason,
});

// Enumerates without flooding: the auditor reads five cases and how many more there are.
const enumerates = (items: string[]): string => {
  const unique = Array.from(new Set(items));
  const seen = unique.slice(0, 5).join('; ');
  return unique.length > 5 ? `${seen}; y ${unique.length - 5} más` : seen;
};


const getParameter = (context: ENSPolicyContext, parameterId: string) =>
  context.configuration?.parameters.find(
    parameter => parameter.id === parameterId
  );

const text = (event: ENSNormalizedEvent, field: string): string => {
  const value = getEventFieldValue(event, field);
  return hasMeaningfulValue(value) ? String(value).trim() : '';
};

const numberOf = (
  event: ENSNormalizedEvent,
  field: string
): number | undefined => {
  const value = getEventFieldValue(event, field);
  if (!hasMeaningfulValue(value)) {
    return undefined;
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

// Facts of THIS control, of the requested type and evidence. The normalizer splits a shared fact
// into one copy per evidence; filtering by evidence avoids counting it twice.
const factsOf = (
  context: ENSPolicyContext,
  eventType: string,
  evidenceId: string
): ENSNormalizedEvent[] =>
  sortByTimestampDesc(
    context.events.filter(
      event =>
        event.controlId === CONTROL_ID &&
        event.eventType === eventType &&
        (!event.evidenceId || event.evidenceId === evidenceId)
    )
  );

const where = (event: ENSNormalizedEvent): string =>
  event.agentName || event.agentId || text(event, 'host') || 'agente';

// The latest fact per key: a configuration observed hourly does not add up, the last run says how
// it is.
const latestBy = (
  events: ENSNormalizedEvent[],
  key: (event: ENSNormalizedEvent) => string
): ENSNormalizedEvent[] => {
  const seen = new Map<string, ENSNormalizedEvent>();
  sortByTimestampDesc(events).forEach(event => {
    const k = key(event);
    if (!seen.has(k)) {
      seen.set(k, event);
    }
  });
  return Array.from(seen.values());
};

// Addresses and networks. No dependencies: IPv4 and IPv6 as byte arrays; the `%zone` of a
// link-local address is not part of the address.

type Address = { family: 4 | 6; bytes: number[] };

const parseIPv4 = (value: string): number[] | undefined => {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  const bytes = parts.map(part =>
    /^\d{1,3}$/.test(part) ? Number(part) : NaN
  );
  return bytes.every(byte => byte >= 0 && byte <= 255) ? bytes : undefined;
};

const parseAddress = (raw: string): Address | undefined => {
  const value = raw.trim().replace(/^\[|\]$/g, '').split('%')[0];

  if (!value) {
    return undefined;
  }

  if (!value.includes(':')) {
    const bytes = parseIPv4(value);
    return bytes ? { family: 4, bytes } : undefined;
  }

  let head = value;
  let tailV4: number[] = [];
  const lastColon = value.lastIndexOf(':');
  if (value.slice(lastColon + 1).includes('.')) {
    const v4 = parseIPv4(value.slice(lastColon + 1));
    if (!v4) {
      return undefined;
    }
    tailV4 = v4;
    head = value.slice(0, lastColon + 1) + '0:0';
  }

  const halves = head.split('::');
  if (halves.length > 2) {
    return undefined;
  }

  const groupsOf = (part: string): number[] | undefined => {
    if (!part) {
      return [];
    }
    const groups = part.split(':').map(group =>
      /^[0-9a-fA-F]{1,4}$/.test(group) ? parseInt(group, 16) : NaN
    );
    return groups.every(group => Number.isFinite(group)) ? groups : undefined;
  };

  const left = groupsOf(halves[0]);
  const right = halves.length === 2 ? groupsOf(halves[1]) : [];

  if (!left || !right) {
    return undefined;
  }

  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) {
    return undefined;
  }

  const groups = [...left, ...Array(missing).fill(0), ...right];
  const bytes = groups.flatMap(group => [group >> 8, group & 0xff]);

  if (tailV4.length) {
    bytes.splice(12, 4, ...tailV4);
  }

  return { family: 6, bytes };
};

// A P-02 zone: a CIDR range, a single address or `local` (the physical console). What follows the
// first space is a comment.
type Zone =
  | { kind: 'local'; label: string }
  | { kind: 'net'; label: string; address: Address; prefix: number };

const parseZone = (raw: string): Zone | undefined => {
  const token = raw.trim().split(/\s+/)[0];

  if (!token) {
    return undefined;
  }

  if (token.toLowerCase() === 'local') {
    return { kind: 'local', label: 'local' };
  }

  const [addressText, prefixText] = token.split('/');
  const address = parseAddress(addressText);

  if (!address) {
    return undefined;
  }

  const max = address.family === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? max : Number(prefixText);

  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) {
    return undefined;
  }

  return { kind: 'net', label: token, address, prefix };
};

const inZone = (address: Address, zone: Zone): boolean => {
  if (zone.kind !== 'net' || zone.address.family !== address.family) {
    return false;
  }
  let bits = zone.prefix;
  for (let i = 0; i < address.bytes.length && bits > 0; i += 1) {
    const take = Math.min(8, bits);
    const mask = (0xff << (8 - take)) & 0xff;
    if ((address.bytes[i] & mask) !== (zone.address.bytes[i] & mask)) {
      return false;
    }
    bits -= take;
  }
  return true;
};

type Classification = 'controlada' | 'no_controlada' | 'ilegible';

const classify = (origin: string, zones: Zone[]): Classification => {
  if (origin.toLowerCase() === 'local') {
    // The console is a controlled zone only if someone DECIDED so: a virtual machine's console can
    // be opened from anywhere.
    return zones.some(zone => zone.kind === 'local')
      ? 'controlada'
      : 'no_controlada';
  }
  const address = parseAddress(origin);
  if (!address) {
    return 'ilegible';
  }
  return zones.some(zone => inZone(address, zone))
    ? 'controlada'
    : 'no_controlada';
};


type Mechanism = 'R1' | 'R2' | 'R3' | 'R4';

const MECHANISM_REQUIREMENTS: Record<string, Mechanism[]> = {
  'op.acc.6.r1.1': ['R1'],
  // Complexity also governs with R2: «password + another factor» is still a password (the template
  // says so in P-10).
  'op.acc.6.r1.2': ['R1', 'R2'],
  'op.acc.6.r2.1': ['R2'],
  'op.acc.6.r3.1': ['R3'],
  'op.acc.6.r3.2': ['R3'],
  'op.acc.6.r4.1': ['R4'],
  'op.acc.6.r4.2': ['R4'],
};

const RULE_TYPES: Record<string, ENSPolicyRuleType> = {
  'op.acc.6.8': 'CONDITIONAL_REQUIRED',
  'op.acc.6.r1.1': 'CONDITIONAL_REQUIRED',
  'op.acc.6.r1.2': 'COVERAGE_REQUIRED',
  'op.acc.6.r2.1': 'CONDITIONAL_REQUIRED',
  'op.acc.6.r3.1': 'CONDITIONAL_REQUIRED',
  'op.acc.6.r3.2': 'CONDITIONAL_REQUIRED',
  'op.acc.6.r4.1': 'CONDITIONAL_REQUIRED',
  'op.acc.6.r4.2': 'CONDITIONAL_REQUIRED',
  'op.acc.6.r8.1': 'WHITELIST',
};

const resolveMechanism = (
  context: ENSPolicyContext
): Mechanism | undefined => {
  const value = getParameter(context, 'P-01')?.value;
  const match = hasMeaningfulValue(value)
    ? String(value).trim().toUpperCase().match(/^R([1-4])\b/)
    : null;
  return match ? (`R${match[1]}` as Mechanism) : undefined;
};


const COVERAGE_EV02: ENSEvidenceDefinition = {
  id: 'EV-02',
  controlId: CONTROL_ID,
  title: 'EV-02',
  description: '',
  requirements: [],
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  category: 'ACCESS_CONTROL',
  criticality: 'HIGH',
  sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
  expectedEventTypes: [],
  relatedRules: [],
  auditQuestion: '',
};

interface ZoneCheck {
  requirementId: string;
  // Must this access have verified two factors?
  accessNeedsTwo: (zone: Classification, event: ENSNormalizedEvent) => boolean;
  // Must this channel, at this address, require two factors?
  channelNeedsTwo: (zone: Classification, event: ENSNormalizedEvent) => boolean;
  needsZones: boolean;
  expected: string;
}

const usesPassword = (event: ENSNormalizedEvent): boolean =>
  /password|keyboard-interactive/.test(text(event, 'metodos'));

const ZONE_CHECKS: Record<string, ZoneCheck> = {
  'op.acc.6.r8.1': {
    requirementId: 'op.acc.6.r8.1',
    accessNeedsTwo: zone => zone === 'no_controlada',
    channelNeedsTwo: zone => zone === 'no_controlada',
    needsZones: true,
    expected:
      'todo acceso desde fuera de P-02 con dos factores, y ningún canal expuesto fuera de P-02 que admita uno solo',
  },
  'op.acc.6.r1.1': {
    requirementId: 'op.acc.6.r1.1',
    accessNeedsTwo: (zone, event) =>
      zone === 'no_controlada' && usesPassword(event),
    channelNeedsTwo: (zone, event) =>
      zone === 'no_controlada' && text(event, 'contrasena_admitida') === 'si',
    needsZones: true,
    expected:
      'ninguna contraseña sola desde fuera de P-02, ni canal expuesto fuera de P-02 que la admita',
  },
  'op.acc.6.r2.1': {
    requirementId: 'op.acc.6.r2.1',
    accessNeedsTwo: () => true,
    channelNeedsTwo: () => true,
    needsZones: false,
    expected: 'todo acceso con dos factores y ningún canal que admita uno solo',
  },
};

const judgeZones = (
  context: ENSPolicyContext,
  check: ZoneCheck
): ENSPolicyDecision => {
  const ruleType = RULE_TYPES[check.requirementId];
  const parameterIds = check.needsZones ? ['P-02'] : [];
  const base = { parameterIds, evidenceIds: ['EV-02'] };

  const zoneRows = parseReferenceList(getParameter(context, 'P-02')?.value);
  const zones = zoneRows
    .map(parseZone)
    .filter((zone): zone is Zone => Boolean(zone));
  const invalidZones = zoneRows.filter(row => !parseZone(row));

  if (check.needsZones && !zoneRows.length) {
    return decide(
      check.requirementId,
      'NO_EVALUABLE',
      'P-02 (zonas controladas) no está declarado: sin saber qué redes son zona controlada no se puede saber qué accesos exigen doble factor.',
      ruleType,
      { ...base, expected: check.expected, actual: 'P-02 sin declarar' }
    );
  }

  if (check.needsZones && invalidZones.length) {
    return decide(
      check.requirementId,
      'NO_EVALUABLE',
      `P-02 contiene elementos que no son un rango, una dirección ni «local»: ${enumerates(invalidZones)}. Clasificar contra una zona mal escrita daría por no controlada una red que sí lo es, o al revés.`,
      ruleType,
      { ...base, expected: check.expected, actual: 'P-02 ilegible' }
    );
  }

  const accesses = factsOf(context, 'authentication_success', 'EV-02');
  const channels = latestBy(
    factsOf(context, 'remote_channel_listening', 'EV-02'),
    event => `${where(event)}|${text(event, 'plano')}|${text(event, 'canal')}`
  );

  const offenders: string[] = [];
  const undecidable: string[] = [];
  const eventIds: string[] = [];

  accesses.forEach(event => {
    const origin = text(event, 'origen');
    const zone = check.needsZones ? classify(origin, zones) : 'no_controlada';

    if (zone === 'ilegible') {
      undecidable.push(
        `acceso de ${text(event, 'usuario')} en ${where(event)} con origen ilegible '${origin}'`
      );
      return;
    }

    if (!check.accessNeedsTwo(zone, event)) {
      return;
    }

    const factors = numberOf(event, 'factores');
    if (factors === undefined) {
      undecidable.push(
        `acceso de ${text(event, 'usuario')} desde ${origin} en ${where(event)} sin campo factores`
      );
      return;
    }

    if (factors < 2) {
      offenders.push(
        `${text(event, 'usuario')} entró en ${where(event)} por ${text(event, 'canal')} desde ${origin}${check.needsZones ? ' (zona no controlada)' : ''} con ${factors} factor (${text(event, 'metodos')})`
      );
      eventIds.push(event.id);
    }
  });

  channels
    .filter(event => text(event, 'tipo') === 'autenticacion')
    .forEach(event => {
      const addresses = parseReferenceList(text(event, 'direcciones'));
      const exposed = addresses.filter(address => {
        const zone = check.needsZones
          ? classify(address, zones)
          : 'no_controlada';
        return zone !== 'controlada' && check.channelNeedsTwo(zone, event);
      });

      if (!exposed.length) {
        return;
      }

      if (text(event, 'match_condicional') === 'si') {
        undecidable.push(
          `el canal ${text(event, 'canal')} de ${where(event)} tiene bloques Match: lo que exige depende del origen y no se puede leer de la configuración global`
        );
        return;
      }

      const minimum = numberOf(event, 'factores_minimos');
      if (minimum === undefined) {
        undecidable.push(
          `el canal ${text(event, 'canal')} de ${where(event)} no declara cuántos factores exige`
        );
        return;
      }

      if (minimum < 2) {
        offenders.push(
          `el canal ${text(event, 'canal')} de ${where(event)} escucha en ${enumerates(exposed)}${check.needsZones ? ', fuera de P-02,' : ''} y admite ${minimum} factor`
        );
        eventIds.push(event.id);
      }
    });

  if (offenders.length) {
    return decide(
      check.requirementId,
      'NO_CUMPLE',
      `No se exige doble factor donde ${check.requirementId} lo pide: ${enumerates(offenders)}.`,
      ruleType,
      {
        ...base,
        eventIds,
        expected: check.expected,
        actual: `${offenders.length} caso(s) con un solo factor`,
      }
    );
  }

  if (undecidable.length) {
    return decide(
      check.requirementId,
      'NO_EVALUABLE',
      `No se ha podido decidir: ${enumerates(undecidable)}.`,
      ruleType,
      { ...base, expected: check.expected, actual: 'hechos incompletos' }
    );
  }

  // Without failures: valid if the channels' configuration was seen (what the system REQUIRES,
  // which also bounds unseen accesses), or if the collector is recorded as having looked and there
  // is no channel or access to judge.
  if (channels.length) {
    return decide(
      check.requirementId,
      'CUMPLE',
      `${accesses.length} acceso(s) observado(s) y ${channels.length} canal(es) en escucha: ninguno admite un solo factor donde ${check.requirementId} exige dos.`,
      ruleType,
      { ...base, expected: check.expected, actual: 'sin casos de un solo factor' }
    );
  }

  const coverage = resolveCollectorCoverage(
    COVERAGE_EV02,
    {
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-02',
      factEventTypes: ['authentication_success'],
      factField: 'origen',
    },
    context.events.filter(event => event.controlId === CONTROL_ID),
    context.now
  );

  if (coverage.coverage === 'CONFIRMADA') {
    return decide(
      check.requirementId,
      'CUMPLE',
      `El recolector barrió los canales y el log de autenticación y no hay ningún canal remoto de autenticación ni acceso que juzgar. ${coverage.reason}`,
      ruleType,
      { ...base, expected: check.expected, actual: 'sin canales ni accesos' }
    );
  }

  return decide(
    check.requirementId,
    'NO_EVALUABLE',
    `No consta ningún canal en escucha ni ningún acceso, y no consta que el recolector mirara: ${coverage.reason}`,
    ruleType,
    { ...base, expected: check.expected, actual: 'sin hechos' }
  );
};


const judgeAttempts = (context: ENSPolicyContext): ENSPolicyDecision => {
  const requirementId = 'op.acc.6.8';
  const ruleType = RULE_TYPES[requirementId];
  const base = { parameterIds: ['P-05'], evidenceIds: ['EV-03', 'EV-04'] };
  const expected =
    'todo camino con contraseña en uso bloquea tras P-05 fallos como mucho y no se desbloquea solo';

  const limitValue = getParameter(context, 'P-05')?.value;
  const limit = hasMeaningfulValue(limitValue)
    ? Number(String(limitValue).trim())
    : NaN;

  if (!Number.isFinite(limit)) {
    return decide(
      requirementId,
      'NO_EVALUABLE',
      'P-05 (máximo de intentos fallidos) no está declarado o no es un número.',
      ruleType,
      { ...base, expected, actual: 'P-05 sin declarar' }
    );
  }

  const policies = latestBy(
    factsOf(context, 'lockout_policy_checked', 'EV-03'),
    event => `${where(event)}|${text(event, 'plano')}|${text(event, 'ruta')}`
  );

  if (!policies.length) {
    return decide(
      requirementId,
      'NO_EVALUABLE',
      'No consta la configuración del límite de intentos de ningún camino de autenticación: el agente no ha emitido lockout_policy_checked.',
      ruleType,
      { ...base, expected, actual: 'sin hechos' }
    );
  }

  const offenders: string[] = [];
  const undecidable: string[] = [];
  const eventIds: string[] = [];
  let judged = 0;

  policies.forEach(event => {
    const route = `${text(event, 'ruta')} en ${where(event)}`;
    const lock = text(event, 'bloqueo');

    // `no_aplica`: the path does not authenticate with something guessable (a public key).
    // `en_uso=no`: the path exists but is disabled (PasswordAuthentication no), so nobody can try
    // anything through it.
    if (lock === 'no_aplica' || text(event, 'en_uso') === 'no') {
      return;
    }

    judged += 1;

    // `desconocido`: the agent could not read that path's policy (directory without read
    // permission). Not a path without lockout but an unmeasured one: it blocks CUMPLE without
    // accusing.
    if (lock === 'desconocido' || !lock) {
      undecidable.push(`${route}: no se ha podido leer su política de bloqueo${text(event, 'detalle') ? ` (${text(event, 'detalle')})` : ''}`);
      return;
    }

    if (lock !== 'si') {
      offenders.push(`${route} no bloquea la cuenta tras ningún número de fallos`);
      eventIds.push(event.id);
      return;
    }

    const max = numberOf(event, 'max_intentos');
    if (max === undefined) {
      undecidable.push(`${route} no declara tras cuántos fallos bloquea`);
      return;
    }

    if (max > limit) {
      offenders.push(`${route} bloquea tras ${max} fallos y P-05 admite ${limit}`);
      eventIds.push(event.id);
    }

    if (text(event, 'desbloqueo_automatico') === 'si') {
      offenders.push(
        `${route} desbloquea la cuenta sola a los ${text(event, 'desbloqueo_segundos') || '?'} s: el ENS exige una intervención específica para reactivarla`
      );
      eventIds.push(event.id);
    }
  });

  // Failures per EXISTING account in one run, without a recorded lockout of that account in the
  // window. A run is an hour: accumulating the whole window would count a month's slips as an
  // attack.
  const locks = factsOf(context, 'account_locked', 'EV-04');
  const locked = new Set(
    locks.map(event => `${where(event)}|${text(event, 'usuario')}`)
  );

  factsOf(context, 'authentication_failure', 'EV-04').forEach(event => {
    if (text(event, 'usuario_existe') !== 'si') {
      return;
    }
    const failures = numberOf(event, 'fallos');
    if (failures === undefined || failures <= limit) {
      return;
    }
    const key = `${where(event)}|${text(event, 'usuario')}`;
    if (!locked.has(key)) {
      offenders.push(
        `${text(event, 'usuario')} acumuló ${failures} fallos en una pasada en ${where(event)} desde ${text(event, 'origen')} sin que conste su bloqueo`
      );
      eventIds.push(event.id);
    }
  });

  if (offenders.length) {
    return decide(
      requirementId,
      'NO_CUMPLE',
      `El número de intentos no está limitado con bloqueo efectivo: ${enumerates(offenders)}.`,
      ruleType,
      {
        ...base,
        eventIds,
        expected,
        actual: `${offenders.length} desviación(es)`,
      }
    );
  }

  if (undecidable.length) {
    return decide(
      requirementId,
      'NO_EVALUABLE',
      `No se ha podido decidir: ${enumerates(undecidable)}.`,
      ruleType,
      { ...base, expected, actual: 'hechos incompletos' }
    );
  }

  if (!judged) {
    return decide(
      requirementId,
      'NO_EVALUABLE',
      'Ningún camino de autenticación observado admite intentos adivinables: no hay límite de intentos que demostrar, y tampoco se puede afirmar que exista.',
      ruleType,
      { ...base, expected, actual: 'sin caminos con contraseña en uso' }
    );
  }

  return decide(
    requirementId,
    'CUMPLE',
    `Los ${judged} camino(s) con contraseña en uso bloquean tras ${limit} fallos como mucho y exigen intervención para desbloquear, y ninguna cuenta supera P-05 sin bloqueo.`,
    ruleType,
    { ...base, expected, actual: 'límite y bloqueo efectivos' }
  );
};


const PASSWORD_CRITERIA = [
  'longitud_minima',
  'clases_de_caracteres',
  'historial',
  'lista_de_bloqueo',
];

const judgePasswordQuality = (
  context: ENSPolicyContext
): ENSPolicyDecision => {
  const requirementId = 'op.acc.6.r1.2';
  const ruleType = RULE_TYPES[requirementId];
  const base = { parameterIds: ['P-10'], evidenceIds: ['EV-11'] };
  const expected = 'cada medida de la política de contraseñas alcanza su mínimo de P-10';

  const rows = parseReferenceRows(getParameter(context, 'P-10')?.value)
    .map(row => row.split('|').map(cell => cell.trim()))
    .filter(cells => cells[0]);

  if (!rows.length) {
    return decide(
      requirementId,
      'NO_EVALUABLE',
      'P-10 (mínimos de robustez de contraseña) no está declarado: sin la política escrita no hay contra qué contrastar lo que el sistema impone.',
      ruleType,
      { ...base, expected, actual: 'P-10 sin declarar' }
    );
  }

  const minimums: { criterion: string; minimum: number }[] = [];
  const invalid: string[] = [];

  rows.forEach(([criterion, minimum]) => {
    const value = Number(minimum);
    if (!PASSWORD_CRITERIA.includes(criterion) || !Number.isFinite(value)) {
      invalid.push(`'${criterion} | ${minimum ?? ''}'`);
      return;
    }
    minimums.push({ criterion, minimum: value });
  });

  if (invalid.length) {
    return decide(
      requirementId,
      'NO_EVALUABLE',
      `P-10 contiene filas que no se pueden interpretar: ${enumerates(invalid)}.`,
      ruleType,
      { ...base, expected, actual: 'P-10 ilegible' }
    );
  }

  const policies = latestBy(
    factsOf(context, 'password_policy_checked', 'EV-11'),
    event => `${where(event)}|${text(event, 'plano')}|${text(event, 'mecanismo')}`
  );

  if (!policies.length) {
    return decide(
      requirementId,
      'NO_EVALUABLE',
      'No consta la política de contraseñas que impone ningún sistema: el agente no ha emitido password_policy_checked.',
      ruleType,
      { ...base, expected, actual: 'sin hechos' }
    );
  }

  const offenders: string[] = [];
  const undecidable: string[] = [];
  const eventIds: string[] = [];

  policies.forEach(event => {
    minimums.forEach(({ criterion, minimum }) => {
      const observed = numberOf(event, criterion);
      const label = `${text(event, 'mecanismo')} en ${where(event)}`;
      if (observed === undefined) {
        undecidable.push(`${label} no declara ${criterion}`);
        return;
      }
      if (observed < minimum) {
        offenders.push(`${label} impone ${criterion}=${observed} y P-10 exige ${minimum}`);
        eventIds.push(event.id);
      }
    });
  });

  if (offenders.length) {
    return decide(
      requirementId,
      'NO_CUMPLE',
      `La política de contraseñas no alcanza los mínimos declarados: ${enumerates(offenders)}.`,
      ruleType,
      { ...base, eventIds, expected, actual: `${offenders.length} medida(s) por debajo` }
    );
  }

  if (undecidable.length) {
    return decide(
      requirementId,
      'NO_EVALUABLE',
      `No se ha podido decidir: ${enumerates(undecidable)}.`,
      ruleType,
      { ...base, expected, actual: 'hechos incompletos' }
    );
  }

  return decide(
    requirementId,
    'CUMPLE',
    `Las ${policies.length} política(s) de contraseña observadas alcanzan todos los mínimos de P-10.`,
    ruleType,
    { ...base, expected, actual: 'mínimos alcanzados' }
  );
};


const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const decisions: ENSPolicyDecision[] = [];

  // ORDER MATTERS for the evidence layer: a shared evidence inherits the WORST decision and, on a
  // tie, the first. r8.1 goes before r1.1 and r2.1 so a NO_APLICA of these does not hide R8's
  // verdict in EV-02.
  decisions.push(judgeZones(context, ZONE_CHECKS['op.acc.6.r8.1']));
  decisions.push(judgeAttempts(context));

  const mechanism = resolveMechanism(context);

  Object.entries(MECHANISM_REQUIREMENTS).forEach(([requirementId, mechanisms]) => {
    const ruleType = RULE_TYPES[requirementId];

    if (!mechanism) {
      decisions.push(
        decide(
          requirementId,
          'NO_EVALUABLE',
          'P-01 (refuerzo de autenticación elegido) no está declarado: sin saber si el mecanismo es R1, R2, R3 o R4 no se sabe qué refuerzo rige.',
          ruleType,
          { parameterIds: ['P-01'], expected: 'P-01 declarado', actual: 'P-01 sin declarar' }
        )
      );
      return;
    }

    if (!mechanisms.includes(mechanism)) {
      decisions.push(
        decide(
          requirementId,
          'NO_APLICA',
          `No rige: P-01 declara ${mechanism} y este requisito es de ${mechanisms.join(' o ')}. El ENS exige uno de los cuatro refuerzos, no los cuatro.`,
          ruleType,
          { parameterIds: ['P-01'], expected: mechanisms.join(' o '), actual: mechanism }
        )
      );
      return;
    }

    // Governs. Those with technical evidence are judged by this evaluator; R3 and R4 have none and
    // are accredited with P-ATT, so no decision is emitted and the engine applies the attestation
    // or leaves them unproven.
    if (requirementId === 'op.acc.6.r1.1' || requirementId === 'op.acc.6.r2.1') {
      decisions.push(judgeZones(context, ZONE_CHECKS[requirementId]));
    } else if (requirementId === 'op.acc.6.r1.2') {
      decisions.push(judgePasswordQuality(context));
    }
  });

  return { decisions, runtimeVariables: [] };
};

export const opAcc6PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY_ID,
  controlId: CONTROL_ID,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.acc.6.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.acc.6.5',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-06'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.acc.6.6',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-06'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.acc.6.7',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-11'],
      evidenceIds: ['EV-12'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.acc.6.8',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-03', 'EV-04'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.9',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-02'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r1.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-10'],
      evidenceIds: ['EV-11'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-02'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r3.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r3.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r4.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r4.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r5.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-01'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r5.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r6.1',
      levels: ['ALTO'],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-09'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.acc.6.r7.1',
      levels: ['ALTO'],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-10'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.acc.6.r8.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-02'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.acc.6.r9.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.6.r9.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07', 'EV-08'],
      ruleType: 'WHITELIST',
    },
  ],
};
