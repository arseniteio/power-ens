import { ENSControlDefinition } from './types';

export const mpS2CatalogDefinition: ENSControlDefinition = {
  id: 'mp.s.2',
  name: 'Protección de servicios y aplicaciones web',
  family: 'Medidas de protección',
  category: 'Protección de los servicios',
  dimension: 'Todas',
  annexSection: '5.8.2',
  source: { template: 'ENSFacil_Plantilla_mp.s.2', version: '2.0', date: '2026-10-15' },
  description:
    'mp.s.2 enumera seis amenazas web concretas que deben prevenirse, y todas dejan rastro en los registros del servidor.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.s.2.1',
      title: 'Imposible acceder a la información obviando la autenticación',
      description:
        'Cuando la información requiera control de acceso se garantizará la imposibilidad de acceder a la información obviando la autenticación, en particular, tomando medidas en los siguientes aspectos: a) Se evitará que el servidor ofrezca acceso a los documentos por vías alternativas al protocolo determinado. b) Se prevendrán ataques de manipulación del localizador uniforme de recursos (URL). c) Se prevendrán ataques de manipulación de fragmentos de información que se almacena en el disco duro del visitante de una página web a través de su navegador, a petición del servidor de la página, conocido en terminología inglesa como cookies. d) Se prevendrán ataques de inyección de código.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-05'],
    },
    {
      id: 'mp.s.2.2',
      title: 'Prevención del escalado de privilegios',
      description:
        'Se prevendrán intentos de escalado de privilegios.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-07', 'EV-09'],
      parameterIds: ['P-02'],
    },
    {
      id: 'mp.s.2.3',
      title: 'Prevención del cross site scripting',
      description:
        'Se prevendrán ataques de cross site scripting.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-08', 'EV-09'],
      parameterIds: ['P-02'],
    },
    {
      id: 'mp.s.2.r1.1',
      title: 'Auditorías de caja negra antes de producción',
      description:
        'Se realizarán auditorías continuas de seguridad de «caja negra» sobre las aplicaciones web durante la fase de desarrollo y antes de la fase de producción.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO'],
        reason:
          'Exigible en BAJO y MEDIO. Para ALTO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-11'],
      parameterIds: ['P-07', 'P-08'],
    },
    {
      id: 'mp.s.2.r1.2',
      title: 'Frecuencia de auditoría definida en el procedimiento',
      description:
        'La frecuencia de estas auditorías de seguridad quedará definida en el procedimiento de auditoría.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO'],
        reason:
          'Exigible en BAJO y MEDIO. Para ALTO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-11'],
      parameterIds: ['P-06'],
    },
    {
      id: 'mp.s.2.r2.1',
      title: 'Auditorías de caja blanca durante el desarrollo',
      description:
        'Se realizarán auditorías de seguridad de «caja blanca» sobre las aplicaciones web durante la fase de desarrollo.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-11'],
      parameterIds: ['P-07', 'P-08'],
    },
    {
      id: 'mp.s.2.r2.2',
      title: 'Metodologías y herramientas automáticas de detección',
      description:
        'Se emplearán metodologías definidas y herramientas automáticas de detección de vulnerabilidades en la realización de las auditorías de seguridad sobre las aplicaciones web.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-10', 'EV-11'],
      parameterIds: ['P-08'],
    },
    {
      id: 'mp.s.2.r2.3',
      title: 'Resolución de las vulnerabilidades encontradas',
      description:
        'Una vez finalizada una auditoría de seguridad, se analizarán los resultados y se solventarán las vulnerabilidades encontradas mediante los procedimientos definidos [op.exp.5].',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-12'],
      parameterIds: ['P-09'],
    },
    {
      id: 'mp.s.2.r3.1',
      title: 'Protección de proxies y cachés',
      description:
        'Se prevendrán ataques de manipulación de programas o dispositivos que realizan una acción en representación de otros, conocidos en terminología inglesa como «proxies» y, sistemas especiales de almacenamiento de alta velocidad, conocidos en terminología inglesa como «cachés».',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-13'],
      parameterIds: ['P-10'],
    },
  ],
};
