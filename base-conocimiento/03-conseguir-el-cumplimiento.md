# 03 · Conseguir el cumplimiento

Qué tiene que ser cierto para que **cada evidencia de cada uno de los cuatro
controles `op.acc.*` conforme**, y qué hacer cuando no conforma.

Organizado por control y, dentro, por evidencia. Cada una dice: qué mira
exactamente, qué tiene que ser cierto en la máquina, qué parámetro de la
pantalla de Configuración la juzga —si lo hay—, qué sale si falta y por qué eso
es lo correcto, y en qué se diferencia el despliegue LDAP del de Linux.

Al final, un apartado honesto de **qué no se puede llevar al 100 % y por qué**,
separando artefacto del entorno de prueba, operación estándar pendiente y límite
del producto.

Estado de referencia (medido el 12/08/2026, nivel ENS MEDIO, ventana 30 días,
manager `wazuh4`):

| Máquina | op.acc.1 | op.acc.2 | op.acc.3 | op.acc.4 |
|---|---|---|---|---|
| `wazuh-real` · agente 024 · Ubuntu 24.04 | 75 % | **100 %** | 50 % | 20 % |
| `zimbraHldap` · agente 028 · Zimbra/Ubuntu 22.04 | 75 % | 0 % | **100 %** | 20 % |

---

## 0. Las siete reglas que gobiernan todos los veredictos

Sin esto, la mitad de lo que sigue parece arbitrario.

**1 · El cumplimiento se alcanza por dos vías y hay que recorrer las dos.** Que
el sistema cumpla de verdad, y que ENSFácil pueda medirlo. Saltarse la primera
es hacer trampa y además no funciona: la mayoría de las evidencias miran la
máquina, no el fichero de configuración. Saltarse la segunda deja una máquina
que cumple y un panel en gris.

**2 · Un requisito cumple solo si TODAS sus evidencias conforman.** El
porcentaje es `requisitos que cumplen ÷ requisitos aplicables`; las evidencias no
puntúan por su cuenta. Por eso un control puede tener tres evidencias en verde y
marcar 0 % — es literalmente lo que le pasa hoy a `op.acc.2` del LDAP. **Antes de
invertir esfuerzo en una evidencia, mira a cuántos requisitos afecta.** Las
tablas de peso están al principio de cada control.

**3 · Cuatro estados, y solo uno es un hueco.**

| Estado | Qué significa | Qué hacer |
|---|---|---|
| `CUMPLE` | se midió y conforma | nada |
| `NO_CUMPLE` | se midió y hay no conformidad demostrada | corregir la máquina |
| `NO_EVALUABLE` | rige y no se pudo medir | cerrar el hueco (esto es lo que hace este documento) |
| `NO_APLICA` | no rige en este nivel · **única salida del denominador** | nada |

Desde el 04/08/2026, **lo no demostrado NO CUMPLE a nivel de REQUISITO**. La
evidencia conserva su `NO_EVALUABLE` con su causa —`CATALOG`, `CONFIGURATION`,
`COLLECTION` o `EVIDENCE`—, que es la medida honesta de algo que no se pudo
mirar; el requisito que depende de ella se publica `NO_CUMPLE`. Gris en la tabla
de evidencias, rojo en el score.

`NO_CUMPLE` y `NO_EVALUABLE` restan lo mismo y **se arreglan al revés**:

| | Qué pasó | Dónde se arregla |
|---|---|---|
| `NO_CUMPLE` | el motor miró y no conforma | la máquina auditada |
| `NO_EVALUABLE` + `COLLECTION` | no se pudo leer la fuente | el despliegue de Wazuh |
| `NO_EVALUABLE` + `CONFIGURATION` | falta una decisión escrita | declararla |
| `NO_EVALUABLE` + `EVIDENCE` | el dato llegó y no permite juzgar | el recolector |

**4 · Quién juzga cada evidencia decide DÓNDE se configura.** Hay dos modelos
conviviendo, y equivocarse de sitio es el error más caro del producto.

| Control | Modelo | Quién decide el veredicto | Dónde vive la política |
|---|---|---|---|
| `op.acc.1` | mixto | **el motor** en EV-03, EV-05 y EV-07 · el agente en las otras cinco | pantalla (P-04, P-03, P-07) · `/etc/ensfacil/opacc1.env` y sus ficheros |
| `op.acc.2` | clásico entero | **el agente**, siempre | `/etc/ensfacil/opacc2.env` + 4 ficheros locales |
| `op.acc.3` | policy propia | **el motor**, con evaluador dedicado | pantalla (P-02, P-03, P-04, P-05) |
| `op.acc.4` | modelo nuevo entero | **el motor**, siempre | pantalla (P-01, P-02, P-03, P-05, P-07) |

Verificado en `dashboard/ens/core/evidence/catalog.ts`: las tres evidencias de
`op.acc.1` y **las ocho** de `op.acc.4` declaran `judgment`; ninguna de
`op.acc.2` ni de `op.acc.3` lo declara.

> **El agente NO lee la pantalla de Configuración. Nunca.** El agente decide
> leyendo `/etc/ensfacil/*` en su máquina; el motor lee el índice
> `wazuh-ens-configuration`. Rellenar un parámetro de la pantalla de `op.acc.2`
> no cambia ni un color de `op.acc.2`.

**5 · El latido es lo que permite que un silencio valga como cumplimiento.**
Cada pasada cierra con un `collector_run`:

| Campo | Qué dice |
|---|---|
| `resultado` | el recolector escribe `completada`, o `sin_evidencias` si ni una función llegó al final. **Para el motor solo vale `completada`**: `COLLECTOR_RUN_SUCCESS_VALUES` de `core/evidence/judgment.ts` tiene un único elemento, así que con `sin_evidencias` —o con cualquier otro valor— **ninguna** evidencia convierte su silencio en `CUMPLE` |
| `evidencias_ok` | las que llegaron al final, **incluidas las que degradaron** |
| `evidencias_cubiertas` | las que además **pudieron mirar** su fuente · es la lista blanca del motor |

Una evidencia que degrada sale en `ok` y **no** en `cubiertas`: meterla ahí
convertiría su propio `NO_EVALUABLE` en cumplimiento.

**6 · La ventana de evaluación es de 30 días (`now-30d`).** Arreglar la máquina
**no limpia el pasado**: un privilegio retirado hoy sigue contando mientras su
último evento esté dentro de la ventana. Dos consecuencias:

- Al declarar política hay que mirar **la ventana entera**, no la última pasada
  del recolector. Declarar contra lo que emite hoy deja fuera valores que el
  motor sigue viendo, y la evidencia no se mueve. Ese error costó dos rondas.
- **No se declara autorizado lo que se acaba de retirar** para que el número
  suba hoy. El hallazgo es cierto para el periodo medido.

**7 · Hay dos clases de «parámetro inválido», y solo una tumba la pantalla.**
Confundirlas manda a buscar donde no hay nada. Verificado leyendo
`configuration/services/configuration-structure-validator.ts` y
`configuration/services/parameter-value-validator.ts`.

| Qué está mal | Quién lo detecta | Consecuencia |
|---|---|---|
| el **documento** no tiene la forma esperada: un `value` o `defaultValue` que no sea `undefined \| string \| number \| boolean \| string[]` (un `null`, un objeto), una columna sin `required` **booleano**, un `type` de columna que no existe | `configuration-structure-validator` · **lanza en la hidratación** | *«No se pudo cargar el entorno ENS»*. **Toda** la pantalla, todos los controles |
| el **contenido de una celda** no vale para su columna: espacios o comas en una `identifier` (valida contra `/^[^\s|,]+$/`), un modo no octal en una `octal`, una fila con **más** campos que columnas declaradas, o una celda vacía en una columna obligatoria | `parameter-value-validator` (`validarTabla`) | **el parámetro entero queda inválido** y su control cae a «configuración incompleta». La pantalla carga |

`isParameterValue` acepta `undefined | string | number | boolean | string[]`;
`null` **no**. Un parámetro nunca configurado **no tiene la clave `value`** —
comprobado el 12/08/2026 contra el índice real: P-09 de `op.acc.1` y P-09 de
`op.acc.2` no la traen y el entorno carga—. El incidente de producción del
06/08/2026 fue del primer tipo: columnas sin `required` booleano, y el mensaje
que lo resolvía —`controls[3].parameters[0].columns[1].required`— no llegaba a
pintarse. Copia previa y validación **antes** de guardar — el comando está en
§1.4.

---

## 1. La política, antes de tocar ninguna evidencia

### 1.1 Lo que se declara en la pantalla

Datos leídos de `Wazuh-ENS/config/op-acc-{1,2,3,4}-control-block.json`, que es
la semilla que `config/inject-control.py <control> --apply` siembra en el
índice. **La tarjeta de Configuración no aparece hasta sembrar el bloque**, y
sin ella P-04 de `op.acc.1` no se puede rellenar y EV-03 se queda gris para
siempre.

> **«Obligatorio» y «lo mira una primitiva» son dos cosas distintas, y la
> primera es la que tumba el control.** Un parámetro `required` del bloque que
> esté **vacío** —aunque ninguna evidencia lo lea— pone
> `hasMissingRequiredParameters` a cierto, y entonces
> `requirement-evaluator.ts` devuelve `NO_EVALUABLE` para **todos** los
> requisitos del control que no resuelva un evaluador de policy; `applyAuditVerdict`
> los publica `NO_CUMPLE`. Es decir: **el control entero a 0 %**, más una tarjeta
> «Configuración incompleta» que los nombra. Verificado en
> `configuration/services/validation-engine.ts` (`requiredForLevel` →
> `missingRequired`) y en `core/evaluation/evaluation-engine.ts` líneas 98-146.
> Obligatorios **por nivel activo**, leídos de los bloques:
>
> | Control | Obligatorios | No obligatorios |
> |---|---|---|
> | `op.acc.1` | P-01…P-06 · **P-07 solo en MEDIO/ALTO** | P-08…P-12, P-ATT |
> | `op.acc.2` | P-01, P-02, P-03, P-04, P-07, P-08, P-10 | P-05, P-06, P-09 (solo ALTO), P-11, P-12 |
> | `op.acc.3` | P-01, P-02, P-03, P-04, P-06 | P-05 (solo ALTO), P-ATT |
> | `op.acc.4` | **los siete** (P-01…P-07) | — |
>
> `op.acc.3` es la excepción parcial: sus cuatro requisitos los decide su
> evaluador, así que un P-01 o un P-06 vacío deja la tarjeta de configuración
> incompleta pero **no** cambia el veredicto. En los otros tres controles sí.

#### op.acc.1 · niveles BAJO, MEDIO, ALTO

| Param | Nombre | Tipo | Lo juzga | Sin él |
|---|---|---|---|---|
| **P-03** | `cuentas_servicio_definidas` | list | **EV-05** (`NINGUNO_EN_LISTA`) | `op.acc.1.2` y `op.acc.1.3` no cumplen |
| **P-04** | `cuentas_genericas_prohibidas` | list | **EV-03** (`NINGUNO_EN_LISTA`) | `op.acc.1.1` y `op.acc.1.3` no cumplen |
| **P-07** | `lista_usuarios_autorizados` | table `Usuario(identifier)` · `Sistema` · `Rol` | **EV-07** (`TODOS_EN_LISTA`, columna `usuario`) | `op.acc.1.r1.3` no cumple en MEDIO/ALTO |
| P-05 | `plazo_max_deshabilitar_dias` | duration_days | — (gemelo en el `.env`) | EV-04 usa `OPACC1_PLAZO_DESHABILITAR_DIAS` |
| P-06 | `periodo_retencion_cuentas_dias` | duration_days | — (gemelo en el `.env`) | EV-08 usa `OPACC1_RETENCION_DIAS` |
| P-01, P-02, P-10, P-11, P-12 | fuente de identidad, sistemas, uid mínimo, grupos privilegiados, sufijo admin | — | — | ajustes de observación · gemelos en el `.env` |
| P-08 | `integracion_rrhh` | boolean | — | **documental: ningún script lo lee** |
| P-09 | `bajas_declaradas` | table | — | **documental: ningún script lo lee.** Lo que EV-04 consulta es `bajas.tsv` en la máquina |
| **P-ATT** | `atestaciones_documentales` | table `Requisito` · `Documento` · `Enlace(s)` · `Fecha` · `Declarado por` | `op.acc.1.5` y `op.acc.1.r1.1` | los dos cuentan como no conformes → techo 80 % / 75 % |

#### op.acc.2 · niveles BAJO, MEDIO, ALTO

> **Ninguna evidencia de `op.acc.2` está migrada al motor.** Estos doce
> parámetros sirven para el informe y para que el control conste como
> configurado. **La medida se decide en la máquina.**

| Param | Nombre | Su gemelo en la máquina (lo que SÍ decide) |
|---|---|---|
| P-01 | `sistemas_en_scope` | `OPACC2_SISTEMAS` · **no lo lee nadie** |
| P-02 | `rutas_criticas_so` | `OPACC2_RUTAS_CRITICAS` |
| P-03 | `permisos_world_writable_permitidos` (boolean) | `OPACC2_WORLD_WRITABLE_PERMITIDOS` |
| P-04 | `politica_acceso_so_referencia` | `OPACC2_POLITICA_REF` |
| P-05 | `modelo_privilegios` | `OPACC2_MODELO_PRIVILEGIOS` |
| P-06 | `tipos_acceso_permitidos_por_perfil` | `/etc/ensfacil/opacc2-accesos.tsv` |
| P-07 | `umask_minimo` | `OPACC2_UMASK_MINIMO` |
| P-08 | `acl_declarada` | `/etc/ensfacil/opacc2-acl.tsv` |
| P-09 | `privilegios_declarados` | `/etc/ensfacil/opacc2-privilegios.tsv` |
| P-10 | `suid_autorizados` | `/etc/ensfacil/opacc2-suid.allow` |
| P-11 | `world_writable_excepciones` | `OPACC2_WORLD_WRITABLE_EXCEPCIONES` |
| P-12 | `grupos_privilegiados` | `OPACC2_GRUPOS_PRIVILEGIADOS` |

> **La numeración del recolector y la de la pantalla no coinciden.** Cuando falta
> `opacc2-acl.tsv`, el motivo dice `P-04/P-06 sin fichero de politica de acceso`.
> En la pantalla esa tabla es **P-08**. No busques P-04: P-04 es solo la
> referencia documental.
>
> `op.acc.2` **no tiene `P-ATT`**. Lo que no se pueda medir aquí no se puede
> dejar acreditado desde la pantalla.

#### op.acc.3 · niveles MEDIO y ALTO (en BAJO el Anexo II lo declara `n.a.`)

| Param | Nombre | Tipo | ¿Lo lee el evaluador? |
|---|---|---|---|
| **P-02** | `pares_funciones_incompatibles` | list `funcion \| funcion` | **sí** |
| **P-03** | `acciones_por_funcion` | table `Función` · `Indicadores` | **sí** |
| **P-04** | `tareas_criticas_doble_persona` | list `tarea \| nº personas` | **sí** |
| P-05 | `cuentas_auditoria` | list `cuenta \| ámbito` | **sí** (solo la 1.ª celda) |
| P-01 | `matriz_funciones_persona` | table | **no** · soporte documental · **obligatorio** |
| P-06 | `ventana_correlacion_dias` | duration_days | **no** · la ventana real la fija el motor · **obligatorio** |
| P-ATT | `atestaciones_documentales` | table | no · `r2.1` y `r3.1` salen `NO_APLICA` en todos los niveles (`levels: []`), así que hoy no acredita nada aquí |

Verificado en `core/policy-runtime/policies/op-acc-3.policy.ts`: las únicas
llamadas a `getParameter` son a P-03, P-02, P-05 y P-04. P-01 y P-06 solo
aparecen como `parameterIds` de la traza. **Rellénalos igual**: los dos son
`required` en el bloque, y un obligatorio vacío deja el control marcado como
«configuración incompleta» (aquí no cambia el veredicto porque lo decide el
evaluador, pero sale en la tarjeta y en el informe).

Cómo lee el motor esas filas, que es donde se pierde la gente:

- Una fila se parte por `|`, se recortan espacios y se descartan celdas vacías.
- Los nombres de función se comparan **en minúsculas pero con los acentos tal
  cual**: `Auditoría` en P-03 y `auditoria` en P-02 **no casan**.
- El indicador de P-03 casa por **subcadena** contra la concatenación de `accion`
  y `ruta` del hecho.
- `auditoria | *` es el comodín: esa función no puede coexistir con **ninguna**
  otra. Es lo que exige `op.acc.3.r1.2`, que es taxativo.
- Una fila de P-04 con menos de 2 personas, o con un número que no lo es, **se
  ignora en silencio**.

Punto de partida para P-03 y P-02 (Linux):

```
desarrollo    | git | /srv/repos
operacion     | systemctl | /etc/init.d
configuracion | visudo | /etc/sudoers
mantenimiento | apt | dnf | yum
auditoria     | /var/log/audit | ausearch
```

```
desarrollo | operacion
autorizacion | control
configuracion | mantenimiento
auditoria | *
```

Para escribirlo mirando lo que la máquina ya emite:

```bash
jq -r 'select(.event=="account_action")|.accion' \
  /var/log/ensfacil/op_acc_3.json | sort | uniq -c | sort -rn | head -30
```

#### op.acc.4 · niveles BAJO, MEDIO, ALTO · sin refuerzos

Las ocho evidencias las juzga el motor. **Si el parámetro está vacío, la
evidencia no se puede juzgar** por muchos hechos que emita la máquina; y
**cambiar el parámetro cambia el color al instante**, sin volver a ejecutar nada.

| Param | Nombre | Tipo | Evidencias que lo usan | Primitiva |
|---|---|---|---|---|
| **P-01** | `matriz_privilegios_autorizados` | table `Rol(identifier)` · `Recurso` · `Acceso` | EV-01, EV-02, EV-03, EV-08 | `NINGUNO_FUERA_DE_LISTA` (col. `recurso`) · `CONFORME_A_TABLA` · `TODOS_EN_LISTA` (col. `rol`) ×2 |
| **P-02** | `personal_con_capacidad_autorizar` | table `Cuenta(identifier)` · `Ámbito` | EV-04 | `NINGUNO_FUERA_DE_LISTA` (col. `cuenta`) |
| **P-03** | `periodicidad_revision_permisos_dias` | duration_days | EV-05 | `ANTIGUEDAD_MAXIMA` |
| **P-05** | `usuarios_autorizados_acceso_remoto` | list | EV-06 | `NINGUNO_FUERA_DE_LISTA` |
| **P-07** | `recursos_sensibles_necesidad_conocer` | table `Recurso(path)` · `Perfiles(multiselect)` | EV-07 | `CONFORME_A_TABLA` |
| P-04 | `canales_acceso_remoto_permitidos` | list | — | ninguna primitiva lo mira hoy · **pero es obligatorio: vacío tumba el control a 0 %** |
| P-06 | `grupos_privilegiados` | list | — | ninguna primitiva lo mira hoy · **pero es obligatorio: vacío tumba el control a 0 %** |

> **P-05 no admite el separador `|`.** El motor parte su valor por saltos de
> línea, **comas y punto y coma** (`toParameterListItems`: `split(/[\n,;]/)`),
> nunca por barra. `jgomez | VPN` no casaría con `jgomez`, y ese silencio se
> leería como cumplimiento. Una cuenta por línea.

### 1.2 Lo que se declara EN LA MÁQUINA

Casi ningún instalador crea estos ficheros con contenido activo, y es
deliberado: **un fichero de política vacío y activo sería una laguna disfrazada
de configuración** —el agente diría «comparé contra la política y no encontré
desviaciones» sin haber comparado contra nada— y **uno sembrado por el
instalador declararía autorizada la puerta trasera de una máquina ya
comprometida**.

