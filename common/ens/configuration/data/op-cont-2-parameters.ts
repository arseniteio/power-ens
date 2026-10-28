import { ENSControlConfiguration } from '../types';

// op.cont.2 parameters. Governed by the Availability level and only at ALTO.
// A document control without a runbook: the policy judges these tables against the evaluation date
// (`context.now`) and accepts them as DOCUMENTARILY ACCREDITED, never as measured. Dates are `date` columns
// (YYYY-MM-DD) the validator understands.
// No P-ATT on purpose: an attestation does not expire, and a 2019 plan with a link would accredit today.
// `required` only on P-01 and P-08: without the plan and its review periodicity no requirement can be
// accredited; for the rest, the requirement's own decision names what is missing (cause CONFIGURATION).
export const opCont2Configuration: ENSControlConfiguration = {
  controlId: 'op.cont.2',
  controlName: 'Plan de continuidad',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.cont.2',
      name: 'plan_continuidad_referencia',
      label: 'Plan de continuidad aprobado',
      description:
        'Plan de continuidad aprobado: referencia, versión, fecha de aprobación, quién lo aprobó y su responsable. Si hay varias versiones cuenta la aprobada más recientemente.',
      levels: ['ALTO'],
      requirements: ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'],
      type: 'table',
      example: 'Plan de Continuidad del Servicio | v3.0 | 2026-01-15 | Comité de Seguridad | Responsable de Seguridad',
      columns: [
        {
          name: 'referencia',
          label: 'Referencia del plan',
          type: 'string',
          required: true,
        },
        {
          name: 'version',
          label: 'Versión',
          type: 'string',
          required: true,
        },
        {
          name: 'fecha_de_aprobacion',
          label: 'Fecha de aprobación',
          type: 'date',
          required: true,
        },
        {
          name: 'aprobado_por',
          label: 'Aprobado por',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Responsable del plan',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Ninguno: op.cont.2 no tiene recolector ni reglas. El plan se audita leyéndolo; Power ENS solo vigila su existencia y vigencia.',
      powerEnsUsage:
        'EV-01: el plan aprobado más recientemente no puede superar la periodicidad de revisión de P-08 en la fecha de evaluación. Un plan vencido deja sin acreditar los cinco requisitos.',
      evidenceIds: ['EV-01'],
      ruleIds: [],
      ifNotConfigured:
        'Ningún requisito se acredita (causa CONFIGURATION): sin plan registrado no hay nada que contrastar. Bloquea el control, que es obligatorio.',
    },
    {
      id: 'P-02',
      controlId: 'op.cont.2',
      name: 'servicios_esenciales',
      label: 'Servicios esenciales y objetivos de recuperación',
      description:
        'Servicios esenciales cuya prestación deben garantizar los medios alternativos, con los objetivos del análisis de impacto: RTO (tiempo máximo hasta restablecer el servicio) y RPO (pérdida máxima de datos), como número y unidad: 30 min, 4 h, 2 d.',
      levels: ['ALTO'],
      requirements: ['op.cont.2.2'],
      type: 'table',
      example: 'sede electrónica | 4 h | 1 h | srv-web, srv-bd',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio esencial',
          type: 'string',
          required: true,
        },
        {
          name: 'rto',
          label: 'RTO',
          type: 'string',
          required: true,
        },
        {
          name: 'rpo',
          label: 'RPO',
          type: 'string',
          required: true,
        },
        {
          name: 'sistemas_que_lo_soportan',
          label: 'Sistemas que lo soportan',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Ninguno en esta versión: las interrupciones reales (EV-02) y la disponibilidad frente al RTO (EV-07) no se miden todavía, y el informe lo indica.',
      powerEnsUsage:
        'op.cont.2.2: con el plan vigente, cada servicio esencial declara RTO y RPO con una duración legible. Una fila sin ellos, o con un valor que no es una duración, deja el requisito sin acreditar y se nombra.',
      evidenceIds: ['EV-02', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'op.cont.2.2 queda sin acreditar (causa CONFIGURATION): no constan los servicios esenciales ni sus objetivos de recuperación.',
    },
    {
      id: 'P-03',
      controlId: 'op.cont.2',
      name: 'funciones_responsabilidades_plan',
      label: 'Funciones y responsabilidades del plan',
      description:
        'Funciones del plan con su responsable, su suplente y las actividades a realizar (op.cont.2.1). Responsable y suplente se escriben como en P-05; se comparan sin distinguir mayúsculas ni tildes.',
      levels: ['ALTO'],
      requirements: ['op.cont.2.1', 'op.cont.2.4'],
      type: 'table',
      example: 'coordinador de crisis | A. Martínez | J. Ruiz | activar el plan y convocar al comité de crisis',
      columns: [
        {
          name: 'funcion',
          label: 'Función',
          type: 'string',
          required: true,
        },
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: true,
        },
        {
          name: 'suplente',
          label: 'Suplente',
          type: 'string',
          required: false,
        },
        {
          name: 'actividades',
          label: 'Actividades',
          type: 'string',
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Ninguno: sin directorio corporativo integrado, la situación real de cada persona (EV-05) no se contrasta y queda como dato del informe.',
      powerEnsUsage:
        'op.cont.2.1: con el plan vigente, cada función con su responsable y actividades. op.cont.2.4: cada responsable y suplente de P-03 debe tener formación vigente en P-05.',
      evidenceIds: ['EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'op.cont.2.1 y op.cont.2.4 quedan sin acreditar (causa CONFIGURATION): no constan las funciones ni quién debe estar formado.',
    },
    {
      id: 'P-04',
      controlId: 'op.cont.2',
      name: 'medios_alternativos_contratados',
      label: 'Medios alternativos y sus contratos',
      description:
        'Medios alternativos del plan, cada uno con proveedor, referencia del acuerdo o contrato, fecha de fin de vigencia y tiempo de activación comprometido. op.cont.2.3 exige que TODOS estén materializados en un contrato; un medio sin contrato se declara con la columna del contrato vacía.',
      levels: ['ALTO'],
      requirements: ['op.cont.2.3'],
      type: 'table',
      example: 'CPD alternativo | Proveedor X | CT-2025-014 | 2027-06-30 | 48 h',
      columns: [
        {
          name: 'medio',
          label: 'Medio alternativo',
          type: 'string',
          required: true,
        },
        {
          name: 'proveedor',
          label: 'Proveedor',
          type: 'string',
          required: false,
        },
        {
          name: 'contrato',
          label: 'Acuerdo o contrato',
          type: 'string',
          required: false,
        },
        {
          name: 'vigencia',
          label: 'En vigor hasta',
          type: 'date',
          required: false,
        },
        {
          name: 'tiempo_de_activacion',
          label: 'Tiempo de activación',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Ninguno: la entrada en servicio de los medios alternativos (EV-08) no se distingue de forma genérica del arranque de una máquina y queda como dato del informe.',
      powerEnsUsage:
        'EV-04 (op.cont.2.3): cada medio con contrato y en vigor en la fecha de evaluación. Sin contrato o con contrato vencido incumple; con contrato y sin fecha de vigencia queda sin acreditar.',
      evidenceIds: ['EV-04', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'op.cont.2.3 queda sin acreditar (causa CONFIGURATION): no constan los medios alternativos ni su contrato.',
    },
    {
      id: 'P-05',
      controlId: 'op.cont.2',
      name: 'formacion_personal_plan',
      label: 'Formación del personal del plan',
      description:
        'Formación específica de las personas con función en el plan (P-03): persona, formación, fecha de recepción y fecha hasta la que es vigente (op.cont.2.4). Enlaza con mp.per.4: conviene un único registro.',
      levels: ['ALTO'],
      requirements: ['op.cont.2.4'],
      type: 'table',
      example: 'A. Martínez | rol de coordinación de crisis | 2026-02-10 | 2027-02-10',
      columns: [
        {
          name: 'persona',
          label: 'Persona',
          type: 'string',
          required: true,
        },
        {
          name: 'formacion',
          label: 'Formación',
          type: 'string',
          required: true,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'date',
          required: false,
        },
        {
          name: 'vigencia',
          label: 'Vigente hasta',
          type: 'date',
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Ninguno: es un registro de la organización que se declara en la pantalla.',
      powerEnsUsage:
        'EV-06 (op.cont.2.4): cada responsable y suplente de P-03 debe tener aquí una fila con formación vigente en la fecha de evaluación. Sin fila o con la formación vencida incumple.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'op.cont.2.4 queda sin acreditar (causa CONFIGURATION). Hallazgo frecuente: el plan existe pero nadie ha sido formado.',
    },
    {
      id: 'P-06',
      controlId: 'op.cont.2',
      name: 'integracion_planes_organizacion',
      label: 'Planes de la organización con los que se integra',
      description:
        'Planes de continuidad de la organización, ajenos a la seguridad, con los que el plan del sistema forma parte integral y armónica (op.cont.2.5). Uno por línea.',
      levels: ['ALTO'],
      requirements: ['op.cont.2.5'],
      type: 'list',
      example: 'Plan de Emergencia del edificio, Plan de Continuidad de Negocio corporativo',
      required: false,
      wazuhUsage:
        'Ninguno: referencia documental que Power ENS recoge en el informe.',
      powerEnsUsage:
        'op.cont.2.5: con el plan vigente, al menos un plan de la organización con el que se integra. Que la integración sea armónica es revisión documental con criterio humano.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'op.cont.2.5 queda sin acreditar (causa CONFIGURATION): no consta con qué otros planes se integra.',
    },
    {
      id: 'P-07',
      controlId: 'op.cont.2',
      name: 'rutas_integridad_post_caida',
      label: 'Componentes que se comprueban tras una caída (R2)',
      description:
        'Componentes cuya integridad debe comprobarse tras una caída del sistema: ficheros del sistema operativo, firmware y ficheros de configuración. Corresponde al refuerzo R2, que el ENS no exige en ningún nivel.',
      levels: ['ALTO'],
      requirements: ['op.cont.2.r2.1'],
      type: 'list',
      example: '/boot, /etc, /sbin, versión de BIOS/UEFI',
      required: false,
      wazuhUsage:
        'FIM con scan_on_start y verificación de hash compara al arrancar el agente el estado con la línea base. Lo mide op.exp.6 (EV-06).',
      powerEnsUsage:
        'Solo informe: R2 no se exige y la integridad tras el arranque ya la juzga op.exp.6.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'Sin consecuencia en el cumplimiento. El informe no indica qué componentes se comprueban tras una caída.',
    },
    {
      id: 'P-08',
      controlId: 'op.cont.2',
      name: 'periodicidad_revision_plan_meses',
      label: 'Periodicidad de revisión del plan (meses)',
      description:
        'Cada cuántos meses se revisa y aprueba de nuevo el plan de continuidad. El ENS no fija la periodicidad en op.cont.2, pero un plan desactualizado no cumple su función: son habituales 12 (anual) o 24 (bienal).',
      levels: ['ALTO'],
      requirements: ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'],
      type: 'number',
      minValue: 1,
      example: '12',
      required: true,
      wazuhUsage:
        'Ninguno: op.cont.2 no tiene recolector ni reglas.',
      powerEnsUsage:
        'EV-01: un plan cuya última aprobación (P-01) tiene más de P-08 meses en la fecha de evaluación está vencido, y con él los cinco requisitos.',
      evidenceIds: ['EV-01'],
      ruleIds: [],
      ifNotConfigured:
        'Ningún requisito se acredita (causa CONFIGURATION): no hay contra qué medir la vigencia del plan. Bloquea el control, que es obligatorio.',
    },
  ],
};
