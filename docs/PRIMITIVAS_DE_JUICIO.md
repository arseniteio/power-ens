# Las primitivas de juicio, y qué le toca a cada evidencia

Plan de la migración al modelo nuevo. Dice **qué primitiva le toca a cada
evidencia, qué hecho crudo tiene que emitir su agente y contra qué parámetro se
juzga**, para que la migración se pueda repartir sin que cada evidencia se
invente su camino.

La receta paso a paso de UNA evidencia sigue estando en
[`MIGRAR_UNA_EVIDENCIA.md`](MIGRAR_UNA_EVIDENCIA.md). Esto es el mapa completo.

Implementación: `dashboard/ens/core/evidence/judgment.ts`.
Pruebas: `tests/evidence-judgment.test.ts`.

> **Son 22 evidencias.** El catálogo (`core/evidence/catalog.ts`) tiene 7 de
> mp.info.6, 8 de op.acc.1 y 7 de op.acc.2. Van **tres migradas** (op.acc.1
> EV-03, EV-05 y EV-07), así que quedan **19**: 12 migrables y 7 que no.

## Por qué siete y no tres, ni veintidós

Con `NINGUNO_EN_LISTA`, `TODOS_EN_LISTA` y `UMBRAL_MAXIMO` se migran tres
evidencias de veintidós. Con una primitiva por evidencia no hay modelo: es el
evaluador por control que se desconectó el 30/07 con otro nombre.

El criterio para admitir una primitiva ha sido **que responda a una pregunta de
auditoría distinta**, no que resuelva un caso. Dos primitivas que respondan a la
misma pregunta sobran; una pregunta sin primitiva deja evidencias sin migrar.

Las siete salen de cuatro patrones que aparecen una y otra vez en los tres
controles —comparar contra una lista, contra un umbral, contra un plazo, contra
la fila de una tabla— más una distinción que no es de comparación sino **de qué
es el hecho**, y que decide si el silencio puede ser CUMPLE.

## Las siete

| Primitiva | CUMPLE si | Sin ningún hecho observado |
|---|---|---|
| `NINGUNO_EN_LISTA` | ningún hecho observado figura en la lista **prohibida** | **CUMPLE** con cobertura confirmada |
| `TODOS_EN_LISTA` | todo hecho observado figura en la lista **autorizada** | `NO_EVALUABLE` siempre |
| `NINGUNO_FUERA_DE_LISTA` | ningún **hallazgo** de un barrido queda fuera de la lista autorizada | **CUMPLE** con cobertura confirmada |
| `UMBRAL_MAXIMO` | ningún valor observado supera el del parámetro | `NO_EVALUABLE` siempre |
| `UMBRAL_MINIMO` | ningún valor observado queda por debajo | `NO_EVALUABLE` siempre |
| `ANTIGUEDAD_MAXIMA` | el hecho más reciente no es más viejo que el plazo | `NO_EVALUABLE` siempre |
| `CONFORME_A_TABLA` | cada hecho casa con **su fila**, columna a columna | `NO_EVALUABLE` siempre |

### `NINGUNO_FUERA_DE_LISTA` frente a `TODOS_EN_LISTA`

Comparan **exactamente igual**. Lo único que cambia es el conjunto vacío, y es
justo lo que las separa: **no es la comparación, es qué es el hecho.**

- Los hechos de `TODOS_EN_LISTA` **acreditan** algo que existe en la máquina: una
  cuenta activa, un acceso al repositorio de copias. No observar ninguno es **no
  haber mirado**, y un CUMPLE ahí sería el falso verde de siempre.
- Los de `NINGUNO_FUERA_DE_LISTA` son **hallazgos de un barrido**: un binario
  SUID, un recurso world-writable, una elevación de privilegio. No encontrar
  ninguno es el resultado **normal de una máquina sana**.

Cuatro evidencias de op.acc.2 son barridos. Obligarlas a un `NO_EVALUABLE`
permanente para no duplicar una comparación de tres líneas convertiría el gris en
el color de una máquina correcta, y desde el 04/08 el gris cuenta en contra.