| Fichero | Control · evidencia | Formato | Variable que lo apunta |
|---|---|---|---|
| `/var/lib/ensfacil/opacc1/bajas.tsv` | op.acc.1 · EV-04, EV-08 | `usuario<TAB>AAAA-MM-DD` | `OPACC1_BAJAS` |
| `/etc/ensfacil/opacc2-acl.tsv` | op.acc.2 · EV-04 | `ruta<TAB>modo<TAB>propietario:grupo<TAB>acl_esperada` | `OPACC2_ACL_POLITICA` |
| `/etc/ensfacil/opacc2-privilegios.tsv` | op.acc.2 · EV-05 y EV-06 (ALTO) | `usuario<TAB>perfil<TAB>privilegios` | `OPACC2_PRIVILEGIOS` |
| `/etc/ensfacil/opacc2-accesos.tsv` | op.acc.2 · EV-06 (ALTO) | `perfil<TAB>ruta<TAB>tipos_permitidos` | `OPACC2_ACCESOS` |
| `/etc/ensfacil/opacc2-suid.allow` | op.acc.2 · EV-07 | una **ruta absoluta** por línea | `OPACC2_SUID_BASELINE` |
| `/etc/ensfacil/opacc3-tareas.tsv` | op.acc.3 · EV-03 | `nombre<TAB>patrón` | `OPACC3_TAREAS_CRITICAS` |
| `/etc/ensfacil/opacc4-revisiones.tsv` | op.acc.4 · EV-05 | `fecha<TAB>alcance<TAB>responsable` | `OPACC4_REGISTRO_REVISIONES` |
| `/etc/ensfacil/opacc1-ldap-bajas.tsv` | op.acc.1 LDAP · EV-04, EV-08 | `usuario<TAB>AAAA-MM-DD` | `OPACC1LDAP_BAJAS` |
| `/etc/ensfacil/opacc2-ldap-acl.tsv` | op.acc.2 LDAP · EV-04, **dos planos** | ver §3 | `OPACC2LDAP_ACL_POLITICA` |
| `/etc/ensfacil/opacc2-ldap-suid.allow` | op.acc.2 LDAP · EV-07 | una ruta absoluta por línea | `OPACC2LDAP_SUID_BASELINE` |
| `/etc/ensfacil/opacc3-ldap-tareas.tsv` | op.acc.3 LDAP · EV-03 | `nombre<TAB>patrón` | `OPACC3LDAP_TAREAS_CRITICAS` |
| `/etc/ensfacil/opacc4-ldap-revisiones.tsv` | op.acc.4 LDAP · EV-05 | `fecha<TAB>alcance<TAB>responsable` | `OPACC4LDAP_REGISTRO_REVISIONES` |

> **LA EXCEPCIÓN, Y HAY QUE CONOCERLA: `opacc3-tareas.tsv`.** Verificado en
> `op.acc.3-segregacion-de-funciones-y-tareas/install.sh` (líneas 51-53) y
> en `op.acc.3-ldap/install.sh` (líneas 81-88): si el fichero **no existe**,
> los dos instaladores lo crean **copiando su `.example`, que trae cuatro filas
> ACTIVAS**. **No son las mismas cuatro en los dos** (comprobado fichero a
> fichero el 12/08/2026):
>
> | Runbook | Filas activas del `.example` |
> |---|---|
> | Linux | `despliegue en produccion` → `/usr/local/bin/deploy-prod` · `cambio de cortafuegos` → `/usr/sbin/nft` · `restauracion de copia` → `/usr/bin/proxmox-backup-client` · `modificacion de privilegios` → `/usr/sbin/visudo` |
> | LDAP | `modificacion del directorio` → `/usr/bin/ldapmodify` · `cambio de contrasena en el directorio` → `/usr/bin/ldappasswd` · `volcado completo del directorio` → `/opt/zimbra/common/sbin/slapcat` · `parada o arranque del servicio` → `/opt/zimbra/bin/zmcontrol` |
>
> Avisan por pantalla («REVÍSALO: son ejemplos» en Linux, «revísalo: los nombres
> tienen que coincidir con P-04» en LDAP) y nada más.
>
> **Consecuencia exacta:** en una máquina donde `/usr/local/bin/deploy-prod` no
> existe, esa tarea **nunca se ejecuta**, y «una tarea que nadie ejecutó no
> incumple». EV-03 sale `CUMPLE` **sin haber medido nada** — el `CUMPLE` vacío.
> Es la única laguna de este documento que un instalador puede sembrar solo.
> Sustituye las cuatro filas por los binarios reales de la máquina **antes** de
> creerte un EV-03 en verde, y comprueba que existen:
>
> ```bash
> sudo grep -vE '^\s*#|^\s*$' /etc/ensfacil/opacc3-tareas.tsv \
>   | cut -f2 | while read -r p; do
>       [ -e "$p" ] && echo "EXISTE   $p" || echo "NO EXISTE $p  <-- tarea que nunca disparará"
>     done
> ```
>
> Los otros diez ficheros sí siguen la regla: `op.acc.2` (Linux y LDAP) instala
> solo `.example` sin activar, y `op.acc.4` (Linux y LDAP) **no crea el registro
> de revisiones**. En el instalador Linux no aparece ni mencionado; el de LDAP lo
> nombra dos veces, y las dos para decir lo contrario de crearlo: *«NUNCA toca
> /etc/ensfacil/opacc4-ldap-revisiones.tsv: ese fichero lo escribe la
> organización cuando hace una revisión de permisos de verdad»* (cabecera) y la
> línea de ejemplo del cierre. Comprobado el 12/08/2026 en los dos ficheros.

**Todas las columnas van separadas por TABULADOR.** Una fila escrita con
espacios deja la fila entera en la primera columna. El recolector lo detecta y
degrada («ninguna trae … separados por tabulador») en vez de comparar contra
basura, que produciría un `NO_CUMPLE` falso por cada usuario o recurso de la
máquina. Escríbelos con `printf`, no con un editor:

```bash
# Registro de bajas · op.acc.1 EV-04
sudo install -d -m 0750 /var/lib/ensfacil/opacc1
printf 'antonio\t2026-08-02\n' | sudo tee /var/lib/ensfacil/opacc1/bajas.tsv

# Revisiones de permisos · op.acc.4 EV-05  (el instalador NO lo crea)
printf '2026-08-12\ttodo el sistema\trsec\n' \
  | sudo tee -a /etc/ensfacil/opacc4-revisiones.tsv
sudo chmod 640 /etc/ensfacil/opacc4-revisiones.tsv

# Tareas críticas · op.acc.3 EV-03
# OJO: este fichero YA existe con las cuatro filas de ejemplo (ver el aviso de
# arriba). SUSTITÚYELAS —no añadas encima, o dejas activas las de ejemplo— y usa
# binarios que existan aquí y nombres que estén en P-04.
sudo -e /etc/ensfacil/opacc3-tareas.tsv
# así quedó en wazuh-real (12/08/2026), y sus cuatro nombres son los de P-04:
#   cambio de cortafuegos<TAB>/usr/sbin/nft
#   modificacion de privilegios<TAB>/usr/sbin/visudo
#   cambio de reglas de auditoria<TAB>augenrules
#   instalacion de software en produccion<TAB>/usr/bin/dpkg
```

Para los **cuatro de `op.acc.2` en Linux**, las plantillas `.example` **llevan
todas sus filas comentadas** —verificado: 0 filas activas en las cuatro—, así
que copiarlas deja la evidencia exactamente igual de gris, con el motivo
`… sin ninguna fila utilizable` —distinto a propósito del de «no existe»—.
**Las dos de `op.acc.2` LDAP no**: `opacc2-ldap-acl.tsv.example` trae 41 filas
activas y `opacc2-ldap-suid.allow.example` 23, medidas contra esa máquina. Ahí
copiar la plantilla **sí** activa una política, y por eso su instalador se
detiene y te obliga a copiarla a mano.

```bash
sudo cp /etc/ensfacil/opacc2-acl.tsv.example /etc/ensfacil/opacc2-acl.tsv
sudo -e /etc/ensfacil/opacc2-acl.tsv          # escribir la política DE VERDAD
sudo chmod 640 /etc/ensfacil/opacc2-acl.tsv
grep -P '\t' /etc/ensfacil/opacc2-acl.tsv | grep -vc '^#'   # tiene que ser > 0
```

**La línea base de SUID se revisa, no se copia.** El recolector deja en
`/var/lib/ensfacil/opacc2/suid.candidato` lo que hay ahora mismo:

```bash
while read -r f; do
  [ -n "$f" ] || continue
  dpkg -S "$f" >/dev/null 2>&1 \
    && printf '%s\tok\n' "$f" \
    || printf '%s\tSIN PAQUETE  <-- REVISAR\n' "$f"
done < /var/lib/ensfacil/opacc2/suid.candidato

# `sudo` no es opcional: /etc/ensfacil es de root y sus ficheros van en 640.
sudo cp /var/lib/ensfacil/opacc2/suid.candidato /etc/ensfacil/opacc2-suid.allow
sudo chmod 640 /etc/ensfacil/opacc2-suid.allow
sudo -e /etc/ensfacil/opacc2-suid.allow      # quitar lo que no deba estar
```

Una ruta **sin paquete** es la que hay que justificar o quitar. **La revisión
*es* el control; copiar el candidato sin mirarlo lo anula.**

**Inventarse una fila con una fecha falsa en `opacc4-revisiones.tsv` es
exactamente el CUMPLE falso que este producto existe para evitar.** Ni siquiera
funciona como trampa: una fecha por delante del reloj se descarta, y el motivo
del veredicto deja escrito que se descartó.

### 1.3 auditd: escribir las reglas no es cargarlas

Tres de los cuatro controles dependen de auditd, y el instalador **escribe** el
fichero de reglas pero **no lo carga**, a propósito: cargar aplicaría de paso
cualquier otro cambio que el operador tuviera preparado en `rules.d`, y el
instalador nunca hace `auditctl -D` porque descargaría también las reglas de
auditoría del cliente.

```bash
sudo augenrules --load
sudo auditctl -l | grep -E 'ensfacil_opacc[234]'
sudo auditctl -s | head -3          # pid distinto de 0 = el demonio corre
```

| Clave | Control · evidencias | Qué observa |
|---|---|---|
| `ensfacil_opacc2` | op.acc.2 · EV-03 (solo `access_denied`) | denegaciones sobre las rutas de P-02 |
| `ensfacil_opacc2_obj` | op.acc.2 · EV-06 | `-w <ruta> -p rwxa` por recurso de `opacc2-accesos.tsv` |
| `ensfacil_opacc3_act` | op.acc.3 · EV-01, 02, 03, 04, 05, 06 | **una `-w <binario> -p x` por binario de una LISTA CERRADA** (12 en la plantilla Linux, 17 en la LDAP) |
| `ensfacil_opacc3_sec` | op.acc.3 · EV-07 | `/var/ossec/etc`, `/etc/audit`, `/var/log/audit` (+ `cn=config` y `localconfig.xml` en LDAP) |
| `ensfacil_opacc4_perms` | op.acc.4 · EV-04 | `chmod/chown/setxattr` con `auid>=1000`, más `-w` sobre `/etc/group`, `/etc/sudoers` y `/etc/sudoers.d` |
| `ensfacil_opacc4_kn` | op.acc.4 · EV-07 | lecturas de los recursos de P-07 · **la plantilla Linux no trae NI UNA: las escribes tú** |

> **`ensfacil_opacc3_act` NO observa todas las ejecuciones de la máquina, y
> creerlo lleva al error contrario.** La plantilla
> `etc/ensfacil-opacc3.audit.rules.plantilla` es una lista de doce
> `-w <binario> -p x -k ensfacil_opacc3_act` (`git`, `systemctl`, `crontab`,
> `visudo`, `usermod`, `useradd`, `userdel`, `nano`, `vim.basic`, `apt`,
> `apt-get`, `dpkg`); no hay ninguna regla `-S execve`. Comprobado el 12/08/2026
> en `wazuh-real`: `auditctl -l` lista exactamente 12 con esa clave.
>
> Las dos consecuencias, y las dos importan:
>
> - **El volumen es acotado**, no masivo. Aun así conviene mirar
>   `grep -E 'max_log_file|num_logs' /etc/audit/auditd.conf` antes de producción,
>   porque `dpkg` y `apt` sí generan ráfagas.
> - **Una función de P-03 cuyo indicador no esté en esa lista NUNCA se observa.**
>   Si declaras `desarrollo | /usr/bin/docker` y nadie vigila `docker`, el motor
>   no verá esa función y la cuenta saldrá limpia. **Añadir un indicador a P-03
>   obliga a añadir su `-w` a `/etc/audit/rules.d/ensfacil-opacc3.rules` y a
>   recargar.** Es la pareja que más se olvida de todo el control.

Las reglas viven en el kernel, así que `auditctl -l` **las sigue listando con el
demonio parado**: hay que mirar también `auditctl -s`. Y justo después de cargar
aparece un `collector_warning` diciendo que N registros son
`CONFIG_CHANGE op=add_rule`: auditd escribe uno por cada regla que carga. Solo
preocupa si sale en **todas** las pasadas.

**auditd `-w` sobre una ruta que P-07 declara no existe si nadie la escribe.**
Para `op.acc.4`, una línea por recurso de P-07:

```
-w /datos/rrhh -p r -k ensfacil_opacc4_kn
```

Y comprobar que el kernel tiene lo que el fichero declara. En el servidor LDAP
llegó a haber ocho vigilancias declaradas y dos cargadas; **hoy, 12/08/2026, las
ocho están cargadas** (verificado con `auditctl -l` en `ldap-adm`). El `diff`
tiene que salir vacío:

```bash
# servidor LDAP
sudo bash -c 'diff \
  <(grep -h "^-w " /etc/audit/rules.d/ensfacil-opacc4-ldap.rules | awk "{print \$2}" | sort -u) \
  <(auditctl -l | grep -E "ensfacil_opacc4_(perms|kn)" | grep "^-w " | awk "{print \$2}" | sort -u)'

# servidor Linux: el mismo, cambiando el nombre del fichero
sudo bash -c 'diff \
  <(grep -h "^-w " /etc/audit/rules.d/ensfacil-opacc4.rules | awk "{print \$2}" | sort -u) \
  <(auditctl -l | grep -E "ensfacil_opacc4_(perms|kn)" | grep "^-w " | awk "{print \$2}" | sort -u)'
```

El `sudo bash -c` no es adorno: la sustitución de proceso `<(...)` la ejecuta tu
shell **sin** privilegio, y `/etc/audit/rules.d` es `drwxr-x--- root:root`, así
que la versión sin `sudo` delante del `grep` devuelve una lista vacía y el `diff`
acusa un desajuste que no existe. Probado el 12/08/2026 en `wazuh-real`: con la
forma de arriba sale vacío (rc 0).

### 1.4 Antes de guardar la configuración: copia y validación

```bash
# copia
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active > copia-config.json

# Las DOS reglas estructurales que tumban el entorno entero, sobre TODO el
# documento: `isParameterValue` y la forma de cada `columns[]`.
# NO cubre el contenido de las celdas: eso lo juzga `parameter-value-validator`
# y solo degrada el control (§0, regla 7).
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active \
 | python3 -c '
import json,sys
TIPOS_COL={"string","identifier","path","octal","number","date","select","multiselect"}
def ok(p,k):
    if k not in p: return True
    v=p[k]
    if isinstance(v,bool): return True
    if isinstance(v,(str,int,float)): return True
    if isinstance(v,list): return all(isinstance(x,str) for x in v)
    return False
d=json.load(sys.stdin); malos=0
for ci,c in enumerate(d["_source"]["configuration"]["controls"]):
    for pi,p in enumerate(c.get("parameters",[])):
        for k in ("value","defaultValue"):
            if not ok(p,k):
                malos+=1
                print("INVALIDO controls[%d].parameters[%d].%s (%s/%s)"%(ci,pi,k,c["controlId"],p["id"]))
        for xi,col in enumerate(p.get("columns") or []):
            ruta="controls[%d].parameters[%d].columns[%d]"%(ci,pi,xi)
            if not isinstance(col.get("name"),str) or not isinstance(col.get("label"),str):
                malos+=1; print("INVALIDO %s.name/label (%s/%s)"%(ruta,c["controlId"],p["id"]))
            if col.get("type") not in TIPOS_COL:
                malos+=1; print("INVALIDO %s.type (%s/%s)"%(ruta,c["controlId"],p["id"]))
            if not isinstance(col.get("required"),bool):
                malos+=1; print("INVALIDO %s.required no es booleano (%s/%s)"%(ruta,c["controlId"],p["id"]))
print("invalidos:",malos)'
```

Ejecutado contra `wazuh4` el 12/08/2026: **`invalidos: 0`**.

Para **vaciar** un parámetro hay que **borrar la clave `value`**, no asignarle
`null`. Un solo `null` deja el dashboard con *«No se pudo cargar el entorno
ENS»*. La comprobación de `columns[].required` está aquí porque es exactamente
lo que rompió producción el 06/08/2026, y la parte de `value` sola no lo veía.

Y comprobar las columnas reales antes de escribir una tabla:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active \
 | python3 -c '
import json,sys
for c in json.load(sys.stdin)["_source"]["configuration"]["controls"]:
    for p in c.get("parameters",[]):
        for col in (p.get("columns") or []):
            print(c["controlId"], p["id"], col["label"], col["type"], col.get("required"))'
```

### 1.5 El paso 0 que se olvida: que el plugin mire la máquina

Si `scope.mode` es `agent`, el `agentIds` tiene que incluir el ID del servidor.
Sin eso, todo lo demás es invisible y parece un problema de recolección.

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["_source"]["configuration"]["scope"])'

sudo /var/ossec/bin/agent_groups -a -i <ID> -g ens -q
```

> `mode: "global"` evalúa todos los agentes, incluidos los que no tienen
> ENSFácil instalado, y hunde la media con máquinas que nadie instrumentó.

Leído en `wazuh4` el 12/08/2026:
`{"mode": "agent", "agentIds": ["024", "028"], "groupIds": []}` y
`global.ensLevel = "MEDIO"`, que es lo que hace que todo lo marcado «solo ALTO»
en este documento salga `NO_APLICA` hoy.

### 1.6 Dónde vive cada recolector, que no es el mismo sitio en las dos máquinas

**Los runbooks de Linux instalan en `/usr/local/bin`; los de LDAP en
`/opt/ensfacil`.** Buscar el script donde no está es media hora perdida.
Verificado el 12/08/2026 en las dos máquinas.

| Máquina | Recolectores | Minuto de cron |
|---|---|---|
| `wazuh-real` | `/usr/local/bin/ens_opacc{1,2,3,4}_collect.sh` (+ `_score.py` y `_watchdog.py` de 1 y 2) | `:07`, `:12`, `:41`, `:17` |
| `ldap-adm` | `/opt/ensfacil/ens_opacc{1,2,3,4}ldap_collect.sh` (+ sus `opacc{N}ldap-lib.sh`) | `:17`, `:27`, `:33`, `:37` |

Pasada completa a mano en el servidor LDAP —**ninguno de los cuatro tiene
`score.py` ni watchdog**, así que el script es toda la pasada—:

```bash
sudo mv /var/log/ensfacil/op_acc_1.json /var/log/ensfacil/op_acc_1.json.antes
sudo /opt/ensfacil/ens_opacc1ldap_collect.sh      # y 2, 3, 4 igual
```

Y para saber si lo desplegado es lo del repositorio, que es la primera pregunta
cuando el panel no refleja un arreglo:

```bash
md5sum /opt/ensfacil/opacc4ldap-lib.sh            # en ldap-adm
md5sum ~/op.acc.4-ldap/lib/opacc4ldap-lib.sh      # en el portátil
```

El 12/08/2026 los cuatro `opacc{1,2,3,4}ldap-lib.sh` de `ldap-adm` coinciden
byte a byte con los del repositorio.

Y la cadena entera se cierra en el manager:

```bash
sudo grep -h "<agente>" /var/ossec/logs/alerts/alerts.json \
  | grep -oE '"id":"10[67][0-9]{3}"' | sort | uniq -c
```

Si ahí no sale nada, el agente no está en el grupo `ens` o el `logcollector`
empezó a leer el fichero **por el final** (pasa la primera vez: basta con lanzar
otra pasada).

---

## 2. op.acc.1 · Identificación

Ocho requisitos. Cuánto pesa cada evidencia. **La tabla que puntúa es
`requirement.evidenceIds` del catálogo del control** —`catalog/op-acc-1.ts`, que
es lo que lee `evaluateRequirement`—; la de
`core/policy-runtime/policies/op-acc-1.policy.ts` dice exactamente lo mismo, y
las dos se han comparado línea a línea:

| Requisito | Nivel | Evidencias que lo acreditan |
|---|---|---|
| `op.acc.1.1` | los tres | EV-03 |
| `op.acc.1.2` | los tres | EV-05, EV-06 |
| `op.acc.1.3` | los tres | EV-01, EV-02, EV-03, EV-05 |
| `op.acc.1.4` | los tres | EV-01, EV-02, EV-04, EV-08 |
| `op.acc.1.5` | los tres | **ninguna** · atestación P-ATT |
| `op.acc.1.r1.1` | MEDIO/ALTO | **ninguna** · atestación P-ATT |
| `op.acc.1.r1.2` | MEDIO/ALTO | EV-01, EV-06 |
| `op.acc.1.r1.3` | MEDIO/ALTO | EV-01, EV-07 |

**EV-01 aparece en cuatro requisitos y EV-06 en dos, uno de ellos exclusivo.**
Si vas con prisa, empieza por ahí.

Pasada completa a mano (`collect.sh` **no** es la pasada completa: `score.py`
deriva los estados agregados y sin él parece que faltan evidencias):

