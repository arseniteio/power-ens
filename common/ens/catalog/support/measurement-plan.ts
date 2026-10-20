import { ENSControlDefinition } from '../types';

// Controls that entered the catalog before their collector. Owner decision of 19/10/2026: «Todos en catálogo ya,
// medición por oleadas». They are `DRAFT`: visible, configurable and declarable in the Statement of Applicability,
// but outside the index until their runbook emits and its rules are deployed. A control without an instrument is
// not accused of failing: the screen shows «Sin medición todavía» and, per evidence, the data source it needs.
// Sources come from the auditor v2.0 analysis (§5): the evidence sheet of each template and the platform columns.

export type ENSMeasurementWave = 'A' | 'B' | 'C';

export const ENS_MEASUREMENT_WAVE_TEXTS: Record<ENSMeasurementWave, string> = {
  A: 'oleada A: sin fuentes nuevas, reutiliza lo que Wazuh ya recoge',
  B: 'oleada B: reutiliza recolectores existentes y añade los registros de los servicios',
  C: 'oleada C: necesita fuentes que hoy no llegan a Wazuh (cortafuegos, proxy, red o métricas)',
};

export const ENS_PENDING_MEASUREMENT_LABEL = 'Sin medición todavía';

export interface ENSPlannedMeasurement {
  controlId: string;
  wave: ENSMeasurementWave;
  // What the control needs as a whole, in one line.
  needs: string;
  // Rules band reserved for its runbook (README, «Desarrollo», rule ID table). No rule is deployed yet.
  rulesBand: { from: number; to: number };
  // Evidence id -> the data source it needs, shown after «Fuente necesaria:».
  sources: Record<string, string>;
}

const CONFIGURATION_SCREEN = 'en la pantalla de Configuración';