La prueba que sostiene la distinción compara las dos primitivas con **los mismos
hechos y la misma lista**: tienen que coincidir siempre, y discrepar solo sin
hechos.

### `ANTIGUEDAD_MAXIMA` no es un `UMBRAL_MAXIMO` sobre un delta

Es la única primitiva **existencial**: a las demás les incumple un hecho, a ésta
le **cumple** uno. «La última copia no puede ser más vieja que 24 h» se satisface
con una copia reciente aunque haya cien antiguas, que es lo normal.

Y mide **contra el reloj**, no contra un número que traiga el agente ya restado.
Si el hecho fuera `horas_desde_la_copia: 2`, ese evento seguiría diciendo 2
dentro de un mes y afirmaría cumplimiento con el agente apagado: un CUMPLE falso
que no depende de ningún fallo, solo de que pase el tiempo. Con el **instante**
de la copia como hecho, la antigüedad crece sola hasta que el veredicto se cae,
que es lo que un auditor espera.

La unidad la da el **tipo del parámetro** (`duration_hours` / `duration_days`), no
una declaración aparte que pudiera discrepar de él.

### `CONFORME_A_TABLA`

La primitiva de `op.acc.2.2`: *los derechos de acceso siguen la decisión escrita
del responsable del recurso*. El hecho trae una **clave** que busca su fila y lo
observado de cada eje; la fila dice lo que se decidió.

- **La comparación de cada eje la elige el tipo de columna** que el parámetro ya
  declara: `octal` compara «no más permisivo» (un recurso *más* restrictivo que lo
  declarado no crea riesgo y no es desviación); `multiselect` comprueba
  pertenencia a la celda; el resto, igualdad literal. Ninguna evidencia declara
  *cómo* se compara: solo *qué*.
- **Celda vacía = ese eje no se declara** y no se juzga. Es el contrato escrito de
  P-08. Una fila que no declara ni uno de los ejes contrastados no acredita nada:
  `NO_EVALUABLE`.
- **Un recurso sin fila no es un incumplimiento**, es una decisión que nadie ha
  escrito. `NO_EVALUABLE` con causa `CONFIGURATION` —cuenta igual en contra desde
  el 04/08, pero la tabla de evidencias sigue distinguiendo «se midió y falló» de
  «nunca hubo contra qué medir»—.

## Lo que se consideró y NO entró

| Descartada | Por qué |
|---|---|
| `NO_MAS_PERMISIVO` como primitiva suelta | La comparación existe y está probada (es la de las columnas `octal`), pero hoy **ninguna evidencia podría declararla**: el umask de op.acc.2/EV-01 exigiría partir esa evidencia en dos, y los permisos de la clave de mp.info.6/EV-04 no tienen parámetro que declare el modo admitido. Exponerla sería una primitiva sin usuario. Cuando exista cualquiera de las dos cosas, es un cambio de quince líneas sobre código ya probado. |
| `LISTA_CUBIERTA` («todo sistema del alcance ha producido su hecho») | Los tres controles tienen un parámetro de alcance con el mismo hueco anotado —*«ninguna regla detecta un sistema del alcance que deja de enviar eventos»*—, así que la tentación es fuerte. Pero es una pregunta **entre máquinas** y las evidencias se resuelven **por agente**: aplicada así, cada máquina declararía incumplimiento por los hechos que no ha producido *otra*. El hueco es real y su sitio está en la consolidación, no en una primitiva de evidencia. |
| `SIN_REPETIDOS` (unicidad de UID, op.acc.1/EV-01) | No contrasta ningún parámetro: es una propiedad intrínseca. Una primitiva que no mira la política no pertenece a este modelo, y solo la usaría una evidencia. |
| `CONFORME_AL_SUFIJO` (op.acc.1/EV-06) | Ver la evidencia, más abajo: una sola usuaria en los tres controles. |
| Componer varios juicios en una evidencia | Es un segundo eje de diseño, no una primitiva. op.acc.2/EV-01 es la evidencia que enseña el coste; se documenta y se deja decidir. |

## El plan, evidencia a evidencia

`campo` es el `factField` del `judgment`; en `CONFORME_A_TABLA` es la clave
(`factKeyField`).

