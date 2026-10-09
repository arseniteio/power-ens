import { ENSControlDefinition } from './types';

export const opNub1CatalogDefinition: ENSControlDefinition = {
  id: 'op.nub.1',
  name: 'Protección de servicios en la nube',
  family: 'Marco operacional',
  category: 'Servicios en la nube',
  dimension: 'Todas',
  description:
    'op.nub.1 se acredita en dos planos.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.nub.1.1',
      title: 'Medidas del modelo de servicio prestado (prestador)',
      description:
        'Los sistemas que suministran un servicio en la nube a organismos del sector público deberán cumplir con el conjunto de medidas de seguridad en función del modelo de servicio en la nube que presten: Software como Servicio (Software as a Service, SaaS), Plataforma como Servicio (Platform as a Service, PaaS) e Infraestructura como Servicio (Infrastructure as a Service, IaaS) definidas en las guías CCN-STIC que sean de aplicación.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'op.nub.1.2',
      title: 'Conformidad de los servicios en la nube de terceros (usuario)',
      description:
        'Cuando se utilicen servicios en la nube suministrados por terceros, los sistemas de información que los soportan deberán ser conformes con el ENS o cumplir con las medidas desarrolladas en una guía CCN-STIC que incluirá, entre otros, requisitos relativos a: a) Auditoría de pruebas de penetración (pentesting). b) Transparencia. c) Cifrado y gestión de claves. d) Jurisdicción de los datos.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-04', 'EV-07', 'EV-09'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-06', 'P-08', 'P-09', 'P-10', 'P-11', 'P-12', 'P-13'],
    },
    {
      id: 'op.nub.1.r1.1',
      title: 'Servicios de terceros certificados (R1)',
      description:
        'Cuando se utilicen servicios en la nube suministrados por terceros, estos deberán estar certificados bajo una metodología de certificación reconocida por el Organismo de Certificación del Esquema Nacional de Evaluación y Certificación de Seguridad de las Tecnologías de la Información.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-02', 'P-04'],
    },
    {
      id: 'op.nub.1.r1.2',
      title: 'Servicios cloud de seguridad conformes con op.pl.5 (R1)',
      description:
        'Si el servicio en la nube es un servicio de seguridad deberá cumplir con los requisitos establecidos en [op.pl.5].',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: ['P-05'],
    },
    {
      id: 'op.nub.1.r2.1',
      title: 'Configuración según la guía CCN-STIC específica (R2)',
      description:
        'La configuración de seguridad de los sistemas que proporcionan estos servicios deberá realizarse según la correspondiente guía CCN-STIC de Configuración de Seguridad Específica, orientadas tanto al usuario como al proveedor.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-02'],
      parameterIds: ['P-06', 'P-07'],
    },
  ],
};
