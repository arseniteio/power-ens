import { ENSControlDefinition } from './types';

export const opNub1CatalogDefinition: ENSControlDefinition = {
  id: 'op.nub.1',
  name: 'Protección de servicios en la nube',
  family: 'Marco operacional',
  category: 'Servicios en la nube',
  dimension: 'Todas',
  // Se mide SOLO en el manager: la configuración de los módulos cloud de Wazuh,
  // sus alertas y sus errores están en el sistema central. La credencial del
  // proveedor vive en un agente dedicado del cliente, y sus registros llegan al
  // manager como alertas. Lo documental lo juzga la policy con las tablas de la
  // pantalla. Su resultado es el de la fila del manager (000).
  measurementPlanes: ['manager'],
  description:
    'op.nub.1 es mayoritariamente contractual: la conformidad y la certificación del proveedor, su pentest, la jurisdicción de los datos y el cifrado se declaran en la pantalla con su vigencia y se acreditan documentalmente. La parte técnica es la integración de los servicios en la nube con Wazuh (módulo configurado, registros que entran, errores, operaciones administrativas y accesos), medida en el manager sin credenciales.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  // Las evidencias de cada requisito son las del diseño (spec 2026-10-09 §4.3),
  // no las que la plantilla asocia. op.nub.1.1 (prestador) y op.nub.1.r1.2
  // (op.pl.5) son documentales sin evidencia técnica: la policy juzga sus
  // tablas (P-03, P-05) con su vigencia y los saca del juego (NO_APLICA) cuando
  // P-01 o P-05 lo dicen. Sin P-ATT (decisión 1 del responsable). EV-03,
  // EV-05 y EV-06 son datos del informe, sin requisito que las juzgue: Wazuh
  // 4.14 no tiene «SCA cloud» ni ve el tráfico hacia la nube. EV-07 (accesos
  // sin segundo factor) es un hallazgo cruzado con op.acc.6.r8.1, que lo juzga.
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
      // Documental: solo si P-01 = prestador o ambos. Lo acredita la
      // conformidad en vigor de cada servicio prestado (P-03), no P-ATT.
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
      // EV-09 es el expediente documental (acreditado con `attested`); EV-01 y
      // EV-04 son la medida técnica de los servicios utilizados que P-06
      // integra, y una medida en contra manda sobre el documento. EV-07 (el
      // segundo factor) es un hallazgo del informe: lo juzga op.acc.6.r8.1.
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
      // Documental: ENSFácil no tiene op.pl.5. NO_APLICA con P-05 = «ninguno»;
      // con servicios, la verificación de op.pl.5 de cada uno en vigor (P-05).
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
