import { ENSControlDefinition } from './types';

export const opNub1CatalogDefinition: ENSControlDefinition = {
  id: 'op.nub.1',
  name: 'Protección de servicios en la nube',
  family: 'Marco operacional',
  category: 'Servicios en la nube',
  dimension: 'Todas',
  // Measured ONLY on the manager: the configuration of Wazuh cloud modules, their alerts and errors are in the central system. The provider credential lives in a dedicated agent of the client. The policy judges the documentary part with the screen tables. Result is the manager row's (000).
  measurementPlanes: ['manager'],
  description:
    'op.nub.1 es mayoritariamente contractual: la conformidad y la certificación del proveedor, su pentest, la jurisdicción de los datos y el cifrado se declaran en la pantalla con su vigencia y se acreditan documentalmente. La parte técnica es la integración de los servicios en la nube con Wazuh (módulo configurado, registros que entran, errores, operaciones administrativas y accesos), medida en el manager sin credenciales.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  annexSection: '4.5.1',
  source: { template: 'PowerENS_Plantilla_op.nub.1', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  // The evidences of each requirement are the design's, not the template's. op.nub.1.1 (provider) and op.nub.1.r1.2 (op.pl.5) are documentary without technical evidence: the policy judges their tables (P-03, P-05) and takes them out of play (NO_APLICA) when P-01 or P-05 say so. No P-ATT.
  // EV-03, EV-05 and EV-06 are report data with no requirement judging them: Wazuh 4.14 has no "SCA cloud" nor sees cloud traffic. EV-07 (accesses without second factor) is a finding crossed with op.acc.6.r8.1, which judges it.
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
      // Documentary: only if P-01 = provider or both. Accredited by the in-force conformity of each service provided (P-03), not P-ATT.
      evidenceIds: [],
      parameterIds: ['P-01', 'P-02', 'P-03'],
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
      // EV-09 is the documentary file (accredited with `attested`); EV-01 and EV-04 are the technical measure of the services in use that P-06 integrates, and a measure against rules over the document. EV-07 is a report finding judged by op.acc.6.r8.1.
      evidenceIds: ['EV-01', 'EV-04', 'EV-09'],
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
          'Exigible en MEDIA y ALTA. En categoría BÁSICA no aplica.',
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
          'Exigible en MEDIA y ALTA. En categoría BÁSICA no aplica.',
      },
      // Documentary: Power ENS has no op.pl.5. NO_APLICA with P-05 = "ninguno"; with services, the in-force op.pl.5 verification of each one (P-05).
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
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      evidenceIds: ['EV-02'],
      parameterIds: ['P-06', 'P-07'],
    },
  ],
};