### mp.info.6 — Copias de seguridad

| EV | Primitiva | Hecho crudo que tendría que emitir el agente | Campo | Parámetro |
|---|---|---|---|---|
| EV-01 | **no migrable** | `backup_ok` (ya existe) | — | — |
| EV-02 | `ANTIGUEDAD_MAXIMA` | `backup_ok` con el **instante de fin** de la copia en ISO | `fin_copia` | P-01 + margen P-02 |
| EV-03 | `UMBRAL_MINIMO` | `retention_observed` con la antigüedad en días del snapshot **más antiguo conservado** | `dias_retenidos` | P-03 |
| EV-04 | `TODOS_EN_LISTA` | `repository_access` con el usuario o proceso que accedió al repositorio | `usuario` | P-07 |
| EV-05 | `ANTIGUEDAD_MAXIMA` | `restore_ok` con el **instante de fin** de la prueba, emitido solo si el canario coincidió | `fin_prueba` | P-05 |
| EV-06 | **no migrable hoy** | `offsite_success` con el instante de la copia externa | — | P-01 |
| EV-07 | `TODOS_EN_LISTA` | `backup_ok` / `backup_error` con la herramienta que produjo el evento | `herramienta` | P-10 |

Notas:

- **EV-02 es hoy lo que `score.py` llama EV-01**, y EV-01 en el catálogo moderno
  se titula «última copia realizada correctamente». Los dos catálogos
  (`core/evidence/catalog.ts` y `data/mp-info-6.ts`) **no dicen lo mismo** para
  EV-01 y EV-02: es la trampa del doble catálogo, y hay que resolverla antes de
  migrar ninguna de las dos o se migrará la evidencia equivocada.
- **EV-03 no tiene hoy nada que medir.** No hay regla, ni emisor, ni variable en
  el `.env`: `estado_rutas()` comprueba «¿hay algo dentro del directorio?». El
  hecho `retention_observed` hay que escribirlo de cero, y es un `stat` del
  snapshot más antiguo.
- **EV-04 tiene dos ejes y solo uno migra.** El de la lista blanca (P-07) es el
  que responde a su pregunta de auditoría. El otro —los permisos de la clave de
  cifrado— hoy compara contra una máscara `0o077` escrita en `score.py`: para
  migrarlo hace falta un parámetro que declare el modo admitido, y mientras no
  exista, mover ese juicio al motor sería meter política en código.
- **EV-07**: la comparación es literal, así que hay que alinear el vocabulario
  antes. El emisor pone hoy `tool=PBS` y P-10 no ofrece esa opción.

### op.acc.1 — Identificación

| EV | Primitiva | Hecho crudo | Campo | Parámetro |
|---|---|---|---|---|
| EV-01 | **no migrable** | `account_active` (ya existe, con `usuario` y `uid`) | — | — |
| EV-02 | **no migrable** | `account_created` / `account_modified` / `account_deleted` | — | — |
| EV-03 | `NINGUNO_EN_LISTA` — **migrada** | `account_authenticated` | `usuario` | P-04 |
| EV-04 | `UMBRAL_MAXIMO` | `account_offboarding` para **toda** cuenta con fecha de baja conocida, esté deshabilitada o no | `dias_hasta_deshabilitacion` | P-05 |
| EV-05 | `NINGUNO_EN_LISTA` — **migrada** | `account_authenticated` — **el mismo hecho de EV-03** | `usuario` | P-03 |
| EV-06 | **no migrable** | `account_privilege_use` con `usuario` y `grupo` | — | P-11, P-12 |
| EV-07 | `TODOS_EN_LISTA` con `parameterColumn: 'usuario'` — **migrada** | `account_active` (el mismo hecho de EV-01) | `usuario` | **P-07, tabla** |
| EV-08 | `UMBRAL_MINIMO` | `account_deleted` (ya lleva el campo) | `dias_retenida` | P-06 |

Notas:

- **EV-05 es la migración más barata del producto**: no hace falta ningún hecho
  nuevo. Es la misma primitiva y el mismo `account_authenticated` de EV-03,
  cambiando P-04 por P-03. Empezar por aquí.
