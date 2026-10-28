// Class of non-compliance, who fixes it and its colour, in one place: card stripe, badge, action and the overview work queue must agree.
export interface NonConformityClass {
  color: string;
  badgeColor: 'danger' | 'default' | 'warning' | 'primary';
  icono: string;
  etiqueta: string;
  accion: string;
  responsable: string;
  orden: number;
}

export const classifyNonConformity = (
  item: { origin?: string; cause?: string; documental?: boolean },
  // Control not in the active configuration: adding it comes first whatever the gap cause (except catalogue, which belongs to the product).
  options: { controlConfigured?: boolean } = {}
): NonConformityClass => {
  if (options.controlConfigured === false && item.origin !== 'MEDIDA' && item.cause !== 'CATALOG') {
    return { etiqueta: 'No evidenciado · control sin añadir', icono: 'gear', color: '#F5A700', badgeColor: 'warning', accion: 'Añadir el control a la configuración', responsable: 'Responsable ENS', orden: 3 };
  }
  // Proven on a declaration (missing or expired contract or certification): nothing to fix on the machine.
  if (item.origin === 'MEDIDA' && item.documental) {
    return { etiqueta: 'Declarado (documental)', icono: 'document', color: '#BD271E', badgeColor: 'danger', accion: 'Renovar o completar la documentación', responsable: 'Organización (contratos y proveedores)', orden: 2 };
  }
  if (item.origin === 'MEDIDA') {
    return { etiqueta: 'Medido', icono: 'inspect', color: '#BD271E', badgeColor: 'danger', accion: 'Corregir la máquina', responsable: 'Sistema auditado', orden: 1 };
  }
  if (item.cause === 'CATALOG') {
    return { etiqueta: 'No evidenciado · catálogo', icono: 'package', color: '#98A2B3', badgeColor: 'default', accion: 'Declarar la evidencia', responsable: 'Producto Power ENS', orden: 6 };
  }
  if (item.cause === 'CONFIGURATION') {
    return { etiqueta: 'No evidenciado · sin configurar', icono: 'gear', color: '#F5A700', badgeColor: 'warning', accion: 'Declarar la decisión', responsable: 'Responsable ENS', orden: 3 };
  }
  if (item.cause === 'COLLECTION') {
    return { etiqueta: 'No evidenciado · sin recogida', icono: 'offline', color: '#0077CC', badgeColor: 'primary', accion: 'Restablecer la recogida', responsable: 'Operación Wazuh', orden: 4 };
  }
  return { etiqueta: 'No evidenciado · evidencia insuficiente', icono: 'alert', color: '#F5A700', badgeColor: 'warning', accion: 'Habilitar la prueba', responsable: 'Productor de la evidencia', orden: 5 };
};
