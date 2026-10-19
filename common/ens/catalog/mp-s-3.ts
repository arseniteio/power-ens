import { ENSControlDefinition } from './types';

export const mpS3CatalogDefinition: ENSControlDefinition = {
  id: 'mp.s.3',
  name: 'Protección de la navegación web',
  family: 'Medidas de protección',
  category: 'Protección de los servicios',
  dimension: 'Todas',
  annexSection: '5.8.3',
  source: { template: 'ENSFacil_Plantilla_mp.s.3', version: '2.0', date: '2026-10-15' },
  description:
    'mp.s.3 protege la navegación de los usuarios internos.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.s.3.1',
      title: 'Normativa de utilización de la navegación',
      description:
        'Se establecerá una normativa de utilización, definiendo el uso que se autoriza y las limitaciones de uso personal. En particular, se concretará el uso permitido de conexiones cifradas.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-12'],
      parameterIds: ['P-01'],
    },
    {
      id: 'mp.s.3.2',
      title: 'Concienciación regular sobre higiene en la navegación',
      description:
        'Se llevarán a cabo regularmente actividades de concienciación sobre higiene en la navegación web, fomentando el uso seguro y alertando de usos incorrectos.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-12'],
      parameterIds: ['P-06'],
    },
    {
      id: 'mp.s.3.3',
      title: 'Formación de los administradores en monitorización y respuesta',
      description:
        'Se formará al personal encargado de la administración del sistema en monitorización del servicio y respuesta a incidentes.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-12'],
      parameterIds: ['P-07'],
    },
    {
      id: 'mp.s.3.4',
      title: 'Protección de la resolución de nombres y de las conexiones',
      description:
        'Se protegerá la información de resolución de direcciones web y de establecimiento de conexiones.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05', 'EV-11'],
      parameterIds: ['P-04'],
    },
    {
      id: 'mp.s.3.5',
      title: 'Protección frente a problemas que llegan por la navegación',
      description:
        'Se protegerá a la organización en general y al puesto de trabajo en particular frente a problemas que se materializan vía navegación web.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-06', 'EV-11'],
      parameterIds: ['P-02', 'P-03'],
    },
    {
      id: 'mp.s.3.6',
      title: 'Protección frente a código dañino y contenido activo',
      description:
        'Se protegerá contra la actuación de programas dañinos tales como páginas activas, descargas de código ejecutable, etc., previniendo la exposición del sistema a vectores de ataque del tipo spyware, ransomware, etc.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-06'],
      parameterIds: ['P-02', 'P-03'],
    },
    {
      id: 'mp.s.3.7',
      title: 'Política ejecutiva de control de cookies',
      description:
        'Se establecerá una política ejecutiva de control de cookies, en particular, para evitar la contaminación entre uso personal y uso organizativo.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-05'],
    },
    {
      id: 'mp.s.3.r1.1',
      title: 'Registro del uso de la navegación con su retención',
      description:
        'Se registrará el uso de la navegación web, estableciendo los elementos que se registran, el periodo de retención de estos registros y el uso que el organismo prevé hacer de ellos.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-08'],
    },
    {
      id: 'mp.s.3.r1.2',
      title: 'Inspección de canales cifrados con exclusiones declaradas',
      description:
        'Se establecerá una función para la ruptura de canales cifrados a fin de inspeccionar su contenido, indicando qué se analiza, qué se registra, durante cuánto tiempo se retienen los registros y qué uso prevé hacer el organismo de estas inspecciones. Todo ello sin perjuicio de que se puedan autorizar accesos cifrados singulares a destinos de confianza.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-09'],
      parameterIds: ['P-09'],
    },
    {
      id: 'mp.s.3.r1.3',
      title: 'Lista negra de destinos vetados',
      description:
        'Se establecerá una lista negra de destinos vetados.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-10'],
      parameterIds: ['P-10'],
    },
    {
      id: 'mp.s.3.r2.1',
      title: 'Lista blanca de destinos accesibles',
      description:
        'Refuerzo R2 – Destinos autorizados: Se establecerá una lista blanca de destinos accesibles. Todo acceso fuera de los lugares señalados en la lista blanca estará vetado, salvo autorización singular expresa.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ninguna categoría (Anexo II): no aplica.',
      },
      evidenceIds: [],
      parameterIds: ['P-11'],
    },
  ],
};
