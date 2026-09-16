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
    expectedEventTypes: ['evidence_state', 'external_auth_success', 'external_auth_failure'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: registro de accesos con éxito y fallidos?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.5',
    title: 'Superación del límite de intentos sin bloqueo efectivo',
    description:
      'Detección de cuentas externas que acumulan más de P-03 intentos fallidos consecutivos sin que se produzca el bloqueo de la cuenta. Evidencia que el límite exigido por op.acc.5.8 no está operativo, aunque esté declarado en la configuración.',
    requirements: ['op.acc.5.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'lockout_not_applied'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: superación del límite de intentos sin bloqueo efectivo?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.5',
    title: 'Ataques de fuerza bruta y credential stuffing contra el servicio externo',
    description:
      'Identificación de patrones de ataque sobre los servicios de P-02: múltiples fallos desde una IP contra varias cuentas, o contra una cuenta desde múltiples IP. Es el riesgo que op.acc.5.8 pretende mitigar.',
    requirements: ['op.acc.5.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'brute_force_pattern', 'credential_stuffing_pattern'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ataques de fuerza bruta y credential stuffing contra el servicio externo?',
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
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: antigüedad de las credenciales frente a la periodicidad exigida?',
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
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: reacción ante compromiso o fin de relación?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.5',
    title: 'Verificación de mensajes de error no informativos',
    description:
      'Detección de respuestas del servicio que revelan información sobre el sistema o la cuenta en los rechazos de autenticación: mensajes que distinguen «usuario inexistente» de «contraseña incorrecta», trazas de error, versiones del software. Vulnera op.acc.5.7.',
    requirements: ['op.acc.5.7'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_error_verbose'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: verificación de mensajes de error no informativos?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.5',
    title: 'Autenticación con segundo factor efectivamente aplicado (R2, R3, R4)',
    description:
      'Verificación de que las autenticaciones registradas incluyen efectivamente el segundo factor exigido por el refuerzo elegido: OTP en R2, PIN o biometría sobre el certificado en R3 y R4. Detecta autenticaciones completadas sin el factor adicional.',
    requirements: ['op.acc.5.r2.1', 'op.acc.5.r3.2', 'op.acc.5.r4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'second_factor_missing'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: autenticación con segundo factor efectivamente aplicado (r2, r3, r4)?',
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.5',
    title: 'Validación de certificados y estado de revocación (R3, R4)',
    description:
      'Comprobación de que los certificados presentados provienen de las autoridades admitidas en P-07 y de que se ejecuta la consulta de revocación (OCSP o CRL) en cada autenticación. Detecta aceptación de certificados de AC no admitidas o sin validar revocación.',
    requirements: ['op.acc.5.r3.1', 'op.acc.5.r3.3', 'op.acc.5.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'certificate_validation'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: validación de certificados y estado de revocación (r3, r4)?',
  },
  {
    id: 'EV-09',
    controlId: 'op.acc.5',
    title: 'Continuidad e integridad del registro de accesos',
    description:
      'Verificación de que el registro exigido por R5 no presenta lagunas: períodos sin eventos en servicios que deberían tener actividad, o pérdida de eventos por fallo del agente o del colector. Una laguna en el registro compromete la acreditación de R5.',
    requirements: ['op.acc.5.r5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'access_log_gap'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: continuidad e integridad del registro de accesos?',
  },
  {
    id: 'EV-01',
    controlId: 'op.acc.6',
    title: 'Registro de accesos con éxito y fallidos',
    description:
      'Ingesta de todos los eventos de autenticación del personal de la organización desde el directorio corporativo declarado en P-03. Es la evidencia central del Refuerzo R5 (obligatorio desde MEDIO) y la base de casi todas las demás detecciones del control.',
    requirements: ['op.acc.6.r5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'authentication_success', 'authentication_failure'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: registro de accesos con éxito y fallidos?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.6',
    title: 'Verificación del doble factor en accesos desde zona no controlada',
    description:
      'Clasificación de cada autenticación según la IP de origen contra los rangos de zona controlada (P-02), y verificación de que las procedentes de zona no controlada llevan segundo factor. Es la evidencia del Refuerzo R8, obligatorio desde nivel BAJO.',
    requirements: ['op.acc.6.r1.1', 'op.acc.6.r8.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'mfa_used'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: verificación del doble factor en accesos desde zona no controlada?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.6',
    title: 'Límite de intentos y bloqueo efectivo de cuenta',
    description:
      'Detección de cuentas que acumulan más de P-05 intentos fallidos sin que se registre el bloqueo, evidenciando que el límite exigido por op.acc.6.8 está declarado pero no es operativo.',
    requirements: ['op.acc.6.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_locked'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: límite de intentos y bloqueo efectivo de cuenta?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.6',
    title: 'Ataques de fuerza bruta, password spraying y Kerberoasting',
    description:
      'Identificación de patrones de ataque contra las credenciales corporativas: fallos masivos contra una cuenta, un mismo intento contra muchas cuentas (password spraying), o solicitudes anómalas de tickets de servicio Kerberos. Es el riesgo que op.acc.6.8 pretende mitigar.',
    requirements: ['op.acc.6.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'authentication_attack_pattern'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ataques de fuerza bruta, password spraying y kerberoasting?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.6',
    title: 'Antigüedad de credenciales y política de cambio',
    description:
      'Cálculo de la antigüedad de la credencial de cada usuario activo frente a la periodicidad P-04, y verificación de que la política del dominio impone efectivamente ese máximo.',
    requirements: ['op.acc.6.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_age_checked'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: antigüedad de credenciales y política de cambio?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.6',
    title: 'Reacción ante compromiso y baja de personal',
    description:
      'Medición del intervalo entre el evento de notificación de compromiso de credencial, o de baja del usuario, y la inhabilitación efectiva de su cuenta. Contraste con el plazo máximo P-06.',
    requirements: ['op.acc.6.5', 'op.acc.6.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_disabled', 'compromise_reported', 'offboarding_reported'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: reacción ante compromiso y baja de personal?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.6',
    title: 'Acceso remoto: canal, cifrado y autorización',
    description:
      'Registro de todas las conexiones remotas del personal con identificación del canal empleado, si el tráfico va cifrado, la IP de origen y el usuario. Contraste contra los canales autorizados de P-07. Cubre los apartados a), b) y d) de op.acc.6.r9.2.',
    requirements: ['op.acc.6.r9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'remote_access_connection'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: acceso remoto: canal, cifrado y autorización?',
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.6',
    title: 'Canales de acceso remoto habilitados sin uso constante',
    description:
      'Detección de canales de acceso remoto declarados en P-07 como de uso no constante que permanecen permanentemente habilitados. El apartado c) de op.acc.6.r9.2 exige que estén inhabilitados y se habiliten únicamente cuando sea necesario.',
    requirements: ['op.acc.6.r9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'remote_channel_listening'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: canales de acceso remoto habilitados sin uso constante?',
  },
  {
    id: 'EV-09',
    controlId: 'op.acc.6',
    title: 'Renovación de autenticación en puntos críticos (R6)',
    description:
      'Verificación de que las operaciones declaradas en P-08 van precedidas de un evento de reautenticación singular y no se amparan únicamente en la sesión ya establecida. Obligatorio en nivel ALTO.',
    requirements: ['op.acc.6.r6.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'critical_operation_executed', 'reauthentication_performed'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: renovación de autenticación en puntos críticos (r6)?',
  },
  {
    id: 'EV-10',
    controlId: 'op.acc.6',
    title: 'Credenciales activas sin utilización prolongada (R7)',
    description:
      'Identificación de cuentas que permanecen habilitadas pese a no haberse utilizado durante más días de los definidos en P-09. Obligatorio en nivel ALTO y, en la práctica, una de las comprobaciones que más hallazgos produce en cualquier organización.',
    requirements: ['op.acc.6.r7.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_inactivity_checked'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: credenciales activas sin utilización prolongada (r7)?',
  },
  {
    id: 'EV-11',
    controlId: 'op.acc.6',
    title: 'Complejidad y robustez de las contraseñas (R1)',
    description:
      'Verificación de que la política de contraseñas configurada en el dominio o en los sistemas cumple los requisitos de complejidad mínima y robustez frente a adivinación declarados en P-10, conforme a las guías CCN-STIC que el propio ENS señala como referencia.',
    requirements: ['op.acc.6.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'password_policy_checked'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: complejidad y robustez de las contraseñas (r1)?',
  },
  {
    id: 'EV-12',
    controlId: 'op.acc.6',
    title: 'Información revelada en el proceso de autenticación',
    description:
      'Detección de respuestas del sistema que revelan información en los rechazos de autenticación: mensajes que distinguen usuario inexistente de credencial incorrecta, o banners que exponen tecnología y versión. Vulnera op.acc.6.7.',
    requirements: ['op.acc.6.7'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_rejection_message'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: información revelada en el proceso de autenticación?',
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
    relatedRules: ['110201'],
    judgment: {
      // «Inventario ACTUALIZADO» dicho con una primitiva: la foto más reciente
      // del activo no puede ser más vieja que P-07. Se mide contra el reloj y
      // sobre el instante de emisión del hecho (`ts`), así que un agente que
      // deja de reportar ve caer esta evidencia sola, sin que nadie emita nada.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-07',
      factEventTypes: ['asset_system'],
      factField: 'ts',
    },
    auditQuestion:
      '¿Consta una foto del hardware y del sistema operativo de este activo tomada dentro del plazo declarado en P-07?',
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
    relatedRules: ['110202'],
    judgment: {
      // Misma pregunta que EV-01 sobre otra fuente: si el gestor de paquetes
      // deja de poder leerse, el resumen deja de emitirse y esta evidencia
      // envejece aunque la foto del hardware siga al día.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-07',
      factEventTypes: ['software_inventory'],
      factField: 'ts',
    },
    auditQuestion:
      '¿Consta un inventario del software instalado en este activo tomado dentro del plazo declarado en P-07?',
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
    relatedRules: ['110203'],
    judgment: {
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-07',
      factEventTypes: ['network_inventory'],
      factField: 'ts',
    },
    auditQuestion:
      '¿Consta un inventario de las interfaces y los servicios en escucha de este activo tomado dentro del plazo declarado en P-07?',
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
    relatedRules: ['110204'],
    judgment: {
      // Se mide el keepalive que el agente registró con el manager, no el
      // instante del hecho: un agente desconectado que sigue escribiendo su
      // estado no puede pasar por conectado. Un agente que nunca conectó no
      // trae keepalive y la evidencia queda NO_EVALUABLE, nunca en verde.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-07',
      factEventTypes: ['agent_status'],
      factField: 'ultimo_keepalive',
    },
    auditQuestion:
      '¿El agente de este activo ha mantenido contacto con el manager dentro del plazo declarado en P-07?',
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state', 'standard_account_authenticated'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state', 'vm_host_uncovered'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state', 'baseline_trend_degraded'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state', 'production_before_baseline'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: conformidad previa a la entrada en operación?',
  },
  {
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
      '¿Se acredita: mantenimiento en el tiempo de la línea base?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.3',
    title: 'Ediciones de la configuración de seguridad y su autor',
    description:
      'Detección de toda modificación en los ficheros y rutas de P-04, capturando qué usuario realizó el cambio, con qué proceso y en qué momento. Es la evidencia directa de op.exp.3.6, que exige que solo edite la configuración personal debidamente autorizado.',
    requirements: ['op.exp.3.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'config_file_modified', 'config_file_modified_unauthorized'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ediciones de la configuración de seguridad y su autor?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.3',
    title: 'Elementos no autorizados introducidos en el sistema',
    description:
      'Comparación periódica del inventario hardware/software de cada activo contra la línea base autorizada P-01. Detecta software instalado, hardware conectado o servicios añadidos que no estaban previstos. Es la verificación que exige op.exp.3.r1.2.',
    requirements: ['op.exp.3.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'baseline_deviation_detected', 'baseline_verification_performed'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: elementos no autorizados introducidos en el sistema?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.3',
    title: 'Servicios en ejecución fuera de la lista autorizada',
    description:
      'Contraste continuo entre los servicios y procesos detectados en cada activo y la lista de servicios autorizados P-02. Cubre op.exp.3.r1.3 y, por remisión a op.exp.2, también op.exp.3.1 (mantenimiento de la funcionalidad mínima).',
    requirements: ['op.exp.3.1', 'op.exp.3.r1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'unauthorized_service_running'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: servicios en ejecución fuera de la lista autorizada?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.3',
    title: 'Cambios de configuración sin autorización previa',
    description:
      'Correlación entre los cambios de configuración detectados por FIM y su correspondiente autorización en el sistema de gestión de cambios (P-06). Un cambio sin ticket o solicitud asociada incumple op.exp.3.3, que exige que las nuevas necesidades estén «previamente autorizadas».',
    requirements: ['op.exp.3.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'change_authorization_missing'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: cambios de configuración sin autorización previa?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.3',
    title: 'Reacción de la configuración ante vulnerabilidades notificadas',
    description:
      'Seguimiento de las vulnerabilidades detectadas en los activos y de si la configuración se ha ajustado para mitigarlas o si se ha aplicado la actualización correspondiente. op.exp.3.4 exige que el sistema «reaccione a vulnerabilidades notificadas», con remisión a op.exp.4.',
    requirements: ['op.exp.3.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'vulnerability_remediated', 'vulnerability_unremediated'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: reacción de la configuración ante vulnerabilidades notificadas?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.3',
    title: 'Reacción de la configuración ante incidentes',
    description:
      'Verificación de que, tras un incidente de seguridad registrado, se produjeron los cambios de configuración correspondientes para evitar su repetición. op.exp.3.5 exige que el sistema «reaccione a incidentes», con remisión a op.exp.7.',
    requirements: ['op.exp.3.5'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'incident_config_reaction', 'incident_without_reaction'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: reacción de la configuración ante incidentes?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.3',
    title: 'Concentración de la administración de la configuración (R2)',
    description:
      'Identificación de todas las cuentas que han editado efectivamente la configuración de seguridad en el período. En categoría ALTA, R2 exige que la responsabilidad recaiga en «un número muy limitado» de administradores: esta evidencia mide cuántos son en la práctica, no cuántos están autorizados.',
    requirements: ['op.exp.3.r2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: concentración de la administración de la configuración (r2)?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.3',
    title: 'Existencia y frescura de las copias de configuración (R3)',
    description:
      'Verificación de que se realizan copias de seguridad de la configuración del sistema con la periodicidad declarada en P-07 y de que están disponibles para una eventual reconstrucción. R3 es obligatorio en categoría ALTA.',
    requirements: ['op.exp.3.r3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'config_backup_created', 'config_backup_stale'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: existencia y frescura de las copias de configuración (r3)?',
  },
  {
    id: 'EV-10',
    controlId: 'op.exp.3',
    title: 'Regresiones del estado de seguridad de la configuración',
    description:
      'Identificación específica de checks que pasaron de conforme a no conforme entre dos evaluaciones sucesivas. Es el indicador más directo de que la gestión continua de la configuración está fallando, y cubre de facto el Refuerzo R5 aunque no sea exigible.',
    requirements: ['op.exp.3.1', 'op.exp.3.2', 'op.exp.3.r5.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'sca_regression_detected'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: regresiones del estado de seguridad de la configuración?',
  },
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: inventario continuo de vulnerabilidades por activo?',
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
    expectedEventTypes: ['evidence_state', 'vulnerability_detected', 'vulnerability_resolved'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: tiempo de remediación frente a los plazos del procedimiento?',
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
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'package_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: estado de parcheado del parque?',
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
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'package_changed'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: instalaciones y actualizaciones por personal no autorizado?',
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
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: software fuera de soporte del fabricante?',
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
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: cobertura del seguimiento de anuncios de defectos?',
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
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: actualizaciones aplicadas fuera de ventana de mantenimiento?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.4',
    title: 'Trazabilidad del paso por preproducción (R1)',
    description:
      'Verificación de que cada versión desplegada en producción estuvo previamente instalada en el entorno de preproducción emparejado en P-06. Es la evidencia técnica del Refuerzo R1, obligatorio desde categoría MEDIA.',
    requirements: ['op.exp.4.r1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'preprod_deployment'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: trazabilidad del paso por preproducción (r1)?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.4',
    title: 'Existencia de punto de reversión previo (R2)',
    description:
      'Verificación de que antes de cada aplicación de parches o cambios de configuración se generó el mecanismo de reversión declarado en P-07: snapshot, backup o imagen. R2 es obligatorio en categoría ALTA.',
    requirements: ['op.exp.4.r2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'reversion_point_created'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: existencia de punto de reversión previo (r2)?',
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: evolución de la deuda de vulnerabilidades?',
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
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'firmware_version'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: versiones de firmware de dispositivos hardware (r3)?',
  },
];
