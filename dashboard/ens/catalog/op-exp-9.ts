import { ENSControlDefinition } from './types';

export const opExp9CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.9',
  name: 'Registro de la gestión de incidentes',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'op.exp.9 no pide gestionar incidentes —eso es op.exp.7— sino dejar constancia registral de cómo se gestionaron, con una exigencia añadida de calado jurídico: que la evidencia sirva en sede jurisdiccional.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.9.1',
      title: 'Reportes, actuaciones y cambios del incidente registrados',
      description:
        'Se registrarán los reportes iniciales, intermedios y finales de los incidentes, las actuaciones de emergencia y las modificaciones del sistema derivadas del incidente.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-09'],
      parameterIds: ['P-01', 'P-02', 'P-08', 'P-09'],
    },
    {
      id: 'op.exp.9.2',
      title: 'Evidencias con valor jurisdiccional registradas',
      description:
        'Se registrará aquella evidencia que pueda dirimirse en un ámbito jurisdiccional, especialmente cuando el incidente pueda comportar acciones disciplinarias sobre el personal interno, sobre proveedores externos o en la persecución de delitos. En la determinación de la composición y detalle de estas evidencias, se recurrirá a asesoramiento legal especializado.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05', 'EV-06', 'EV-07', 'EV-09'],
      parameterIds: ['P-03', 'P-04', 'P-05', 'P-06'],
    },
    {
      id: 'op.exp.9.3',
      title: 'Eventos auditables revisados tras los incidentes',
      description:
        'Como consecuencia del análisis de los incidentes, se revisará la determinación de los eventos auditables.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-08', 'EV-09'],
      parameterIds: ['P-07'],
    },
  ],
};
