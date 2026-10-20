/** Inputs of the art. 32 data set: results, manager rows with the report variables, maturity and declared entries. */
import { defaultENSConfigurationTemplate } from '../../common/ens/configuration/data/default-configuration';
import type { ENSComplianceResult } from '../../common/ens/core/evaluation/types';
import type { ENSControlMaturity, ENSMaturityRecords } from '../../common/ens/maturity/types';

const clone = (value: any) => JSON.parse(JSON.stringify(value));

export const result = (id: string, status: string, score?: number, extra: Partial<ENSComplianceResult> = {}): ENSComplianceResult =>
  ({
    control: { id, name: id, family: '', category: '', description: '' },
    level: 'MEDIO',
    status,
    ...(score !== undefined ? { score } : {}),
    coverage: score === undefined ? 0 : 90,
    applicableRequirements: 4,
    measuredRequirements: 3,
    unmeasuredRequirements: [],
    evaluatedAt: '2026-10-20T10:00:00.000Z',
    requirements: [],
    parameters: [],
    evidences: [],
    missingParameters: [],
    missingEvidences: [],
    relatedRules: [],
    nonConformities: [],
    observations: [],
    traceability: [],
    ...extra,
  } as unknown as ENSComplianceResult);

const variable = (name: string, value: unknown) => ({ name, value, parameterIds: [], evidenceIds: [], eventIds: [], description: name });

export const INCIDENTS = {
  leido: '2026-10-20T09:00:00Z',
  descartadas: 0,
  incidentes: [
    { id: 'INC-0', severidad: 'alta', clasificacion: 'phishing', apertura: '2026-03-15T09:00:00Z', primera: '2026-03-15T09:00:00Z', aepd: false, datosPersonales: 'no' },
    {
      id: 'INC-1',
      severidad: 'alta',
      clasificacion: 'acceso no autorizado',
      apertura: '2026-05-10T08:00:00Z',
      primera: '2026-05-10T08:00:00Z',
      ocurrencia: '2026-05-10T04:00:00Z',
      contencion: '2026-05-10T10:00:00Z',
      cierre: '2026-05-11T10:00:00Z',
      ccnCert: '2026-05-10T09:00:00Z',
      aepd: true,
      datosPersonales: 'si',
    },
    { id: 'INC-2', severidad: 'media', clasificacion: 'código dañino', apertura: '2026-10-05T10:00:00Z', primera: '2026-10-05T10:00:00Z', contencion: '2026-10-05T11:00:00Z', aepd: false, datosPersonales: 'no' },
    { id: 'INC-3', severidad: 'baja', apertura: '2026-10-10T10:00:00Z', primera: '2026-10-10T10:00:00Z', aepd: false, datosPersonales: '-' },
  ],
};

export const CYCLES = {
  leido: '2026-10-20T09:00:00Z',
  ciclos: [
    { periodo: '2025-T4', fecha: '2026-01-10T09:00:00Z', implantacion: 70, horasInternas: 90, horasExternas: 10, presupuesto: 3000, validadoPor: 'RSEG', linea: '2' },
    { periodo: '2026-T1', fecha: '2026-04-05T09:00:00Z', implantacion: 78, horasInternas: 100, horasExternas: 20, presupuesto: 5000, validadoPor: 'RSEG', linea: '3' },
    { periodo: '2026-T2', fecha: '2026-07-06T09:00:00Z', implantacion: 82.4, horasInternas: 110, horasExternas: 30, presupuesto: 7000, validadoPor: 'RSEG', linea: '4' },
  ],
};

export const RECONCILIATION = { desde: '2026-09-20T12:00:00Z', hasta: '2026-10-20T12:00:00Z', ventanaDias: 30, relevantes: 10, enIncidente: 6, pendientes: 1, sinIncidente: 2, sinPlazo: 1, excluidas: 3 };
export const DETECTION = { desde: '2026-09-20T12:00:00Z', hasta: '2026-10-20T12:00:00Z', incidentes: [{ id: 'INC-2', apertura: '2026-10-05T10:00:00Z', deteccion: '2026-10-05T08:00:00Z' }] };

const P01 = ['org.1 | sí', 'op.acc.1 | sí | MEDIO', 'mp.if.6 | sí', 'op.ext.3 | no', 'mp.eq.2 | sí'];

export const opMon2Row = (closing = '03-31', overrides: Record<string, unknown> = {}) =>
  result('op.mon.2', 'CUMPLE', 100, {
    parameters: [
      { id: 'P-01', value: P01 },
      { id: 'P-02', value: [`trimestral | 15 | ${closing}`] },
    ] as any,
    policyRuntime: {
      runtimeVariables: [
        variable('informe_art32_incidentes', JSON.stringify(overrides.incidents ?? INCIDENTS)),
        variable('informe_art32_ciclos', JSON.stringify(overrides.cycles ?? CYCLES)),
        variable('cobertura_monitorizacion', 92.5),
      ],
    } as any,
  });

