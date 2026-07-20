/*
 * Wazuh app - Module for ENS requirements
 */
export const ensRequirementsFile = {
  'mp.info.6.1':
    'Copias de seguridad - Se realizan copias de seguridad que permiten recuperar datos perdidos accidental o intencionadamente.',
  'mp.info.6.2.a':
    'Frecuencia de las copias - La periodicidad de las copias está configurada y se cumple.',
  'mp.info.6.2.b':
    'Almacenamiento local - Existencia e integridad técnica de las rutas locales de backup.',
  'mp.info.6.2.c':
    'Almacenamiento en otros lugares - Evidencias indirectas de almacenamiento alternativo.',
  'mp.info.6.2.d':
    'Acceso autorizado a las copias - Controles técnicos de acceso, keyfile y permisos.',
  'mp.info.6.r1.1':
    'Prueba de restauración regular - Restore real desde copia con comprobación md5sum.',
  'mp.info.6.r2.1':
    'Copia separada - Requisito R2/ALTO. Copia en ubicación separada.',
  'op.acc.1.1':
    'Identificador único válido - Cada entidad usa un identificador único; no se admiten cuentas genéricas o compartidas.',
  'op.acc.1.2':
    'Identificadores singulares por rol - Cada rol de un usuario recibe un identificador singular con privilegios delimitados.',
  'op.acc.1.3':
    'Identificador singular por entidad - Cada entidad que accede al sistema cuenta con un identificador singular y trazable.',
  'op.acc.1.4':
    'Gestión del ciclo de vida de las cuentas - Las cuentas se inhabilitan al cese en plazo y se retienen para trazabilidad.',
  'op.acc.1.5':
    'Identificación en comunicaciones electrónicas (eIDAS) - Identificación conforme a eIDAS con el nivel de aseguramiento correspondiente.',
  'op.acc.1.r1.1':
    'Singularización de la persona - La identificación permite singularizar a la persona y sus responsabilidades en el sistema.',
  'op.acc.1.r1.2':
    'Identificación ligada a privilegios - Los datos de identificación determinan los privilegios conforme a la política de control de acceso.',
  'op.acc.1.r1.3':
    'Lista actualizada de usuarios autorizados - Existe una lista de usuarios autorizados contra la que se contrastan las cuentas activas.',
  'op.acc.2.1':
    'Protección de recursos - Los recursos del sistema se protegen con mecanismos que impiden su uso salvo a entidades con derechos suficientes.',
  'op.acc.2.2':
    'Derechos según responsable - Los derechos de acceso se establecen según las decisiones del responsable del recurso y la política de seguridad.',
  'op.acc.2.3':
    'Control de acceso al SO - Se controla el acceso a los componentes del sistema operativo y sus ficheros o registros de configuración.',
  'op.acc.2.r1.1':
    'Privilegios individuales - Cada usuario autorizado tiene un conjunto de privilegios mantenido individualmente (R1/ALTO).',
  'op.acc.2.r1.2':
    'Privilegios que restringen acceso - Los privilegios restringen el tipo de acceso: lectura, escritura, modificación, borrado (R1/ALTO).',
};
