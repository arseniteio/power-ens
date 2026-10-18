// QUÉ CLASE DE INCUMPLIMIENTO ES, DE QUIÉN ES EL ARREGLO Y DE QUÉ COLOR VA.
//
// Un solo sitio para las tres cosas, porque las tres tienen que decir lo
// mismo: la franja de la tarjeta, la insignia, la acción y la cola de trabajo de
// la Vista general salen de aquí. La distinción medido / no evidenciado no se
// explica en prosa —restan igual—, se ve en el color y en la etiqueta, y la
// causa del no evidenciado va como etiqueta, no como frase. Sin React.
export interface ClaseNoConformidad {
  color: string;
  badgeColor: 'danger' | 'default' | 'warning' | 'primary';
  icono: string;
  etiqueta: string;
  accion: string;
  responsable: string;
  // Orden de la cola de trabajo: primero lo que hay que corregir.
  orden: number;
}

export const classifyNonConformity = (
  item: { origin?: string; cause?: string; documental?: boolean },
  // ¿Está el control en la configuración activa? Si no, lo que hay que hacer
  // primero es añadirlo, sea cual sea la causa del hueco (salvo el catálogo,
  // que es del producto): la misma regla que el motor en el hallazgo.
  options: { controlConfigured?: boolean } = {}
): ClaseNoConformidad => {
  if (options.controlConfigured === false && item.origin !== 'MEDIDA' && item.cause !== 'CATALOG') {
    return { etiqueta: 'No evidenciado · control sin añadir', icono: 'gear', color: '#F5A700', badgeColor: 'warning', accion: 'Añadir el control a la configuración', responsable: 'Responsable ENS', orden: 3 };
  }
  // Demostrado, pero sobre una DECLARACIÓN (un contrato o una certificación
  // vencida o ausente): no hay nada que corregir en la máquina.
  if (item.origin === 'MEDIDA' && item.documental) {
    return { etiqueta: 'Declarado (documental)', icono: 'document', color: '#BD271E', badgeColor: 'danger', accion: 'Renovar o completar la documentación', responsable: 'Organización (contratos y proveedores)', orden: 2 };
  }
  if (item.origin === 'MEDIDA') {
    return { etiqueta: 'Medido', icono: 'inspect', color: '#BD271E', badgeColor: 'danger', accion: 'Corregir la máquina', responsable: 'Sistema auditado', orden: 1 };
  }
  if (item.cause === 'CATALOG') {
    return { etiqueta: 'No evidenciado · catálogo', icono: 'package', color: '#98A2B3', badgeColor: 'default', accion: 'Declarar la evidencia', responsable: 'Producto ENSFácil', orden: 6 };
  }
  if (item.cause === 'CONFIGURATION') {
    return { etiqueta: 'No evidenciado · sin configurar', icono: 'gear', color: '#F5A700', badgeColor: 'warning', accion: 'Declarar la decisión', responsable: 'Responsable ENS', orden: 3 };
  }
  if (item.cause === 'COLLECTION') {
    return { etiqueta: 'No evidenciado · sin recogida', icono: 'offline', color: '#0077CC', badgeColor: 'primary', accion: 'Restablecer la recogida', responsable: 'Operación Wazuh', orden: 4 };
  }
  return { etiqueta: 'No evidenciado · evidencia insuficiente', icono: 'alert', color: '#F5A700', badgeColor: 'warning', accion: 'Habilitar la prueba', responsable: 'Productor de la evidencia', orden: 5 };
};
