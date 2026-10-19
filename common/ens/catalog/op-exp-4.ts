import { ENSControlDefinition } from './types';

export const opExp4CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.4',
  name: 'Mantenimiento y actualizaciones de seguridad',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'op.exp.4 es el control de gestión de vulnerabilidades y parcheado, y Wazuh lo cubre muy bien a través del Vulnerability Detector, que cruza el inventario de Syscollector con los feeds de CVE de los fabricantes y bases públicas.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  annexSection: '4.3.4',
  source: { template: 'ENSFacil_Plantilla_op.exp.4', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.4.1',
      title: 'Vigilancia de los anuncios del fabricante',
      description:
        'Se atenderá a las especificaciones de los fabricantes en lo relativo a instalación y mantenimiento de los sistemas, lo que incluirá un seguimiento continuo de los anuncios de defectos.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-03', 'EV-05', 'EV-06'],
      parameterIds: ['P-01', 'P-03', 'P-05'],
    },
    {
      id: 'op.exp.4.2',
      title: 'Plazos de actualización según el riesgo',
      description:
        'Se dispondrá de un procedimiento para analizar, priorizar y determinar cuándo aplicar las actualizaciones de seguridad, parches, mejoras y nuevas versiones. La priorización tendrá en cuenta la variación del riesgo en función de la implantación o no de la actualización.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-07', 'EV-10'],
      parameterIds: ['P-01', 'P-04', 'P-08'],
    },
    {
      id: 'op.exp.4.3',
      title: 'Mantenimiento por personal autorizado',
      description:
        'El mantenimiento solo podrá realizarse por personal debidamente autorizado.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-04'],
      parameterIds: ['P-02'],
    },
    {
      id: 'op.exp.4.r1.1',
      title: 'Prueba previa en preproducción (R1)',
      description:
        'Antes de poner en producción una nueva versión o una versión parcheada, se comprobará en un entorno de prueba controlado y consistente en configuración al entorno de producción, que la nueva instalación funciona correctamente y no disminuye la eficacia de las funciones necesarias para el trabajo diario.',
      kind: 'REFUERZO',
      // CUMULATIVE reinforcement: the sheet requires it at MEDIA "+ R1" and at ALTA "+ R1 + R2". The generator had left it at ALTO only.
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'R1 es exigible en MEDIO y ALTO. En BAJO se muestra como NO_APLICA.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-06'],
    },
    {
      id: 'op.exp.4.r2.1',
      title: 'Mecanismo de reversión previsto (R2)',
      description:
        'Antes de la aplicación de las configuraciones, parches y actualizaciones de seguridad se preverá un mecanismo para revertirlos en caso de aparición de efectos adversos.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'R2 es exigible solo en ALTO. En BAJO y MEDIO se muestra como NO_APLICA.',
      },
      evidenceIds: ['EV-09'],
      parameterIds: ['P-07'],
    },
    {
      id: 'op.exp.4.r3.1',
      title: 'Integridad periódica del firmware (R3)',
      description:
        'Refuerzo R3 – Actualizaciones y pruebas periódicas: Se deberá comprobar de forma periódica la integridad del firmware utilizado en los dispositivos hardware del sistema (infraestructura de red, BIOS, etc.). La periodicidad de estas comprobaciones seguirá las recomendaciones de la Guía CCN-STIC que sea de aplicación.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'El ENS define este refuerzo pero no lo exige en ninguna categoría: se muestra como NO_APLICA en los tres niveles.',
      },
      evidenceIds: ['EV-11'],
      parameterIds: ['P-09'],
    },
    {
      id: 'op.exp.4.r4.1',
      title: 'Monitorización continua de amenazas (R4)',
      description:
        'Refuerzo R4 – Monitorización continua: Se desplegará a nivel de sistema una estrategia de monitorización continua de amenazas y vulnerabilidades. Esta estrategia detallará: 1. Los indicadores críticos de seguridad a emplear. 2. La política de aplicación de parches de seguridad de los componentes software relacionados en las listas de [op.exp.1.r4], [op.ext.3.r3] y [mp.sw.1.r5]. 3. Los criterios de revisión regular y excepcional de las amenazas sobre el sistema.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'El ENS define este refuerzo pero no lo exige en ninguna categoría: se muestra como NO_APLICA en los tres niveles.',
      },
      evidenceIds: ['EV-01', 'EV-10'],
      parameterIds: [],
    },
  ],
};