```bash
sudo mv /var/log/ensfacil/op_acc_1.json /var/log/ensfacil/op_acc_1.json.antes
sudo /usr/local/bin/ens_opacc1_collect.sh
sudo bash -c 'set -a; . /etc/ensfacil/opacc1.env; exec /usr/local/bin/ens_opacc1_score.py'
```

El `set -a` no es opcional: `score.py` no carga el `.env` por sí mismo. Cron:
`:07` recolector, `:12` score, `06:30` watchdog.

### EV-01 · Inventario de cuentas activas
`op.acc.1.3`, `.4`, `r1.2`, `r1.3` · los tres niveles · reglas 106809, 106810, 106811

- **Mira.** `/etc/passwd`: cuentas con `uid ≥ OPACC1_UID_MIN` (P-10, defecto
  1000) y shell distinto de `nologin`/`false`; y UIDs repetidos. Emite
  `account_active` (una por cuenta, etiquetada `EV-01,EV-07`) y
  `account_inventory` con el recuento y los duplicados.
- **CUMPLE si.** `/etc/passwd` es legible y tiene entrada de uid 0, **no hay
  ningún UID duplicado** entre cuentas de persona, y **consta el hecho de
  recuento**.

  ```bash
  awk -F: -v m=1000 '$3>=m {print $3}' /etc/passwd | sort | uniq -d   # vacío = bien
  ```
- **Parámetro de la pantalla que la juzga.** Ninguno. La juzga el agente y **no
  es migrable**: la unicidad del UID es una propiedad intrínseca, no un
  contraste con una política. P-10 decide **qué se observa**, no qué es conforme.
- **Si falta.** `NO_EVALUABLE` si `passwd` no es legible o no es plausible. Y
  **recuento obligatorio**: sin ningún `account_inventory` en la ventana sale
  `NO_EVALUABLE` («sin hecho recuento») aunque haya latido — un latido sin
  recuento es un recolector muerto a medias, no un cumplimiento por silencio.
  `NO_CUMPLE` con UIDs duplicados: eso rompe la unicidad que exige `op.acc.1.3`
  y se arregla renombrando, no configurando.
- **LDAP.** Dos diferencias grandes. (1) **No hay corte por UID**: el criterio
  pasa a ser «¿puede iniciar sesión?», porque `zimbra` tiene uid 999, ejecuta
  `slapd` y es la cuenta más privilegiada de la máquina — un corte en 1000 la
  escondería sin ruido y con el control en verde. Se excluyen solo
  `nologin`, `false` y `/bin/sync` (`OPACC1LDAP_SHELLS_NOLOGIN`). (2) Se
  inventaría también el **plano directorio**, leído por el socket local de slapd
  con SASL EXTERNAL, **sin bind DN ni contraseña**:
  `ldapi://%2Fopt%2Fzimbra%2Fdata%2Fldap%2Fstate%2Frun%2Fldapi`. Un mismo nombre
  presente en los dos planos son **dos identidades con un solo identificador** y
  se reporta como defecto de inventario, la misma clase de hallazgo que un UID
  duplicado. Hoy: `CUMPLE`, 5+5 identidades, sin duplicados ni colisiones.

### EV-02 · Cambios en los ficheros de identidad
`op.acc.1.3` y `.4` · los tres niveles · reglas 106812, 106813, 106818

- **Mira.** `/etc/passwd` y `/etc/shadow` contra el snapshot de la pasada
  anterior. Emite `account_created`, `account_modified`, `account_deleted`.
- **CUMPLE si.** Las fuentes se pueden leer y **la comparación se ha hecho**.
  **Un cambio detectado NO es `NO_CUMPLE`, y es deliberado**: EV-02 pregunta si
  los cambios **se detectan**, no si estaban autorizados. Para juzgar eso haría
  falta una lista de cambios aprobados que hoy no declara ningún parámetro, y
  decidirlo sin ella sería inventarse el veredicto.
- **Parámetro que la juzga.** Ninguno, y **no es migrable** por lo mismo: lo que
  le falta no es un juicio, es un parámetro que diga qué cambio está autorizado.
- **Si falta.** `NO_EVALUABLE` sin `passwd`/`shadow` legibles. **La primera
  pasada nunca sale `CUMPLE`**: fija la línea base, no compara nada, y **no se
  declara en `evidencias_cubiertas`** — declarar cobertura de una comparación que
  no se ha hecho es el CUMPLE falso por la puerta de atrás del silencio. Una hora
  después ya mide.
- **No confundir con la EV-02 de `op.acc.2`**, que vigila los mismos ficheros y
  allí un cambio **sí** es `NO_CUMPLE`. Aquella pregunta «¿ha cambiado algo que
  no debía?»; ésta, «¿queda registrado quién entra y sale del censo?». Responder
  una con el criterio de la otra pintaría de rojo permanente toda máquina viva.
- **LDAP.** Vigila además los **17 `.ldif` de `cn=config`**
  (`/opt/zimbra/data/ldap/config`), que es donde vive el control de acceso al
  directorio: un cambio en una `olcAccess` redefine quién ve y modifica qué sobre
  *todas* las identidades de la organización y **no deja rastro en ningún fichero
  de `/etc`**. **Cobertura: los dos planos o ninguno.** El snapshot no guarda
  ninguna contraseña ni hash: de `/etc/shadow` solo el **primer carácter** del
  campo (distingue clave puesta de bloqueada) y el **día** del último cambio;
  fichero en modo 600 bajo `OPACC1LDAP_ESTADO`. `OPACC1LDAP_EV02_MAX_CAMBIOS`
  (200) acota los eventos volcados; los recuentos reales viajan enteros en el
  `evidence_state`, con `cambios_omitidos`.

### EV-03 · Cuentas genéricas o compartidas — **MIGRADA**
`op.acc.1.1` y `op.acc.1.3` · los tres niveles · **regla 106873**

> **Aviso de trazabilidad, comprobado.** El `relatedRules` del catálogo declara
> para EV-03 las reglas `106801`, `106802` y `106873`; para EV-05, `106805`,
> `106806` y `106873`; para EV-07, `106824`, `106825`, `106826` y `106811`. **Las
> antiguas ya no las dispara nadie**: `grep -c 'event=<tipo>'` sobre
> `lib/opacc1-lib.sh` da 0 para `generic_account_login`, `auth_success`,
> `service_account_interactive`, `interactive_login`, `authorized_list_check` y
> `unauthorized_user`. La única regla viva de EV-03 y EV-05 es **106873**, y la de
> EV-07, **106811**. Si un auditor pide el evento crudo de una de las otras, no
> existe.

- **Mira.** Las líneas `Accepted …` de sshd en `/var/log/auth.log` o journald.
  Emite `account_authenticated` con `usuario` y `origen`, etiquetado
  `evidence_id=EV-03,EV-05`, y **sin `estado`**: el hecho crudo no lleva
  veredicto.
- **CUMPLE si.** Ninguna autenticación observada usa una cuenta declarada en
  P-04. Con **cobertura confirmada**, cero hechos = `CUMPLE`: es
  `NINGUNO_EN_LISTA`, una lista prohibida.
- **Parámetro que la juzga.** **P-04 `cuentas_genericas_prohibidas`**, primitiva
  `NINGUNO_EN_LISTA`, campo `usuario`. La comparación contra lista prohibida es
  **insensible a mayúsculas** —`ADMIN` cuenta como `admin`—: equivocarse produce
  un `NO_CUMPLE` de más, que es la dirección segura.
- **Si falta.** Con P-04 vacío la evidencia **no acredita** y `op.acc.1.1` y
  `op.acc.1.3` no cumplen. **No hay nada que tocar en el servidor**: el hueco es
  una decisión sin escribir. Si el latido sale con `evidencias_cubiertas` vacío,
  el agente no pudo leer el log y el silencio **no** vale como cumplimiento.
- **La prueba de que el circuito entero está vivo:** añade a P-04 una cuenta que
  se haya autenticado; EV-03 pasa a rojo nombrándola **sin tocar el servidor**;
  quítala y vuelve.
- **LDAP.** El recolector lee **tres** formas, no una, y ahí está el hallazgo:

  | Fuente | Se emite | Condición |
  |---|---|---|
  | `sshd: Accepted …` | el usuario que entra | siempre |
  | `su: (to X) Y on TTY` | **X**, la identidad con la que se opera | TTY interactiva |
  | `sudo: U : TTY=… ; … COMMAND=…` | **U**, quien eleva | TTY interactiva y concesión correcta |

  Además: **quién escribió la línea se decide por el prefijo syslog, no por su
  texto** —buscar `" sshd: Accepted "` en cualquier punto deja que el texto, que
  controla un tercero, decida quién la escribió, y eso permite fabricar una
  acusación de incumplimiento contra el auditado—; se usa **`grep -a` siempre**
  porque `auth.log` de esa máquina tiene cientos de bytes NUL y GNU grep deja de
  imprimir líneas sin fallar ni avisar (cero hechos con la fuente sana = CUMPLE
  falso silencioso). **EV-03 NO se declara en `evidencias_cubiertas`**: un bind
  LDAP también es una autenticación, y slapd no la registra; el silencio de
  `auth.log` no demuestra la afirmación. Eso no la bloquea — con hechos, el motor
  la juzga igual.

### EV-04 · Cuentas activas de usuarios dados de baja
`op.acc.1.4` · los tres niveles · reglas 106815, 106816, 106817

- **Mira.** Fechas de baja en `OPACC1_BAJAS`
  (`/var/lib/ensfacil/opacc1/bajas.tsv`) o el campo *expira* de `/etc/shadow`
  (el que fija `chage -E`), frente a si la cuenta sigue habilitada. Plazo:
  `OPACC1_PLAZO_DESHABILITAR_DIAS` (P-05, defecto 1). Emite `account_disabled` y
  `account_offboarding`.
- **CUMPLE si.** Toda cuenta con fecha de baja conocida quedó deshabilitada
  dentro del plazo.
- **Parámetro que la juzga.** Ninguno de la pantalla. **P-09
  `bajas_declaradas` es documental: ningún script lo lee**, y **P-08
  `integracion_rrhh` tampoco** —poner «sí» no desactiva el fichero, lo que decide
  es que exista o no—. Lo que EV-04 consulta es el TSV de la máquina.
- **Si falta.** `NO_EVALUABLE` con el motivo literal —copiado de
  `lib/opacc1-lib.sh:1421`—: *«sin fuente de fechas de baja: no existe
  /var/lib/ensfacil/opacc1/bajas.tsv (P-09) ni hay campo expira poblado en
  shadow»*, y `op.acc.1.4` no cumple. **El motivo cita P-09, no P-08**: nombra la
  tabla `bajas_declaradas`, que es la documental. Es correcto: no
  se puede medir un plazo sin fecha de partida. **Y no se arregla en la
  pantalla.**
- **Vía recomendada: el procedimiento, no el fichero.** Que toda baja pase por

  ```bash
  sudo chage -E "$(date -u +%F)" exempleado
  sudo usermod -L exempleado
  ```
- **Defecto de juicio conocido, aún abierto.** `account_disabled` sale `CUMPLE`
  incondicional: una cuenta deshabilitada 500 días después de la baja, con plazo
  1, se publica conforme. El plazo solo se compara sobre cuentas **aún
  habilitadas**. Se cierra migrando EV-04 a `UMBRAL_MAXIMO` sobre
  `dias_hasta_deshabilitacion` contra P-05, emitiendo el hecho para las dos
  poblaciones.
- **LDAP.** Plano directorio `NO_EVALUABLE` / `CONFIGURATION`: hace falta
  `zimbraAccountStatus`, que la ACL de slapd no expone por el socket. Se cierra
  con un **bind LDAP de solo lectura** declarado en
  `/etc/ensfacil/opacc1-ldap.env` (modo 640 root):

  ```sh
  OPACC1LDAP_BIND_DN="uid=ensfacil-ro,ou=people,dc=ldapserver,dc=qsprueba,dc=com"
  OPACC1LDAP_BIND_PW="..."
  ```

  **No se debe usar la credencial de administración de Zimbra**
  (`zimbra_ldap_password` de `/opt/zimbra/conf/localconfig.xml`): da escritura
  sobre todo el directorio para una tarea que solo necesita leer. El cliente lo
  prohíbe expresamente.

### EV-05 · Cuentas de servicio con acceso interactivo — **MIGRADA**
`op.acc.1.2` y `op.acc.1.3` · los tres niveles · **regla 106873**

- **Mira.** El **mismo** `account_authenticated` de EV-03. No hizo falta ningún
  hecho nuevo: un hecho crudo describe una observación, no un veredicto, así que
  sirve a dos preguntas de auditoría distintas.
- **CUMPLE si.** Ninguna cuenta de servicio declarada abrió sesión interactiva.
- **Parámetro que la juzga.** **P-03 `cuentas_servicio_definidas`**,
  `NINGUNO_EN_LISTA`, campo `usuario`.
- **Si falta.** Sin P-03 no acredita → `op.acc.1.2` y `op.acc.1.3` no cumplen.
  Candidatas para escribirlo: `awk -F: '$3 >= 100 && $3 < 1000 {print $1}' /etc/passwd`.
- **LDAP.** Aquí está su hallazgo, y el runbook de Linux lo perdería: a la cuenta
  de servicio `zimbra` **nadie llega por ssh, se llega con `su - zimbra`**. Leer
  solo sshd daría un silencio que, con cobertura declarada, vale `CUMPLE`.
  La **exigencia de TTY interactiva** evita dos falsos `NO_CUMPLE` comprobados:
  `/etc/init.d/zimbra` arranca el producto con `su - zimbra -c …` (`on none`), y
  Zimbra lanza `sudo …/zmstat-fd` sin TTY. «Acceso interactivo» significa
  literalmente una persona en una terminal; el filtro es esa propiedad, **no una
  lista de cuentas exculpadas** —eso sería política, y la política vive en la
  pantalla—. EV-05 **sí** se declara cubierta (un bind no es sesión
  interactiva), salvo en los cuatro casos de degradación de la fuente:

  | `preparar_auth` | Situación | Causa |
  |---|---|---|
  | rc 1 | ni `auth.log` legible ni journalctl | `COLLECTION` |
  | rc 2 | no se puede garantizar íntegro el lote | `COLLECTION` |
  | rc 3 | la fuente existe y **nunca ha rendido un dato** | `CONFIGURATION` |
  | rc 4 | esta pasada **solo ha fijado la línea base** | `EVIDENCE` |

### EV-06 · Uso multi-rol sin identificador diferenciado
`op.acc.1.2` y `op.acc.1.r1.2` · los tres niveles · reglas 106807, 106808

- **Mira.** Pertenencia a los grupos de `OPACC1_GRUPOS_PRIVILEGIADOS` (P-11,
  defecto `sudo,wheel,admin`) en `/etc/group`, y el sufijo `OPACC1_SUFIJO_ADMIN`
  (P-12, defecto `.adm`) en el identificador. Emite **`multi_role_inventory`**
  (el recuento, siempre), `multi_role_usage` y `privilege_use`.
- **CUMPLE si.** Toda cuenta con privilegio administrativo usa un identificador
  diferenciado. **Se mide la ESTRUCTURA, no los inicios de sesión** —corregido el
  **10/08/2026**, verificado en `scripts/ens_opacc1_score.py` líneas 490-511 y en
  `lib/opacc1-lib.sh` línea 1161: medir logins hacía que una máquina llegara al
  100 % con el administrador todavía en `sudo` solo porque nadie se había
  conectado en la ventana—.
- **Recuento obligatorio, igual que EV-01.** `RECUENTO_OBLIGATORIO` de
  `score.py` tiene hoy **dos** entradas: `EV-01 → account_inventory` y
  **`EV-06 → multi_role_inventory`**. Sin ese hecho en la ventana la evidencia
  sale `NO_EVALUABLE` («sin hecho recuento (multi_role_inventory) en la
  ventana»), no `CUMPLE` por silencio. **`multi_role_inventory` no tiene regla en
  el manager** —`ensfacil_op_acc_1_json_rules.xml` solo trae 106807 y 106808 para
  EV-06—, así que ese recuento vive únicamente en el ndjson de la máquina: se
  comprueba ahí, no en el panel.

  ```bash
  jq -c 'select(.event=="multi_role_inventory")' /var/log/ensfacil/op_acc_1.json | tail -1
  ```
- **Parámetro que la juzga.** Ninguno de la pantalla: lo decide el agente con su
  `.env`. **No es migrable con las siete primitivas**: contrastar la *forma* del
  identificador contra un sufijo es un patrón que ninguna otra evidencia usa.
  Salida conocida: convertir P-12 en una tabla `persona | cuenta ordinaria |
  cuenta administrativa` y usar `CONFORME_A_TABLA`.
- **Si falta.** `NO_EVALUABLE` si `/etc/group` no es legible. **El sufijo vacío
  no «desactiva» nada**: significa que no se excluye a nadie y **todos** los
  privilegiados pasan a ser candidatos a multi-rol.
- **Hoy en `wazuh-real`: `NO_CUMPLE`.** Es el único incumplimiento medido de su
  `op.acc.1`, y arrastra `op.acc.1.2` y `op.acc.1.r1.2` — el 25 % que falta.
  La receta, **con el orden que evita perder el acceso remoto**:

  ```sh
  sudo useradd -m -s /bin/bash -c "Identidad administrativa diferenciada (ENS op.acc.1.2)" dioni.adm
  sudo usermod -aG sudo dioni.adm
  sudo install -d -m 700 -o dioni.adm -g dioni.adm /home/dioni.adm/.ssh
  sudo cp /home/dioni/.ssh/authorized_keys /home/dioni.adm/.ssh/
  sudo chown dioni.adm: /home/dioni.adm/.ssh/authorized_keys
  sudo chmod 600 /home/dioni.adm/.ssh/authorized_keys

  ssh dioni.adm@<host> 'sudo -n true && echo OK'    # VERIFICAR ANTES de quitar nada
  sudo deluser dioni sudo                            # solo entonces
  ```

  **Sacar a alguien del grupo `sudo` no le quita el privilegio** si tiene una
  concesión nominal:

  ```sh
  sudo grep -rhE "NOPASSWD|ALL=" /etc/sudoers /etc/sudoers.d/ | grep -v '^#'
  ```
- **Limitación anotada.** Hoy la pertenencia se mira solo en el campo 4 de
  `/etc/group` y **se pierde el grupo primario**. Hay que arreglarlo cuando se
  migre la evidencia.
- **LDAP.** `root` queda **fuera de esta evidencia a propósito**: existe en toda
  máquina UNIX, no se puede renombrar, y marcarlo generaría un hallazgo que nadie
  puede cerrar nunca — un hallazgo incerrable acaba ignorándose y arrastra a los
  que sí son accionables. Sí aparece en el inventario de EV-01 con
  `privilegiado=si`. Lo que controla el riesgo de `root` es `op.acc.5`. Plano
  directorio: `NO_EVALUABLE` / `CONFIGURATION` hasta que haya bind
  (`zimbraIsAdminAccount`). El plano sistema del LDAP ya conforma desde el
  11/08: se creó `ldap-zimbra.adm` y se retiró `sudo` a `ldapcopy` y `user`.

### EV-07 · Cuentas activas contra la lista autorizada — **MIGRADA**
`op.acc.1.r1.3` · **MEDIO y ALTO** · **regla 106811**

- **Mira.** El **mismo** `account_active` de EV-01.
- **CUMPLE si.** **Toda** cuenta activa figura en P-07.
- **Parámetro que la juzga.** **P-07 `lista_usuarios_autorizados`**,
  `TODOS_EN_LISTA` con `parameterColumn: 'usuario'`. Solo la columna *usuario* se
  contrasta; *sistema* y *rol* acompañan la decisión en el informe.
- **Si falta.** **Sin ningún hecho observado: `NO_EVALUABLE` SIEMPRE.** Es una
  lista **autorizada**: los hechos acreditan algo que existe en la máquina, y no
  observar ninguno es *no haber mirado*. Con P-07 vacío, `op.acc.1.r1.3` no
  cumple en MEDIO/ALTO.
- **La comparación es literal y sensible a mayúsculas.** `jgomez` no casa con
  `JGOMEZ` ni `ana.perez` con `ana-perez`: en `/etc/passwd` el nombre *es* el
  identificador, y normalizar mayúsculas autorizaría a quien nadie autorizó.
- **Trampa cara.** La columna *Usuario* es `identifier` y valida contra
  `/^[^\s|,]+$/`. Un espacio ahí **invalida el parámetro entero y tumba el
  control a 0 %**. Ya pasó una vez.
- Las cuentas a declarar son **exactamente las que el agente está emitiendo**:

  ```bash
  jq -r 'select(.event=="account_active")|.usuario' \
    /var/log/ensfacil/op_acc_1.json | sort -u
  ```
