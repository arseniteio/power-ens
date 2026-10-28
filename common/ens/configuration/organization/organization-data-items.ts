// Shared data asked once in General; the scripts parse the array below as JSON, so it stays strict JSON.
import type { ENSParameterColumn } from '../types';

export interface ENSOrganizationDataView {
  controlId: string;
  parameterId: string;
  // Only the item rows whose cell in each named column equals the value (a multiselect cell contains it).
  where?: Record<string, string>;
  // Item columns that make the parameter row, in the parameter order; absent: every item column.
  columns?: string[];
}

export interface ENSOrganizationDataUnmapped {
  controlId: string;
  parameterId: string;
  reason: string;
}

export interface ENSOrganizationDataItem {
  id: string;
  label: string;
  description: string;
  type: 'list' | 'table' | 'select';
  columns?: ENSParameterColumn[];
  options?: string[];
  // Columns that identify a row when two views fill different cells of it.
  key?: string[];
  // Columns whose meaning depends on the use: a row with several uses and one of them filled is warned about.
  perUseColumns?: string[];
  views: ENSOrganizationDataView[];
  // Parameters the auditor's map relates to the item that stay in their control, with the reason.
  unmapped: ENSOrganizationDataUnmapped[];
}

export const ENS_ORGANIZATION_DATA_ITEMS: ENSOrganizationDataItem[] =
[
  {
    "id": "personal_autorizado",
    "label": "Personal autorizado",
    "description": "Cuentas autorizadas y para qué, escritas como las emite el agente: sin espacios, comas ni «|» (en cloud, el ARN o la cuenta principal). Cada control lee solo las filas de su uso. «Ámbito» y «Detalle» son, según el uso: mantenimiento, ámbito y tipo; registros, alcance y permiso; claves, claves y operación; autorizaciones, ámbito; cloud, servicio. Una fila con varios usos comparte ámbito y detalle: si difieren, una fila por uso.",
    "type": "table",
    "perUseColumns": ["ambito", "detalle"],
    "columns": [
      {"name": "cuenta", "label": "Cuenta", "type": "string", "required": true},
      {"name": "uso", "label": "Uso", "type": "multiselect", "required": true, "options": ["configuracion", "mantenimiento", "registros", "claves", "copias", "autorizaciones", "cloud"]},
      {"name": "ambito", "label": "Ámbito", "type": "string", "required": false},
      {"name": "detalle", "label": "Detalle", "type": "string", "required": false}
    ],
    "views": [
      {"controlId": "op.exp.3", "parameterId": "P-03", "where": {"uso": "configuracion"}, "columns": ["cuenta"]},
      {"controlId": "op.exp.4", "parameterId": "P-02", "where": {"uso": "mantenimiento"}, "columns": ["cuenta", "ambito", "detalle"]},
      {"controlId": "op.exp.8", "parameterId": "P-08", "where": {"uso": "registros"}, "columns": ["cuenta", "detalle", "ambito"]},
      {"controlId": "op.exp.10", "parameterId": "P-08", "where": {"uso": "claves"}, "columns": ["cuenta", "ambito", "detalle"]},
      {"controlId": "mp.info.6", "parameterId": "P-07", "where": {"uso": "copias"}, "columns": ["cuenta"]},
      {"controlId": "op.acc.4", "parameterId": "P-02", "where": {"uso": "autorizaciones"}, "columns": ["cuenta", "ambito"]},
      {"controlId": "op.nub.1", "parameterId": "P-11", "where": {"uso": "cloud"}, "columns": ["ambito", "cuenta"]}
    ],
    "unmapped": [
      {"controlId": "op.exp.5", "parameterId": "P-04", "reason": "Es el Responsable de la Seguridad que aprueba los cambios, no una cuenta que administra."},
      {"controlId": "op.acc.1", "parameterId": "P-07", "reason": "Es la lista de usuarios autorizados de cada sistema, no solo quien administra."}
    ]
  },
  {
    "id": "entorno_preproduccion",
    "label": "Entorno de preproducción",
    "description": "Parejas de sistema de producción y de preproducción, con la referencia que acredita que son equivalentes y cómo está aislada la preproducción.",
    "type": "table",
    "key": ["sistema_prod", "sistema_preprod"],
    "columns": [
      {"name": "sistema_prod", "label": "Sistema de producción", "type": "identifier", "required": true},
      {"name": "sistema_preprod", "label": "Sistema de preproducción", "type": "identifier", "required": true},
      {"name": "consistencia", "label": "Evidencia de consistencia", "type": "string", "required": false},
      {"name": "aislamiento", "label": "Aislamiento de producción", "type": "string", "required": false}
    ],
    "views": [
      {"controlId": "op.exp.4", "parameterId": "P-06", "columns": ["sistema_prod", "sistema_preprod", "consistencia"]},
      {"controlId": "op.exp.5", "parameterId": "P-05", "columns": ["sistema_prod", "sistema_preprod", "consistencia"]},
      {"controlId": "mp.sw.2", "parameterId": "P-03", "columns": ["sistema_prod", "sistema_preprod", "aislamiento"]}
    ],
    "unmapped": []
  },
  {
    "id": "mecanismo_reversion",
    "label": "Mecanismo de reversión",
    "description": "Mecanismo para revertir un cambio y horas de ventana en que el punto de reversión debe existir antes del cambio. «Sistema» es el nombre del agente o «*».",
    "type": "table",
    "columns": [
      {"name": "sistema", "label": "Sistema", "type": "identifier", "required": true},
      {"name": "mecanismo", "label": "Mecanismo", "type": "select", "required": true, "options": ["lvm", "zfs", "btrfs", "hipervisor", "backup"]},
      {"name": "evidencia", "label": "Evidencia", "type": "string", "required": false},
      {"name": "ventana_horas", "label": "Ventana previa (horas)", "type": "number", "required": true}
    ],
    "views": [
      {"controlId": "op.exp.4", "parameterId": "P-07"},
      {"controlId": "op.exp.5", "parameterId": "P-08"}
    ],
    "unmapped": []
  },
  {
    "id": "herramientas_gestion",
    "label": "Herramientas de gestión de cambios e incidentes",
    "description": "Dónde se registran los cambios y los incidentes. Cada control lee las filas de su uso. En cambios, la herramienta es registro_tsv, jira, glpi, servicenow u otro. «Detalle» es el prefijo de referencia en cambios y el responsable en incidentes.",
    "type": "table",
    "perUseColumns": ["detalle"],
    "columns": [
      {"name": "uso", "label": "Uso", "type": "multiselect", "required": true, "options": ["cambios", "incidentes"]},
      {"name": "herramienta", "label": "Herramienta", "type": "string", "required": true},
      {"name": "ubicacion", "label": "Ubicación", "type": "string", "required": false},
      {"name": "detalle", "label": "Detalle", "type": "string", "required": false}
    ],
    "views": [
      {"controlId": "op.exp.5", "parameterId": "P-01", "where": {"uso": "cambios"}, "columns": ["herramienta", "ubicacion", "detalle"]},
      {"controlId": "op.exp.7", "parameterId": "P-03", "where": {"uso": "incidentes"}, "columns": ["herramienta", "ubicacion", "detalle"]}
    ],
    "unmapped": [
      {"controlId": "op.exp.9", "parameterId": "P-01", "reason": "Es una lista cerrada que indica si Power ENS lee su registro de incidentes; una fila de texto libre no la reproduce."},
      {"controlId": "mp.com.3", "parameterId": "P-04", "reason": "Es el procedimiento de respuesta a un ataque activo, no la herramienta donde se registran los incidentes."}
    ]
  },
  {
    "id": "sistemas_alcance",
    "label": "Sistemas y activos en alcance",
    "description": "El alcance lo fija la configuración inicial (agentes y grupos) y cada control lo acota con su parámetro de alcance. No se edita en Configuración.",
    "type": "list",
    "views": [],
    "unmapped": [
      {"controlId": "op.acc.1", "parameterId": "P-02", "reason": "Máquinas que mide el control."},
      {"controlId": "op.acc.2", "parameterId": "P-01", "reason": "Máquinas que mide el control."},
      {"controlId": "op.exp.8", "parameterId": "P-02", "reason": "Servidores que mide el control."},
      {"controlId": "mp.info.6", "parameterId": "P-04", "reason": "Máquinas cuyas copias mide el control."},
      {"controlId": "op.exp.1", "parameterId": "P-01", "reason": "Inventario propio de op.exp.1."},
      {"controlId": "op.exp.1", "parameterId": "P-02", "reason": "Inventario propio de op.exp.1."},
      {"controlId": "mp.eq.4", "parameterId": "P-01", "reason": "Inventario propio de mp.eq.4: dispositivos de red, casi todos sin agente."},
      {"controlId": "mp.s.2", "parameterId": "P-01", "reason": "Aplicaciones web que mide el control."}
    ]
  },
  {
    "id": "algoritmos_autorizados",
    "label": "Algoritmos y parámetros autorizados por el CCN",
    "description": "Algoritmos y longitudes mínimas autorizados por el CCN (CCN-STIC-807), una fila por algoritmo y uso, escritos como la familia normalizada del agente (AES-GCM, HMAC-SHA2-256, TLS1.3…). Longitud vacía: no se exige.",
    "type": "table",
    "columns": [
      {"name": "uso", "label": "Uso", "type": "select", "required": true, "options": ["protocolo", "cifrado", "mac", "intercambio", "firma", "hash", "hash_contrasenas"]},
      {"name": "algoritmo", "label": "Algoritmo (familia)", "type": "string", "required": true},
      {"name": "longitud_min", "label": "Longitud mínima (bits)", "type": "number", "required": false}
    ],
    "views": [
      {"controlId": "op.exp.10", "parameterId": "P-03"},
      {"controlId": "mp.com.3", "parameterId": "P-02"}
    ],
    "unmapped": [
      {"controlId": "mp.s.1", "parameterId": "P-03", "reason": "Son los requisitos TLS del correo (versión, MTA-STS, dominios con TLS obligatorio), un texto y no la lista de algoritmos."}
    ]
  },
  {
    "id": "retencion",
    "label": "Plazos de retención",
    "description": "Días de conservación de registros, evidencias, cuentas deshabilitadas, registro de accesos y copias. Cada control lee las filas de su uso; cuentas, accesos y copias admiten una sola fila cada uno.",
    "type": "table",
    "perUseColumns": ["categoria"],
    "columns": [
      {"name": "uso", "label": "Uso", "type": "multiselect", "required": true, "options": ["registros", "evidencias", "cuentas", "accesos", "copias"]},
      {"name": "categoria", "label": "Categoría", "type": "string", "required": false},
      {"name": "dias", "label": "Días", "type": "number", "required": true}
    ],
    "views": [
      {"controlId": "op.exp.8", "parameterId": "P-07", "where": {"uso": "registros"}, "columns": ["categoria", "dias"]},
      {"controlId": "op.exp.9", "parameterId": "P-06", "where": {"uso": "evidencias"}, "columns": ["categoria", "dias"]},
      {"controlId": "op.acc.1", "parameterId": "P-06", "where": {"uso": "cuentas"}, "columns": ["dias"]},
      {"controlId": "op.acc.5", "parameterId": "P-08", "where": {"uso": "accesos"}, "columns": ["dias"]},
      {"controlId": "mp.info.6", "parameterId": "P-03", "where": {"uso": "copias"}, "columns": ["dias"]}
    ],
    "unmapped": []
  },
  {
    "id": "zonas_controladas",
    "label": "Zonas controladas y segmentos de red",
    "description": "Redes y orígenes que la organización considera zona controlada, uno por línea.",
    "type": "list",
    "views": [
      {"controlId": "op.acc.6", "parameterId": "P-02"}
    ],
    "unmapped": [
      {"controlId": "mp.com.4", "parameterId": "P-01", "reason": "Es el mapa de segmentos con su propósito y rango; la lista de zonas controladas no lo recoge."},
      {"controlId": "mp.com.4", "parameterId": "P-02", "reason": "Es la matriz de flujos entre segmentos, otro dato."},
      {"controlId": "mp.eq.4", "parameterId": "P-06", "reason": "Es la política de dispositivos personales e invitados, no una zona."}
    ]
  },
  {
    "id": "canales_acceso_remoto",
    "label": "Canales de acceso remoto autorizados",
    "description": "Canales de acceso remoto, una fila por canal: si va cifrado, quién lo autoriza, si su uso es constante, y su puerto y origen permitidos.",
    "type": "table",
    "key": ["canal"],
    "columns": [
      {"name": "canal", "label": "Canal", "type": "identifier", "required": true},
      {"name": "cifrado", "label": "Cifrado", "type": "select", "required": true, "options": ["si", "no"]},
      {"name": "autoriza", "label": "Autoriza", "type": "string", "required": true},
      {"name": "uso_constante", "label": "Uso constante", "type": "select", "required": true, "options": ["si", "no"]},
      {"name": "puerto", "label": "Puerto", "type": "string", "required": false},
      {"name": "origen", "label": "Origen permitido", "type": "string", "required": false}
    ],
    "views": [
      {"controlId": "op.acc.6", "parameterId": "P-07", "columns": ["canal", "cifrado", "autoriza", "uso_constante"]},
      {"controlId": "op.acc.4", "parameterId": "P-04", "columns": ["canal", "puerto", "origen"]}
    ],
    "unmapped": [
      {"controlId": "mp.eq.3", "parameterId": "P-04", "reason": "Son los servicios accesibles desde los portátiles y su perfil, no los canales."}
    ]
  },
  {
    "id": "productos_certificados",
    "label": "Productos y servicios certificados",
    "description": "Servicios con certificación reconocida, su metodología, número y vigencia.",
    "type": "table",
    "columns": [
      {"name": "servicio", "label": "Servicio", "type": "string", "required": true},
      {"name": "metodologia", "label": "Metodología", "type": "string", "required": false},
      {"name": "n_certificado", "label": "Nº certificado", "type": "string", "required": false},
      {"name": "vigencia", "label": "Vigente hasta (AAAA-MM-DD)", "type": "date", "required": false}
    ],
    "views": [
      {"controlId": "op.nub.1", "parameterId": "P-04"},
      {"controlId": "mp.com.3", "parameterId": "P-08", "columns": ["servicio", "metodologia", "n_certificado", "vigencia"]}
    ],
    "unmapped": [
      {"controlId": "op.exp.10", "parameterId": "P-09", "reason": "Es la conformidad de los cifradores con una guía CCN-STIC, no la certificación de un producto."},
      {"controlId": "mp.eq.4", "parameterId": "P-07", "reason": "Lleva la justificación de los dispositivos sin producto certificado, que este dato no recoge."}
    ]
  },
  {
    "id": "registro_pruebas",
    "label": "Registro de pruebas periódicas",
    "description": "Dónde se registra cada prueba ejecutada. Power ENS solo lee /etc/power-ens/continuity-test-register.tsv en el manager.",
    "type": "select",
    "options": ["Registro Power ENS (/etc/power-ens/continuity-test-register.tsv)", "Otra herramienta"],
    "views": [
      {"controlId": "op.cont.3", "parameterId": "P-04"}
    ],
    "unmapped": [
      {"controlId": "op.cont.3", "parameterId": "P-05", "reason": "Es el seguimiento de deficiencias, otro dato."},
      {"controlId": "mp.s.2", "parameterId": "P-08", "reason": "Es el registro de auditorías web (fecha, modalidad, metodología, herramienta, hallazgos), no dónde se registran las pruebas de continuidad."}
    ]
  },
  {
    "id": "formacion_personal",
    "label": "Formación y concienciación del personal",
    "description": "Formación recibida por cada persona, con fecha y vigencia.",
    "type": "table",
    "columns": [
      {"name": "persona", "label": "Persona", "type": "string", "required": true},
      {"name": "formacion", "label": "Formación", "type": "string", "required": true},
      {"name": "fecha", "label": "Fecha", "type": "date", "required": false},
      {"name": "vigencia", "label": "Vigente hasta", "type": "date", "required": true}
    ],
    "views": [
      {"controlId": "op.cont.2", "parameterId": "P-05"},
      {"controlId": "mp.s.3", "parameterId": "P-07"}
    ],
    "unmapped": [
      {"controlId": "mp.s.1", "parameterId": "P-09", "reason": "Son campañas de concienciación con su alcance y participación, no la formación de cada persona."},
      {"controlId": "mp.s.3", "parameterId": "P-06", "reason": "Son actividades de concienciación con su alcance, no la formación de cada persona."},
      {"controlId": "mp.s.1", "parameterId": "P-08", "reason": "Es la normativa de uso del correo (documento y difusión), no formación."},
      {"controlId": "mp.s.3", "parameterId": "P-01", "reason": "Es la normativa de navegación (documento y difusión), no formación."}
    ]
  },
  {
    "id": "grupos_privilegiados",
    "label": "Grupos con privilegio administrativo",
    "description": "Grupos cuya pertenencia concede privilegios de administración, con su nombre en el sistema, sin espacios, comas ni «|» (sudo, wheel, admin). Un ajuste por agente o la plantilla de su tipo siguen aplicando encima.",
    "type": "list",
    "columns": [
      {"name": "grupo", "label": "Grupo", "type": "string", "required": true}
    ],
    "views": [
      {"controlId": "op.acc.1", "parameterId": "P-11"},
      {"controlId": "op.acc.2", "parameterId": "P-12"},
      {"controlId": "op.acc.4", "parameterId": "P-06"}
    ],
    "unmapped": []
  },
  {
    "id": "declaracion_aplicabilidad",
    "label": "Declaración de aplicabilidad",
    "description": "Una fila por medida del ENS: si aplica, nivel y refuerzos. Una medida que no aplica lleva motivo, referencia del documento aprobado y enlace; con ellos, el control que la declara queda excluido.",
    "type": "table",
    "key": ["medida"],
    "columns": [
      {"name": "medida", "label": "Medida (identificador del ENS)", "type": "string", "required": true},
      {"name": "aplicable", "label": "Aplicable", "type": "select", "required": true, "options": ["sí", "no"]},
      {"name": "nivel", "label": "Nivel", "type": "select", "required": false, "options": ["BAJO", "MEDIO", "ALTO"]},
      {"name": "refuerzos_exigibles", "label": "Refuerzos exigibles", "type": "string", "required": false},
      {"name": "motivo", "label": "Motivo", "type": "string", "required": false},
      {"name": "referencia", "label": "Referencia", "type": "string", "required": false},
      {"name": "enlace", "label": "Enlace", "type": "string", "required": false},
      {"name": "fecha", "label": "Fecha", "type": "string", "required": false},
      {"name": "responsable", "label": "Responsable", "type": "string", "required": false}
    ],
    "views": [
      {"controlId": "op.mon.2", "parameterId": "P-01", "columns": ["medida", "aplicable", "nivel", "refuerzos_exigibles"]},
      {"controlId": "op.acc.5", "parameterId": "P-DA", "where": {"medida": "op.acc.5", "aplicable": "no"}, "columns": ["motivo", "referencia", "enlace", "fecha", "responsable"]}
    ],
    "unmapped": []
  }
];