export const ENS_PLANNED_MEASUREMENTS: ENSPlannedMeasurement[] = [
  {
    controlId: 'mp.eq.2',
    wave: 'A',
    needs: 'SCA de la política de bloqueo y eventos de sesión de cada puesto',
    rulesBand: { from: 111800, to: 111899 },
    sources: {
      'EV-01': 'SCA de la política de pantalla de cada puesto (Windows: GPO y salvapantallas seguro; Linux: gestor de sesión)',
      'EV-02': 'SCA de los límites de sesión (Windows: MaxIdleTime de RDS; Linux: TMOUT y ClientAliveInterval de sshd)',
      'EV-03': 'eventos de bloqueo y desbloqueo del puesto (Windows: 4800 y 4801; Linux: gestor de sesión)',
      'EV-04': 'duración de las sesiones frente a los eventos de bloqueo (correlación en el manager)',
      'EV-05': 'inventario de paquetes y procesos de Syscollector y eventos 4688 de Windows',
      'EV-06': 'resultados SCA de cada equipo frente a P-03 y P-04 (en el manager)',
    },
  },
  {
    controlId: 'mp.eq.3',
    wave: 'B',
    needs: 'inventario de portátiles, último contacto de los agentes, barrido de claves y estado del cifrado',
    rulesBand: { from: 111900, to: 111999 },
    sources: {
      'EV-01': 'Syscollector: tipo de chasis y batería de cada equipo',
      'EV-02': 'último contacto de cada agente (estado de agentes en el manager)',
      'EV-03': 'barrido de claves privadas y ficheros de acceso remoto (el de op.exp.10 EV-02, más .ovpn y .ppk)',
      'EV-04': 'estado del cifrado del disco (Linux: LUKS; Windows: BitLocker, incluida la protección suspendida)',
      'EV-05': 'registro de la VPN o del acceso remoto',
      'EV-06': 'registro de incidentes de op.exp.7 y eventos de revocación de cuentas (4725)',
      'EV-07': 'registro de la VPN con el origen de las conexiones',
      'EV-08': 'Syscollector y SCA de los portátiles',
    },
  },
  {
    controlId: 'mp.eq.4',
    wave: 'C',
    needs: 'descubrimiento de red, syslog o SNMP de los dispositivos y registros de sus paneles de administración',
    rulesBand: { from: 112000, to: 112099 },
    sources: {
      'EV-01': 'descubrimiento de red: DHCP, ARP o escaneo (en el manager)',
      'EV-02': 'descubrimiento de red frente al inventario P-01 y al de op.exp.1',
      'EV-03': 'registro del cortafuegos o de la electrónica de red con los flujos de cada dispositivo',
      'EV-04': 'syslog o SNMP de los propios dispositivos',
      'EV-05': 'registro de acceso al panel de administración de los dispositivos',
      'EV-06': 'registro del NAC o de la seguridad de puertos de los conmutadores (802.1X)',
      'EV-07': 'registro de la controladora wifi o del NAC',
      'EV-08': 'registro del borrado del almacenamiento de cada dispositivo',
    },
  },
  {
    controlId: 'mp.com.1',
    wave: 'C',
    needs: 'registro del cortafuegos perimetral',
    rulesBand: { from: 112100, to: 112199 },
    sources: {
      'EV-01': 'registro del cortafuegos perimetral (pfSense, OPNsense, FortiGate, nftables…) enviado a Wazuh',
      'EV-02': 'registro del cortafuegos perimetral frente a los flujos autorizados de P-02',
      'EV-03': 'Syscollector: interfaces de red de cada sistema',
      'EV-04': 'Syscollector: rutas por defecto y salidas a red externa',
      'EV-05': 'Syscollector: procesos y puertos de túnel (openvpn, wireguard, ssh -R)',
      'EV-06': 'registro del cortafuegos perimetral con el uso de cada regla',
      'EV-07': 'registro del cortafuegos perimetral',
      'EV-08': 'continuidad del registro del cortafuegos perimetral en el manager',
    },
  },
  {
    controlId: 'mp.com.3',
    wave: 'B',
    needs: 'configuración criptográfica de los canales y registros de los servicios (reutiliza op.exp.10)',
    rulesBand: { from: 112200, to: 112299 },
    sources: {
      'EV-01': 'registros de autenticación de los canales con el exterior (TLS mutuo, VPN)',
      'EV-02': 'SCA de la configuración criptográfica: sshd, TLS de apache, nginx y postfix, slapd y Schannel',
      'EV-03': 'registros de los servicios con los algoritmos negociados (los de op.exp.10)',
      'EV-04': 'reglas de correlación de Wazuh (op.mon.1) sobre alteración en tránsito',
      'EV-05': 'reglas de correlación de Wazuh (op.mon.1) sobre inyección de información',
      'EV-06': 'reglas de correlación de Wazuh (op.mon.1) sobre secuestro de sesión',
      'EV-07': 'registro de incidentes de op.exp.7',
      'EV-08': 'SCA y registro de la VPN de los canales fuera del dominio',
      'EV-09': 'registros de autenticación de los servicios',
      'EV-10': 'FIM sobre la configuración de los canales protegidos',
      'EV-11': `vigencia de las certificaciones de P-08 (${CONFIGURATION_SCREEN})`,
    },
  },
  {
    controlId: 'mp.com.4',
    wave: 'C',
    needs: 'registros del cortafuegos interno, de la controladora wifi y del NAC',
    rulesBand: { from: 112300, to: 112399 },
    sources: {
      'EV-01': 'registro del cortafuegos interno o de la electrónica de red entre segmentos',
      'EV-02': 'registro del cortafuegos interno frente a la matriz de flujos P-02',
      'EV-03': 'Syscollector: equipos con interfaces en varias redes o VLAN',
      'EV-04': 'registro de la controladora wifi',
      'EV-05': 'registro del cortafuegos en los puntos de interconexión',
      'EV-06': 'registro del NAC o de la autenticación de acceso a cada segmento',
      'EV-07': 'SCA y Syscollector de la configuración de red de los equipos',
      'EV-08': 'Syscollector: direccionamiento de los equipos frente al mapa de segmentos P-01',
      'EV-09': 'alertas de Wazuh por segmento de origen (correlación en el manager)',
      'EV-10': 'registro del cortafuegos interno frente a la revisión de la matriz (P-07)',
    },
  },
  {
    controlId: 'mp.sw.2',
    wave: 'A',
    needs: 'Syscollector, SCA antes y después, Vulnerability Detector y el registro de cambios de op.exp.5',
    rulesBand: { from: 112400, to: 112499 },
    sources: {
      'EV-01': 'Syscollector: paquetes y puertos nuevos en los sistemas de P-01',
      'EV-02': `registro de actas de aceptación P-07 (${CONFIGURATION_SCREEN}) frente a las puestas en servicio detectadas`,
      'EV-03': 'SCA antes y después del despliegue',
      'EV-04': 'Syscollector: puertos y servicios nuevos frente a P-06',
      'EV-05': 'Vulnerability Detector',
      'EV-06': 'SCA con los criterios de aceptación de P-02',
      'EV-07': 'Syscollector de preproducción y de producción, emparejados según P-03',
      'EV-08': 'Syscollector y SCA del entorno de preproducción',
      'EV-09': 'alertas de disponibilidad del servicio tras la puesta en servicio',
      'EV-10': `registro de auditorías de código P-08 (${CONFIGURATION_SCREEN})`,
    },
  },
  {
    controlId: 'mp.s.1',
    wave: 'A',
    needs: 'registros del servidor de correo (Zimbra: postfix, amavisd, ClamAV y SpamAssassin)',
    rulesBand: { from: 112500, to: 112599 },
    sources: {
      'EV-01': 'registros del servidor de correo (Zimbra: postfix, amavisd, ClamAV y SpamAssassin) o de la plataforma en la nube',
      'EV-02': 'registros del filtro antispam (SpamAssassin)',
      'EV-03': 'registros del antivirus de correo (amavisd y ClamAV)',
      'EV-04': 'registros de amavisd: análisis de anexos de todo el correo',
      'EV-05': 'registros del filtrado de anexos y contenido activo',
      'EV-06': 'SCA de la configuración TLS del MTA (smtpd_tls_security_level) y registros de postfix',
      'EV-07': 'consulta DNS de SPF, DKIM y DMARC de los dominios de P-02',
      'EV-08': 'registros del MTA con los resultados de SPF, DKIM y DMARC',
      'EV-09': 'FIM sobre la configuración del servicio de correo',
      'EV-10': `registro de campañas de concienciación P-09 (${CONFIGURATION_SCREEN})`,
    },
  },
  {
    controlId: 'mp.s.2',
    wave: 'B',
    needs: 'registros de los servidores web, Vulnerability Detector y el registro de auditorías',
    rulesBand: { from: 112600, to: 112699 },
    sources: {
      'EV-01': 'registros de acceso y de error de los servidores web (apache, nginx, IIS)',
      'EV-02': 'registros de acceso web sobre las rutas protegidas de P-03',
      'EV-03': 'SCA del servidor web (listado de directorios, métodos) y registros de acceso',
      'EV-04': 'reglas de serie de Wazuh para ataques web sobre los registros de acceso',
      'EV-05': 'SCA de la configuración de las cookies y registros de acceso',
      'EV-06': 'reglas de serie de Wazuh para inyección sobre los registros de acceso',
      'EV-07': 'registros de la aplicación con los cambios de privilegio',
      'EV-08': 'reglas de serie de Wazuh para cross site scripting sobre los registros de acceso',
      'EV-09': 'códigos de respuesta de los registros de acceso (correlación en el manager)',
      'EV-10': 'Vulnerability Detector y SCA del servidor web',
      'EV-11': `registro de auditorías P-08 (${CONFIGURATION_SCREEN})`,
      'EV-12': `seguimiento de hallazgos P-09 (${CONFIGURATION_SCREEN}) y registro de cambios de op.exp.5`,
      'EV-13': 'SCA y registros de los proxies y cachés de P-10',
    },
  },
  {
    controlId: 'mp.s.3',
    wave: 'C',
    needs: 'registro del proxy o filtro web',
    rulesBand: { from: 112700, to: 112799 },
    sources: {
      'EV-01': 'registro del proxy o filtro web (Squid, DNS filtrante, pasarela web segura)',
      'EV-02': 'registro del proxy o filtro web con la categoría de cada destino',
      'EV-03': 'registro del proxy o filtro web (descargas y contenido activo bloqueados)',
      'EV-04': 'registro del proxy o filtro web frente a listas CDB de reputación',
      'EV-05': 'registro del DNS y SCA de los resolutores de los puestos',
      'EV-06': 'Syscollector y SCA del navegador en los puestos',
      'EV-07': 'SCA de la política de cookies del navegador',
      'EV-08': 'registro del proxy o filtro web y su retención',
      'EV-09': 'registro de la inspección TLS del proxy',
      'EV-10': 'registro del proxy o filtro web frente a la lista negra P-10 (listas CDB)',
      'EV-11': 'registros del cortafuegos y del DNS (navegación que no pasa por el proxy)',
      'EV-12': `normativa, concienciación y formación de P-01, P-06 y P-07 (${CONFIGURATION_SCREEN})`,
    },
  },
  {
    controlId: 'mp.s.4',
    wave: 'C',
    needs: 'una fuente de métricas de carga y capacidad (Wazuh no es una herramienta de métricas)',
    rulesBand: { from: 112800, to: 112899 },
    sources: {
      'EV-01': 'métricas de carga y de capacidad de los servicios de P-01',
      'EV-02': 'SCA y Syscollector: tcp_syncookies, limit_req, fail2ban',
      'EV-03': 'métricas de carga y registros de los servicios',
      'EV-04': 'métricas de disponibilidad de los servicios durante el episodio',
      'EV-05': 'registros del cortafuegos y de los servicios durante el ataque',
      'EV-06': 'registro de incidentes de op.exp.7',
      'EV-07': 'registro de la respuesta activa de Wazuh',
      'EV-08': 'registro del cortafuegos con el tráfico saliente',
      'EV-09': 'Syscollector y SCA de los servicios expuestos que pueden amplificar',
      'EV-10': 'registro de episodios de denegación de servicio (op.exp.7)',
    },
  },
];

export const getPlannedMeasurement = (controlId: string): ENSPlannedMeasurement | undefined =>
  ENS_PLANNED_MEASUREMENTS.find(plan => plan.controlId === controlId);

// The source one evidence of a control without collector needs; undefined for measured controls.
export const describeRequiredSource = (controlId: string, evidenceId: string): string | undefined =>
  getPlannedMeasurement(controlId)?.sources[evidenceId];

// A control is pending measurement while it is not ACTIVE: the engine leaves it out of the index.
export const isPendingMeasurement = (control?: Pick<ENSControlDefinition, 'status'>): boolean =>
  Boolean(control && control.status !== 'ACTIVE');

// One sentence for the screen and the report: why the control has no verdict and what it waits for.
export const describePendingMeasurement = (control: Pick<ENSControlDefinition, 'id' | 'status'>): string => {
  const plan = getPlannedMeasurement(control.id);
  const base = `${control.id} está en el catálogo pero ningún recolector emite todavía sus evidencias: no entra en el índice y no se juzga como incumplimiento.`;

  return plan
    ? `${base} Medición prevista en la ${ENS_MEASUREMENT_WAVE_TEXTS[plan.wave]}; necesita ${plan.needs}.`
    : base;
};