- **LDAP.** El recolector emite **las dos poblaciones**, así que P-07 tiene que
  cubrir las diez identidades (5 del sistema + 5 del directorio) o EV-07 da
  hallazgo. Hoy: `CUMPLE`, 12 cuentas activas todas en la lista.

### EV-08 · Eliminación prematura de cuentas
`op.acc.1.4` · los tres niveles · reglas 106818, 106819

- **Mira.** El registro de cuentas deshabilitadas que mantiene EV-04, contra las
  que ya no están en `/etc/passwd`. Periodo: `OPACC1_RETENCION_DIAS` (P-06,
  defecto 365). Emite `account_deleted` y `retention_violation`.
- **CUMPLE si.** Ninguna cuenta se eliminó antes de cumplir la retención
  declarada. Borrar antes de tiempo se lleva por delante la trazabilidad: el día
  que haya que responder «¿quién hizo esto?», el identificador ya no existe.
- **Parámetro que la juzga.** Ninguno hoy. **Es migrable** (`UMBRAL_MINIMO` sobre
  `dias_retenida` contra P-06): el registro que el agente mantiene entre pasadas
  es **maquinaria de observación, no política** —un vigilante con un cuaderno
  sigue siendo un vigilante—.
- **Si falta.** `NO_EVALUABLE` por cada cuenta sin fecha de baja conocida: sin
  fecha real no se puede afirmar ni que se respetó la retención ni que se violó.
- **LDAP.** Mantiene un **censo por plano** (`censo-sistema.tsv`,
  `censo-directorio.tsv` bajo `OPACC1LDAP_ESTADO`) y compara poblaciones entre
  pasadas. Se censa **todo** `/etc/passwd`, no solo lo que EV-01 inventaría:
  deshabilitar una cuenta es justamente lo **correcto**, y con un censo de solo
  cuentas con shell interactivo, hacer lo correcto se leería como una
  eliminación. Cuando una cuenta desaparece, la fecha de baja no se conoce pero
  queda **acotada**:

  | Situación | Veredicto | Por qué |
  |---|---|---|
  | cota inferior ≥ P-06 | `CUMPLE` (`account_deleted`) | constaba de baja al menos lo exigido |
  | cota superior < P-06 | `NO_CUMPLE` (`retention_violation`) | imposible que se retuviera lo exigido |
  | el umbral cae entre las dos | `NO_EVALUABLE` + causa | no se puede sostener ni una cosa ni la otra |

  **Una contraseña bloqueada NO cuenta como baja**: 52 de las 55 cuentas de esa
  máquina tienen el hash con `!` o `*`, `root` incluida, y muchas entran por
  clave SSH a diario. Quedan en un tercer estado, **desconocida**. Primera
  pasada: `NO_EVALUABLE` / `EVIDENCE`. **Límite honesto:** esto es censo, no
  auditoría de sucesos — una cuenta creada y borrada **entre dos pasadas** no
  deja rastro y EV-08 no la ve.

---

## 3. op.acc.2 · Requisitos de acceso

| Requisito | Nivel | Evidencias que lo acreditan |
|---|---|---|
| `op.acc.2.1` | los tres | EV-01, **EV-03**, EV-07 |
| `op.acc.2.2` | los tres | **EV-03**, EV-04 |
| `op.acc.2.3` | los tres | EV-02, **EV-03**, EV-07 |
| `op.acc.2.r1.1` | **solo ALTO** | EV-05 |
| `op.acc.2.r1.2` | **solo ALTO** | EV-05, EV-06 |

> **Tres listas y solo una puntúa.** `catalog/op-acc-2.ts` y
> `policies/op-acc-2.policy.ts` dicen lo mismo —es la tabla de arriba— pero
> `core/evidence/catalog.ts` declara en la propia evidencia una lista más
> generosa: EV-01 dice acreditar también `op.acc.2.3` y EV-04 también
> `op.acc.2.r1.2`. **Lo que se evalúa es `requirement.evidenceIds` del catálogo
> del control** (`evaluateRequirement` filtra las evidencias con esa lista), así
> que esas dos líneas de más no suman ni restan: por eso los títulos de EV-01 y
> EV-04 de abajo citan un solo requisito. Es la misma deuda de «doble catálogo»
> que avisa `CLAUDE.md`, aquí con nombre y apellidos.

**EV-03 acredita los tres requisitos base.** Una EV-03 en gris tumba el nivel
BAJO entero. Es la que primero hay que mirar — y es exactamente lo que le pasa
hoy a `op.acc.2` del LDAP: EV-02, EV-04 y EV-07 conforman y el control marca 0 %.

> **La pantalla no manda en este control.** Ninguna evidencia está migrada: el
> veredicto lo calcula el agente leyendo `/etc/ensfacil/opacc2.env` y sus cuatro
> ficheros. Cambiar un parámetro en *Configuración → op.acc.2* no cambia ningún
> color. Es una promesa que la pantalla hace y no cumple, y se cierra migrando
> las evidencias al motor: trabajo del plugin, no de la máquina auditada.

**El caso real, para que no se repita.** En `wazuh-real`, EV-05 salía
`NO_EVALUABLE` con el motivo `P-05 modelo_privilegios no configurado` **con la
pantalla rellena**. Lo que faltaba era esto:

```bash
grep OPACC2_MODELO_PRIVILEGIOS /etc/ensfacil/opacc2.env
# OPACC2_MODELO_PRIVILEGIOS=""      <-- vacío: EV-05 gris, dijera lo que dijera la pantalla
```

Pasada completa (cron `:12` recolector, `:17` score, `04:33` watchdog):

```bash
sudo mv /var/log/ensfacil/op_acc_2.json /var/log/ensfacil/op_acc_2.json.antes
sudo /usr/local/bin/ens_opacc2_collect.sh
sudo bash -c 'set -a; . /etc/ensfacil/opacc2.env; exec /usr/local/bin/ens_opacc2_score.py'

jq -c 'select(.event=="evidence_state")|{evidence_id,estado,causa,motivo}' \
  /var/log/ensfacil/op_acc_2.json
jq -c 'select(.event=="collector_warning")|{parametro,motivo}' \
  /var/log/ensfacil/op_acc_2.json | tail -10
```

> **La `causa` de este control es fiable a medias, y hay que saber en qué mitad
> estás.** `_opacc2_degradar` toma la causa como quinto argumento y **su valor
> por defecto es `COLLECTION`**. Contadas una a una en
> `lib/opacc2-lib.sh` el 12/08/2026: **51 llamadas, de las cuales 18 pasan
> `CONFIGURATION` explícita y 33 se quedan con el defecto.**
>
> - Las **18 con `CONFIGURATION`** son las que de verdad son de configuración, y
>   se reparten así (contadas con su número de línea el 12/08/2026): **3 de
>   EV-01** (P-02 sin rutas utilizables · P-07 ausente o no octal, dos veces),
>   **3 de EV-02** (P-02 sin rutas · ninguna ruta con un solo fichero · más
>   ficheros que `OPACC2_FIM_MAX_FICHEROS`), **3 de EV-04** (el fichero de
>   política de acceso ausente, sin filas utilizables o sin tabulador), **4 de
>   EV-05** (`P-05 modelo_privilegios no configurado` y las tres del TSV de
>   privilegios) y **5 de EV-06** (P-06 sin configurar, su tabla sin filas
>   utilizables ×3, y el TSV de privilegios inservible). Ahí filtrar por `causa`
>   **sí** funciona.
> - Las **33 restantes** salen con `COLLECTION` aunque algunas no sean una
>   avería. Un `causa=COLLECTION` en este control **no** demuestra que haya algo
>   roto.
>
> **Regla práctica: diagnostica siempre por el `motivo`**, que nombra el
> parámetro o el fichero exacto, y usa la `causa` solo para ordenar. Es lo que
> hace el runbook LDAP bien desde el principio: allí la causa es argumento
> posicional de `_opacc2ldap_degradar` y no tiene defecto.
>
> El `CUMPLIMIENTO.md` del runbook de `op.acc.2` sigue diciendo que **ninguna**
> de las 51 pasa una causa propia (líneas 599-602 y 676-682). **Eso está
> obsoleto**: el código ya lo hace en 18.

### EV-01 · Permisos en los recursos del sistema
`op.acc.2.1` · BAJO · reglas 106901-106905

- **Mira.** Dos ejes. (1) `find <ruta> -xdev -perm -0002` sobre cada ruta de
  `OPACC2_RUTAS_CRITICAS` que exista, clasificando fichero / directorio con
  *sticky bit* / directorio sin él. (2) El `umask` efectivo: lee
  `/etc/login.defs`, `/etc/profile`, `/etc/bash.bashrc` y `/etc/profile.d/*.sh`
  y se queda con **el valor menos restrictivo de todos**, que es el que de verdad
  crea ficheros abiertos. El campo `fuente` del `umask_check` dice de cuál salió.
- **CUMPLE si.** Ningún *world-writable* bajo P-02 salvo los exceptuados, y el
  `umask` menos restrictivo lleva **todos** los bits del mínimo. La comparación
  es **bit a bit** (`(real & minimo) == minimo`), no numérica: `032` es mayor que
  `027` y tampoco cumple, porque no bloquea la lectura ajena.
- **Parámetro que la juzga.** Ninguno de la pantalla. Deciden
  `OPACC2_UMASK_MINIMO` (gemelo de P-07),
  `OPACC2_WORLD_WRITABLE_PERMITIDOS`/`_EXCEPCIONES` (P-03/P-11) y
  `OPACC2_RUTAS_CRITICAS` (P-02).
- **Si falta.** `NO_CUMPLE` con un `world_writable` por hallazgo, o
  `umask_check` en `NO_CUMPLE`. `NO_EVALUABLE` si: P-02 sin rutas utilizables o
  ninguna existe · P-07 ausente o no es octal válido · ninguna de las cuatro
  fuentes de `umask` es legible · **son legibles y ninguna declara `umask`** (no
  se asume el valor por defecto) · hay una declaración no interpretable como
  `umask u=rwx,g=rx,o=` · el barrido no pudo recorrer parte del árbol y no había
  violaciones.
- **Lo que sorprende en la primera pasada.** Un Ubuntu de fábrica trae
  `UMASK 022`, así que EV-01 sale **`NO_CUMPLE`, no gris**. Eso es la vía 1
  hablando: la máquina no cumple.

  ```bash
  sudo sed -i 's/^UMASK.*/UMASK\t\t027/' /etc/login.defs
  grep -riE '^\s*umask' /etc/login.defs /etc/profile /etc/bash.bashrc /etc/profile.d/*.sh
  ```

  El `grep` es el paso que importa: si cualquiera de esos ficheros deja un
  `umask 022`, ese es el que se compara. Alternativa legítima: bajar P-07, que
  **queda declarado en el `.env` para que lo vea el auditor**.
- **La excepción tiene que ser la ruta exacta del hallazgo, no un prefijo**:
  declarar `/tmp` no exceptúa `/tmp/algo`.
- **LDAP.** Añade un plano directorio con **cinco comprobaciones del servicio**,
  cuatro de las cuales pasan hoy: `hash_contrasenas` (`{SSHA512}`),
  `config_no_expuesta` (`{0}config` con `to * by * none`),
  `almacen_credenciales_protegido` (`data.mdb` en 600) y `enumeracion_anonima`
  (un bind anónimo enumera **0 de 14** entradas — **se prueba con una consulta,
  no se deduce de las ACL**, porque razonar sobre once cláusulas encadenadas con
  `break` es justo el tipo de deducción que se equivoca en silencio).

  **La que falla es `canal_protegido_exigido`, y es `NO_CUMPLE` real:**

  ```
  olcSecurity: ssf=0        el servidor no exige NINGUNA fuerza de canal
  olcLocalSSF: 128          solo el socket local va acreditado
  escuchas: ldap://ldapserver.qsprueba.com:389  ldapi:///
  ```

  **Tener TLS disponible no es exigirlo**: StartTLS funciona en esa máquina, pero
  un cliente que no lo pida hace un bind simple sin cifrar y el servidor lo
  atiende igual.

  > **Corrección al informe del 12/08, comprobada en la máquina.** El informe
  > dice «cero directivas `olcTLS*` en toda la configuración» y de ahí concluye
  > que *«slapd no tiene cifrado en tránsito»*. **Es falso**: el
  > `CUMPLIMIENTO.md` de `op.acc.2-ldap` cuenta siete `olcTLS*` (certificado,
  > clave, CA, `olcTLSProtocolMin: 3.1`, `olcTLSCipherSuite`, `olcTLSCRLCheck`,
  > `olcTLSVerifyClient`) y **StartTLS negocia**: ejecutado hoy desde `ldap-adm`,
  > sin credenciales,
  > `LDAPTLS_REQCERT=never ldapsearch -x -ZZ -H ldap://ldapserver.qsprueba.com:389 -b "" -s base`
  > devuelve el RootDSE (rc 0). **El veredicto no cambia** —`NO_CUMPLE` sigue
  > siendo correcto porque `olcSecurity: ssf=0` no exige nada— pero el trabajo
  > pendiente no es «montar TLS desde cero»: es revisar los certificados,
  > publicar `ldaps://636` y **entonces** exigir SSF.

 Por eso este runbook **no comprueba si hay `olcTLS*`
  declarado** —eso habría dado `CUMPLE`, que es el CUMPLE falso que el producto
  no comete—: comprueba `olcSecurity`, `olcLocalSSF` y por dónde escucha el
  proceso. Se cierra con certificados → `ldaps://636` → **y solo entonces**
  `olcSecurity: ssf=128`, previo censo de quién conecta en claro: al revés deja
  fuera a los propios servicios de Zimbra.

  Dos precisiones del plano sistema LDAP: el barrido de *world-writable*
  **excluye enlaces simbólicos** (`! -type l`) —un symlink siempre tiene modo
  0777 y esos bits no se usan para nada; sin el filtro, `/opt/zimbra/conf/ca`
  produce una alerta de nivel 12 falsa—, y `PasswordAuthentication yes` **se
  reporta y no se convierte en incumplimiento**: la robustez del autenticador es
  `op.acc.5`, y emitir un incumplimiento que la norma no respalda le quita
  credibilidad a los que sí.

### EV-02 · Integridad de los ficheros del SO
`op.acc.2.3` · BAJO · reglas 106920-106922

- **Mira.** Todos los ficheros regulares bajo P-02 (`find -xdev -type f`), con
  `sha256sum` y `stat -c '%a %u %g'`, contra la línea base
  `/var/lib/ensfacil/opacc2/fim.tsv`. Al terminar sustituye la línea base por la
  foto de ahora.
- **CUMPLE si.** Entre dos pasadas ningún fichero de P-02 cambia de hash, modo o
  propietario, y no aparece ni desaparece ninguno.
- **Parámetro que la juzga.** Ninguno. **No es migrable**: la referencia es la
  foto de la pasada anterior y no hay parámetro que declare qué cambio es
  aceptable. P-02 dice **qué se vigila**, no qué es conforme.
- **Si falta.** `NO_CUMPLE` con `fim_modified`/`fim_added`/`fim_deleted`, uno por
  fichero. `NO_EVALUABLE` si: P-02 sin rutas utilizables · una ruta existe y no
  es fichero ni directorio (un socket, un enlace roto) · el barrido quedó
  incompleto · ninguna ruta contiene un solo fichero · hay más de
  `OPACC2_FIM_MAX_FICHEROS` (2000) · algún fichero no se pudo leer para el hash ·
  la foto salió con menos líneas que ficheros enumerados · no se pudo escribir en
  `/var/lib/ensfacil/opacc2`.
- **La primera pasada no compara**, solo fija la línea base — emitir un alta por
  cada fichero presentaría el censo de hoy como si fueran altas de hoy. Un cambio
  legítimo produce su `fim_modified` en esa pasada y **se cierra solo** en la
  siguiente: no hay nada que aprobar a mano.
- **Superar el tope degrada, no trunca**: un snapshot truncado emitiría un
  `fim_deleted` fantasma —severidad 12— por cada fichero que quedara fuera.
- **LDAP.** Vigila además los **17 ficheros de `cn=config`**: la configuración de
  slapd *es* el control de acceso al directorio, y un cambio ahí no deja rastro
  en `/etc`. Hoy `CUMPLE` en los dos planos (18 + 17 ficheros según el
  `CUMPLIMIENTO.md` del runbook, 21 + 17 según el informe del 12/08 — **no se ha
  comprobado en la máquina cuál de los dos recuentos del plano sistema es el
  vigente**; el veredicto es el mismo, 0 cambios). Y la
  primera pasada sale `NO_EVALUABLE` / `COLLECTION`, no `CUMPLE`: EV-02 pregunta
  si han cambiado los componentes **desde la observación anterior**, y en la
  primera no hay observación anterior.

### EV-03 · Accesos denegados y escaladas de privilegio
`op.acc.2.1` y `op.acc.2.2` · BAJO · reglas 106910-106912 · **la que más pesa**

- **Mira.** Dos fuentes. (1) El **log de autenticación** (`/var/log/auth.log`, o
  journald en Ubuntu 24.04+, que ya no trae rsyslog de fábrica), leído por lotes
  desde un marcador: de cada línea de `sudo` o `su` decide una de tres cosas —se
  intentó y se denegó (`access_denied`, CUMPLE), ocurrió y quien lo hizo estaba
  autorizado (`sudo_usage`, CUMPLE), u ocurrió y no lo estaba
  (`privilege_escalation`, NO_CUMPLE)—. (2) **auditd**, clave `ensfacil_opacc2`:
  los registros con `success=no` sobre las rutas de P-02, agregados como
  `access_denied` con su `n:intentos`.
- **«Autorizado» no sale de ningún fichero de política: sale de la máquina.** Es
  tener UID 0, pertenecer a un grupo de `OPACC2_GRUPOS_PRIVILEGIADOS` (incluido
  como **grupo primario**) o recibir una concesión en `/etc/sudoers` o
  `/etc/sudoers.d`. Por eso **EV-03 es la única evidencia del control que da
  veredicto sin necesidad de una decisión escrita.**
- **CUMPLE si.** Nadie no autorizado eleva privilegios, y las fuentes se pueden
  leer: log que rinda eventos, `/etc/group` con GID 0 y `/etc/passwd` con UID 0.
- **Parámetro que la juzga.** Ninguno. **No hay fichero de política que
  escribir**: se arregla la máquina.
- **Si falta.** `NO_CUMPLE` con `privilege_escalation` deduplicado por usuario y
  método, con su `n:ocurrencias` — **sin tope de emisión**: deduplicar acota el
  volumen sin perder un solo incumplimiento. `NO_EVALUABLE` si: no hay fuente ·
  la fuente existe y nunca ha rendido un evento · no se pudo leer íntegra ·
  `/etc/group` o `/etc/passwd` ilegible o sin GID/UID 0 · el lote no está
  disponible · **una o más elevaciones consumadas no se pudieron clasificar** y
  no hubo escaladas probadas.
- **Ese último caso es el más frecuente en máquinas reales**: una cuenta de
  directorio (LDAP, AD, SSSD) que no está en el `passwd` local, un
  `ALL ALL=(ALL) ALL`, un `#includedir`, un netgroup NIS o un `sudoers.d`
  ilegible. Acusarla sería un `NO_CUMPLE` falso; callarla, un `CUMPLE` falso.
- **EV-03 NO depende de auditd, y confundirlo manda a buscar donde no hay nada.**
  Su `NO_CUMPLE` sale del log de autenticación. La mitad de auditd solo aporta
  `access_denied`, que es CUMPLE: perderla reduce el volumen de evidencia, **no
  fabrica cumplimiento**, así que no degrada — deja un `collector_warning`. Si
  EV-03 está gris, mira el `motivo`.
- **En la primera pasada puede salir sin hechos**: el log se lee **desde el
  final** para no volcar semanas de logins históricos como si fueran de ahora.
