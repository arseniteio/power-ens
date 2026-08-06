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
// `tests/check-coherencia.py` comprueba lo primero en cada ejecución.
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: detección de autorización y control en la misma cuenta?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.3',
    title: 'Verificación de concurrencia en tareas críticas',
    description:
      'Comprobación de que las tareas declaradas como críticas en P-04 han sido ejecutadas o aprobadas por al menos el número de personas distintas exigido. Detecta tareas críticas realizadas unilateralmente.',
    requirements: ['op.acc.3'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
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
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: cuentas con privilegios excesivos o innecesarios?',
  },
];
