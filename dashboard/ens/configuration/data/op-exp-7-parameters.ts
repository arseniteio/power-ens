import { ENSControlConfiguration } from '../types';

// op.exp.7 · la política con la que se juzga la gestión de incidentes. Los
// hechos los emite el recolector del MANAGER (alertas, registro de incidentes,
// respuesta activa, sellos de los registros, listas de amenazas) sin juzgar; el
// veredicto sale de contrastarlos con estas tablas.
//
// La ficha tipaba cinco parámetros con etiquetas compuestas que no se pueden
// juzgar («Selección + acceso», «Selección + datos», «Criterios + sistemas»,
// una «Lista» de dos columnas, «Selección + responsable»). Aquí son tablas con
// sus columnas declaradas. P-03 ya no admite acceso: una credencial en la
// pantalla la puede leer y exportar cualquiera que la abra, y el recolector no
// la necesita porque lee el registro en el propio manager.
//
// P-12 no está en la ficha: es la decisión, escrita y visible, de qué reglas no
// se concilian con incidentes (ver su descripción).
const SEVERIDADES = ['Crítica', 'Alta', 'Media', 'Baja'];

export const opExp7Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.7',
  controlName: 'Gestión de incidentes',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.7',
      name: 'criterios_clasificacion_incidentes',
      label: 'Criterios de clasificación de incidentes',
      description:
        'Criterios que determinan la categoría y severidad de un incidente, exigidos expresamente por op.exp.7.1. Conviene alinearlos con la taxonomía del CCN-CERT para que la notificación de R1 sea directa. Cada fila dice, además, desde qué nivel de regla de Wazuh una alerta tiene esa severidad (una alerta toma la severidad más alta cuyo nivel mínimo alcanza) y si los incidentes de esa severidad se notifican al CCN-CERT. Las alertas de severidad Alta o Crítica son las que se exigen convertidas en incidente registrado.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.7.1', 'op.exp.7.r1.1'],
      type: 'table',
      example: 'código dañino | Alta | 12 | si | afecta a servidor de producción',
      columns: [
        {
          name: 'categoria',
          label: 'Categoría',
          type: 'string',
          required: true,
        },
        {
          name: 'severidad',
          label: 'Severidad',
          type: 'select',
          options: SEVERIDADES,
          required: true,
        },
        {
          name: 'nivel_minimo',
          label: 'Nivel mínimo de alerta Wazuh',
          type: 'number',
          required: true,
        },
        {
          name: 'notificable_ccn_cert',
          label: 'Se notifica al CCN-CERT',
          type: 'select',
          options: ['si', 'no'],
          required: false,
        },
        {
          name: 'criterio',
          label: 'Criterio',
          type: 'string',
          required: false,
        },
      ],
      minValue: 0,
      maxValue: 16,
      required: true,
      wazuhUsage:
        'Clasifica las alertas de Wazuh por severidad ENS a partir de su nivel de regla y decide cuáles tienen que acabar en incidente registrado.',
      ensfacilUsage:
        'El motor da a cada alerta la severidad de la fila de nivel mínimo más alto que alcanza y exige incidente registrado para las de severidad Alta o Crítica. La columna «criterio» es referencia documental para el auditor: no se compara.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.7.1 NO EVALUABLE: sin niveles no hay alerta relevante que conciliar, y las alertas llegan sin categoría ENS.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.7',
      name: 'matriz_escalado',
      label: 'Matriz de escalado',
      description:
        'A quién se escala cada severidad de incidente, en qué plazo (horas desde la alerta) y por qué canal. op.exp.7.1 exige detallar «el escalado de la notificación». El destinatario se compara con la columna escalado_a del registro de incidentes: varios destinatarios se separan con «+» o con comas, y tienen que figurar todos.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.7.1', 'op.exp.7.r2.3'],
      type: 'table',
      example: 'Crítica | RSI + CISO | 1 | teléfono + correo',
      columns: [
        {
          name: 'severidad',
          label: 'Severidad',
          type: 'select',
          options: SEVERIDADES,
          required: true,
        },
        {
          name: 'destinatario',
          label: 'Destinatario',
          type: 'string',
          required: true,
        },
        {
          name: 'plazo_horas',
          label: 'Plazo (horas)',
          type: 'number',
          required: true,
        },
        {
          name: 'canal',
          label: 'Canal',
          type: 'string',
          required: false,
        },
      ],
      minValue: 0,
      required: true,
      wazuhUsage:
        'Da el plazo en el que una alerta relevante tiene que estar ya convertida en incidente y el destinatario al que se tiene que haber escalado.',
      ensfacilUsage:
        'Una alerta Alta o Crítica sin incidente de su sistema abierto a menos de «plazo» horas de ella es una alerta huérfana (EV-02). Un incidente cuyo escalado no nombra al destinatario de su severidad, o lo hace más tarde que el plazo, incumple EV-04.',
      evidenceIds: ['EV-02', 'EV-04', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar el escalado ni saber cuándo una alerta queda huérfana. op.exp.7.1 y op.exp.7.r2.3 quedan sin acreditación automática.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.7',
      name: 'sistema_gestion_incidentes',
      label: 'Sistema de gestión de incidentes',
      description:
        'Herramienta donde se registran y gestionan los incidentes con su ciclo de vida completo, dónde se consulta y quién la mantiene. Sin credenciales: ENSFácil no se conecta a ella. Lo que ENSFácil lee es el registro de incidentes del manager (/etc/ensfacil/incident-register.tsv), que la organización mantiene aunque use otra herramienta, con una fila por fase de cada incidente y la referencia al expediente.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.7.1'],
      type: 'table',
      example: 'Registro ENSFácil del manager | /etc/ensfacil/incident-register.tsv | Responsable de Seguridad',
      columns: [
        {
          name: 'herramienta',
          label: 'Herramienta',
          type: 'string',
          required: true,
        },
        {
          name: 'ubicacion',
          label: 'Dónde se consulta',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Documenta dónde vive el ciclo de vida de los incidentes. No lleva acceso: ninguna credencial se guarda en la pantalla de Configuración.',
      ensfacilUsage:
        'Se muestra al auditor junto a la conciliación de EV-02. No se compara: el hecho que se juzga es el registro de incidentes del manager.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'El auditor no sabe dónde está el expediente completo de cada incidente; la conciliación se sigue haciendo con el registro del manager.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.7',
      name: 'responsables_informacion_servicios',
      label: 'Responsables de la información y de los servicios',
      description:
        'Responsables de la información y de los servicios a quienes hay que informar del incidente y de las actuaciones de resolución, según op.exp.7.r2.3. Una fila por sistema (el nombre del agente en Wazuh), o «*» para todos. Los nombres se buscan en la columna notificado_a del registro de incidentes.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r2.3'],
      type: 'table',
      example: 'srv-web-01 | J. Ruiz | M. Sanz',
      columns: [
        {
          name: 'sistema',
          label: 'Sistema',
          type: 'identifier',
          required: true,
        },
        {
          name: 'responsable_informacion',
          label: 'Responsable de la información',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable_servicio',
          label: 'Responsable del servicio',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Asocia cada sistema del alcance a quien hay que informar cuando un incidente lo afecta.',
      ensfacilUsage:
        'Para cada incidente, el motor reúne los responsables de todos sus sistemas y exige que figuren en alguna fila de notificado_a del registro.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.7.r2.3 NO EVALUABLE. No se puede verificar que se informó a los responsables correctos.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.7',
      name: 'plazos_respuesta_por_severidad',
      label: 'Plazos de respuesta por severidad',
      description:
        'Tiempos máximos de contención y de resolución, en horas, comprometidos para cada severidad. El ENS no los fija, pero exige asignación de recursos para resolver (op.exp.7.r2.2), lo que solo es medible con plazos. La contención se mide hasta la fase «intermedio» del registro de incidentes y la resolución hasta la fase «final», las dos desde la fase «inicial».',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r2.2'],
      type: 'table',
      example: 'Crítica | 1 | 24',
      columns: [
        {
          name: 'severidad',
          label: 'Severidad',
          type: 'select',
          options: SEVERIDADES,
          required: true,
        },
        {
          name: 'contencion_horas',
          label: 'Contención (horas)',
          type: 'number',
          required: false,
        },
        {
          name: 'resolucion_horas',
          label: 'Resolución (horas)',
          type: 'number',
          required: false,
        },
      ],
      minValue: 0,
      required: true,
      wazuhUsage:
        'Da los plazos contra los que se miden los tiempos de contención y de resolución de cada incidente.',
      ensfacilUsage:
        'El motor calcula, por severidad, el tiempo medio de contención y de resolución de los incidentes de la ventana (los abiertos cuentan con lo que llevan) y los compara con esta tabla. Informa además del tiempo medio de detección (de la primera alerta relevante al registro).',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede valorar si la respuesta fue diligente. op.exp.7.r2.2 NO EVALUABLE.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.7',
      name: 'ventanilla_unica_ccn_cert',
      label: 'Ventanilla única de notificación al CCN-CERT',
      description:
        'Solución de notificación de incidentes al CCN-CERT y dependencia administrativa jerárquica a través de la cual se federan las notificaciones. R1 es obligatorio desde categoría MEDIA.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r1.1'],
      type: 'table',
      example: 'LUCIA | Subdirección General de Sistemas de Información',
      columns: [
        {
          name: 'plataforma',
          label: 'Plataforma',
          type: 'string',
          required: true,
        },
        {
          name: 'organismo_superior',
          label: 'Organismo superior',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Declara por dónde se notifica al CCN-CERT. La notificación de cada incidente consta en el registro (columna notificacion_ccn_cert).',
      ensfacilUsage:
        'Sin plataforma declarada, R1 no se puede acreditar. Con ella, cada incidente de una severidad que P-01 marca como notificable tiene que tener fecha de notificación al CCN-CERT dentro del plazo de P-02.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE y es obligatorio desde categoría MEDIA. La notificación al CCN-CERT queda sin acreditar.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.7',
      name: 'criterios_incidente_datos_personales',
      label: 'Sistemas con datos personales',
      description:
        'Sistemas que tratan datos personales (el nombre del agente en Wazuh, o «*» para todos) y qué tratamientos. Un incidente que afecta a uno de ellos activa el régimen del RGPD y de la LO 3/2018: tiene que constar su valoración (datos_personales si/no en el registro) y, si afecta a datos personales, la notificación a la AEPD en 72 horas (AEPD en notificado_a). El criterio de brecha es una decisión jurídica: se acredita con su documento en P-ATT, no aquí.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.7.2'],
      type: 'table',
      example: 'ldap-01 | directorio de usuarios: nombre, correo, teléfono',
      columns: [
        {
          name: 'sistema',
          label: 'Sistema',
          type: 'identifier',
          required: true,
        },
        {
          name: 'tratamientos',
          label: 'Tratamientos',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Marca los sistemas cuyos incidentes arrastran las obligaciones del RGPD.',
      ensfacilUsage:
        'El motor marca los incidentes que afectan a estos sistemas y exige valoración de brecha y, si procede, notificación a la AEPD dentro de 72 horas desde la fase inicial.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.7.2 NO EVALUABLE. Riesgo doble: incumplimiento del ENS y de la normativa de protección de datos.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.7',
      name: 'evidencias_a_preservar',
      label: 'Evidencias a preservar',
      description:
        'Qué evidencias deben recogerse y protegerse ante un incidente, y dónde se custodian. op.exp.7.r2.1 exige expresamente «la recogida de evidencias y protección de los registros». Enlaza con op.exp.9.2. ENSFácil verifica técnicamente los registros de alertas del SIEM (conservados y con su sello íntegro); un volcado de memoria o una imagen de disco no dejan huella que observar.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r2.1'],
      type: 'table',
      example: 'registros de alertas del SIEM | manager, rotado diario con sello SHA-256',
      columns: [
        {
          name: 'tipo_evidencia',
          label: 'Tipo de evidencia',
          type: 'string',
          required: true,
        },
        {
          name: 'destino',
          label: 'Destino de custodia',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Declara qué se preserva. De lo declarado, los registros de alertas del manager se comprueban día a día contra su sello.',
      ensfacilUsage:
        'Para cada día que abarca un incidente, el motor exige que el registro de alertas se conserve y que su SHA-256 actual coincida con el que selló Wazuh al rotarlo, con la cadena de sellos intacta. Lo demás que declare esta tabla se muestra al auditor sin verificación técnica.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.7.r2.1 NO EVALUABLE en su parte de evidencias. Riesgo de perder evidencia utilizable en sede jurisdiccional.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.7',
      name: 'acciones_respuesta_automatica',
      label: 'Acciones de respuesta automática',
      description:
        'Acciones de contención automática autorizadas y su alcance: aislamiento de equipo, bloqueo de IP, detención de servicio, bloqueo de cuenta. La columna «acción» es el nombre del comando de respuesta activa de Wazuh (firewall-drop, disable-account…), que es lo que se compara. Da soporte a op.exp.7.r2.1 y a la reconfiguración dinámica de R3.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r2.1', 'op.exp.7.r3.1'],
      type: 'table',
      example: 'firewall-drop | fuerza bruta SSH (regla 5763) | origen del ataque | automática a los 180 s',
      columns: [
        {
          name: 'accion',
          label: 'Acción (comando de respuesta activa)',
          type: 'identifier',
          required: true,
        },
        {
          name: 'condicion',
          label: 'Condición',
          type: 'string',
          required: false,
        },
        {
          name: 'alcance',
          label: 'Alcance',
          type: 'string',
          required: false,
        },
        {
          name: 'reversion',
          label: 'Reversión',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Configura Active Response de Wazuh. Cada acción debe tener condición de disparo, alcance limitado y mecanismo de reversión. Una respuesta automática mal calibrada causa más indisponibilidad que el incidente.',
      ensfacilUsage:
        'Una ejecución de respuesta activa con un comando de esta tabla en un sistema afectado, durante el incidente, cuenta como medida de contención (EV-06). Las ejecuciones de comandos que no figuran aquí se muestran aparte y no cuentan.',
      evidenceIds: ['EV-06', 'EV-09', 'EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'No hay contención automática declarada: solo cuenta la contención registrada a mano (fase intermedio del registro).',
    },
    {
      id: 'P-10',
      controlId: 'op.exp.7',
      name: 'elementos_reconfiguracion_dinamica',
      label: 'Elementos de reconfiguración dinámica',
      description:
        'Elementos del sistema sobre los que puede aplicarse reconfiguración dinámica —cortafuegos, enrutadores, listas de control de acceso, IDS/IPS, puertas de enlace— y quién está autorizado a modificarlos en respuesta a incidente. R3 es obligatorio en categoría ALTA. El elemento es el nombre de su agente en Wazuh: sin agente, sus cambios no se pueden observar.',
      levels: ['ALTO'],
      requirements: ['op.exp.7.r3.1'],
      type: 'table',
      example: 'fw-perimetral | reglas | vía Active Response + RSI',
      columns: [
        {
          name: 'elemento',
          label: 'Elemento (agente)',
          type: 'identifier',
          required: true,
        },
        {
          name: 'tipo_cambio',
          label: 'Tipo de cambio',
          type: 'string',
          required: false,
        },
        {
          name: 'autorizado',
          label: 'Autorizado',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Declara los elementos cuya reconfiguración ante un ataque tiene que poder demostrarse.',
      ensfacilUsage:
        'Una respuesta activa de un comando de P-09 ejecutada sobre uno de estos elementos es reconfiguración dinámica ejercitada. Un elemento sin agente en Wazuh no se puede observar y lo deja sin demostrar.',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'R3 NO EVALUABLE y es obligatorio en categoría ALTA. Sin capacidad de reconfiguración los daños no se acotan.',
    },
    {
      id: 'P-11',
      controlId: 'op.exp.7',
      name: 'canal_avisos_ccn_cert',
      label: 'Canal de avisos del CCN-CERT',
      description:
        'Vía por la que se reciben y procesan los avisos del CCN-CERT sobre ciberamenazas sofisticadas y campañas de ataques (op.exp.7.r3.2), quién los procesa, la lista CDB del manager en la que se cargan sus indicadores (su ruta relativa a /var/ossec, como en el ossec.conf) y cada cuántos días, como máximo, se incorpora lo recibido.',
      levels: ['ALTO'],
      requirements: ['op.exp.7.r3.2'],
      type: 'table',
      example: 'boletines CCN-CERT por correo | RSI | etc/lists/malicious-ioc/malicious-ip | 7',
      columns: [
        {
          name: 'canal',
          label: 'Canal',
          type: 'string',
          required: true,
        },
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: false,
        },
        {
          name: 'lista_cdb',
          label: 'Lista CDB de indicadores',
          type: 'string',
          required: true,
        },
        {
          name: 'plazo_dias',
          label: 'Plazo de incorporación (días)',
          type: 'number',
          required: true,
        },
      ],
      minValue: 0,
      required: true,
      wazuhUsage:
        'Los IoC de los avisos se cargan como listas CDB en Wazuh para detección directa.',
      ensfacilUsage:
        'El motor exige que cada lista declarada exista, esté cargada en el ossec.conf, la use al menos una regla y no lleve más de «plazo» días sin actualizarse. La recepción de cada aviso concreto no la ve: es un canal externo.',
      evidenceIds: ['EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'R3 parcialmente NO EVALUABLE. Los avisos del CCN-CERT no se traducen en capacidad de detección demostrable.',
    },
    {
      id: 'P-12',
      controlId: 'op.exp.7',
      name: 'alertas_excluidas_conciliacion',
      label: 'Reglas que no se concilian con incidentes',
      description:
        'Reglas de Wazuh cuyas alertas, aun siendo de severidad Alta o Crítica, no se exige convertir en incidente, con el motivo. El caso previsto son las del Vulnerability Detector (23504, 23505, 23506): una CVE abierta es una debilidad que gestiona op.exp.4 con sus propios plazos, y convertir cada una en incidente produciría cientos de expedientes al mes. Vacío: no se excluye nada. Lo excluido se cuenta y se muestra en cada veredicto.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.7.1'],
      type: 'table',
      example: '23506 | CVE crítica del Vulnerability Detector: se gestiona en op.exp.4',
      columns: [
        {
          name: 'regla',
          label: 'Regla',
          type: 'identifier',
          required: true,
        },
        {
          name: 'motivo',
          label: 'Motivo',
          type: 'string',
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Declara, con su motivo, qué detecciones se gestionan por otro proceso y no por el de incidentes.',
      ensfacilUsage:
        'Las alertas de estas reglas no cuentan como alertas huérfanas en EV-02. El motivo y el número de alertas excluidas aparecen en el veredicto: la exclusión nunca es silenciosa.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'Toda alerta Alta o Crítica, también las de vulnerabilidades, tiene que acabar en incidente registrado.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.7',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el procedimiento de gestión de incidentes y los requisitos que ninguna telemetría puede demostrar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.7.1 | Procedimiento de gestión de incidentes | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        {
          name: 'requisito',
          label: 'Requisito',
          type: 'string',
          required: true,
        },
        {
          name: 'referencia',
          label: 'Referencia',
          type: 'string',
          required: false,
        },
        {
          name: 'enlace',
          label: 'Enlace',
          type: 'string',
          required: false,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      ensfacilUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
};