- **LDAP.** Plano sistema `CUMPLE` (49 elevaciones, todas de `ldap-zimbra`, cero
  escaladas). Plano directorio **`NO_EVALUABLE` / `CONFIGURATION`: slapd no
  registra ni un intento**. `olcLogLevel` vale `Sync None` y no incluye `stats`:
  ~1800 líneas de slapd en `/var/log/zimbra.log` y **cero** con `err=`. **La
  ausencia de denegaciones en un log que no registra denegaciones no es "no hubo
  denegaciones".** Se habilita:

  ```sh
  sudo -u zimbra ldapmodify -Y EXTERNAL -H ldapi:///opt/zimbra/data/ldap/state/run/ldapi <<'EOF'
  dn: cn=config
  changetype: modify
  replace: olcLogLevel
  olcLogLevel: stats
  olcLogLevel: Sync
  EOF
  sudo grep -c 'err=' /var/log/zimbra.log     # debe empezar a crecer
  ```

  Verificado que el socket local **no basta** (`Insufficient access (50)`, porque
  `{0}config` lleva `to * by * none`) y que `zmlocalconfig -e ldap_log_level=256`
  guarda el valor y **no** lo propaga a `olcLogLevel`: requiere la credencial de
  administración. Y **una segunda mitad honesta**: con `stats` activo, el
  recolector **todavía no analiza el log de slapd** y lo dice con causa
  `COLLECTION` — escribir un analizador contra un formato que nadie ha podido
  observar daría cero resultados en el mejor caso y resultados mal interpretados
  en el peor.

  **Coste medido de esta ceguera:** `evidencias_cubiertas` es por evidencia, no
  por plano, así que basta que **un** plano degrade para que la evidencia entera
  salga de la lista. EV-03 mide el plano sistema perfectamente y **no puntúa**.
  Se gana la única propiedad que este producto no negocia.

  Dos detalles del log de esa máquina que cambiaban el resultado: **840 bytes
  NUL** en `auth.log` (con eso `grep` deja de imprimir líneas y el lote se lee
  como vacío → `CUMPLE` por silencio sobre un log lleno de sucesos; el troceado
  lo hace `awk`), y **`rsyslog` escribe `sudo:` sin PID** mientras journald
  escribe `sudo[56409]:` — de 1808 líneas, **una sola** lleva la forma con PID.
  Un patrón que solo aceptara la de manual no habría visto ninguna de las 632
  elevaciones.

### EV-04 · ACLs frente a la política declarada
`op.acc.2.2` · BAJO · reglas 106913, 106914

- **Mira.** Cada fila de `/etc/ensfacil/opacc2-acl.tsv`, en tres ejes:
  `stat -c '%a'` (modo, comparado como octal: `750` y `0750` son el mismo),
  `stat -c '%U:%G'` (propietario) y `getfacl -p --absolute-names` (ACL POSIX
  extendida). La ACL se compara **en las dos direcciones**: una entrada declarada
  que no está aplicada, y una entrada nominativa aplicada que nadie ha declarado.
- **CUMPLE si.** El fichero existe, tiene al menos una fila con ruta y modo
  separados por tabulador, cada ruta declarada existe, y modo, propietario y ACL
  coinciden. **Un `-` en la cuarta columna significa «no se ha decidido conceder
  ninguna ACL extendida», no «aquí no se mira»**: una entrada nominativa aplicada
  sobre ese recurso es un derecho sin decisión detrás.
- **Parámetro que la juzga.** Ninguno de la pantalla; el gemelo es **P-08
  `acl_declarada`**, y el motivo del recolector lo llama `P-04/P-06`.
  `OPACC2_POLITICA_REF` (P-04) es la referencia documental: **sin ella EV-04 no
  degrada**, pero el `acl_check` sale sin el campo `politica` y el informe no
  puede citar la norma. Es un hueco documental, no una imposibilidad de medir.
- **Si falta.** `NO_CUMPLE` con `acl_deviation` por recurso, con `acl_real` y
  `acl_esperada`. `NO_EVALUABLE` si: el fichero no existe · existe y no se puede
  leer · no tiene ninguna fila utilizable (vacío o solo comentarios) · ninguna
  fila trae ruta y modo separados por tabulador · falta el paquete `acl` y hay
  filas que declaran ACL extendida · algún recurso declarado no existe, no se
  pudo leer o su fila no declara un modo octal válido.
- **Por qué es correcto.** `op.acc.2.2` exige literalmente que los derechos de
  acceso respondan a **una decisión del responsable del recurso**. Sin esa
  decisión escrita no hay contra qué comparar: **no es un límite de la medida, es
  el objeto de la medida.**
- **Es la evidencia insignia de `CONFORME_A_TABLA`**, y migrarla cambiaría **lo
  que se mide**, no solo quién lo decide: hoy el recolector **itera la política**
  y mide lo que ella nombra, así que un recurso que el cliente no escribió **no
  se mira nunca**. Con el hecho crudo, el agente mediría los recursos que hay y
  el motor buscaría su fila.
- **LDAP.** `OPACC2LDAP_ACL_POLITICA` es **un solo fichero para los dos planos**,
  y la primera columna dice a cuál pertenece:

  ```
  sistema<TAB>ruta<TAB>modo<TAB>propietario:grupo<TAB>acl_posix
  directorio<TAB>sujeto<TAB>destino<TAB>acceso_maximo
  ```

  `acceso_maximo` es `ninguno | divulgacion | autenticacion | lectura |
  escritura`, y **es un techo, no una igualdad**:

  | Caso | Veredicto | Por qué |
  |---|---|---|
  | la cláusula concede **más** de lo declarado | `NO_CUMPLE` | se concedió por encima de lo decidido |
  | concede **menos** | correcto | más cerrado de lo autorizado no incumple `op.acc.2.2` |
  | **no casa con ninguna fila** | `NO_CUMPLE` | derecho concedido **sin decisión detrás** |
  | la fila **no casa con ninguna cláusula** | no es desviación | se cuenta como `filas_sin_uso` |

  Las cláusulas que **no conceden nada** (`by * none`, `by * +0 break`) no hay
  que declararlas: 9 de 37 en esa máquina. Hoy: **`CUMPLE` en los dos planos** —
  13 recursos y 28 cláusulas, 0 desviaciones. Comprobado sembrando tres
  desviaciones y detectándolas las tres.

  **Un eje ciego no borra lo que otro eje ya midió**: si falta el paquete `acl`,
  la desviación de modo o propietario **ya demostrada** se emite igual y la fila
  sigue contando como no verificada. La primera versión descartaba la fila
  entera, y la laguna escondía el incumplimiento probado.

### EV-05 · Privilegios individuales (R1)
`op.acc.2.r1.1` y `op.acc.2.r1.2` · **solo ALTO** · reglas 106930-106933

- **Mira.** Dos ejes, y hacen falta los dos. (1) Miembros de cada grupo de
  `OPACC2_GRUPOS_PRIVILEGIADOS`, contando los secundarios de `/etc/group` **y**
  los que lo tienen como primario en `/etc/passwd`. (2) Concesiones de
  `/etc/sudoers` y `/etc/sudoers.d`, expandiendo `%grupo`, `User_Alias`, `#uid` y
  `%#gid`. Cada usuario resultante se busca en la columna 1 de
  `opacc2-privilegios.tsv`.
- **CUMPLE si.** `OPACC2_MODELO_PRIVILEGIOS` tiene valor **en el `.env`**, el TSV
  tiene al menos una fila `usuario<TAB>perfil`, y **toda cuenta privilegiada de
  la máquina está declarada, `root` incluido**.
- **Parámetro que la juzga.** Ninguno de la pantalla; gemelos P-05 y P-09.
- **Si falta.** `NO_CUMPLE` con `excessive_privilege` por usuario y motivo
  (`pertenencia al grupo privilegiado X no justificada por el modelo de
  privilegios de P-05`, o `concesion de sudo en <fichero> no declarada`).
  `NO_EVALUABLE` si: **`P-05 modelo_privilegios no configurado`** · el TSV no
  existe, no se lee, no tiene fila utilizable o no está en TSV · `/etc/group`
  ilegible o sin grupo root · alguna concesión de sudo no se pudo atribuir a un
  usuario y no había excesos probados.
- **`NO_APLICA` en BAJO y MEDIO**, y no es un hueco de medida: es lo que permite
  que un cliente de nivel BAJO llegue al 100 % sin arrastrar el refuerzo.
- **Ver quién va a salir, antes de escribir el fichero:**

  ```bash
  for g in sudo wheel admin adm root; do getent group "$g"; done
  awk -F: '$3 == 0 {print $1}' /etc/passwd
  ```

  En un Ubuntu recién instalado saltan `root` y la cuenta de administración de la
  imagen. **Es el resultado correcto**: un privilegio sin decisión detrás es
  justo lo que `r1.1` persigue.
- **Hoy EV-05 no compara privilegios.** La columna 3 del TSV (`privilegios
  concedidos`) no la lee ningún `awk` del recolector: el juicio es «¿está el
  nombre en la columna 1?». Ir más allá exige antes decidir un **vocabulario de
  privilegios comparable**.
- **LDAP.** Emite el inventario completo de quién ostenta privilegio en los dos
  planos con `group_membership` (106932), pero sale **`NO_EVALUABLE` /
  `CONFIGURATION` en los dos**: sus degradaciones remiten a P-05/P-09 de la
  pantalla, **que ese recolector no lee**. No es que falte la decisión: es que
  **aunque se escriba, el recolector no la vería**. Lo que falta es portar el
  mismo mecanismo que ya se portó para EV-04 y EV-07 —un fichero local declarado
  en el `.env` con su plantilla `.example`—.

  Y el hallazgo que nadie mira: **`cn=config` es `rootdn` de las tres bases**, y
  un rootdn **salta todas las ACL de su base por definición**. No aparece en
  ningún grupo ni en ninguna lista de miembros. Cualquier modelo de privilegios
  que no lo nombre está incompleto.

### EV-06 · Tipo de acceso por objeto (R1)
`op.acc.2.r1.2` · **solo ALTO** · reglas 106935, 106936

- **Mira.** Los registros de auditd de la clave `ensfacil_opacc2_obj`, que vienen
  de las vigilancias `-w <ruta> -p rwxa` generadas de la columna 2 de
  `opacc2-accesos.tsv`. De cada acceso **consumado** (`success=yes`) deduce el
  sujeto (`auid`, y si no hay, el `uid` real), el tipo en vocabulario ENS a
  partir de la syscall y los flags de apertura, y el perfil según la columna 2 de
  `opacc2-privilegios.tsv`.
- **CUMPLE si.** auditd instalado, demonio corriendo, **reglas cargadas**, los
  **dos** TSV utilizables, y ningún acceso consumado fuera de los tipos
  declarados. Vocabulario **cerrado**: `lectura`, `escritura`, `ejecucion`,
  `modificacion`, y nada más.
- **Parámetro que la juzga.** Ninguno de la pantalla; gemelo P-06.
- **Si falta.** `NO_CUMPLE` con `access_type_violation`. `NO_EVALUABLE` si:
  `opacc2-accesos.tsv` no existe/no se lee/sin fila utilizable/sin TSV · ninguna
  fila es utilizable (ruta no absoluta, ruta prohibida, tipos fuera del
  vocabulario) · **`opacc2-privilegios.tsv` no es utilizable**, aunque
  `accesos.tsv` esté impecable · auditd no instalado · la clave no rinde datos ·
  `ausearch` falló o no se pudo guardar el marcador · hay accesos sin clasificar
  y no había violaciones probadas. `NO_APLICA` en BAJO y MEDIO.
- **La dependencia cruzada que más despista.** EV-06 compara contra
  `accesos.tsv` pero **necesita `privilegios.tsv`** para saber de qué perfil es
  cada usuario. Sin él ningún usuario tiene perfil, no se emitiría ni una
  violación, y ese silencio se leería como cumplimiento. Por eso degrada.
- **Rutas prohibidas para vigilancia** (la fila se rechaza con aviso): `/`,
  `/etc`, `/usr`, `/var`, `/var/log`, `/proc`, `/sys`, `/dev`, `/bin`, `/sbin`,
  `/lib` y `/boot`. Un `-p rwxa` sobre cualquiera inunda el log y tumba el
  servidor.
- **Orden obligatorio:** escribir `accesos.tsv` → lanzar el recolector (regenera
  el fichero de reglas, y **solo para rutas que existen de verdad**) →
  `augenrules --load`. `augenrules --load` es **la causa número uno** de que
  EV-06 salga gris tras un despliegue.
- **LDAP.** Plano sistema `NO_EVALUABLE` / **`COLLECTION`**, y **el motivo ha
  cambiado desde que se escribió el `CUMPLIMIENTO.md` de `op.acc.2-ldap`**. Ese
  documento dice que `auditd` no está instalado (medido el 10/08/2026);
  **comprobado en `ldap-adm` el 12/08/2026, sí lo está**: `auditd 1:3.0.7-1build1`,
  demonio vivo (`auditctl -s` → `pid 382`) y 37 reglas `ensfacil_*` cargadas. El
  recolector ya distingue los dos casos (`lib/opacc2ldap-lib.sh:3041-3052`), así
  que hoy sale la **segunda** rama: *«auditd esta instalado pero este runbook
  todavia no genera ni consume sus reglas; el plano sistema de EV-06 lo cubre el
  runbook op.acc.2-requisitos-de-acceso»*. Sigue siendo `COLLECTION` y sigue
  siendo correcto —**no falta una decisión, falta que alguien genere las reglas
  `ensfacil_opacc2_obj`**—, y se cierra desplegando además el runbook
  `op.acc.2-requisitos-de-acceso`, que es quien genera y consume esas reglas —
  duplicar la maquinaria solo conseguiría que las dos se estorben.
  `auditctl -l` de `ldap-adm` a 12/08 no lista ni una clave `ensfacil_opacc2` ni
  `ensfacil_opacc2_obj`, que es exactamente lo que falta. Plano
  directorio: emite 37 `object_access`, uno por cláusula, traduciendo el
  vocabulario de OpenLDAP (`none`, `disclose`, `auth`, `compare`, `search`,
  `read`, `write`, `manage`, `=wrscxd`, `+0`) al del ENS **conservando el token
  original en `nivel_ldap`**, así que traducir no pierde información. Sale
  `NO_EVALUABLE` / `CONFIGURATION` por lo mismo que EV-05.

### EV-07 · SUID/SGID y ficheros sin dueño
`op.acc.2.1` y `op.acc.2.3` · BAJO · reglas 106924-106927

- **Mira.** Un solo recorrido `find` sobre los montajes locales detectados (o
  sobre `OPACC2_BARRIDO_RUTAS`), con `timeout`, `ionice`, `nice` y podas fijas
  (`/proc /sys /run /dev /snap /var/lib/docker /var/lib/containers`) más
  `OPACC2_BARRIDO_EXCLUIR`. Busca `-perm /6000` y `-nouser` / `-nogroup`.
- **CUMPLE si.** La línea base existe con al menos una **ruta absoluta** y
  contiene todos los SUID/SGID de la máquina, y no hay ningún fichero sin usuario
  ni sin grupo.
- **Parámetro que la juzga.** Ninguno de la pantalla; gemelo P-10.
- **Si falta.** `NO_CUMPLE`: `suid_sgid` por binario no autorizado,
  `no_owner_file` por huérfano. `NO_EVALUABLE`: sin línea base (con el motivo que
  **nombra el candidato y fecha el barrido**) · línea base sin ninguna ruta
  absoluta (nombres sueltos: no casan con nada, y los ~25 SUID legítimos saldrían
  como no autorizados — un `NO_CUMPLE` falso masivo) · no se pudo adelantar el
  marcador de cadencia · no se pudieron determinar los montajes · ninguna raíz se
  pudo recorrer · el barrido superó `OPACC2_BARRIDO_TIMEOUT` · el `find` no
  recorrió todo el árbol.
- **Los dos ejes se tratan distinto, y esa diferencia es el fondo de la
  evidencia.** Los **huérfanos son objetivos**: un fichero sin usuario no
  responde a ninguna decisión de nadie, se juzga sin política, y **`NO_CUMPLE`
  manda sobre `NO_EVALUABLE`** —si hay uno, EV-07 sale `NO_CUMPLE` por él aunque
  el eje SUID siga sin juzgar—. Los **SUID no**: `/usr/bin/sudo` lleva el bit y
  debe llevarlo.
- **Cadencia de 24 h**, porque un `find /` en cada pasada horaria no es
  aceptable. **No hace falta borrar `barrido.marca`**: un cambio del contenido
  útil de la línea base **adelanta el barrido una vez**, y retirarla también
  (`ausente` es un valor como otro). Reordenar el fichero o comentarlo no dispara
  nada. Cuando no toca, el motivo **se reemite con su fecha entre corchetes**.
- **LDAP.** Idéntico, con `OPACC2LDAP_SUID_BASELINE`. Hoy **`CUMPLE`**: 0
  huérfanos, 23 SUID/SGID, 23 autorizados. Comprobado retirando `pkexec` y
  `Xorg.wrap` de la línea base: pasó a `NO_CUMPLE` con un `suid_sgid` por cada
  una. La plantilla `.example` de esa máquina trae **las 23 rutas reales con su
  modo** y señala las cinco candidatas obvias a revisión en un servidor sin
  escritorio (`Xorg.wrap`, `camel-lock-helper-1.2`, `pppd`, `pkexec`,
  `polkit-agent-helper-1`).

---

## 4. op.acc.3 · Segregación de funciones y tareas

**No rige en nivel BAJO**: el Anexo II lo declara `n.a.` ahí. Rige desde MEDIO;
el refuerzo R1 solo en ALTO. `r2.1` y `r3.1` salen `NO_APLICA` y **no restan**:
el ENS los define pero no los exige en la tabla de aplicabilidad de ningún nivel.

> **Estado del control: `ACTIVE`.** Verificado en
> `dashboard/ens/catalog/op-acc-3.ts` línea 12 y en `catalog/op-acc-4.ts`. El
> `CUMPLIMIENTO.md` del runbook y el `CLAUDE.md` todavía dicen `DRAFT`: **eso
> está obsoleto**, y el informe del 12/08 mide los dos controles en las dos
> máquinas.

Cuánto pesa cada evidencia, de `catalog/op-acc-3.ts` (`levels: []` significa que
el requisito sale `NO_APLICA` en los tres niveles y **no entra en el
denominador**):

| Requisito | Nivel | Evidencias del catálogo | Quién decide el veredicto |
|---|---|---|---|
| `op.acc.3.1` | MEDIO y ALTO | EV-01, EV-06 | **el evaluador** · par `desarrollo \| operacion` |
| `op.acc.3.2` | MEDIO y ALTO | EV-02, EV-03, EV-06 | **el evaluador** · par `autorizacion \| control` **+** la concurrencia de P-04 |
| `op.acc.3.r1.1` | **solo ALTO** | EV-04, EV-06 | **el evaluador** · par `configuracion \| mantenimiento` |
| `op.acc.3.r1.2` | **solo ALTO** | EV-05 | **el evaluador** · `auditoria \| *` y P-05 |
| `op.acc.3.r2.1` | ninguno | ninguna | `NO_APLICA` |
| `op.acc.3.r3.1` | ninguno | EV-07 | `NO_APLICA` |

**Y aquí esta tabla NO es la palanca que es en los otros controles.** Cuando hay
decisión de la policy para un requisito, `evaluateRequirement` usa **esa**
decisión y no consolida sus evidencias (`measurement = policyDecision.status`).
Por eso una evidencia gris no arrastra al requisito —y por eso `op.acc.3` marca
100 % con EV-02 y EV-07 sin medir—. La tabla sirve para leer la traza y para
saber qué mirar, no para predecir el número. (La lista de la policy para
`op.acc.3.2` es `EV-02, EV-06`; la del catálogo añade EV-03. Ninguna de las dos
cambia el veredicto, que lo pone el evaluador.)

**Es el único control con evaluador de policy propio**
(`core/policy-runtime/policies/op-acc-3.policy.ts`), y la razón es estructural:
su hecho no significa nada por sí solo. «jgomez ejecutó git push» no incumple;
incumple si esa misma cuenta ejerce **además** una función incompatible en la
ventana. Las siete primitivas contrastan UN hecho contra UN parámetro, y aquí
hacen falta tres cosas a la vez: clasificar por P-03, agrupar por cuenta y cruzar
contra los pares de P-02.

**Consecuencia que lo cambia todo:** sus requisitos **no se resuelven encadenando
evidencias**. Por eso `op.acc.3` puede marcar **100 % con dos evidencias en
`NO_EVALUABLE`**, que es exactamente lo que pasa hoy en el LDAP.

```
'op.acc.3.1'    → par ['desarrollo', 'operacion']
'op.acc.3.2'    → par ['autorizacion', 'control']  + la concurrencia de P-04
'op.acc.3.r1.1' → par ['configuracion', 'mantenimiento']
'op.acc.3.r1.2' → ['auditoria', '*']  (taxativo)
```

El agente emite `account_action` (regla 107001) con `usuario`, `accion` (el
binario de `exe=`), `ruta` (el primer `name=`), `veces` y `origen_dato`.
**Ninguno lleva `funcion`, y es deliberado**: clasificar es P-03 y lo hace el
motor. **Se emite un hecho por combinación distinta, no por ejecución** — una
pasada real produjo 3304 ejecuciones para 48 combinaciones.

