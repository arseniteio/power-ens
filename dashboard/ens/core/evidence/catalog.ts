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
//   - se excluyen las reglas `level="0"` (106600/106800/106900 y 106652), que
//     nunca producen alerta y por tanto no llevan a ningún evento crudo;
//   - se excluyen las reglas inertes para el plugin (106605 y 106923), que
//     re-etiquetan alertas syscheck sin campo `ensfacil` y nunca llegan aquí
//     (ver el comentario en el propio XML);
//   - se excluyen las reglas de diagnóstico operativo del recolector
//     (106830 `collector_warning` y 106831 `collector_missing` de op.acc.1),
//     que no llevan `requisito=` ni `evidencia=` porque no acreditan ninguna:
//     son higiene del propio pipeline.
//
// Las reglas genéricas de `evidence_state` (106700-106703 / 106850-106853 /
// 106950-106953) no se listan: engine.ts añade el ruleId del evento que
// resuelve la evidencia, así que aparecen solas cuando son el origen real del
// estado.
//
// Tampoco se listan —y este es el caso que hay que argumentar, porque invita a
// lo contrario— las reglas de los AGREGADOS, `control_state` y
// `score_snapshot`:
//
//   mp.info.6  control_state 106710-106714  score_snapshot 106720-106723
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
// ninguno de los dos. `control_state` sí puede resolver EV-03, EV-04 y EV-06 de
// mp.info.6, que lo declaran en `expectedEventTypes`, pero no les cambia el
// color: un requisito solo sale NO_EVALUABLE cuando TODAS sus evidencias lo
// están, así que esas evidencias ya venían en gris por su `evidence_state`. El
// arreglo compra la línea de alerta y la traza del auditor, nada más.
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
// deja la evidencia sorda al hecho crudo. La comprobación 4 del script vigila
// el primer caso; el segundo lo vigila `tests/test_vocabulario.sh` en el
// runbook de mp.info.6.
export const ENSEvidenceCatalog: ENSEvidenceDefinition[] = [
{
    id: 'EV-01',
    controlId: 'mp.info.6',
    title: 'Última copia realizada correctamente',
    description: 'Existe evidencia de una copia de seguridad finalizada correctamente.',
    requirements: ['mp.info.6.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'EXECUTION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    // `backup_success` se retira: no lo emite ninguna regla ni ningún emisor.
    // Era sinónimo de `backup_ok`, que sí tiene regla (106650), cron y NDJSON en
    // producción, así que manda `backup_ok`.
    expectedEventTypes: [
      'evidence_state',
      'backup_ok',
      'backup_error',
    ],
    relatedRules: ['106650', '106601'],
    auditQuestion: '¿Existe evidencia reciente de que la copia de seguridad se ha realizado correctamente?',
    qualityRequirements: {
      requiredFields: [
        'job_id',
        'start_time',
        'end_time',
        'status',
        'bytes_written',
      ],
      requiredFieldsWhenStatus: ['CUMPLE'],
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-02',
    controlId: 'mp.info.6',
    title: 'Copia dentro del intervalo permitido',
    description: 'La copia se ha realizado dentro de la frecuencia definida por el cliente.',
    requirements: ['mp.info.6.1', 'mp.info.6.2.a'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // Se retira `backup_success` (sin regla ni emisor) y se adopta
    // `freq_deviation`, que emite la regla 106603 con `evidencia=EV-02` y
    // `estado=NO_CUMPLE` y que hasta ahora esta evidencia no escuchaba: la
    // desviación de frecuencia es exactamente lo que EV-02 mide.
    expectedEventTypes: ['evidence_state', 'backup_ok', 'backup_missing', 'freq_deviation'],
    relatedRules: ['106601', '106603'],
    auditQuestion: '¿La última copia se encuentra dentro del intervalo máximo definido por la organización?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.info.6',
    title: 'Retención de copias configurada',
    description: 'Existe evidencia de política de retención de copias.',
    requirements: ['mp.info.6.2.b', 'mp.info.6.2.d'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API', 'SCA'],
    // EL CASO EXTREMO de la reconciliación del vocabulario: declaraba cuatro
    // nombres que no emite nadie (`retention_configured`, `backup_modified`,
    // `backup_deleted`, `backup_ransomware`) y ninguno de los cuatro que sus
    // propias reglas emiten. Resultado: solo podía resolverse por
    // `evidence_state`, y el auditor que bajaba del estado al evento se quedaba
    // sin el último escalón. Los cuatro que se adoptan son los de
    // `relatedRules`, uno a uno: 106604 `access`, 106609 `encfp_changed`,
    // 106660 `verify_ok` y 106661 `verify_error`.
    //
    // `retention_configured` no se sustituye por nada: ninguna regla ni ningún
    // emisor produce un evento con la retención observada, y fabricar uno para
    // que el catálogo cuadre sería fabricar evidencia. Por eso la decisión
    // MIN_RETENTION del runtime sigue saliendo NO_EVALUABLE con todo desplegado
    // (ver el comentario de `getLatestRetentionEvent` en policy-runtime.ts).
    expectedEventTypes: [
      'evidence_state',
      'control_state',
      'access',
      'encfp_changed',
      'verify_ok',
      'verify_error',
    ],
    relatedRules: ['106604', '106609', '106660', '106661'],
    auditQuestion: '¿Existe una política de retención configurada y verificable para las copias de seguridad?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.info.6',
    title: 'Acceso autorizado al repositorio',
    description: 'Se controla el acceso de usuarios y procesos autorizados al repositorio de copias.',
    requirements: ['mp.info.6.2.d'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    // `authorized_access` y `unauthorized_access` no existen como eventos: son
    // el evento `access` de la regla 106604 con su campo `authorized`. Se
    // sustituyen por el nombre real, y el runtime de mp.info.6.2.d lee ese
    // campo en vez del nombre (ver `getLatestAccessEvent` en policy-runtime.ts).
    // Los dos cambios van juntos: separarlos deja al runtime consumiendo un
    // nombre que el catálogo ya no reconoce.
    expectedEventTypes: ['evidence_state', 'control_state', 'access'],
    relatedRules: ['106604'],
    auditQuestion: '¿El acceso al repositorio de copias está limitado a usuarios y procesos autorizados?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.info.6',
    title: 'Prueba de restauración correcta',
    description: 'Existe evidencia de restauración correcta y verificación de integridad.',
    requirements: ['mp.info.6.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'RECOVERY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    // `restore_success` se retira por el mismo motivo que `backup_success`:
    // sinónimo sin regla ni emisor de `restore_ok`, que sí los tiene (106651).
    expectedEventTypes: [
      'evidence_state',
      'restore_ok',
      'restore_missing',
      'restore_error',
    ],
    relatedRules: ['106651', '106606', '106607'],
    auditQuestion: '¿Existe evidencia de una prueba de restauración correcta dentro del periodo definido?',
    qualityRequirements: {
      requiredFields: [
        'job_id',
        'restored_path',
        'status',
        'md5',
      ],
      requiredFieldsWhenStatus: ['CUMPLE'],
      fieldPatterns: {
        md5: '^[a-fA-F0-9]{32}$',
      },
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-06',
    controlId: 'mp.info.6',
    title: 'Repositorio alternativo operativo',
    description: 'Existe evidencia de copia en ubicación alternativa cuando aplica.',
    requirements: ['mp.info.6.r2.1'],
    levels: ['ALTO'],
    category: 'OFFSITE',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON', 'SCRIPT', 'API'],
    // `offsite_missing` se retira: no tiene regla ni emisor. La ausencia de
    // copia offsite la publica hoy `score.py` como `evidence_state`
    // NO_EVALUABLE con su motivo, que es la forma honesta de decir "esto rige y
    // no lo medimos". `offsite_success` y `offsite_error` sí tienen regla
    // (106662 y 106663).
    expectedEventTypes: ['evidence_state', 'control_state', 'offsite_success', 'offsite_error'],
    relatedRules: ['106662', '106663'],
    auditQuestion: '¿Existe una copia en ubicación alternativa operativa cuando el nivel ENS lo exige?',
    qualityRequirements: {
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-07',
    controlId: 'mp.info.6',
    title: 'Logs correctamente interpretados',
    description: 'Los logs de backup se interpretan correctamente por Wazuh/ENSFácil.',
    requirements: ['mp.info.6.1', 'mp.info.6.2.b', 'mp.info.6.2.c'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'TRACEABILITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // De los siete declarados solo `backup_error` (106690) tenía regla.
    // `decoder_ok`, `backup_warning`, `backup_timeout`, `backup_disk_full` y
    // `backup_network_error` no los emite nadie y se retiran; se adopta
    // `encfp_changed`, que emite 106609 con `evidencia=EV-03,EV-07` y además
    // tiene emisor real (`px_emit_fp_changed` en el runbook).
    expectedEventTypes: ['evidence_state', 'backup_error', 'encfp_changed'],
    relatedRules: ['106690', '106602', '106609'],
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
  // `op.exp.4-security-maintenance-and-updates` (y su copia LDAP).
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
];