- **EV-07 es la primera evidencia que apunta a un parámetro `table`**, y por eso
  el arreglo de `parseReferenceList` es prerrequisito suyo (ver abajo). Su hecho
  ya existe: `account_active` lleva el `usuario`.
- **EV-04 arregla un fallo de juicio al migrar.** Hoy `account_disabled` sale
  CUMPLE incondicional: una cuenta deshabilitada 500 días después de la baja, con
  plazo de 1, se publica conforme. El plazo solo se compara sobre cuentas aún
  habilitadas. Emitiendo el hecho para las dos y dejando que `UMBRAL_MAXIMO`
  compare, el fallo desaparece sin escribir lógica.
- **EV-08 sí se puede migrar**, aunque su medida venga de un registro que el
  agente mantiene entre pasadas (`deshabilitadas.tsv`). Ese registro es
  **maquinaria de observación**, no política: un vigilante con un cuaderno sigue
  siendo un vigilante. Lo que tiene que vivir en Wazuh es el plazo (P-06), y con
  `UMBRAL_MINIMO` así queda.
- **P-09 (bajas declaradas) es una deuda abierta que la migración de EV-04 no
  cierra.** Está declarado como tabla en la pantalla y el agente lo lee de un TSV
  de la máquina; el agente no lee el índice jamás. Restar dos fechas no es juzgar,
  así que el hecho puede seguir saliendo del agente, pero **la fecha de baja que
  usa no es la que ve el auditor**.

### op.acc.2 — Requisitos de acceso

| EV | Primitiva | Hecho crudo | Campo | Parámetro |
|---|---|---|---|---|
| EV-01 | `NINGUNO_FUERA_DE_LISTA` | `world_writable` (ya existe) | `ruta` | P-11 |
| EV-02 | **no migrable** | `fim_added` / `fim_modified` / `fim_deleted` | — | — |
| EV-03 | `NINGUNO_FUERA_DE_LISTA` con `parameterColumn: 'usuario'` | `privilege_escalation` (ya existe) | `usuario` | **P-09, tabla** |
| EV-04 | `CONFORME_A_TABLA` | `resource_permissions` con `recurso`, `modo`, `propietario_grupo`, `acl` | clave `recurso` | **P-08, tabla** |
| EV-05 | `NINGUNO_FUERA_DE_LISTA` con `parameterColumn: 'usuario'` | `group_membership` (ya existe) | `usuario` | **P-09, tabla** |
| EV-06 | **no migrable** | `object_access` con `usuario`, `recurso`, `acceso` | — | P-06, P-09 |
| EV-07 | `NINGUNO_FUERA_DE_LISTA` | `suid_sgid` (ya existe) | `ruta` | P-10 |

Notas:

- **EV-04 es la evidencia insignia de `CONFORME_A_TABLA`**, y migrarla cambia lo
  que se mide, no solo quién lo decide. Hoy el recolector **itera la política** y
  mide lo que ella nombra: un recurso que el cliente no escribió no se mira nunca.
  Con el hecho crudo, el agente mide **los recursos que hay** y el motor busca su
  fila; lo que no esté declarado sale `NO_EVALUABLE` y se ve.
- **EV-05 hoy no compara privilegios.** La columna 3 de `opacc2-privilegios.tsv`
  (`privilegios concedidos`) no la lee ningún `awk` del recolector: el juicio es
  «¿está el nombre en la columna 1?». `NINGUNO_FUERA_DE_LISTA` reproduce
  exactamente lo que hoy se hace, y es honesto llamarlo así. Ir más allá —comparar
  el privilegio real contra `sudo:total`— es `CONFORME_A_TABLA` sobre P-09, y
  necesita antes decidir un vocabulario de privilegios comparable.
- **EV-01 tiene tres ejes y solo migra uno.** World-writable contra P-11 es el que
  tiene política de lista. El umask (P-07) necesita comparar máscaras octales, y
  el metadato del módulo SCA no es una decisión de nadie. Una evidencia tiene un
  juicio: para migrar el umask hay que **partir EV-01**, y eso es una decisión de
  catálogo, no de motor.

## Las siete que no se pueden migrar, y por qué