> **Qué cuentas entran, exactamente.** El recolector se queda con el `auid` de
> cada registro y descarta **solo** `unset` y `4294967295`
> (`lib/opacc3-lib.sh:198`). **No hay ningún corte en 1000**: `root` con
> `auid=0` —alguien que inició sesión como root— **sí se observa y sí se
> clasifica**. Lo que queda fuera son los procesos de demonio, que no tienen
> `auid` porque nadie inició sesión para lanzarlos, y ahí el descarte es
> correcto: no hay persona a la que atribuir la acción.
>
> Y **qué acciones entran** lo decide la lista cerrada de `-w <binario> -p x` de
> `ensfacil_opacc3_act` (§1.3), no un barrido de todo `execve`.

**Las cinco evidencias del cruce degradan a la vez y por los mismos cuatro
motivos** (`lib/opacc3-lib.sh`, `ev_acciones_por_cuenta`, líneas 140-178):

| Situación | Estado | Causa |
|---|---|---|
| `ausearch` no está instalado | `NO_EVALUABLE` | `COLLECTION` (por defecto) |
| las reglas no están cargadas en el kernel (`auditctl -l` no lista `ensfacil_opacc3_act`) | `NO_EVALUABLE` | **`CONFIGURATION`** · el motivo dice *ejecuta `augenrules --load`* |
| `ausearch` falla con un rc distinto de 0 y de 1 | `NO_EVALUABLE` | `COLLECTION` |
| `ausearch` no devuelve **ni un registro** del log, ni siquiera sin filtrar por clave | `NO_EVALUABLE` | `COLLECTION` |

`rc=1` con salida vacía **no** degrada: es «no hay eventos», que es un hecho
legítimo. El cuarto caso es un control positivo y cierra una trampa real:
**`ausearch` sin `--input-logs` lee de stdin cuando no hay terminal**. Desde
consola funciona; desde cron devuelve «no matches» exactamente igual que si no
hubiera pasado nada.

Cron: `41 * * * *`, un solo script. **No tiene `score.py` ni watchdog.**

```bash
sudo mv /var/log/ensfacil/op_acc_3.json /var/log/ensfacil/op_acc_3.json.antes
sudo /usr/local/bin/ens_opacc3_collect.sh

jq -c 'select(.event=="collector_run")|{resultado,evidencias_cubiertas}' \
  /var/log/ensfacil/op_acc_3.json
```

Con auditd cargado y legible tienen que salir las siete.

### EV-01 · Desarrollo y operación en la misma cuenta
`op.acc.3.1` · MEDIO y ALTO · regla 107001

- **Mira.** Cada ejecución, **por una cuenta con `auid` asignado**, de uno de los
  binarios vigilados con la clave `ensfacil_opacc3_act` — la lista cerrada de
  `-w … -p x` de §1.3, no todo `execve`.
- **CUMPLE si.** Ninguna cuenta cuyo conjunto de acciones case a la vez con
  `desarrollo` y con `operacion` según P-03, siendo ese par incompatible en P-02.
- **Parámetros que la juzgan.** **P-03** (clasificar) y **P-02** (el par).
- **Si falta.** `NO_CUMPLE` nombrando la cuenta y las funciones que aúna
  (`jgomez (desarrollo + operacion)`). Sin P-02 o P-03, `NO_EVALUABLE`
  **nombrando el parámetro que falta**.
- **Cómo se cierra.** Separar identificadores, o sacar una de las dos funciones
  de esa persona. Si la plantilla no da, el ENS lo contempla con «siempre que sea
  posible», pero eso se acredita con justificación documentada y medida
  compensatoria, **no borrando la línea de P-02**.
- **LDAP.** Además de ejecuciones, mide **capacidades**: quién *puede*, no solo
  quién hizo. Cada capacidad viaja como un `account_action` con
  `naturaleza=capacidad`, `origen_dato=sistema|slapd-config|auditd|ldap`,
  `accion=capacidad:<qué puede hacer>` y `fundamento=<por qué se afirma>`. La
  razón es la misma que corrigió `op.acc.1` el 07/08: medir solo actividad hace
  que una máquina llegue al 100 % con el administrador todavía en `sudo`. Y aquí
  pesa más, porque hay una capa donde **la actividad no se registra en
  absoluto**. Hoy: 5 cuentas del sistema pueden operar el servicio, reescribir
  sus permisos y abrir su almacén por debajo.

### EV-02 · Autorización y control en la misma cuenta
`op.acc.3.2` · MEDIO y ALTO · regla 107001

- **Mira.** El mismo `account_action`.
- **CUMPLE si.** Ninguna cuenta con `autorizacion` y `control` a la vez,
  declarado ese par en P-02.
- **Cómo se cierra.** Quien concede un acceso o aprueba un cambio no puede ser
  quien después verifica que se hizo bien. **Esto casi nunca se arregla en la
  máquina**: se arregla en el procedimiento y se refleja en P-01.
- **Hoy en las dos máquinas: `NO_EVALUABLE`** —no se han observado acciones de
  autorización y control que cruzar— **y no bloquea**: `op.acc.3.2` cumple igual
  porque lo resuelve el evaluador de policy directamente.

### EV-03 · Concurrencia en tareas críticas
`op.acc.3.2` · MEDIO y ALTO · regla 107002, evento `critical_task_run`

- **Mira.** Para cada fila de `/etc/ensfacil/opacc3-tareas.tsv`, qué cuentas
  **distintas** aparecen en los registros de auditd que casan con su patrón. Una
  persona por tarea, no una ejecución por tarea.
- **CUMPLE si.** Cada tarea crítica **que se haya ejecutado** en el periodo la
  han ejecutado al menos tantas personas distintas como diga P-04. **Una tarea
  que nadie ejecutó no incumple**: exigir concurrencia a algo que no ocurrió
  sería acusar por una ausencia.
- **Parámetro que la juzga.** **P-04** dice **cuántas personas**; el fichero de
  la máquina dice **qué comando es** esa tarea aquí. El motor las une **por el
  nombre, en minúsculas**. Si los nombres no coinciden, la tarea se observa y no
  se juzga.
- **Y P-04 es UNO para todas las máquinas: la pantalla no tiene un valor por
  agente.** Medido el 12/08/2026: P-04 en el índice trae `cambio de
  cortafuegos`, `modificacion de privilegios`, `cambio de reglas de auditoria` e
  `instalacion de software en produccion`, que son **los nombres del fichero de
  `wazuh-real`** —allí casan los cuatro—; el `opacc3-ldap-tareas.tsv` de
  `ldap-adm` sigue con los cuatro del `.example` (`modificacion del directorio`,
  `cambio de contrasena en el directorio`, `volcado completo del directorio`,
  `parada o arranque del servicio`) y **ninguno figura en P-04**. Consecuencia
  exacta en esa máquina: sus tareas críticas se observan y **no se juzgan**. Se
  cierra añadiendo esas cuatro filas a P-04 con su número de personas, o
  renombrando las tareas del fichero a nombres que P-04 ya declare.
- **Si falta.** `NO_CUMPLE` listando la tarea, las personas observadas y las
  exigidas. Sin fichero de tareas: `NO_EVALUABLE` / `CONFIGURATION` («no hay
  ninguna tarea crítica declarada»). Sin P-04: `NO_EVALUABLE`.
- **Cómo se cierra.** Que el despliegue, el cambio de cortafuegos o la
  restauración los ejecute o los apruebe una segunda persona **con su propia
  cuenta**. `sudo -u otro` no vale: auditd registra el `auid` del que inició
  sesión.
- **Corrección importante respecto al `CUMPLIMIENTO.md` del runbook.** Ese
  documento dice que el veredicto de concurrencia «no tiene requisito donde
  aterrizar». **Ya no es cierto**: verificado en `op-acc-3.policy.ts` (la
  decisión se **funde** con la del cruce en `op.acc.3.2`, porque el motor casa
  decisiones con `find` por `requirementId` y dos decisiones sobre el mismo
  requisito harían que la segunda no se viera) y en `catalog.ts`, donde EV-03
  declara `requirements: ['op.acc.3.2']`. Declarar P-04 y el fichero de tareas
  **sí mueve el semáforo**.
- **Prueba de que está observando:** ejecuta a mano un comando de tu `.tsv` con
  tu cuenta, vuelve a correr el recolector y comprueba que aparece.

  ```bash
  jq -c 'select(.event=="critical_task_run")|{tarea,usuario}' \
    /var/log/ensfacil/op_acc_3.json
  ```
- **LDAP.** `NO_EVALUABLE` en los dos planos y **por motivos distintos**: sistema
  `COLLECTION` —el `CUMPLIMIENTO.md` de `op.acc.3-ldap` lo atribuye a que auditd
  no está instalado, y **eso ya no es cierto**: el 12/08/2026 `ldap-adm` tiene
  auditd corriendo con 17 reglas `ensfacil_opacc3_act` y 5 `ensfacil_opacc3_sec`
  cargadas, así que hay que volver a mirar el `motivo` de la última pasada antes
  de dar esta línea por buena—; directorio `CONFIGURATION`, porque
  `modifiersName` **solo conserva al último** que modificó cada entrada y lo
  sobrescribe el siguiente — es una **foto, no un rastro**.

### EV-04 · Configuración y mantenimiento en la misma cuenta (R1)
`op.acc.3.r1.1` · **solo ALTO** · regla 107001

- Mismo hecho, cambia el par: `configuracion` contra `mantenimiento`.
- **Cómo se cierra.** La cuenta que usa `visudo` o toca `/etc/sudoers` no debería
  ser la que corre `apt`/`dnf`.
- En MEDIO y BAJO el requisito sale `NO_APLICA` y no resta.
- **LDAP.** El par que importa es `configuracion` contra `almacenamiento`: quien
  reescribe las ACL de slapd no debería poder abrir `data.mdb` por debajo. Hoy
  son las mismas cinco cuentas.

### EV-05 · Cuentas de auditoría ejerciendo otras funciones (R1)
`op.acc.3.r1.2` · **solo ALTO** · regla 107001

- **Mira.** El mismo `account_action`, cruzado contra **P-05**.
- **CUMPLE si.** Ninguna cuenta declarada en P-05 tiene, en su conjunto de
  funciones, nada que no sea `auditoria`, `auditoría` o `supervision`.
- **Dos avisos concretos.** (1) El motor lo comprueba **por dos caminos**: el
  comodín `auditoria | *` de P-02 y la lista P-05 directamente; el segundo
  funciona sin el comodín, pero solo si la cuenta figura en P-05. (2) **La
  exclusión es por nombre literal**: si en P-03 llamas a esa función `audit` o
  `revision`, el motor no la reconoce como auditoría y **la propia actividad de
  auditar contará como «otra función»**. De P-05 el motor lee **solo la primera
  celda** de cada fila.
- **Cómo se cierra.** La cuenta de auditor solo lee.
- **LDAP.** Dos cosas, y la segunda es peor que la primera: (1) **no existe
  ninguna cuenta de auditoría del directorio** —ningún rol con lectura de ámbito
  general, ninguna base `accesslog`—; (2) `NO_EVALUABLE` / `CONFIGURATION`: de
  los roles que sí existen **no se pueden enumerar los miembros**, porque
  `cn=zimbra` no es legible por el socket local. Se sabe que
  `cn=admins,cn=zimbra` escribe sobre todo; no se sabe quién es. Se cierra con el
  bind de solo lectura en `/etc/ensfacil/opacc3-ldap.env`.

### EV-06 · Inventario de acciones por cuenta
`op.acc.3.1`, `op.acc.3.2` y `op.acc.3.r1.1` · MEDIO y ALTO · regla 107001

- **Mira.** El mismo `account_action`. Alimenta la variable de traza
  `cuentasObservadas`.
- **CUMPLE si.** Hay inventario. Es lo que un auditor pide cuando **no** hay
  alertas: la prueba de que se miró y de qué se vio.
- **Un `cuentasObservadas` a 0 no es un incumplimiento, pero convierte un CUMPLE
  en un CUMPLE vacío** — el motor lo dice literalmente en la razón: «No se ha
  observado ninguna acción en el periodo».
- **Si sale 0 en una máquina con actividad**, el orden en que hay que mirar,
  porque **no** es un corte por UID —el recolector solo descarta `auid` sin
  asignar, ver el aviso de arriba—:
  1. **¿Están cargadas las reglas?** `sudo auditctl -l | grep -c ensfacil_opacc3_act`
     (en `wazuh-real`, 12 el 12/08/2026). Con 0, la evidencia debería estar
     degradando con `CONFIGURATION`, no dando 0 cuentas.
  2. **¿Se han ejecutado esos binarios concretos?** La clave vigila una lista
     cerrada. Una máquina que se opera solo con `docker`, `ansible` o
     `kubectl` no produce ni un `account_action` aunque tenga tráfico todo el día.
     Se arregla añadiendo el `-w` **y** el indicador en P-03.
  3. **¿La operación pasa por procesos de demonio?** Un cambio hecho por un
     servicio no tiene `auid` y no se atribuye a nadie — correctamente.
- **LDAP.** Aquí no puede salir 0: las capacidades se leen de ficheros que
  siempre están. El `CUMPLIMIENTO.md` de `op.acc.3-ldap` cuenta **9 identidades**
  (5 sistema + 4 directorio); el informe del 12/08 dice **10 cuentas
  observadas**. Son dos recuentos distintos —el del recolector y el
  `cuentasObservadas` de la policy— y **no se ha comprobado cuál corresponde a
  qué**; el veredicto no depende del número.

### EV-07 · Acceso a la información de seguridad (R3)
`op.acc.3.r3.1` · regla 107003, evento `security_info_access`

- **Mira.** Accesos bajo la clave `ensfacil_opacc3_sec` a `/var/ossec/etc`,
  `/etc/audit` y `/var/log/audit`.
- **El requisito sale `NO_APLICA` en todos los niveles y NO resta.** El ENS lo
  define y no lo exige en ninguna tabla de aplicabilidad. Si `ensfacil_opacc3_sec`
  no está cargada, EV-07 degrada con causa `CONFIGURATION` — y tampoco puntúa.
- **Se recoge por valor operativo, no por obligación.** Un acceso inesperado a
  `/etc/audit` es un hallazgo aunque el ENS no lo pida.
- **Control positivo que hubo que añadir:** con `ausearch` instalado, reglas
  cargadas y **sin devolver una sola línea**, el latido declaraba EV-07 cubierta,
  sin hechos y sin degradación. El motor tenía permiso explícito para leer ese
  silencio como CUMPLE **sobre una fuente rota**.

---

## 5. op.acc.4 · Proceso de gestión de derechos de acceso

Cinco requisitos, **los cinco rigen desde BAJO**, sin refuerzos. La tabla sale de
`catalog/op-acc-4.ts` —que es lo que puntúa— y `op-acc-4.policy.ts` coincide:

| Requisito | Evidencias que lo acreditan |
|---|---|
| `op.acc.4.1` | EV-01, EV-02 |
| `op.acc.4.2` | EV-02, EV-03, EV-08 |
| `op.acc.4.3` | **EV-07** (única) |
| `op.acc.4.4` | EV-03, EV-04, EV-05 |
| `op.acc.4.5` | EV-06 |

**EV-02 aparece en dos requisitos y EV-07 es la única de `op.acc.4.3`.**

**Es el primer control que nace entero en el modelo nuevo.** El agente no emite
ningún veredicto: solo hechos crudos. Por eso **no tiene `score.py` ni
watchdog** — no hay veredicto que calcular en la máquina. Cron: `17 * * * *`, un
solo script. La cadena completa:

| Ev | Hecho | Regla | Primitiva | Se juzga contra | Requisito |
|---|---|---|---|---|---|
| EV-01 | `default_deny_violation` | 107101 | `NINGUNO_FUERA_DE_LISTA` | **P-01**, col. `recurso` | 4.1 |
| EV-02 | `privilege_grant` | 107102 | `CONFORME_A_TABLA` | **P-01**, `rol` → `recurso` + `acceso` | 4.1, 4.2 |
| EV-03 | `privileged_group_member` | 107103 | `TODOS_EN_LISTA` | **P-01**, col. `rol` | 4.2, 4.4 |
| EV-04 | `permission_change` | 107104 | `NINGUNO_FUERA_DE_LISTA` | **P-02**, col. `cuenta` | 4.4 |
| EV-05 | `permission_review` | 107105 | `ANTIGUEDAD_MAXIMA` | **P-03** (días) | 4.4 |
| EV-06 | `remote_access` | 107106 | `NINGUNO_FUERA_DE_LISTA` | **P-05** (lista) | 4.5 |
| EV-07 | `sensitive_access` | 107107 | `CONFORME_A_TABLA` | **P-07**, `recurso` → `perfiles` | 4.3 |
| EV-08 | `excessive_privilege` | 107108 | `TODOS_EN_LISTA` | **P-01**, col. `rol` | 4.2 |

**Solo tres evidencias pueden cumplir por silencio**: EV-01, EV-04 y EV-06, las
de `NINGUNO_FUERA_DE_LISTA`. Son barridos, y no encontrar nada es el resultado
normal de una máquina sana. **Las otras cinco afirman algo sobre los hechos
observados, así que sin hechos no acreditan aunque el latido esté confirmado.**

```bash
sudo mv /var/log/ensfacil/op_acc_4.json /var/log/ensfacil/op_acc_4.json.antes
sudo /usr/local/bin/ens_opacc4_collect.sh

# los hechos vienen SIN veredicto: "estado": null en todos
jq -c 'select(.event!="evidence_state" and .event!="collector_run")
       |{event,evidence_id,estado}' /var/log/ensfacil/op_acc_4.json
```

Si alguno trae `CUMPLE` o `NO_CUMPLE`, el agente corre código anterior al 06/08 y
hay **dos veredictos sobre el mismo hecho**.

**Los sujetos a declarar en P-01 son exactamente los que el agente emite:**

```bash
jq -r '(select(.event=="privilege_grant" or .event=="excessive_privilege")|.sujeto),
       (select(.event=="privileged_group_member")|.usuario)' \
  /var/log/ensfacil/op_acc_4.json | sort -u
```

Un `%grupo` es un sujeto legítimo: sudoers concede a grupos y la matriz declara
perfiles, no personas. Y **`root` sale siempre**: es miembro primario del grupo
`root` y tiene `ALL=(ALL:ALL) ALL` en `/etc/sudoers`. Si `root` no está en P-01,
EV-03 y EV-08 no cumplen.

### EV-01 · Denegación por defecto
`op.acc.4.1` · regla 107101

- **Mira.** Tres fuentes independientes. **Cortafuegos**: `nft -a list chains`
  buscando `policy accept` en cadenas `type filter hook input` o `forward` y, si
  `nft` **no rinde**, `iptables -S` buscando `-P INPUT ACCEPT` / `-P FORWARD
  ACCEPT`. **Recursos compartidos**: cada sección de `/etc/samba/smb.conf` con
  `guest ok = yes` o `public = yes`, salvo `[global]`. **Servicios anónimos**:
  `anonymous_enable=YES` en `/etc/vsftpd.conf`. Emite **un hecho por desviación**
  y no emite nada cuando todo está cerrado.
- **CUMPLE si.** Ninguna desviación; o el `recurso` de cada desviación figura en
  la columna `recurso` de P-01, declarado como excepción.
- **Parámetro que la juzga.** **P-01**, `NINGUNO_FUERA_DE_LISTA` sobre la columna
  `recurso`.
- **Si falta.** `NO_CUMPLE` nombrando el recurso (`cortafuegos`, el share por su
  nombre, `vsftpd`). `NO_EVALUABLE` / `COLLECTION` si **no hay ninguna fuente
  legible**. `NO_EVALUABLE` / `CONFIGURATION` si hay desviaciones y P-01 está
  vacía.
- **El criterio es haber LEÍDO el listado, no que el binario exista.** Con un
  `nft` mudo —lo normal en una máquina con iptables-legacy— el cortafuegos
  abierto desaparecía del informe y EV-01 seguía declarándose cubierta. Corregido
  el 10/08/2026.
- **LDAP.** Añade las ACL de slapd, buscando (a) una base **sin ninguna ACL**
  —que hereda el acceso por defecto de slapd, lectura para todos— y (b) cualquier
  cláusula que conceda `compare` o más a `*` o a `anonymous`. Hoy: 5 hechos, 4
  del cortafuegos y uno del directorio, el `{10}to attrs=entry … by * read`, que
  sale como `recurso=ldap:datos:attrs:entry`. **La forma correcta de cerrarlo es
  declararlo en P-01, no tocar la ACL**: quitar `entry` rompe el acceso legítimo
  de todo lo demás. Lo que **no** se emite nunca: `rootdse` ni `subschema` — los
  lleva `by * read` toda instalación de OpenLDAP porque el protocolo exige que un
  cliente pueda descubrir el servidor antes de autenticarse, y **un hallazgo que
  siempre está y siempre se declara deja de leerse; con él dejan de leerse los
  que sí importan**. Salen medidos como `privilege_grant` de EV-02, así que el
  auditor los ve.