export const opExp7Row = () =>
  result('op.exp.7', 'CUMPLE', 100, {
    policyRuntime: {
      runtimeVariables: [variable('informe_art32_conciliacion', JSON.stringify(RECONCILIATION)), variable('informe_art32_deteccion', JSON.stringify(DETECTION))],
    } as any,
  });

// The organisation view consolidates every variable as «agente=valor» (JSON).
export const consolidated = (row: ENSComplianceResult): ENSComplianceResult => ({
  ...row,
  policyRuntime: {
    ...(row.policyRuntime as any),
    runtimeVariables: (row.policyRuntime?.runtimeVariables || []).map(entry => ({
      ...entry,
      value: [`000 · wazuh-manager=${JSON.stringify(entry.value)}`],
      description: `${entry.description} Valores consolidados por agente.`,
    })),
  },
});

export const configuration = (global: Record<string, unknown> = {}) => {
  const value = clone(defaultENSConfigurationTemplate);
  Object.assign(value.global, {
    clientName: 'Ayuntamiento de Ejemplo',
    organization: 'Servicio de Informática',
    scope: 'Sede electrónica y gestión de expedientes',
    ensLevel: 'MEDIO',
    confidentialityLevel: 'BAJO',
    availabilityLevel: 'BAJO',
    timezone: 'Europe/Madrid',
    ...global,
  });
  return value;
};

export const opAcc1Maturity: ENSControlMaturity = {
  controlId: 'op.acc.1',
  measured: true,
  applicable: true,
  accredited: 2,
  assessed: { level: 3, reviewer: 'Luis Pérez', date: '2026-09-30', justification: 'Revisión trimestral con evidencias', recordedAt: '2026-09-30T10:00:00Z', recordedBy: 'rsis' },
  target: 3,
  targetSource: 'CATEGORY',
  applicableLevel: 'MEDIO',
  aboveAccredited: true,
  accreditedDropped: false,
  gates: [],
  attestation: {
    reference: 'PRO-ACC-01',
    version: '2.1',
    link: 'https://intranet.ejemplo/pro-acc-01.pdf',
    approvedAt: '2026-01-10',
    validUntil: '2027-01-10',
    disseminatedAt: '2026-01-15',
    disseminatedTo: 'Todo el personal',
    owner: 'RSEG',
    recordedAt: '2026-01-16T09:00:00Z',
    recordedBy: 'rsis',
  },
  attestations: 1,
  lastReview: undefined,
  reviews: 0,
  indicators: undefined,
  feedback: [],
  assessments: 1,
  evaluatedAt: '2026-10-20T10:00:00Z',
};

export const mpEq2Maturity: ENSControlMaturity = {
  ...opAcc1Maturity,
  controlId: 'mp.eq.2',
  measured: false,
  accredited: undefined,
  assessed: undefined,
  aboveAccredited: false,
  attestation: undefined,
  attestations: 0,
  assessments: 0,
};

const stamp = (recordedAt: string) => ({ recordedAt, recordedBy: 'rsis' });

export const records = (): ENSMaturityRecords => ({
  controls: {
    'org.1': {
      declarations: [
        { applies: true, level: 2, reference: 'POL-SEG-00 borrador', owner: 'RSEG', date: '2026-02-01', ...stamp('2026-02-01T09:00:00Z') },
        { applies: true, level: 3, target: 3, reference: 'POL-SEG-01 Política de seguridad', link: 'https://intranet.ejemplo/pol-seg-01.pdf', owner: 'RSEG', date: '2026-06-01', ...stamp('2026-06-01T09:00:00Z') },
      ],
    },
    'op.pl.1': {
      declarations: [{ applies: false, reference: 'AR-2026 Análisis de riesgos', owner: 'RSEG', date: '2026-05-01', justification: 'Sistema heredado en baja', ...stamp('2026-05-01T09:00:00Z') }],
    },
    'mp.eq.2': {
      declarations: [{ applies: true, level: 2, reference: 'GPO-BLOQUEO', owner: 'Jefe de Sistemas', date: '2026-07-01', ...stamp('2026-07-01T09:00:00Z') }],
    },
    'op.mon.2': {
      resources: [{ period: '2027', ictBudget: 100000, ictStaff: 20, securityStaff: 2, reference: 'Presupuesto 2026', owner: 'Intervención', ...stamp('2026-10-01T09:00:00Z') }],
    },
  },
});

export const results = () => [
  result('op.acc.1', 'PARCIAL', 80, { coverage: 85 } as any),
  result('op.cont.2', 'NO_APLICA'),
  result('op.exp.3', 'NO_EVALUABLE', 40, { missingParameters: ['P-02'] } as any),
  consolidated(opMon2Row()),
  consolidated(opExp7Row()),
];