Se dice aquí porque es información de planificación, no un fracaso: son las
evidencias que **el modelo nuevo no mejora**, y saberlo evita que alguien pierda
una semana intentándolo.

| Evidencia | Razón |
|---|---|
| mp.info.6 / **EV-01** | Su juicio no depende de ningún parámetro configurable: «la copia terminó correctamente» lo dice el código de salida del mandato, que es el hecho y el veredicto a la vez. Migrar no gana nada —es el paso 1 de la receta— y su dimensión temporal ya la cubre EV-02. |
| mp.info.6 / **EV-06** | No hay hecho crudo que emitir: la copia externa la produce el PBS y el runbook no la recoge. Hoy es una **constante** `NO_CUMPLE` en `score.py`. El tope es de recolección, no de primitiva: en cuanto exista `offsite_success`, `ANTIGUEDAD_MAXIMA` contra P-01 la migra. Es el tope estructural del nivel ALTO ya documentado en `CUMPLIMIENTO_TOTAL.md`. |
| op.acc.1 / **EV-01** | La unicidad del UID es una propiedad intrínseca, no un contraste con una política. P-10 decide **qué se observa**, no qué es conforme. Una primitiva `SIN_REPETIDOS` no miraría ningún parámetro y solo la usaría ella. |
| op.acc.1 / **EV-02** | No hay política de conformidad: cualquier cambio en los ficheros de identidad es un hallazgo por definición, y el agente ya emite los tres eventos con `estado=CUMPLE` fijo. **Ya es observación pura**; lo que le falta no es un juicio, es un parámetro que diga qué cambio está autorizado. |
| op.acc.1 / **EV-06** | Necesita contrastar la **forma** del identificador contra un sufijo declarado (P-12), un patrón que ninguna otra evidencia de los tres controles usa: una primitiva para una sola evidencia es el evaluador por control con otro nombre. **Salida sin primitiva nueva**: convertir P-12 en una tabla de identidades diferenciadas (`persona | cuenta ordinaria | cuenta administrativa`) y usar `CONFORME_A_TABLA`. Al hacerlo hay que arreglar además que hoy la pertenencia a grupo privilegiado se mira solo en el campo 4 de `/etc/group` y se pierde el grupo primario. |
| op.acc.2 / **EV-02** | Mismo caso que op.acc.1/EV-02: la referencia es la foto de la pasada anterior y no hay parámetro que declare qué cambio es aceptable. P-02 dice **qué se vigila**, no qué es conforme. |
| op.acc.2 / **EV-06** | Dos razones, y las dos son señales de diseño. (1) **Encadena dos tablas de política**: el perfil del usuario sale de P-09 y solo entonces se busca la fila de P-06; una primitiva que encadene dos tablas solo la usaría ella. (2) Su clave `recurso` **no casa por igualdad sino por prefijo de directorio**, ganando la ruta más larga, que no es la semántica de ninguna columna declarada. **Salida**: que P-06 se claven por `usuario` en vez de por `perfil` —o que traiga una columna `usuario`— elimina el salto y deja EV-06 en `CONFORME_A_TABLA` con la única reserva del prefijo. |

## Cómo se resolvió `parseReferenceList` con las tablas

El aviso: `parseReferenceList` devuelve **filas enteras**. No chocaba porque la
única evidencia migrada apunta a un parámetro `list`, pero la primera que apunte
a un `table` compararía `'jgomez | srv01 | ops'` contra `'jgomez'` y no casaría
jamás — un `TODOS_EN_LISTA` que declara no autorizada a toda la plantilla, o un
`NINGUNO_EN_LISTA` que da por buena a cualquiera. Cuatro de las cinco tablas del
producto tienen evidencia asignada, así que era cuestión de días.

**Una tabla se lee en dos pasos, y cada uno con su separador.**

- Las **filas** son los elementos del array —o las líneas, si el valor llegó como
  cadena de un bloque sembrado a mano—. `parseReferenceRows` **nunca parte por
  comas**: una celda `multiselect` las lleva dentro (`'lectura,escritura'` en
  P-06), y partir por comas rompería la fila en pedazos que no significan nada.
