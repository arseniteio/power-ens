import { ENSControlDefinition } from './types';

export const opAcc5CatalogDefinition: ENSControlDefinition = {
  id: 'op.acc.5',
  name: 'Mecanismo de autenticación (usuarios externos)',
  family: 'Marco operacional',
  category: 'Control de acceso',
  dimension: 'Confidencialidad, Integridad, Trazabilidad y Autenticidad',
  // Annex II applies op.acc.5 by the levels of C, I, T and A, not the system category: the highest of them rules.
  levelDimension: ['C', 'I', 'T', 'A'],
  description:
    'op.acc.5 regula la autenticación de usuarios que NO pertenecen a la organización: ciudadanos, empresas, terceros autorizados. Los refuerzos R1 a R4 son una elección declarada en P-01, no una acumulación: solo cuenta el elegido, y R1 no es admisible desde nivel MEDIO.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  annexSection: '4.2.5',
  source: { template: 'ENSFacil_Plantilla_op.acc.5', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.acc.5.1',
      title: 'Registro fidedigno previo a la entrega',
      description:
        'Antes de proporcionar las credenciales de autenticación a las entidades, usuarios o procesos, estos deberán haberse identificado y registrado de manera fidedigna ante el sistema o ante un Prestador Cualificado de Servicios de Confianza o un proveedor de identidad electrónica reconocido por las administraciones públicas, de conformidad con lo dispuesto en la Ley 39/2015, de 1 de octubre.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: ['P-02'],
    },
    {
      id: 'op.acc.5.2',
      title: 'Acuse de recibo y deber de custodia',
      description:
        'Antes de activar el mecanismo de autenticación, el usuario reconocerá que las ha recibido y que conoce y acepta las obligaciones que implica su tenencia, en particular, el deber de custodia diligente, la protección de su confidencialidad y el deber de notificación inmediata en caso de pérdida.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.5.3',
      title: 'Credencial bajo control exclusivo del usuario',
      description:
        'Las credenciales estarán bajo el control exclusivo del usuario y se activarán una vez estén bajo su control efectivo.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.5.4',
      title: 'Cambio periódico de credenciales',
      description:
        'Las credenciales se cambiarán con una periodicidad marcada por la política de seguridad de la organización.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-04'],
      parameterIds: ['P-05'],
    },
    {
      id: 'op.acc.5.5',
      title: 'Inhabilitación ante compromiso',
      description:
        'Las credenciales serán inhabilitadas —pudiendo ser regeneradas, en su caso—, cuando conste o se sospeche su pérdida, compromiso o revelación a entidades (personas, equipos o procesos) no autorizadas.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-06'],
    },
    {
      id: 'op.acc.5.6',
      title: 'Inhabilitación al terminar la relación',
      description:
        'Las credenciales serán inhabilitadas cuando la entidad (persona, equipo o proceso) que autentican termina su relación con el sistema.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-06'],
    },
    {
      id: 'op.acc.5.7',
      title: 'Autenticación que no revela información',
      description:
        'Antes de autorizar el acceso, la información presentada por el sistema será la mínima imprescindible para que el usuario se autentique, evitando todo aquello que pueda, directa o indirectamente, revelar información sobre el sistema o la cuenta, sus características, su operación o su estado. Las credenciales solamente se validarán cuando se tengan todos los datos necesarios y, si se rechaza, no se informará del motivo del rechazo.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-02'],
    },
    {
      id: 'op.acc.5.8',
      title: 'Límite de intentos y reactivación',
      description:
        'El número de intentos permitidos será limitado, bloqueando la oportunidad de acceso una vez superado tal número, y requiriendo una intervención específica para reactivar la cuenta, que se describirá en la documentación.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02', 'EV-03'],
      parameterIds: ['P-02', 'P-03', 'P-04'],
    },
    {
      id: 'op.acc.5.9',
      title: 'Información de derechos y obligaciones',
      description:
        'El sistema informará al usuario de sus derechos u obligaciones inmediatamente después de obtener el acceso.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.5.r1.1',
      title: 'Contraseña como mecanismo (R1)',
      description:
        'Se empleará una contraseña como mecanismo de autenticación.',
      kind: 'REFUERZO',
      // At the THREE levels on purpose, although R1 is admissible only at BAJO: otherwise a MEDIO system declaring R1 in P-01 would see this requirement NO_APLICA by level and the direct noncompliance ENS demands would have nowhere to land.
      // Which reinforcement counts is decided by the control policy with P-01: outside the chosen one, NO_APLICA; chosen at MEDIO or ALTO, NO_CUMPLE.
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Refuerzo R1: solo cuenta si P-01 lo declara, y solo es admisible en nivel BAJO.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.5.r1.2',
      title: 'Complejidad mínima de la contraseña (R1)',
      description:
        'Se impondrán normas de complejidad mínima y robustez frente a ataques de adivinación (ver guías CCN-STIC).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Refuerzo R1: solo cuenta si P-01 lo declara, y solo es admisible en nivel BAJO.',
      },
      evidenceIds: ['EV-02'],
      parameterIds: ['P-01', 'P-03'],
    },
    {
      id: 'op.acc.5.r2.1',
      title: 'Segundo factor OTP (R2)',
      description:
        'Se requerirá una contraseña de un solo uso (OTP, en inglés) como complemento a la contraseña de usuario.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason: 'Refuerzo R2: solo cuenta si P-01 lo declara.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.5.r3.1',
      title: 'Certificado cualificado (R3)',
      description:
        'Se emplearán certificados cualificados como mecanismo de autenticación.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Refuerzo R3: solo cuenta si P-01 lo declara.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-01', 'P-07'],
    },
    {
      id: 'op.acc.5.r3.2',
      title: 'Segundo factor sobre el certificado (R3)',
      description:
        'El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Refuerzo R3: solo cuenta si P-01 lo declara.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.5.r3.3',
      title: 'Registro previo cualificado (R3)',
      description:
        'Las credenciales utilizadas deberán haber sido obtenidas tras un registro previo presencial, o bien telemático, usando un certificado electrónico cualificado.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Refuerzo R3: solo cuenta si P-01 lo declara. Documental: se acredita en P-ATT.',
      },
      evidenceIds: [],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.5.r4.1',
      title: 'Certificado en soporte físico autorizado (R4)',
      description:
        'Se emplearán certificados cualificados como mecanismo de autenticación, en soporte físico (tarjeta o similar) usando algoritmos, parámetros y dispositivos autorizados por el CCN.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Refuerzo R4: solo cuenta si P-01 lo declara.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-01', 'P-07'],
    },
    {
      id: 'op.acc.5.r4.2',
      title: 'Segundo factor sobre el certificado (R4)',
      description:
        'El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Refuerzo R4: solo cuenta si P-01 lo declara.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.5.r4.3',
      title: 'Registro previo cualificado (R4)',
      description:
        'Las credenciales utilizadas deberán haber sido obtenidas tras un registro previo presencial, o bien telemático, usando certificado electrónico cualificado.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Refuerzo R4: solo cuenta si P-01 lo declara. Documental: se acredita en P-ATT.',
      },
      evidenceIds: [],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.5.r5.1',
      title: 'Registro de accesos con éxito y fallidos (R5)',
      description:
        'Se registrarán los accesos con éxito y los fallidos.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-01', 'EV-09'],
      parameterIds: ['P-02', 'P-08'],
    },
    {
      id: 'op.acc.5.r5.2',
      title: 'Aviso del último acceso efectuado (R5)',
      description:
        'Se informará al usuario del último acceso efectuado con su identidad.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Documental: P-09 declara la funcionalidad y P-ATT la acredita.',
      },
      evidenceIds: [],
      parameterIds: ['P-09'],
    },
    {
      id: 'op.acc.5.r6.1',
      title: 'Renovación de la autenticación (R6)',
      description:
        'Refuerzo R6 – Limitación de la ventana de acceso: Se definirán aquellos puntos en los que el sistema requerirá una renovación de la autenticación del usuario, mediante identificación singular, no bastando con la sesión establecida.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'R6 no es obligatorio en ningún nivel de op.acc.5 (sí en op.acc.6 ALTO): fuera del denominador.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.5.r7.1',
      title: 'Suspensión por no utilización (R7)',
      description:
        'Refuerzo R7 – Suspensión por no utilización: Las credenciales se suspenderán tras un periodo definido de no utilización.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'R7 no es obligatorio en ningún nivel de op.acc.5 (sí en op.acc.6 ALTO): fuera del denominador.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
  ],
};
