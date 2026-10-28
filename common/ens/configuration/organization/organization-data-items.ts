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
    "description": "Cuentas que autorizan cambios de derechos de acceso, escritas como las emite el agente: sin espacios, comas ni «|». «Ámbito» es lo que puede autorizar cada una.",
    "type": "table",
    "perUseColumns": ["ambito", "detalle"],
    "columns": [
      {"name": "cuenta", "label": "Cuenta", "type": "string", "required": true},
      {"name": "uso", "label": "Uso", "type": "multiselect", "required": true, "options": ["autorizaciones"]},
      {"name": "ambito", "label": "Ámbito", "type": "string", "required": false},
      {"name": "detalle", "label": "Detalle", "type": "string", "required": false}
    ],
    "views": [
      {"controlId": "op.acc.4", "parameterId": "P-02", "where": {"uso": "autorizaciones"}, "columns": ["cuenta", "ambito"]}
    ],
    "unmapped": [
      {"controlId": "op.acc.1", "parameterId": "P-07", "reason": "Es la lista de usuarios autorizados de cada sistema, no solo quien administra."}
    ]
  },
  {
    "id": "retencion",
    "label": "Plazos de retención",
    "description": "Días de conservación de las cuentas deshabilitadas y del registro de accesos. Cada control lee la fila de su uso; cada uso admite una sola fila.",
    "type": "table",
    "perUseColumns": ["categoria"],
    "columns": [
      {"name": "uso", "label": "Uso", "type": "multiselect", "required": true, "options": ["cuentas", "accesos"]},
      {"name": "categoria", "label": "Categoría", "type": "string", "required": false},
      {"name": "dias", "label": "Días", "type": "number", "required": true}
    ],
    "views": [
      {"controlId": "op.acc.1", "parameterId": "P-06", "where": {"uso": "cuentas"}, "columns": ["dias"]},
      {"controlId": "op.acc.5", "parameterId": "P-08", "where": {"uso": "accesos"}, "columns": ["dias"]}
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
    "unmapped": []
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
    "unmapped": []
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
      {"controlId": "op.acc.5", "parameterId": "P-DA", "where": {"medida": "op.acc.5", "aplicable": "no"}, "columns": ["motivo", "referencia", "enlace", "fecha", "responsable"]}
    ],
    "unmapped": []
  }
];

interface ENSOrganizationDataLink {
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