- Las **celdas** sí se parten por `|`, que es el separador de campos del producto,
  y se reparten entre las `columns` declaradas (`splitRowCells`). Una fila corta
  deja vacías las columnas que no trae, que es lo mismo que una celda en blanco.

**Y el juicio declara qué columna compara.** `judgment.parameterColumn` es
obligatoria en cuanto el parámetro declara dos o más columnas. Sin ella,
`NO_EVALUABLE` con motivo:

- comparar la fila entera es el fallo silencioso que había que evitar;
- **elegir la primera columna por defecto sería el mismo fallo aplazado**:
  acertaría en P-07 y fallaría sin avisar en la primera tabla cuya clave no fuera
  la columna 1.

Un parámetro sin `columns` —o con una sola— se sigue leyendo plano, exactamente
como hasta hoy: es la tolerancia con los valores heredados, y es por donde entra
P-04 de la única evidencia ya migrada, que no cambia de comportamiento.

Si el catálogo declara una columna y el parámetro **no declara ninguna** (bloque
sembrado antes de que existieran), tampoco se adivina la posición: `NO_EVALUABLE`
diciendo que hay que volver a sembrar el bloque con `config/inject-control.py`.

### Y una consecuencia que no es de tablas: las mayúsculas

Al proyectar columnas de listas **autorizadas** salió a la luz que la comparación
era insensible a mayúsculas en las dos direcciones. Ahora hay dos reglas, y la
diferencia decide **en qué dirección se equivoca el motor**:

- Contra una lista **prohibida**, sin distinguirlas: `'ADMIN'` cuenta como la
  cuenta prohibida `'admin'`. Equivocarse produce un NO_CUMPLE de más.
- Contra una lista **autorizada** o una celda de la tabla, distinguiéndolas: en
  Linux `'Admin'` y `'admin'` son dos cuentas distintas, y tratarlas como la misma
  autorizaría a quien nadie autorizó. Es además lo que P-07 y P-09 llevan escrito
  en su propia descripción.

## Orden sugerido de la migración

1. ~~**op.acc.1 / EV-05**~~ — **HECHA el 05/08.** Ni hecho nuevo ni primitiva
   nueva: comparte `account_authenticated` con EV-03 y solo cambia la lista.
2. ~~**op.acc.1 / EV-07**~~ — **HECHA el 05/08.** Estrenó `parameterColumn`
   sobre una tabla real y retiró de cada máquina el fichero de autorizados, que
   era el parámetro que tumbaba MEDIO y ALTO por sí solo.
3. **op.acc.2 / EV-07 y EV-01** — barridos, hechos ya existentes, estrenan
   `NINGUNO_FUERA_DE_LISTA`.
4. **op.acc.1 / EV-08 y EV-04** — umbrales, campos ya existentes.
5. **op.acc.2 / EV-04** — la primera `CONFORME_A_TABLA`. Es la que más cambia del
   lado del agente y conviene llegar con las anteriores hechas.
6. **mp.info.6** — la que más hechos nuevos exige (EV-03 entero, EV-04 entero) y
   la que arrastra la divergencia del doble catálogo entre EV-01 y EV-02.

### Lo que enseñaron las dos primeras

**Ninguna necesitó un hecho nuevo**, y eso no fue suerte: el agente ya observa
casi todo lo que hace falta, y lo que sobraba era el veredicto. Antes de diseñar
un hecho, mira si otra evidencia ya lo emite y etiquétalo con las dos
(`evidence_id=EV-03,EV-05`). Ver el paso **4 bis** de
[`MIGRAR_UNA_EVIDENCIA.md`](MIGRAR_UNA_EVIDENCIA.md).

**Y apareció una regla que no estaba escrita**: los nombres de evento viejos
solo se readmiten cuando entre todos cubren la MISMA población que el hecho
nuevo. EV-05 sí (los infractores y el resto); EV-07 no, porque
`unauthorized_user` solo se emitía para las cuentas que fallaban y
`TODOS_EN_LISTA` sobre esa muestra habría dado CUMPLE con cuarenta cuentas sin
mirar. Es el falso verde que esta tanda estuvo más cerca de producir.
