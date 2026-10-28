import { ENSControlDefinition } from './types';

export const opExp2CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.2',
  name: 'Configuración de seguridad',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'op.exp.2 es el control de bastionado: exige que los equipos entren en operación ya configurados de forma segura.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  annexSection: '4.3.2',
  source: { template: 'PowerENS_Plantilla_op.exp.2', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.2.1',
      title: 'Retirada de cuentas y contraseñas estándar',
      description:
        'Se retiren cuentas y contraseñas estándar.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02'],
      parameterIds: ['P-01', 'P-03'],
    },
    {
      id: 'op.exp.2.2',
      title: 'Mínima funcionalidad en operación',
      description:
        'Se aplicará la regla de «mínima funcionalidad», es decir: a) El sistema debe proporcionar la funcionalidad mínima imprescindible para que la organización alcance sus objetivos. b) No proporcionará funciones injustificadas (de operación, administración o auditoría) al objeto de reducir al mínimo su perímetro de exposición, eliminándose o desactivándose aquellas funciones que sean innecesarias o inadecuadas al fin que se persigue.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-03', 'EV-06'],
      parameterIds: ['P-01', 'P-02', 'P-05'],
    },
    {
      id: 'op.exp.2.3',
      title: 'Seguridad por defecto',
      description:
        'Se aplicará la regla de «seguridad por defecto», es decir: a) Las medidas de seguridad serán respetuosas con el usuario y protegerán a éste, salvo que se exponga conscientemente a un riesgo. b) Para reducir la seguridad, el usuario tendrá que realizar acciones conscientes. c) El uso natural, en los casos que el usuario no ha consultado el manual, será un uso seguro.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-04', 'EV-06'],
      parameterIds: ['P-01', 'P-04', 'P-05'],
    },
    {
      id: 'op.exp.2.4',
      title: 'Máquinas virtuales con el mismo rigor',
      description:
        'Las máquinas virtuales estarán configuradas y gestionadas de un modo seguro. La gestión del parcheado, cuentas de usuarios, software antivirus, etc. se realizará como si se tratara de máquinas físicas, incluyendo la máquina anfitriona.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-06'],
    },
  ],
};
