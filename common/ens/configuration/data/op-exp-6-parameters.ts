import { ENSControlConfiguration } from '../types';

// op.exp.6 · the policy that decides the control. The agent observes the antimalware of each machine plane, its
// signatures, settings, detections and the EDR layer without judging; the verdict comes from contrasting them
// with what is decided here.
// P-02, P-04 and P-09 are tables (equipment/plane/product, setting=value pairs, capability with three axes) with
// columns declared here and in `config/op-exp-6-control-block.json`; P-07 is one row per equipment and path (`*`
// for all) and P-08 splits hash and path.
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
        'Solución antimalware desplegada por tipo de equipo, con la ubicación de sus logs, escrita como la emite el agente (clamav, mdatp, falcon-sensor, sophos-spl, eset, sentinelone, trendmicro-ds). Declara el producto; lo esperado en CADA equipo es P-02.',
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
        'Declara el producto y dónde registra su actividad. El agente lee los logs de ClamAV; de otros productos detecta si están instalados y en ejecución.',
      ensfacilUsage:
        'Documental: no se juzga por sí mismo. op.exp.6.2 lo decide la fila de cada equipo en P-02.',
      evidenceIds: ['EV-01'],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto en el veredicto: la cobertura se juzga contra P-02. No consta qué producto eligió la organización.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.6',
      name: 'cobertura_esperada_antimalware',
      label: 'Cobertura esperada de antimalware',
      description:
        'Una fila por equipo y plano con el antimalware que debe estar EN EJECUCIÓN. Plano «sistema»: el antimalware de la máquina; plano «correo»: el del servicio de correo que presta (amavis y clamd de Zimbra, por ejemplo), solo en servidores que lo prestan. El equipo es el nombre corto del host (o el de OPEXP6_EQUIPO en su .env). op.exp.6.2 exige todos los equipos sin excepción: un equipo sin fila queda sin juzgar.',
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
        'Equipo y plano cuyo antimalware en ejecución no es el declarado (o no hay ninguno): incumplimiento de op.exp.6.2.',
      ensfacilUsage:
        'EV-01 busca la fila por equipo y plano y compara «producto_esperado» con el producto EN EJECUCIÓN: instalado y parado no protege y cuenta como «ninguno».',
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
        'Antigüedad máxima de las bases de detección, desde que el fabricante las publicó. op.exp.6.4 exige que estén «permanentemente actualizadas»; ClamAV publica a diario, así que lo habitual son 24 o 48 horas.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.4'],
      type: 'duration_hours',
      example: '48',
      minValue: 1,
      required: true,
      wazuhUsage:
        'Firmas publicadas hace más de P-03 horas en algún plano con antimalware: incumplimiento de op.exp.6.4.',
      ensfacilUsage:
        'EV-02 mide con el reloj la antigüedad de las firmas de CADA plano con antimalware en ejecución; manda el peor.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.6.4 no se puede demostrar: se ven las firmas pero no la antigüedad tolerada.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.6',
      name: 'config_proteccion_tiempo_real',
      label: 'Ajustes esperados del antimalware',
      description:
        'Una fila por plano y ajuste con el valor exigido. Ajustes observados: proteccion_tiempo_real (clamonacc; en correo, amavis y clamd), actualizacion_automatica_firmas (freshclam), analisis_comprimidos (ScanArchive) y bloqueo_en_acceso (OnAccessPrevention); los de Windows Defender (TamperProtection…) se declaran solo si hay equipos con ese producto.',
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
        'Ajuste observado distinto del declarado (por ejemplo, protección en tiempo real desactivada): incumplimiento de op.exp.6.5.',
      ensfacilUsage:
        'EV-03 busca la fila por plano y ajuste y compara «valor_esperado» con el observado. Un ajuste observado sin fila queda sin juzgar.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.6.5 no se puede demostrar: se ven los ajustes pero no cuáles se exigen.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.6',
      name: 'puntos_entrada_ficheros_externos',
      label: 'Vías de entrada de ficheros externos',
      description:
        'Vías por las que entran ficheros externos y que deben analizarlos antes de usarlos, con el mecanismo que lo hace. El agente acredita la vía «correo» en un servidor que lo analiza (amavis) y «dispositivos_extraibles» con las conexiones que registra el kernel; las demás se analizan en la pasarela o proxy que las atiende, fuera de la máquina.',
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
        'Vía declarada sin análisis observable en la máquina: op.exp.6.3 no demostrado.',
      ensfacilUsage:
        'EV-12 comprueba cada vía declarada con lo que observa la máquina: análisis del correo y dispositivos extraíbles contra P-10.',
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
        'Cada cuántos días debe completarse un escaneo de todo el sistema; R1 exige escaneo «regularmente» sin fijar periodicidad. Se mide desde el FIN del último escaneo completo registrado.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.6.r1.1'],
      type: 'duration_days',
      example: '7',
      minValue: 1,
      required: false,
      wazuhUsage:
        'Último escaneo completo más antiguo que P-06 días, o ninguno: incumplimiento de R1.',
      ensfacilUsage:
        'EV-05 mide con el reloj el fin del escaneo completo más reciente.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'R1 no se puede demostrar: se ven los escaneos pero no la periodicidad exigida.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.6',
      name: 'funciones_criticas_arranque',
      label: 'Funciones críticas analizadas al arranque',
      description:
        'Rutas críticas que el agente debe analizar al arrancar (FIM con scan_on_start): binarios del sistema, cargador de arranque, módulos del kernel (/lib/modules), servicios de seguridad. Una fila por equipo y ruta, con «*» para todos; está cubierta si el agente vigila la ruta o un directorio que la contiene.',
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
        'Ruta crítica no analizada en el último arranque, o análisis de arranque sin terminar: incumplimiento de R2.',
      ensfacilUsage:
        'EV-06 contrasta las rutas del equipo (las suyas y las de «*») con las que el agente vigilaba en su último arranque y exige que el análisis terminara.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'R2 no se puede demostrar: se ve qué analizó el agente al arrancar pero no qué es crítico.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.6',
      name: 'lista_blanca_aplicaciones',
      label: 'Lista blanca de aplicaciones',
      description:
        'Aplicaciones cuya ejecución está autorizada: la ruta se contrasta con las ejecuciones que registra la lista blanca (fapolicyd en Linux) y el SHA-256 documenta la versión aprobada. Wazuh no aplica la lista, la verifica.',
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
        'Sin mecanismo de lista blanca en modo aplicación, o ejecución no bloqueada de una ruta ausente de la lista: incumplimiento de R3.',
      ensfacilUsage:
        'EV-07 exige el mecanismo activo y en modo aplicación, y contrasta la ruta de cada ejecución permitida con la columna «ruta».',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'La parte de R3 que contrasta ejecuciones no se demuestra; la ausencia del mecanismo se juzga igual.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.6',
      name: 'integracion_edr',
      label: 'Capacidades EDR desplegadas',
      description:
        'Una fila por capacidad EDR con si está desplegada y su alcance: virustotal (reputación de ficheros de FIM), yara (reglas de contenido), rootcheck (rootkits, procesos y puertos ocultos) y active_response (contención automática). R4 pide detectar, investigar y resolver: cuentan las cuatro.',
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
        'Capacidad declarada como no activada, o declarada y no desplegada en el equipo: incumplimiento de R4.',
      ensfacilUsage:
        'EV-08 a EV-11 contrastan la fila de cada capacidad con lo que observa el agente: respuesta activa y YARA configuradas por el manager y presentes en la máquina, rootcheck ejecutándose con sus bases.',
      evidenceIds: ['EV-08', 'EV-09', 'EV-10', 'EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'R4 no se puede demostrar: se ve la capa EDR de cada equipo pero no qué decidió desplegar la organización.',
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
        'Dispositivo extraíble conectado donde están bloqueados, o sin antimalware que lo analice: incumplimiento de op.exp.6.3.',
      ensfacilUsage:
        'EV-12 contrasta cada conexión de un disco extraíble que registra el kernel con esta política.',
      evidenceIds: ['EV-12'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede juzgar la conexión de un dispositivo extraíble: no hay política contra la que contrastarla.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.6',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos que acreditan un requisito que ninguna medida técnica puede demostrar; en op.exp.6 todos tienen evidencia técnica y hoy no se aplica a ninguno. El mantenimiento del antimalware «de acuerdo a las recomendaciones del fabricante» (op.exp.6.1) se demuestra con firmas y ejecución.',
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
        'Solo se aplica a requisitos sin evidencia técnica, por lo que nunca tapa una medida fallida.',
      ensfacilUsage:
        'Solo se aplica a requisitos sin evidencia técnica. Se marca ATESTACION y se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto: ningún requisito de op.exp.6 es solo documental.',
    },
  ],
};