### EV-02 · Privilegios efectivos
`op.acc.4.1` y `op.acc.4.2` · regla 107102

- **Mira.** `/etc/sudoers` y cada fichero de `/etc/sudoers.d`, descartando
  comentarios, líneas vacías, `Defaults`, alias y directivas (`@includedir`,
  `#include`). Un hecho por concesión: `sujeto` (la primera palabra, cuenta o
  `%grupo`), `recurso=sudo`, `acceso` (el resto de la línea) y `origen_dato`.
- **CUMPLE si.** Cada `sujeto` tiene fila en P-01 con ese mismo nombre en la
  columna `rol`, y esa fila declara un `recurso` y un `acceso` que casan con lo
  observado. **Fila a fila y celda a celda.**
- **Parámetro que la juzga.** **P-01**, `CONFORME_A_TABLA` con clave `sujeto` y
  ejes `recurso` y `acceso`.
- **Si falta.** `NO_CUMPLE` cuando la fila existe y no casa —**el caso típico: la
  matriz dice un comando concreto y sudoers concede `ALL`**—. `NO_EVALUABLE` /
  `CONFIGURATION` cuando el sujeto **no tiene fila**, o la tiene con `recurso` y
  `acceso` vacíos: no hay incumplimiento demostrado, hay una decisión que nadie
  ha escrito. `NO_EVALUABLE` / `COLLECTION` si no se puede leer ni `/etc/sudoers`
  ni `/etc/sudoers.d`.
- **Una celda vacía en P-01 no es «cualquier cosa vale»**: es un eje sin declarar
  y deja la evidencia en gris. **Celda vacía = ese eje no se declara y no se
  juzga**; una fila que no declara ni uno de los ejes contrastados no acredita
  nada.
- **La comparación es literal.** Contra una lista autorizada **no** se normalizan
  mayúsculas: `Admin` no es `admin`. En Linux son dos cuentas distintas, y
  tratarlas como la misma autorizaría a quien nadie autorizó.
- **Hoy `NO_CUMPLE` en `wazuh-real`**, y es el que más pesa de su `op.acc.4`.
  Se cierra enumerando los `privilege_grant` **sobre la ventana entera**, no
  sobre la última pasada, y declarando las combinaciones legítimas. Lo que quede
  fuera después de eso es un privilegio que sobra en la máquina.
- **LDAP.** Emite además un hecho por cada **(sujeto, base de datos, nivel)**
  distinto de las ACL, con `reglas` y `reglas_lista`. Agregado y no una ACL por
  hecho porque el grupo de administración aparece con `write` en **once** ACL de
  la misma base: once hechos idénticos obligarían a once filas iguales en P-01.
  Los cuatro `recurso` del directorio son `ldap:datos`, `ldap:frontend`,
  `ldap:monitor` y `ldap:config` — este último **no aparece hoy y no es un
  fallo**: su única ACL es `{0}to * by * none`, y **una denegación no es un
  privilegio que autorizar**.

  **El defecto que impedía cumplir, corregido el 12/08/2026.** El agente emitía
  el `by <quién>` tal cual (`dn.children=cn=admins,cn=zimbra`), y **ese sujeto no
  se podía escribir en P-01**: la columna `Rol` es `identifier` y rechaza las
  comas. Sin fila que casar, EV-02 salía `NO_CUMPLE` de forma **permanente**. No
  era fallo del auditor ni de la máquina: **el agente estaba emitiendo un nombre
  que el parámetro no puede expresar.** Hoy el sujeto se reduce a su **RDN**
  (`cn=admins`), se sanea (espacio, tabulador, coma, `|` y `/` pasan a `_`) y el
  DN completo viaja en **`sujeto_dn`**, que es lo que cierra la traza hasta la
  cláusula exacta. Si dos sujetos de ramas distintas colisionan en el mismo RDN,
  los dos pasan a la **forma larga** (`cn=admins_cn=zimbra`), EV-02 y EV-08
  degradan con causa `EVIDENCE` nombrando el RDN en disputa, y el latido lo dice
  en `sujetos_ambiguos`. **Se falla hacia el rojo, nunca hacia el verde.**

  Y la lectura amplia del GAL —25 atributos personales legibles por `users`— **no
  se emite como privilegio excesivo**: `users` no es `anonymous` (comprobado con
  un bind anónimo, que no devuelve ninguna entrada), es una decisión de negocio
  corriente, y marcarlo pondría en rojo el funcionamiento normal de un servidor
  de correo. Se emite como `privilege_grant` y se declara: `users | ldap:datos |
  read`.

### EV-03 · Pertenencia a grupos privilegiados
`op.acc.4.2` y `op.acc.4.4` · regla 107103

- **Mira.** Los grupos de `OPACC4_GRUPOS_PRIVILEGIADOS`
  (`root,sudo,wheel,adm,admin,shadow,disk`) en `/etc/group`, **y además la
  pertenencia primaria** vía el gid de `/etc/passwd` — una cuenta cuyo grupo
  primario es `root` no aparece en la cuarta columna de la línea de `root`, y
  omitirla dejaría fuera el caso más grave. Un hecho por miembro, con `grupo`,
  `gid` y `pertenencia` (`primaria` o `secundaria`).
- **CUMPLE si.** Todo `usuario` observado figura en la columna `rol` de P-01,
  **incluidos los del sistema**: en un Ubuntu típico salen `root` (primaria) y
  los miembros de `adm`, normalmente `syslog` y el primer usuario.
- **Parámetro que la juzga.** **P-01**, `TODOS_EN_LISTA` sobre la columna `rol`.
  **No P-06** — qué grupos se observan lo fija el `.env`, que es *dónde mirar* y
  no política.
- **Si falta.** `NO_CUMPLE` nombrando al usuario. `NO_EVALUABLE` / `COLLECTION`
  si no se puede leer `/etc/group`. **Sin hechos no acredita**: es
  `TODOS_EN_LISTA`.
- **Cómo se cierra.** O se saca a la persona del grupo, o se declara su nombre en
  P-01. **Las dos son válidas; lo que no vale es ninguna de las dos.**
- **Hoy en el LDAP: `NO_CUMPLE` por dos eventos del 11/08 a las 11:25 UTC**,
  cuando `ldapcopy` y `user` todavía estaban en `sudo` sin figurar en P-01. Ya
  está remediado en la máquina. **No hay que tocarlo**: cuando esos dos eventos
  salgan de la ventana —el 10 de septiembre— pasa a conformar solo. Declararlas
  autorizadas hoy subiría el número maquillando justo lo que se acaba de
  corregir.

### EV-04 · Cambios de permisos, con su actor
`op.acc.4.4` · regla 107104

- **Mira.** `ausearch --input-logs -k ensfacil_opacc4_perms -ts today -i`.
  Correlaciona el `type=SYSCALL` (de donde sale `auid`, **el actor**) con el
  `type=PATH` del mismo evento (de donde sale la ruta) y emite **un hecho por
  combinación distinta de actor, operación y recurso**, con `veces`: una pasada
  real produjo 3117 registros para cuatro combinaciones.
- **CUMPLE si.** Todo `actor` observado figura en la columna `cuenta` de P-02.
  **Se contrasta quien ejecuta el cambio, no sobre quién recae**: confundirlos
  daría por buena una escalada en la que la víctima está autorizada y quien la
  provoca no.
- **Parámetro que la juzga.** **P-02**, `NINGUNO_FUERA_DE_LISTA` sobre la columna
  `cuenta`.
- **Si falta.** `NO_CUMPLE` nombrando al actor. `NO_EVALUABLE` / `CONFIGURATION`
  si las reglas no están cargadas en el kernel (el motivo dice literalmente
  *ejecuta `augenrules --load`*) o si P-02 está vacía. `NO_EVALUABLE` /
  `COLLECTION` si `ausearch` no está, falla, o devuelve vacío **y además** no
  devuelve ningún registro sin filtrar: una fuente que no rinde datos no puede
  acreditar un silencio.
- **Es la evidencia que más cara paga un descuido de auditd**, porque **cumple
  por ausencia**. Por eso lleva dos redes: contrasta las vigilancias declaradas
  en el fichero de reglas contra las que `auditctl -l` tiene cargadas, y si
  `ausearch` devuelve registros con usuario identificado pero el analizador no
  extrae ni un hecho, degrada con causa `EVIDENCE` **en vez de callarse**. Las
  dos sacan la evidencia de `evidencias_cubiertas`.
- **Un `type=CONFIG_CHANGE` ya no cuenta como cambio de permisos.** Al cargar las
  reglas, auditd registra un evento por watch añadido con el `auid` de quien
  ejecutó `augenrules --load`: el recolector emitía **el propio acto de empezar a
  vigilar** como acceso a un recurso vigilado, con nombre y apellidos. **Un falso
  hallazgo es tan grave como un falso CUMPLE.**
- **LDAP.** El plano directorio queda cubierto por
  `-w /opt/zimbra/data/ldap/config -p wa -k ensfacil_opacc4_perms`, que da el
  **actor UNIX** que escribe el `.ldif`. La otra vía —el overlay `accesslog` de
  slapd, que daría el DN que hace un `ldapmodify`— **no está cargada**, y ninguna
  sustituye a la otra. **Lo que no se hace, y merece decirse**: emitir un
  `permission_change` con `actor=desconocido` a partir de la fecha de
  modificación de los `.ldif`. `desconocido` no estará nunca en P-02, así que el
  hecho fabricaría un `NO_CUMPLE` permanente sobre una pregunta que en realidad
  no se ha respondido. **Un gris honesto vale más que un rojo inventado.**

### EV-05 · Revisión periódica de permisos
`op.acc.4.4` · regla 107105

- **Mira.** `/etc/ensfacil/opacc4-revisiones.tsv`. Descarta líneas en blanco y
  comentarios, ordena a la inversa y emite **solo la fila más reciente**:
  `fecha`, `alcance`, `responsable`. Volcar el histórico entero añadiría ruido
  sin cambiar el veredicto.
- **CUMPLE si.** Consta una revisión y su `fecha` no es más antigua que los días
  de P-03.
- **Parámetro que la juzga.** **P-03**, `ANTIGUEDAD_MAXIMA`, campo `fecha`. La
  unidad la da el tipo del parámetro (`duration_days`), no una declaración
  aparte. Y mide **contra el reloj**, no contra un número que traiga el agente ya
  restado: con el **instante** como hecho, la antigüedad crece sola hasta que el
  veredicto se cae, que es lo que un auditor espera.
- **Si falta.** `NO_CUMPLE` cuando la revisión más reciente supera el plazo, con
  su antigüedad en horas en el motivo. `NO_EVALUABLE` / `CONFIGURATION` cuando el
  fichero **no existe** (*no consta ningún registro de revisión de permisos*) o
  existe y **no tiene ninguna fila** (*existe pero no tiene ninguna revisión
  anotada*) — son dos motivos distintos a propósito. `NO_EVALUABLE` / `EVIDENCE`
  si la fecha no se puede leer como marca de tiempo.
- **Es la única evidencia existencial del control**: le basta un hecho lo bastante
  reciente y por eso mismo **nunca cumple por ausencia**. No haber revisado nunca
  no puede salir en verde por falta de datos.
- **Hoy `NO_EVALUABLE` en `wazuh-real`**, y con el matiz que corrige al informe:
  **el instalador NO crea este fichero** —`install.sh` de
  `op.acc.4-proceso-de-gestion-de-derechos-de-acceso` no lo menciona ni una vez—.
  El que hay en `wazuh-real` (832 bytes, 06/08/2026) lo creó alguien a mano
  durante el despliegue, y contiene **solo cabecera de comentarios, cero filas de
  datos**, con una nota explícita: *«SIN NINGUNA FILA A PROPÓSITO»*. Comprobado en
  la máquina el 12/08/2026. Así que el motivo real es *«existe pero no tiene
  ninguna revisión anotada»*, no *«no consta ningún registro»* — son dos motivos
  distintos a propósito y este es el segundo. **No es un fallo técnico: falta el
  acto de la organización.** Es lo más barato de cerrar de todo el informe.

### EV-06 · Accesos remotos
`op.acc.4.5` · regla 107106

- **Mira.** El log de autenticación —`/var/log/auth.log` o journald— filtrando
  `Accepted password|publickey|keyboard-interactive`. De cada línea saca
  `usuario`, `origen`, `puerto` y `metodo`, con `canal=ssh`. Lee **solo lo
  nuevo** desde la pasada anterior, por offset o por cursor.
- **CUMPLE si.** Todo `usuario` que entra figura en P-05. **Lo que se exige no es
  que todos los autorizados entren, sino que nadie más lo haga**: por eso la
  primitiva es `NINGUNO_FUERA_DE_LISTA` y no `TODOS_EN_LISTA`.
- **Parámetro que la juzga.** **P-05**, campo `usuario`. Una cuenta por línea,
  **sin barras**.
- **Si falta.** `NO_CUMPLE` nombrando la cuenta. `NO_EVALUABLE` /
  `CONFIGURATION` si P-05 está vacía. `NO_EVALUABLE` / `COLLECTION` si no hay
  ninguna fuente legible.
- **La primera pasada no ve accesos remotos**: el lector arranca al final del
  fichero, porque volcar el histórico con fecha de hoy sería inventar historia.
  Empieza a rendir en la segunda pasada.
- **Sacar a alguien de P-05 no le impide entrar, solo hace que el motor lo diga.**
- **LDAP.** Añade los binds del log de slapd, correlacionando `ACCEPT from IP=…`
  (origen) con `BIND dn="…"` (identidad) por su `conn=`. **Solo los binds que
  salieron bien**: un bind fallido deja exactamente las mismas líneas `BIND` y
  solo se distingue por su `RESULT tag=97 err=0`; emitirlo pondría delante de
  P-05 a cuentas que **no** entraron. El `usuario` del plano directorio es un
  **DN completo** y **aquí no se aplica la normalización a RDN**, porque P-05 es
  una lista y su columna no valida contra `/^[^\s|,]+$/` — pero **hay que
  escribir cada DN en su propia línea**, o el motor lo parte por comas en tres
  elementos que no casan con nada. Hoy `NO_EVALUABLE` / `CONFIGURATION` en el
  plano directorio (falta `stats`), y **por eso EV-06 entera queda fuera de
  `evidencias_cubiertas` aunque el plano sistema funcione**: declararla cubierta
  habiendo leído solo el log de ssh convertiría en «nadie accedió sin
  autorización» un silencio que significa «no hemos mirado los binds».

### EV-07 · Accesos a recursos de necesidad de conocer
`op.acc.4.3` · regla 107107 · **única evidencia de su requisito**

- **Mira.** `ausearch --input-logs -k ensfacil_opacc4_kn -ts today -i`. De cada
  `type=SYSCALL` emite `usuario` (el `auid`, o el `uid` si no hay), el `recurso`
  (`name=`) y el `perfil`, que es el **grupo primario** de la cuenta (`id -gn`):
  la aproximación observable a «perfil» que un Linux ofrece sin inventar nada.
- **CUMPLE si.** Cada `recurso` accedido tiene fila en P-07 y el `perfil` de
  quien accedió casa con la columna `perfiles`. **Lo que se juzga no es si el
  permiso técnico existe** —existe, por eso se pudo acceder— **sino si el perfil
  tiene justificación declarada. Es la diferencia entre poder y deber.**
- **Parámetro que la juzga.** **P-07**, `CONFORME_A_TABLA` con clave `recurso` y
  eje `perfiles` ↔ `perfil`.
- **Si falta.** `NO_CUMPLE` cuando el perfil no casa. `NO_EVALUABLE` /
  `CONFIGURATION` cuando el recurso accedido **no tiene fila** en P-07, o la
  tiene con `perfiles` vacío, o **las reglas de auditd no están cargadas**.
  `NO_EVALUABLE` / `COLLECTION` si `ausearch` no está o no rinde.
- **Hacen falta las dos mitades**: la fila `recurso | perfiles` en P-07 **y** una
  regla `-w <ruta> -p r -k ensfacil_opacc4_kn` por cada ruta, con
  `augenrules --load` detrás. Una ruta en P-07 que auditd no vigila es un hueco
  silencioso; una ruta vigilada que no está en P-07 produce hechos que el motor
  no sabe contra qué contrastar.
- **No puede cumplir por silencio.** `CONFORME_A_TABLA` afirma algo sobre los
  hechos observados: en una máquina donde nadie toca los recursos de P-07 durante
  la ventana, EV-07 se queda en gris y `op.acc.4.3` no cumple, **porque es la
  única evidencia de ese requisito**. Es consecuencia estructural de la
  primitiva, no un fallo de configuración.
- **El fallo que hubo que cerrar el 12/08/2026.** El recolector daba el plano por
  medido con un `grep -q ensfacil_opacc4_kn`, que pasaba porque **dos** de ocho
  vigilancias estaban cargadas, mientras seguía ciego a las seis restantes —entre
  ellas los ficheros de la base de datos del directorio, **el** recurso de
  necesidad de conocer de esa máquina—. Hoy compara declarado contra cargado y
  degrada nombrando la ruta que falta.
- **Hueco anotado, no cerrado:** auditd escribe a veces el `name=` relativo
  (`db`) o solo el padre del fichero tocado, y ese `recurso` no casa con ninguna
  fila de P-07. Resolverlo contra el `cwd=` **no vale** —cuando el syscall es
  relativo a un descriptor de directorio sale una ruta absoluta y falsa—, así que
  se deja el nombre tal cual.
- **LDAP.** Además, las búsquedas del log de slapd que **piden algún atributo
  reservado** (`OPACC4LDAP_ATRIBUTOS_RESERVADOS`: `userPassword`,
  `zimbraAuthTokenKey`, `zimbraPreAuthKey`, `zimbraIsAdminAccount`…), con el
  `perfil` = **el padre del DN** que hizo el bind. Hoy `NO_EVALUABLE` /
  `CONFIGURATION` en el plano directorio: falta `stats`.

### EV-08 · Privilegios por encima del mínimo
`op.acc.4.2` · regla 107108

- **Mira.** Dos cosas. En sudoers, las concesiones **sin restricción de
  comandos** (línea que acaba en `ALL` o en `(ALL)`/`(ALL:ALL) ALL`), con
  `motivo_tecnico=sudo_sin_restriccion_de_comandos` —o `sudo_total_sin_contrasena`
  si además llevan `NOPASSWD`—. Y en `/etc/passwd`, las cuentas por debajo de
  `UID_MIN` (leído de `/etc/login.defs`, 1000 si no se puede) que no sean `root`
  y tengan shell interactiva (ni `nologin`, ni `false`, ni `sync`), con
  `motivo_tecnico=cuenta_de_sistema_con_shell_interactiva`.
- **CUMPLE si.** Todo `sujeto` observado figura en la columna `rol` de P-01. **Un
  privilegio excesivo es un HECHO, no un veredicto**: el responsable puede
  haberlo autorizado.
- **Parámetro que la juzga.** **P-01**, `TODOS_EN_LISTA` sobre `rol`, campo
  `sujeto`.
- **Si falta.** `NO_CUMPLE` nombrando al sujeto y su motivo técnico.
  `NO_EVALUABLE` / `COLLECTION` si no se puede leer ni sudoers ni `/etc/passwd`.
- **En cualquier Ubuntu quedan al menos `root` y `%sudo`, que traen
  `ALL=(ALL:ALL) ALL` de fábrica: hay que declararlos.**
- **El criterio que este control tiene que saber ver.** Lo que define un
  privilegio excesivo es el **conjunto de comandos**, no la contraseña.
  `%zimbra ALL=NOPASSWD:/opt/zimbra/libexec/zmstat-fd *` está acotado a un
  binario y es proporcionado: sale como `privilege_grant` de EV-02 con
  `sin_contrasena=si`, **no** como privilegio excesivo.
  `ldap-zimbra.adm ALL=(ALL) NOPASSWD:ALL` sí, y **lo puso el propio equipo de
  ENSFácil para desplegar**: incumple mínimo privilegio mientras exista y así
  debe salir. Se retira con `sudo rm /etc/sudoers.d/dioni-ensfacil`. **Que el
  control delate a quien lo instaló es la prueba de que no hace trampas**: un
  recolector con una excepción para sí mismo no serviría de nada, porque el
  auditor no podría creerse ninguno de los demás hallazgos.
- **LDAP.** Añade tres comprobaciones del directorio: escritura a un sujeto
  amplio, `userPassword` legible por encima de `auth`, y la base de configuración
  sin ACL propia. Hoy **cero hechos en el plano directorio, y eso es un
  resultado, no un hueco**: ninguna ACL concede escritura a un sujeto amplio,
  `userPassword` no pasa de `auth` y `cn=config` está cerrada.

---

## 6. Qué NO se puede llevar al 100 %, y por qué

