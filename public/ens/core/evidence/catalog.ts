import { ENSEvidenceDefinition } from './types';

// `relatedRules` es el eslabón «evidencia → rule ID» de la cadena de
// trazabilidad. Contiene los identificadores numéricos REALES declarados en
// agent/rules/ensfacil_<control>_*.xml, derivados del `evidencia=` de cada
// `<info type="text">`. Antes había identificadores simbólicos
// (`ENS-OPACC1-INVENTORY`) que no correspondían a ninguna regla: la UI los
// mostraba al auditor como si fueran trazables y la cadena moría ahí.
//
// Criterio de inclusión:
//   - se incluyen las reglas que acreditan la evidencia y generan alerta;
//   - se excluyen las reglas `level="0"` (106600/106800/106900), que nunca
//     producen alerta y por tanto no llevan a ningún evento crudo;
//   - se excluyen las reglas inertes para el plugin (106923), que re-etiquetan
//     alertas syscheck sin campo `ensfacil` y nunca llegan aquí (ver el
//     comentario en el propio XML);
//   - se excluyen las reglas de diagnóstico operativo del recolector
//     (106830 `collector_warning` y 106831 `collector_missing` de op.acc.1),
//     que no llevan `requisito=` ni `evidencia=` porque no acreditan ninguna:
//     son higiene del propio pipeline.
//
// Las reglas genéricas de `evidence_state` (106650 / 106850-106853 /
// 106950-106953) no se listan: engine.ts añade el ruleId del evento que
// resuelve la evidencia, así que aparecen solas cuando son el origen real del
// estado.
//
// Tampoco se listan —y este es el caso que hay que argumentar, porque invita a
// lo contrario— las reglas de los AGREGADOS, `control_state` y
// `score_snapshot`:
//
//   op.acc.1   control_state 106860-106863 y 106869
//              score_snapshot 106870-106872 y 106890
//   op.acc.2   control_state 106960-106964  score_snapshot 106970-106974
//
// Un agregado afirma algo sobre un REQUISITO o sobre un NIVEL entero, no sobre
// una evidencia. Acreditarlo en el `relatedRules` de una evidencia concreta
// sería el fallo de 106824 en su versión simétrica: un identificador que existe,
// está desplegado y lleva al auditor a un evento que habla de otra cosa. El
// criterio de esta lista es el de arriba —reglas que acreditan ESTA evidencia—,
// y ninguna de estas lo cumple.
//
// El 31/07 se completaron esas dos familias con su NO_EVALUABLE (106714,
// 106723, 106869, 106890, 106964, 106973) y con el NO_APLICA de
// `score_snapshot` de op.acc.2 (106974). Antes, un agregado con esos estados
// solo casaba con la regla base del control, que es `level="0"`: no generaba
// alerta y nunca llegaba al índice. Importa desde que un nivel sin ninguna no
// conformidad demostrada y con huecos de medida se publica NO_EVALUABLE, que lo
// convierte en un veredicto de primera clase.
//
// Lo que ese arreglo NO cambia, dicho aquí para que nadie lo busque en el
// motor: `score_snapshot` está en GENERIC_EVENT_TYPES de engine.ts y jamás
// resuelve una evidencia; su único consumidor es el gráfico de tendencia
// (dashboard-adapter/presenters/evolution.presenter.ts), que descarta todo
// snapshot sin `score` ni `compliance` numérico, y un NO_EVALUABLE no trae
// ninguno de los dos. El arreglo compra la línea de alerta y la traza del
// auditor, nada más.
//
// **DE QUÉ FICHERO SE SACAN, que es donde estuvo el fallo.** Del que está
// DESPLEGADO: la copia `manager/` del runbook, que es lo que instala su
// `install-manager.sh`. Acreditar una regla que el manager no tiene rompe la
// cadena en el último escalón sin que nada avise, porque el identificador es
// numérico, la regla existe en algún XML del repo y todo parece correcto.
//
// Pasó el 30/07 con op.acc.1: sus 52 reglas acreditadas se habían reconstruido
// contra `agent/rules/ensfacil_op_acc_1_json_rules.xml`, que entonces contenía
// los hechos crudos del recolector Python —hoy renombrado a
// `ensfacil_op_acc_1_technical_fact_rules.xml` y NO desplegado—. 39 de las 52
// eran inalcanzables. Y las 13 restantes tampoco eran de fiar: los dos juegos
// numeran el mismo rango 106800-106899, así que 106824 (que allí es
// `authentication_cursor_initialized`, EV-03) coincidía por número con el
// 106824 desplegado, que es `authorized_list_check` NO_CUMPLE de EV-07. Existir
// no basta: el id tiene que significar la misma evidencia en el manager.
//
// `tests/check-consistency.py` comprueba lo primero en cada ejecución.
//
// Tras reconstruir op.acc.1 contra lo desplegado, sus ocho evidencias conservan
// al menos una regla que las acredita: no hizo falta dejar ninguna vacía. Si
// alguna se hubiera quedado sin regla, iría vacía y documentada —como los diez
// huecos que ya llevan `ruleIds: []` en `configuration/data/`—, porque un hueco
// honesto vale más que un identificador que no lleva a ninguna parte.
//
// `expectedEventTypes` es el otro contrato con el agente: el motor solo resuelve
// una evidencia con eventos cuyo `eventType` esté en esta lista. Se llena con
// los nombres que emiten las reglas DESPLEGADAS del control, ni uno más. Un
// nombre que no emite nadie no acredita nada, y uno que se emite y no está aquí
// deja la evidencia sorda al hecho crudo. La comprobación 4 de
// `tests/check-consistency.py` vigila el primer caso; el segundo, para
// mp.info.6, lo vigila `tests/mp-info-6-judgment.test.ts` juzgando las pasadas
// reales de sus dos recolectores (`tests/fixtures/`).
export const ENSEvidenceCatalog: ENSEvidenceDefinition[] = [
  // mp.info.6 · Copias de seguridad. Reglas: banda 106600-106799, comunes a los
  // dos orígenes de copia (el PBS de Proxmox y Zimbra). El recolector emite
  // HECHOS con el contrato común (`origen`, `objeto` y los campos de cada
  // hecho) y un `evidence_state` solo cuando no pudo mirar (NO_EVALUABLE con
  // su causa); el veredicto lo pone la policy del control
  // (`policies/mp-info-6.policy.ts`) contra los parámetros de la pantalla.
  // Ninguna evidencia declara `judgment`: el juicio es copia a copia (por
  // origen, objeto y `backup_id`) y el peor manda, que no cabe en una
  // primitiva.
  //
  // Los hechos de ESTADO los reemite enteros el recolector en cada pasada; la
  // prueba de restauración es una ACCIÓN y se juzga con la ventana. Su última
  // pasada se delimita por `origen`: un servidor de buzones tiene dos
  // recolectores (PBS y Zimbra) que pasan a minutos distintos. Y como el
  // recolector solo declara huecos, un veredicto antiguo que siga en la
  // ventana no resuelve ninguna evidencia (`agentDeclaresOnlyGaps`).
  {
    id: 'EV-01',
    controlId: 'mp.info.6',
    title: 'Última copia realizada correctamente',
    description:
      'Estado de cada copia en la última pasada del recolector (`backup_run`): cuándo terminó bien por última vez, cuándo falló, el resultado de la última ejecución, su tipo y su destino. Una copia por origen (PBS, Zimbra) y objeto (ficheros, buzones, directorio). Incumple también si dejó fuera puntos de montaje de otro disco que no se incluyeron expresamente, salvo los que la organización acepta a propósito.',
    requirements: ['mp.info.6.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'EXECUTION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: ['evidence_state', 'backup_run'],
    stateFactEventTypes: ['backup_run'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106601'],
    auditQuestion: '¿Existe evidencia reciente de que la copia de seguridad se ha realizado correctamente?',
    qualityRequirements: {
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-02',
    controlId: 'mp.info.6',
    title: 'Copia dentro del intervalo permitido',
    description:
      'Antigüedad de la última copia correcta de cada copia (`backup_run`) frente a P-01 más el margen de P-02, y su planificación (`backup_schedule`: el cron real o `zmschedulebackup`) frente a P-01.',
    requirements: ['mp.info.6.1', 'mp.info.6.2.a'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'backup_run', 'backup_schedule'],
    stateFactEventTypes: ['backup_run', 'backup_schedule'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106601', '106602'],
    auditQuestion: '¿La última copia se encuentra dentro del intervalo máximo definido por la organización?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.info.6',
    title: 'Retención de las copias',
    description:
      'Retención configurada de cada copia (`backup_retention`) frente a P-03, con la copia más antigua que se conserva.',
    requirements: ['mp.info.6.2.b', 'mp.info.6.2.d'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API', 'SCA'],
    expectedEventTypes: ['evidence_state', 'backup_retention'],
    stateFactEventTypes: ['backup_retention'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106603'],
    auditQuestion: '¿Existe una política de retención configurada y verificable para las copias de seguridad?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.info.6',
    title: 'Acceso autorizado al repositorio',
    description:
      'Quién puede leer el repositorio de cada copia (`backup_access`: ruta, modo, propietario, grupo y cuentas con lectura) frente a P-07, y los permisos de la clave de cifrado de las copias: solo la puede leer su dueño (0600 o 0400).',
    requirements: ['mp.info.6.2.d'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'backup_access'],
    stateFactEventTypes: ['backup_access'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106604'],
    auditQuestion: '¿El acceso al repositorio de copias está limitado a usuarios y procesos autorizados?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.info.6',
    title: 'Prueba de restauración del testigo',
    description:
      'Pruebas de restauración sobre el testigo de cada copia (`restore_test`: fichero, cuenta de buzón o volcado del directorio): si restauró, si el contenido coincide con el esperado y si lo restaurado se pudo borrar después, frente al plazo de P-05.',
    requirements: ['mp.info.6.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'RECOVERY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    // Acción, no estado: cada prueba cuenta dentro de la ventana.
    expectedEventTypes: ['evidence_state', 'restore_test'],
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106606'],
    auditQuestion: '¿Existe evidencia de una prueba de restauración correcta dentro del periodo definido?',
    qualityRequirements: {
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-06',
    controlId: 'mp.info.6',
    title: 'Copia fuera de la máquina',
    description:
      'Destinos de cada copia (`backup_storage`): si están en la misma máquina, de qué tipo son (local, montaje, remoto) y si están activos. Acredita el almacenamiento en otros lugares y la copia en ubicación alternativa de R2; como la copia físicamente separada solo se exige en ALTO, solo aplica en ese nivel.',
    requirements: ['mp.info.6.2.c', 'mp.info.6.r2.1'],
    levels: ['ALTO'],
    category: 'OFFSITE',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: ['evidence_state', 'backup_storage'],
    stateFactEventTypes: ['backup_storage'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106605'],
    auditQuestion: '¿Existe una copia en ubicación alternativa operativa cuando el nivel ENS lo exige?',
    qualityRequirements: {
      rejectSynthetic: true,
    },
  },
  {
    // El latido del recolector (106797): que ha pasado por la máquina, con qué
    // resultado y qué evidencias declara haber cubierto.
    id: 'EV-07',
    controlId: 'mp.info.6',
    title: 'Latido del recolector de copias',
    description:
      'Última pasada del recolector de copias en la máquina (`collector_run`): su resultado, su papel (PBS, buzones, directorio) y las evidencias que declara cubiertas. Sin una pasada reciente y completa, lo que dicen los demás hechos no describe el estado de hoy.',
    requirements: ['mp.info.6.1', 'mp.info.6.2.b', 'mp.info.6.2.c'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'TRACEABILITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'collector_run'],
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106797'],
    auditQuestion: '¿Los eventos de backup y restauración son interpretados correctamente por Wazuh y ENSFácil?',
  },
  {
    id: 'EV-01',
    controlId: 'op.acc.1',
    title: 'Inventario de cuentas activas',
    description:
      'Existe un inventario de las cuentas de usuario activas en los sistemas monitorizados que permite verificar la unicidad del identificador.',
    requirements: ['op.acc.1.3', 'op.acc.1.4', 'op.acc.1.r1.2', 'op.acc.1.r1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API', 'SCA'],
    expectedEventTypes: ['evidence_state', 'account_inventory', 'account_active'],
    relatedRules: ['106809', '106810', '106811'],
    auditQuestion:
      '¿Existe un inventario actualizado de cuentas activas con identificador único por entidad?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.1',
    title: 'Cambios en ficheros de identidad',
    description:
      'Se detectan modificaciones en los ficheros o repositorios que controlan las identidades del sistema.',
    requirements: ['op.acc.1.3', 'op.acc.1.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: [
      'evidence_state',
      'account_created',
      'account_modified',
      'account_deleted',
    ],
    relatedRules: ['106812', '106813', '106818'],
    auditQuestion:
      '¿Se detectan y controlan las modificaciones no autorizadas sobre las cuentas del sistema?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.1',
    title: 'Detección de cuentas genéricas o compartidas',
    description:
      'No se detecta autenticación exitosa con cuentas genéricas o compartidas que rompan la unicidad del identificador.',
    requirements: ['op.acc.1.1', 'op.acc.1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'account_authenticated',
      'generic_account_login',
      'auth_success',
    ],
    relatedRules: ['106801', '106802', '106873'],
    auditQuestion:
      '¿Se garantiza que no se utilizan cuentas genéricas o compartidas para el acceso al sistema?',

    // PRIMERA EVIDENCIA QUE DECIDE EL MOTOR. Hasta aquí, el veredicto de EV-03
    // lo traía hecho el agente: leía su propia lista de cuentas genéricas de
    // /etc/ensfacil/opacc1.env y emitía `generic_account_login` (NO_CUMPLE) o
    // `auth_success` (CUMPLE). El nombre del evento YA ERA el juicio, y P-04 en
    // la pantalla de Configuración solo servía para comprobar que estaba
    // relleno: cambiar el valor no cambiaba ningún veredicto.
    //
    // Ahora el agente emite `account_authenticated` —qué cuenta se autenticó y
    // desde dónde, sin calificarla— y esta declaración es todo lo que hace
    // falta para que el motor la juzgue contra P-04. No hay código por control:
    // `NINGUNO_EN_LISTA` es la misma primitiva que usarán las demás.
    //
    // `factEventTypes` incluye los dos nombres viejos a propósito. Un agente
    // sin actualizar sigue emitiéndolos, y su campo `usuario` sigue siendo un
    // hecho perfectamente utilizable: lo que se descarta del modelo viejo es el
    // `estado`, que este camino no lee en ningún punto. Así la migración no
    // deja ciega a EV-03 ni sobre los datos ya indexados, y esos datos pasan a
    // juzgarse con el P-04 de HOY en vez de con el .env de aquel día.
    judgment: {
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-04',
      factEventTypes: [
        'account_authenticated',
        'generic_account_login',
        'auth_success',
      ],
      factField: 'usuario',
    },
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.1',
    title: 'Cuentas activas de usuarios dados de baja',
    description:
      'No existen cuentas que permanezcan habilitadas más tiempo del permitido tras la baja o cese del usuario.',
    requirements: ['op.acc.1.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: [
      'evidence_state',
      'account_disabled',
      'account_offboarding',
    ],
    relatedRules: ['106815', '106816', '106817'],
    auditQuestion:
      '¿Las cuentas de usuarios que causan baja se deshabilitan dentro del plazo definido?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.1',
    title: 'Cuentas de servicio con acceso interactivo',
    description:
      'No se detectan logins interactivos realizados con cuentas de proceso o servicio declaradas.',
    requirements: ['op.acc.1.2', 'op.acc.1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'account_authenticated',
      'service_account_interactive',
      'interactive_login',
    ],
    relatedRules: ['106805', '106806', '106873'],
    auditQuestion:
      '¿Se impide que las cuentas de servicio se utilicen para accesos interactivos?',

    // MIGRADA. Comparte el hecho crudo de EV-03 —`account_authenticated`, regla
    // 106873— y no hace falta ninguno nuevo: `_opacc1_logins` extrae las
    // `Accepted …` de sshd, que son exactamente los accesos INTERACTIVOS que
    // esta evidencia pregunta por. Lo único que cambia respecto a EV-03 es
    // contra qué lista se contrasta: P-03 (cuentas de servicio declaradas) en
    // vez de P-04 (cuentas genéricas prohibidas). Dos preguntas de auditoría
    // distintas sobre la misma observación, que es justo lo que este modelo
    // permite y el clásico no.
    //
    // El hecho llega etiquetado `evidence_id=EV-03,EV-05`: el normalizador lo
    // reparte en un evento por evidencia (`normalizeWazuhAlerts`), igual que
    // 106609 de mp.info.6 lleva `evidencia=EV-03,EV-07` desde antes de que
    // existiera este modelo.
    //
    // `factEventTypes` incluye los DOS nombres viejos, y aquí hay una regla que
    // no es evidente: los nombres viejos solo se pueden readmitir cuando entre
    // todos cubren la MISMA población que el hecho nuevo. Aquí sí —
    // `service_account_interactive` eran los infractores e `interactive_login`
    // el resto, así que su unión es el total de logins— y por eso los datos ya
    // indexados se pueden volver a juzgar con el P-03 de hoy. Cuando el nombre
    // viejo cubría solo a los infractores (es el caso de `unauthorized_user` en
    // EV-07), readmitirlo fabricaría un CUMPLE sobre una muestra sesgada.
    judgment: {
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-03',
      factEventTypes: [
        'account_authenticated',
        'service_account_interactive',
        'interactive_login',
      ],
      factField: 'usuario',
    },
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.1',
    title: 'Uso multi-rol sin identificadores diferenciados',
    description:
      'No se detecta un mismo identificador utilizado con privilegios administrativos y de usuario normal sin identificadores separados.',
    requirements: ['op.acc.1.2', 'op.acc.1.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'multi_role_usage', 'privilege_use'],
    relatedRules: ['106807', '106808'],
    auditQuestion:
      '¿Cada rol de un usuario dispone de un identificador diferenciado con sus privilegios delimitados?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.1',
    title: 'Estado de la lista de usuarios autorizados',
    description:
      'Existe y se mantiene actualizada una lista de usuarios autorizados contra la que se contrastan las cuentas activas (Refuerzo R1).',
    requirements: ['op.acc.1.r1.3'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: [
      'evidence_state',
      'account_active',
      'authorized_list_check',
      'unauthorized_user',
    ],
    relatedRules: ['106824', '106825', '106826', '106811'],
    auditQuestion:
      '¿Existe una lista actualizada de usuarios autorizados y todas las cuentas activas figuran en ella?',

    // MIGRADA, y es la que más devuelve al cliente: hasta hoy la «lista de
    // usuarios autorizados» era un FICHERO en cada máquina
    // (OPACC1_LISTA_AUTORIZADOS), y P-07 en la pantalla solo servía para
    // comprobar que estaba relleno. Un cliente de nivel MEDIO o ALTO tenía que
    // mantener a mano ese fichero en cada servidor, sincronizado con lo que el
    // auditor ve en Wazuh. Ahora la lista vive SOLO en P-07 y el agente no
    // lee ningún fichero de autorizados.
    //
    // Primera evidencia que apunta a un parámetro de tipo `table`, y por eso
    // declara `parameterColumn`: P-07 es 'usuario | sistema | rol' y lo que se
    // contrasta con una cuenta activa es el usuario. Sin esa declaración el
    // motor no compara nada y lo dice (ver `resolveReferenceValues`).
    //
    // El hecho ya existía: `account_active` (regla 106811), que ev01_inventario
    // emite por cada cuenta activa de /etc/passwd con el MISMO filtro que usaba
    // ev07_lista_autorizados (uid ≥ P-10, shell distinto de nologin/false).
    // Ahora sale etiquetado `evidence_id=EV-01,EV-07`.
    //
    // `factEventTypes` NO readmite los nombres viejos, y la razón es la que
    // EV-05 explica en positivo: `unauthorized_user` solo se emitía para las
    // cuentas que FALLABAN. Juzgar `TODOS_EN_LISTA` sobre esa muestra diría
    // «todas las cuentas observadas están autorizadas» en cuanto la única
    // observada resultara estar hoy en P-07 — un CUMPLE sobre una máquina con
    // cuarenta cuentas que nadie miró. Y `authorized_list_check` es un recuento
    // sin campo `usuario`: readmitirlo dejaría la evidencia en NO_EVALUABLE
    // permanente por hechos ilegibles.
    judgment: {
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-07',
      parameterColumn: 'usuario',
      factEventTypes: ['account_active'],
      factField: 'usuario',
    },
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.1',
    title: 'Eliminación prematura de cuentas',
    description:
      'No se eliminan cuentas deshabilitadas antes de cumplir el periodo de retención definido.',
    requirements: ['op.acc.1.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'TRACEABILITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: [
      'evidence_state',
      'account_deleted',
      'retention_violation',
    ],
    relatedRules: ['106818', '106819'],
    auditQuestion:
      '¿Se conservan las cuentas deshabilitadas durante el periodo de retención antes de eliminarlas?',
  },

  {
    id: 'EV-01',
    controlId: 'op.acc.2',
    title: 'Verificación de permisos en recursos del sistema',
    description:
      'Comprobación automatizada de que los recursos del sistema (ficheros, directorios, servicios, puertos) tienen controles de acceso que impiden su uso no autorizado. Detecta world-writable no permitidos, permisos abiertos y umask insuficiente.',
    requirements: ['op.acc.2.1', 'op.acc.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'sca_check',
      'world_writable',
      'umask_check',
    ],
    // 106905 es el par NO_CUMPLE de `sca_check` (106901 es el CUMPLE genérico,
    // que no mira `estado`). Sin él, un SCA con fallos salía en Wazuh como
    // nivel 3 diciendo CUMPLE: la trazabilidad llevaba al auditor a un evento
    // que decía lo contrario de lo que había pasado.
    relatedRules: ['106901', '106902', '106903', '106904', '106905'],
    auditQuestion:
      '¿Los recursos del sistema tienen controles de acceso que impiden su uso no autorizado?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.2',
    title: 'Monitorización de ficheros y registros del SO',
    description:
      'Vigilancia de cambios (creación, modificación, eliminación, cambio de permisos) en los componentes del sistema operativo y sus ficheros o registros de configuración declarados en P-02.',
    requirements: ['op.acc.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: [
      'evidence_state',
      'fim_modified',
      'fim_added',
      'fim_deleted',
    ],
    relatedRules: ['106920', '106921', '106922'],
    auditQuestion:
      '¿Se detectan y controlan los cambios no autorizados en los componentes del sistema operativo?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.2',
    title: 'Detección de accesos denegados y escaladas de privilegio',
    description:
      'Captura de eventos de autenticación y autorización fallidos o exitosos que evidencian intentos de acceso a recursos sin los derechos suficientes. Incluye accesos denegados por ACL y uso de sudo/su.',
    requirements: ['op.acc.2.1', 'op.acc.2.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'access_denied',
      'privilege_escalation',
      'sudo_usage',
    ],
    relatedRules: ['106910', '106911', '106912'],
    auditQuestion:
      '¿Se registran los intentos de acceso a recursos sin los derechos suficientes?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.2',
    title: 'Verificación de ACLs y derechos de acceso por recurso',
    description:
      'Auditoría de que los derechos de acceso a cada recurso siguen la política interna (P-04) y las decisiones del responsable del recurso. Detecta recursos con ACLs que difieren de la tabla P-06.',
    requirements: ['op.acc.2.2', 'op.acc.2.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'acl_check', 'acl_deviation'],
    relatedRules: ['106913', '106914'],
    auditQuestion:
      '¿Los derechos de acceso a cada recurso siguen la política interna y las decisiones del responsable?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.2',
    title: 'Verificación de privilegios individuales por usuario (R1)',
    description:
      'Comprobación de que cada usuario autorizado tiene privilegios mantenidos individualmente y de que restringen el tipo de acceso según P-05 y P-06. Detecta usuarios con privilegios excesivos o sin definición individual.',
    requirements: ['op.acc.2.r1.1', 'op.acc.2.r1.2'],
    levels: ['ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'privilege_check',
      'excessive_privilege',
      'group_membership',
    ],
    // 106933 es el par NO_CUMPLE de `privilege_check` (106930 es el CUMPLE
    // genérico). Mismo motivo que 106905 en EV-01.
    relatedRules: ['106930', '106931', '106932', '106933'],
    auditQuestion:
      '¿Cada usuario autorizado tiene privilegios mantenidos individualmente que restringen el tipo de acceso?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.2',
    title: 'Detección de accesos fuera del tipo permitido (R1)',
    description:
      'Identificación de accesos que superan el tipo de acceso autorizado para el usuario (lectura que intenta escribir, desarrollo que accede a producción, etc.). Requiere P-06 configurado.',
    requirements: ['op.acc.2.r1.2'],
    levels: ['ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'access_type_violation',
      'object_access',
    ],
    relatedRules: ['106935', '106936'],
    auditQuestion:
      '¿Se detectan accesos que superan el tipo de acceso autorizado para el usuario?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.2',
    title: 'Detección de vulnerabilidades de control de acceso en el SO',
    description:
      'El módulo rootcheck detecta configuraciones que debilitan el control de acceso: ficheros SUID/SGID no esperados, directorios con permisos excesivos, servicios corriendo con privilegios de root innecesariamente y ficheros sin propietario.',
    requirements: ['op.acc.2.1', 'op.acc.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'rootcheck',
      'suid_sgid',
      'no_owner_file',
    ],
    // 106924 es el par NO_CUMPLE de `rootcheck` (106925 es el CUMPLE
    // genérico). Aquí muerde más que en EV-01: EV-07 es una evidencia de
    // aserción negativa —cumple cuando no produce hechos—, así que un barrido
    // que SÍ encontró algo presentado como barrido limpio es indistinguible
    // del cumplimiento.
    relatedRules: ['106924', '106925', '106926', '106927'],
    auditQuestion:
      '¿Se detectan configuraciones del SO que debilitan el control de acceso (SUID/SGID, ficheros sin propietario)?',
  },
  {
    id: 'EV-01',
    controlId: 'op.acc.3',
    title: 'Detección de desarrollo y operación en la misma cuenta',
    description:
      'Identificación de cuentas que, dentro de la ventana P-06, han ejecutado tanto acciones clasificadas como desarrollo (según P-03) como acciones de operación. Vulnera directamente op.acc.3.1.',
    requirements: ['op.acc.3.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: detección de desarrollo y operación en la misma cuenta?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.3',
    title: 'Detección de autorización y control en la misma cuenta',
    description:
      'Identificación de cuentas que autorizan un acceso o cambio y a la vez ejercen la función de control o verificación sobre ese mismo ámbito. Vulnera op.acc.3.2.',
    requirements: ['op.acc.3.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: detección de autorización y control en la misma cuenta?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.3',
    title: 'Verificación de concurrencia en tareas críticas',
    description:
      'Comprobación de que las tareas declaradas como críticas en P-04 han sido ejecutadas o aprobadas por al menos el número de personas distintas exigido. Detecta tareas críticas realizadas unilateralmente.',
    // `op.acc.3` A SECAS ES EL ID DEL CONTROL, no el de ningún requisito, y
    // aquí producía una incoherencia que se veía en la misma pantalla: la tabla
    // de evidencias enseñaba «op.acc.3» en la columna Requisito ENS y la no
    // conformidad de dos bloques más abajo decía «op.acc.3.2». Un auditor que
    // ve dos identificadores distintos para lo mismo deja de fiarse del informe
    // entero, y con razón.
    //
    // Es el mismo error que tenía la policy —decidir contra el id del control—
    // corregido el 06/08/2026. Aquí quedó sin corregir porque este catálogo es
    // otro fichero. La concurrencia de tareas críticas la mide op.acc.3.2,
    // «las personas que autorizan y controlan el uso serán distintas», que es
    // literalmente el control dual que declara P-04.
    requirements: ['op.acc.3.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'critical_task_run'],
    relatedRules: ['107002'],
    auditQuestion:
      '¿Se acredita: verificación de concurrencia en tareas críticas?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.3',
    title: 'Detección de configuración y mantenimiento en la misma cuenta (R1)',
    description:
      'Identificación de cuentas que aúnan funciones de configuración del sistema y de mantenimiento dentro de la ventana P-06. Aplicable solo en nivel ALTO.',
    requirements: ['op.acc.3.r1.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: detección de configuración y mantenimiento en la misma cuenta (r1)?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.3',
    title: 'Cuentas de auditoría ejerciendo otras funciones (R1)',
    description:
      'Detección de cuentas incluidas en P-05 (auditoría/supervisión) que ejecutan acciones ajenas a su función: escritura, cambios de configuración, despliegues, gestión de usuarios. Vulnera op.acc.3.r1.2, que es taxativo (no admite el matiz «siempre que sea posible»).',
    requirements: ['op.acc.3.r1.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: cuentas de auditoría ejerciendo otras funciones (r1)?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.3',
    title: 'Inventario de acciones por cuenta y función',
    description:
      'Registro agregado de qué acciones ha ejecutado cada cuenta en el período, clasificadas por función según P-03. Es la evidencia documental de soporte para acreditar la segregación ante un auditor, incluso cuando no hay alertas.',
    requirements: ['op.acc.3.1', 'op.acc.3.2', 'op.acc.3.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: inventario de acciones por cuenta y función?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.3',
    title: 'Acceso a la información de seguridad del sistema',
    description:
      'Monitorización de accesos a la configuración de seguridad, logs de auditoría y consolas de gestión, para verificar que solo los administradores de seguridad/sistema autorizados acceden. Corresponde al Refuerzo R3, no obligatorio pero recomendable.',
    requirements: ['op.acc.3.r3.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'security_info_access'],
    relatedRules: ['107003'],
    auditQuestion:
      '¿Se acredita: acceso a la información de seguridad del sistema?',
  },
  {
    id: 'EV-01',
    controlId: 'op.acc.4',
    title: 'Verificación de denegación por defecto',
    description:
      'Comprobación de que la configuración de los sistemas aplica denegación por defecto: políticas de firewall con DROP por defecto, servicios sin acceso anónimo, recursos compartidos sin permisos para «Todos» o «Everyone».',
    requirements: ['op.acc.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'default_deny_violation'],
    relatedRules: ['107101'],
    judgment: {
      // Cada desviación observada de la denegación por defecto se contrasta
      // con las excepciones que el responsable haya declarado. Sin excepciones
      // declaradas la lista está vacía y cualquier desviación incumple, que es
      // lo que dice op.acc.4.1: todo acceso prohibido SALVO autorización
      // expresa. La carga de declarar la excepción es del auditado.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'recurso',
      factEventTypes: ['default_deny_violation'],
      factField: 'recurso',
    },
    auditQuestion:
      '¿Se acredita: verificación de denegación por defecto?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.4',
    title: 'Contraste de privilegios reales contra matriz autorizada',
    description:
      'Extracción de los privilegios efectivamente configurados en los sistemas (ACLs, membresías de grupo, permisos sudo) y comparación con la matriz P-01. Detecta privilegios asignados sin autorización expresa y privilegios superiores al mínimo imprescindible.',
    requirements: ['op.acc.4.1', 'op.acc.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'privilege_grant'],
    relatedRules: ['107102'],
    judgment: {
      // La primitiva del control: cada privilegio EFECTIVO observado tiene que
      // casar, celda a celda, con la fila que le corresponde en la matriz que
      // el responsable declaró. No basta con que el sujeto aparezca: el
      // recurso y el tipo de acceso también tienen que coincidir, porque un
      // 'rw' donde la matriz dice 'r' es exactamente el privilegio por encima
      // del mínimo que op.acc.4.2 prohíbe.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-01',
      factEventTypes: ['privilege_grant'],
      factField: 'sujeto',
      // `factKeyField` dice qué campo del HECHO identifica la fila;
      // `tableKeyColumn`, qué columna de la TABLA. Hacen falta las dos y se
      // llaman distinto a propósito: el hecho trae `sujeto` (lo que hay en la
      // máquina) y la política declara `rol` (lo que decidió el responsable).
      // Sin `tableKeyColumn` el índice de filas sale vacío y CONFORME_A_TABLA
      // no casa NUNCA: la evidencia se quedaba en NO_EVALUABLE para siempre.
      factKeyField: 'sujeto',
      tableKeyColumn: 'rol',
      // La fila la identifican sujeto Y recurso: `root` tiene una fila para
      // `sudo` y otra para el cortafuegos, y con clave simple el motor juzgaba
      // su sudo contra la fila del cortafuegos.
      factKeyFields: ['sujeto', 'recurso'],
      tableKeyColumns: ['rol', 'recurso'],
      tableChecks: [
        { column: 'recurso', factField: 'recurso' },
        { column: 'acceso', factField: 'acceso' },
      ],
    },
    auditQuestion:
      '¿Se acredita: contraste de privilegios reales contra matriz autorizada?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.4',
    title: 'Cambios en grupos privilegiados',
    description:
      'Detección de altas y bajas en los grupos declarados en P-06. Toda incorporación a un grupo privilegiado supone una concesión de derechos que debe estar contemplada en P-01 y realizada por personal competente (P-02).',
    requirements: ['op.acc.4.2', 'op.acc.4.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'privileged_group_member'],
    relatedRules: ['107103'],
    judgment: {
      // Todo miembro observado de un grupo privilegiado tiene que constar en
      // la matriz. La columna es `rol` y no `usuario` porque la matriz declara
      // PERFILES, no personas: es el nivel al que el responsable decide.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'rol',
      factEventTypes: ['privileged_group_member'],
      factField: 'usuario',
    },
    auditQuestion:
      '¿Se acredita: cambios en grupos privilegiados?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.4',
    title: 'Cambios de permisos por cuenta no competente',
    description:
      'Identificación de eventos de concesión, alteración o anulación de permisos ejecutados por cuentas que no figuran en P-02 como personal con capacidad de autorizar.',
    requirements: ['op.acc.4.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'permission_change'],
    relatedRules: ['107104'],
    judgment: {
      // Se contrasta el ACTOR —quien ejecuta el cambio—, no el sujeto sobre el
      // que recae. Confundirlos daría por buena una escalada en la que la
      // víctima está autorizada y quien la provoca no.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-02',
      // P-02 es una tabla `cuenta | ambito`. Sin nombrar la columna se
      // compararía la FILA ENTERA contra un nombre de cuenta y no encontraría
      // a nadie: todo actor saldría fuera de la lista.
      parameterColumn: 'cuenta',
      factEventTypes: ['permission_change'],
      factField: 'actor',
    },
    auditQuestion:
      '¿Se acredita: cambios de permisos por cuenta no competente?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.4',
    title: 'Control de la revisión periódica de permisos',
    description:
      'Registro de la fecha de la última revisión de permisos realizada y verificación de que no se ha superado el plazo P-03. La revisión puede detectarse por evidencias en el sistema o declararse en ENSFácil.',
    requirements: ['op.acc.4.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'permission_review'],
    relatedRules: ['107105'],
    judgment: {
      // La única evidencia EXISTENCIAL del control: le basta una revisión lo
      // bastante reciente. Y por eso mismo nunca cumple por ausencia — si no
      // consta ninguna, no se acredita. Es lo correcto: op.acc.4.4 exige que
      // los permisos se revisen periódicamente, y no haber revisado nunca no
      // puede salir en verde por falta de datos.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-03',
      factEventTypes: ['permission_review'],
      factField: 'fecha',
    },
    auditQuestion:
      '¿Se acredita: control de la revisión periódica de permisos?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.4',
    title: 'Accesos remotos por canal, origen y usuario',
    description:
      'Registro de todas las conexiones remotas al sistema con identificación de canal, puerto, IP de origen y cuenta. Contraste contra los canales permitidos (P-04) y los usuarios autorizados (P-05).',
    requirements: ['op.acc.4.5'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'remote_access'],
    relatedRules: ['107106'],
    judgment: {
      // Ninguna cuenta puede acceder remotamente sin figurar entre las que
      // tienen autorización expresa. `NINGUNO_FUERA_DE_LISTA` es la primitiva
      // correcta y no `TODOS_EN_LISTA`: lo que se exige no es que todos los
      // autorizados entren, sino que nadie más lo haga.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-05',
      factEventTypes: ['remote_access'],
      factField: 'usuario',
    },
    auditQuestion:
      '¿Se acredita: accesos remotos por canal, origen y usuario?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.4',
    title: 'Accesos a recursos sujetos a necesidad de conocer',
    description:
      'Monitorización de accesos a los recursos declarados en P-07, con identificación del perfil de la cuenta que accede. Detecta accesos por perfiles sin justificación declarada, aunque el permiso técnico exista.',
    requirements: ['op.acc.4.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'sensitive_access'],
    relatedRules: ['107107'],
    judgment: {
      // Lo que se juzga NO es si el permiso técnico existe —existe, por eso se
      // pudo acceder— sino si el perfil de quien accede tiene justificación
      // declarada para ese recurso. Es la diferencia entre poder y deber, que
      // es literalmente lo que pide op.acc.4.3.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-07',
      factEventTypes: ['sensitive_access'],
      factField: 'recurso',
      factKeyField: 'recurso',
      tableKeyColumn: 'recurso',
      tableChecks: [
        { column: 'perfiles', factField: 'perfil' },
      ],
    },
    auditQuestion:
      '¿Se acredita: accesos a recursos sujetos a necesidad de conocer?',
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.4',
    title: 'Cuentas con privilegios excesivos o innecesarios',
    description:
      'Identificación de cuentas cuyos privilegios exceden lo necesario: usuarios con shell innecesaria, cuentas de servicio con permisos de administrador, usuarios con sudo sin restricción de comandos (ALL=(ALL) ALL).',
    requirements: ['op.acc.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'excessive_privilege'],
    relatedRules: ['107108'],
    judgment: {
      // Un privilegio por encima del mínimo es un HECHO, no un veredicto: el
      // responsable puede haberlo autorizado. Solo incumple si el sujeto no
      // consta en la matriz.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'rol',
      factEventTypes: ['excessive_privilege'],
      factField: 'sujeto',
    },
    auditQuestion:
      '¿Se acredita: cuentas con privilegios excesivos o innecesarios?',
  },
  // op.acc.5 · Mecanismo de autenticación (usuarios externos).
  //
  // Nacido en el modelo nuevo, como op.acc.4: el agente emite hechos y cada
  // evidencia se juzga aquí contra la pantalla. Lo que ninguna primitiva expresa
  // —qué refuerzo cuenta según P-01, el incumplimiento directo de R1 en MEDIO y
  // ALTO, la parte documental de .8 y la declaración P-09— lo decide la policy
  // del control (`op-acc-5.policy.ts`), leyendo estos mismos veredictos.
  //
  // Dos evidencias usan P-02 como lista PROHIBIDA a propósito (EV-06 y EV-09):
  // el hallazgo es un rechazo revelador o una laguna en un servicio, y lo que se
  // afirma es «ningún servicio de acceso externo declarado lo presenta». Un
  // servicio fuera de P-02 no está en el alcance, y sin P-02 no se juzga nada.
  {
    id: 'EV-01',
    controlId: 'op.acc.5',
    title: 'Registro de accesos con éxito y fallidos',
    description:
      'Ingesta y conservación de todos los eventos de autenticación de los servicios de P-02, tanto exitosos como fallidos. Es la evidencia central del Refuerzo R5, obligatorio en MEDIO y ALTO, y la base sobre la que se construyen el resto de detecciones del control.',
    requirements: ['op.acc.5.r5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'access_log_source', 'external_auth_success', 'external_auth_failure'],
    relatedRules: ['110002', '110011'],
    judgment: {
      // Cada pasada declara cuántos días conserva en origen el registro de
      // autenticación de cada servicio. Todos tienen que alcanzar P-08. Los
      // éxitos y fallos (110001, 110002) son el registro mismo y viajan en la
      // traza; lo que se juzga es su conservación.
      primitive: 'UMBRAL_MINIMO',
      parameterId: 'P-08',
      factEventTypes: ['access_log_source'],
      factField: 'dias_conservados',
    },
    auditQuestion:
      '¿Se registran los accesos con éxito y fallidos de los servicios de P-02 y se conservan el periodo de P-08?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.5',
    title: 'Superación del límite de intentos sin bloqueo efectivo',
    description:
      'Límite de intentos que el servicio aplica (su política de bloqueo) y rachas de fallos consecutivos por cuenta. Cualquiera de los dos por encima de P-03 demuestra que el límite exigido por op.acc.5.8 no es el declarado o no es operativo. La política de complejidad viaja en la misma evidencia para op.acc.5.r1.2.',
    requirements: ['op.acc.5.8', 'op.acc.5.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'lockout_policy', 'failed_attempt_streak', 'password_policy'],
    relatedRules: ['110004', '110005', '110006'],
    judgment: {
      // Un solo campo para dos hechos: el límite CONFIGURADO (`lockout_policy`)
      // y la racha OBSERVADA (`failed_attempt_streak`). Ninguno puede superar
      // P-03. Sin política declarada no hay hecho que acredite el límite, y las
      // rachas solas no bastan: cero fallos no demuestran que haya límite. Un
      // bloqueo desactivado llega SIN `intentos` —un 0 pasaría el umbral— y lo
      // convierte en incumplimiento la policy.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-03',
      factEventTypes: ['lockout_policy', 'failed_attempt_streak'],
      factField: 'intentos',
    },
    auditQuestion:
      '¿El servicio limita los intentos a lo declarado en P-03 y el bloqueo es efectivo?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.5',
    title: 'Ataques de fuerza bruta y credential stuffing contra el servicio externo',
    description:
      'Fallos de autenticación agregados por origen: cuántos intentos y contra cuántas cuentas llegan desde una misma dirección. Un origen por encima de P-03 es un ataque que el mecanismo de bloqueo no ha contenido. Es el riesgo que op.acc.5.8 pretende mitigar.',
    requirements: ['op.acc.5.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_failures_by_origin'],
    relatedRules: ['110003'],
    judgment: {
      // Sin fallos no hay hechos y el umbral no cumple por ausencia. La policy
      // de .8 sí acepta ese silencio, pero solo con el latido declarando EV-03
      // cubierta: es la única lectura que hace de la cobertura.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-03',
      factEventTypes: ['auth_failures_by_origin'],
      factField: 'fallos',
    },
    auditQuestion:
      '¿Algún origen acumula más fallos de los que P-03 admite sin que se le contenga?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.5',
    title: 'Antigüedad de las credenciales frente a la periodicidad exigida',
    description:
      'Cálculo del tiempo transcurrido desde el último cambio de credencial de cada usuario externo activo, y contraste con la periodicidad P-05 fijada por la política de la organización.',
    requirements: ['op.acc.5.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_age'],
    relatedRules: ['110007'],
    judgment: {
      // Una cuenta cuyo último cambio no consta llega sin `dias_desde_cambio` y
      // deja la evidencia sin afirmar: no se sabe si su credencial está en plazo.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-05',
      factEventTypes: ['credential_age'],
      factField: 'dias_desde_cambio',
    },
    auditQuestion:
      '¿Ninguna credencial activa de usuario externo supera la periodicidad de cambio de P-05?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.5',
    title: 'Reacción ante compromiso o fin de relación',
    description:
      'Medición del intervalo entre el evento de notificación de pérdida, compromiso o revelación de una credencial (o de fin de relación del usuario con el sistema) y el evento de inhabilitación efectiva de esa credencial. Contraste con el plazo máximo P-06.',
    requirements: ['op.acc.5.5', 'op.acc.5.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_disable_delay'],
    relatedRules: ['110008'],
    judgment: {
      // Las pendientes se reemiten en cada pasada con las horas que llevan: una
      // notificación sin inhabilitar incumple sola en cuanto pasa P-06, sin
      // esperar a que alguien la cierre.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-06',
      factEventTypes: ['credential_disable_delay'],
      factField: 'horas',
    },
    auditQuestion:
      '¿Las credenciales comprometidas o de relaciones terminadas se inhabilitan dentro de P-06?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.5',
    title: 'Verificación de mensajes de error no informativos',
    description:
      'Detección de respuestas del servicio que revelan información sobre el sistema o la cuenta en los rechazos de autenticación: mensajes que distinguen «usuario inexistente» de «contraseña incorrecta», estado de la cuenta, trazas de error, versiones del software. Vulnera op.acc.5.7.',
    requirements: ['op.acc.5.7'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_error_verbose'],
    relatedRules: ['110009'],
    judgment: {
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-02',
      parameterColumn: 'servicio',
      factEventTypes: ['auth_error_verbose'],
      factField: 'servicio',
    },
    auditQuestion:
      '¿Algún servicio de acceso externo revela información sobre la cuenta o el sistema al rechazar una autenticación?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.5',
    title: 'Mecanismo de autenticación efectivamente aplicado (R1 a R4)',
    description:
      'Verificación de que las autenticaciones con éxito usan efectivamente el mecanismo del refuerzo declarado en P-01: contraseña en R1, contraseña más OTP en R2, certificado con PIN o biometría en R3, certificado en soporte físico con PIN en R4. Detecta sesiones completadas sin el factor adicional.',
    requirements: ['op.acc.5.r1.1', 'op.acc.5.r2.1', 'op.acc.5.r3.2', 'op.acc.5.r4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'external_auth_success'],
    relatedRules: ['110001'],
    judgment: {
      // El agente CLASIFICA los factores observados en la clase ENS (R1..R4 o
      // `ninguno`); qué clase se exige lo dice P-01. Toda autenticación con
      // éxito tiene que ser de la clase declarada: una de clase inferior es un
      // segundo factor que no se aplicó, y una superior es una P-01 que no
      // describe lo que el servicio hace, que el auditor también tiene que ver.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-01',
      factEventTypes: ['external_auth_success'],
      factField: 'refuerzo',
    },
    auditQuestion:
      '¿Todas las autenticaciones con éxito usan el mecanismo del refuerzo declarado en P-01?',
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.5',
    title: 'Validación de certificados y estado de revocación (R3, R4)',
    description:
      'Comprobación de que los certificados presentados provienen de las autoridades admitidas en P-07 y de que se ejecuta la consulta de revocación (OCSP o CRL) que P-07 declara para cada una. Detecta aceptación de certificados sin validar revocación.',
    requirements: ['op.acc.5.r3.1', 'op.acc.5.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'certificate_validation'],
    relatedRules: ['110010'],
    judgment: {
      // Una AC sin fila en P-07 sale NO_EVALUABLE / CONFIGURATION, no
      // NO_CUMPLE: el motor no distingue «no admitida» de «no declarada». El
      // requisito queda igualmente sin cumplir.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-07',
      factEventTypes: ['certificate_validation'],
      factField: 'emisor',
      factKeyField: 'emisor',
      tableKeyColumn: 'ac',
      tableChecks: [
        { column: 'validacion', factField: 'revocacion' },
      ],
    },
    auditQuestion:
      '¿Los certificados aceptados son de las AC de P-07 y se comprueba su revocación como P-07 declara?',
  },
  {
    id: 'EV-09',
    controlId: 'op.acc.5',
    title: 'Continuidad e integridad del registro de accesos',
    description:
      'Verificación de que el registro exigido por R5 no presenta lagunas: el registro de un servicio declarado que desaparece, o que encoge sin haber rotado. Una laguna en el registro compromete la acreditación de R5.',
    requirements: ['op.acc.5.r5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'access_log_gap'],
    relatedRules: ['110012'],
    judgment: {
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-02',
      parameterColumn: 'servicio',
      factEventTypes: ['access_log_gap'],
      factField: 'servicio',
    },
    auditQuestion:
      '¿El registro de accesos de los servicios de P-02 se conserva sin lagunas?',
  },
  {
    id: 'EV-01',
    controlId: 'op.acc.6',
    title: 'Registro de accesos con éxito y fallidos',
    description:
      'Barrido de las fuentes de autenticación declaradas en P-03 buscando huecos de registro: una fuente que no existe, que nunca ha registrado nada o cuya configuración no registra los accesos con éxito o los fallidos (LogLevel de sshd, olcLogLevel de slapd, journald sin almacenamiento). Los propios accesos (110101, 110102) son el registro que se acredita. Es la evidencia central del Refuerzo R5, obligatorio desde MEDIO.',
    requirements: ['op.acc.6.r5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_logging_gap', 'authentication_success', 'authentication_failure'],
    stateFactEventTypes: ['auth_logging_gap'],
    relatedRules: ['110101', '110102', '110105'],
    judgment: {
      // Un hueco de registro es un hallazgo de barrido. Solo incumple si la
      // fuente que no registra está entre las que la organización declara
      // monitorizar: un hueco en una fuente que no usa no le quita nada. Sin
      // huecos y con la fuente mirada (latido), el silencio vale.
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-03',
      factEventTypes: ['auth_logging_gap'],
      factField: 'fuente',
    },
    auditQuestion:
      '¿Registran las fuentes de autenticación declaradas los accesos con éxito y los fallidos, sin huecos?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.6',
    title: 'Verificación del doble factor en accesos desde zona no controlada',
    description:
      'Cada acceso con éxito con su origen y los factores que el servidor verificó, y cada canal de autenticación en escucha con las direcciones en que escucha y el mínimo de factores que exige. El motor clasifica origen y direcciones contra las zonas controladas de P-02. Es la evidencia del Refuerzo R8, obligatorio desde nivel BAJO, y la de R1 (contraseña solo desde zona controlada) y R2 (segundo factor).',
    requirements: ['op.acc.6.r1.1', 'op.acc.6.r2.1', 'op.acc.6.r8.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // SIN `judgment`, a propósito: la decide la policy de op.acc.6. Clasificar
    // una dirección contra rangos CIDR y exigir factores según la zona no es
    // ninguna de las siete primitivas (ver op-acc-6.policy.ts).
    expectedEventTypes: ['evidence_state', 'authentication_success', 'remote_channel_listening'],
    stateFactEventTypes: ['remote_channel_listening'],
    relatedRules: ['110101', '110108'],
    auditQuestion:
      '¿Todo acceso desde o a través de zona no controlada ha verificado dos factores, y ningún canal expuesto fuera de zona controlada admite uno solo?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.6',
    title: 'Límite de intentos y bloqueo efectivo de cuenta',
    description:
      'Configuración del límite de intentos de cada camino de autenticación con contraseña en uso (pam_faillock, pam_tally2 o la política del directorio): si hay bloqueo, tras cuántos fallos y si la cuenta se desbloquea sola. Se contrasta con P-05 y con la exigencia de que reactivar la cuenta requiera una intervención específica.',
    requirements: ['op.acc.6.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // SIN `judgment`: op.acc.6.8 son tres condiciones a la vez (hay bloqueo,
    // umbral dentro de P-05, sin desbloqueo automático) y las decide la policy.
    expectedEventTypes: ['evidence_state', 'lockout_policy_checked', 'account_locked'],
    stateFactEventTypes: ['lockout_policy_checked'],
    relatedRules: ['110103', '110104'],
    auditQuestion:
      '¿Cada camino de autenticación con contraseña bloquea la cuenta tras P-05 fallos y exige una intervención para reactivarla?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.6',
    title: 'Fallos acumulados sin bloqueo (fuerza bruta y password spraying)',
    description:
      'Fallos de autenticación agregados por cuenta, origen y canal en cada pasada, y bloqueos registrados. Una cuenta existente con más de P-05 fallos en una pasada sin bloqueo registrado evidencia que el límite no es operativo. Los fallos contra cuentas inexistentes se muestran como patrón de ataque pero no se pueden bloquear. Kerberoasting no aplica: no hay KDC.',
    requirements: ['op.acc.6.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // SIN `judgment`: correlaciona fallos y bloqueos por cuenta; la decide la
    // policy junto con EV-03.
    expectedEventTypes: ['evidence_state', 'authentication_failure', 'account_locked'],
    relatedRules: ['110102', '110103'],
    auditQuestion:
      '¿Alguna cuenta acumula más fallos de los admitidos sin que se registre su bloqueo?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.6',
    title: 'Antigüedad de credenciales y política de cambio',
    description:
      'Por cada credencial de una cuenta que puede autenticarse: su antigüedad en días (contraseña, desde /etc/shadow o pwdChangedTime; clave ssh, desde la fecha de su fichero, que es una cota inferior) y la caducidad que el sistema impone (99999 si no impone ninguna). Las dos medidas se contrastan con la periodicidad P-04.',
    requirements: ['op.acc.6.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_age_checked'],
    stateFactEventTypes: ['credential_age_checked'],
    relatedRules: ['110106'],
    judgment: {
      // Ningún valor puede superar P-04: ni la antigüedad de una credencial ni
      // la caducidad que el sistema permite. Una política que no impone
      // caducidad (99999) no garantiza el cambio periódico aunque hoy todas
      // las credenciales sean recientes, y eso es lo que pide op.acc.6.4.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-04',
      factEventTypes: ['credential_age_checked'],
      factField: 'dias',
    },
    auditQuestion:
      '¿Ninguna credencial supera la periodicidad de cambio P-04, y el sistema impone esa caducidad?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.6',
    title: 'Reacción ante compromiso y baja de personal',
    description:
      'Horas entre cada notificación de compromiso o de baja anotada por la organización y la inhabilitación de la cuenta observada por el agente, o las que lleva habilitada si no se ha inhabilitado. Contraste con el plazo máximo P-06.',
    requirements: ['op.acc.6.5', 'op.acc.6.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_disable_checked'],
    relatedRules: ['110107'],
    judgment: {
      // Existencial no: TODA notificación tiene que haberse atendido en plazo.
      // Sin notificaciones no hay nada que medir y queda NO_EVALUABLE, igual
      // que las bajas de op.acc.1 EV-04.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-06',
      factEventTypes: ['credential_disable_checked'],
      factField: 'horas',
    },
    auditQuestion:
      '¿Toda credencial comprometida o de una persona que causó baja se inhabilitó dentro del plazo P-06?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.6',
    title: 'Acceso remoto: canal y registro de auditoría',
    description:
      'Cada acceso remoto con éxito queda registrado con su canal, origen, usuario y métodos (el mismo hecho 110101 de EV-01 y EV-02). Se contrasta el canal con los autorizados en P-07. Cubre los apartados a) y d) de op.acc.6.r9.2; el cifrado y el uso constante de cada canal los cubre EV-08.',
    requirements: ['op.acc.6.r9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'authentication_success'],
    relatedRules: ['110101'],
    judgment: {
      // Lo que se exige no es que se usen todos los canales autorizados, sino
      // que nadie entre por otro. Con el log mirado y sin accesos, el silencio
      // vale (latido). Solo llegan aquí los accesos REMOTOS: la consola no se
      // etiqueta EV-07.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-07',
      parameterColumn: 'canal',
      factEventTypes: ['authentication_success'],
      factField: 'canal',
    },
    auditQuestion:
      '¿Todo acceso remoto registrado entró por un canal autorizado en P-07?',
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.6',
    title: 'Canales de acceso remoto: cifrado y habilitación',
    description:
      'Cada canal de acceso remoto en escucha fuera de loopback, con el cifrado que exige (ssh sí; ldap sin TLS obligatorio, no) y si arranca siempre. Se casa con su fila de P-07: el cifrado tiene que coincidir, y un canal que arranca siempre tiene que estar declarado de uso constante. Cubre los apartados b) y c) de op.acc.6.r9.2.',
    requirements: ['op.acc.6.r9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'remote_channel_listening'],
    stateFactEventTypes: ['remote_channel_listening'],
    relatedRules: ['110108'],
    judgment: {
      // Un canal sin fila no es un incumplimiento demostrado: es una decisión
      // que nadie ha escrito, y sale sin demostrar. La columna `uso_constante`
      // se contrasta con `habilitado_permanente`: un canal que arranca siempre
      // solo casa con una fila de uso constante.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-07',
      factEventTypes: ['remote_channel_listening'],
      factField: 'canal',
      factKeyField: 'canal',
      tableKeyColumn: 'canal',
      tableChecks: [
        { column: 'cifrado', factField: 'cifrado' },
        { column: 'uso_constante', factField: 'habilitado_permanente' },
      ],
    },
    auditQuestion:
      '¿Cada canal remoto en escucha está autorizado en P-07, cifra como declara y solo está habilitado siempre si su uso es constante?',
  },
  {
    id: 'EV-09',
    controlId: 'op.acc.6',
    title: 'Renovación de autenticación en puntos críticos (R6)',
    description:
      'Barrido de las configuraciones que permiten ejecutar un punto crítico sin volver a autenticarse: sudo con NOPASSWD o !authenticate, credencial de sudo sin caducidad, su con pam_wheel trust. Se contrasta con los puntos declarados en P-08. Obligatorio en nivel ALTO.',
    requirements: ['op.acc.6.r6.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'reauthentication_not_required'],
    stateFactEventTypes: ['reauthentication_not_required'],
    relatedRules: ['110109'],
    judgment: {
      // P-08 es la lista de puntos donde la sesión NO basta. Un hallazgo sobre
      // un punto declarado incumple; sobre uno no declarado, no. Barrido: sin
      // hallazgos y con la configuración leída, el silencio vale.
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-08',
      factEventTypes: ['reauthentication_not_required'],
      factField: 'punto',
    },
    auditQuestion:
      '¿Ningún punto declarado en P-08 se puede ejecutar amparándose solo en la sesión establecida?',
  },
  {
    id: 'EV-10',
    controlId: 'op.acc.6',
    title: 'Credenciales activas sin utilización prolongada (R7)',
    description:
      'Por cada cuenta habilitada (shell que permite sesión, no caducada, con contraseña usable o claves autorizadas), los días desde su último acceso: lo más reciente entre lastlog, wtmp y los accesos que el agente anota del log de autenticación. Una cuenta que nunca ha accedido cuenta desde la fecha de su credencial. Obligatorio en nivel ALTO.',
    requirements: ['op.acc.6.r7.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_inactivity_checked'],
    stateFactEventTypes: ['account_inactivity_checked'],
    relatedRules: ['110110'],
    judgment: {
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-09',
      factEventTypes: ['account_inactivity_checked'],
      factField: 'dias',
    },
    auditQuestion:
      '¿Ninguna cuenta habilitada lleva más de P-09 días sin utilizarse?',
  },
  {
    id: 'EV-11',
    controlId: 'op.acc.6',
    title: 'Complejidad y robustez de las contraseñas (R1)',
    description:
      'Lo que el sistema impone al fijar una contraseña: longitud mínima, clases de caracteres exigidas, historial y si se consulta una lista de bloqueo (pila password de PAM; en un directorio, su política de contraseñas). Se contrasta con los mínimos de P-10. Rige con R1 y con R2.',
    requirements: ['op.acc.6.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // SIN `judgment`: P-10 son varios mínimos a la vez y solo rige con R1 o
    // R2 (P-01). La decide la policy.
    expectedEventTypes: ['evidence_state', 'password_policy_checked'],
    stateFactEventTypes: ['password_policy_checked'],
    relatedRules: ['110111'],
    auditQuestion:
      '¿La política de contraseñas impuesta alcanza cada mínimo de P-10?',
  },
  {
    id: 'EV-12',
    controlId: 'op.acc.6',
    title: 'Información expuesta antes de autenticar',
    description:
      'Barrido de lo que cada servicio de autenticación muestra a quien todavía no se ha identificado: versión del software y de la distribución en la identificación de SSH, banner previo, rootDSE o bind anónimos del directorio. Se contrasta con lo que la organización admite en P-11. OpenSSH y slapd no distinguen usuario inexistente de credencial incorrecta hacia el cliente, así que ese caso no produce hallazgo.',
    requirements: ['op.acc.6.7'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_disclosure_observed'],
    stateFactEventTypes: ['auth_disclosure_observed'],
    relatedRules: ['110112'],
    judgment: {
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-11',
      factEventTypes: ['auth_disclosure_observed'],
      factField: 'exposicion',
    },
    auditQuestion:
      '¿Los servicios de autenticación solo exponen, antes de autenticar, lo que la organización admite en P-11?',
  },
  {
    id: 'EV-01',
    controlId: 'op.exp.1',
    title: 'Inventario de hardware y sistema operativo',
    description:
      'Foto del hardware y del sistema operativo de cada activo que toma el recolector de op.exp.1 en cada pasada: fabricante, modelo, número de serie, virtualización, CPU, memoria, sistema operativo, versión, kernel y arquitectura. Es la base del inventario técnico exigido por op.exp.1.1. No se lee de Syscollector: el inventario nativo no genera alertas (regla 221, nivel 0) y el motor solo lee wazuh-alerts-*.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'asset_system'],
    stateFactEventTypes: ['asset_system'],
    relatedRules: ['110201'],
    judgment: {
      // «Inventario ACTUALIZADO» dicho con una primitiva: la foto más reciente
      // del activo no puede ser más vieja que P-08. Se mide contra el reloj y
      // sobre el instante de emisión del hecho (`ts`), así que un agente que
      // deja de reportar ve caer esta evidencia sola, sin que nadie emita nada.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-08',
      factEventTypes: ['asset_system'],
      factField: 'ts',
    },
    auditQuestion:
      '¿Consta una foto del hardware y del sistema operativo de este activo tomada dentro del plazo declarado en P-08?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.1',
    title: 'Inventario de software y paquetes instalados',
    description:
      'Resumen del software instalado en cada activo en cada pasada: gestor de paquetes, número de paquetes y snaps, y huella de la lista completa, más las altas, bajas y actualizaciones respecto de la pasada anterior. Cubre de forma natural el contenido del Refuerzo R4 (relación de componentes software). En un servidor de directorio lleva además el paquete que instala el servicio LDAP y los ficheros del producto que no controla el gestor de paquetes.',
    requirements: ['op.exp.1.1', 'op.exp.1.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'software_inventory'],
    stateFactEventTypes: ['software_inventory'],
    relatedRules: ['110202'],
    judgment: {
      // Misma pregunta que EV-01 sobre otra fuente: si el gestor de paquetes
      // deja de poder leerse, el resumen deja de emitirse y esta evidencia
      // envejece aunque la foto del hardware siga al día.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-08',
      factEventTypes: ['software_inventory'],
      factField: 'ts',
    },
    auditQuestion:
      '¿Consta un inventario del software instalado en este activo tomado dentro del plazo declarado en P-08?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.1',
    title: 'Inventario de red: interfaces, puertos y procesos',
    description:
      'Interfaces de red con sus direcciones, servicios en escucha con su proceso y número de procesos en ejecución, en cada pasada. Es lo que dice qué servicios presta el activo, es decir, su naturaleza técnica. En un servidor de directorio el hecho solo se emite si además se ha podido observar el servicio LDAP (binario, escucha, sufijo del directorio): sin eso el inventario de esa máquina no dice lo que es.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'network_inventory'],
    stateFactEventTypes: ['network_inventory'],
    relatedRules: ['110203'],
    judgment: {
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-08',
      factEventTypes: ['network_inventory'],
      factField: 'ts',
    },
    auditQuestion:
      '¿Consta un inventario de las interfaces y los servicios en escucha de este activo tomado dentro del plazo declarado en P-08?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.1',
    title: 'Visualización continua del estado de los equipos',
    description:
      'Estado de la conexión del agente de Wazuh con el manager, leído del propio agente: estado (conectado, pendiente, desconectado) y último keepalive. Detecta el activo declarado que ha dejado de reportar de forma sostenida. Cubre de forma natural lo que pide el Refuerzo R2.',
    requirements: ['op.exp.1.1', 'op.exp.1.r2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'agent_status'],
    stateFactEventTypes: ['agent_status'],
    relatedRules: ['110204'],
    judgment: {
      // Se mide el keepalive que el agente registró con el manager, no el
      // instante del hecho: un agente desconectado que sigue escribiendo su
      // estado no puede pasar por conectado. Un agente que nunca conectó no
      // trae keepalive y la evidencia queda NO_EVALUABLE, nunca en verde.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-08',
      factEventTypes: ['agent_status'],
      factField: 'ultimo_keepalive',
    },
    auditQuestion:
      '¿El agente de este activo ha mantenido contacto con el manager dentro del plazo declarado en P-08?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.1',
    title: 'Detección de activos nuevos no inventariados',
    description:
      'Hosts vecinos que esta máquina ve en su tabla de vecinos de red (ARP / NDP), con su IP, MAC y si es la pasarela, sin sondear la red. Se contrastan con los activos sin agente declarados (P-02): un host que habla con el sistema y no figura en el inventario incumple directamente op.exp.1.1. No detecta hosts que no hablen con esta máquina.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'network_host_observed'],
    stateFactEventTypes: ['network_host_observed'],
    relatedRules: ['110205'],
    judgment: {
      // Un barrido: no ver ningún vecino sin declarar es lo normal en una red
      // bien inventariada, así que puede cumplir por silencio, pero solo con el
      // latido confirmando que la tabla de vecinos se leyó (EV-05 en
      // `evidencias_cubiertas`). El nombre del hecho no dice «no reconocido»:
      // eso lo decide este juicio.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-02',
      parameterColumn: 'ip',
      factEventTypes: ['network_host_observed'],
      factField: 'ip',
    },
    auditQuestion:
      '¿Todo host de red que se observa desde este activo figura, por su IP, en el inventario de activos sin agente (P-02)?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.1',
    title: 'Cambios en la composición de los activos',
    description:
      'Variaciones en el inventario de un activo existente —software instalado, eliminado o actualizado, cambios de hardware, servicios que empiezan o dejan de escuchar—, detectadas comparando cada foto con la anterior, y la revisión formal del inventario en la que esos cambios pasan al inventario declarado. Un inventario «actualizado» implica reflejar los cambios, no solo el alta inicial.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // Los cuatro tipos de cambio se escuchan para la traza, pero no se juzgan:
    // ningún parámetro declara qué cambio está autorizado, y juzgarlos uno a
    // uno sería inventar la política. Lo que se juzga es que la organización
    // REVISE el inventario dentro de P-04, que es el acto en el que esos
    // cambios quedan reflejados.
    expectedEventTypes: [
      'evidence_state',
      'inventory_review',
      'asset_software_change',
      'asset_hardware_change',
      'asset_port_opened',
      'asset_port_closed',
    ],
    relatedRules: ['110210', '110206', '110207', '110208', '110209'],
    judgment: {
      // Existencial: basta una revisión lo bastante reciente, y por eso nunca
      // cumple por ausencia. Sin revisión anotada no se acredita.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-04',
      factEventTypes: ['inventory_review'],
      factField: 'fecha',
    },
    auditQuestion:
      '¿Consta una revisión formal del inventario de este activo, que recoja sus cambios de composición, dentro del plazo declarado en P-04?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.1',
    title: 'Cobertura del inventario frente a activos declarados',
    description:
      'Contraste entre el activo que Wazuh observa (el nombre de máquina de la foto de EV-01) y la tabla de responsables declarada por el cliente (P-01). Un activo monitorizado sin fila en P-01 no tiene responsable ni naturaleza declarados, y eso es la mitad organizativa de op.exp.1.1 que Wazuh no puede ver por sí solo.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'asset_system'],
    stateFactEventTypes: ['asset_system'],
    relatedRules: ['110201'],
    judgment: {
      // El MISMO hecho de EV-01 (evidence_id=EV-01,EV-07): una observación, dos
      // preguntas. La población es la misma —el activo—, así que compartirlo
      // no juzga sobre una muestra sesgada.
      //
      // TODOS_EN_LISTA y no NINGUNO_FUERA_DE_LISTA: el hecho ACREDITA que el
      // activo existe; sin foto no se ha mirado nada y no puede cumplir.
      //
      // El responsable y la naturaleza no se comparan aquí porque no se
      // observan: son columnas OBLIGATORIAS de P-01, y una fila sin ellas deja
      // el parámetro inválido y el control sin poder cumplir.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'activo',
      factEventTypes: ['asset_system'],
      factField: 'activo',
    },
    auditQuestion:
      '¿El activo observado por Wazuh figura en la tabla de responsables (P-01), con responsable y naturaleza declarados?',
  },
  {
    id: 'EV-01',
    controlId: 'op.exp.2',
    title: 'Evaluación contra la línea base de configuración segura',
    description:
      'Ejecución periódica de la política SCA asignada a cada activo según P-01, con el detalle de checks superados y fallidos. Es la evidencia central del control: acredita de forma objetiva y repetible el estado de bastionado de cada equipo.',
    requirements: ['op.exp.2.1', 'op.exp.2.2', 'op.exp.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'sca_evaluation'],
    stateFactEventTypes: ['sca_evaluation'],
    relatedRules: ['110301'],
    judgment: {
      // Lo que se juzga es QUÉ línea base se evalúa en la máquina, no su
      // resultado: el resultado no está en el agente (vive en wazuh-db del
      // manager y el motor no lo lee del índice) y es EV-06. El hecho trae el
      // CONJUNTO de políticas que el agente ha evaluado de verdad según su
      // ossec.log, y se compara literal con la celda de su perfil en P-01: una
      // máquina que evalúa menos políticas de las asignadas no casa.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-01',
      factEventTypes: ['sca_evaluation'],
      factField: 'perfil',
      factKeyField: 'perfil',
      tableKeyColumn: 'perfil',
      tableChecks: [
        { column: 'politica_sca', factField: 'politicas' },
      ],
    },
    auditQuestion:
      '¿Se acredita: evaluación contra la línea base de configuración segura?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.2',
    title: 'Pervivencia de cuentas y contraseñas estándar',
    description:
      'Detección de cuentas por defecto de P-03 que siguen existiendo o, peor, que registran autenticaciones exitosas. op.exp.2.1 exige su retirada antes de la entrada en operación.',
    requirements: ['op.exp.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'login_account',
      'account_authenticated',
    ],
    stateFactEventTypes: ['login_account'],
    relatedRules: ['110302', '110303'],
    judgment: {
      // Dos poblaciones con el mismo campo: las cuentas que no están retiradas
      // (shell, contraseña utilizable o claves) y las que se autentican. Qué
      // nombres son «estándar» lo dice P-03, no el agente, y por eso el hecho
      // no se llama `standard_account_*`: el nombre no puede traer el veredicto.
      // Aserción negativa: sin ninguna cuenta y con el latido confirmado, cumple.
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-03',
      parameterColumn: 'cuenta',
      factEventTypes: ['login_account', 'account_authenticated'],
      factField: 'usuario',
    },
    auditQuestion:
      '¿Se acredita: pervivencia de cuentas y contraseñas estándar?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.2',
    title: 'Servicios y puertos no justificados en ejecución',
    description:
      'Contraste entre los servicios en ejecución y puertos en escucha detectados por Syscollector y la relación de servicios justificados por perfil (P-02). Todo lo que sobra es superficie de exposición innecesaria y vulnera la regla de mínima funcionalidad.',
    requirements: ['op.exp.2.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'service_exposed'],
    stateFactEventTypes: ['service_exposed'],
    relatedRules: ['110304'],
    judgment: {
      // Cada función expuesta se casa con la fila de SU perfil en P-02: el
      // servicio y el puerto tienen que estar entre los justificados. Un perfil
      // sin fila es mínima funcionalidad sin definir, y sale NO_EVALUABLE: es
      // la nota A12 del auditor, sin P-02 op.exp.2.2 no es evaluable.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-02',
      factEventTypes: ['service_exposed'],
      factField: 'perfil',
      factKeyField: 'perfil',
      tableKeyColumn: 'perfil',
      tableChecks: [
        { column: 'servicios', factField: 'servicio' },
        { column: 'puertos', factField: 'puerto' },
      ],
    },
    auditQuestion:
      '¿Se acredita: servicios y puertos no justificados en ejecución?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.2',
    title: 'Verificación de la regla de seguridad por defecto',
    description:
      'Comprobación de que los valores de configuración por defecto de los servicios son los seguros: cifrado activado, protocolos obsoletos deshabilitados, autenticación exigida, permisos restrictivos en la instalación inicial. Es la traducción práctica de op.exp.2.3.',
    requirements: ['op.exp.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'insecure_default'],
    stateFactEventTypes: ['insecure_default'],
    relatedRules: ['110305'],
    judgment: {
      // Barrido: cada valor por defecto inseguro es un hallazgo, y solo deja de
      // incumplir si el responsable lo autorizó en P-04. Se compara
      // `desviacion` (<máquina>:<comprobación>) y no la comprobación sola, para
      // que una excepción de un activo no excuse la misma desviación en otro.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-04',
      parameterColumn: 'comprobacion',
      factEventTypes: ['insecure_default'],
      factField: 'desviacion',
    },
    auditQuestion:
      '¿Se acredita: verificación de la regla de seguridad por defecto?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.2',
    title: 'Configuración segura de hipervisores y máquinas virtuales',
    description:
      'Verificación de que los anfitriones de virtualización declarados en P-06 están monitorizados, tienen política SCA propia y reciben el mismo tratamiento que las máquinas físicas en parcheado, gestión de cuentas y protección antimalware, como exige expresamente op.exp.2.4.',
    requirements: ['op.exp.2.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'virtualization_role'],
    stateFactEventTypes: ['virtualization_role'],
    relatedRules: ['110306'],
    judgment: {
      // Toda VM o anfitrión observado tiene que constar en el inventario P-06.
      // Una máquina física que no aloja nada no emite ningún hecho: con el
      // latido confirmado es un barrido sin hallazgos. Si el anfitrión de una VM
      // tiene agente es una pregunta ENTRE máquinas que un juicio por agente no
      // puede contestar; la responde el agente del propio anfitrión.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-06',
      parameterColumn: 'maquina',
      factEventTypes: ['virtualization_role'],
      factField: 'maquina',
    },
    auditQuestion:
      '¿Se acredita: configuración segura de hipervisores y máquinas virtuales?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.2',
    title: 'Evolución del nivel de cumplimiento de la línea base',
    description:
      'Serie temporal del porcentaje de checks SCA superados por activo y agregado del sistema. Permite distinguir un bastionado sólido y estable de una configuración que se degrada con el tiempo, y sirve de enlace natural con op.exp.3.',
    requirements: ['op.exp.2.2', 'op.exp.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'sca_score'],
    relatedRules: ['110307'],
    judgment: {
      // La serie de puntuaciones SCA de la ventana contra el umbral P-05:
      // ninguna puede quedar por debajo. La pendiente de la serie no se juzga
      // (no hay primitiva de tendencia); una degradación que cruza el umbral sí
      // se ve, y una que no lo cruza no incumple. El hecho lo trae el agente de
      // la API de Wazuh; sin acceso declarado no llega ninguno y sale
      // NO_EVALUABLE, nunca CUMPLE.
      primitive: 'UMBRAL_MINIMO',
      parameterId: 'P-05',
      factEventTypes: ['sca_score'],
      factField: 'puntuacion',
    },
    auditQuestion:
      '¿Se acredita: evolución del nivel de cumplimiento de la línea base?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.2',
    title: 'Conformidad previa a la entrada en operación',
    description:
      'Verificación de que cada activo superó la línea base ANTES de entrar en producción. Se contrasta la fecha de alta del agente y de puesta en servicio con la fecha del primer scan SCA conforme. Un equipo que entra en operación y luego se bastiona no cumple el enunciado de op.exp.2.',
    requirements: [],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    // Sin juicio y sin regla a propósito. «Configurado ANTES de entrar en
    // operación» es un orden entre la fecha de puesta en producción y la
    // primera evaluación conforme, y ninguna de las dos la observa un agente
    // después del hecho. No acredita ningún requisito (el enunciado del control
    // no es un requisito del catálogo): se documenta en P-07 y en el informe.
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: conformidad previa a la entrada en operación?',
  },
  {
    // Sin hecho en la máquina. La serie de resultados SCA vive en la base de
    // datos del manager y en el índice de estados SCA, no en el agente: el
    // recolector lo declara con un evidence_state NO_EVALUABLE (regla 110450) y
    // la evidencia se queda sin evidenciar hasta que exista una integración del
    // lado del manager que emita la serie por agente. No se acredita con otra
    // cosa: op.exp.3.1 y .2 remiten a op.exp.2 y lo que añaden es la CONTINUIDAD.
    id: 'EV-01',
    controlId: 'op.exp.3',
    title: 'Mantenimiento en el tiempo de la línea base',
    description:
      'Ejecución periódica y sostenida de las políticas SCA, con seguimiento de la evolución del cumplimiento por activo. A diferencia de op.exp.2, aquí lo relevante no es el resultado puntual sino la SERIE: demuestra que la funcionalidad mínima y el mínimo privilegio se mantienen «en todo momento».',
    requirements: ['op.exp.3.1', 'op.exp.3.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita que el cumplimiento de la línea base SCA se mantiene en el tiempo, como serie y no como foto?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.3',
    title: 'Ediciones de la configuración de seguridad y su autor',
    description:
      'Toda escritura sobre las rutas de configuración de seguridad (P-04) registrada por auditd, con la cuenta de la sesión que la hizo, la operación, el proceso y el intervalo en que ocurrió. En un servidor LDAP incluye los cambios de cn=config con la identidad del directorio que los hizo. Es la evidencia directa de op.exp.3.6.',
    requirements: ['op.exp.3.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_file_modified'],
    relatedRules: ['110401'],
    judgment: {
      // Se contrasta el ACTOR —la cuenta de la sesión, que sigue siendo la
      // persona aunque haya pasado por sudo— contra quien está autorizado a
      // editar. Es un barrido: no ver ninguna edición en una ventana es lo
      // normal en una máquina sana, y cumple SOLO si el latido confirma que
      // todas las rutas estaban vigiladas en el kernel. Por eso
      // NINGUNO_FUERA_DE_LISTA y no TODOS_EN_LISTA.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-03',
      parameterColumn: 'cuenta',
      factEventTypes: ['config_file_modified'],
      factField: 'actor',
    },
    auditQuestion:
      '¿Solo el personal autorizado en P-03 ha editado la configuración de seguridad?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.3',
    title: 'Elementos no autorizados introducidos en el sistema',
    description:
      'Software instalado de nuevo en el activo (no actualizado) y pedido de forma explícita, leído de dpkg.log y del historial de apt, con quién lo pidió y cuántas dependencias trajo. Se contrasta contra el software autorizado sobre la línea base (P-01). Es la verificación de elementos introducidos que exige op.exp.3.r1.2.',
    requirements: ['op.exp.3.r1.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'software_installed'],
    relatedRules: ['110402'],
    judgment: {
      // Cada instalación es un HALLAZGO de un barrido del registro de paquetes:
      // no ver ninguna es lo normal, y cumple si el recolector confirma que leyó
      // el registro. Tolerancia cero: P-08 se declara pero no rebaja esto.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'paquete',
      factEventTypes: ['software_installed'],
      factField: 'paquete',
    },
    auditQuestion:
      '¿Todo el software introducido en el periodo figura como autorizado sobre la línea base?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.3',
    title: 'Servicios en ejecución frente a la lista autorizada',
    description:
      'Servicios en ejecución en cada activo (unidades de systemd y procesos que escuchan en red fuera de ellas; en un servidor LDAP, además, los módulos, backends, overlays y puntos de escucha de slapd), con el perfil que identifica a la máquina en P-02. Cubre op.exp.3.r1.3 y, por remisión a op.exp.2, la parte de funcionalidad mínima de op.exp.3.1.',
    requirements: ['op.exp.3.1', 'op.exp.3.r1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'service_running'],
    stateFactEventTypes: ['service_running'],
    relatedRules: ['110403'],
    judgment: {
      // Los hechos ACREDITAN lo que corre en la máquina: sin ninguno no se ha
      // mirado, así que la primitiva es de tabla y nunca cumple por ausencia.
      // `factKeyField` dice qué campo del HECHO busca la fila y `tableKeyColumn`
      // qué columna de la TABLA; hacen falta los dos.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-02',
      factEventTypes: ['service_running'],
      factField: 'perfil',
      factKeyField: 'perfil',
      tableKeyColumn: 'perfil',
      tableChecks: [
        { column: 'servicios_autorizados', factField: 'servicio' },
      ],
    },
    auditQuestion:
      '¿Todos los servicios en ejecución figuran en la lista de servicios autorizados del perfil de la máquina?',
  },
  {
    // Sin hecho en la máquina: exige integración con el sistema de gestión de
    // cambios (P-06). El contrato previsto para cuando exista: el hecho
    // `config_file_modified` de EV-02 enriquecido con el cambio aprobado que lo
    // cubre, juzgado contra los cambios aprobados. Hasta entonces el recolector
    // lo declara NO_EVALUABLE y no se simula ninguna correlación.
    id: 'EV-05',
    controlId: 'op.exp.3',
    title: 'Cambios de configuración frente a su autorización previa',
    description:
      'Correlación entre cada edición de la configuración registrada por EV-02 y el cambio aprobado que la autoriza en el sistema de gestión de cambios declarado en P-06. Un cambio sin autorización asociada incumple op.exp.3.3. Requiere integración con el ITSM del cliente.',
    requirements: ['op.exp.3.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Cada cambio de configuración detectado tiene una autorización previa aprobada?',
  },
  {
    // Sin hecho en la máquina: la reacción a vulnerabilidades se mide sobre el
    // detector de vulnerabilidades del manager, que es la evidencia de op.exp.4
    // (tiempo de remediación). El motor resuelve las evidencias por control y no
    // puede leer las de op.exp.4; duplicar aquí su medida daría dos números
    // sobre el mismo hecho. Se declara la dependencia y queda sin evidenciar.
    id: 'EV-06',
    controlId: 'op.exp.3',
    title: 'Reacción de la configuración ante vulnerabilidades notificadas',
    description:
      'Seguimiento de las vulnerabilidades detectadas en los activos y de si la configuración se ha ajustado o se ha aplicado la actualización correspondiente. op.exp.3.4 remite a op.exp.4, que es quien mide la remediación con el detector de vulnerabilidades del manager.',
    requirements: ['op.exp.3.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿El sistema reacciona a las vulnerabilidades notificadas (medido por op.exp.4)?',
  },
  {
    // Sin hecho en la máquina: exige un registro de incidentes (op.exp.7) con
    // el que correlacionar las ediciones de EV-02. No existe todavía.
    id: 'EV-07',
    controlId: 'op.exp.3',
    title: 'Reacción de la configuración ante incidentes',
    description:
      'Verificación de que, tras un incidente de seguridad registrado, se produjeron los cambios de configuración correspondientes en los activos afectados, o consta por qué no procedían. op.exp.3.5 remite a op.exp.7. Requiere el registro de incidentes.',
    requirements: ['op.exp.3.5'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Los incidentes cerrados produjeron una reacción en la configuración de los activos afectados?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.3',
    title: 'Concentración de la administración de la configuración (R2)',
    description:
      'Número de cuentas distintas que han editado de verdad la configuración de seguridad en la ventana de observación, contado sobre lo que registra EV-02. Mide cuántos administradores hay en la práctica, no cuántos están autorizados. Solo se emite cuando la ventana entera se ha observado sin huecos.',
    requirements: ['op.exp.3.r2.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_admins_observed'],
    relatedRules: ['110404'],
    judgment: {
      // Un recuento de una ventana PARCIAL saldría por debajo del real, y un
      // número bajo contra un máximo es un CUMPLE falso: por eso el agente no
      // emite el hecho hasta tener la ventana completa. Sin hecho, NO_EVALUABLE.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-09',
      factEventTypes: ['config_admins_observed'],
      factField: 'administradores',
    },
    auditQuestion:
      '¿La configuración de seguridad la administra en la práctica un número de cuentas no superior al máximo declarado?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.3',
    title: 'Existencia y frescura de las copias de configuración (R3)',
    description:
      'Instante de la copia más reciente de la configuración, del alcance que peor está (el sistema; en un servidor LDAP, además, cn=config). Se mide su antigüedad contra el reloj y el plazo de P-10. Sin ninguna copia no hay hecho y no se acredita la capacidad de reconstrucción que exige op.exp.3.r3.1.',
    requirements: ['op.exp.3.r3.1'],
    levels: ['ALTO'],
    category: 'RECOVERY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_backup_observed'],
    relatedRules: ['110405'],
    judgment: {
      // Existencial: le basta una copia lo bastante reciente, y por eso nunca
      // cumple por ausencia. El hecho es el INSTANTE de la copia, no las horas
      // que lleva: así la antigüedad crece sola si las copias se paran.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-10',
      factEventTypes: ['config_backup_observed'],
      factField: 'fecha',
    },
    auditQuestion:
      '¿Existe una copia de la configuración lo bastante reciente como para reconstruir el sistema?',
  },
  {
    // Sin hecho en la máquina, por lo mismo que EV-01: las regresiones se
    // calculan sobre la serie de resultados SCA del manager.
    id: 'EV-10',
    controlId: 'op.exp.3',
    title: 'Regresiones del estado de seguridad de la configuración',
    description:
      'Checks SCA que pasaron de conforme a no conforme entre dos evaluaciones sucesivas, por activo. Es el indicador más directo de que la gestión continua de la configuración falla. Requiere la serie de resultados SCA del manager.',
    requirements: ['op.exp.3.1', 'op.exp.3.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se han detectado regresiones de checks SCA de conforme a no conforme en el periodo?',
  },
  {
    // Partida de EV-03: la plantilla trata la periodicidad de la verificación
    // como una condición de incumplimiento propia (A11), y una evidencia tiene
    // un solo juicio. EV-03 juzga lo introducido contra P-01; EV-11, el plazo.
    id: 'EV-11',
    controlId: 'op.exp.3',
    title: 'Verificación periódica de la configuración frente a la línea base',
    description:
      'Fecha de la verificación formal más reciente de la configuración hardware/software frente a la línea base aprobada, anotada por la organización en el registro del runbook, contrastada con la periodicidad de P-05. Acredita la periodicidad que exige op.exp.3.r1.2.',
    requirements: ['op.exp.3.r1.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'baseline_verification_performed'],
    relatedRules: ['110406'],
    judgment: {
      // Un acto de la organización: nunca cumple por ausencia. No haber
      // verificado nunca no puede salir en verde por falta de datos.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-05',
      factEventTypes: ['baseline_verification_performed'],
      factField: 'fecha',
    },
    auditQuestion:
      '¿La última verificación formal de la configuración es más reciente que la periodicidad declarada?',
  },
  // --- op.exp.4 · Mantenimiento y actualizaciones de seguridad -------------
  //
  // Tres evidencias las juzga una primitiva (EV-04, EV-06, EV-11): un hecho
  // contra un parámetro. Las demás las mide la policy del control
  // (`policies/op-exp-4.policy.ts`), porque su juicio no cabe en ninguna de las
  // siete: EV-02 encadena P-08 (CVSS → criticidad) con P-01 (criticidad →
  // días) y mide contra el reloj; EV-05 compara fechas de fin de soporte con
  // hoy; EV-07 sitúa cada cambio en ventanas horarias; EV-09 exige que el punto
  // de reversión sea ANTERIOR al cambio. Sin `judgment`, la policy las resuelve
  // y el puente de `evaluation/policy-evidence-bridge.ts` lo lleva a la tabla.
  //
  // Reglas: todas de la banda 110500-110599, desplegadas por el runbook
  // `linux/op.exp.4` (y su copia LDAP).
  {
    id: 'EV-01',
    controlId: 'op.exp.4',
    title: 'Inventario continuo de vulnerabilidades por activo',
    description:
      'Detección automática de vulnerabilidades conocidas (CVE) en los productos instalados en cada activo, cruzando el inventario de Syscollector con los feeds de los fabricantes y bases públicas. Es la evidencia central del control y, además, cubre de facto el Refuerzo R4.',
    requirements: ['op.exp.4.1', 'op.exp.4.2', 'op.exp.4.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // La cabecera de la instantánea del estado del Vulnerability Detector que el
    // puente del manager entrega al agente. Continuo = una instantánea reciente.
    expectedEventTypes: ['evidence_state', 'vulnerability_inventory'],
    relatedRules: ['110501'],
    auditQuestion:
      '¿Consta un inventario reciente de las vulnerabilidades de este activo?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.4',
    title: 'Tiempo de remediación frente a los plazos del procedimiento',
    description:
      'Medición del tiempo transcurrido entre la primera detección de cada vulnerabilidad y su desaparición del inventario (por parcheo o mitigación), contrastado con el plazo que le corresponde según su criticidad en P-01 y P-08. Es la evidencia directa de op.exp.4.2.',
    requirements: ['op.exp.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // `vulnerability_open` es la abierta MÁS ANTIGUA de cada puntuación CVSS,
    // con el instante de su detección: la misma puntuación da la misma
    // criticidad y el mismo plazo, así que juzgar la más antigua basta. El
    // agente no resta fechas.
    expectedEventTypes: ['evidence_state', 'vulnerability_open', 'vulnerability_resolved'],
    relatedRules: ['110502', '110503'],
    auditQuestion:
      '¿Se resuelven las vulnerabilidades dentro del plazo que el procedimiento fija para su criticidad?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.4',
    title: 'Estado de parcheado del parque',
    description:
      'Inventario de versiones de paquetes, aplicaciones y actualizaciones instaladas en cada activo, incluidos los hotfixes de Windows. Permite acreditar que el mantenimiento se realiza efectivamente y conocer el nivel de actualización real del parque.',
    requirements: ['op.exp.4.1', 'op.exp.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'patch_status'],
    relatedRules: ['110504'],
    auditQuestion:
      '¿Está la máquina al día de sus actualizaciones de seguridad, parches activos incluidos?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.4',
    title: 'Instalaciones y actualizaciones por personal no autorizado',
    description:
      'Detección de instalaciones, actualizaciones o desinstalaciones de software cuyo actor no figura entre el personal autorizado de P-02. op.exp.4.3 es taxativo: el mantenimiento solo puede realizarlo personal debidamente autorizado.',
    requirements: ['op.exp.4.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'package_changed'],
    relatedRules: ['110505'],
    judgment: {
      // Se contrasta el ACTOR de cada transacción de software. Es un barrido de
      // los logs de apt y dpkg: no encontrar ningún cambio en la ventana, con
      // el latido declarando que los logs se leyeron, es el resultado normal
      // de una máquina sin mantenimiento no autorizado.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-02',
      // P-02 es `cuenta | ambito | tipo`: sin nombrar la columna se compararía
      // la fila entera con un nombre de cuenta y todo actor saldría fuera.
      parameterColumn: 'cuenta',
      factEventTypes: ['package_changed'],
      factField: 'actor',
    },
    auditQuestion:
      '¿Todo cambio de software lo ha hecho una cuenta autorizada para el mantenimiento?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.4',
    title: 'Software fuera de soporte del fabricante',
    description:
      'Identificación de productos instalados cuya versión ha alcanzado el fin de soporte declarado en P-05, o está próxima a alcanzarlo. Un componente sin soporte no recibirá actualizaciones de seguridad, lo que impide materialmente cumplir op.exp.4.1.',
    requirements: ['op.exp.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'product_support'],
    relatedRules: ['110506'],
    auditQuestion:
      '¿Todo producto instalado sigue dentro del soporte de su fabricante?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.4',
    title: 'Cobertura del seguimiento de anuncios de defectos',
    description:
      'Contraste entre los fabricantes y productos realmente presentes en el inventario y las fuentes de seguimiento declaradas en P-03 y los feeds activos del Vulnerability Detector. Revela puntos ciegos: productos desplegados de los que nadie vigila los boletines.',
    requirements: ['op.exp.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'vendor_observed'],
    relatedRules: ['110507'],
    judgment: {
      // Cada fabricante presente en el inventario ACREDITA algo que existe en la
      // máquina, así que no observar ninguno no es cumplir: es no haber mirado.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-03',
      parameterColumn: 'fabricante',
      factEventTypes: ['vendor_observed'],
      factField: 'fabricante',
    },
    auditQuestion:
      '¿Se siguen los anuncios de defectos de todos los fabricantes del software instalado?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.4',
    title: 'Actualizaciones aplicadas fuera de ventana de mantenimiento',
    description:
      'Detección de cambios de software aplicados fuera de las franjas autorizadas en P-04, lo que puede indicar intervención improvisada al margen del procedimiento de gestión de cambios exigido por op.exp.4.2.',
    requirements: ['op.exp.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // El MISMO hecho de EV-04: la transacción trae su instante en hora local.
    expectedEventTypes: ['evidence_state', 'package_changed'],
    relatedRules: ['110505'],
    auditQuestion:
      '¿Se aplican los cambios de software dentro de las ventanas de mantenimiento declaradas?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.4',
    title: 'Trazabilidad del paso por preproducción (R1)',
    description:
      'Verificación de que cada versión desplegada en producción estuvo previamente instalada en el entorno de preproducción emparejado en P-06. Es la evidencia técnica del Refuerzo R1, obligatorio desde categoría MEDIA.',
    requirements: ['op.exp.4.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Los cambios de software de producción y de su preproducción. La
    // precedencia exige cruzar DOS máquinas y el motor evalúa cada una por
    // separado: hoy la policy la declara sin demostrar, siempre.
    expectedEventTypes: ['evidence_state', 'package_changed'],
    relatedRules: ['110505'],
    auditQuestion:
      '¿Pasó cada versión desplegada en producción antes por su preproducción?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.4',
    title: 'Existencia de punto de reversión previo (R2)',
    description:
      'Verificación de que antes de cada aplicación de parches o cambios de configuración se generó el mecanismo de reversión declarado en P-07: snapshot, backup o imagen. R2 es obligatorio en categoría ALTA.',
    requirements: ['op.exp.4.r2.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'reversion_point_created', 'package_changed'],
    relatedRules: ['110505', '110508'],
    auditQuestion:
      '¿Existía un punto de reversión antes de cada cambio de software?',
  },
  {
    id: 'EV-10',
    controlId: 'op.exp.4',
    title: 'Evolución de la deuda de vulnerabilidades',
    description:
      'Serie temporal del número de vulnerabilidades abiertas por criticidad y del tiempo medio de remediación. Distingue una organización que parchea con ritmo sostenido de otra que acumula deuda, que es exactamente lo que un auditor busca valorar en este control.',
    requirements: ['op.exp.4.2', 'op.exp.4.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'vulnerability_inventory', 'vulnerability_resolved'],
    relatedRules: ['110501', '110503'],
    auditQuestion:
      '¿Se mantiene o reduce la deuda de vulnerabilidades en lugar de crecer semana tras semana?',
  },
  {
    id: 'EV-11',
    controlId: 'op.exp.4',
    title: 'Versiones de firmware de dispositivos hardware (R3)',
    description:
      'Registro de las versiones de firmware de los dispositivos de P-09 y contraste con los boletines del fabricante para detectar versiones vulnerables o desactualizadas. Corresponde al Refuerzo R3, no obligatorio en ninguna categoría.',
    requirements: ['op.exp.4.r3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'LOW',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'firmware_version'],
    relatedRules: ['110509'],
    judgment: {
      // La versión observada tiene que ser la que la fila de su dispositivo
      // declara. Registra VERSIÓN, no integridad: eso exige herramientas del
      // fabricante.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-09',
      factEventTypes: ['firmware_version'],
      factField: 'dispositivo',
      factKeyField: 'dispositivo',
      tableKeyColumn: 'dispositivo',
      tableChecks: [
        { column: 'firmware_actual', factField: 'version' },
      ],
    },
    auditQuestion:
      '¿Coincide el firmware observado con la versión declarada para el dispositivo?',
  },
  // --- op.exp.5 · Gestión de cambios ---------------------------------------
  //
  // Ninguna evidencia declara primitiva: todas las mide la policy del control
  // (`policies/op-exp-5.policy.ts`), porque su pregunta cruza dos poblaciones
  // de hechos —los cambios REALES de la máquina y las peticiones del registro
  // que mantiene la organización— por sistema y por intervalo de tiempo, y
  // ninguna de las siete compara así. Sin `judgment`, la policy las resuelve y
  // el puente de `evaluation/policy-evidence-bridge.ts` lo lleva a la tabla.
  //
  // Sin ITSM, el registro de peticiones es `/etc/ensfacil/change-register.tsv`
  // en cada máquina: el recolector lo lee y lo emite tal cual (110605 cabecera
  // y 110606 una fila por petición). Los cambios reales reutilizan el CÓDIGO de
  // op.exp.3 (auditd por ruta) y de op.exp.4 (apt y dpkg con actor, puntos de
  // reversión), reetiquetado op.exp.5: el motor filtra por control y no puede
  // leer los hechos de otro.
  //
  // Reglas: todas de la banda 110600-110699, desplegadas por el runbook
  // `linux/op.exp.5` (y su copia LDAP).
  {
    id: 'EV-01',
    controlId: 'op.exp.5',
    title: 'Cambios reales detectados en los sistemas',
    description:
      'Registro de todos los cambios efectivamente producidos en la máquina: escrituras en las rutas de configuración vigiladas por auditd (con su autor), transacciones de software de apt y dpkg (con su actor), puertos en escucha que aparecen o desaparecen y componentes de hardware que cambian. Es la base objetiva contra la que se contrasta el registro de peticiones. Se acredita cuando el latido del recolector declara leídas las cuatro fuentes.',
    requirements: ['op.exp.5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed'],
    relatedRules: ['110601', '110602', '110603', '110604'],
    auditQuestion:
      '¿Se detectan todos los cambios reales de la máquina, con su autor cuando se puede saber?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.5',
    title: 'Cambios implantados sin petición registrada',
    description:
      'Correlación entre cada cambio real de EV-01 y las peticiones del registro de la máquina: tiene que haber una petición aprobada ANTES del cambio, del mismo sistema, cuya ventana contenga el cambio (o, para un cambio que solo se sabe entre dos pasadas, que solape con él). Un cambio sin petición es el hallazgo principal del control. La fuente de las peticiones es un registro mantenido a mano, no un ITSM, y el motivo lo dice.',
    requirements: ['op.exp.5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'change_register_read', 'change_request_registered', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed'],
    relatedRules: ['110601', '110602', '110603', '110604', '110605', '110606'],
    auditQuestion:
      '¿Cada cambio real de la máquina tiene una petición aprobada cuya ventana lo cubre?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.5',
    title: 'Completitud de la información de la petición de cambio',
    description:
      'Verificación de que cada petición autorizada (aprobada, implantada o revertida) del registro trae rellenos los campos mínimos declarados en P-02 y, si P-01 lo declara, un número con el prefijo de referencia. En categoría ALTA se exige además la valoración del impacto en la seguridad (op.exp.5.r1.3). Una fila que no tiene las catorce columnas es una petición que no se puede leer.',
    requirements: ['op.exp.5.2', 'op.exp.5.r1.3'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'change_register_read', 'change_request_registered'],
    relatedRules: ['110605', '110606'],
    auditQuestion:
      '¿Traen las peticiones autorizadas la información suficiente para decidir sobre ellas?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.5',
    title: 'Aprobación previa del RSI en cambios de riesgo ALTO',
    description:
      'Para cada petición de riesgo alto implantada (o que cubre algún cambio real), que la aprobó la cuenta del Responsable de la Seguridad de P-04 y que la fecha de aprobación es ANTERIOR a la implantación: el primer cambio real que la petición cubre o, si no se ha observado ninguno, el inicio de su ventana. Exige que los criterios de riesgo alto (P-03) estén declarados.',
    requirements: ['op.exp.5.4'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'change_register_read', 'change_request_registered', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed'],
    relatedRules: ['110601', '110602', '110603', '110604', '110605', '110606'],
    auditQuestion:
      '¿Los cambios de riesgo alto los aprobó el RSI antes de implantarlos?',
  },
  {
    // Sin regla a propósito. Demostrar que un cambio pasó ANTES por la
    // preproducción exige cruzar los cambios de dos máquinas, y el motor evalúa
    // cada una por separado (el mismo límite que EV-08 de op.exp.4). La columna
    // «preproduccion» del registro es una declaración, no una observación: no
    // la sustituye. La policy la deja NO_EVALUABLE con su motivo.
    id: 'EV-05',
    controlId: 'op.exp.5',
    title: 'Trazabilidad del paso por preproducción',
    description:
      'Comprobación de que los cambios aplicados en producción tuvieron actividad equivalente previa en el sistema de preproducción emparejado en P-05. Hoy no se puede demostrar: exige cruzar las dos máquinas y el motor evalúa cada una por separado.',
    requirements: ['op.exp.5.3'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Pasó cada cambio de producción antes por su preproducción equivalente?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.5',
    title: 'Actualización de la documentación de configuración tras el cambio',
    description:
      'Para cada petición implantada que declara en su columna «documentacion» documentos de P-06, que el fichero del documento se modificó entre el inicio de la ventana del cambio y el fin de su ventana más el plazo de P-06. Solo se puede comprobar un documento que sea un fichero de la máquina vigilado por su recolector.',
    requirements: ['op.exp.5.5'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'change_register_read', 'change_request_registered', 'config_doc_modified'],
    relatedRules: ['110605', '110606', '110607'],
    auditQuestion:
      '¿Se actualizó en plazo la documentación de configuración que cada cambio implantado exigía?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.5',
    title: 'Estabilidad del servicio tras el cambio',
    description:
      'Servicios que siguen caídos en la última pasada del recolector y cuya caída empezó en las horas de P-09 siguientes a un cambio real, sin que el registro declare revertido ese cambio. Da soporte objetivo a las pruebas de aceptación de op.exp.5.5 y a la reversión de R1.',
    requirements: ['op.exp.5.5', 'op.exp.5.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'service_failed', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed'],
    // Hecho de ESTADO: el recolector reemite en cada pasada TODOS los servicios
    // caídos, y ninguno si no hay. Se juzga la última pasada (ver
    // `state-facts.ts`): un servicio que se recuperó deja de contar en cuanto
    // la pasada siguiente lo ve en pie.
    stateFactEventTypes: ['service_failed'],
    relatedRules: ['110608', '110601', '110602', '110603', '110604'],
    auditQuestion:
      '¿Algún cambio ha dejado un servicio caído sin revertirse?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.5',
    title: 'Comunicación de fallos al responsable de seguridad (R1)',
    description:
      'Los fallos de software detectados en la máquina (servicios caídos, el mismo hecho de EV-07) y su comunicación al responsable de seguridad por el canal de P-07. La detección es real; la comunicación no deja hoy ningún hecho observable, así que la evidencia no se puede demostrar.',
    requirements: ['op.exp.5.r1.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // El hecho llega etiquetado EV-07, que es quien lo declara de estado; la
    // policy lo lee para las dos.
    expectedEventTypes: ['evidence_state', 'service_failed'],
    relatedRules: ['110608'],
    auditQuestion:
      '¿Se comunican al responsable de seguridad los fallos de software y hardware?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.5',
    title: 'Existencia de punto de reversión previo al cambio (R1)',
    description:
      'Para cada cambio real de configuración o de software, un punto de reversión del mecanismo declarado en P-08 creado en las horas previas a su inicio. Es la lógica de EV-09 de op.exp.4 aplicada a todos los cambios. Solo lvm, zfs y btrfs dejan huella en la máquina.',
    requirements: ['op.exp.5.r1.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'reversion_point_created', 'config_file_modified', 'package_changed'],
    relatedRules: ['110609', '110601', '110602'],
    auditQuestion:
      '¿Existía un punto de reversión antes de cada cambio?',
  },
  // --- op.exp.6 · Protección frente a código dañino ------------------------
  //
  // Dos evidencias las juzga una primitiva (EV-01 y EV-03): un hecho de estado
  // contra la fila de su tabla. Las demás las mide la policy del control
  // (`policies/op-exp-6.policy.ts`), porque su juicio no cabe en ninguna de las
  // siete: EV-02 exige firmas frescas en CADA plano con antimalware (la
  // primitiva de plazo es existencial y un plano al día taparía al otro);
  // EV-02, EV-04 y EV-05 leen además EV-01, porque sin antimalware no hay
  // firmas, ni detecciones, ni escaneos, y eso es un incumplimiento medido, no
  // un hueco; EV-06 comprueba que cada ruta de P-07 esté cubierta; EV-07
  // combina el estado del mecanismo con las ejecuciones que dejó pasar; EV-08 a
  // EV-11 contrastan cada capacidad EDR con su fila de P-09; EV-12 cruza las
  // vías de P-05 y la política de P-10. Sin `judgment`, la policy las resuelve
  // y el puente de `evaluation/policy-evidence-bridge.ts` lo lleva a la tabla.
  //
  // Reglas: todas de la banda 110700-110799, desplegadas por el runbook
  // `linux/op.exp.6` (y su copia LDAP). Ninguna regla nativa de
  // Wazuh (syscheck, rootcheck, VirusTotal, YARA): el motor solo lee alertas
  // ENSFácil, así que lo que se acredita es el hecho que el recolector emite.
  {
    id: 'EV-01',
    controlId: 'op.exp.6',
    title: 'Presencia y estado del antimalware en todos los equipos',
    description:
      'Antimalware de cada plano de la máquina (el sistema; en un servidor que presta correo, además, el del servicio de correo): qué producto está instalado y si su servicio está en ejecución. Se contrasta el producto EN EJECUCIÓN con la fila del equipo y el plano en P-02: instalado y parado no protege. op.exp.6.2 es taxativo en la exigencia de cobertura total.',
    requirements: ['op.exp.6.1', 'op.exp.6.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'antimalware_status'],
    stateFactEventTypes: ['antimalware_status'],
    relatedRules: ['110701'],
    judgment: {
      // Los hechos ACREDITAN lo que corre en cada plano: sin ninguno no se ha
      // mirado, así que la primitiva es de tabla y nunca cumple por ausencia.
      // Una máquina sin antimalware SÍ emite hecho (`producto_activo=ninguno`):
      // la ausencia del producto es una observación, no un dato que falte.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-02',
      factEventTypes: ['antimalware_status'],
      factField: 'equipo',
      factKeyFields: ['equipo', 'plano'],
      tableKeyColumns: ['equipo', 'plano'],
      tableChecks: [
        { column: 'producto_esperado', factField: 'producto_activo' },
      ],
    },
    auditQuestion:
      '¿Corre en cada equipo y plano el antimalware que declara la cobertura esperada?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.6',
    title: 'Antigüedad de las bases de datos de detección',
    description:
      'Instante en que el fabricante publicó las firmas del antimalware de cada plano (cabecera de la base diaria de ClamAV), medido contra el reloj y el umbral de P-03. Un plano con antimalware en ejecución y sin bases, o una máquina sin antimalware, no tiene bases que mantener al día: es un incumplimiento medido de op.exp.6.4.',
    requirements: ['op.exp.6.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'antimalware_signatures_updated', 'antimalware_status'],
    stateFactEventTypes: ['antimalware_signatures_updated'],
    relatedRules: ['110702', '110701'],
    auditQuestion:
      '¿Son las firmas de cada antimalware en ejecución más recientes que el umbral declarado?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.6',
    title: 'Configuración adecuada y protección en tiempo real',
    description:
      'Ajustes observados del antimalware de cada plano —protección en tiempo real, actualización automática de firmas, análisis de comprimidos, bloqueo en el acceso—, contrastados con la fila de su plano y ajuste en P-04. Una máquina sin antimalware no tiene protección en tiempo real: se observa y se emite así.',
    requirements: ['op.exp.6.5', 'op.exp.6.r5.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'antimalware_setting'],
    stateFactEventTypes: ['antimalware_setting'],
    relatedRules: ['110703'],
    judgment: {
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-04',
      factEventTypes: ['antimalware_setting'],
      factField: 'ajuste',
      factKeyFields: ['plano', 'ajuste'],
      tableKeyColumns: ['plano', 'ajuste'],
      tableChecks: [
        { column: 'valor_esperado', factField: 'valor' },
      ],
    },
    auditQuestion:
      '¿Tiene el antimalware de cada plano activos los ajustes que exige la organización, empezando por la protección en tiempo real?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.6',
    title: 'Detecciones de código dañino y su resolución',
    description:
      'Cada detección que anota el antimalware, con el fichero, la amenaza y la acción que se tomó (cuarentena, eliminado, bloqueado, sin acción o fallida). Una detección sin remediar o que se repite sobre el mismo fichero indica una infección no resuelta. Sin antimalware no hay mecanismo de detección ni de reacción.',
    requirements: ['op.exp.6.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'malware_detected', 'antimalware_status'],
    relatedRules: ['110704', '110701'],
    auditQuestion:
      '¿Se resuelven todas las detecciones de código dañino, sin infecciones que persistan?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.6',
    title: 'Ejecución del escaneo periódico completo (R1)',
    description:
      'Instante de fin del escaneo completo del sistema más reciente registrado por el antimalware, medido contra el reloj y la periodicidad de P-06. Un equipo que nunca ha completado un escaneo, o que no tiene antimalware, no lo cumple.',
    requirements: ['op.exp.6.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'full_scan_completed', 'antimalware_status'],
    relatedRules: ['110705', '110701'],
    auditQuestion:
      '¿Se ha completado un escaneo de todo el sistema dentro de la periodicidad declarada?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.6',
    title: 'Integridad de funciones críticas al arranque (R2)',
    description:
      'Lo que el agente de Wazuh analizó en su último arranque, leído de su propio log: las rutas que vigila su FIM, si lanzó el análisis nada más arrancar (scan_on_start) y si lo terminó, y la pasada de rootcheck. Cada ruta crítica de P-07 tiene que estar cubierta por una ruta vigilada. Las modificaciones que ese análisis encuentre las alerta el manager; lo que se acredita aquí es que el análisis al arranque existe y cubre lo crítico.',
    requirements: ['op.exp.6.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'boot_integrity_check'],
    relatedRules: ['110706'],
    auditQuestion:
      '¿Analizó el agente al arrancar todas las rutas críticas declaradas, y terminó el análisis?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.6',
    title: 'Efectividad de la lista blanca de aplicaciones (R3)',
    description:
      'Dos hechos que se juzgan juntos: el estado del mecanismo de lista blanca de ejecución (fapolicyd en Linux; el confinamiento de AppArmor no es una lista blanca) y las ejecuciones que el mecanismo registró con la decisión que tomó. Incumple sin mecanismo, con el mecanismo parado o en modo auditoría, y con una ejecución no bloqueada de una ruta que no figura en P-08.',
    requirements: ['op.exp.6.r3.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'execution_control_status', 'execution_observed'],
    stateFactEventTypes: ['execution_control_status'],
    relatedRules: ['110707', '110708'],
    auditQuestion:
      '¿Impide un mecanismo en modo aplicación la ejecución de lo que no está en la lista blanca?',
  },
  {
    // Sin hecho en la máquina: la consulta a VirusTotal la hace el manager
    // (integratord) y su resultado no vuelve al agente. El recolector lo dice
    // con un evidence_state NO_EVALUABLE; la policy juzga solo la fila de P-09.
    id: 'EV-08',
    controlId: 'op.exp.6',
    title: 'Análisis reputacional de ficheros nuevos y modificados (R4)',
    description:
      'Consulta automática a VirusTotal del hash de cada fichero nuevo o modificado en rutas monitorizadas. La hace el manager sobre las alertas de FIM, y su resultado no se observa desde el equipo: la evidencia solo puede juzgar lo que la organización declara en P-09.',
    requirements: ['op.exp.6.r4.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se consulta la reputación de los ficheros nuevos o modificados, y consta en el equipo?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.6',
    title: 'Detección por reglas de contenido en ficheros (R4)',
    description:
      'Si la respuesta activa de YARA que configura el manager está desplegada en el equipo (script y binario presentes), y las coincidencias que ha registrado. Se contrasta con la fila «yara» de P-09.',
    requirements: ['op.exp.6.r4.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'edr_capability_observed', 'content_rule_match'],
    stateFactEventTypes: ['edr_capability_observed'],
    relatedRules: ['110710', '110709'],
    auditQuestion:
      '¿Está desplegado en el equipo el análisis de contenido con reglas YARA que declara la organización?',
  },
  {
    id: 'EV-10',
    controlId: 'op.exp.6',
    title: 'Detección de actividad sospechosa en puestos y servidores (R4)',
    description:
      'Si rootcheck se ejecuta en el equipo y con sus bases de rootkits y troyanos, leído del log del agente. Sus hallazgos (procesos y puertos ocultos, binarios troyanizados) los recibe el manager y no quedan en el equipo, así que la ausencia de actividad sospechosa no se puede afirmar desde aquí: con rootcheck completo la evidencia queda sin demostrar, y con rootcheck roto o incompleto, incumple.',
    requirements: ['op.exp.6.1', 'op.exp.6.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'edr_capability_observed'],
    stateFactEventTypes: ['edr_capability_observed'],
    relatedRules: ['110710'],
    auditQuestion:
      '¿Busca el equipo actividad compatible con código dañino que el antimalware no ve, con la herramienta completa?',
  },
  {
    id: 'EV-11',
    controlId: 'op.exp.6',
    title: 'Contención automática ante detección (R4)',
    description:
      'Respuestas activas de contención que el manager configura para el equipo (etc/shared/ar.conf) y cuyo script está presente en él, y las que se han ejecutado. Se contrasta con la fila «active_response» de P-09.',
    requirements: ['op.exp.6.1', 'op.exp.6.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'edr_capability_observed', 'active_response_executed'],
    stateFactEventTypes: ['edr_capability_observed'],
    relatedRules: ['110710', '110711'],
    auditQuestion:
      '¿Puede el equipo contener automáticamente una detección con una respuesta activa desplegada?',
  },
  {
    id: 'EV-12',
    controlId: 'op.exp.6',
    title: 'Análisis de ficheros de fuentes externas y dispositivos extraíbles',
    description:
      'Por cada vía de entrada de P-05, lo que la máquina puede demostrar: el análisis del correo que hace su pasarela (amavis) y las conexiones de discos extraíbles que registra el kernel, contrastadas con la política de P-10. Las vías que se analizan fuera de la máquina (proxy, pasarela ajena) no se pueden demostrar desde ella.',
    requirements: ['op.exp.6.3', 'op.exp.6.r5.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'external_file_scanned', 'removable_device_connected'],
    relatedRules: ['110712', '110713'],
    auditQuestion:
      '¿Se analiza lo que entra por cada vía declarada, y se respeta la política de dispositivos extraíbles?',
  },
  // op.exp.7 · Gestión de incidentes. El sujeto es el MANAGER: todos los hechos
  // los emite su recolector (agent.id 000) leyendo ficheros locales sin
  // credenciales, y el campo `sistema`/`sistemas` dice de qué máquina hablan.
  // Ninguna evidencia lleva `judgment`: todas cruzan dos flujos de hechos o
  // restan instantes, y las decide `policies/op-exp-7.policy.ts`.
  //
  // Reglas: banda 110800-110899, desplegadas por el runbook
  // `linux/op.exp.7` (y su copia LDAP).
  {
    id: 'EV-01',
    controlId: 'op.exp.7',
    title: 'Detección de eventos de seguridad e incidentes',
    description:
      'Generación de alertas sobre los eventos que pueden tener impacto en la seguridad del sistema, clasificadas según los criterios de P-01. Es el motor de detección que alimenta el proceso de gestión de incidentes y la razón por la que un SIEM es el soporte natural de este control.',
    requirements: ['op.exp.7.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // Las alertas del manager de nivel >= el de observación, agregadas por
    // sistema, regla, nivel y hora. La severidad ENS la pone la policy con
    // P-01; el recolector solo decide desde qué nivel mira.
    expectedEventTypes: ['evidence_state', 'security_alert_observed'],
    relatedRules: ['110801'],
    auditQuestion:
      '¿Detecta el SIEM los eventos de seguridad de los sistemas del alcance y los clasifica por severidad?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.7',
    title: 'Conciliación entre alertas y expedientes de incidente',
    description:
      'Correlación entre las alertas de severidad relevante generadas por Wazuh y los tickets de incidente registrados en P-03. Identifica alertas huérfanas: detecciones críticas que nunca se convirtieron en incidente gestionado. Es el hallazgo más frecuente y más difícil de defender de este control.',
    requirements: ['op.exp.7.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Cruce de dos flujos de hechos: cada alerta Alta o Crítica (P-01) de un
    // sistema tiene que caer dentro de un incidente registrado de ese sistema,
    // con el plazo de escalado de P-02. Lo juzga la policy.
    expectedEventTypes: ['evidence_state', 'security_alert_observed', 'incident_registered'],
    relatedRules: ['110801', '110802'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['incident_registered'],
    auditQuestion:
      '¿Se convierte en incidente registrado toda alerta de severidad alta o crítica?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.7',
    title: 'Tiempos de detección, contención y resolución',
    description:
      'Medición del tiempo transcurrido entre la alerta de Wazuh, la apertura del incidente, la contención registrada y el cierre, contrastado con los plazos comprometidos en P-05. Es la métrica que permite valorar si la asignación de recursos que exige op.exp.7.r2.2 es efectiva o nominal.',
    requirements: ['op.exp.7.r2.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // MTTD y MTTR: restas entre fases del registro (y con la primera alerta)
    // comparadas con la fila de su severidad en P-05. Lo juzga la policy.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'security_alert_observed'],
    relatedRules: ['110801', '110802'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['incident_registered'],
    auditQuestion:
      '¿Se contienen y resuelven los incidentes dentro de los plazos comprometidos para su severidad?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.7',
    title: 'Verificación del escalado y de la notificación a responsables',
    description:
      'Comprobación de que cada incidente fue escalado al destinatario que corresponde según la matriz P-02 y dentro del plazo, y de que se informó a los responsables de la información y servicios afectados identificados en P-04, como exige op.exp.7.r2.3.',
    requirements: ['op.exp.7.1', 'op.exp.7.r2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Escalado contra P-02 (destinatario y plazo) y, desde MEDIA, comunicación
    // a los responsables de P-04 de cada sistema afectado.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'incident_notification_recorded'],
    relatedRules: ['110802', '110803'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['incident_registered', 'incident_notification_recorded'],
    auditQuestion:
      '¿Se escaló cada incidente a quien correspondía, en plazo, y se informó a los responsables de los sistemas afectados?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.7',
    title: 'Preservación de evidencias y protección de los registros',
    description:
      'Verificación de que ante cada incidente se exportaron y conservaron los registros del período y de los sistemas afectados, con sellado de integridad, según P-08. op.exp.7.r2.1 exige expresamente recogida de evidencias y protección de los registros.',
    requirements: ['op.exp.7.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // El registro de alertas de cada día que abarca un incidente: conservado,
    // con su sello SHA-256 de rotación intacto y la cadena de sellos entera.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'alert_log_seal_checked'],
    relatedRules: ['110802', '110806'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['incident_registered', 'alert_log_seal_checked'],
    auditQuestion:
      '¿Se conservan íntegros los registros de alertas del periodo de cada incidente?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.7',
    title: 'Medidas urgentes de contención aplicadas',
    description:
      'Registro de las acciones de contención ejecutadas ante cada incidente conforme a P-09: aislamiento del sistema afectado, detención de servicios, bloqueo de IP o de cuenta. op.exp.7.r2.1 enumera estas medidas de forma expresa.',
    requirements: ['op.exp.7.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Contención de cada incidente Alto o Crítico: una respuesta activa de P-09
    // sobre un sistema afectado durante el incidente, o la fase «intermedio»
    // (contención registrada a mano).
    expectedEventTypes: ['evidence_state', 'incident_registered', 'active_response_executed', 'active_response_configured'],
    relatedRules: ['110802', '110807', '110808'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['incident_registered', 'active_response_configured'],
    auditQuestion:
      '¿Consta una medida urgente de contención en cada incidente de severidad alta o crítica?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.7',
    title: 'Incidentes que afectan a datos personales',
    description:
      'Identificación de los incidentes que afectan a sistemas con datos personales según P-07, activación del contador de 72 horas y verificación de que consta la valoración de brecha y, si procede, la notificación a la AEPD y la comunicación a los interesados.',
    requirements: ['op.exp.7.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // Incidentes que tocan un sistema de P-07: valoración de datos personales
    // y notificación a la AEPD en 72 horas cuando los afecta.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'incident_notification_recorded'],
    relatedRules: ['110802', '110803'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['incident_registered', 'incident_notification_recorded'],
    auditQuestion:
      '¿Se valoró cada incidente en sistemas con datos personales y se notificó a la AEPD en 72 horas cuando procedía?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.7',
    title: 'Notificación de incidentes al CCN-CERT (R1)',
    description:
      'Verificación de que los incidentes que debían notificarse al CCN-CERT según su clasificación constan efectivamente notificados a través de la solución de ventanilla única declarada en P-06. R1 es obligatorio desde categoría MEDIA.',
    requirements: ['op.exp.7.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Incidentes de severidad notificable según P-01: notificación al CCN-CERT
    // registrada, dentro del plazo de P-02, por la ventanilla de P-06.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'ccn_cert_notification_recorded'],
    relatedRules: ['110802', '110804'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['incident_registered', 'ccn_cert_notification_recorded'],
    auditQuestion:
      '¿Consta notificado al CCN-CERT cada incidente que debía notificarse?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.7',
    title: 'Reconfiguración dinámica ejecutada ante incidente (R3)',
    description:
      'Detección de cambios en los elementos de P-10 —reglas de cortafuegos, ACL, enrutadores, parámetros de IDS/IPS— producidos en respuesta a un incidente activo, acreditando la capacidad de detener, desviar o limitar ataques que exige R3 en categoría ALTA.',
    requirements: ['op.exp.7.r3.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    // Reconfiguración dinámica = respuesta activa de P-09 ejecutada sobre un
    // elemento de P-10. Un elemento sin agente no deja nada que observar.
    expectedEventTypes: ['evidence_state', 'active_response_executed', 'active_response_configured'],
    relatedRules: ['110807', '110808'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['active_response_configured'],
    auditQuestion:
      '¿Se ha ejercitado la reconfiguración dinámica sobre los elementos declarados?',
  },
  {
    id: 'EV-10',
    controlId: 'op.exp.7',
    title: 'Adaptación a los avisos del CCN-CERT (R3)',
    description:
      'Verificación de que los indicadores de compromiso y las recomendaciones de los avisos del CCN-CERT sobre ciberamenazas sofisticadas y campañas de ataques se incorporan efectivamente a la capacidad de detección, como exige op.exp.7.r3.2.',
    requirements: ['op.exp.7.r3.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // Cada lista CDB de P-11: existe, está cargada, la usa alguna regla y no
    // lleva más días sin actualizarse que el plazo declarado.
    expectedEventTypes: ['evidence_state', 'threat_list_observed'],
    relatedRules: ['110809'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['threat_list_observed'],
    auditQuestion:
      '¿Se incorporan los indicadores de los avisos del CCN-CERT a la capacidad de detección?',
  },
  {
    id: 'EV-11',
    controlId: 'op.exp.7',
    title: 'Detección de anomalías y respuesta automatizada (R4)',
    description:
      'Identificación de comportamientos anómalos respecto a la línea base del sistema y ejecución de respuesta automatizada: aislamiento de dispositivos críticos, bloqueo de tráfico. Cubre parcialmente el Refuerzo R4, no obligatorio pero alcanzable.',
    requirements: ['op.exp.7.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // R4 no es exigible: respuesta automática configurada y ejercitada.
    expectedEventTypes: ['evidence_state', 'active_response_executed', 'active_response_configured'],
    relatedRules: ['110807', '110808'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['active_response_configured'],
    auditQuestion:
      '¿Hay respuesta automática configurada y se ha ejercitado?',
  },
  {
    id: 'EV-12',
    controlId: 'op.exp.7',
    title: 'Medidas de mejora derivadas del incidente',
    description:
      'Verificación de que tras cerrar cada incidente constan las medidas exigidas por op.exp.7.r2.4: prevención de la repetición, incorporación a los procedimientos de usuario y actualización de los procedimientos de resolución. Es el bucle de aprendizaje que cierra el proceso.',
    requirements: ['op.exp.7.r2.4'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Todo incidente cerrado (fase final) tiene que tener medidas de mejora
    // registradas.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'improvement_action_recorded'],
    relatedRules: ['110802', '110805'],
    // Se reemiten ENTEROS en cada pasada del recolector del manager.
    stateFactEventTypes: ['incident_registered', 'improvement_action_recorded'],
    auditQuestion:
      '¿Consta alguna medida de mejora en cada incidente cerrado?',
  },
  // --- op.exp.8 · Registro de la actividad ----------------------------------
  //
  // Dos planos, separados por el latido (`tipo_servidor`): el del SERVIDOR
  // (EV-01, EV-02, EV-03, EV-06, EV-08: cada agente Linux o LDAP y el propio
  // manager) y el CENTRAL (EV-04, EV-05, EV-07, EV-09..EV-13: solo el manager,
  // agent.id=000). Solo EV-02 se juzga con una primitiva; el resto lo mide la
  // policy del control (`policies/op-exp-8.policy.ts`), que es quien sabe en
  // qué fila se mide cada requisito, y el puente lo lleva a la tabla.
  //
  // Reglas: banda 110900-110999, desplegadas por el runbook
  // `linux/op.exp.8` (y su copia LDAP).
  {
    // Plano del servidor. Lo juzga la policy del control: auditd activo con
    // reglas y registro del sistema persistente; en el directorio, slapd con
    // `stats`; y cada categoría que P-01 declara auditable, contra lo que las
    // reglas cargadas en el kernel registran de verdad (`audit_coverage`).
    id: 'EV-01',
    controlId: 'op.exp.8',
    title: 'Generación y conservación del registro de auditoría',
    description:
      'Fuentes de registro de cada servidor y su estado: auditd (activo, habilitado en el kernel y con cuántas reglas cargadas), el registro del sistema (journald persistente o rsyslog) y, en un servidor LDAP, el registro de operaciones de slapd (olcLogLevel). Y, por cada categoría de evento que P-01 declara auditable, lo que las reglas cargadas en el kernel registran de verdad: qué rutas vigilan en escritura o qué llamadas al sistema. Es el registro de auditoría en sentido propio, en el sitio donde se genera.',
    requirements: ['op.exp.8.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'audit_log_status', 'audit_coverage'],
    stateFactEventTypes: ['audit_log_status', 'audit_coverage'],
    relatedRules: ['110901', '110914'],
    auditQuestion:
      '¿Está activo en el servidor un registro de auditoría, se conserva el registro del sistema y se registran de verdad todas las categorías de eventos que P-01 declara auditables? En un servidor LDAP, ¿registra slapd sus operaciones?',
  },
  {
    // Plano del servidor. Único juicio por primitiva de op.exp.8.
    id: 'EV-02',
    controlId: 'op.exp.8',
    title: 'Cobertura de registro en los servidores',
    description:
      'Estado del agente de Wazuh de cada servidor y el instante de su último keepalive con el manager, en UTC. Acredita que el servidor entrega su registro de actividad: un agente que deja de comunicar deja de registrar a efectos del sistema, y su último contacto envejece contra el plazo de P-12.',
    requirements: ['op.exp.8.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'agent_status'],
    stateFactEventTypes: ['agent_status'],
    relatedRules: ['110902'],
    judgment: {
      // Existencial y contra el reloj: el hecho es el INSTANTE del último
      // keepalive (en UTC, convertido en el agente desde su hora local), así
      // que la antigüedad crece sola si el agente deja de entregar. Sin hecho,
      // NO_EVALUABLE: nunca cumple por ausencia.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-12',
      factEventTypes: ['agent_status'],
      factField: 'ultimo_keepalive',
    },
    auditQuestion:
      '¿El agente del servidor ha entregado su registro al manager dentro del plazo de P-12?',
  },
  {
    // Plano del servidor. La policy: un campo ausente en TODA la muestra de una
    // fuente es un hallazgo.
    id: 'EV-03',
    controlId: 'op.exp.8',
    title: 'Suficiencia de los campos del registro de auditoría',
    description:
      'Muestra de los registros de auditoría más recientes de cada fuente (auditd; en LDAP, slapd), con cuántos traen cada uno de los cinco campos mínimos de op.exp.8.1: usuario o entidad, fecha y hora, objeto, tipo de evento y resultado.',
    requirements: ['op.exp.8.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'audit_record_fields'],
    stateFactEventTypes: ['audit_record_fields'],
    relatedRules: ['110903'],
    auditQuestion:
      '¿Los registros de auditoría del servidor traen los cinco campos de op.exp.8.1 (usuario, fecha y hora, objeto, tipo y resultado)?',
  },
  {
    // Plano central (agent.id=000). La policy cruza P-02 con el último
    // keepalive de cada agente en cada pasada del recolector del manager.
    //
    // NO es un hecho de estado aunque describa uno: la laguna se ve en la
    // SERIE de pasadas de la ventana (una pasada en la que el keepalive quedaba
    // más atrás que P-12), así que quedarse con la última borraría la laguna de
    // anoche en cuanto el servidor vuelve. Por eso no declara
    // `stateFactEventTypes`.
    id: 'EV-04',
    controlId: 'op.exp.8',
    title: 'Continuidad de la ingesta y detección de lagunas',
    description:
      'Continuidad de la entrega de cada servidor al manager, medida por su latido: en cada pasada, el recolector del manager lee de la base local de agentes de Wazuh (global.db, en solo lectura) el último keepalive y el estado de conexión de cada agente. Se cruza con los servidores declarados en P-02: una pasada en la que el último keepalive de uno de ellos quedaba más atrás que P-12 es una laguna, y el periodo queda sin trazabilidad. Si faltan pasadas del propio recolector, la continuidad no se puede acreditar. Los eventos recibidos por agente viajan solo como dato informativo: un servidor tranquilo puede pasar horas sin alertas sin que eso sea una laguna.',
    requirements: ['op.exp.8.1', 'op.exp.8.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'agent_keepalive_observed'],
    relatedRules: ['110915'],
    auditQuestion:
      '¿Todos los servidores declarados en P-02 mantienen su latido con el manager sin lagunas mayores que P-12 en ninguna pasada de la ventana?',
  },
  {
    // Plano central. Registro TSV de la organización en el manager.
    id: 'EV-05',
    controlId: 'op.exp.8',
    title: 'Registro de las revisiones periódicas de los registros (R1)',
    description:
      'Revisiones periódicas de los registros anotadas por la organización en el registro del manager (/etc/ensfacil/log-review-register.tsv): cuántas hay y la más reciente, con revisor, alcance, hallazgos y referencia. R1 habla de revisión «informal», pero sin constancia no es acreditable.',
    requirements: ['op.exp.8.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'log_review_recorded'],
    stateFactEventTypes: ['log_review_recorded'],
    relatedRules: ['110905'],
    auditQuestion:
      '¿La revisión más reciente de los registros anotada por la organización es más reciente que la periodicidad de P-04?',
  },
  {
    // Plano del servidor. Tres ejes (sincronización y fuente, desfase,
    // autenticación) más la traza de los cambios de hora; los juzga la policy.
    // clock_change_observed es una acción: no es hecho de estado.
    id: 'EV-06',
    controlId: 'op.exp.8',
    title: 'Sincronización del reloj y protección de la referencia de tiempo (R2)',
    description:
      'Referencia de tiempo de cada servidor: servicio de sincronización, si está sincronizado, fuentes en uso, si la sincronización se autentica (NTS o clave), desfase medido y si auditd registra los cambios de la hora del sistema; y cada cambio de hora registrado, con la cuenta que lo hizo.',
    requirements: ['op.exp.8.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'time_sync_status', 'clock_change_observed'],
    stateFactEventTypes: ['time_sync_status'],
    relatedRules: ['110906', '110907'],
    auditQuestion:
      '¿El reloj está sincronizado con una fuente declarada, con autenticación, dentro de la desviación de P-06, y quedan registrados los cambios de hora?',
  },
  {
    // Plano central. La retención del indexer (ISM) no se ve sin credenciales:
    // queda sin demostrar con causa CONFIGURATION.
    id: 'EV-07',
    controlId: 'op.exp.8',
    title: 'Retención efectiva de los registros frente a la declarada (R3)',
    description:
      'Retención de los registros: lo que el manager conserva en disco (alertas diarias y archives) y la retención de los índices del Wazuh Indexer frente a P-07. La segunda solo se ve consultando el indexer, y sin credenciales queda sin demostrar.',
    requirements: ['op.exp.8.r3.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'log_retention_observed'],
    stateFactEventTypes: ['log_retention_observed'],
    relatedRules: ['110908'],
    auditQuestion:
      '¿La retención efectiva de los registros respeta la declarada en P-07?',
  },
  {
    // Los dos planos: en cada servidor, quién puede leer sus registros; en el
    // manager, además, los accesos al indexer, que sin credenciales quedan sin
    // demostrar.
    id: 'EV-08',
    controlId: 'op.exp.8',
    title: 'Control de acceso a los registros de actividad (R4)',
    description:
      'Quién puede leer los registros de actividad de cada servidor (propietario, grupo, ACL y lectura por cualquiera, fichero a fichero dentro de cada directorio de registro) frente a las cuentas autorizadas de P-08. En el manager, los accesos efectivos a los índices (audit log del indexer) quedan sin demostrar sin credenciales.',
    requirements: ['op.exp.8.r4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'log_access_permissions'],
    stateFactEventTypes: ['log_access_permissions'],
    relatedRules: ['110909'],
    auditQuestion:
      '¿Solo las cuentas autorizadas en P-08 pueden leer los registros de actividad?',
  },
  {
    // Sin hecho: los snapshots del indexer solo se ven con una credencial del
    // indexer, que el recolector del manager no usa (decisión del 26/09). Lo
    // dice un evidence_state NO_EVALUABLE (110950).
    id: 'EV-09',
    controlId: 'op.exp.8',
    title: 'Protección de las copias de seguridad de los registros (R4)',
    description:
      'Existencia, frescura y protección de las copias de los registros (snapshots del Wazuh Indexer). Solo se ven consultando el indexer; sin credenciales quedan sin demostrar.',
    requirements: ['op.exp.8.r4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Existen copias de los registros al día y con el acceso restringido al personal de P-08?',
  },
  {
    // Plano central.
    id: 'EV-10',
    controlId: 'op.exp.8',
    title: 'Análisis automático en busca de comprometimientos (R5)',
    description:
      'Conjuntos de reglas de análisis cargados por el manager (ruleset oficial y reglas propias), con cuántas reglas y cuántas mapean técnicas MITRE ATT&CK, frente a los conjuntos declarados en P-10.',
    requirements: ['op.exp.8.r5.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'correlation_rules_inventory'],
    stateFactEventTypes: ['correlation_rules_inventory'],
    relatedRules: ['110910'],
    auditQuestion:
      '¿Están desplegados en el manager los conjuntos de reglas de análisis declarados en P-10?',
  },
  {
    // Plano central.
    id: 'EV-11',
    controlId: 'op.exp.8',
    title: 'Sistema automático de recolección, correlación y respuesta (R5)',
    description:
      'Respuestas activas configuradas en el manager: comando, ubicación, reglas o grupos que las disparan, tiempo de reversión y si están habilitadas, frente a las acciones previstas en P-11.',
    requirements: ['op.exp.8.r5.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'active_response_configured'],
    stateFactEventTypes: ['active_response_configured'],
    relatedRules: ['110911'],
    auditQuestion:
      '¿Hay respuestas automáticas configuradas y habilitadas en el manager, incluidas las de P-11?',
  },
  {
    // Plano central. Acción, no estado.
    id: 'EV-12',
    controlId: 'op.exp.8',
    title: 'Respuestas automáticas ejecutadas (R5)',
    description:
      'Respuestas automáticas ejecutadas en la ventana, en cualquier agente o en el manager, con la regla que las disparó, el objetivo y el número de ejecuciones. Una ejecución sin alerta que la dispare (un reinicio pedido a mano) no acredita respuesta automática.',
    requirements: ['op.exp.8.r5.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'active_response_executed'],
    relatedRules: ['110912'],
    auditQuestion:
      '¿Consta en la ventana alguna respuesta automática ejecutada a raíz de una alerta?',
  },
  {
    // Plano central.
    id: 'EV-13',
    controlId: 'op.exp.8',
    title: 'Integridad del propio sistema de registro',
    description:
      'Estado de los servicios del sistema de registro (wazuh-manager, wazuh-indexer, wazuh-dashboard), desde cuándo están activos, sus reinicios y la huella de la configuración del manager y de sus reglas propias.',
    requirements: ['op.exp.8.1', 'op.exp.8.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'logging_service_status'],
    stateFactEventTypes: ['logging_service_status'],
    relatedRules: ['110913'],
    auditQuestion:
      '¿Están activos todos los servicios del sistema de registro (manager, indexer, dashboard)?',
  },
  {
    id: 'EV-01',
    controlId: 'op.exp.9',
    title: 'Registro de eventos que originan cada incidente',
    description:
      'Conservación del conjunto de eventos que dieron lugar a la detección del incidente, con su marca temporal y sistemas implicados. Es la materia prima del reporte inicial que exige op.exp.9.1 y el punto de partida de cualquier análisis posterior.',
    requirements: ['op.exp.9.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Por incidente y sistema afectado: alertas del agente en la ventana del
    // incidente y archivos diarios de alertas presentes y con su suma encadenada
    // de Wazuh verificada. Lo juzga la policy de op.exp.9 (correlación por
    // `incidente_id`, que ninguna primitiva expresa).
    expectedEventTypes: ['evidence_state', 'incident_source_events_available', 'incident_report_registered', 'register_read'],
    relatedRules: ['111002', '111001', '111010'],
    // Todo lo que alimenta esta evidencia lo reemite ENTERO el recolector del
    // manager en cada pasada (el estado de los registros y de las ventanas de
    // incidente): se juzga con la última pasada, no con la ventana de 30 días.
    stateFactEventTypes: ['incident_source_events_available', 'register_read'],
    auditQuestion:
      '¿Conserva el manager, íntegros, los eventos de cada sistema afectado en la ventana de cada incidente?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.9',
    title: 'Completitud de los reportes inicial, intermedio y final',
    description:
      'Verificación de que cada incidente cuenta con los tres tipos de reporte que op.exp.9.1 distingue, cumplimentados según las plantillas de P-02. Un incidente con solo registro de cierre no satisface el requisito, que menciona expresamente los tres momentos.',
    requirements: ['op.exp.9.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Una fila del registro de incidentes por fase. Con el registro vacío, el
    // contraste es el volumen de alertas del manager por regla y nivel (P-08,
    // sin los grupos de P-09).
    expectedEventTypes: ['evidence_state', 'incident_report_registered', 'register_read', 'alert_volume_observed', 'alert_rule_volume_observed'],
    relatedRules: ['111001', '111010', '111011', '111012'],
    // Todo lo que alimenta esta evidencia lo reemite ENTERO el recolector del
    // manager en cada pasada (el estado de los registros y de las ventanas de
    // incidente): se juzga con la última pasada, no con la ventana de 30 días.
    stateFactEventTypes: ['incident_report_registered', 'register_read', 'alert_volume_observed', 'alert_rule_volume_observed'],
    auditQuestion:
      '¿Tiene cada incidente registrados los reportes inicial, intermedio y final que exige P-02?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.9',
    title: 'Registro de las actuaciones de emergencia',
    description:
      'Constancia de las medidas urgentes ejecutadas durante el incidente: aislamiento, detención de servicios, bloqueos. op.exp.9.1 exige registrar expresamente «las actuaciones de emergencia», y Active Response produce ese registro de forma automática y fiable.',
    requirements: ['op.exp.9.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Lo que Wazuh registró (alertas active_response en la ventana del
    // incidente) contra lo que la organización vinculó al expediente.
    expectedEventTypes: ['evidence_state', 'emergency_action_observed', 'incident_action_registered', 'incident_source_events_available', 'register_read'],
    relatedRules: ['111003', '111005', '111002'],
    // Todo lo que alimenta esta evidencia lo reemite ENTERO el recolector del
    // manager en cada pasada (el estado de los registros y de las ventanas de
    // incidente): se juzga con la última pasada, no con la ventana de 30 días.
    stateFactEventTypes: ['emergency_action_observed', 'incident_action_registered', 'register_read'],
    auditQuestion:
      '¿Consta en el expediente cada respuesta activa ejecutada en un sistema afectado durante el incidente?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.9',
    title: 'Registro de las modificaciones del sistema derivadas del incidente',
    description:
      'Constancia de los cambios realizados en los sistemas como consecuencia del incidente: cambios de configuración, parches aplicados, reglas modificadas, cuentas deshabilitadas. op.exp.9.1 los exige registrar de forma expresa.',
    requirements: ['op.exp.9.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // FIM, paquetes, configuración (op.exp.3) y cuentas (op.acc.1) observados
    // en las alertas del manager, contra las modificaciones derivadas registradas.
    expectedEventTypes: ['evidence_state', 'system_change_observed', 'incident_action_registered', 'incident_source_events_available', 'register_read'],
    relatedRules: ['111004', '111005', '111002'],
    // Todo lo que alimenta esta evidencia lo reemite ENTERO el recolector del
    // manager en cada pasada (el estado de los registros y de las ventanas de
    // incidente): se juzga con la última pasada, no con la ventana de 30 días.
    stateFactEventTypes: ['system_change_observed', 'incident_action_registered', 'register_read'],
    auditQuestion:
      '¿Consta en el expediente cada modificación observada en un sistema afectado durante el incidente?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.9',
    title: 'Exportación sellada de evidencias con valor probatorio',
    description:
      'Generación automática, al marcarse un incidente como de relevancia jurídica según P-04, del conjunto de evidencias declarado en P-03: registros del período y sistemas afectados, exportados con cálculo de hash y sellado de tiempo.',
    requirements: ['op.exp.9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Condicionada por la marca de relevancia jurídica del registro: sin
    // incidentes marcados no hay exportación que exigir.
    expectedEventTypes: ['evidence_state', 'evidence_export_sealed', 'incident_report_registered', 'register_read'],
    relatedRules: ['111006', '111001'],
    // Todo lo que alimenta esta evidencia lo reemite ENTERO el recolector del
    // manager en cada pasada (el estado de los registros y de las ventanas de
    // incidente): se juzga con la última pasada, no con la ventana de 30 días.
    stateFactEventTypes: ['evidence_export_sealed', 'register_read'],
    auditQuestion:
      '¿Tiene cada incidente con relevancia jurídica sellada la evidencia que determina P-03?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.9',
    title: 'Cadena de custodia de las evidencias',
    description:
      'Registro de todos los accesos a las evidencias custodiadas: quién, cuándo y con qué finalidad, junto con la verificación periódica de que el hash de la evidencia sigue coincidiendo. Sin cadena de custodia acreditable, la evidencia pierde valor probatorio con independencia de su contenido.',
    requirements: ['op.exp.9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // El SHA-256 se recalcula en el manager cuando la evidencia está en él;
    // los accesos al repositorio los anota la organización.
    expectedEventTypes: ['evidence_state', 'custody_access_recorded', 'custody_integrity_checked', 'evidence_export_sealed', 'register_read'],
    relatedRules: ['111006', '111007', '111008'],
    // Todo lo que alimenta esta evidencia lo reemite ENTERO el recolector del
    // manager en cada pasada (el estado de los registros y de las ventanas de
    // incidente): se juzga con la última pasada, no con la ventana de 30 días.
    stateFactEventTypes: ['evidence_export_sealed', 'custody_integrity_checked', 'custody_access_recorded', 'register_read'],
    auditQuestion:
      '¿Está cada evidencia custodiada en un repositorio de P-05, con cadena de custodia y su SHA-256 intacto?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.9',
    title: 'Protección de los registros del período del incidente',
    description:
      'Bloqueo de la eliminación automática por política de retención de los índices correspondientes al período y sistemas de un incidente abierto o con relevancia jurídica, evitando que la rotación normal destruya evidencia necesaria.',
    requirements: ['op.exp.9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // La parte del disco del manager se mide (archivos diarios y su suma); la
    // exención de la política ISM del indexer NO se ve sin credenciales y queda
    // sin demostrar con causa CONFIGURATION.
    expectedEventTypes: ['evidence_state', 'incident_source_events_available', 'incident_report_registered', 'register_read'],
    relatedRules: ['111002', '111001'],
    // Todo lo que alimenta esta evidencia lo reemite ENTERO el recolector del
    // manager en cada pasada (el estado de los registros y de las ventanas de
    // incidente): se juzga con la última pasada, no con la ventana de 30 días.
    stateFactEventTypes: ['incident_source_events_available', 'register_read'],
    auditQuestion:
      '¿Se conservan, protegidos de la rotación, los registros del periodo de los incidentes abiertos o con relevancia jurídica?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.9',
    title: 'Realimentación de los eventos auditables tras el incidente',
    description:
      'Verificación de que el análisis de cada incidente relevante se traduce en revisión de la lista de eventos auditables y, en su caso, en nuevas reglas de detección. op.exp.9.3 lo exige expresamente y es el bucle que conecta este control con op.exp.8.',
    requirements: ['op.exp.9.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Cambios de reglas, decodificadores, ossec.conf y agent.conf del manager con
    // su instante, y revisiones registradas por incidente. El plazo empieza en el
    // cierre, cosa que ninguna primitiva expresa.
    expectedEventTypes: ['evidence_state', 'auditable_events_revised', 'incident_action_registered', 'incident_report_registered', 'register_read'],
    relatedRules: ['111009', '111005', '111001'],
    // Todo lo que alimenta esta evidencia lo reemite ENTERO el recolector del
    // manager en cada pasada (el estado de los registros y de las ventanas de
    // incidente): se juzga con la última pasada, no con la ventana de 30 días.
    stateFactEventTypes: ['auditable_events_revised', 'incident_action_registered', 'register_read'],
    auditQuestion:
      '¿Se revisaron los eventos auditables tras cada incidente cerrado que lo exige P-07, dentro de su plazo?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.9',
    title: 'Trazabilidad completa del expediente de incidente',
    description:
      'Consolidación en un único expediente consultable de todo lo relacionado con el incidente: alertas originarias, reportes, actuaciones de emergencia, modificaciones derivadas, evidencias custodiadas y revisión de eventos auditables. Es el entregable que un auditor querrá ver en su conjunto.',
    requirements: ['op.exp.9.1', 'op.exp.9.2', 'op.exp.9.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'TRACEABILITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Vista consolidada por incidente; lo que se mide es que el expediente se
    // pueda reconstruir desde el registro.
    expectedEventTypes: ['evidence_state', 'incident_report_registered', 'register_read'],
    relatedRules: ['111001'],
    // Todo lo que alimenta esta evidencia lo reemite ENTERO el recolector del
    // manager en cada pasada (el estado de los registros y de las ventanas de
    // incidente): se juzga con la última pasada, no con la ventana de 30 días.
    stateFactEventTypes: ['incident_report_registered', 'register_read'],
    auditQuestion:
      '¿Enlaza cada fila del registro con su expediente, de modo que el expediente se pueda presentar entero?',
  },
  // --- op.exp.10 · Protección de claves criptográficas --------------------
  //
  // Dos evidencias las juzga una primitiva (EV-02 y EV-08): un hecho contra un
  // parámetro. Las demás las mide la policy del control
  // (`policies/op-exp-10.policy.ts`), porque su juicio no cabe en ninguna de las
  // siete: EV-01 exige además que el latido confirme que TODOS los almacenes se
  // vigilaban (un acceso autorizado observado no dice nada de los no
  // vigilados); EV-03, EV-04 y EV-07 contrastan cada algoritmo con SU fila de uso
  // en P-03 y su longitud mínima; EV-05 busca la fila de la máquina en P-05;
  // EV-06 filtra P-01 por `estado` antes de contrastar, y EV-07 mide la
  // caducidad contra el reloj.
  //
  // EV-02, EV-06 y EV-08 comparten UN hecho, `key_material_found` (regla
  // 111102): la misma clave en disco, contrastada con tres políticas.
  //
  // Reglas: todas de la banda 111100-111199, desplegadas por el runbook
  // `linux/op.exp.10` (y su copia LDAP).
  {
    id: 'EV-01',
    controlId: 'op.exp.10',
    title: 'Accesos al material criptográfico',
    description:
      'Todo acceso (lectura, escritura, cambio de permisos, borrado) a los almacenes de claves vigilados por auditd, con la cuenta de la sesión que lo hizo —la persona aunque haya pasado por sudo— o, sin sesión, la cuenta del proceso, el proceso y el intervalo. Se contrasta la cuenta contra el personal autorizado de P-08. Es la aportación más directa a la custodia de las claves durante la explotación.',
    requirements: ['op.exp.10.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Sin `judgment` a propósito: la decide la policy. Un acceso autorizado
    // observado solo acredita lo que se vigilaba, y la primitiva no mira la
    // cobertura cuando hay hechos.
    expectedEventTypes: ['evidence_state', 'key_material_accessed'],
    relatedRules: ['111101'],
    auditQuestion:
      '¿Solo el personal autorizado en P-08 accede al material criptográfico, y consta que todos los almacenes estaban vigilados?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.10',
    title: 'Claves privadas fuera de los almacenes declarados',
    description:
      'Barrido de las claves privadas presentes en disco (identificadas por su cabecera, no por la extensión) con el directorio en que están. Una clave cuyo directorio no es un almacén declarado en P-02 es un indicio de copia o exfiltración de material criptográfico.',
    requirements: ['op.exp.10.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'key_material_found'],
    // El barrido se reemite ENTERO en cada pasada: una clave borrada deja de
    // contar en cuanto la pasada siguiente no la ve.
    stateFactEventTypes: ['key_material_found'],
    relatedRules: ['111102'],
    judgment: {
      // Cada clave encontrada es un HALLAZGO de un barrido: no encontrar
      // ninguna fuera de los almacenes, con el latido confirmando que el
      // barrido terminó, es el resultado normal de una máquina sana.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-02',
      // P-02 es `ruta | modo_maximo | propietario`: sin la columna se compararía
      // la fila entera con un directorio y toda clave saldría fuera.
      parameterColumn: 'ruta',
      factEventTypes: ['key_material_found'],
      factField: 'directorio',
    },
    auditQuestion:
      '¿Toda clave privada presente en disco está en un almacén declarado en P-02?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.10',
    title: 'Algoritmos y parámetros criptográficos configurados (R1)',
    description:
      'Algoritmos que acepta cada servicio criptográfico según su configuración EFECTIVA (en sshd, `sshd -T`: cifrados, MAC, intercambio de claves, algoritmos de firma, claves de host y claves autorizadas; en slapd, versión mínima de TLS, suites y hash de contraseñas), con su familia y longitud, contrastados con los autorizados por el CCN en P-03 y con el alcance de P-04.',
    requirements: ['op.exp.10.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'crypto_config_observed'],
    stateFactEventTypes: ['crypto_config_observed'],
    relatedRules: ['111103'],
    auditQuestion:
      '¿Todos los algoritmos y longitudes que aceptan los servicios criptográficos figuran entre los autorizados en P-03?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.10',
    title: 'Uso efectivo de protocolos y algoritmos (R1)',
    description:
      'Algoritmos NEGOCIADOS de verdad en las conexiones del periodo, leídos del log del servicio: en sshd, el tipo de clave con que se autentica cada cliente (y, con LogLevel DEBUG1, el intercambio de claves, el cifrado y el MAC); en slapd, la versión de TLS y la suite de cada conexión. Detecta el servicio que declara mínimos correctos y sigue aceptando conexiones inferiores.',
    requirements: ['op.exp.10.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'crypto_protocol_negotiated'],
    relatedRules: ['111104'],
    auditQuestion:
      '¿Todo lo negociado en las conexiones del periodo figura entre lo autorizado en P-03, y consta que el log registra la negociación completa?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.10',
    title: 'Generación de claves en medios de explotación',
    description:
      'Ejecuciones de herramientas de generación de claves (ssh-keygen generando, openssl genpkey, genrsa, req -newkey…) registradas por auditd en la máquina, con la cuenta que las lanzó. Se contrasta con la función de la máquina en P-05: en un medio de explotación, cualquier generación incumple op.exp.10.2.',
    requirements: ['op.exp.10.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'EXECUTION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'key_generation_tool_executed'],
    relatedRules: ['111105'],
    auditQuestion:
      '¿Se generan claves en máquinas declaradas como medios de explotación en P-05?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.10',
    title: 'Claves retiradas presentes en medios de explotación',
    description:
      'Contraste entre las claves declaradas como retiradas en P-01 (columna `estado`) y las claves privadas que el barrido encuentra en disco, por huella de la parte pública o por ubicación. Una clave retirada que sigue presente no está archivada en un medio aislado como exige op.exp.10.3.',
    requirements: ['op.exp.10.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // El MISMO hecho de EV-02: la población es la misma, todas las claves
    // privadas presentes en disco.
    expectedEventTypes: ['evidence_state', 'key_material_found'],
    stateFactEventTypes: ['key_material_found'],
    relatedRules: ['111102'],
    auditQuestion:
      '¿Alguna clave declarada como retirada en P-01 sigue presente en esta máquina?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.10',
    title: 'Vigencia y algoritmos de los certificados',
    description:
      'Inventario de los certificados X.509 en disco (sin el almacén de CA públicas del sistema) con su caducidad, su clave pública y su firma. Un certificado caducado que sigue instalado incumple op.exp.10.1 (la retirada no se gestiona); una clave o una firma no autorizadas en P-03 incumplen op.exp.10.r1.1. Los que caducan dentro de la antelación de P-10 se señalan.',
    requirements: ['op.exp.10.1', 'op.exp.10.r1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'certificate_observed'],
    stateFactEventTypes: ['certificate_observed'],
    relatedRules: ['111107'],
    auditQuestion:
      '¿Hay certificados caducados instalados, o con clave o firma no autorizadas en P-03?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.10',
    title: 'Protección de los ficheros de clave',
    description:
      'Modo y propietario de cada clave privada presente en disco, contrastados con la protección que P-02 declara para su almacén. Una clave privada legible por quien no es su propietario está materialmente desprotegida aunque nadie la haya leído todavía.',
    requirements: ['op.exp.10.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // El MISMO hecho de EV-02 y EV-06.
    expectedEventTypes: ['evidence_state', 'key_material_found'],
    stateFactEventTypes: ['key_material_found'],
    relatedRules: ['111102'],
    judgment: {
      // La fila la busca el DIRECTORIO de la clave. La columna `octal` compara
      // «no más permisivo»: una clave en 400 donde se admite 600 cumple. Una
      // clave cuyo directorio no tiene fila no se puede juzgar: la dice EV-02.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-02',
      factEventTypes: ['key_material_found'],
      factField: 'directorio',
      factKeyField: 'directorio',
      tableKeyColumn: 'ruta',
      tableChecks: [
        { column: 'modo_maximo', factField: 'modo' },
        { column: 'propietario', factField: 'propietario' },
      ],
    },
    auditQuestion:
      '¿Toda clave privada tiene un modo no más permisivo y el propietario que P-02 declara para su almacén?',
  },
  // --- op.mon.1 · Detección de intrusión ------------------------------------
  //
  // Todo se mide en el MANAGER (agent.id=000), con ficheros locales y sin
  // credenciales: el motor de reglas, la base de agentes (global.db) y la base
  // de cada agente en el manager (queue/db/NNN.db), alerts.json y los ficheros
  // de reglas. Los hechos hablan de OTROS sistemas por su campo `agente`, así
  // que no hay primitiva que los juzgue: lo hace la policy del control
  // (`policies/op-mon-1.policy.ts`), cruzando cada fila de P-01 con su hecho
  // por nombre o por ID, y el puente lo lleva a la tabla.
  //
  // El recolector solo declara huecos (`evidence_state` NO_EVALUABLE con su
  // causa), nunca veredictos. Pasa cada hora: el estado del motor de reglas
  // (EV-01) en cada pasada, y todo lo demás —estados lentos y por agente— cada
  // 6 h, reemitido entero. El contrato completo (campos, cadencias, partes de
  // los ids) lo documenta el runbook, y `tests/op-mon-1-judgment.test.ts` lo
  // ejercita.
  //
  // Reglas: banda 111200-111299, desplegadas por el runbook `linux/op.mon.1`.
  {
    // La serie del motor entre pasadas prueba que procesa; por eso
    // `detection_engine_status` NO es hecho de estado (quedarse con la última
    // pasada borraría la anterior, que es con la que se compara), y
    // `ruleset_version_observed` tampoco: llega cada 6 h y la pasada horaria,
    // que también cubre EV-01, lo descartaría. La policy toma la última de cada
    // uno contra su frescura.
    id: 'EV-01',
    controlId: 'op.mon.1',
    title: 'Capacidad de detección de intrusiones desplegada y operativa',
    description:
      'Motor de reglas del manager en marcha y procesando: estado del servicio wazuh-manager, contadores del motor de análisis (eventos recibidos, procesados y descartados, alertas escritas) cuya serie entre pasadas prueba que procesa, y el ruleset cargado: versión de Wazuh, fecha del fichero de reglas más reciente, ficheros, reglas y reglas con técnica MITRE ATT&CK. Los conjuntos de reglas de P-03 (R1) se juzgan aparte, con el inventario de EV-04.',
    requirements: ['op.mon.1.1', 'op.mon.1.r1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'detection_engine_status', 'ruleset_version_observed'],
    relatedRules: ['111201', '111202'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Está el motor de reglas del manager en marcha, procesando eventos y con reglas cargadas?',
  },
  {
    // Por agente, cada 6 h. La policy cruza cada sistema de P-01 con su fila
    // por ID o por nombre: agente conectado y pasadas de FIM y SCA dentro de
    // P-10. Los agentes fuera de P-01 (de prueba, dados de baja) no cuentan.
    // La base ilegible de un agente llega en su hecho (`lectura=error`); el
    // evidence_state de la evidencia entera es solo para global.db.
    id: 'EV-02',
    controlId: 'op.mon.1',
    title: 'Cobertura efectiva de la detección',
    description:
      'Por cada agente registrado en el manager (global.db, leída en solo lectura): estado de conexión, último keepalive, versión y grupos; y, de su base en el manager, el fin de su última pasada de FIM, de SCA y de inventario. Se contrasta con los sistemas de P-01: un sistema declarado sin agente, con el agente desconectado o sin pasada de FIM o SCA en P-10 horas es un punto ciego del control.',
    requirements: ['op.mon.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'detection_coverage_observed'],
    stateFactEventTypes: ['detection_coverage_observed'],
    relatedRules: ['111203'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada sistema de P-01 su agente conectado y ha completado pasadas de FIM y de SCA dentro de P-10?',
  },
  {
    // Por agente, cada 6 h: el instante de la última alerta propia (sin las de
    // ENSFácil) y el volumen de las últimas 24 h. «Sistema activo sin
    // detecciones» decide (decisión del responsable del 09/10), con P-09.
    id: 'EV-03',
    controlId: 'op.mon.1',
    title: 'Detecciones de intrusión del período',
    description:
      'Por cada agente, a partir de alerts.json del manager (sin las alertas de ENSFácil): instante de su última alerta, alertas y nivel máximo de las últimas 24 h, reglas distintas disparadas y técnicas MITRE ATT&CK. Es la prueba de que la detección no solo está desplegada sino que produce resultado: un sistema de P-01 conectado que pasa más de P-09 días sin ninguna detección indica reglas que no se aplican o una ingesta que no llega.',
    requirements: ['op.mon.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'detection_activity_observed'],
    stateFactEventTypes: ['detection_activity_observed'],
    relatedRules: ['111204'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Ha producido cada sistema de P-01 conectado alguna detección en los últimos P-09 días?',
  },
  {
    // Por conjunto de reglas, cada 6 h: los ids que pueden alertar, en rangos
    // comprimidos y partidos en varias líneas si no caben en una.
    id: 'EV-04',
    controlId: 'op.mon.1',
    title: 'Trazabilidad entre análisis de riesgos y capacidad de detección',
    description:
      'Identificadores de las reglas que el manager carga y que pueden generar una alerta (sin los ficheros excluidos ni las reglas de nivel 0), por conjunto y en rangos comprimidos. Se cruza con P-04: cada situación de compromiso del análisis de riesgos tiene que tener al menos una regla de detección cargada. Una situación sin regla es un punto ciego del control.',
    requirements: ['op.mon.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'ruleset_rules_loaded'],
    stateFactEventTypes: ['ruleset_rules_loaded'],
    relatedRules: ['111205'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada situación de compromiso de P-04 al menos una regla de detección cargada en el manager?',
  },
  {
    // Por producto, cada 6 h. Solo se juzga si P-02 exige detección en red.
    id: 'EV-05',
    controlId: 'op.mon.1',
    title: 'Ingesta y correlación de eventos de detección en red',
    description:
      'Por cada sistema de detección en red (Suricata, Snort, Zeek u otro IDS) cuyos eventos ingiere el manager: de dónde llegan (syslog remoto o el fichero que recoge un agente) y la última alerta de red recibida, con las de las últimas 24 h. Solo se exige si P-02 declara que el análisis de riesgos pide detección en red; si no, se informa y la justificación de P-02 queda en el informe.',
    requirements: ['op.mon.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'network_detection_observed'],
    stateFactEventTypes: ['network_detection_observed'],
    relatedRules: ['111206'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      'Si P-02 exige detección en red, ¿ingiere el manager los eventos de ese NIDS y ha recibido alertas suyas dentro de P-09?',
  },
  {
    // Dato del informe, sin requisito que la juzgue (spec §1.3): «existirán
    // procedimientos» es documental (P-05 o P-ATT) y la aplicación de un
    // procedimiento a cada alerta ya la mide op.exp.7 (EV-02 y EV-06 de allí).
    // La policy la devuelve NO_APLICA con ese motivo para que no salga en gris.
    id: 'EV-06',
    controlId: 'op.mon.1',
    title: 'Aplicación de los procedimientos de respuesta (R2)',
    description:
      'Que las alertas generadas se trataron conforme al procedimiento de respuesta que les corresponde según P-05. Es un dato del informe, sin veredicto propio: la existencia de los procedimientos (R2) se acredita documentalmente con P-05, y su aplicación a cada alerta la mide op.exp.7 cruzando las alertas con el registro de incidentes.',
    requirements: ['op.mon.1.r2.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se trataron las alertas conforme al procedimiento de P-05? (dato del informe; lo mide op.exp.7)',
  },
  {
    // R3 no se exige en ninguna categoría: se mide y se INFORMA, sin veredicto.
    // `active_response_configured` es estado (cada 6 h); `active_response_executed`
    // es una acción, agregada por agente, programa y regla en cada pasada.
    id: 'EV-07',
    controlId: 'op.mon.1',
    title: 'Acciones predeterminadas de respuesta ejecutadas (R3)',
    description:
      'Respuestas automáticas configuradas en el manager (comando, reglas o grupos que las disparan, reversión, si están habilitadas) frente a las acciones de P-07, y las ejecutadas en la ventana con la regla que las disparó, el agente y el objetivo. R3 no es exigible en ninguna categoría: se informa como cobertura de hecho del enunciado general del bloque op.mon.',
    requirements: ['op.mon.1.r3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'LOW',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'active_response_configured', 'active_response_executed'],
    stateFactEventTypes: ['active_response_configured'],
    relatedRules: ['111207', '111208'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué respuestas automáticas de P-07 están configuradas y cuáles se han ejecutado a raíz de una alerta? (se informa: R3 no es exigible)',
  },
  {
    // Dos ejes (spec §1.3): la antigüedad del ruleset contra P-08, con
    // `ruleset_version_observed` (el hecho es de EV-01: un nombre de evento no
    // puede estar en dos evidencias), y los silenciamientos contra P-06.
    id: 'EV-08',
    controlId: 'op.mon.1',
    title: 'Vigencia del conjunto de reglas y gestión de exclusiones',
    description:
      'Antigüedad del ruleset (fecha de su fichero de reglas más reciente) frente a P-08, y el barrido de silenciamientos del manager: ficheros de reglas excluidos en ossec.conf (rule_exclude) y reglas reescritas a nivel 0 en las reglas propias. Cada silenciamiento tiene que figurar en P-06 con su motivo y quién lo aprobó: una exclusión sin constancia degrada la detección sin que nadie lo advierta.',
    requirements: ['op.mon.1.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'rule_silenced'],
    stateFactEventTypes: ['rule_silenced'],
    relatedRules: ['111202', '111209'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Es el ruleset más reciente que P-08 y figura en P-06, con motivo y aprobación, cada fichero excluido y cada regla silenciada?',
  },
  // --- op.cont.2 · Plan de continuidad --------------------------------------
  //
  // Control de DOCUMENTO, sin runbook ni reglas: ninguna máquina emite hechos
  // para él, así que ninguna evidencia escucha ningún evento ni tiene origen
  // (`expectedEventTypes` y `sourceTypes` vacíos). Todas las resuelve la policy
  // del control (`policies/op-cont-2.policy.ts`) con las tablas de la pantalla
  // y su vigencia contra la fecha de la evaluación, y el puente las lleva a la
  // tabla. Un control cuyas evidencias no escuchan nada no espera hechos: lo
  // que no se puede acreditar es de CONFIGURACIÓN, nunca de RECOGIDA (ver
  // `controlExpectsFacts` en `registry.ts`).
  //
  // Se rige por el nivel de Disponibilidad y solo en ALTO: con D en BAJO o
  // MEDIO todas salen NO_APLICA por nivel.
  //
  // EV-01, EV-04 y EV-06 juzgan declaraciones: su CUMPLE dice que la
  // declaración está completa y en vigor, no que se haya medido nada, y el
  // requisito que se apoya en ellas sale «acreditado documentalmente». EV-02,
  // EV-05, EV-07 y EV-08 no se pueden medir hoy y EV-03 es de R2, que no se
  // exige: las cinco salen NO_APLICA como dato del informe, con su motivo.
  {
    id: 'EV-01',
    controlId: 'op.cont.2',
    title: 'Registro del plan de continuidad y de su vigencia',
    description:
      'Constancia del plan aprobado de P-01 (referencia, versión y fecha de aprobación) y control de que su última aprobación no tiene más antigüedad que la periodicidad de revisión de P-08 en la fecha de la evaluación. NO es verificación del contenido del plan: es control documental de existencia y vigencia. Sostiene los cinco requisitos, porque cada uno es un contenido del plan.',
    requirements: ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Consta un plan de continuidad aprobado, con su versión y fecha, cuya última aprobación no supera la periodicidad de revisión de P-08?',
  },
  {
    id: 'EV-02',
    controlId: 'op.cont.2',
    title: 'Detección y datación de interrupciones reales del servicio',
    description:
      'Interrupciones efectivamente producidas en los sistemas que soportan servicios esenciales (caída de agente, parada de servicio, pérdida de conectividad), con su hora de inicio y de restablecimiento. Dato del informe, sin veredicto: el requisito pide una PREVISIÓN, no ausencia de caídas, y el hecho que las mediría no se recoge en esta versión.',
    requirements: ['op.cont.2.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Qué interrupciones han sufrido los sistemas que soportan los servicios esenciales de P-02, y cuánto duró cada una?',
  },
  {
    id: 'EV-03',
    controlId: 'op.cont.2',
    title: 'Comprobación de integridad tras caída o discontinuidad (R2)',
    description:
      'Verificación de la integridad del sistema operativo, del firmware y de los ficheros de configuración de P-07 al reanudarse el servicio tras una caída. R2 no se exige en ningún nivel: solo informe. La comprobación en el arranque ya la mide op.exp.6 en cada agente (su EV-06).',
    requirements: ['op.cont.2.r2.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Se comprueba la integridad de los componentes de P-07 cada vez que el sistema vuelve de una caída?',
  },
  {
    id: 'EV-04',
    controlId: 'op.cont.2',
    title: 'Vigencia de los contratos de medios alternativos',
    description:
      'Cada medio alternativo de P-04 con el acuerdo o contrato que lo materializa y en vigor en la fecha de la evaluación. op.cont.2.3 exige que TODOS estén materializados en contrato: un medio sin contrato, o con el contrato vencido, es un incumplimiento directo. Se juzga la declaración, no el contrato.',
    requirements: ['op.cont.2.3'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Tiene cada medio alternativo de P-04 un acuerdo o contrato en vigor?',
  },
  {
    id: 'EV-05',
    controlId: 'op.cont.2',
    title: 'Coherencia de las funciones asignadas en el plan',
    description:
      'Contraste entre las personas con función en P-03 y su situación real en la organización (bajas, cambios de puesto). Dato del informe, sin veredicto: no hay directorio corporativo integrado (las bajas de op.acc.1 son cuentas de sistema, no personas), así que la declaración de P-03 se juzga en op.cont.2.1 y su coherencia la revisa el auditor.',
    requirements: ['op.cont.2.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Siguen en la organización, y en el puesto, las personas a las que P-03 asigna una función del plan?',
  },
  {
    id: 'EV-06',
    controlId: 'op.cont.2',
    title: 'Estado de la formación del personal afectado',
    description:
      'Cada responsable y cada suplente de P-03 con una fila en P-05 y la formación vigente en la fecha de la evaluación. op.cont.2.4 la exige de forma expresa: una persona con función sin formación registrada, o con la formación vencida, es un incumplimiento. Se juzga la declaración, no la formación.',
    requirements: ['op.cont.2.4'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Tiene cada persona con función en el plan (P-03) formación específica vigente en P-05?',
  },
  {
    id: 'EV-07',
    controlId: 'op.cont.2',
    title: 'Disponibilidad real frente a los objetivos comprometidos',
    description:
      'Disponibilidad efectiva de los sistemas que soportan servicios esenciales contrastada con los RTO y RPO de P-02. Dato del informe, sin veredicto: depende de las interrupciones de EV-02, que no se recogen en esta versión.',
    requirements: ['op.cont.2.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Se ha restablecido cada servicio esencial dentro de su RTO en las interrupciones del período?',
  },
  {
    id: 'EV-08',
    controlId: 'op.cont.2',
    title: 'Entrada en servicio de los medios alternativos',
    description:
      'Activación efectiva de los medios alternativos (arranque en el emplazamiento secundario, conmutación de servicios) y el intervalo desde la caída del medio habitual. Dato del informe, sin veredicto: no hay un hecho genérico que distinga «arrancó el CPD alternativo» de «arrancó una máquina».',
    requirements: ['op.cont.2.2'],
    levels: ['ALTO'],
    category: 'RECOVERY',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Entraron en servicio los medios alternativos cuando hizo falta, y en cuánto tiempo?',
  },
  // --- op.cont.3 · Pruebas periódicas -----------------------------------------
  //
  // Solo con la Disponibilidad en ALTO (`levelDimension: 'D'`): en MEDIA todo
  // es NO_APLICA. Un requisito con dos obligaciones, probar con periodicidad y
  // corregir lo que la prueba revela, que juzga la policy del control
  // (`policies/op-cont-3.policy.ts`) con EV-01, EV-02, EV-04 y EV-05. EV-03,
  // EV-06, EV-07 y EV-08 alimentan EV-04 y el informe: salen NO_APLICA como
  // dato del informe, con lo medido en el motivo.
  //
  // Todo se mide en el MANAGER (agent.id=000), con ficheros locales y sin
  // credenciales: los dos registros TSV de la organización
  // (/etc/ensfacil/continuity-test-register.tsv y
  // continuity-deficiency-register.tsv) y, para cada prueba registrada, las
  // alertas de su ventana en alerts.json y sus archivos diarios: caídas y
  // arranques de los agentes (503/504/506), restauraciones de mp.info.6
  // (106606, sin tocar mp.info.6) y cambios de FIM posteriores. Los hechos
  // hablan de OTROS sistemas por su campo `agente`, y la policy cruza los
  // sistemas de cada prueba con ellos por ID o por nombre exacto.
  //
  // Todos los hechos son de ESTADO: el recolector pasa cada 6 h y reemite
  // entero lo que dice de cada prueba registrada. Lo que vio en la ventana de
  // una prueba de hace cinco meses tiene que seguir llegando: como acción
  // saldría de la ventana de 30 días y la última prueba quedaría sin medida casi
  // todo el año. El contrato completo lo documenta el runbook `linux/op.cont.3`,
  // y `tests/op-cont-3-judgment.test.ts` lo ejercita.
  //
  // Reglas: banda 111700-111799, desplegadas por el runbook `linux/op.cont.3`.
  {
    // El registro de pruebas leído en la última pasada (111701) y una fila por
    // prueba (111702), con lo que se pudo medir de su ventana. Registro vacío
    // no es registro ausente: vacío, no consta ninguna prueba (NO_CUMPLE);
    // ausente, no hay contra qué juzgar (CONFIGURATION).
    id: 'EV-01',
    controlId: 'op.cont.3',
    title: 'Registro histórico de las pruebas realizadas',
    description:
      'Constancia de cada prueba del plan de continuidad en el registro de pruebas del manager (/etc/ensfacil/continuity-test-register.tsv): inicio y fin, tipo (revisión documental, escritorio, parcial o simulacro), escenario, sistemas implicados, participantes, resultado declarado, deficiencias detectadas y referencia al informe. Se exige al menos una prueba que ejercite los medios alternativos (parcial o simulacro), y que P-02 prevea alguna: una revisión de escritorio no demuestra que funcionen.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_test_register_read', 'continuity_test_recorded'],
    stateFactEventTypes: ['continuity_test_register_read', 'continuity_test_recorded'],
    relatedRules: ['111701', '111702'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Consta en el registro alguna prueba del plan de continuidad, y alguna que ejercite los medios alternativos?',
  },
  {
    // Sin hecho propio: la policy calcula, sobre las filas de EV-01, la última
    // prueba de todas, de cada tipo de P-02 y de cada escenario de P-03, en el
    // instante en que se leyó el registro.
    id: 'EV-02',
    controlId: 'op.cont.3',
    title: 'Control de la periodicidad de las pruebas',
    description:
      'Meses transcurridos desde la última prueba registrada, desde la última de cada tipo de P-02 (con su periodicidad, o la de P-01) y desde la última de cada escenario de P-03, contra P-01. Los escenarios de P-03 que nunca se han probado son el hueco de cobertura más concreto. Es la verificación de la primera de las dos obligaciones del requisito.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_test_register_read', 'continuity_test_recorded'],
    relatedRules: ['111702'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se ha probado el plan, cada tipo de prueba de P-02 y cada escenario de P-03 dentro de su periodicidad?',
  },
  {
    // Dato del informe, sin veredicto propio: alimenta EV-04. Por prueba
    // parcial o simulacro con sistemas y por agente candidato, la cronología de
    // paradas, desconexiones y arranques en la ventana REAL de la prueba (la
    // que declara su fila del registro) y las 24 h siguientes.
    id: 'EV-03',
    controlId: 'op.cont.3',
    title: 'Medición objetiva de lo ocurrido durante la prueba',
    description:
      'Por cada prueba parcial o simulacro y cada sistema implicado que es un agente de Wazuh: la cronología de paradas (regla 506), desconexiones (504) y arranques (503) de su agente en la ventana real de la prueba (la de su fila del registro, no la prevista en P-06) y en las 24 h siguientes, de alerts.json del manager y sus archivos diarios. De ella sale la indisponibilidad medida de cada sistema, que juzga EV-04 contra P-07.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'availability_event_observed'],
    stateFactEventTypes: ['availability_event_observed'],
    relatedRules: ['111705'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué caídas y restablecimientos registró el manager en la ventana de cada prueba? (dato del informe; lo juzga EV-04)',
  },
  {
    // Sin hecho propio: la policy cruza la cronología de EV-03 y las
    // restauraciones de EV-08 de cada prueba del periodo con los RTO de P-07 y
    // con el resultado que declara su fila. Discrepancia: declarada
    // satisfactoria y medida fuera de objetivo.
    id: 'EV-04',
    controlId: 'op.cont.3',
    title: 'Resultado de la prueba frente a los objetivos comprometidos',
    description:
      'Por cada prueba parcial o simulacro del periodo de P-01: la indisponibilidad más larga medida de cada sistema implicado frente a su RTO de P-07 (con su tolerancia), si se restableció, y el resultado de las restauraciones de copias de la ventana, contrastados con el resultado declarado en el registro. Una prueba declarada satisfactoria cuya medida no alcanzó los objetivos es la discrepancia que este control persigue.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_test_recorded', 'availability_event_observed', 'backup_restore_observed'],
    relatedRules: ['111702', '111705', '111706'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Coincide el resultado declarado de cada prueba con lo medido en los sistemas frente a los RTO de P-07?',
  },
  {
    // El registro de deficiencias leído en la última pasada (111703) y una fila
    // por deficiencia (111704). La columna `estado` viaja como `situacion`.
    id: 'EV-05',
    controlId: 'op.cont.3',
    title: 'Deficiencias detectadas y seguimiento de su corrección',
    description:
      'Las deficiencias que cada prueba revela, en el registro de deficiencias del manager (/etc/ensfacil/continuity-deficiency-register.tsv), con su prueba de origen, responsable, plazo, estado y cierre. No cumple una deficiencia abierta fuera de plazo, una que sigue abierta cuando ya se hizo la prueba siguiente, ni una prueba del periodo que declara más deficiencias de las que el registro sigue. Cubre la SEGUNDA obligación del requisito, que exige corregir y no solo localizar.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded'],
    stateFactEventTypes: ['continuity_deficiency_register_read', 'continuity_deficiency_recorded'],
    relatedRules: ['111703', '111704'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Está cada deficiencia de las pruebas registrada, dentro de su plazo y cerrada antes de la prueba siguiente?',
  },
  {
    // Dato del informe, sin veredicto propio. Por prueba y agente, las
    // alertas de FIM de las 24 h siguientes al fin de la ventana, agregadas.
    id: 'EV-06',
    controlId: 'op.cont.3',
    title: 'Integridad y estado del sistema tras la prueba',
    description:
      'Por cada prueba parcial o simulacro y cada sistema implicado que es un agente de Wazuh: los cambios de FIM (grupo syscheck) en las 24 h siguientes al fin de su ventana, con las rutas cambiadas. Son desviaciones que la prueba pudo dejar y que deberían constar como deficiencia aunque la prueba se considerase satisfactoria. Dato del informe, sin veredicto propio.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'post_test_change_observed'],
    stateFactEventTypes: ['post_test_change_observed'],
    relatedRules: ['111707'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué cambió en los sistemas de cada prueba después de su ventana? (dato del informe)',
  },
  {
    // Sin hecho propio. La versión del plan es un parámetro de OTRO control
    // (op.cont.2 P-01) y esta policy no lo ve: se resuelve con la columna
    // `version_plan` del registro de deficiencias. Una deficiencia cerrada sin
    // versión es una corrección posiblemente nominal: se informa, porque no
    // toda corrección exige cambiar el plan.
    id: 'EV-07',
    controlId: 'op.cont.3',
    title: 'Actualización del plan tras las pruebas',
    description:
      'Por cada deficiencia cerrada del registro: la versión del plan de continuidad que recoge la corrección (columna version_plan). Las cerradas sin versión se señalan como corrección posiblemente nominal. Dato del informe, sin veredicto propio: no toda corrección cambia el plan, y la versión vigente del plan es de op.cont.2.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded'],
    relatedRules: ['111704'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué versión del plan recoge cada deficiencia cerrada? (dato del informe)',
  },
  {
    // Dato del informe, sin veredicto propio: alimenta EV-04. Una restauración
    // fallida en la ventana de una prueba declarada satisfactoria es una
    // discrepancia.
    id: 'EV-08',
    controlId: 'op.cont.3',
    title: 'Restauración de copias de seguridad en las pruebas',
    description:
      'Las pruebas de restauración de mp.info.6 (regla 106606) que el manager recibió en la ventana de cada prueba y las 24 h siguientes, con su agente, instante, resultado y si el contenido restaurado coincide. Se leen de alerts.json del manager, sin credenciales y sin tocar mp.info.6. Dato del informe, sin veredicto propio: una restauración fallida en una prueba declarada satisfactoria la juzga EV-04.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'backup_restore_observed'],
    stateFactEventTypes: ['backup_restore_observed'],
    relatedRules: ['111706'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué restauraciones de copias se hicieron en cada prueba y con qué resultado? (dato del informe; lo juzga EV-04)',
  },
  // --- op.mon.2 · Sistema de métricas ---------------------------------------
  //
  // Un METACONTROL: su materia prima es el resultado de los demás controles, y
  // la policy de un control no ve los demás. Por eso EV-01 (grado de
  // implantación), EV-05 (grises) y EV-07 (datos del art. 32) son salida del
  // motor: las calcula el modelo de informe con el estado de todos los
  // controles, sin veredicto, y la policy las devuelve NO_APLICA con el motivo
  // «dato del informe» para que no salgan en gris.
  //
  // Lo que sí deja huella se mide en el MANAGER (agent.id=000), con ficheros
  // locales y sin credenciales, cada 6 h y reemitido entero: el registro de
  // ciclos de métricas (EV-02 y EV-06), el registro de incidentes de op.exp.7
  // (EV-03, mismo fichero y mismo formato) y la base de agentes con los latidos
  // de todos los recolectores leídos en alerts.json (EV-04). El recolector solo
  // declara huecos (`evidence_state` NO_EVALUABLE con su causa), nunca
  // veredictos; la policy (`policies/op-mon-2.policy.ts`) juzga.
  //
  // Reglas: banda 111300-111399, desplegadas por el runbook `linux/op.mon.2`.
  {
    // Dato del informe, sin veredicto (spec §2.6, pregunta 2): el porcentaje de
    // implantación de cada medida aplicable de P-01, con el resultado de todos
    // los demás controles. Lo calcula el modelo de informe.
    id: 'EV-01',
    controlId: 'op.mon.2',
    title: 'Grado de implantación de las medidas de seguridad',
    description:
      'Porcentaje de implantación de cada medida aplicable según la Declaración de Aplicabilidad (P-01), agregado por marco y global, con el resultado que ENSFácil da a cada control. Es salida del motor, no un hecho: va al informe de op.mon.2 sin veredicto, y la serie que acredita que se consolida es EV-02.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué grado de implantación tiene cada medida aplicable de P-01? (dato del informe, sin veredicto)',
  },
  {
    // Cada 6 h: la lectura del registro de ciclos (111301) y un hecho por ciclo
    // de los últimos 400 días y siempre el último (111302). Vacío se juzga;
    // ausente es CONFIGURATION.
    id: 'EV-02',
    controlId: 'op.mon.2',
    title: 'Serie histórica de los ciclos de métricas',
    description:
      'Registro de ciclos de métricas de la organización (/etc/ensfacil/metrics-cycle-register.tsv): cada vez que se consolida y valida el informe de ENSFácil se anota el periodo, la fecha de consolidación, el grado de implantación global y quién lo validó. El motor solo ve 30 días de hechos, así que la serie trimestral o anual no se puede reconstruir: se acredita con este registro. El último ciclo validado por un responsable de P-05 tiene que estar dentro de la periodicidad de P-02, con la Declaración de Aplicabilidad (P-01) configurada.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'metrics_register_read', 'metrics_cycle_recorded'],
    stateFactEventTypes: ['metrics_register_read', 'metrics_cycle_recorded'],
    relatedRules: ['111301', '111302'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Está el último ciclo de métricas validado por un responsable de P-05 dentro de la periodicidad de P-02?',
  },
  {
    // Cada 6 h: la lectura del registro de incidentes de op.exp.7 (111303) y
    // una fila por fase de los incidentes vivos en los últimos 400 días
    // (111304), con las 13 columnas del registro.
    id: 'EV-03',
    controlId: 'op.mon.2',
    title: 'Métricas de comportamiento de la gestión de incidentes (R1)',
    description:
      'Indicadores de P-03 calculados con el registro de incidentes de op.exp.7 (/etc/ensfacil/incident-register.tsv, mismo fichero y mismo formato de 13 columnas), reemitido con la etiqueta op.mon.2: incidentes por tipo y por severidad, tiempos medios de contención y de resolución, notificados al CCN-CERT y a la AEPD. Cada incidente del periodo tiene que tener los datos que necesita cada indicador. Sin incidentes en el periodo, los indicadores valen cero y cumple si el registro existe y el último ciclo de métricas está en plazo.',
    requirements: ['op.mon.2.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'incident_register_read', 'incident_registered'],
    stateFactEventTypes: ['incident_register_read', 'incident_registered'],
    relatedRules: ['111303', '111304'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Permite el registro de incidentes calcular cada indicador de P-03 del periodo, y se consolida en un ciclo de métricas en plazo?',
  },
  {
    // Cada 6 h, por agente: su estado en global.db (111305) y la última pasada
    // de cada recolector de ENSFácil que ha informado desde él, leída de los
    // collector_run de alerts.json y conservada entre pasadas (111306).
    id: 'EV-04',
    controlId: 'op.mon.2',
    title: 'Fiabilidad de la medición',
    description:
      'Cobertura de la monitorización sobre la que se calculan las métricas: de los sistemas del alcance ENS (el grupo ens y el manager), cuántos tienen el agente conectado y todos sus recolectores de ENSFácil al día (su último latido en las 24 h anteriores a la lectura y sin fallar). Se contrasta con el objetivo cobertura_monitorizacion de P-06, menos su tolerancia: un grado de implantación calculado sobre una monitorización incompleta no es un dato sólido.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'agent_keepalive_observed', 'collector_heartbeat_observed'],
    stateFactEventTypes: ['agent_keepalive_observed', 'collector_heartbeat_observed'],
    relatedRules: ['111305', '111306'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Alcanza la cobertura de la monitorización del alcance ENS el objetivo de P-06?',
  },
  {
    // Dato del informe, sin veredicto: los grises de cada control con el
    // parámetro que falta. Lo calcula el modelo de informe.
    id: 'EV-05',
    controlId: 'op.mon.2',
    title: 'Controles no evaluables por falta de parámetros',
    description:
      'Recuento y relación de los controles con requisitos que ENSFácil no puede evaluar porque falta configuración del cliente, con el parámetro que falta en cada caso. Es salida del motor: va al informe de op.mon.2 sin veredicto, frente al objetivo controles_no_evaluables de P-06 si se declara.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué controles no se pueden evaluar por falta de parámetros, y cuáles faltan? (dato del informe, sin veredicto)',
  },
  {
    // Sin hecho propio: lee `metrics_cycle_recorded`, que es de EV-02 (un
    // nombre de evento no puede estar en dos evidencias).
    id: 'EV-06',
    controlId: 'op.mon.2',
    title: 'Recursos consumidos por el sistema de seguridad (R2)',
    description:
      'Horas internas, horas externas y presupuesto ejecutado del último ciclo del registro de ciclos de métricas, validados por un responsable de P-05 de recursos, con el significado de cada columna declarado en P-04. Es un DATO DECLARADO, no obtenido de Wazuh: la herramienta lo registra y lo presenta junto a las métricas técnicas, pero no lo verifica, y el requisito sale acreditado documentalmente.',
    requirements: ['op.mon.2.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: ['111302'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene el último ciclo de métricas en plazo sus horas y su presupuesto, validados por un responsable de P-05?',
  },
  {
    // Dato del informe, sin veredicto: el informe del art. 32 ES el modelo de
    // informe de op.mon.2, que combina EV-01 a EV-06 con la traza de cada cifra.
    id: 'EV-07',
    controlId: 'op.mon.2',
    title: 'Datos consolidados para el informe anual del artículo 32',
    description:
      'El conjunto de datos con la estructura del informe anual al que remite op.mon.2.1: grado de implantación, serie de ciclos, fiabilidad de la medición, controles no evaluables, indicadores de incidentes y recursos, cada cifra con su origen. Es la salida del modelo de informe, sin veredicto propio.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué datos aporta ENSFácil al informe anual del artículo 32, y de dónde sale cada cifra? (dato del informe, sin veredicto)',
  },
  // --- op.mon.3 · Vigilancia ------------------------------------------------
  //
  // DOS PLANOS. El del MANAGER (agent.id=000) mide con ficheros locales y sin
  // credenciales la recolección central (wazuh-analysisd.state,
  // wazuh-remoted.state, <remote>), la correlación (ficheros de reglas y
  // alerts.json), la superficie de exposición (queue/db/NNN.db de cada agente,
  // queue/vd/feed y los errores del conector del indexer en ossec.log), la
  // alerta en tiempo real (<integration>, email_notification) y los registros
  // de la organización (/etc/ensfacil). El de AGENTE lee los ficheros de
  // estado de Wazuh de cada máquina (wazuh-logcollector.state,
  // wazuh-agentd.state): el volumen y los descartes por fuente solo se ven en
  // la máquina que la lee. El del manager lee también su propio
  // logcollector.
  //
  // Los hechos hablan de fuentes y de activos que la pantalla declara (P-01,
  // P-03, P-07…), así que no hay primitiva que los juzgue: lo hace la policy
  // del control (`policies/op-mon-3.policy.ts`) y el puente lo lleva a la
  // tabla. En la fila de un agente solo se juzgan sus fuentes de P-01; todo lo
  // demás se mide en la del manager.
  //
  // Los recolectores solo declaran huecos (`evidence_state` NO_EVALUABLE con
  // su causa), nunca veredictos. El del manager pasa cada hora (el estado de la
  // recolección, EV-01) y cada 6 h reemite entero todo lo demás; el de agente
  // muestrea cada hora en local y emite cada 6 h. El contrato completo lo
  // documenta el runbook `linux/op.mon.3`, y `tests/op-mon-3-judgment.test.ts`
  // lo ejercita.
  //
  // Reglas: banda 111400-111499.
  {
    // La serie de los contadores entre pasadas horarias prueba que recolecta y
    // que no descarta: por eso `event_collection_status` NO es hecho de estado
    // (la última pasada borraría la anterior, que es con la que se compara).
    id: 'EV-01',
    controlId: 'op.mon.3',
    title: 'Sistema automático de recolección de eventos de seguridad',
    description:
      'El sistema central de recolección en marcha y recibiendo: estado del servicio wazuh-manager, contadores del motor de análisis (eventos recibidos, procesados y descartados) cuya serie entre pasadas horarias prueba que recolecta y que no pierde eventos, conexiones de <remote> (secure y syslog, con su puerto) y agentes registrados y activos en global.db.',
    requirements: ['op.mon.3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'event_collection_status'],
    relatedRules: ['111401'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Está el sistema central de recolección en marcha, recibiendo eventos de sus fuentes y sin descartarlos?',
  },
  {
    // Por fuente, cada 6 h, en los dos planos. Cada fila de P-01 se juzga en la
    // fila de su máquina (agente + ubicación) o, si es syslog, en la del
    // manager (IP del emisor). Una base de estado ilegible llega en el hecho
    // (`lectura`), no como evidence_state de la evidencia entera.
    id: 'EV-02',
    controlId: 'op.mon.3',
    title: 'Cobertura y continuidad de la recolección',
    description:
      'Por cada fuente que lee el logcollector de cada máquina (wazuh-logcollector.state): eventos, bytes y descartes desde el arranque y en el último periodo, y el último instante en que su contador creció; por cada agente, su conexión y su cola de envío (wazuh-agentd.state); y por cada emisor syslog que recibe el manager, su última alerta. Se contrasta con P-01: una fuente declarada que no se lee, que descarta eventos o que lleva más de max_horas_sin_eventos sin uno nuevo es un punto ciego de la vigilancia.',
    requirements: ['op.mon.3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'log_source_observed', 'agent_forwarding_observed', 'syslog_source_observed'],
    stateFactEventTypes: ['log_source_observed', 'agent_forwarding_observed', 'syslog_source_observed'],
    relatedRules: ['111402', '111403', '111404'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Genera eventos cada fuente declarada en P-01, sin descartes y sin lagunas mayores que las que admite?',
  },
  {
    id: 'EV-03',
    controlId: 'op.mon.3',
    title: 'Capacidad de correlación de eventos (R1)',
    description:
      'Por conjunto de reglas cargado en el manager: reglas, reglas que correlacionan (frequency y timeframe, o if_matched_sid / if_matched_group, con nivel efectivo de 1 o más) y técnicas MITRE ATT&CK que cubren. Y las alertas producidas por correlación en el periodo, por regla y día. Se contrasta con los conjuntos de P-02: R1 exige que se correlacione, no solo que se recolecte.',
    requirements: ['op.mon.3.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'correlation_rules_inventory', 'correlation_alert_observed'],
    stateFactEventTypes: ['correlation_rules_inventory'],
    relatedRules: ['111405', '111406'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Carga el manager reglas que combinan eventos en cada conjunto que declara P-02?',
  },
  {
    // R2 por CAPACIDAD (decisión del responsable 2 del 09/10): el recuento de
    // vulnerabilidades por activo vive en el indexer y no se lee sin
    // credenciales.
    id: 'EV-04',
    controlId: 'op.mon.3',
    title: 'Superficie de exposición: vulnerabilidades y configuración (R2)',
    description:
      'Por cada activo de P-03, de su base en el manager (queue/db/NNN.db): el fin de su última pasada SCA por política, con aprobados, fallos y puntuación, y la fecha de su inventario de paquetes, del que se alimenta el detector de vulnerabilidades. Del detector: habilitado en ossec.conf, fecha de su fuente (queue/vd/feed) y errores del conector del indexer al escribir el estado de vulnerabilidades en las últimas 24 h (ossec.log). Un detector que no consigue escribir no determina nada. El recuento de CVE por activo no es local: se informa como «sin medir».',
    requirements: ['op.mon.3.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_assessment_observed', 'package_inventory_observed', 'vulnerability_detection_status'],
    stateFactEventTypes: ['config_assessment_observed', 'package_inventory_observed', 'vulnerability_detection_status'],
    relatedRules: ['111407', '111408', '111409'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada activo de P-03 su configuración (SCA) y su inventario analizados dentro de P-11, con el detector de vulnerabilidades al día y escribiendo sin errores?',
  },
  {
    // Sin hecho ni veredicto: Wazuh no trae motor de líneas base. R3.1 se
    // acredita con P-ATT; esta evidencia informa de la línea base de P-04.
    id: 'EV-05',
    controlId: 'op.mon.3',
    title: 'Detección de comportamientos anómalos (R3.1)',
    description:
      'Línea base de comportamiento de P-04 (indicadores, normalidad y umbral de anomalía). Wazuh no calcula líneas base ni hace UEBA: las anomalías son reglas que alguien escribe sobre esos indicadores. Dato del informe, sin veredicto: R3.1 se acredita documentalmente (P-ATT).',
    requirements: ['op.mon.3.r3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué línea base de comportamiento se ha validado y contra qué indicadores se detectan anomalías?',
  },
  {
    id: 'EV-06',
    controlId: 'op.mon.3',
    title: 'Detección de APT por anomalías en el tráfico de red (R3.2)',
    description:
      'Sistemas de detección en red (Suricata, Snort, Zeek) cuyos eventos ingiere el manager, por dónde llegan y su última alerta. Wazuh correlaciona esa detección pero no la genera: sin sonda de red, R3.2 no se cumple.',
    requirements: ['op.mon.3.r3.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'network_detection_observed'],
    stateFactEventTypes: ['network_detection_observed'],
    relatedRules: ['111410'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Ingiere el manager las alertas de la sonda de red que declara P-05, y son recientes?',
  },
  {
    // Informativa: el requisito es disponer del SERVICIO, que es documental.
    id: 'EV-07',
    controlId: 'op.mon.3',
    title: 'Incorporación de indicadores de cibervigilancia (R4)',
    description:
      'Listas CDB que carga el manager (<list> de ossec.conf): entradas, fecha de actualización y reglas que las usan, que es donde acaban los indicadores de un servicio de cibervigilancia. Dato del informe, sin veredicto: R4 exige disponer del observatorio, que se acredita documentalmente (P-ATT).',
    requirements: ['op.mon.3.r4.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'ioc_list_observed'],
    stateFactEventTypes: ['ioc_list_observed'],
    relatedRules: ['111411'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué listas de indicadores carga el manager, de cuándo son y qué reglas las usan?',
  },
  {
    id: 'EV-08',
    controlId: 'op.mon.3',
    title: 'Detección de intentos de minería de datos (R5.1)',
    description:
      'Ids de las reglas de umbral cargadas en el manager (con frequency y que pueden alertar) y sus alertas en el periodo. Se contrasta con P-07: cada consulta declarada tiene que estar vigilada por una regla de umbral. Requiere que la base de datos o la aplicación registren las consultas, no solo las conexiones.',
    requirements: ['op.mon.3.r5.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'query_volume_rules_observed'],
    stateFactEventTypes: ['query_volume_rules_observed'],
    relatedRules: ['111412', '111406'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Vigila una regla de umbral cargada cada sistema y perfil de P-07?',
  },
  {
    id: 'EV-09',
    controlId: 'op.mon.3',
    title: 'Alerta en tiempo real a los administradores de seguridad (R5.2)',
    description:
      'Canales de notificación del manager: el correo (email_notification, nivel mínimo y número de destinatarios) y cada <integration> de ossec.conf (nombre, nivel, grupos y errores de envío en integrations.log en 24 h). Nunca su hook_url ni su api_key. Se contrasta con P-08. La latencia alerta → aviso no es medible: Wazuh no anota los envíos correctos.',
    requirements: ['op.mon.3.r5.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'notification_channel_configured'],
    stateFactEventTypes: ['notification_channel_configured'],
    relatedRules: ['111413'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Existe y está habilitado cada canal de P-08, avisa desde el nivel declarado y envía sin errores?',
  },
  {
    // Sin hecho propio: los mismos hechos SCA de EV-04.
    id: 'EV-10',
    controlId: 'op.mon.3',
    title: 'Inspección: verificación de configuración (R6.1)',
    description:
      'Verificación continua de la configuración con SCA en los activos de P-03 (los hechos de EV-04, contra P-11), o la última verificación del registro de inspecciones dentro de la periodicidad de P-09. La continuidad supera la exigencia de periodicidad.',
    requirements: ['op.mon.3.r6.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: ['111407'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se verifica la configuración de los activos de P-03 de forma continua o con la periodicidad de P-09?',
  },
  {
    // Sin hecho propio: el detector de vulnerabilidades y el inventario de
    // EV-04.
    id: 'EV-11',
    controlId: 'op.mon.3',
    title: 'Inspección: análisis de vulnerabilidades (R6.2)',
    description:
      'Análisis continuo de vulnerabilidades: el detector habilitado, con su fuente al día y escribiendo sin errores, sobre el inventario reciente de cada activo de P-03 (los hechos de EV-04, contra P-11), o el último análisis del registro de inspecciones dentro de la periodicidad de P-09.',
    requirements: ['op.mon.3.r6.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: ['111408', '111409'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se analizan las vulnerabilidades de los activos de P-03 de forma continua o con la periodicidad de P-09?',
  },
  {
    // El registro de actos de la organización: el recolector lo reemite entero
    // en cada pasada sin juzgarlo. Registro vacío no es registro ausente.
    id: 'EV-12',
    controlId: 'op.mon.3',
    title: 'Registro y seguimiento de las inspecciones de seguridad (R6)',
    description:
      'Filas del registro de inspecciones del manager (/etc/ensfacil/security-inspection-register.tsv): fecha, tipo (verificación de configuración, análisis de vulnerabilidades o prueba de penetración), alcance, ejecutor, hallazgos, estado de su remediación, motivo (periódica o tras incidente) e incidente. La última de cada tipo se contrasta con la periodicidad de P-09.',
    requirements: ['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'],
    levels: ['ALTO'],
    category: 'TRACEABILITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'security_inspection_recorded'],
    stateFactEventTypes: ['security_inspection_recorded'],
    relatedRules: ['111414'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Consta en el registro cada inspección de R6 dentro de la periodicidad de P-09?',
  },
  {
    // Informativa: el registro de incidentes (13 columnas, compartido con
    // op.exp.7 y op.exp.9) no dice qué incidentes revelaron vulnerabilidades,
    // así que no se puede exigir la inspección posterior de ninguno.
    id: 'EV-13',
    controlId: 'op.mon.3',
    title: 'Inspecciones desencadenadas por incidentes',
    description:
      'Incidentes del periodo del registro de incidentes del manager y las inspecciones del registro de inspecciones que los citan (motivo «post_incidente»). Dato del informe, sin veredicto: el registro de incidentes no dice qué incidentes revelaron vulnerabilidades nuevas o subestimadas, que son los que R6 obliga a inspeccionar.',
    requirements: ['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'],
    levels: ['ALTO'],
    category: 'TRACEABILITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'incident_registered'],
    stateFactEventTypes: ['incident_registered'],
    relatedRules: ['111415'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué incidentes del periodo tienen una inspección posterior registrada?',
  },
  // --- op.nub.1 · Protección de servicios en la nube ------------------------
  //
  // Mayoritariamente contractual (spec 2026-10-09 §4). Dos planos que el
  // informe no mezcla:
  //
  //   - DOCUMENTAL: EV-08 (certificación de P-04, R1) y EV-09 (expediente por
  //     servicio: P-03, P-08, P-09 y P-10) son tablas de la pantalla con su
  //     vigencia. No tienen hecho: las juzga la policy contra la fecha de la
  //     evaluación, y su CUMPLE se lee «acreditado documentalmente».
  //   - TÉCNICO: EV-01, EV-04 y EV-07 (y EV-02 en ALTA) los mide el recolector
  //     del MANAGER (agent.id=000) con ficheros locales y sin credenciales:
  //     la presencia de los módulos cloud de Wazuh en ossec.conf y en los
  //     agent.conf de los grupos (nunca sus claves), sus alertas en
  //     alerts.json y sus errores en ossec.log. La credencial del proveedor
  //     vive en un agente dedicado del cliente. Los hechos hablan de módulos y
  //     de servicios, no de esta máquina, así que no hay primitiva que los
  //     juzgue: lo hace la policy (`policies/op-nub-1.policy.ts`), cruzando
  //     cada fila de P-06 con su módulo, y el puente lo lleva a la tabla.
  //
  // EV-03 (shadow IT), EV-05 (cifrado) y EV-06 (región) son datos del informe,
  // sin veredicto: la plantilla los promete con «SCA cloud» y tráfico de los
  // equipos, y Wazuh 4.14 no tiene ninguna de las dos cosas con ficheros
  // locales. Lo declarado de cifrado (P-09) y región (P-08) se juzga en EV-09.
  //
  // El recolector solo declara huecos (`evidence_state` NO_EVALUABLE con su
  // causa), nunca veredictos. Pasa cada 6 h. El contrato completo lo documenta
  // el runbook, y `tests/op-nub-1-judgment.test.ts` lo ejercita.
  //
  // Reglas: banda 111500-111599, desplegadas por el runbook `linux/op.nub.1`.
  {
    // Por módulo cloud, cada 6 h (o un hecho con modulo=ninguno). La policy
    // cruza cada fila de P-06 con su módulo: configurado y habilitado, sin
    // errores en 24 h y con registros más recientes que P-13.
    id: 'EV-01',
    controlId: 'op.nub.1',
    title: 'Ingesta de registros de los servicios en la nube',
    description:
      'Por cada módulo cloud de Wazuh (aws-s3, azure-logs, gcp-pubsub, gcp-bucket, office365, ms-graph, github): dónde está configurado (ossec.conf del manager, agent.conf de un grupo o el agente dedicado que envía sus alertas), si está habilitado, el instante de su última alerta, las alertas de las últimas 24 h y sus errores en ossec.log. Se contrasta con P-06: un servicio declarado como integrado cuyo módulo no está, está deshabilitado, da errores o lleva más de P-13 horas sin registros es un punto ciego de trazabilidad. Los servicios de P-02 sin integración se señalan en el informe, sin veredicto.',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'cloud_integration_observed'],
    stateFactEventTypes: ['cloud_integration_observed'],
    relatedRules: ['111501'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Llegan a Wazuh, sin errores y dentro de P-13 horas, los registros de cada servicio que P-06 declara integrado?',
  },
  {
    // Solo ALTA (R2). No es «SCA cloud», que Wazuh 4.14 no tiene: son los
    // hallazgos de postura del propio proveedor que Wazuh ingiere, resumidos
    // por módulo, fuente y estándar cada 6 h.
    id: 'EV-02',
    controlId: 'op.nub.1',
    title: 'Configuración del inquilino según los hallazgos de postura del proveedor (R2)',
    description:
      'Por módulo, fuente y estándar: los controles de postura que el propio proveedor evalúa y envía a Wazuh (AWS Security Hub o Config por aws-s3, Microsoft Defender por ms-graph, Security Command Center por gcp-pubsub), con el último resultado de cada control, los fallidos y los críticos. Se contrasta con P-07: un control fallido en un servicio de P-07 incumple R2. Wazuh 4.14 no trae políticas SCA para inquilinos cloud; sin hallazgos de postura del proveedor, R2 no es automatizable.',
    requirements: ['op.nub.1.r2.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'cloud_posture_finding_observed'],
    stateFactEventTypes: ['cloud_posture_finding_observed'],
    relatedRules: ['111502'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Pasan los controles de postura del proveedor en cada servicio de P-07, con el estándar que declara?',
  },
  {
    // Dato del informe, sin requisito que la juzgue (spec §4.2, §7.3).
    id: 'EV-03',
    controlId: 'op.nub.1',
    title: 'Detección de servicios cloud no inventariados (shadow IT)',
    description:
      'Servicios en la nube en uso que no figuran en el inventario P-02. Es un dato del informe, sin veredicto: detectarlos exige el DNS o el proxy de los equipos, y con los ficheros locales del manager no se ven (el inventario de Wazuh solo da los puertos en escucha). Lo que sí se informa son los módulos cloud que Wazuh ingiere y P-06 no declara.',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Hay servicios en la nube en uso fuera de P-02? (dato del informe: no medible con ficheros locales)',
  },
  {
    // Una acción, agregada por pasada (módulo, cuenta, actor). Ventana de 30
    // días. Cada actor humano, en P-11 para su servicio.
    id: 'EV-04',
    controlId: 'op.nub.1',
    title: 'Operaciones administrativas en los servicios cloud',
    description:
      'Operaciones de administración con éxito en los servicios integrados (creación y modificación de identidades, permisos, configuración de seguridad, reglas de red), agregadas por módulo, cuenta y actor a partir de las alertas de los módulos cloud: CloudTrail, registro de actividad de Azure, Cloud Audit Logs. Cada actor humano tiene que figurar en P-11 para su servicio; las acciones de los propios servicios del proveedor no se contrastan.',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'cloud_admin_operation_observed'],
    relatedRules: ['111503'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Ha ejecutado operaciones de administración en algún servicio integrado un actor que P-11 no autoriza?',
  },
  {
    // Dato del informe: sin «SCA cloud» no hay medida del cifrado configurado;
    // lo declarado en P-09 se juzga en EV-09.
    id: 'EV-05',
    controlId: 'op.nub.1',
    title: 'Verificación del cifrado y del modelo de gestión de claves',
    description:
      'El cifrado de los datos y el modelo de gestión de claves de cada servicio. Es un dato del informe, sin veredicto: Wazuh 4.14 no tiene SCA para inquilinos cloud y el recolector no usa credenciales del proveedor, así que el cifrado configurado no se puede medir. Lo declarado en P-09 forma parte del expediente documental (EV-09, op.nub.1.2 c).',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué cifrado y qué gestión de claves declara cada servicio en P-09? (dato del informe: no medible sin SCA cloud)',
  },
  {
    // Dato del informe: ídem con la región (P-08).
    id: 'EV-06',
    controlId: 'op.nub.1',
    title: 'Verificación de la región de los datos',
    description:
      'La región de los datos y de sus copias en cada servicio. Es un dato del informe, sin veredicto: sin SCA cloud ni credenciales del proveedor la región configurada no se puede medir. Lo declarado en P-08 forma parte del expediente documental (EV-09, op.nub.1.2 d).',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué región de datos y de copias declara cada servicio en P-08? (dato del informe: no medible sin SCA cloud)',
  },
  {
    // Una acción, agregada por pasada (módulo, cuenta, usuario, resultado,
    // segundo factor). Ventana de 30 días. Hallazgo del informe, sin
    // requisito que la juzgue: el criterio del segundo factor es el de
    // op.acc.6.r8.1 (y las ubicaciones de confianza de Azure darían rojos
    // falsos aquí). La policy la devuelve NO_APLICA con lo observado.
    id: 'EV-07',
    controlId: 'op.nub.1',
    title: 'Autenticaciones y accesos en los servicios cloud',
    description:
      'Inicios de sesión interactivos en los servicios integrados (consola de AWS, inicios de sesión de Microsoft Entra ID), agregados por módulo, cuenta, usuario, resultado y segundo factor, con sus orígenes. Es un hallazgo del informe, sin veredicto en op.nub.1: un acceso con éxito sin segundo factor desde una zona no controlada lo juzga op.acc.6.r8.1, y aquí se señala cruzado con él. Si el proveedor no registra el segundo factor (accesos federados, Google Cloud), se dice.',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'cloud_authentication_observed'],
    relatedRules: ['111504'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se ha accedido con éxito a algún servicio integrado sin segundo factor? (hallazgo del informe; lo juzga op.acc.6.r8.1)',
  },
  {
    // Documental (R1): P-04 por servicio utilizado, contra la fecha de la
    // evaluación. Sin hecho.
    id: 'EV-08',
    controlId: 'op.nub.1',
    title: 'Vigencia de las certificaciones de los proveedores (R1)',
    description:
      'Por cada servicio utilizado de P-02, su certificación de P-04 bajo una metodología reconocida, con su número y su vigencia frente a la fecha de la evaluación, y los días que le quedan. NO es verificación del documento: es control de su validez temporal, y su CUMPLE se lee «acreditado documentalmente». Una certificación vencida o ausente incumple R1.',
    requirements: ['op.nub.1.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada servicio de terceros una certificación reconocida en vigor? (declarado, acreditado documentalmente)',
  },
  {
    // Documental: el expediente por servicio utilizado, contra la fecha de la
    // evaluación. Sin hecho.
    id: 'EV-09',
    controlId: 'op.nub.1',
    title: 'Expediente documental del servicio en la nube',
    description:
      'Por cada servicio utilizado de P-02: su conformidad con el ENS (de categoría no inferior a la del sistema) o con la guía CCN-STIC, vigente (P-03); su último informe de pentest, no más viejo que P-12 meses (P-10, op.nub.1.2 a); su cifrado y gestión de claves (P-09, c); la región de sus datos y copias y la jurisdicción (P-08, d). La transparencia (b) la cubre la conformidad declarada. Es DOCUMENTACIÓN APORTADA, no verificada técnicamente: su CUMPLE se lee «acreditado documentalmente».',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada servicio de terceros su expediente completo y vigente: conformidad, pentest, cifrado y jurisdicción? (declarado, acreditado documentalmente)',
  },
];
