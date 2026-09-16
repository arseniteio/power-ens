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
  'op.acc.3.1':
    'Siempre que sea posible, las capacidades de desarrollo y operación no recaerán en la misma persona.',
  'op.acc.3.2':
    'Siempre que sea posible, las personas que autorizan y controlan el uso serán distintas.',
  'op.acc.3.r1.1':
    'Siempre que sea posible, la misma persona no aunará funciones de configuración y mantenimiento del sistema.',
  'op.acc.3.r1.2':
    'La misma persona no puede aunar funciones de auditoría o supervisión con cualquier otra función.',
  'op.acc.3.r2.1':
    'Refuerzo R2 – Privilegios de auditoría: Existirán cuentas con privilegios de auditoría estrictamente controladas y personalizadas.',
  'op.acc.3.r3.1':
    'Refuerzo R3 – Acceso a la información de seguridad: El acceso a la información de seguridad del sistema estará permitido únicamente a los administradores de seguridad/sistema autorizados, utilizando los mecanismos de acceso imprescindibles (consola, interfaz web, acceso remoto, etc.).',
  'op.acc.4.1':
    'Todo acceso estará prohibido, salvo autorización expresa.',
  'op.acc.4.2':
    'Mínimo privilegio: los privilegios de cada entidad, usuario o proceso se reducirán al mínimo imprescindible para cumplir sus obligaciones o funciones.',
  'op.acc.4.3':
    'Necesidad de conocer y responsabilidad de compartir: los privilegios se asignarán de forma que las entidades, usuarios o procesos sólo accederán al conocimiento de aquella información requerida para cumplir sus obligaciones o funciones. La información es patrimonio del organismo y toda aquella que resulte necesaria para el usuario estará a su disposición.',
  'op.acc.4.4':
    'Capacidad de autorizar: Exclusivamente el personal con competencia para ello podrá conceder, alterar o anular la autorización de acceso a los recursos, conforme a los criterios establecidos por su responsable. Los permisos de acceso se revisarán de forma periódica.',
  'op.acc.4.5':
    'Se establecerá una política específica de acceso remoto, requiriéndose autorización expresa.',
  'op.acc.5.1':
    'Registro fidedigno previo a la entrega - Antes de proporcionar las credenciales de autenticación a las entidades, usuarios o procesos, estos deberán haberse identificado y registrado de manera fidedigna ante el sistema o ante un Prestador Cualificado de Servicios de Confianza o un proveedor de identidad electrónica reconocido por las administraciones públicas, de conformidad con lo dispuesto en la Ley 39/2015, de 1 de octubre.',
  'op.acc.5.2':
    'Acuse de recibo y deber de custodia - Antes de activar el mecanismo de autenticación, el usuario reconocerá que las ha recibido y que conoce y acepta las obligaciones que implica su tenencia, en particular, el deber de custodia diligente, la protección de su confidencialidad y el deber de notificación inmediata en caso de pérdida.',
  'op.acc.5.3':
    'Credencial bajo control exclusivo del usuario - Las credenciales estarán bajo el control exclusivo del usuario y se activarán una vez estén bajo su control efectivo.',
  'op.acc.5.4':
    'Cambio periódico de credenciales - Las credenciales se cambiarán con una periodicidad marcada por la política de seguridad de la organización.',
  'op.acc.5.5':
    'Inhabilitación ante compromiso - Las credenciales serán inhabilitadas —pudiendo ser regeneradas, en su caso—, cuando conste o se sospeche su pérdida, compromiso o revelación a entidades (personas, equipos o procesos) no autorizadas.',
  'op.acc.5.6':
    'Inhabilitación al terminar la relación - Las credenciales serán inhabilitadas cuando la entidad (persona, equipo o proceso) que autentican termina su relación con el sistema.',
  'op.acc.5.7':
    'Autenticación que no revela información - Antes de autorizar el acceso, la información presentada por el sistema será la mínima imprescindible para que el usuario se autentique, evitando todo aquello que pueda, directa o indirectamente, revelar información sobre el sistema o la cuenta, sus características, su operación o su estado. Las credenciales solamente se validarán cuando se tengan todos los datos necesarios y, si se rechaza, no se informará del motivo del rechazo.',
  'op.acc.5.8':
    'Límite de intentos y reactivación - El número de intentos permitidos será limitado, bloqueando la oportunidad de acceso una vez superado tal número, y requiriendo una intervención específica para reactivar la cuenta, que se describirá en la documentación.',
  'op.acc.5.9':
    'Información de derechos y obligaciones - El sistema informará al usuario de sus derechos u obligaciones inmediatamente después de obtener el acceso.',
  'op.acc.5.r1.1':
    'Contraseña como mecanismo (R1) - Se empleará una contraseña como mecanismo de autenticación.',
  'op.acc.5.r1.2':
    'Complejidad mínima de la contraseña (R1) - Se impondrán normas de complejidad mínima y robustez frente a ataques de adivinación (ver guías CCN-STIC).',
  'op.acc.5.r2.1':
    'Segundo factor OTP (R2) - Se requerirá una contraseña de un solo uso (OTP, en inglés) como complemento a la contraseña de usuario.',
  'op.acc.5.r3.1':
    'Certificado cualificado (R3) - Se emplearán certificados cualificados como mecanismo de autenticación.',
  'op.acc.5.r3.2':
    'Segundo factor sobre el certificado (R3) - El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
  'op.acc.5.r3.3':
    'Registro previo cualificado (R3) - Las credenciales utilizadas deberán haber sido obtenidas tras un registro previo presencial, o bien telemático, usando un certificado electrónico cualificado.',
  'op.acc.5.r4.1':
    'Certificado en soporte físico autorizado (R4) - Se emplearán certificados cualificados como mecanismo de autenticación, en soporte físico (tarjeta o similar) usando algoritmos, parámetros y dispositivos autorizados por el CCN.',
  'op.acc.5.r4.2':
    'Segundo factor sobre el certificado (R4) - El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
  'op.acc.5.r4.3':
    'Registro previo cualificado (R4) - Las credenciales utilizadas deberán haber sido obtenidas tras un registro previo presencial, o bien telemático, usando certificado electrónico cualificado.',
  'op.acc.5.r5.1':
    'Registro de accesos con éxito y fallidos (R5) - Se registrarán los accesos con éxito y los fallidos.',
  'op.acc.5.r5.2':
    'Aviso del último acceso efectuado (R5) - Se informará al usuario del último acceso efectuado con su identidad.',
  'op.acc.5.r6.1':
    'Renovación de la autenticación (R6) - Refuerzo R6 – Limitación de la ventana de acceso: Se definirán aquellos puntos en los que el sistema requerirá una renovación de la autenticación del usuario, mediante identificación singular, no bastando con la sesión establecida.',
  'op.acc.5.r7.1':
    'Suspensión por no utilización (R7) - Refuerzo R7 – Suspensión por no utilización: Las credenciales se suspenderán tras un periodo definido de no utilización.',
  'op.acc.6.1':
    'Aceptación previa de la política de seguridad - Antes de proporcionar las credenciales a los usuarios, estos deberán conocer y aceptar la política de seguridad del organismo en los aspectos que les afecten.',
  'op.acc.6.2':
    'Acuse de recibo y obligaciones de custodia - Antes de activar el mecanismo de autenticación, el usuario reconocerá que ha recibido las credenciales de acceso y que conoce y acepta las obligaciones que implica su tenencia, en particular, el deber de custodia diligente, la protección de su confidencialidad y el deber de notificación inmediata en caso de pérdida.',
  'op.acc.6.3':
    'Credencial bajo control exclusivo del usuario - Las credenciales estarán bajo el control exclusivo del usuario y se activarán una vez estén bajo su control efectivo.',
  'op.acc.6.4':
    'Cambio periódico de credenciales - Las credenciales se cambiarán con una periodicidad marcada por la política de seguridad de la organización.',
  'op.acc.6.5':
    'Inhabilitación ante compromiso - Las credenciales serán inhabilitadas —pudiendo ser regeneradas, en su caso—, cuando conste o se sospeche su pérdida, compromiso o revelación a entidades (personas, equipos o procesos) no autorizadas.',
  'op.acc.6.6':
    'Inhabilitación al cesar la relación - Las credenciales serán inhabilitadas cuando el usuario que autentican termina su relación con el sistema.',
  'op.acc.6.7':
    'Rechazo que no revela el motivo - Antes de autorizar el acceso, la información presentada por el sistema será la mínima imprescindible para que el usuario se autentique, evitando todo aquello que pueda, directa o indirectamente, revelar información sobre el sistema o la cuenta, sus características, su operación o su estado. Las credenciales solamente se validarán cuando se tengan todos los datos necesarios y, si se rechaza, no se informará del motivo del rechazo.',
  'op.acc.6.8':
    'Límite de intentos con bloqueo efectivo - El número de intentos permitidos será limitado, bloqueando la oportunidad de acceso una vez superado tal número, y requiriendo una intervención específica para reactivar la cuenta, que se describirá en la documentación.',
  'op.acc.6.9':
    'Información de derechos tras el acceso - El sistema informará al usuario de sus derechos u obligaciones inmediatamente después de obtener el acceso.',
  'op.acc.6.r1.1':
    'Contraseña solo desde zona controlada (R1) - Se empleará una contraseña como mecanismo de autenticación cuando el acceso se realiza desde zonas controladas y sin atravesar zonas no controladas (véase refuerzo R8).',
  'op.acc.6.r1.2':
    'Complejidad mínima de la contraseña (R1) - Se impondrán normas de complejidad mínima y robustez frente a ataques de adivinación (ver guías CCN-STIC).',
  'op.acc.6.r2.1':
    'Segundo factor junto a la contraseña (R2) - Se requerirá un segundo factor tal como «algo que se tiene», es decir, un dispositivo, una contraseña de un solo uso (OTP, en inglés) como complemento a la contraseña de usuario, o «algo que se es».',
  'op.acc.6.r3.1':
    'Certificado cualificado (R3) - Se emplearán certificados cualificados como mecanismo de autenticación.',
  'op.acc.6.r3.2':
    'Certificado protegido por PIN o biometría (R3) - El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
  'op.acc.6.r4.1':
    'Certificado en soporte físico autorizado (R4) - Se emplearán certificados cualificados como mecanismo de autenticación, en soporte físico (tarjeta o similar) usando algoritmos, parámetros y dispositivos autorizados por el CCN.',
  'op.acc.6.r4.2':
    'Soporte físico protegido por PIN o biometría (R4) - El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
  'op.acc.6.r5.1':
    'Registro de accesos con éxito y fallidos (R5) - Se registrarán los accesos con éxito y los fallidos.',
  'op.acc.6.r5.2':
    'Aviso del último acceso efectuado (R5) - Se informará al usuario del último acceso efectuado con su identidad.',
  'op.acc.6.r6.1':
    'Reautenticación en operaciones críticas (R6) - Se definirán aquellos puntos en los que el sistema requerirá una renovación de la autenticación del usuario, mediante identificación singular, no bastando con la sesión establecida.',
  'op.acc.6.r7.1':
    'Suspensión por no utilización (R7) - Las credenciales se suspenderán tras un periodo definido de no utilización.',
  'op.acc.6.r8.1':
    'Doble factor desde zona no controlada (R8) - Para el acceso desde o a través de zonas no controladas se requerirá un doble factor de autenticación: R2, R3 o R4.',
  'op.acc.6.r9.1':
    'Aplicación de la ITS de interconexión (R9) - Será de aplicación la ITS de Interconexión de sistemas de información.',
  'op.acc.6.r9.2':
    'Acceso remoto autorizado, cifrado y auditado (R9) - El acceso remoto deberá considerar los siguientes aspectos: a) Ser autorizado por la autoridad correspondiente. b) El tráfico deberá ser cifrado. c) Si la utilización no se produce de manera constante, el acceso remoto deberá encontrarse inhabilitado y habilitarse únicamente cuando sea necesario. d) Deberán recogerse registros de auditoría de este tipo de conexiones.',
  'op.exp.1.1':
    'Inventario actualizado con naturaleza y responsable - Se mantendrá un inventario actualizado de todos los elementos del sistema, detallando su naturaleza e identificando a su responsable; es decir, la persona que toma las decisiones relativas al mismo.',
  'op.exp.1.r1.1':
    'Etiquetado físico del equipamiento (R1) - Refuerzo R1 – Inventario de etiquetado: El etiquetado del equipamiento y del cableado formará parte del inventario.',
  'op.exp.1.r2.1':
    'Visualización continua del estado de la red (R2) - Refuerzo R2 – Identificación periódica de activos: Se dispondrá de herramientas que permitan visualizar de forma continua el estado de todos los equipos en la red, en particular, los servidores y los dispositivos de red y de comunicaciones.',
  'op.exp.1.r3.1':
    'Categorización de activos críticos (R3) - Refuerzo R3 – Identificación de activos críticos: Se dispondrá de herramientas que permitan categorizar los activos críticos por contexto de la organización y riesgos de seguridad.',
  'op.exp.1.r4.1':
    'Relación de componentes software de terceros (R4) - Refuerzo R4 – Lista de componentes software: Se mantendrá actualizada una relación formal de los componentes software de terceros empleados en el despliegue del sistema. Esta lista incluirá librerías software y los servicios requeridos para su despliegue (plataforma o entorno operacional). El contenido de la lista de componentes será equivalente a lo requerido en [mp.sw.1.r5].',
  'op.exp.2.1':
    'Retirada de cuentas y contraseñas estándar - Se retiren cuentas y contraseñas estándar.',
  'op.exp.2.2':
    'Mínima funcionalidad en operación - Se aplicará la regla de «mínima funcionalidad», es decir: a) El sistema debe proporcionar la funcionalidad mínima imprescindible para que la organización alcance sus objetivos. b) No proporcionará funciones injustificadas (de operación, administración o auditoría) al objeto de reducir al mínimo su perímetro de exposición, eliminándose o desactivándose aquellas funciones que sean innecesarias o inadecuadas al fin que se persigue.',
  'op.exp.2.3':
    'Seguridad por defecto - Se aplicará la regla de «seguridad por defecto», es decir: a) Las medidas de seguridad serán respetuosas con el usuario y protegerán a éste, salvo que se exponga conscientemente a un riesgo. b) Para reducir la seguridad, el usuario tendrá que realizar acciones conscientes. c) El uso natural, en los casos que el usuario no ha consultado el manual, será un uso seguro.',
  'op.exp.2.4':
    'Máquinas virtuales con el mismo rigor - Las máquinas virtuales estarán configuradas y gestionadas de un modo seguro. La gestión del parcheado, cuentas de usuarios, software antivirus, etc. se realizará como si se tratara de máquinas físicas, incluyendo la máquina anfitriona.',
  'op.exp.3.1':
    'Funcionalidad mínima mantenida en el tiempo - Se mantenga en todo momento la regla de «funcionalidad mínima» ([op.exp.2]).',
  'op.exp.3.2':
    'Mínimo privilegio mantenido en el tiempo - Se mantenga en todo momento la regla de «mínimo privilegio» ([op.exp.2]).',
  'op.exp.3.3':
    'Cambios previamente autorizados - El sistema se adapte a las nuevas necesidades, previamente autorizadas. (Ver [op.acc.4]).',
  'op.exp.3.4':
    'Reacción a vulnerabilidades notificadas - El sistema reaccione a vulnerabilidades notificadas. (Ver [op.exp.4]).',
  'op.exp.3.5':
    'Reacción a incidentes - El sistema reaccione a incidentes. (Ver [op.exp.7]).',
  'op.exp.3.6':
    'Solo personal autorizado edita la configuración - La configuración de seguridad solamente podrá editarse por personal debidamente autorizado.',
  'op.exp.3.r1.1':
    'Línea base de configuración autorizada (R1) - Existirán configuraciones hardware/software, autorizadas y mantenidas regularmente, para los servidores, elementos de red y estaciones de trabajo.',
  'op.exp.3.r1.2':
    'Verificación periódica frente a la línea base (R1) - Se verificará periódicamente la configuración hardware/software del sistema para asegurar que no se han introducido ni instalado elementos no autorizados.',
  'op.exp.3.r1.3':
    'Lista de servicios autorizados (R1) - Se mantendrá una lista de servicios autorizados para servidores y estaciones de trabajo.',
  'op.exp.3.r2.1':
    'Número muy limitado de administradores (R2) - La configuración de seguridad del sistema operativo y aplicaciones, tanto de estaciones y servidores como de la electrónica de red del sistema, será responsabilidad de un número muy limitado de administradores del sistema.',
  'op.exp.3.r3.1':
    'Copias de configuración para reconstruir (R3) - Se realizarán copias de seguridad de la configuración del sistema de forma que sea posible reconstruirlo en parte o en su totalidad tras un incidente.',
  'op.exp.3.r4.1':
    'Configuración por procedimiento de actualización (R4) - Refuerzo R4 – Aplicación de la configuración: La configuración de seguridad del sistema operativo y de las aplicaciones se mantendrá actualizada a través de una aplicación o procedimiento manual que permita la instalación de las correspondientes modificaciones de versión y actualizaciones de seguridad oportunas.',
  'op.exp.3.r5.1':
    'Herramientas de estado de dispositivos de red (R5) - Refuerzo R5 – Control del estado de seguridad de la configuración: Se dispondrá de herramientas que permitan conocer de forma periódica el estado de seguridad de la configuración de los dispositivos de red y, en el caso de que resulte deficiente, permitir su corrección.',
  'op.exp.4.1':
    'Vigilancia de los anuncios del fabricante - Se atenderá a las especificaciones de los fabricantes en lo relativo a instalación y mantenimiento de los sistemas, lo que incluirá un seguimiento continuo de los anuncios de defectos.',
  'op.exp.4.2':
    'Plazos de actualización según el riesgo - Se dispondrá de un procedimiento para analizar, priorizar y determinar cuándo aplicar las actualizaciones de seguridad, parches, mejoras y nuevas versiones. La priorización tendrá en cuenta la variación del riesgo en función de la implantación o no de la actualización.',
  'op.exp.4.3':
    'Mantenimiento por personal autorizado - El mantenimiento solo podrá realizarse por personal debidamente autorizado.',
  'op.exp.4.r1.1':
    'Prueba previa en preproducción (R1) - Antes de poner en producción una nueva versión o una versión parcheada, se comprobará en un entorno de prueba controlado y consistente en configuración al entorno de producción, que la nueva instalación funciona correctamente y no disminuye la eficacia de las funciones necesarias para el trabajo diario.',
  'op.exp.4.r2.1':
    'Mecanismo de reversión previsto (R2) - Antes de la aplicación de las configuraciones, parches y actualizaciones de seguridad se preverá un mecanismo para revertirlos en caso de aparición de efectos adversos.',
  'op.exp.4.r3.1':
    'Integridad periódica del firmware (R3) - Refuerzo R3 – Actualizaciones y pruebas periódicas: Se deberá comprobar de forma periódica la integridad del firmware utilizado en los dispositivos hardware del sistema (infraestructura de red, BIOS, etc.). La periodicidad de estas comprobaciones seguirá las recomendaciones de la Guía CCN-STIC que sea de aplicación.',
  'op.exp.4.r4.1':
    'Monitorización continua de amenazas (R4) - Refuerzo R4 – Monitorización continua: Se desplegará a nivel de sistema una estrategia de monitorización continua de amenazas y vulnerabilidades. Esta estrategia detallará: 1. Los indicadores críticos de seguridad a emplear. 2. La política de aplicación de parches de seguridad de los componentes software relacionados en las listas de [op.exp.1.r4], [op.ext.3.r3] y [mp.sw.1.r5]. 3. Los criterios de revisión regular y excepcional de las amenazas sobre el sistema.',
};