Tres naturalezas distintas, y confundirlas es lo que hace perder tiempo.

### 6.1 Artefacto del entorno de prueba — **desaparece en producción**

Nada de esto es un límite del producto ni de la medida. Son cosas que en un
despliegue real ya están resueltas o se resuelven solas.

| Qué | Dónde muerde | Por qué es artefacto |
|---|---|---|
| **Documentos que nadie ha escrito** | `op.acc.1.5` y `op.acc.1.r1.1`, en las dos máquinas | Un cliente con obligación ENS ya tiene su Política de identificación y su Procedimiento de singularización. Aquí las atestaciones de `P-ATT` llevan «PENDIENTE DE SUSTITUIR» en el texto |
| **Un solo administrador** | `op.acc.3` de `wazuh-real`, 50 % | La cuenta `dioni` ejerce mantenimiento, operación, desarrollo, auditoría **y** configuración. El LDAP marca 100 % en el mismo control porque sus diez cuentas reparten funciones |
| **El `NOPASSWD` de despliegue** | `op.acc.4` EV-08 del LDAP | `/etc/sudoers.d/dioni-ensfacil` lo puso el equipo para desplegar. Se borra cuando termine el despliegue |
| **Dos eventos del 11/08 dentro de la ventana** | `op.acc.4` EV-03 del LDAP | Ya remediado en la máquina. **Se cierra solo el 10 de septiembre**, cuando caduquen |

> **Impacto real de las atestaciones, calculado:** las dos primeras sostienen dos
> de los ocho requisitos de `op.acc.1` **en las dos máquinas**. Sin ellas el
> control no está en 75 %: está en **50 %** (4 de 8). En un laboratorio lo
> honesto es dejar el «PENDIENTE» visible y **no contar esos requisitos como
> ganados** al presentar resultados.

**Y el caso del administrador único no tiene solución técnica.** En una máquina
administrada por una persona no hay configuración que lo arregle: o hay una
segunda persona que audite, o es un **riesgo aceptado y documentado**, compensado
con revisión externa de los registros. **Forzar el número aquí sería mentir.**

### 6.2 Operación estándar pendiente — **se cierra con trabajo normal**

Cosas que sí hay que hacer, que no son del producto, y que están ordenadas por
retorno:

| # | Qué | Cierra | Coste |
|---|---|---|---|
| 1 | **Anotar una revisión de permisos** en `/etc/ensfacil/opacc4-revisiones.tsv` de `wazuh-real` | `op.acc.4.4` | una línea, **después** de revisar |
| 2 | **`olcLogLevel: stats`** en `cn=config` del directorio | `op.acc.2.2`, `op.acc.2.3` y EV-07 de `op.acc.4` | una operación · **la de más retorno de todo el informe** |
| 3 | **Completar P-01 de `op.acc.4`** en `wazuh-real` sobre la ventana entera — **no está vacío: el 12/08 tenía 22 filas**, y EV-02 sigue en `NO_CUMPLE`, así que lo que falta es alguna combinación observada que no está declarada (o un privilegio que sobra en la máquina) | `op.acc.4.1` y `.2` | decisión del responsable |
| 4 | **Separar identidades administrativas** en `wazuh-real` | el único incumplimiento medido de su `op.acc.1` | §2, EV-06 |
| 5 | **Cuenta LDAP de solo lectura** | `op.acc.1` del directorio al 100 % · EV-04 y EV-06 | crear la cuenta, dos líneas en el `.env` |
| 6 | **TLS en slapd** + `olcSecurity: ssf=128` | el último requisito de `op.acc.2` del directorio | ventana de servicio · **certificados primero** |
| 7 | **Generar y cargar las reglas `ensfacil_opacc2`/`_obj`** en el servidor LDAP, desplegando allí el runbook `op.acc.2-requisitos-de-acceso` | `op.acc.2` EV-06 (solo cuenta en ALTO) | **auditd ya está instalado y corriendo, ver abajo** |
| 8 | **Portar el mecanismo de política local** a EV-05 y EV-06 de `op.acc.2-ldap` | dos evidencias clavadas | **trabajo de producto**, luego del responsable |

> **Corrección del punto 7 respecto al informe del 12/08.** El informe y los
> `CUMPLIMIENTO.md` de `op.acc.2-ldap` y `op.acc.3-ldap` dicen que hay que
> *instalar auditd* en el servidor LDAP. **Ya está instalado**: comprobado en
> `ldap-adm` el 12/08/2026 —`auditd 1:3.0.7-1build1`, `auditctl -s` con
> `pid 382`, y 37 reglas `ensfacil_*` cargadas (17 `opacc3_act`, 5 `opacc3_sec`,
> 8 `opacc4_kn`, 7 `opacc4_perms`)—. Lo que falta es **solo** la maquinaria de
> `op.acc.2`: no hay ni una regla con las claves `ensfacil_opacc2` ni
> `ensfacil_opacc2_obj`.

> **Aviso sobre el punto 3.** El informe dice que EV-07 de `op.acc.4` está gris
> en `wazuh-real` «porque falta declarar P-07». **P-07 no está vacío**: leído del
> índice el 12/08/2026 trae **ocho filas** —`/etc/shadow | root,dioni`,
> `/etc/gshadow | root,dioni`, `/root/.ssh/authorized_keys | root`,
> `/etc/sudoers.d | root`, `/etc/audit | root` y tres del servidor Zimbra
> (`/opt/zimbra/conf/localconfig.xml`, `/opt/zimbra/data/ldap/config`,
> `/opt/zimbra/data/ldap/mdb/db`)—. Dos cosas, medidas las dos:
>
> - De las **cinco rutas Linux declaradas, solo tres están vigiladas** con la
>   clave que EV-07 lee: `auditctl -l` en `wazuh-real` lista tres
>   `ensfacil_opacc4_kn` (`/etc/shadow`, `/etc/gshadow`,
>   `/root/.ssh/authorized_keys`). `/etc/sudoers.d` y `/etc/audit` están en P-07
>   y **no** bajo esa clave —`/etc/sudoers.d` se vigila con
>   `ensfacil_opacc4_perms`, que es de EV-04, y `/etc/audit` con
>   `ensfacil_opacc3_sec`—, así que son el hueco silencioso que describe §5: se
>   declaran y no se miran. Se cierra añadiendo su `-w … -p r -k
>   ensfacil_opacc4_kn` y recargando.
> - La otra explicación, compatible con el código, es la estructural de §5:
>   `CONFORME_A_TABLA` **no cumple por silencio**, y si nadie ha leído esos
>   ficheros en la ventana no hay hechos que contrastar.
>
> **No se ha confirmado en el panel cuál de las dos manda hoy**, así que declarar
> más filas en P-07 puede no mover nada. Mira primero el `motivo` de la
> evidencia.

Dos precisiones sobre el orden, las dos verificadas:

- **`olcSecurity: ssf=128` antes de configurar TLS deja fuera a los propios
  servicios de Zimbra**, que conectan por `ldap://`. Certificados →
  `ldaps://636` → comprobar que Zimbra sigue funcionando → exigir SSF.
- **`stats` no es gratis**: slapd registra una línea por operación. Mirar la
  rotación de `logrotate` y el espacio de `/var/log` antes de habilitarlo. Es la
  razón por la que Zimbra lo trae apagado.

Y el punto 8 merece nombre propio, porque **no es «falta la decisión del
responsable»: es que aunque la escriba, el recolector no la vería**. Las
degradaciones de EV-05 y EV-06 de `op.acc.2-ldap` remiten a P-05/P-06/P-09 de la
pantalla, y ese recolector **no lee el índice del plugin**. Un punto ciego
permanente disfrazado de «falta un dato de configuración» es peor que uno
declarado: parece que la organización tiene deberes pendientes cuando quien no
puede mirar es el agente. Es exactamente el defecto que se corrigió el 12/08 para
EV-04 y EV-07, pasándolas a juzgar contra ficheros locales.

### 6.3 Límite del producto — **no desaparece · empeora a escala**

**1 · El truncamiento a 10.000 hechos.** El motor solo trae del índice los 10.000
hechos más recientes de la ventana:

```
El veredicto se ha calculado sobre 10.000 hechos de 20.052
```

Si el agente emite más, **los más antiguos no se cuentan**, y el porcentaje sale
**mejor que la realidad**: un hallazgo anterior al corte no existe para el motor.
Cuando ese aviso aparece, el número **es un mínimo, no un resultado**, y no se
puede afirmar que se han auditado los 30 días completos. Hoy afecta a `op.acc.3`
y `op.acc.4` de `wazuh-real` (20.052 y 12.371 hechos), **siendo una máquina
tranquila**. Se arregla reduciendo lo que emite el agente —un hecho por
observación distinta, no uno por repetición— o acortando el periodo de
evaluación, que cambia lo que se audita. **Lo primero es trabajo de producto y
hay que hacerlo antes de que un cliente lo vea.**

**2 · `op.acc.1` no llega al 100 % con evidencia técnica en ningún nivel.**
`op.acc.1.5` (eIDAS) y `op.acc.1.r1.1` (singularizar a la persona) declaran
`evidenceIds: []`: ningún dato de `/etc/passwd`, del log de autenticación ni de
ningún recolector demuestra conformidad con el Reglamento (UE) 910/2014, y un UID
único es condición necesaria y no suficiente para vincular un identificador a una
persona real. **Techo con evidencia técnica: 80 % en BAJO (4 de 5) y 75 % en
MEDIO/ALTO (6 de 8).** Desde el 06/08 se cierra con **`P-ATT`**, una fila por
requisito:

```
op.acc.1.5 | Política de identificación v3 | https://intranet/pol-id-v3.pdf | 2026-05-12 | RSI
```

`requisito | documento | enlace(s) | fecha | declarado por`. Con dos límites que
son lo que impide un CUMPLE falso: **solo se admite en requisitos que el catálogo
declara con `evidenceIds: []`** —si la máquina midió y falló, ningún documento lo
tapa—, y **una atestación incompleta no acredita**: sin documento o sin enlace
utilizable no cuenta, porque una casilla marcada no es una prueba. Lo acreditado
sale marcado como **«acreditado documentalmente»**, nunca como medido. El ejemplo
que trae el parámetro apunta a `EJEMPLO.invalido` y se rechaza a propósito.

**3 · `op.acc.2` no tiene `P-ATT`.** Dos cosas que el Excel del auditor pide para
`op.acc.2.1` **no se automatizan** y no se pueden dejar registradas desde la
pantalla: **servicios y puertos abiertos** y **servicios sin autenticación**. El
vocabulario de eventos del plugin no tiene ningún tipo para expresarlo, e
inventarlo no serviría —un evento que ninguna regla del manager etiqueta no llega
al plugin—. **No resta puntos** (EV-01, EV-03 y EV-07 ya acreditan `op.acc.2.1`),
pero si el auditor lo pregunta, la respuesta está fuera de la herramienta.
Igual con los **accesos denegados repetidos**: `access_denied` lleva `n:intentos`
y **se reporta**, no se convierte en veredicto — no existe evento de
incumplimiento por repetición y fabricarlo sería inventar un `NO_CUMPLE` que
ninguna regla etiqueta. Un umbral de repetición es además una decisión de la
organización, no una constante.

**4 · La `causa` de `op.acc.2` (Linux) distingue configuración de avería solo a
medias.** El vocabulario existe y es correcto, y **18 de las 51 llamadas a
`_opacc2_degradar` ya pasan `CONFIGURATION`** (contadas una a una el 12/08/2026,
desglose en §3); **las otras 33 se quedan con el defecto `COLLECTION`**, incluidas
algunas que no son ninguna avería. El diagnóstico bueno sigue estando en el
`motivo`. Se termina de arreglar en el recolector, pasando la causa en las 33
restantes — el runbook LDAP ya lo hace así en todas.

**5 · Evidencias con dos ejes de las que solo uno se puede juzgar.** `op.acc.2`
EV-01 tiene tres ejes y solo uno tiene política de lista; el `umask` necesitaría
comparar máscaras octales y para migrarlo **hay que partir la evidencia**, que es
una decisión de catálogo. `op.acc.1` EV-06 necesitaría una primitiva que solo
usaría ella. **`op.acc.2` EV-06 encadena dos tablas de política** y su clave casa
**por prefijo de directorio**, no por igualdad. Todo eso está declarado en
`docs/PRIMITIVAS_DE_JUICIO.md` con su salida.

**6 · Hueco entre máquinas que ninguna primitiva puede cubrir.** Los tres
controles tienen un parámetro de alcance con la misma anotación: *«ninguna regla
detecta un sistema del alcance que deja de enviar eventos»*. Es una pregunta
**entre máquinas**, y las evidencias se resuelven **por agente**: una primitiva
`LISTA_CUBIERTA` haría que cada máquina declarase incumplimiento por los hechos
que no ha producido *otra*. El hueco es real y su sitio está en la consolidación.

### 6.4 Techo alcanzable, por control y nivel

| Control | BAJO | MEDIO | ALTO |
|---|---|---|---|
| `op.acc.1` | 80 % con evidencia técnica · **100 % con `P-ATT` bien declarado** | 75 % / 100 % igual | igual que MEDIO |
| `op.acc.2` | **100 %** | **100 %** | **100 %**, con los cuatro ficheros de política, auditd cargado y la línea base SUID revisada |
| `op.acc.3` | `NO_APLICA` completo (el ENS no lo exige) | **100 %** si las funciones están repartidas | **100 %**, con `r2.1`/`r3.1` fuera del denominador |
| `op.acc.4` | **100 %** con P-01, P-02, P-03, P-05 y P-07 declarados y auditd cargado | igual | igual |

### 6.5 Lo que este documento NO ha podido verificar

Se dice con estas palabras porque la regla del producto es no afirmar lo no
comprobado:

- **De dónde sale cada cosa.** El cuerpo del documento sale de leer el
  repositorio: los ocho `CUMPLIMIENTO.md`, `CUMPLIMIENTO_TOTAL.md`,
  `docs/COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md`, `docs/PRIMITIVAS_DE_JUICIO.md`, los
  cinco `config/*-control-block.json`, `core/evidence/catalog.ts`,
  `catalog/op-acc-*.ts`, las `core/policy-runtime/policies/*.ts`, los validadores
  de `configuration/services/`, `core/evaluation/`, los `etc/*.example`, los
  `etc/*.cron` y el informe `informes/estado-por-evidencia.html`. **Los estados
  por evidencia y los porcentajes son los de ese informe, con fecha
  12/08/2026: no se ha vuelto a abrir el panel.**
- **Lo que sí se ejecutó contra las máquinas, y por eso lleva fecha.** En una
  pasada de verificación del **12/08/2026** se ejecutaron **solo comandos de
  lectura** —ninguna modificación— y esas afirmaciones del cuerpo están
  comprobadas de primera mano:
  - `wazuh4`: el documento activo de `wazuh-ens-configuration` (scope
    `{"mode":"agent","agentIds":["024","028"]}`, `ensLevel = MEDIO`, valores de
    todos los parámetros, P-09 de `op.acc.1` y de `op.acc.2` sin clave `value`),
    el validador de estructura de §1.4 (**`invalidos: 0`**), `agent_groups -h` y
    el `grep` de `alerts.json`.
  - `wazuh-real`: `auditctl -l` y `-s` (12 `ensfacil_opacc3_act`, 3
    `ensfacil_opacc3_sec`, 3 `ensfacil_opacc4_kn`, 6 `ensfacil_opacc4_perms`, 43
    `ensfacil_opacc2`), el `diff` declarado↔cargado de §1.3 (vacío, rc 0),
    `/etc/cron.d/ensfacil-opacc*`, `/usr/local/bin/ens_opacc*`, el contenido de
    `/etc/ensfacil/` (incluido `opacc4-revisiones.tsv`: 832 bytes, 06/08, cero
    filas de datos) y `opacc3-tareas.tsv`.
  - `ldap-adm`: versión y estado de auditd (`1:3.0.7-1build1`, `pid 382`), las 37
    reglas `ensfacil_*` (17 + 5 + 8 + 7) y la ausencia de `ensfacil_opacc2*`, el
    `diff` de `ensfacil-opacc4-ldap.rules` (vacío), `md5sum` de los cuatro
    `opacc{1,2,3,4}ldap-lib.sh`, cron y `/etc/ensfacil/`, el recuento de bytes
    NUL de `auth.log` y un `ldapsearch -x -ZZ` anónimo contra el 389.
  - **No se usó ninguna credencial de administración de Zimbra**, y no se tocó
    `wazuh-fake`, `wazuh5` ni `insigna-wazuh`.
- **Las cifras concretas de `ldapserver.qsprueba.com` que cita el runbook de
  `op.acc.1-ldap` para EV-03/EV-05 llevan un aviso de «PENDIENTE DE RECONFIRMAR
  EN LA MÁQUINA»** —24 transiciones `su → zimbra`, 0 logins ssh de `zimbra`, 517
  bytes NUL en `auth.log`, `olcLogLevel = Sync None`, 1815 líneas de slapd con 0
  BIND, el arranque de las 08:55:29—. Vienen de una sesión anterior. **No
  condicionan el código; sí el diagnóstico que lee el auditor.**
- **Los recuentos de bytes NUL de `auth.log` discrepan entre runbooks** (517 en
  `op.acc.1-ldap`, 840 medidos el 10/08 en `op.acc.2-ldap`). **Medido en
  `ldap-adm` el 12/08/2026: 840**, sobre un `auth.log` de 15.781 líneas que no ha
  rotado desde el 30/06 —así que el 517 es una foto vieja—. El comando tiene
  trampa y hay que escribirlo así, porque la redirección la hace **tu** shell y
  el fichero es `syslog:adm`:

  ```bash
  sudo bash -c 'tr -dc "\000" < /var/log/auth.log | wc -c'   # 840
  # sin el `bash -c`, `sudo tr … < /var/log/auth.log` da «Permission denied» y 0
  ```
- **La normalización del sujeto a RDN de `op.acc.4-ldap` SÍ está desplegada.** El
  `CUMPLIMIENTO.md` decía que la `/opt/ensfacil/opacc4ldap-lib.sh` instalada era
  la anterior; comprobado el 12/08/2026, la instalada (fechada 12/08 12:01)
  coincide **byte a byte** con la del repositorio —`md5sum` idéntico en los
  cuatro `opacc{N}ldap-lib.sh`— y contiene la normalización (`sujeto_dn`,
  `sujetos_ambiguos`). **Lo que sigue sin confirmar es el panel tras la siguiente
  pasada**, que es donde se vería EV-02 salir de `NO_CUMPLE`.
- **`CLAUDE.md` y los `CUMPLIMIENTO.md` de `op.acc.3` y `op.acc.4` dicen que los
  controles están en `DRAFT`. Está obsoleto**: `catalog/op-acc-3.ts` y
  `catalog/op-acc-4.ts` declaran `status: 'ACTIVE'` en su línea 12, y el informe
  del 12/08 los mide. No se ha verificado en qué commit cambió.
- **Los nombres de parámetro de `op.acc.2` difieren entre el bloque de
  configuración y el `CUMPLIMIENTO.md` del runbook** (P-03
  `permisos_world_writable_permitidos` frente a `world_writable_permitidos`, P-04
  `politica_acceso_so_referencia` frente a `politica_acceso_referencia`, P-06
  `tipos_acceso_permitidos_por_perfil` frente a `tipos_acceso_por_perfil`). Aquí
  se han usado **los del bloque de configuración**, y **ya está comprobado que
  son los buenos**: `configuration/data/op-acc-2-parameters.ts` —la definición
  que pinta la pantalla— trae esos mismos nombres, y el documento activo del
  índice de `wazuh4` también (leído el 12/08/2026). Los cortos son de la
  documentación del runbook, y ahí es donde hay que corregirlos.
- **La tabla de requisitos de `op.acc.2` del `CUMPLIMIENTO.md` del runbook y la
  de la evidencia no coinciden** en si EV-01 acredita `op.acc.2.3` y en si EV-04
  acredita `op.acc.2.r1.2`. Lo que puntúa es **`requirement.evidenceIds` del
  catálogo del control** (`catalog/op-acc-2.ts`), que aquí coincide con
  `policies/op-acc-2.policy.ts` y **no** con `core/evidence/catalog.ts`; es lo
  que se ha usado. Ver el aviso de §3.
- **No se ha verificado ninguna regla del manager `wazuh4`** ejecutándola. Los
  rule IDs de este documento salen de `relatedRules` del catálogo, de los
  `agent/rules/*.xml` y de los `CUMPLIMIENTO.md`; lo único que se ha hecho contra
  el manager es contar apariciones en `alerts.json`, que confirma que
  **106873 dispara**. La comprobación completa es
  `python3 tests/check-coherencia.py` y `wazuh-logtest`, que no se han ejecutado.
