import { ENSControlDefinition } from './types';

export const opAcc6CatalogDefinition: ENSControlDefinition = {
  id: 'op.acc.6',
  name: 'Mecanismo de autenticación (usuarios de la organización)',
  family: 'Marco operacional',
  category: 'Control de acceso',
  // The OSCompliance engine judges every machine that sends facts, the manager included.
  measurementPlanes: ['agent', 'manager'],
  dimension: 'Confidencialidad, Integridad, Trazabilidad y Autenticidad',
  // Annex II applies op.acc.6 by the levels of C, I, T and A, not the system category: the highest of them rules.
  levelDimension: ['C', 'I', 'T', 'A'],
  description:
    'op.acc.6 exige un mecanismo de autenticación para el personal de la organización: UNO de cuatro refuerzos (contraseña solo desde zona controlada, contraseña con segundo factor, certificado o certificado en soporte físico), doble factor desde zona no controlada y acceso remoto autorizado, cifrado y auditado desde nivel BAJO, registro de accesos desde MEDIO, y reautenticación y suspensión por no uso en ALTO.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  annexSection: '4.2.6',
  source: { template: 'ENSFacil_Plantilla_op.acc.6', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.acc.6.1',
      title: 'Aceptación previa de la política de seguridad',
      description:
        'Antes de proporcionar las credenciales a los usuarios, estos deberán conocer y aceptar la política de seguridad del organismo en los aspectos que les afecten.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.6.2',
      title: 'Acuse de recibo y obligaciones de custodia',
      description:
        'Antes de activar el mecanismo de autenticación, el usuario reconocerá que ha recibido las credenciales de acceso y que conoce y acepta las obligaciones que implica su tenencia, en particular, el deber de custodia diligente, la protección de su confidencialidad y el deber de notificación inmediata en caso de pérdida.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.6.3',
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
      id: 'op.acc.6.4',
      title: 'Cambio periódico de credenciales',
      description:
        'Las credenciales se cambiarán con una periodicidad marcada por la política de seguridad de la organización.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-04'],
    },
    {
      id: 'op.acc.6.5',
      title: 'Inhabilitación ante compromiso',
      description:
        'Las credenciales serán inhabilitadas —pudiendo ser regeneradas, en su caso—, cuando conste o se sospeche su pérdida, compromiso o revelación a entidades (personas, equipos o procesos) no autorizadas.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-06', 'P-12'],
    },
    {
      id: 'op.acc.6.6',
      title: 'Inhabilitación al cesar la relación',
      description:
        'Las credenciales serán inhabilitadas cuando el usuario que autentican termina su relación con el sistema.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-06', 'P-12'],
    },
    {
      id: 'op.acc.6.7',
      title: 'Rechazo que no revela el motivo',
      description:
        'Antes de autorizar el acceso, la información presentada por el sistema será la mínima imprescindible para que el usuario se autentique, evitando todo aquello que pueda, directa o indirectamente, revelar información sobre el sistema o la cuenta, sus características, su operación o su estado. Las credenciales solamente se validarán cuando se tengan todos los datos necesarios y, si se rechaza, no se informará del motivo del rechazo.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-12'],
      parameterIds: ['P-11'],
    },
    {
      id: 'op.acc.6.8',
      title: 'Límite de intentos con bloqueo efectivo',
      description:
        'El número de intentos permitidos será limitado, bloqueando la oportunidad de acceso una vez superado tal número, y requiriendo una intervención específica para reactivar la cuenta, que se describirá en la documentación.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03', 'EV-04'],
      parameterIds: ['P-05'],
    },
    {
      id: 'op.acc.6.9',
      title: 'Información de derechos tras el acceso',
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
      id: 'op.acc.6.r1.1',
      title: 'Contraseña solo desde zona controlada (R1)',
      description:
        'Se empleará una contraseña como mecanismo de autenticación cuando el acceso se realiza desde zonas controladas y sin atravesar zonas no controladas (véase refuerzo R8).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Rige solo si P-01 declara R1. Con otro refuerzo elegido se muestra NO_APLICA.',
      },
      evidenceIds: ['EV-02'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'op.acc.6.r1.2',
      title: 'Complejidad mínima de la contraseña (R1)',
      description:
        'Se impondrán normas de complejidad mínima y robustez frente a ataques de adivinación (ver guías CCN-STIC).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Rige solo si P-01 declara R1 o R2. Con R3 o R4 se muestra NO_APLICA.',
      },
      evidenceIds: ['EV-11'],
      parameterIds: ['P-01', 'P-10'],
    },
    {
      id: 'op.acc.6.r2.1',
      title: 'Segundo factor junto a la contraseña (R2)',
      description:
        'Se requerirá un segundo factor tal como «algo que se tiene», es decir, un dispositivo, una contraseña de un solo uso (OTP, en inglés) como complemento a la contraseña de usuario, o «algo que se es».',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Rige solo si P-01 declara R2. Con otro refuerzo elegido se muestra NO_APLICA.',
      },
      evidenceIds: ['EV-02'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'op.acc.6.r3.1',
      title: 'Certificado cualificado (R3)',
      description:
        'Se emplearán certificados cualificados como mecanismo de autenticación.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Rige solo si P-01 declara R3. Con otro refuerzo elegido se muestra NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.6.r3.2',
      title: 'Certificado protegido por PIN o biometría (R3)',
      description:
        'El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Rige solo si P-01 declara R3. Con otro refuerzo elegido se muestra NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.6.r4.1',
      title: 'Certificado en soporte físico autorizado (R4)',
      description:
        'Se emplearán certificados cualificados como mecanismo de autenticación, en soporte físico (tarjeta o similar) usando algoritmos, parámetros y dispositivos autorizados por el CCN.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Rige solo si P-01 declara R4. Con otro refuerzo elegido se muestra NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.6.r4.2',
      title: 'Soporte físico protegido por PIN o biometría (R4)',
      description:
        'El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        reason:
          'Rige solo si P-01 declara R4. Con otro refuerzo elegido se muestra NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.6.r5.1',
      title: 'Registro de accesos con éxito y fallidos (R5)',
      description:
        'Se registrarán los accesos con éxito y los fallidos.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-03'],
    },
    {
      id: 'op.acc.6.r5.2',
      title: 'Aviso del último acceso efectuado (R5)',
      description:
        'Se informará al usuario del último acceso efectuado con su identidad.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.6.r6.1',
      title: 'Reautenticación en operaciones críticas (R6)',
      description:
        'Se definirán aquellos puntos en los que el sistema requerirá una renovación de la autenticación del usuario, mediante identificación singular, no bastando con la sesión establecida.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-09'],
      parameterIds: ['P-08'],
    },
    {
      id: 'op.acc.6.r7.1',
      title: 'Suspensión por no utilización (R7)',
      description:
        'Las credenciales se suspenderán tras un periodo definido de no utilización.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-10'],
      parameterIds: ['P-09'],
    },
    {
      id: 'op.acc.6.r8.1',
      title: 'Doble factor desde zona no controlada (R8)',
      description:
        'Para el acceso desde o a través de zonas no controladas se requerirá un doble factor de autenticación: R2, R3 o R4.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02'],
      parameterIds: ['P-02'],
    },
    {
      id: 'op.acc.6.r9.1',
      title: 'Aplicación de la ITS de interconexión (R9)',
      description:
        'Será de aplicación la ITS de Interconexión de sistemas de información.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.6.r9.2',
      title: 'Acceso remoto autorizado, cifrado y auditado (R9)',
      description:
        'El acceso remoto deberá considerar los siguientes aspectos: a) Ser autorizado por la autoridad correspondiente. b) El tráfico deberá ser cifrado. c) Si la utilización no se produce de manera constante, el acceso remoto deberá encontrarse inhabilitado y habilitarse únicamente cuando sea necesario. d) Deberán recogerse registros de auditoría de este tipo de conexiones.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-07', 'EV-08'],
      parameterIds: ['P-07'],
    },
  ],
};