export const getOrganizationDataItem = (itemId: string): ENSOrganizationDataItem | undefined =>
  ENS_ORGANIZATION_DATA_ITEMS.find(item => item.id === itemId);

export interface ENSOrganizationDataLink {
  item: ENSOrganizationDataItem;
  view: ENSOrganizationDataView;
}

const LINKS = new Map<string, ENSOrganizationDataLink>();
ENS_ORGANIZATION_DATA_ITEMS.forEach(item =>
  item.views.forEach(view => LINKS.set(`${view.controlId} ${view.parameterId}`, { item, view }))
);

// The item a control parameter reads, if it is organisation data.
export const findOrganizationDataLink = (
  controlId: string,
  parameterId: string
): ENSOrganizationDataLink | undefined => LINKS.get(`${controlId} ${parameterId}`);

export const isOrganizationDataParameter = (controlId: string, parameterId: string): boolean =>
  LINKS.has(`${controlId} ${parameterId}`);

// «op.exp.4 P-02 (mantenimiento)»: who reads the item and which rows.
export const describeOrganizationDataView = (view: ENSOrganizationDataView): string => {
  const slice = Object.entries(view.where || {})
    .filter(([column]) => column !== 'medida' || !view.where?.aplicable)
    .map(([, value]) => value);
  return `${view.controlId} ${view.parameterId}${slice.length ? ` (${slice.join(', ')})` : ''}`;
};
