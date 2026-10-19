import { ENSControlConfiguration } from '../types';

export const mpEq2Configuration: ENSControlConfiguration = {
  controlId: 'mp.eq.2',
  controlName: 'Bloqueo de puesto de trabajo',
  family: 'Medidas de protección',
  enabled: true,
  applicableLevels: ['MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'mp.eq.2',
      name: 'timeout_bloqueo_minutos',
      label: 'Timeout bloqueo minutos',
      description:
        'Minutos de inactividad tras los cuales el puesto de trabajo debe bloquearse exigiendo nueva autenticación. El ENS habla de «tiempo prudencial» sin fijarlo: lo determina la normativa interna o la guía CCN-STIC.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.eq.2.1'],
      type: 'number',
      example: '10 o 15',
      required: true,
      wazuhUsage:
        'SCA verifica el valor configurado en la política de cada equipo y alerta si es superior a P-01 o si el bloqueo está deshabilitado. Es la comprobación central del control.',
      ensfacilUsage:
        'SCA verifica el valor configurado en la política de cada equipo y alerta si es superior a P-01 o si el bloqueo está deshabilitado. Es la comprobación central del control.',
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'mp.eq.2.1 NO EVALUABLE. No hay referencia contra la que comparar la política configurada.',
    },
    {
      id: 'P-02',
      controlId: 'mp.eq.2',
      name: 'timeout_cierre_sesion_minutos',
      label: 'Timeout cierre sesion minutos',
      description:
        'Minutos tras los cuales deben cancelarse las sesiones abiertas desde el puesto. R1 exige que este tiempo sea SUPERIOR al de bloqueo de P-01, de modo que la relación entre ambos valores es parte del requisito.',
      levels: ['ALTO'],
      requirements: ['mp.eq.2.r1.1'],
      type: 'number',
      example: '60 o 120 / (debe ser > P-01)',
      required: false,
      wazuhUsage:
        'SCA verifica los límites de sesión configurados.',
      ensfacilUsage:
        'ENSFácil valida además la coherencia: si P-02 ≤ P-01 la configuración es incorrecta por definición, porque el refuerzo exige un tiempo superior.',
      evidenceIds: ['EV-02', 'EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE y es obligatorio en nivel ALTO. Las sesiones pueden quedar abiertas indefinidamente.',
    },
    {
      id: 'P-03',
      controlId: 'mp.eq.2',
      name: 'equipos_en_alcance',
      label: 'Equipos en alcance',
      description:
        'Puestos de trabajo sujetos al control, con su sistema operativo y el método de aplicación de la política (GPO de dominio, política local, MDM).',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.eq.2.1'],
      type: 'table',
      example: 'estaciones Windows | GPO / portátiles | Intune',
      columns: [
        {
          name: 'equipo',
          label: 'Equipo',
          type: 'string',
          required: true,
        },
        {
          name: 'so',
          label: 'SO',
          type: 'string',
          required: false,
        },
        {
          name: 'metodo',
          label: 'Método',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Define el alcance de las comprobaciones SCA.',
      ensfacilUsage:
        'ENSFácil contrasta la lista con los equipos que efectivamente reportan y señala los que quedan sin verificar.',
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede determinar la cobertura del control ni detectar equipos exentos de la política.',
    },
    {
      id: 'P-04',
      controlId: 'mp.eq.2',
      name: 'excepciones_autorizadas',
      label: 'Excepciones autorizadas',
      description:
        'Equipos o perfiles con excepción autorizada al bloqueo por inactividad —puestos de control continuo, pantallas de monitorización, quioscos— con su justificación y las medidas compensatorias aplicadas.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.eq.2.1'],
      type: 'table',
      example: 'pantalla SOC | visualización / continua | sala con control de acceso',
      columns: [
        {
          name: 'equipo',
          label: 'Equipo',
          type: 'string',
          required: true,
        },
        {
          name: 'motivo',
          label: 'Motivo',
          type: 'string',
          required: false,
        },
        {
          name: 'compensacion',
          label: 'Compensación',
          type: 'string',
          required: false,
        },
        {
          name: 'aprobo',
          label: 'Aprobó',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil excluye estos equipos del cómputo de incumplimiento pero los mantiene visibles en el informe como riesgo aceptado con trazabilidad de quién lo autorizó.',
      ensfacilUsage:
        'ENSFácil excluye estos equipos del cómputo de incumplimiento pero los mantiene visibles en el informe como riesgo aceptado con trazabilidad de quién lo autorizó.',
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'Las excepciones legítimas se contabilizan como incumplimiento y distorsionan el semáforo.',
    },
    {
      id: 'P-05',
      controlId: 'mp.eq.2',
      name: 'vigilar_inhibidores_bloqueo',
      label: 'Vigilar inhibidores bloqueo',
      description:
        'Determina si debe vigilarse el uso de herramientas que inhiben el temporizador de inactividad (mouse jigglers por software, utilidades tipo «caffeine», scripts de pulsación simulada), que neutralizan el control sin modificar la política.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.eq.2.1'],
      type: 'table',
      example: 'sí – caffeine.exe, / mouse jiggler, nosleep',
      columns: [
        {
          name: 'aplica',
          label: 'Sí / no',
          type: 'select',
          options: ['sí', 'no'],
          required: true,
        },
        {
          name: 'procesos_conocidos',
          label: 'Procesos conocidos',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Syscollector detecta estos procesos y ejecutables instalados. Es un vector de incumplimiento silencioso: la política está bien, el usuario la elude y ningún check de configuración lo revela.',
      ensfacilUsage:
        'Syscollector detecta estos procesos y ejecutables instalados. Es un vector de incumplimiento silencioso: la política está bien, el usuario la elude y ningún check de configuración lo revela.',
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se detecta la elusión del control por software. La política puede estar correcta y no aplicarse en la práctica.',
    },
  ],
};
