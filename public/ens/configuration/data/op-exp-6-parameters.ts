import { ENSControlConfiguration } from '../types';

// op.exp.6 · la política que decide el control. El agente observa qué
// antimalware hay en cada plano de la máquina, sus firmas, sus ajustes, sus
// detecciones y la capa EDR, sin juzgar; el veredicto sale de contrastar esos
// hechos con lo que aquí se decide.
//
// La ficha tipaba mal tres parámetros: P-02 («Lista» de equipo, tipo y
// producto), P-04 («Lista de ajustes esperados» que en realidad son pares
// ajuste=valor) y P-09 («Selección de capacidades + alcance», que son tres ejes
// por capacidad). Con un tipo plano el motor habría comparado la fila entera
// contra un valor suelto y no habría casado nunca. Los tres son tablas con sus
// columnas declaradas aquí y en `config/op-exp-6-control-block.json`.
//
// P-07 y P-08 también se parten: P-07 mezclaba rutas Linux, «módulos kernel» y
// una ruta Windows en la misma lista (ahora es una fila por equipo y ruta, con
// `*` para todos), y P-08 mezclaba hash y ruta en una sola columna.
const PLANOS = ['sistema', 'correo'];
const SI_NO = ['si', 'no'];

export const opExp6Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.6',
  controlName: 'Protección frente a código dañino',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.6',
      name: 'producto_antimalware',
      label: 'Producto antimalware',
      description:
        'Solución de protección frente a código dañino desplegada, por tipo de equipo, con la ubicación de sus logs. Es la declaración de qué producto usa la organización; lo que se espera en CADA equipo, y contra lo que se juzga, es P-02. El nombre del producto se escribe como lo emite el agente (clamav, mdatp, falcon-sensor, sophos-spl, eset, sentinelone, trendmicro-ds).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.1', 'op.exp.6.2'],
      type: 'table',
      example: 'servidor | clamav | /var/log/clamav/clamav.log',
      columns: [
        {
          name: 'tipo_equipo',
          label: 'Tipo de equipo',
          type: 'select',
          options: ['puesto', 'servidor', 'perimetral'],
          required: true,
        },
        {
          name: 'producto',
          label: 'Producto',
          type: 'identifier',
          required: true,
        },
        {
          name: 'log',
          label: 'Log o integración',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Declara el producto y dónde registra su actividad. El agente de op.exp.6 lee los logs de ClamAV; de otros productos detecta si están instalados y en ejecución.',
      ensfacilUsage:
        'Documental: no se juzga por sí mismo. Lo que decide op.exp.6.2 es la fila de cada equipo en P-02.',
      evidenceIds: ['EV-01'],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto en el veredicto: la cobertura se juzga contra P-02. Queda sin declarar qué producto ha elegido la organización.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.6',
      name: 'cobertura_esperada_antimalware',
      label: 'Cobertura esperada de antimalware',
      description:
        'Una fila por equipo y plano con el antimalware que tiene que estar EN EJECUCIÓN. El plano «sistema» es el antimalware de la máquina; el plano «correo» es el del servicio de correo que la máquina presta (amavis y clamd de Zimbra, por ejemplo), y solo existe en los servidores que lo prestan. El equipo es el nombre corto del host (o el que fije OPEXP6_EQUIPO en su .env). op.exp.6.2 es taxativo: todos los equipos, sin excepción por tipo, así que un equipo sin fila no se da por bueno: queda sin juzgar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.2'],
      type: 'table',
      example: 'srv-web-01 | sistema | servidor | clamav',
      columns: [
        {
          name: 'equipo',
          label: 'Equipo',
          type: 'identifier',
          required: true,
        },
        {
          name: 'plano',
          label: 'Plano',
          type: 'select',
          options: PLANOS,
          required: true,
        },
        {
          name: 'tipo',
          label: 'Tipo de equipo',
          type: 'select',
          options: ['puesto', 'servidor', 'perimetral'],
          required: false,
        },
        {
          name: 'producto_esperado',
          label: 'Producto en ejecución',
          type: 'identifier',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'Equipo y plano cuyo antimalware en ejecución no es el declarado (o no hay ninguno) → incumplimiento de op.exp.6.2.',
      ensfacilUsage:
        'EV-01 busca la fila por equipo y plano y compara la columna «producto_esperado» con el producto que el agente ve EN EJECUCIÓN: instalado y parado no protege, y cuenta como «ninguno».',
      evidenceIds: ['EV-01'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.6.2 no se puede demostrar: se ve qué antimalware corre en cada equipo, pero no contra qué cobertura juzgarlo.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.6',
      name: 'max_antiguedad_firmas_horas',
      label: 'Antigüedad máxima de las firmas (horas)',
      description:
        'Antigüedad máxima admitida de las bases de datos de detección, contada desde que el fabricante las publicó. op.exp.6.4 exige que permanezcan «permanentemente actualizadas»; ClamAV publica firmas a diario, así que 24 o 48 horas es lo habitual.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.4'],
      type: 'duration_hours',
      example: '48',
      minValue: 1,
      required: true,
      wazuhUsage:
        'Firmas publicadas hace más de P-03 horas en algún plano con antimalware → incumplimiento de op.exp.6.4.',
      ensfacilUsage:
        'EV-02 mide contra el reloj la antigüedad de las firmas de CADA plano con antimalware en ejecución; manda el plano que peor está.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.6.4 no se puede demostrar: se ven las firmas, pero no qué antigüedad se tolera.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.6',
      name: 'config_proteccion_tiempo_real',
      label: 'Ajustes esperados del antimalware',
      description:
        'Una fila por plano y ajuste con el valor que tiene que tener. Ajustes que observa el agente: proteccion_tiempo_real (ClamAV: clamonacc en marcha; en el plano correo, amavis y clamd analizando el correo al recibirlo), actualizacion_automatica_firmas (freshclam en marcha), analisis_comprimidos (ScanArchive de clamd) y bloqueo_en_acceso (OnAccessPrevention de clamd). Los ajustes de Windows Defender de la ficha (TamperProtection…) no existen en ClamAV: se declaran solo si hay equipos con ese producto.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.5', 'op.exp.6.r5.2'],
      type: 'table',
      example: 'sistema | proteccion_tiempo_real | si',
      columns: [
        {
          name: 'plano',
          label: 'Plano',
          type: 'select',
          options: PLANOS,
          required: true,
        },
        {
          name: 'ajuste',
          label: 'Ajuste',
          type: 'identifier',
          required: true,
        },
        {
          name: 'valor_esperado',
          label: 'Valor esperado',
          type: 'select',
          options: SI_NO,
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'Ajuste observado distinto del declarado (por ejemplo, protección en tiempo real desactivada) → incumplimiento de op.exp.6.5.',
      ensfacilUsage:
        'EV-03 busca la fila por plano y ajuste y compara «valor_esperado» con el valor observado. Un ajuste observado sin fila queda sin juzgar.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.6.5 no se puede demostrar: se ven los ajustes, pero no cuáles se exigen.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.6',
      name: 'puntos_entrada_ficheros_externos',
      label: 'Vías de entrada de ficheros externos',
      description:
        'Vías por las que entran ficheros de fuentes externas y que deben analizarlos antes de trabajar con ellos, con el mecanismo que lo hace. El agente acredita la vía «correo» en un servidor que lo analiza (amavis) y la vía «dispositivos_extraibles» con las conexiones que registra el kernel; las demás vías se analizan en la pasarela o el proxy que las atiende, fuera de la máquina.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.3'],
      type: 'table',
      example: 'correo | amavis + clamd de Zimbra',
      columns: [
        {
          name: 'via',
          label: 'Vía',
          type: 'select',
          options: ['correo', 'dispositivos_extraibles', 'descargas_web', 'transferencias', 'carpetas_compartidas'],
          required: true,
        },
        {
          name: 'mecanismo_analisis',
          label: 'Mecanismo de análisis',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Vía declarada sin análisis observable en la máquina → op.exp.6.3 no demostrado.',
      ensfacilUsage:
        'EV-12 comprueba cada vía declarada con lo que la máquina observa: análisis del correo, dispositivos extraíbles contra P-10.',
      evidenceIds: ['EV-12'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.6.3 no se puede demostrar: no se sabe por qué vías entran ficheros externos.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.6',
      name: 'periodicidad_escaneo_completo_dias',
      label: 'Periodicidad del escaneo completo (días)',
      description:
        'Cada cuántos días debe completarse un escaneo de todo el sistema. R1 exige escaneo «regularmente» sin fijar periodicidad: la determina la organización. Se mide desde el FIN del último escaneo completo registrado.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.6.r1.1'],
      type: 'duration_days',
      example: '7',
      minValue: 1,
      required: false,
      wazuhUsage:
        'Último escaneo completo más viejo que P-06 días, o ninguno registrado → incumplimiento de R1.',
      ensfacilUsage:
        'EV-05 mide contra el reloj el instante de fin del escaneo completo más reciente.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'R1 no se puede demostrar: se ven los escaneos, pero no qué periodicidad se exige.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.6',
      name: 'funciones_criticas_arranque',
      label: 'Funciones críticas analizadas al arranque',
      description:
        'Rutas críticas que el agente tiene que analizar al arrancar (FIM con scan_on_start): binarios del sistema, cargador de arranque, módulos del kernel (/lib/modules), servicios de seguridad. Una fila por equipo y ruta; «*» en la columna equipo aplica la ruta a todos. Una ruta está cubierta si el agente vigila esa ruta o un directorio que la contiene.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.6.r2.1'],
      type: 'table',
      example: '* | /boot',
      columns: [
        {
          name: 'equipo',
          label: 'Equipo («*» = todos)',
          type: 'string',
          required: true,
        },
        {
          name: 'ruta',
          label: 'Ruta',
          type: 'path',
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Ruta crítica que el agente no analizó en su último arranque, o análisis del arranque sin terminar → incumplimiento de R2.',
      ensfacilUsage:
        'EV-06 contrasta las rutas de este equipo (las suyas y las de «*») con las que el agente vigilaba en su último arranque, y exige que el análisis de arranque terminara.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'R2 no se puede demostrar: se ve qué analizó el agente al arrancar, pero no qué es crítico.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.6',
      name: 'lista_blanca_aplicaciones',
      label: 'Lista blanca de aplicaciones',
      description:
        'Aplicaciones cuya ejecución está autorizada. La ruta es lo que se contrasta con las ejecuciones que registra el mecanismo de lista blanca (fapolicyd en Linux); el hash SHA-256 documenta la versión aprobada. Wazuh no aplica la lista: la verifica.',
      levels: ['ALTO'],
      requirements: ['op.exp.6.r3.1'],
      type: 'table',
      example: 'python3 | /usr/bin/python3.12 | - | servidores',
      columns: [
        {
          name: 'aplicacion',
          label: 'Aplicación',
          type: 'string',
          required: true,
        },
        {
          name: 'ruta',
          label: 'Ruta',
          type: 'path',
          required: true,
        },
        {
          name: 'sha256',
          label: 'SHA-256',
          type: 'string',
          required: false,
        },
        {
          name: 'perfil',
          label: 'Perfil de equipo',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Sin mecanismo de lista blanca en modo aplicación, o ejecución no bloqueada de una ruta que no figura aquí → incumplimiento de R3.',
      ensfacilUsage:
        'EV-07 exige el mecanismo activo y en modo aplicación, y contrasta la ruta de cada ejecución que el mecanismo dejó pasar con la columna «ruta».',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'La parte de R3 que contrasta ejecuciones no se puede demostrar; la ausencia del mecanismo se juzga igual.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.6',
      name: 'integracion_edr',
      label: 'Capacidades EDR desplegadas',
      description:
        'Una fila por capacidad EDR con si la organización la tiene desplegada y su alcance: virustotal (reputación de ficheros de FIM), yara (reglas de contenido), rootcheck (actividad sospechosa: rootkits, procesos y puertos ocultos) y active_response (contención automática). R4 pide detectar, investigar y resolver: las cuatro cuentan.',
      levels: ['ALTO'],
      requirements: ['op.exp.6.r4.1'],
      type: 'table',
      example: 'active_response | si | firewall-drop en servidores',
      columns: [
        {
          name: 'capacidad',
          label: 'Capacidad',
          type: 'select',
          options: ['virustotal', 'yara', 'rootcheck', 'active_response'],
          required: true,
        },
        {
          name: 'activada',
          label: 'Activada',
          type: 'select',
          options: SI_NO,
          required: true,
        },
        {
          name: 'alcance',
          label: 'Alcance',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Capacidad declarada como no activada, o declarada y no desplegada en el equipo → incumplimiento de R4.',
      ensfacilUsage:
        'EV-08 a EV-11 contrastan la fila de su capacidad con lo que el agente observa: respuesta activa y YARA configuradas por el manager y presentes en la máquina, rootcheck ejecutándose con sus bases.',
      evidenceIds: ['EV-08', 'EV-09', 'EV-10', 'EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'R4 no se puede demostrar: se ve la capa EDR de cada equipo, pero no qué ha decidido desplegar la organización.',
    },
    {
      id: 'P-10',
      controlId: 'op.exp.6',
      name: 'politica_dispositivos_extraibles',
      label: 'Política de dispositivos extraíbles',
      description:
        'Tratamiento de los dispositivos de almacenamiento extraíbles: bloqueados, permitidos con análisis obligatorio al conectarlos, o permitidos solo en lectura.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.3', 'op.exp.6.r5.1'],
      type: 'select',
      options: ['bloqueados', 'permitidos_con_analisis', 'permitidos_solo_lectura'],
      example: 'bloqueados',
      required: false,
      wazuhUsage:
        'Dispositivo extraíble conectado en un equipo donde están bloqueados, o conectado sin antimalware que lo analice → incumplimiento de op.exp.6.3.',
      ensfacilUsage:
        'EV-12 contrasta cada conexión de un disco extraíble que registra el kernel con esta política.',
      evidenceIds: ['EV-12'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede juzgar una conexión de un dispositivo extraíble: no hay política contra la que contrastarla.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.6',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. En op.exp.6 todos los requisitos tienen evidencia técnica, así que hoy no se aplica a ninguno: queda disponible por coherencia con el resto de controles. El mantenimiento del antimalware «de acuerdo a las recomendaciones del fabricante» de op.exp.6.1 se demuestra con sus firmas y su ejecución, no con un documento.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.6.3 | Procedimiento de análisis de ficheros externos | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        {
          name: 'requisito',
          label: 'Requisito',
          type: 'identifier',
          required: true,
        },
        {
          name: 'referencia',
          label: 'Documento',
          type: 'string',
          required: true,
        },
        {
          name: 'enlace',
          label: 'Enlace(s)',
          type: 'string',
          required: true,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Declarado por',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado.',
      ensfacilUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto en este control: ningún requisito de op.exp.6 es puramente documental.',
    },
  ],
};
