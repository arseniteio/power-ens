/* ENS requirement descriptions by identifier ('title - description') for the Controles view. Written by the ens-controls-setup generator (generators/dashboard.py) when a control is added. */
export const ensRequirementsFile = {
  'mp.info.6.1':
    'Realización de copias de seguridad - Se realizarán copias de seguridad que permitan recuperar datos perdidos, accidental o intencionadamente. La periodicidad y los plazos de retención de estas copias de seguridad se determinarán en la normativa interna de la organización relativa a copias de seguridad.',
  'mp.info.6.2.a':
    'Frecuencia de las copias - Los procedimientos de respaldo establecidos indicarán: a) Frecuencia de las copias.',
  'mp.info.6.2.b':
    'Almacenamiento en el propio lugar - Los procedimientos de respaldo establecidos indicarán: b) Requisitos de almacenamiento en el propio lugar.',
  'mp.info.6.2.c':
    'Almacenamiento en otros lugares - Los procedimientos de respaldo establecidos indicarán: c) Requisitos de almacenamiento en otros lugares.',
  'mp.info.6.2.d':
    'Acceso autorizado a las copias - Los procedimientos de respaldo establecidos indicarán: d) Controles para el acceso autorizado a las copias de respaldo.',
  'mp.info.6.r1.1':
    'Pruebas de recuperación - Los procedimientos de copia de seguridad y restauración deben probarse regularmente. Su frecuencia dependerá de la criticidad de los datos y del impacto que cause la falta de disponibilidad.',
  'mp.info.6.r2.1':
    'Protección de las copias de seguridad - Al menos una de las copias de seguridad se almacenará de forma separada en lugar diferente, de tal manera que un incidente no pueda afectar tanto al repositorio original como a la copia simultáneamente.',
  'op.acc.1.1':
    'Identificador único válido - Se podrá utilizar como identificador único los sistemas de identificación previstos en la normativa de aplicación, entre ellos, los sistemas de clave concertada y cualquier otro sistema que las administraciones consideren válido en los términos de la Ley 39/2015.',
  'op.acc.1.2':
    'Identificadores singulares por rol - Cuando el usuario tenga diferentes roles frente al sistema (como ciudadano, trabajador del organismo o administrador, por ejemplo) recibirá identificadores singulares para cada perfil, de forma que se recaben los correspondientes registros de actividad y se delimiten los privilegios de cada perfil.',
  'op.acc.1.3':
    'Identificador singular por entidad - Cada entidad (usuario o proceso) que accede al sistema contará con un identificador singular que permita conocer el destinatario, los derechos de acceso que recibe y las acciones realizadas por dicha entidad.',
  'op.acc.1.4':
    'Gestión del ciclo de vida de las cuentas - Las cuentas de usuario se gestionarán de la siguiente forma: a) Cada cuenta estará asociada a un identificador único. b) Las cuentas deben ser inhabilitadas cuando: el usuario deja la organización; cesa en la función para la cual se requería la cuenta; o la persona que la autorizó da orden contraria. c) Las cuentas se retendrán durante el período necesario para atender las necesidades de trazabilidad de los registros de actividad (denominado «período de retención»).',
  'op.acc.1.5':
    'Identificación en comunicaciones electrónicas (eIDAS) - En comunicaciones electrónicas, las partes se identificarán conforme al Reglamento (UE) n.º 910/2014 (eIDAS), con la siguiente correspondencia: a) Autenticidad nivel BAJO → nivel de seguridad eIDAS bajo, sustancial o alto. b) Autenticidad nivel MEDIO → nivel de seguridad eIDAS sustancial o alto. c) Autenticidad nivel ALTO → nivel de seguridad eIDAS alto.',
  'op.acc.1.r1.1':
    'Singularización de la persona - La identificación del usuario permitirá al Responsable del Sistema, al Responsable de la Seguridad o a sus administradores delegados, singularizar a la persona asociada al mismo, así como sus responsabilidades en el sistema.',
  'op.acc.1.r1.2':
    'Identificación ligada a privilegios - Los datos de identificación serán utilizados por el sistema para determinar los privilegios del usuario conforme a los requisitos de control de acceso establecidos en la documentación de seguridad.',
  'op.acc.1.r1.3':
    'Lista actualizada de usuarios autorizados - Se asegurará la existencia de una lista actualizada de usuarios autorizados, mantenida por el administrador del sistema o de la seguridad del sistema.',
  'op.acc.2.1':
    'Protección de recursos - Los recursos del sistema se protegerán con algún mecanismo que impida su utilización, salvo a las entidades que disfruten de derechos de acceso suficientes.',
  'op.acc.2.2':
    'Derechos según responsable - Los derechos de acceso de cada recurso se establecerán según las decisiones de la persona responsable del recurso, ateniéndose a la política y normativa de seguridad del sistema.',
  'op.acc.2.3':
    'Control de acceso al SO - Particularmente, se controlará el acceso a los componentes del sistema operativo y a sus ficheros o registros de configuración.',
  'op.acc.2.r1.1':
    'Privilegios individuales - Todos los usuarios autorizados deben tener un conjunto de atributos de seguridad (privilegios) que puedan ser mantenidos individualmente.',
  'op.acc.2.r1.2':
    'Privilegios que restringen acceso - Los privilegios de acceso se implementarán para restringir el tipo de acceso que un usuario puede tener (lectura, escritura, modificación, borrado, etc.).',
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
  'op.cont.2.1':
    'Funciones, responsabilidades y actividades - Se identificarán funciones, responsabilidades y actividades a realizar.',
  'op.cont.2.2':
    'Previsión para coordinar los medios alternativos - Existirá una previsión para coordinar la entrada en servicio de los medios alternativos de forma que se garantice poder seguir prestando los servicios esenciales de la organización.',
  'op.cont.2.3':
    'Medios alternativos en acuerdos o contratos - Todos los medios alternativos estarán planificados y materializados en acuerdos o contratos con los proveedores correspondientes.',
  'op.cont.2.4':
    'Formación de las personas afectadas - Las personas afectadas por el plan recibirán formación específica relativa a su papel en dicho plan.',
  'op.cont.2.5':
    'Integración con los demás planes de continuidad - El plan de continuidad será parte integral y armónica de los planes de continuidad de la organización en otras materias ajenas a la seguridad.',
  'op.cont.2.r1.1':
    'Plan de emergencia y contingencia (R1) - Refuerzo R1 – Plan de emergencia y contingencia: Cuando se determine la necesidad de continuidad de los sistemas, deberá existir un plan de emergencia y contingencia en consonancia. En función del análisis de Impacto, se determinarán los aspectos a cubrir.',
  'op.cont.2.r2.1':
    'Comprobación de integridad tras una caída (R2) - Refuerzo R2 – Comprobación de integridad: Ante una caída o discontinuidad del sistema, se deberá comprobar la integridad del sistema operativo, del firmware y de los ficheros de configuración.',
  'op.cont.3.1':
    'Pruebas periódicas del plan y corrección de lo detectado - Se realizarán pruebas periódicas para localizar y, en su caso, corregir los errores o deficiencias que puedan existir en el plan de continuidad.',
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
  'op.exp.10.1':
    'Claves protegidas durante todo su ciclo de vida - Las claves criptográficas se protegerán durante todo su ciclo de vida: (1) generación, (2) transporte al punto de explotación, (3) custodia durante la explotación, (4) archivo posterior a su retirada de explotación activa y (5) destrucción final.',
  'op.exp.10.2':
    'Generación aislada de la explotación - Los medios de generación estarán aislados de los medios de explotación.',
  'op.exp.10.3':
    'Claves retiradas archivadas fuera de explotación - Las claves retiradas de operación que deban ser archivadas, lo serán en medios aislados de los de explotación.',
  'op.exp.10.r1.1':
    'Algoritmos y parámetros autorizados por el CCN (R1) - Se emplearán algoritmos y parámetros autorizados por el CCN.',
  'op.exp.10.r2.1':
    'Cifradores conformes a la guía CCN-STIC (R2) - Refuerzo R2 – Protección avanzada de claves criptográficas: Se emplearán cifradores que cumplan con los requisitos establecidos en la guía CCN-STIC que sea de aplicación.',
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
  'op.exp.5.1':
    'Peticiones de cambio registradas y numeradas - Los cambios se planificarán para reducir el impacto sobre la prestación de los servicios afectados. Para ello, todas las peticiones de cambio se registrarán asignando un número de referencia que permita su seguimiento, de forma equivalente al registro de los incidentes.',
  'op.exp.5.2':
    'Información suficiente para autorizar el cambio - La información a registrar para cada petición de cambio será suficiente para que quien deba autorizarlos no tenga dudas al respecto y permita gestionarlo hasta su desestimación o implementación.',
  'op.exp.5.3':
    'Pruebas en preproducción equivalente - Las pruebas de preproducción, siempre que sea posible realizarlas, se efectuarán en equipos equivalentes a los de producción, al menos en los aspectos específicos del cambio.',
  'op.exp.5.4':
    'Aprobación previa de los cambios de riesgo alto - Mediante un análisis de riesgos se determinará si los cambios son relevantes para la seguridad del sistema. Aquellos cambios que impliquen un riesgo de nivel ALTO deberán ser aprobados, explícitamente, de forma previa a su implantación, por el Responsable de la Seguridad.',
  'op.exp.5.5':
    'Pruebas de aceptación y documentación actualizada - Una vez implementado el cambio, se realizarán las pruebas de aceptación convenientes. Si son positivas, se actualizará la documentación de configuración (diagramas de red, manuales, el inventario, etc.), siempre que proceda.',
  'op.exp.5.r1.1':
    'Posibilidad de reversión prevista (R1) - Antes de la aplicación de los cambios, se deberá tener en cuenta la posibilidad de revertirlos en caso de la aparición de efectos adversos.',
  'op.exp.5.r1.2':
    'Fallos comunicados al responsable de seguridad (R1) - Todos los fallos en el software y hardware deberán ser comunicados al responsable designado en la organización de la seguridad.',
  'op.exp.5.r1.3':
    'Cambios documentados con impacto en seguridad (R1) - Todos los cambios en el sistema deberán documentarse, incluyendo una valoración del impacto que dicho cambio supone en la seguridad del sistema.',
  'op.exp.6.1':
    'Prevención y reacción frente a código dañino - Se dispondrá de mecanismos de prevención y reacción frente a código dañino, incluyendo el correspondiente mantenimiento de acuerdo a las recomendaciones del fabricante.',
  'op.exp.6.2':
    'Antimalware instalado en todos los equipos - Se instalará software de protección frente a código dañino en todos los equipos: puestos de usuario, servidores y elementos perimetrales.',
  'op.exp.6.3':
    'Ficheros externos analizados antes de usarlos - Todo fichero procedente de fuentes externas será analizado antes de trabajar con él.',
  'op.exp.6.4':
    'Bases de detección actualizadas - Las bases de datos de detección de código dañino permanecerán permanentemente actualizadas.',
  'op.exp.6.5':
    'Configuración adecuada y protección en tiempo real - El software de detección de código dañino instalado en los puestos de usuario deberá estar configurado de forma adecuada e implementará protección en tiempo real de acuerdo a las recomendaciones del fabricante.',
  'op.exp.6.r1.1':
    'Escaneo periódico de todo el sistema (R1) - Todo el sistema se escaneará regularmente para detectar código dañino.',
  'op.exp.6.r2.1':
    'Funciones críticas analizadas al arranque (R2) - Las funciones críticas se analizarán al arrancar el sistema en prevención de modificaciones no autorizadas.',
  'op.exp.6.r3.1':
    'Lista blanca de aplicaciones (R3) - Solamente se podrán ejecutar aquellas aplicaciones previamente autorizadas. Se implementará una lista blanca para impedir la ejecución de aplicaciones no autorizadas.',
  'op.exp.6.r4.1':
    'Detección y respuesta en equipos, EDR (R4) - Se emplearán herramientas de seguridad orientadas a detectar, investigar y resolver actividades sospechosas en puestos de usuario y servidores (EDR – Endpoint Detection and Response).',
  'op.exp.6.r5.1':
    'Configuración avanzada del antimalware (R5) - Refuerzo R5 – Configuración de la herramienta de detección de código dañino: El software de detección de código dañino permitirá realizar configuraciones avanzadas y revisar el sistema en el arranque y cada vez que se conecte un dispositivo extraíble.',
  'op.exp.6.r5.2':
    'Protección en tiempo real en servidores (R5) - El software de detección de código dañino instalado en servidores y elementos perimetrales deberá estar configurado de forma adecuada e implementará protección en tiempo real de acuerdo a las recomendaciones del fabricante.',
  'op.exp.7.1':
    'Proceso integral de gestión de incidentes - Se dispondrá de un proceso integral para hacer frente a los incidentes que puedan tener un impacto en la seguridad del sistema, que incluya el informe de eventos de seguridad y debilidades, detallando los criterios de clasificación y el escalado de la notificación.',
  'op.exp.7.2':
    'Incidentes con datos personales según el RGPD - La gestión de incidentes que afecten a datos personales tendrá en cuenta lo dispuesto en el Reglamento General de Protección de Datos; la Ley Orgánica 3/2018, de 5 de diciembre, en especial su disposición adicional primera, así como el resto de normativa de aplicación, sin perjuicio de los requisitos establecidos en este real decreto.',
  'op.exp.7.r1.1':
    'Notificación al CCN-CERT por ventanilla única (R1) - Se dispondrá de soluciones de ventanilla única para la notificación de incidentes al CCN-CERT, que permita la distribución de notificaciones a las diferentes entidades de manera federada, utilizando para ello dependencias administrativas jerárquicas.',
  'op.exp.7.r2.1':
    'Medidas urgentes y protección de evidencias (R2) - Implantación de medidas urgentes, incluyendo la detención de servicios, el aislamiento del sistema afectado, la recogida de evidencias y protección de los registros, según convenga al caso.',
  'op.exp.7.r2.2':
    'Recursos para investigar y resolver (R2) - Asignación de recursos para investigar las causas, analizar las consecuencias y resolver el incidente.',
  'op.exp.7.r2.3':
    'Información a los responsables afectados (R2) - Informar del incidente a los responsables de la información y servicios afectados y de las actuaciones llevadas a cabo para su resolución.',
  'op.exp.7.r2.4':
    'Medidas para que no se repita (R2) - Medidas para: a) Prevenir que se repita el incidente. b) Incluir en los procedimientos de usuario la identificación y forma de tratar el incidente. c) Actualizar, extender, mejorar u optimizar los procedimientos de resolución de incidentes.',
  'op.exp.7.r3.1':
    'Reconfiguración dinámica ante ataques (R3) - La reconfiguración dinámica incluye, por ejemplo, cambios en las reglas de los enrutadores (routers), listas de control de acceso, parámetros del sistema de detección / prevención de intrusiones y reglas en los cortafuegos y puertas de enlace, aislamiento de elementos críticos y aislamiento de las copias de seguridad.',
  'op.exp.7.r3.2':
    'Adaptación a los avisos del CCN-CERT (R3) - El organismo adaptará los procedimientos de reconfiguración dinámica reaccionando a los anuncios recibidos del CCN-CERT relativos a ciberamenazas sofisticadas y campañas de ataques.',
  'op.exp.7.r4.1':
    'Prevención y respuesta automática (R4) - Refuerzo R4 – Prevención y Respuesta Automática: Se dispondrá de herramientas que automaticen el proceso de prevención y respuesta mediante la detección e identificación de anomalías, la segmentación dinámica de la red para reducir la superficie de ataque, el aislamiento de dispositivos críticos, etc.',
  'op.exp.8.1':
    'Registro de auditoría con los campos mínimos - Se generará un registro de auditoría, que incluirá, al menos, el identificador del usuario o entidad asociado al evento, fecha y hora, sobre qué información se realiza el evento, tipo de evento y el resultado del evento (fallo o éxito), según la política de seguridad y los procedimientos asociados a la misma.',
  'op.exp.8.2':
    'Registros de actividad activos en los servidores - Se activarán los registros de actividad en los servidores.',
  'op.exp.8.r1.1':
    'Revisión periódica de los registros (R1) - Se revisarán informalmente, de forma periódica, los registros de actividad, buscando patrones anormales.',
  'op.exp.8.r2.1':
    'Referencia de tiempo sincronizada y protegida (R2) - El sistema deberá disponer de una referencia de tiempo (timestamp) para facilitar las funciones de registro de eventos y auditoría. La modificación de la referencia de tiempo del sistema será una función de administración y, en caso de realizarse su sincronización con otros dispositivos, deberán utilizarse mecanismos de autenticación e integridad.',
  'op.exp.8.r3.1':
    'Eventos auditados y retención documentados (R3) - En la documentación de seguridad del sistema se deberán indicar los eventos de seguridad que serán auditados y el tiempo de retención de los registros antes de ser eliminados.',
  'op.exp.8.r4.1':
    'Acceso a los registros solo para personal autorizado (R4) - Los registros de actividad y, en su caso, las copias de seguridad de los mismos, solamente podrán ser accedidos o eliminarse por personal debidamente autorizado.',
  'op.exp.8.r5.1':
    'Análisis de la actividad en busca de compromisos (R5) - El sistema deberá implementar herramientas para analizar y revisar la actividad del sistema y la información de auditoría, en búsqueda de comprometimientos de la seguridad posibles o reales.',
  'op.exp.8.r5.2':
    'Recolección, correlación y respuesta automáticas (R5) - Se dispondrá de un sistema automático de recolección de registros, correlación de eventos y respuesta automática ante los mismos.',
  'op.exp.9.1':
    'Reportes, actuaciones y cambios del incidente registrados - Se registrarán los reportes iniciales, intermedios y finales de los incidentes, las actuaciones de emergencia y las modificaciones del sistema derivadas del incidente.',
  'op.exp.9.2':
    'Evidencias con valor jurisdiccional registradas - Se registrará aquella evidencia que pueda dirimirse en un ámbito jurisdiccional, especialmente cuando el incidente pueda comportar acciones disciplinarias sobre el personal interno, sobre proveedores externos o en la persecución de delitos. En la determinación de la composición y detalle de estas evidencias, se recurrirá a asesoramiento legal especializado.',
  'op.exp.9.3':
    'Eventos auditables revisados tras los incidentes - Como consecuencia del análisis de los incidentes, se revisará la determinación de los eventos auditables.',
  'op.mon.1.1':
    'Herramientas de detección o prevención de intrusiones - Se dispondrá de herramientas de detección o prevención de intrusiones.',
  'op.mon.1.r1.1':
    'Detección basada en reglas (R1) - El sistema dispondrá de herramientas de detección o prevención de intrusiones basadas en reglas.',
  'op.mon.1.r2.1':
    'Procedimientos de respuesta a las alertas (R2) - Existirán procedimientos de respuesta a las alertas generadas por el sistema de detección o prevención de intrusiones.',
  'op.mon.1.r3.1':
    'Acciones predeterminadas automáticas (R3) - Refuerzo R3 – Acciones predeterminadas: El sistema ejecutará automáticamente acciones predeterminadas de respuesta a las alertas generadas. Esto puede incluir la finalización del proceso que está ocasionando la alerta, la inhabilitación de determinados servicios, la desconexión de usuarios y el bloqueo de cuentas.',
  'op.mon.2.1':
    'Datos del grado de implantación y del informe del art. 32 - Atendiendo a la categoría de seguridad del sistema, se recopilarán los datos necesarios para conocer el grado de implantación de las medidas de seguridad que resulten aplicables y, en su caso, para proveer el informe anual requerido por el artículo 32.',
  'op.mon.2.r1.1':
    'Datos del comportamiento de la gestión de incidentes (R1) - Se recopilarán los datos precisos que posibiliten evaluar el comportamiento del sistema de gestión de incidentes, de acuerdo con la Instrucción Técnica de Seguridad de Notificación de Incidentes de Seguridad y con la correspondiente guía CCN-STIC.',
  'op.mon.2.r2.1':
    'Datos de eficiencia: horas y presupuesto (R2) - Se recopilarán los datos precisos para conocer la eficiencia del sistema de seguridad, en relación con los recursos consumidos, en términos de horas y presupuesto.',
  'op.mon.3.1':
    'Recolección automática de eventos de seguridad - Se dispondrá de un sistema automático de recolección de eventos de seguridad.',
  'op.mon.3.r1.1':
    'Correlación de eventos (R1) - Se dispondrá de un sistema automático de recolección de eventos de seguridad que permita la correlación de los mismos.',
  'op.mon.3.r2.1':
    'Superficie de exposición: vulnerabilidades y configuración (R2) - Se dispondrá de soluciones de vigilancia que permitan determinar la superficie de exposición con relación a vulnerabilidades y deficiencias de configuración.',
  'op.mon.3.r3.1':
    'Amenazas avanzadas y comportamientos anómalos (R3) - Se dispondrá de sistemas para detección de amenazas avanzadas y comportamientos anómalos.',
  'op.mon.3.r3.2':
    'APT por anomalías en el tráfico de red (R3) - Se dispondrá de sistemas para la detección de amenazas persistentes avanzadas (Advanced Persistent Threat, APT) mediante la detección de anomalías significativas en el tráfico de la red.',
  'op.mon.3.r4.1':
    'Observatorios digitales (R4) - Se dispondrá de observatorios digitales con fines de cibervigilancia dedicados a la detección y seguimiento de anomalías que pudieran representar indicadores de amenaza en contenidos digitales.',
  'op.mon.3.r5.1':
    'Limitación y vigilancia de consultas (R5) - Limitación de las consultas, monitorizando volumen y frecuencia.',
  'op.mon.3.r5.2':
    'Alerta en tiempo real a los administradores (R5) - Alerta a los administradores de seguridad de comportamientos sospechosos en tiempo real.',
  'op.mon.3.r6.1':
    'Inspección: verificación de configuración (R6) - Verificación de configuración.',
  'op.mon.3.r6.2':
    'Inspección: análisis de vulnerabilidades (R6) - Análisis de vulnerabilidades.',
  'op.mon.3.r6.3':
    'Inspección: pruebas de penetración (R6) - Pruebas de penetración.',
  'op.mon.3.r7.1':
    'Interconexiones: control de flujos por metadatos (R7) - Refuerzo R7 – Interconexiones: En las interconexiones que lo requieran se aplicarán controles en los flujos de intercambio de información a través del uso de metadatos.',
  'op.nub.1.1':
    'Medidas del modelo de servicio prestado (prestador) - Los sistemas que suministran un servicio en la nube a organismos del sector público deberán cumplir con el conjunto de medidas de seguridad en función del modelo de servicio en la nube que presten: Software como Servicio (Software as a Service, SaaS), Plataforma como Servicio (Platform as a Service, PaaS) e Infraestructura como Servicio (Infrastructure as a Service, IaaS) definidas en las guías CCN-STIC que sean de aplicación.',
  'op.nub.1.2':
    'Conformidad de los servicios en la nube de terceros (usuario) - Cuando se utilicen servicios en la nube suministrados por terceros, los sistemas de información que los soportan deberán ser conformes con el ENS o cumplir con las medidas desarrolladas en una guía CCN-STIC que incluirá, entre otros, requisitos relativos a: a) Auditoría de pruebas de penetración (pentesting). b) Transparencia. c) Cifrado y gestión de claves. d) Jurisdicción de los datos.',
  'op.nub.1.r1.1':
    'Servicios de terceros certificados (R1) - Cuando se utilicen servicios en la nube suministrados por terceros, estos deberán estar certificados bajo una metodología de certificación reconocida por el Organismo de Certificación del Esquema Nacional de Evaluación y Certificación de Seguridad de las Tecnologías de la Información.',
  'op.nub.1.r1.2':
    'Servicios cloud de seguridad conformes con op.pl.5 (R1) - Si el servicio en la nube es un servicio de seguridad deberá cumplir con los requisitos establecidos en [op.pl.5].',
  'op.nub.1.r2.1':
    'Configuración según la guía CCN-STIC específica (R2) - La configuración de seguridad de los sistemas que proporcionan estos servicios deberá realizarse según la correspondiente guía CCN-STIC de Configuración de Seguridad Específica, orientadas tanto al usuario como al proveedor.',
  'mp.eq.2.1':
    'Bloqueo por inactividad con nueva autenticación - El puesto de trabajo se bloqueará al cabo de un tiempo prudencial de inactividad, requiriendo una nueva autenticación del usuario para reanudar la actividad en curso.',
  'mp.eq.2.r1.1':
    'Cancelación de las sesiones abiertas tras un tiempo superior - Pasado un cierto tiempo, superior al anterior, se cancelarán las sesiones abiertas desde dicho puesto de trabajo.',
  'mp.eq.3.1':
    'Inventario de portátiles con responsable y control de custodia - Se llevará un inventario de dispositivos portátiles junto con una identificación de la persona responsable de cada uno de ellos y un control regular de que está positivamente bajo su control.',
  'mp.eq.3.2':
    'Procedimiento de aviso de pérdidas o sustracciones - Se establecerá un procedimiento operativo de seguridad para informar al servicio de gestión de incidentes de pérdidas o sustracciones.',
  'mp.eq.3.3':
    'Acceso remoto limitado a lo imprescindible y autorizado - Cuando un dispositivo portátil se conecte remotamente a través de redes que no están bajo el estricto control de la organización, el ámbito de operación del servidor limitará la información y los servicios accesibles a los mínimos imprescindibles, requiriendo autorización previa de los responsables de la información y los servicios afectados. Este punto es de aplicación a conexiones a través de internet y otras redes que no sean de confianza.',
  'mp.eq.3.4':
    'Sin claves de acceso remoto prescindibles en el portátil - Se evitará, en la medida de lo posible, que el dispositivo portátil contenga claves de acceso remoto a la organización que no sean imprescindibles. Se considerarán claves de acceso remoto aquellas que sean capaces de habilitar un acceso a otros equipos de la organización u otras de naturaleza análoga.',
  'mp.eq.3.r1.1':
    'Cifrado del disco con información de nivel MEDIO o superior - Se protegerá el dispositivo portátil mediante cifrado del disco duro cuando el nivel de confidencialidad de la información almacenada en el mismo sea de nivel MEDIO.',
  'mp.eq.3.r2.1':
    'Uso fuera de las instalaciones solo en entornos protegidos - El uso de dispositivos portátiles fuera de las instalaciones de la organización se restringirá a entornos protegidos, donde el acceso sea controlado y a salvo de hurtos y miradas indiscretas.',
  'mp.eq.4.1':
    'Configuración segura y flujos de entrada y salida controlados - Los dispositivos presentes en el sistema deberán contar con una configuración de seguridad adecuada de manera que se garantice el control del flujo definido de entrada y salida de la información.',
  'mp.eq.4.2':
    'Borrado del almacenamiento de los dispositivos de red - Los dispositivos presentes en la red que dispongan de algún tipo de almacenamiento temporal o permanente de información proporcionarán la funcionalidad necesaria para eliminar información de soportes de información. (Ver [mp.si.5]).',
  'mp.eq.4.r1.1':
    'Productos o servicios conformes con op.pl.5 - Se usarán, cuando sea posible, productos o servicios que cumplan lo establecido en [op.pl.5].',
  'mp.eq.4.r2.1':
    'Control de los dispositivos conectados a la red - Refuerzo R2 – Control de dispositivos conectados a la red: Se dispondrá de soluciones que permitan visualizar los dispositivos presentes en la red, controlar su conexión/desconexión a la misma y verificar su configuración de seguridad.',
  'mp.com.1.1':
    'Perímetro que separa la red interna y por el que pasa todo el tráfico - Se dispondrá de un sistema de protección perimetral que separe la red interna del exterior. Todo el tráfico deberá atravesar dicho sistema.',
  'mp.com.1.2':
    'Flujos a través del perímetro autorizados previamente - Todos los flujos de información a través del perímetro deben estar autorizados previamente.',
  'mp.com.3.1':
    'Autenticidad del otro extremo antes de intercambiar información - En comunicaciones con puntos exteriores al dominio propio de seguridad, se asegurará la autenticidad del otro extremo del canal de comunicación antes de intercambiar información. (Ver [op.acc.5]).',
  'mp.com.3.2':
    'Prevención de ataques activos con activación del tratamiento del incidente - Se prevendrán ataques activos garantizando que al ser detectados se activarán los procedimientos previstos de tratamiento del incidente. Se considerarán ataques activos: a) La alteración de la información en tránsito. b) La inyección de información espuria. c) El secuestro de la sesión por una tercera parte.',
  'mp.com.3.3':
    'Mecanismos de identificación y autenticación admitidos - Se aceptará cualquier mecanismo de identificación y autenticación de los previstos en el ordenamiento jurídico y en la normativa de aplicación.',
  'mp.com.3.r1.1':
    'Redes privadas virtuales cifradas fuera del dominio propio - Se emplearán redes privadas virtuales cifradas cuando la comunicación discurra por redes fuera del propio dominio de seguridad.',
  'mp.com.3.r2.1':
    'Algoritmos y parámetros autorizados por el CCN - Se emplearán algoritmos y parámetros autorizados por el CCN.',
  'mp.com.3.r3.1':
    'Dispositivos hardware para la red privada virtual - Se recomienda emplear dispositivos hardware en el establecimiento y utilización de la red privada virtual.',
  'mp.com.3.r4.1':
    'Productos certificados conforme a op.pl.5 - Se emplearán productos certificados conforme a lo establecido en [op.pl.5].',
  'mp.com.3.r5.1':
    'Cifradores conformes con la guía CCN-STIC - Refuerzo R5 – Cifradores: Se emplearán cifradores que cumplan con los requisitos establecidos en la guía CCN-STIC que sea de aplicación.',
  'mp.com.4.1':
    'Tráfico segregado: cada equipo accede solo a lo que necesita - El tráfico por la red se segregará para que cada equipo solamente tenga acceso a la información que necesita.',
  'mp.com.4.2':
    'Comunicaciones inalámbricas en un segmento separado - Si se emplean comunicaciones inalámbricas, será en un segmento separado.',
  'mp.com.4.r1.1':
    'Segmentos implementados con VLAN - Los segmentos de red se implementarán por medio de redes de área local virtuales (Virtual Local Area Network, VLAN).',
  'mp.com.4.r1.2':
    'Subredes separadas de usuarios, servicios y administración - La red que conforma el sistema deberá segregarse en distintas subredes contemplando como mínimo: • Usuarios. • Servicios. • Administración.',
  'mp.com.4.r2.1':
    'Segmentos implementados con redes privadas virtuales - Los segmentos de red se implementarán por medio de redes privadas virtuales (Virtual Private Network, VPN).',
  'mp.com.4.r3.1':
    'Segmentos implementados con medios físicos separados - Los segmentos de red se implementarán con medios físicos separados.',
  'mp.com.4.r4.1':
    'Control de entrada de usuarios y de información en cada segmento - Control de entrada de los usuarios que llegan a cada segmento y control de entrada y salida de la información disponible en cada segmento.',
  'mp.com.4.r4.2':
    'Punto de interconexión asegurado, mantenido y monitorizado - El punto de interconexión estará particularmente asegurado, mantenido y monitorizado, (como en [mp.com.1]).',
  'mp.sw.2.1':
    'Criterios de aceptación cumplidos sin deteriorar otros componentes - Se comprobará que: a) Se cumplen los criterios de aceptación en materia de seguridad. b) No se deteriora la seguridad de otros componentes del servicio.',
  'mp.sw.2.r1.1':
    'Pruebas en un entorno aislado de preproducción - Las pruebas se realizarán en un entorno aislado (pre-producción).',
  'mp.sw.2.r2.1':
    'Auditoría del código fuente - Refuerzo R2 – Inspección de código fuente: Se realizará una auditoría de código fuente.',
};
