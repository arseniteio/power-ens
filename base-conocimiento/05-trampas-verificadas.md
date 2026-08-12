# Trampas verificadas

Catálogo de fallos que **ya han pasado** en este proyecto, cada uno con su
síntoma exacto, su causa, su arreglo y cómo detectarlo antes de que cueste la
tarde.

Todo lo de aquí está **documentado en el repo o en el código**, con la fuente
citada al final de cada entrada. Nada es hipotético. Cuando algo no se ha podido
verificar, lo dice con esas palabras.

**Cómo usarlo.** Busca tu síntoma en el índice. Si no está, mira la sección que
corresponda a la capa donde estás (configuración, plugin, manager, agente,
motor, máquina auditada). Las trampas están numeradas `T-NN` para poder citarlas.

> **Verificación adversarial del 12/08/2026.** Cada ruta, comando, número de
> línea, hash de commit y cifra de este documento se ha vuelto a comprobar
> contra el repo y contra las máquinas. Lo que se corrigió está marcado dentro
> de su entrada: **T-02** (la limitación de los DN se cerró el 12/08), **T-04**
> (cita de líneas caducada), **T-25** (anunciaba tres fallos y listaba dos),
> **T-48** (fecha y repo de tres commits), **T-52** (citaba un fichero que no
> existe en `main`), **T-53** (op.acc.3 y op.acc.4 ya NO están en DRAFT),
> **T-63** (la afirmación «cero líneas `olcTLS*`» es falsa) y **T-67** (la cifra
> del censo se mueve). Se añadió **T-69**. Lo que sigue sin poder comprobarse
> está al final, con nombre y motivo.

---

## Índice por síntoma

### A · La pantalla de Configuración y el índice `wazuh-ens-configuration`

| | Síntoma |
|---|---|
| [T-01](#t-01) | «No se pudo cargar el entorno ENS» y el plugin entero deja de arrancar |
| [T-02](#t-02) | Un control cae a 0 % al guardar una tabla con DNs o con espacios |
| [T-03](#t-03) | Una tabla con menos columnas de las declaradas invalida el documento |
| [T-04](#t-04) | La configuración del cliente desaparece tras sembrar por segunda vez |
| [T-05](#t-05) | La tarjeta del control no aparece en la pantalla de Configuración |
| [T-06](#t-06) | Se escribe el alcance y el documento queda inválido |
| [T-07](#t-07) | Una máquina sin agente sube o hunde la media del parque |

### B · Compilar y desplegar el plugin

| | Síntoma |
|---|---|
| [T-08](#t-08) | «He desplegado» y el usuario sigue viendo lo de antes |
| [T-09](#t-09) | Un arreglo del código «ya está» y no está en producción |
| [T-10](#t-10) | Aparecen ficheros nuevos pero los viejos siguen ahí |
| [T-11](#t-11) | El `grep` sobre el zip da 0 con un build perfecto |
| [T-12](#t-12) | `sudo: node: command not found` |
| [T-13](#t-13) | «compiled successfully» y no hay zip |
| [T-14](#t-14) | El dashboard entero deja de arrancar tras desinstalar el plugin |
| [T-15](#t-15) | Wazuh en blanco: `Cannot access 'Settings' before initialization` |

### C · El manager y las reglas

| | Síntoma |
|---|---|
| [T-16](#t-16) | `wazuh-logtest` sin `Phase 3` sobre un despliegue correcto |
| [T-17](#t-17) | El evento de prueba decodifica y no dispara nada |
| [T-18](#t-18) | La regla nueva no casa después de instalar |
| [T-19](#t-19) | Un rule ID significa dos evidencias distintas según qué fichero mires |
| [T-20](#t-20) | El auditor pincha un rule ID y no llega a ningún evento |
| [T-21](#t-21) | El agente emite el latido y el motor dice que no consta |

### D · El agente y sus fuentes

| | Síntoma |
|---|---|
| [T-22](#t-22) | El recolector escribe y la primera pasada no llega al manager |
| [T-23](#t-23) | Desde consola hay 3.812 eventos y desde cron cero |
| [T-24](#t-24) | 10.999 alertas de una regla en siete días para dos usuarios |
| [T-25](#t-25) | `ausearch` rechaza la ventana, o se pierden las dos últimas horas |
| [T-26](#t-26) | «No hubo nada» y «ausearch falló» son indistinguibles |
| [T-27](#t-27) | 40 registros con `success=yes` en una máquina recién instalada |
| [T-28](#t-28) | Una evidencia sale en gris justo después del despliegue |
| [T-29](#t-29) | auditd «está» y la evidencia sigue sin poder afirmar nada |
| [T-30](#t-30) | El recuento de reglas de auditd sale muy corto |
| [T-31](#t-31) | Se arregla el defecto en la librería y el hallazgo no se mueve |
| [T-32](#t-32) | El recolector se comporta raro tras tocar el `.env` |
| [T-33](#t-33) | Se copia la plantilla y la evidencia sigue igual de gris |
| [T-34](#t-34) | La fila del fichero de política no se lee |
| [T-35](#t-35) | El motivo de la evidencia no cuadra con la configuración de ahora |
| [T-36](#t-36) | Dos pasadas seguidas a mano y gana el `NO_EVALUABLE` de la primera |
| [T-37](#t-37) | La primera pasada de integridad no detecta nada |
| [T-38](#t-38) | «Parámetro no configurado» con el parámetro configurado |
| [T-39](#t-39) | Faltan evidencias que el recolector debería haber calculado |
| [T-40](#t-40) | Se hace lo que el mensaje pide y el mensaje no cambia |

### E · El motor, y por qué el número no es el que esperas

| | Síntoma |
|---|---|
| [T-41](#t-41) | «El veredicto se ha calculado sobre 10.000 hechos de 20.052» |
| [T-42](#t-42) | La lista de controles y la ficha del mismo control se contradicen |
| [T-43](#t-43) | Se arregla la máquina y la evidencia sigue en rojo |
| [T-44](#t-44) | Un incumplimiento real desaparece del diagnóstico |
| [T-45](#t-45) | Evidencias en verde y el control marcando 0 % |
| [T-46](#t-46) | Con varias máquinas, el score no refleja a la peor |
| [T-47](#t-47) | Se rellena el parámetro en la pantalla y no cambia nada |
| [T-48](#t-48) | El panel acusa de incumplir lo que no ha medido |
| [T-49](#t-49) | Una evidencia migrada se pone verde con casi nada observado |
| [T-50](#t-50) | Una evidencia migrada se pone verde sin contrastar nada |
| [T-51](#t-51) | Verde perpetuo con el agente apagado |
| [T-52](#t-52) | El control compila, despliega y evalúa mal sin avisar |
| [T-53](#t-53) | Un control nuevo pone el índice del cliente a 0 % |

### F · La máquina auditada

| | Síntoma |
|---|---|
| [T-54](#t-54) | Se saca la cuenta del grupo `sudo` y sigue siendo root |
| [T-55](#t-55) | El `sudo` de la misma línea falla justo después de tocar `sudoers.d` |
| [T-56](#t-56) | Se pierde la administración remota de la máquina |
| [T-57](#t-57) | La cuenta más privilegiada del servidor no aparece en el inventario |
| [T-58](#t-58) | Se endurece la máquina y otra evidencia se pone en rojo |
| [T-59](#t-59) | En Zimbra, `ldapsearch` por socket no encuentra el socket |
| [T-60](#t-60) | `zmprov` falla con `Connection refused` |
| [T-61](#t-61) | `cn=config` devuelve «No such object» siendo root |
| [T-62](#t-62) | Se concluye que no hay overlay `accesslog` y sí lo hay |
| [T-63](#t-63) | `olcTLS*` declarado y las credenciales viajan en claro igual |
| [T-64](#t-64) | La política declarada bendice lo que había que corregir |
| [T-65](#t-65) | Una evidencia se queda en gris para siempre porque nunca pasó nada |
| [T-66](#t-66) | Un fichero vacío no acredita, y aquí sí acreditaba |
| [T-67](#t-67) | En LDAP, P-07 da hallazgo con la lista aparentemente completa |
| [T-68](#t-68) | El recolector «no emitió nada» en esta pasada |
| [T-69](#t-69) | Un control marca 100 % con dos evidencias en gris |

---

## A · La pantalla de Configuración y el índice

### T-01

**Un `value: null` impide cargar el entorno ENS ENTERO, no solo su control.**

**Síntoma.** El plugin no arranca. Literal en pantalla:

```
No se pudo cargar el entorno ENS
Invalid ENS configuration structure: configuration.controls[2].parameters[8].value has an invalid value.
```

**Causa.** `isParameterValue`, en
`dashboard/ens/configuration/services/configuration-structure-validator.ts:108`,
acepta exactamente esto y nada más:

```ts
const isParameterValue = (value: unknown): boolean =>
  value === undefined ||        // la clave NO existe -> válido
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  isStringArray(value);         // null -> INVÁLIDO
```

Un parámetro que nunca se ha configurado **no tiene la clave `value`**. Poner
`null` para «vaciarlo» no es lo mismo. Y un solo parámetro inválido **no degrada
su control: invalida el documento**, así que el cliente se queda sin panel.

**Arreglo.** Vaciar un parámetro es **borrar la clave**:

```python
if "value" in p and p["value"] is None:
    del p["value"]
```

**Cómo detectarla antes.** Copia previa del documento y replicar la regla real
del validador sobre TODOS los parámetros antes de guardar. «Revisar con buen
criterio» no basta: falló dos veces seguidas sobre el mismo P-09.

```sh
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active > copia-config.json

python3 -c '
import json,sys
def ok(p,k):
    if k not in p: return True
    v=p[k]
    if isinstance(v,bool): return True
    if isinstance(v,(str,int,float)): return True
    if isinstance(v,list): return all(isinstance(x,str) for x in v)
    return False
d=json.load(open("copia-config.json")); malos=0
for ci,c in enumerate(d["_source"]["configuration"]["controls"]):
    for pi,p in enumerate(c.get("parameters",[])):
        for k in ("value","defaultValue"):
            if not ok(p,k):
                malos+=1
                print("INVALIDO controls[%d].parameters[%d].%s (%s/%s)"%(ci,pi,k,c["controlId"],p["id"]))
print("invalidos:",malos)'
```

*Pasó el 11/08/2026. Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §«Trampa
verificada: "vacío" es la clave AUSENTE» (idéntico en los cuatro repos `-ldap`) y
el propio validador.*

---

### T-02

**Una coma o un espacio en una columna `identifier` tumba el control a 0 %.**

**Síntoma.** Se guarda una tabla y el control se queda en 0 %, o el documento
entero pasa a inválido (T-01).

**Causa.** Las columnas de tipo `identifier` validan contra
`IDENTIFICADOR = /^[^\s|,]+$/`
(`dashboard/ens/configuration/services/parameter-value-validator.ts:492`): un
solo token, **sin espacios, sin barras verticales y sin comas**. Un DN de LDAP va
lleno de comas.

```
cn=admins,cn=zimbra | escritura sobre todo el directorio      ← MAL
```

**Arreglo.** Usar un valor expresable en esa columna (un RDN, un nombre de
cuenta) o cambiar el tipo de la columna. En op.acc.4, la columna *Perfiles* pasó
de `identifier` a `multiselect` sin `options` justo por esto: un recurso con dos
perfiles legítimos —`/etc/shadow`, administrador y root— no se podía declarar y
el segundo salía como desviación.

**Cómo detectarla antes.** Consultar las columnas REALES antes de escribir:

```sh
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

**La consecuencia que tuvo en LDAP, y cómo se cerró (12/08/2026).** Los sujetos
del plano directorio que observa el recolector LDAP son DN y van llenos de comas
—`dn.children=cn=admins,cn=zimbra`, `dn.base=uid=zmpostfix,cn=appaccts,cn=zimbra`—,
así que **no se podían escribir** en la columna *Rol* de P-01, que es
`identifier`. Sin fila que casar, EV-02 de op.acc.4 salía `NO_CUMPLE`
permanente y arrastraba `op.acc.4.1` y `op.acc.4.2`. **No era un fallo del
auditor ni de la máquina: el agente emitía un nombre que el parámetro no puede
expresar.**

Se cerró por el lado del agente (commit `15f6d77` de `op.acc.4-ldap`,
12/08/2026): el sujeto se reduce a su **RDN** (`dn.children=cn=admins,cn=zimbra`
→ `cn=admins`), se sanean espacio, tabulador, coma, `|` y `/`, y **el DN
completo no se pierde**: viaja en el campo `sujeto_dn` del MISMO evento, que es
lo que mantiene la cadena hasta la cláusula exacta de slapd. Se aplica a EV-01,
EV-02 y EV-08 —los tres eventos del plano directorio que llevan `sujeto`—, no
solo al que dio el fallo. El plano sistema no se toca: `root`, `%sudo`,
`ldap-zimbra.adm` ya eran expresables.

La regla general que deja: **cuando un hecho no se puede declarar en su
parámetro, el que cede es el emisor, no el validador** — y lo que se recorta
del nombre tiene que seguir viajando en el evento, o se rompe la trazabilidad.

*(Verificado el 12/08/2026 en la cabecera de
`op.acc.4-ldap/lib/opacc4ldap-lib.sh:440-500` y en `git log` del repo.)*

*Pasó dos veces: con op.acc.4 y el 11/08/2026 con P-09 de op.acc.2. Fuente:
`op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §«las columnas identifier no admiten
comas» y `dashboard/ens/configuration/data/op-acc-4-parameters.ts:186-205`.*

---

### T-03

**Una fila con menos columnas de las declaradas invalida igual que un `null`.**

**Síntoma.** Idéntico a T-01 o a T-02: el control a 0 %, o el entorno sin cargar.

**Causa.** Al declarar una tabla hay que respetar **el número de columnas y el
tipo de cada una**. El 11/08/2026 se rellenó P-09 de op.acc.2 con dos columnas de
las tres que tiene. Falló por partida doble: faltaba una columna y la que había
llevaba comas.

**Arreglo y detección.** El mismo bloque de T-02: enumerar las columnas reales
antes de escribir, y la comprobación de T-01 sobre todo el documento después.

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §«las columnas identifier no
admiten comas».*

---

### T-04

**Sembrar el bloque por segunda vez borró la configuración del cliente.**

**Síntoma.** op.acc.2 pasó de **83 % a 17 %** el 30/07/2026 sin que nadie tocara
la máquina.

**Causa.** `config/inject-control.py` sustituía la lista de controles entera, así
que los valores puestos desde la UI se perdían. Avisaba por pantalla y el aviso
no evitó la pérdida.

> **Ojo con la cita de líneas.** `PLAN_ACCION_2026-07-30.md:148` señala
> `inject-control.py:106-107`. Esas son las líneas **del fichero de entonces**:
> hoy 106-107 son la cabecera `Authorization` de la petición HTTP y no tienen
> nada que ver. Comprobado el 12/08/2026. No busques ahí el defecto: ya no
> existe.

**Arreglo.** Ya está corregido: **`inject-control.py` fusiona**, conserva los
`value` existentes y solo añade lo que falte. Se puede repetir sin miedo. El
comportamiento destructivo es explícito, `--sustituir`, y dice qué valores se
pierden.

```bash
python3 inject-control.py op.acc.1            # dry-run: enseña el plan
python3 inject-control.py op.acc.1 --apply    # escribe (fusiona)
```

**Cómo detectarla antes.** La lección de método: *un script que puede destruir
datos del cliente no avisa, pregunta*. Y el defecto tiene que ser el seguro.
Pruebas sin dependencias en `config/test_inject_control.py`; la aceptación es
que ejecutarlo dos veces seguidas sobre un control con valores puestos no cambia
ni un valor.

*Fuente: `Wazuh-ENS/docs/PLAN_ACCION_2026-07-30.md` T1.1 y §«Método — lo que no
volver a hacer», `Wazuh-ENS/CLAUDE.md` §Trampas conocidas.*

---

### T-05

**La tarjeta del control no aparece en la pantalla de Configuración.**

**Síntoma.** El control existe en el catálogo, se ve en Controles, y en
Configuración no hay tarjeta que rellenar.

**Causa.** Huevo y gallina: el guardado desde la UI **rechaza un control que no
esté ya en el índice**, y el control no entra en el índice hasta que se siembra
su bloque.

**Arreglo.**

```bash
cd /opt/ensfacil/repo/config
export OS_CERT=/etc/wazuh-indexer/certs/admin.pem
export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem
sudo -E python3 inject-control.py op.acc.3 --apply
```

**Cómo detectarla antes.** Es un paso obligatorio de todo control nuevo, y
también **cuando un control gana parámetros u opciones**. Si acabas de añadir un
parámetro y no lo ves, es esto.

*Fuente: `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §8, `Wazuh-ENS/CLAUDE.md`.*

---

### T-06

**`configuration.scope` no es `configuration.global.scope`.**

**Síntoma.** Se escribe el alcance y el documento queda inválido.

**Causa.** El alcance real vive en `configuration.scope`, que es un **objeto**.
`configuration.global.scope` es el **texto descriptivo** que se ve en la
pantalla. Se escribió el objeto en el campo de texto por error.

**Arreglo.** El alcance correcto:

```json
{ "mode": "agent", "agentIds": ["024"], "groupIds": [] }
```

**Cómo detectarla antes.** Copia previa del documento (T-01) y comprobar el tipo
del campo antes de escribir.

*Fuente: `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` §Paso 1.*

---

### T-07

**Una máquina sin agente dentro del alcance mueve el número en las dos direcciones.**

**Síntoma.** Dos síntomas opuestos y la misma causa:

- No conformidades de «fallo de recogida» en cascada —cinco de las nueve de
  op.acc.4— sobre una máquina que nadie instrumentó.
- Y a la vez **inflaba** el cumplimiento: op.acc.3 daba **100 puntos a una
  máquina sin agente**, porque «no he visto a nadie aunar funciones» y «no he
  mirado» producen el mismo conjunto vacío.

**Causa.** El índice tenía `{mode: 'group', groupIds: ['ens']}` y en ese grupo
había una máquina de otro proyecto.

**Arreglo.** Acotar el alcance a lo que de verdad se audita
(`{"mode":"agent","agentIds":["024"],"groupIds":[]}`), y en el motor: op.acc.3
exige ahora un latido `collector_run` de las últimas 24 horas; sin él,
`NO_EVALUABLE`.

**Cómo detectarla antes.** **Cuando un control pase a verde sin que nadie haya
tocado la máquina, sospecha.** El silencio solo acredita si consta que se barrió.
Y sacar una máquina del alcance es legítimo **solo si de verdad no está
auditada**: si lo está y no reporta, eso es un hallazgo y tiene que contar.

*Fuente: `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` §Paso 1 y §Paso 6;
`op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §Paso 0.*

---

## B · Compilar y desplegar el plugin

### T-08

**Reinstalar el plugin NO cambia la URL de los bundles: el navegador sigue con el viejo.**

**Síntoma.** El despliegue va bien, `journalctl` limpio, el fichero nuevo está en
disco… y el usuario sigue viendo la versión anterior. `Ctrl+Shift+R` tampoco lo
arregla.

**Causa.** OpenSearch Dashboards sirve los bundles en

```
/{buildHash}/bundles/plugin/wazuh/wazuh.chunk.N.js
```

y ese `buildHash` sale del `build.number` del `package.json` **del dashboard**,
no del plugin (`src/optimize/optimize_mixin.js`:
`buildHash: env.packageInfo.buildNum.toString()`). Reinstalar el plugin cambia el
fichero en disco y **no cambia la URL**. Esos bundles se sirven pensados para ser
inmutables por `buildHash`, así que el navegador no vuelve a pedirlos: **el
problema no es la recarga, es la URL.**

**Arreglo.** `config/desplegar-plugin.sh`, que hace los cinco pasos en orden e
incluye el que falta (subir el `build.number`, con copia previa del
`package.json`):

```bash
sudo bash config/desplegar-plugin.sh /ruta/al/wazuh-2.19.5.zip
```

Cuesta una primera carga más lenta, una vez.

**Cómo detectarla antes.** Desde el servidor:

```bash
sudo stat -c '%n %y' $(sudo find /usr/share/wazuh-dashboard/plugins/wazuh \
  -name 'wazuh.chunk.2.js')
grep -o '"number": *"[0-9]*"' /usr/share/wazuh-dashboard/package.json
```

> **Aviso de coherencia entre fuentes.** La tabla «Los errores que cuestan una
> tarde» de `PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` y el §6 de
> `DESPLEGAR_EL_PLUGIN.md` dicen que basta con `Ctrl+Shift+R` o con una ventana
> de incógnito. Eso es el diagnóstico **anterior** y es incompleto: el análisis
> del `buildHash` (mismo documento, §«Dos trampas del despliegue») lo sustituye.
> La incógnito funciona porque es un perfil sin esa URL cacheada, pero no
> arregla nada para el usuario.

*Se dio por desplegado tres veces —05, 06 y 07 de agosto de 2026— algo que el
usuario no estaba viendo. Fuente: cabecera de
`Wazuh-ENS/config/desplegar-plugin.sh` y
`Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md`.*

---

### T-09

**Compilar no es desplegar, y el agente no es el motor.**

**Síntoma.** «Esto ya está arreglado» y el panel sigue igual.

**Causa.** Hay **tres sitios distintos** y se confunden:

1. **El agente**: cuántas evidencias recoge el recolector.
2. **El motor**: qué puede juzgar el plugin con eso. El agente puede recoger
   siete evidencias y el motor no poder juzgar ninguna.
3. **El plugin desplegado**: un arreglo en el código no existe hasta que se
   recompila y se instala.

Tres veces en una sola sesión se dio por hecho que un cambio estaba en producción
sin estarlo.

**Arreglo / comprobación.** Antes de decir «esto ya está», los tres:

```bash
# 1 · ¿el agente emite?
sudo jq -r 'select(.event=="collector_run")|.evidencias_cubiertas' \
  /var/log/ensfacil/op_acc_1.json | tail -1

# 2 · ¿el motor tiene con qué juzgar? (parámetros obligatorios sin valor)
sudo curl -s --cert /etc/wazuh-indexer/certs/admin.pem \
  --key /etc/wazuh-indexer/certs/admin-key.pem -k \
  "https://localhost:9200/wazuh-ens-configuration/_doc/active" \
| python3 -c '
import json,sys
cfg = json.load(sys.stdin)["_source"]["configuration"]
for c in cfg["controls"]:
    vac = [p["id"] for p in c["parameters"]
           if p.get("required") and p.get("value") in (None,"",[],{})]
    print("%-11s obligatorios vacios: %s" % (c["controlId"], ", ".join(vac) or "ninguno"))
'

# 3 · ¿lo desplegado es lo compilado?
sudo grep -rl "<cadena del cambio>" /usr/share/wazuh-dashboard/plugins/wazuh/ | head -3
```

**Cómo detectarla antes.** **Comprueba entre paso y paso, no al final.** El ciclo
tiene cuatro tramos —traer, copiar, compilar, instalar— y si solo miras el
resultado, un fallo en el segundo se manifiesta como «no ha cambiado nada» sin
decirte cuál falló.

*Fuente: `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` §«el cumplimiento no se arregla
en el sitio donde se mira» y `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md`.*

---

### T-10

**`cp -r` sobre un destino que existe copia DENTRO: aparece `ens/ens`.**

**Síntoma.** Desconcertante: aparecen ficheros nuevos (los copiados dentro) pero
los que ya existían siguen siendo los antiguos.

**Causa.** Si el `rm -rf "$DEST"` falla —por permisos, por ejemplo— no da error, y
el `cp -r origen destino` posterior crea `ens/ens` dejando el `ens/` viejo
intacto.

**Arreglo / procedimiento.** Comprobar el borrado y comprobar el anidamiento:

```bash
DEST=/opt/ensfacil/build/plugins/main/public/components/overview/ens

rm -rf "$DEST"
[ -e "$DEST" ] && { echo "ERROR: no se pudo borrar. PARA AQUI."; } || echo "borrado OK"

cp -r /opt/ensfacil/repo/dashboard/ens "$DEST"
ls -d "$DEST/ens" 2>/dev/null && echo "ERROR: se ha anidado. PARA AQUI."
```

**Cómo detectarla antes.** Marca del cambio sobre la FUENTE antes de compilar:

```bash
grep -c "unmeasuredRequirements" "$DEST/core/evaluation/evaluation-engine.ts"
```

Si da 0, la copia no trajo lo que crees y **no tiene sentido compilar**.

*Costó dos rondas de diagnóstico. Fuente:
`Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §3.*

---

### T-11

**La marca para verificar el zip tiene que ser un identificador o una cadena, nunca un comentario.**

**Síntoma.** `unzip -p build/wazuh-2.19.5.zip | grep -c "<marca>"` da **0** con el
build perfectamente bien, y el 0 se lee como «el build no trajo el cambio».

**Causa.** El bundler elimina los comentarios al compilar.

**Arreglo.** Elegir la marca pensando ya en el zip y usarla en los dos sitios
(fuente y zip). Y verificar **en par**:

```bash
echo -n "control positivo (> 0): "
unzip -p build/wazuh-2.19.5.zip | grep -c "unmeasuredRequirements"
echo -n "lo que el cambio QUITA (0): "
unzip -p build/wazuh-2.19.5.zip | grep -c "<cadena que ya no debe existir>"
```

El segundo en 0 es lo que demuestra que el zip es el NUEVO: un identificador que
existe en las dos versiones da mayor que 0 en las dos. Y el par impide leer un 0
como buena noticia cuando el `grep` estaba mal escrito.

*Pasó el 05/08/2026 y costó una compilación de cuatro minutos. Fuente:
`Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §3-§4.*

---

### T-12

**`sudo` no es `sudo -i`.**

**Síntoma.** `sudo: node: command not found`.

**Causa.** `sudo -i` carga el perfil de root y con él su `PATH`; `sudo` no.
`node` vive en el `PATH` de root.

**Arreglo.** Todo el ciclo de build en una sesión de root:

```bash
sudo -i
```

*Fuente: `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §0 y su tabla de diagnóstico.*

---

### T-13

**Con node 22 el build dice «compiled successfully» y no produce zip.**

**Síntoma.** `succ 1 bundles compiled successfully` y acto seguido el proceso
muere por un `DeprecationWarning` de `fs.Stats`, **sin decir «error» en ninguna
parte**. Si además canalizas la salida por `tail`, el código de salida es el del
`tail` y parece que fue bien. No hay zip y nadie lo dice.

**Causa.** El plugin se compila con **node 18**, no con el que tengas por
defecto.

**Arreglo.**

```bash
nvm use 18.19.0
cd <arbol>/plugins/main
YARN_IGNORE_ENGINES=1 node ../../scripts/plugin_helpers build \
  --allow-root --opensearch-dashboards-version=2.19.5
ls -la build/*.zip        # si no hay zip, NO se ha construido
```

**Cómo detectarla antes.** No canalizar la salida del build por `tail`, y
comprobar la existencia del zip como paso propio.

*Fuente: `Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` §«Dos trampas del
despliegue que cuestan una tarde».*

---

### T-14

**Las rutas de borrado son exactas. NUNCA el comodín `wazuh*`.**

**Síntoma.** El dashboard entero deja de arrancar tras «limpiar» el plugin.

**Causa.** `rm -rf /usr/share/wazuh-dashboard/plugins/wazuh*` se lleva por delante
`wazuhCore` (y `wazuhCheckUpdates`), no solo `wazuh`.

**Arreglo.** Las dos rutas, escritas enteras:

```bash
rm -rf /usr/share/wazuh-dashboard/plugins/wazuh
rm -rf /usr/share/wazuh-dashboard/plugins/.plugin.installing
```

**Cómo detectarla antes.** Usar `config/desplegar-plugin.sh`, que ya las lleva
escritas así y lo documenta en su cabecera. Y tener el respaldo del zip anterior
en `/opt/ensfacil/artifacts/backup-<fecha>/`, que permite volver atrás en un
minuto.

*Fuente: `Wazuh-ENS/CLAUDE.md`, `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §5,
`Wazuh-ENS/config/desplegar-plugin.sh`.*

---

### T-15

**TDZ de `Settings`: Wazuh en blanco.**

**Síntoma.** `Cannot access 'Settings' before initialization`. Wazuh se queda en
blanco.

**Causa.** Ciclo de importación transitivo **preexistente del plugin `main`**,
que se destapa al crecer el bundle. `app-router.tsx` carga `Settings` con
`React.lazy` justo para esquivarlo.

**Arreglo.** No revertir a import directo. Y la disciplina que lo evita:
importar tipos siempre desde `./types` / `../types`, **nunca** desde un barrel de
alto nivel.

**Cómo detectarla antes.** Cualquier PR que meta un import de alto nivel en el
módulo ENS es candidato. Es un fallo de arranque, no de compilación: no lo caza
el build.

*Fuente: `Wazuh-ENS/CLAUDE.md` §Trampas conocidas,
`Wazuh-ENS/docs/ENS_CONTROL_DEPLOYMENT.md` §Disciplina TDZ.*

---

## C · El manager y las reglas

### T-16

**Verificar con `wazuh-logtest` antes de recargar da un falso negativo.**

**Síntoma.** «La regla no dispara» sobre un despliegue perfecto.

**Causa.** `wazuh-logtest` **no compila el ruleset del disco**: habla con el
`analysisd` **en marcha**. Verificar antes de recargar pregunta por un ruleset
que el demonio no ha leído todavía.

**Arreglo.** Recargar primero, verificar después.

```bash
systemctl restart wazuh-manager && sleep 20
```

*Costó una hora descubrirlo. Fuente:
`Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` §1.*

---

### T-17

**`ensfacil: true` en el evento de prueba decodifica bien y no dispara nada.**

**Síntoma.** `wazuh-logtest` sin `Phase 3`. Parece que las reglas no están
cargadas cuando sí lo están.

**Causa.** El campo `ensfacil` lleva **el id del control**, no `true`. La regla
base exige el id.

**Arreglo.** Copiar una línea real de `/var/log/ensfacil/<control>.json`, o
escribirla bien:

```bash
echo '{"ensfacil":"op.acc.2","event":"world_writable","host":"H","estado":"NO_CUMPLE"}' \
  | sudo /var/ossec/bin/wazuh-logtest      # esperado: Phase 3, id 106902
```

**Cómo detectarla antes.** La regla de método: **no inventar el dato de prueba**.
Media hora buscando un fallo que no existía.

*Fuente: `Wazuh-ENS/docs/PLAN_ACCION_2026-07-30.md` §Método,
`Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §9.*

---

### T-18

**`install-manager.sh` no reinicia el manager si `agent.conf` no cambia.**

**Síntoma.** Reglas nuevas instaladas y sin match.

**Causa.** El instalador solo recarga cuando cambia `agent.conf`; las reglas
nuevas sí necesitan recarga.

**Arreglo.**

```bash
systemctl restart wazuh-manager && sleep 20
```

*Fuente: `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §9.*

---

### T-19

**Dos ficheros de reglas numeran sobre la misma banda de op.acc.1.**

**Síntoma.** Un rule ID existe, está desplegado, y lleva al auditor a un evento
que habla de otra evidencia.

**Causa.** El rango 106800-106899 lo usan **dos juegos**:

| Fichero (`agent/rules/`) | Recolector | ¿Desplegado? |
|---|---|---|
| `ensfacil_op_acc_1_json_rules.xml` | bash del runbook | **SÍ** (copia en `op.acc.1-identificacion/manager/`) |
| `ensfacil_op_acc_1_technical_fact_rules.xml` | `agent/collectors/ens_op_acc1_audit.py` (modelo nuevo) | NO |

No se pueden fusionar —su `106800` exige campos distintos—, pero **un id no
puede significar dos evidencias según cuál se mire**. Caso concreto: `106824` es
`authentication_cursor_initialized` (EV-03) en uno y `authorized_list_check`
NO_CUMPLE (EV-07) en el desplegado.

**Arreglo.** La banda 106801-106849 está agotada entre los dos. Los hechos crudos
del modelo nuevo van en **106873-106889**, libre en ambos.

**Cómo detectarla antes.** Un id nuevo se toma del primer hueco de su banda y
**hay que comprobar que está libre en los cuatro repos**: `agent/rules/`
(canónica), los tres `manager/` y
`ensfacil_op_acc_1_technical_fact_rules.xml`.

```bash
cd /opt/ensfacil/repo && python3 tests/check-coherencia.py   # 0 si todo cuadra
```

*Fuente: `Wazuh-ENS/CLAUDE.md` §Controles implementados,
`op.acc.1-identificacion/docs/07-mapa-evidencias.md` §Aviso de numeración
compartida.*

---

### T-20

**La trazabilidad se reconstruyó contra el fichero de reglas que NO está desplegado.**

**Síntoma.** El auditor pincha un rule ID en la UI y no llega a ningún evento. La
cadena `CUMPLE → evidencia → rule ID → evento crudo` muere en el último escalón
**sin que nada avise**, porque el identificador es numérico, la regla existe en
algún XML del repo y todo parece correcto.

**Causa.** Dos capas del mismo fallo:

- **29/07/2026, auditoría de fase 0**: **65 de los 83** identificadores de regla
  declarados en TypeScript no correspondían a ninguna regla real. Y hay **tres**
  puntos de verdad, no dos: `core/evidence/*.evidence.ts`, `data/*.ts` y
  `configuration/data/*-parameters.ts`. Lo grave no era lo simbólico
  (`ENS-OPACC1-INVENTORY`), que es visiblemente un hueco, sino que 10 de los 18
  IDs numéricos de `data/mp-info-6.ts` eran falsos y apuntaban a reglas
  genéricas: **un ID numérico equivocado parece trazable y no lo es.**
- **30/07/2026, op.acc.1**: sus 52 reglas acreditadas se habían reconstruido
  contra el fichero del recolector Python, hoy renombrado y **no desplegado**.
  **39 de las 52 eran inalcanzables**, y las 13 restantes tampoco eran de fiar
  (ver T-19).

**Arreglo.** `relatedRules` sale del fichero **DESPLEGADO**: la copia `manager/`
del runbook, que es lo que instala su `install-manager.sh`. Los criterios de
inclusión y exclusión están escritos en la cabecera de
`dashboard/ens/core/evidence/catalog.ts`.

**Cómo detectarla antes.**

```bash
cd /opt/ensfacil/repo && python3 tests/check-coherencia.py
```

Verifica que toda regla acreditada exista en un manager, que la canónica y la
copia desplegada no diverjan, que toda evidencia escuche `evidence_state`, que
todo tipo declarado lo emita alguna regla, que los runbooks tengan sus scripts y
que cada control tenga su bloque de config.

*Fuente: cabecera de `dashboard/ens/core/evidence/catalog.ts`,
`Wazuh-ENS/docs/AUDITORIA_COHERENCIA_2026-07-30.md`,
`Wazuh-ENS/docs/AUDITORIA_FASE_0.md`.*

---

### T-21

**`collector_run` no tenía regla, así que el latido no llegaba al índice.**

**Síntoma.** EV-03 de op.acc.1 sale `NO_EVALUABLE` en una máquina **sana**, con
motivo *«Cobertura del recolector: DESCONOCIDA. No consta ningún evento de
recolector (collector_run) para EV-03»*. El agente **sí lo emite**, con
`resultado: completada` y `evidencias_cubiertas: "EV-03,EV-05,EV-06"`.

**Causa.** `collector_run` no tenía regla de Wazuh: caía en la regla base
(`level="0"`), no generaba alerta y nunca llegaba al índice.

Lo instructivo es que son **dos decisiones correctas por separado**:

1. *«`collector_run` no necesita regla: sería ruido, `score_snapshot` ya late con
   la misma cadencia»* — correcto **para el modelo clásico**.
2. *«El motor decide EV-03 mirando `collector_run` para saber si la ausencia de
   hechos puede significar CUMPLE»* — correcto **para el modelo nuevo**.

Ninguna prueba unitaria puede cazarlo, porque cada mitad está bien.

**Arreglo.** Regla propia para el latido.

**Cómo detectarla antes.** **Cuando un evento pasa de ser diagnóstico a ser
load-bearing para una decisión del motor, hay que revisar todas las decisiones
tomadas sobre él con el rol anterior — empezando por si llega al índice.**

*Fuente: `Wazuh-ENS/docs/HALLAZGOS_DESPLIEGUE_REAL_2026-07-31.md` §1.*

---

## D · El agente y sus fuentes

### T-22

**`logcollector` empieza a leer por el FINAL de un fichero que ya existe.**

**Síntoma.** El recolector escribe su ndjson, todo parece bien, y al manager no
llega nada de la primera pasada.

**Causa.** Comportamiento normal de `logcollector`: un fichero que ya existe
cuando arranca se lee desde el final.

**Arreglo.** Lanzar **otra pasada**. Es todo.

**Cómo detectarla antes.** Cierra la cadena en el manager antes de dar el
despliegue por bueno:

```bash
sudo grep -h "<agente>" /var/ossec/logs/alerts/alerts.json \
  | grep -oE '"id":"10[67][0-9]{3}"' | sort | uniq -c
```

Si ahí no sale nada, o el agente no está en el grupo `ens`, o es esto.

```bash
sudo /var/ossec/bin/agent_groups -a -i <ID> -g ens -q
```

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §Paso 0 y §Verificación.*

---

### T-23

**`ausearch` sin `--input-logs` lee de STDIN cuando no hay terminal.**

**La trampa más grave de todo el catálogo: fabricaba CUMPLE falsos.**

**Síntoma.** Desde una consola `ausearch` devuelve 3.812 eventos; **desde cron,
cero**, con «`<no matches>`» y rc=1 — exactamente igual que si no hubiera pasado
nada en la máquina. Invisible en cualquier prueba manual.

**Causa.** Sin `--input-logs`, `ausearch` lee de stdin cuando no hay terminal.
Desde cron el stdin está vacío. El recolector interpretaba ese vacío como «miré y
no había nada», marcaba la evidencia como cubierta, y el motor convertía el
silencio en `CUMPLE`.

**Arreglo. Hacen falta las dos medidas:**

1. `--input-logs` en **todas** las llamadas: le dice a `ausearch` que lea los
   ficheros que declara `auditd.conf`.
2. **Control positivo**: antes de aceptar un silencio como hecho, se comprueba
   que `ausearch` devuelve ALGO sin filtrar por clave. Si el log tiene registros y
   `ausearch` no ve ninguno, la herramienta no está leyendo y su silencio no
   significa nada: se degrada.

**Cómo detectarla antes.** La regla general: **una fuente que no rinde datos
plausibles no puede producir una evidencia limpia.** Y probar siempre desde cron,
no solo desde la terminal.

*Se llevó por delante un despliegue real el 06/08/2026. Fuente: cabecera de
`op.acc.4-proceso-de-gestion-de-derechos-de-acceso/lib/opacc4-lib.sh` y de
`op.acc.3-segregacion-de-funciones-y-tareas/lib/opacc3-lib.sh`;
`Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md`.*

---

### T-24

**`ausearch -ts today` reemite todo lo del día en cada pasada.**

**Síntoma.** **10.999 alertas de la regla 107001 en siete días para DOS usuarios
distintos** (medido en `wazuh-real` el 06/08/2026). Ruido que entierra la traza
que el auditor viene a seguir, y **llegó a colgar el dashboard**.

**Causa.** `-ts today` devuelve TODO lo de hoy en CADA pasada. Con el cron cada
hora, los mismos hechos se emiten 24 veces al día.

**Arreglo.** La ventana arranca en **la última pasada que terminó**. La primera
vez, y si el fichero de sello se pierde, cae a `today`: preferimos repetir hechos
a perderlos. Y **el sello se escribe al TERMINAR, no al empezar**: si la pasada
muere a medias, la siguiente vuelve a mirar el mismo intervalo en vez de
saltárselo.

**Cómo detectarla antes.** Contar alertas por regla en el manager y comparar con
el número de hechos distintos que la máquina debería producir:

```bash
sudo grep -oE '"id":"107001"' /var/ossec/logs/alerts/alerts.json | wc -l
```

*Fuente: cabeceras de `opacc3-lib.sh` y `opacc4-lib.sh` §«desde cuándo se
pregunta a auditd».*

---

### T-25

**`ausearch --start/--end`: dos argumentos, formato del locale, y hora LOCAL.**

**Síntoma.** Dos de los tres fallos que la cabecera de `ensfacil-auditd.sh`
enumera como «medidos, no supuestos» sobre `audit 2.8.5` (Ubuntu 20.04) y
`audit 3.1.2` (Ubuntu 24.04) —el tercero es T-26—:

- `--start "07/30/2026 09:00:00"` se rechaza con rc=1 en las dos versiones.
- En un servidor español, la ventana se desplaza **dos horas hacia atrás**: los
  registros de las dos últimas horas no se leerían nunca, y como el marcador
  avanza igual, **se perderían para siempre**.

**Causa.** `--start`/`--end` toman fecha y hora como **dos argumentos separados**,
y la fecha en el formato `%x` del locale —que en el locale C de un servidor es
`MM/DD/YY`, con año de **dos** cifras—. Y las interpreta en la **hora local del
proceso**.

**Arreglo.** Forzar `LC_ALL=C`, formatear con `+%m/%d/%y` y `+%H:%M:%S` por
separado, y forzar `TZ=UTC` construyendo la ventana con `date -u`.

**Cómo detectarla antes.** Medir, no suponer: probar la invocación real contra un
`audit.log` de fixture. Es lo que hace el Step 0 de la tarea que produjo
`lib/ensfacil-auditd.sh`.

*Fuente: cabecera de
`op.acc.2-requisitos-de-acceso/lib/ensfacil-auditd.sh` §«tres cosas que esta capa
sabe de ausearch».*

---

### T-26

**`<no matches>` se escribe en STDERR, con rc=1.**

**Síntoma.** «No hubo nada» y «`ausearch` falló» quedan indistinguibles: los dos
serían stdout vacío con rc=1.

**Causa.** Enterrar stderr con `2>/dev/null`. El caso seguro (`NO_EVALUABLE`) se
convierte en `CUMPLE`.

**Arreglo.** Capturar stdout y stderr **por separado** y conservar el último
error de `ausearch` para que el llamante lo pueda meter en el `motivo` de su
`evidence_state`.

**Cómo detectarla antes.** Cualquier `2>/dev/null` sobre una herramienta que
alimenta una evidencia de aserción negativa es sospechoso por definición.

*Fuente: cabecera de `op.acc.2-requisitos-de-acceso/lib/ensfacil-auditd.sh`.*

---

### T-27

**Los `CONFIG_CHANGE` de auditd no son accesos, y `ausearch -k` los devuelve.**

**Síntoma.** Primera pasada tras cargar las reglas:

```
collector_warning · "40 registro(s) de la clave ensfacil_opacc2 traen
success=yes y no son denegaciones; revisa las reglas de /etc/audit/rules.d"
```

Exactamente 40 registros para 40 reglas cargadas.

**Causa.** Al cargar las reglas, auditd escribe un `type=CONFIG_CHANGE
op=add_rule` por cada una, y **cada uno lleva la clave de la regla que se estaba
añadiendo**. La `key` de la línea `type=SYSCALL` es `(null)`; la nuestra aparece
solo en el `CONFIG_CHANGE`. La syscall es `sendto` — `auditctl` hablando con el
kernel por netlink.

**Qué funcionó.** El recolector **no** los emitió como `access_denied`. Habría
fabricado 40 no conformidades sobre una máquina limpia.

**Qué falló.** El diagnóstico: el mensaje culpa a las reglas, que están bien. Y se
repite en cada instalación o recarga.

**Cómo detectarla antes.** Si el aviso aparece justo después de un `augenrules
--load`, cuenta las reglas cargadas: si el número coincide, es esto.

*Fuente: `Wazuh-ENS/docs/HALLAZGOS_DESPLIEGUE_REAL_2026-07-31.md` §3.*

---

### T-28

**Escribir el fichero de reglas de auditd NO las carga.**

**Síntoma.** «Una evidencia sale en gris tras el despliegue.»

**Causa.** El instalador escribe `/etc/audit/rules.d/…` y **no** ejecuta
`augenrules --load`. Es deliberado: el instalador nunca hace `auditctl -D`, que
descargaría también las reglas del hardening del cliente.

**Arreglo.** Es un paso aparte, y el que más se olvida:

```bash
sudo augenrules --load
sudo auditctl -l | grep ensfacil      # tiene que devolver algo
```

**Cómo detectarla antes.** En el LDAP, auditd es **el paso que más desbloquea**:
sin él op.acc.3 no cubre ni una evidencia y op.acc.4 pierde la mitad.

> **op.acc.3 tiene coste de disco.** Su regla observa *todas* las ejecuciones de
> usuarios reales. Mira `max_log_file` y `num_logs` en `auditd.conf` antes de
> cargarla en una máquina con actividad.

*Fuente: `Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` §2,
`op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §Paso 2,
`op.acc.3-ldap/CUMPLIMIENTO.md`.*

---

### T-29

**Los cuatro estados de auditd producen el mismo silencio, y solo uno permite afirmar.**

**Síntoma.** Una evidencia de aserción negativa (cumple cuando no produce hechos)
sale verde con auditd a medias.

**Causa.** Cuatro estados indistinguibles desde fuera:

| Estado | `auditd_disponible` |
|---|---|
| 1 · auditd NO instalado | rc 1 |
| 2 · instalado, demonio parado | rc 2 |
| 3 · corriendo, **sin NUESTRAS reglas** | rc 2 |
| 4 · corriendo con nuestras reglas | rc 0 |

Solo el 4 permite afirmar algo. Y dentro del 4 hay otra bifurcación en
`leer_auditd`: «hubo registros» y «todavía no hubo ninguno» son las DOS lecturas
correctas (rc 0), mientras que «`ausearch` falló» es rc 2.

**Arreglo.** Los estados 2 y 3 comparten rc pero **no comparten diagnóstico**:
cada uno emite su propio `collector_warning` con la causa exacta y qué hacer.

**Cómo detectarla antes.** *Que auditd no esté NO es una no conformidad del
control ENS: es que no se puede medir.* Quien lo confunda acusará de incumplir a
una máquina recién instalada.

> **Precisión que corrige una creencia extendida en el equipo: EV-03 de op.acc.2
> NO depende de auditd.** Su `NO_CUMPLE` sale del log de autenticación. Perder la
> mitad de auditd reduce el volumen de evidencia, **no fabrica cumplimiento**, así
> que no degrada: deja un `collector_warning`. La que **sí** degrada sin auditd es
> **EV-06**. Si EV-03 está gris, **no mires auditd**: mira el `motivo` del
> `evidence_state`.

*Fuente: cabecera de `op.acc.2-requisitos-de-acceso/lib/ensfacil-auditd.sh`,
`Wazuh-ENS/docs/CUMPLIMIENTO_TOTAL.md` §6.3.*

---

### T-30

**`auditctl -l | grep -c key=` no cuenta las reglas `-w`.**

**Síntoma.** El recuento de reglas cargadas sale muy corto y parece que faltan.

**Causa.** Las reglas `-w` imprimen `-k` y las de syscall imprimen `-F key=`.

**Arreglo.** Contar por el nombre de la clave, no por la sintaxis:

```sh
sudo auditctl -l | grep -c ensfacil          # en el LDAP debe dar ~22
```

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §Paso 2.*

---

### T-31

**El `.env` de la máquina MANDA sobre el defecto de la librería.**

**Síntoma.** Se corrige un defecto en la librería, se despliega, y **el hallazgo
no se mueve**: parece que hacer lo correcto no lo arregla nunca.

**Causa.** `install.sh` instala la **plantilla `.env`**, y el recolector la
sourcea, así que el valor del `.env` pisa el defecto de la librería. Si se cambia
uno y no el otro, el arreglo no surte efecto.

**Ha pasado dos veces, las dos en `op.acc.1-ldap`:**

- **`adm` en `GRUPOS_PRIVILEGIADOS` (11/08/2026).** La librería ya decía
  `sudo,wheel,admin` y la plantilla seguía diciendo `...,adm`. Tras sacar una
  cuenta del grupo `sudo` seguía saliendo como multi-rol por estar en `adm`.
- **`/bin/sync` en `SHELLS_NOLOGIN`.** Sin él, la cuenta `sync` de Debian/Ubuntu
  se inventariaba como identidad de acceso y hacía fallar EV-07 contra P-07.

**Arreglo.** Los dos valores tienen que coincidir. Están documentados como tales
en el propio `.env.example`:

```
# TIENE QUE COINCIDIR con el defecto de opacc1ldap-lib.sh. Este fichero MANDA
# sobre la libreria (install.sh lo instala y el recolector lo sourcea),
# asi que una lista mas corta aqui deja sin efecto el arreglo de alla.
```

**Cómo detectarla antes.** Comparar el valor efectivo en la máquina con el defecto
de la librería antes de tocar nada:

```bash
grep -E 'GRUPOS_PRIVILEGIADOS|SHELLS_NOLOGIN' /etc/ensfacil/opacc1-ldap.env
grep -E 'GRUPOS_PRIVILEGIADOS=|SHELLS_NOLOGIN=' /opt/ensfacil/opacc1ldap-lib.sh
```

*Fuente: `op.acc.1-ldap/etc/opacc1-ldap.env.example`, comentarios de
`OPACC1LDAP_SHELLS_NOLOGIN` y `OPACC1LDAP_GRUPOS_PRIVILEGIADOS`.*

---

### T-32

**No añadas al `.env` variables que no estén en su lista.**

**Síntoma.** El recolector se comporta de forma inexplicable tras tocar el
`.env`. O aplica media configuración.

**Causa.** Dos cosas distintas:

- El fichero **se sourcea dentro del recolector antes de cargar las librerías**:
  un nombre que coincida con una variable interna la sobreescribe en silencio.
- Un error de sintaxis —una comilla sin cerrar— hace que bash **aborte la lectura
  en ese punto**: lo anterior se aplica y lo posterior no.

**Arreglo.** El recolector detecta el segundo caso y lo anota como
`collector_warning`, porque el cron entierra stdout y stderr.

**Cómo detectarla antes.** Ceñirse a la lista de variables del `04-parametros.md`
del control. Y mirar los `collector_warning` del ndjson después de editar.

*Fuente: `op.acc.2-requisitos-de-acceso/CUMPLIMIENTO.md` §Parámetros,
`op.acc.1-identificacion/docs/04-parametros.md:144`.*

---

### T-33

**Copiar la plantilla `.example` no configura nada.**

**Síntoma.** Se copia el `.example` a su ruta final y la evidencia sigue
**exactamente igual de gris**.

**Causa.** Las plantillas de op.acc.2 llevan **todas sus filas de ejemplo
comentadas con `#`**. Copiarlas deja el fichero puesto y sin ni una fila
utilizable. (Y declararlas tal cual sería declarar como política un ejemplo.)

**Arreglo.** Escribir la política de verdad. Los cuatro ficheros de op.acc.2:

| Fichero | Evidencia | Qué declara |
|---|---|---|
| `/etc/ensfacil/opacc2-acl.tsv` | EV-04 | qué ACL debe tener cada recurso |
| `/etc/ensfacil/opacc2-privilegios.tsv` | EV-05 y EV-06 | qué privilegios y perfil tiene cada usuario (ALTO) |
| `/etc/ensfacil/opacc2-accesos.tsv` | EV-06 | qué acceso permite cada perfil (ALTO) |
| `/etc/ensfacil/opacc2-suid.allow` | EV-07 | qué binarios SUID/SGID están autorizados |

**Cómo detectarla antes.** El motivo lo dice y **es distinto a propósito** del de
«no existe», porque llevan a sitios distintos:

```
politica de acceso declarada (opacc2-acl.tsv) sin ninguna fila utilizable
```

*Fuente: `Wazuh-ENS/docs/CUMPLIMIENTO_TOTAL.md` §6.4,
`op.acc.2-requisitos-de-acceso/CUMPLIMIENTO.md`.*

---

### T-34

**Los ficheros de política van con TABULADOR, no con espacios.**

**Síntoma.** «La fila no se lee.» El recolector degrada con el motivo
`… ninguna trae ruta y modo separados por tabulador`.

**Causa.** Una fila escrita con espacios deja la fila entera en la primera
columna. Escribirlos en un editor casi siempre mete espacios.

**Arreglo.** `printf` con `\t`, o `sudo -e` con cuidado:

```bash
printf 'usuario\t2026-08-02\n' | sudo tee /var/lib/ensfacil/opacc1/bajas.tsv
```

**Qué funcionó, y por qué importa.** El recolector **detecta** el caso y degrada,
en vez de comparar contra basura — que produciría un `NO_CUMPLE` falso por cada
recurso o usuario de la máquina.

*Fuente: `Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` §3,
`Wazuh-ENS/docs/CUMPLIMIENTO_TOTAL.md` §6.4.*

---

### T-35

**El ndjson es un HISTÓRICO: un `tail` mezcla ejecuciones.**

**Síntoma.** «El motivo de una evidencia no cuadra con la configuración de
ahora.» Se diagnostica un fallo que ya estaba arreglado.

**Causa.** `/var/log/ensfacil/<control>.json` acumula todas las pasadas. Un `tail`
enseña estados ya superados.

**Arreglo.** Aislar UNA pasada:

```bash
sudo mv /var/log/ensfacil/op_acc_1.json /var/log/ensfacil/op_acc_1.json.antes
sudo /usr/local/bin/ens_opacc1_collect.sh
sudo jq -c '{event,evidence_id,estado,motivo}' /var/log/ensfacil/op_acc_1.json
```

**Y una precisión aparte:** borrar el ndjson **no limpia el panel**. El panel lee
OpenSearch, no el fichero.

*Costó media hora. Fuente: `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §9 y su tabla
de diagnóstico; `Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md`.*

---

### T-36

**Dos pasadas a mano dentro del mismo segundo: gana la primera.**

**Síntoma.** Se relanza el recolector tras arreglar algo y sigue en pie el
`NO_EVALUABLE` de la pasada anterior.

**Causa.** El campo `ts` tiene resolución de **segundo**, y `score.py` solo deja
que unos hechos nuevos pisen una declaración anterior si son **estrictamente**
posteriores.

**Arreglo.** Dejar pasar un segundo entre pasadas manuales. Con la cadencia
horaria del cron nunca ocurre.

**Detalle relacionado.** Por lo mismo, el `evidence_state` consolidado de los
recolectores LDAP espera un tick (`_opacc2ldap_esperar_tick`) para garantizar un
`ts` estrictamente posterior al de todos los planos: el desempate del motor no es
estable.

*Fuente: `op.acc.2-requisitos-de-acceso/docs/03-agente.md:412`, cabecera de
`op.acc.2-ldap/lib/opacc2ldap-lib.sh`.*

---

### T-37

**La primera pasada de integridad no compara: fija la línea base.**

**Síntoma.** EV-02 de op.acc.2 no detecta nada la primera vez.

**Causa.** No es un fallo. Emitir un alta por cada fichero presentaría el censo de
hoy como si fueran altas de hoy. La línea base se guarda en
`/var/lib/ensfacil/opacc2/fim.tsv`.

**Arreglo / procedimiento.**

```bash
sudo /usr/local/bin/ens_opacc2_collect.sh   # fija la línea base
sleep 2
sudo /usr/local/bin/ens_opacc2_collect.sh   # ya compara
sudo test -s /var/lib/ensfacil/opacc2/fim.tsv && echo "línea base fijada"
```

**Misma disciplina en LDAP.** EV-02 de `op.acc.1-ldap` fija línea base en la
primera pasada y **NO declara cobertura**: sin nada con que comparar,
`NO_EVALUABLE` con causa, nunca `CUMPLE`.

*Fuente: `Wazuh-ENS/docs/CUMPLIMIENTO_TOTAL.md` §6.2, commit `fa0beae` de
`op.acc.1-ldap`.*

---

### T-38

**«Parámetro no configurado» con el parámetro configurado.**

**Síntoma.** Exactamente eso, y apunta al sitio equivocado.

**Causa.** La máquina corría el pipeline **desactualizado**: la librería vieja
descartaba el parámetro.

**Arreglo / comprobación.** Que el agente corre la versión del repo:

```bash
md5sum /usr/local/bin/ens_opacc1_collect.sh ~/ens/op.acc.1-*/scripts/ens_opacc1_collect.sh
md5sum /opt/ensfacil/opacc1-lib.sh          ~/ens/op.acc.1-*/lib/opacc1-lib.sh
```

Tienen que coincidir.

**Cómo detectarla antes.** «El instalador corre y no cambia nada» suele ser que
el `git pull` no llegó. **Comprueba el hash antes de instalar.**

*Fuente: `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §9 y tabla de diagnóstico.*

---

### T-39

**`collect.sh` no es la pasada completa en el modelo clásico.**

**Síntoma.** Faltan evidencias que deberían estar calculadas.

**Causa.** El cron ejecuta también `score.py`, que es quien deriva los estados
agregados. Corriendo solo el recolector faltan evidencias que aún no se han
calculado.

**Arreglo.**

```bash
sudo /usr/local/bin/ens_opacc2_collect.sh
sudo bash -c 'set -a; . /etc/ensfacil/opacc2.env; exec /usr/local/bin/ens_opacc2_score.py'
```

**Excepción.** op.acc.4 nació entero en el modelo nuevo: **no tiene `score.py` ni
watchdog**, porque su agente no emite ningún veredicto.

*Fuente: `Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` §4,
`Wazuh-ENS/CLAUDE.md`.*

---

### T-40

**Un motivo que describe la pasada anterior.**

**Síntoma.** El operador promueve la línea base de SUID como le pide el mensaje,
relanza el recolector, y EV-07 **repite el mismo motivo** diciendo que falta.
Forzando el barrido (borrando `barrido.marca`), pasa a `CUMPLE`.

**Causa.** El barrido tiene cadencia —correcto: un `find /` horario sobre la
máquina del cliente es lo que prohíbe la regla vinculante 15— pero al saltárselo,
la evidencia **reemite el resultado anterior con su motivo anterior**.

**Por qué importa.** No es inseguro (el estado es `NO_EVALUABLE`, el lado seguro)
pero engaña justo cuando alguien está configurando el control: hace lo que el
mensaje pide y el mensaje no cambia.

**Arreglo / regla.** **Un mensaje al operador describe el estado de ESTA pasada.**
Reemitir un motivo cacheado engaña cuando la configuración ha cambiado en medio.

*Fuente: `Wazuh-ENS/docs/HALLAZGOS_DESPLIEGUE_REAL_2026-07-31.md` §4.*

---

## E · El motor, y por qué el número no es el que esperas

### T-41

**El corte de 10.000 hechos: el porcentaje sale MEJOR que la realidad.**

**Síntoma.** Aviso en la ficha del control, **antes** del número:

```
El veredicto se ha calculado sobre 10.000 hechos de 20.052
```

**Causa.** El motor solo trae del índice los **10.000** hechos más recientes de la
ventana (`size: 10000` en `dashboard/ens/controls/control-detail/index.tsx:143` y
en `dashboard/ens/dashboard/ens-dashboard-main.tsx:126`; es el
`index.max_result_window` por
defecto de OpenSearch). Si el agente emite más, **los más antiguos no se
cuentan**: un hallazgo anterior al corte no existe para el motor.

Antes era peor: con `size: 1000` y **17.444 alertas de op.acc.3** en la ventana,
el motor juzgaba el **6 %** de los hechos y lo presentaba como «cumplimiento de
los últimos 30 días». Una acción de hacía unas horas que quedaba fuera del corte
hacía desaparecer una incompatibilidad real y el control pasaba a 100 % él solo.

**Arreglo.** Lo que hay hoy: tope unificado a 10.000 y **aviso explícito** cuando
recorta (`hechosRecortados`). Cuando ese aviso aparece, **el número es un mínimo,
no un resultado**, y no se puede afirmar que se han auditado los 30 días
completos.

**Lo que falta, y es del producto:** reducir lo que emite el agente —un hecho por
observación distinta, no uno por repetición— o acortar el periodo de evaluación,
que cambia lo que se audita. Pedir más de 10.000 exige `search_after`.

**Cómo detectarla antes.** `wazuh-real` **ya lo dispara** siendo una máquina
tranquila (20.052 hechos en 30 días). Un servidor con actividad real lo alcanza en
días. **Este techo lo pone ENSFácil, no el sistema auditado, y empeora a escala.**

*Fuente: `dashboard/ens/controls/control-detail/index.tsx:128-145` y `:1195-1225`,
`op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §«un techo que pone ENSFácil».*

---

### T-42

**Una sola búsqueda compartida hacía que el control con más volumen se quedara con todo.**

**Síntoma.** La **lista de controles** decía que op.acc.2 era PARCIAL y, a diez
centímetros, **su ficha** decía 100 % CUMPLE. Dos pantallas del mismo producto
dando veredictos distintos del mismo control, sin que nada avisara de cuál creer.

**Causa.** El listado hacía UNA búsqueda de 10.000 hechos para los cinco controles
y evaluaba los cinco sobre ese montón. Como los hechos vienen ordenados por fecha
descendente y op.acc.3 emite casi veinte mil en la ventana, **los 10.000 más
recientes eran casi todos suyos**: op.acc.2 se quedaba con las migajas y el motor,
viendo cuatro hechos, lo declaraba PARCIAL.

Variante hermana: el Panel pedía 6.000 y la ficha 1.000, así que juzgaban
conjuntos distintos del mismo control.

**Arreglo.** **Cada fila pide lo suyo** (`controls/control-row.tsx`), que es
exactamente lo que hace la ficha, así que las dos pantallas ven el mismo conjunto
y no pueden discrepar. Y el Panel usa **el mismo tope** que el detalle. El coste
son cinco búsquedas en vez de una.

**Cómo detectarla antes.** Si dos pantallas del plugin discrepan sobre el mismo
control, sospecha del tope y del reparto de la consulta antes que del motor.

*Fuente: cabecera de `dashboard/ens/controls/control-row.tsx`,
`dashboard/ens/controls/index.tsx:145-148`,
`dashboard/ens/dashboard/ens-dashboard-main.tsx:122-126`.*

---

### T-43

**La ventana es de 30 días: arreglar la máquina no limpia el pasado.**

**Síntoma.** Se corrige el sistema y la evidencia sigue en `NO_CUMPLE`.

**Causa.** `defaultEvaluationPeriodFrom = 'now-30d'`
(`dashboard/ens/core/data-source/evaluation-time-range.ts:22`). El motor juzga
**todo lo observado en la ventana**, no el último estado.

**Caso real.** El 11/08/2026 se retiró `sudo` a `ldapcopy` y a `user`. Sus dos
últimos eventos como miembros de grupo privilegiado siguen dentro de la ventana,
así que `op.acc.4` EV-03 seguirá en `NO_CUMPLE` **hasta el 10/09**. La máquina ya
está bien; lo que aún no está limpio es el periodo auditado.

**Consecuencia práctica al declarar política.** Hay que mirar **la ventana
entera**, no la última pasada. Declarar contra lo que emite hoy el recolector deja
fuera valores que el motor sigue viendo, y la evidencia no se mueve. **Ese error
costó dos rondas enteras.**

**Lo que NO se debe hacer.** Declarar autorizado un privilegio que se acaba de
retirar, para que el número suba hoy: el hallazgo es cierto para el periodo
medido. Y acortar la ventana tampoco lo arregla — cambia el periodo auditado, y
«en el último día no hubo privilegios sin autorizar» acredita mucho menos que
treinta.

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §«Cómo se comporta el motor» punto
2.*

---

### T-44

**Con dos planos, el último evento tapa al primero.**

**Síntoma.** Un incumplimiento real desaparece del diagnóstico y el panel pide
otra cosa. Comprobado en `ldapserver.qsprueba.com` el 10/08/2026:

```
12:52:30  fim_modified    plano=sistema     NO_CUMPLE
12:52:30  evidence_state  plano=sistema     NO_CUMPLE
12:52:31  evidence_state  plano=directorio  CUMPLE      <- éste gana
```

**EV-02 salía CUMPLE con un fichero crítico cambiado.** Y el 11/08, EV-06 de
op.acc.1 emitía `sistema NO_CUMPLE` (tres cuentas con sudo sin identificador
diferenciado) y después `directorio NO_EVALUABLE`: ganaba el segundo, y el panel
pedía configurar un bind cuando lo que había que hacer era sacar tres cuentas de
sudo.

**Causa.** El motor resuelve cada evidencia con **UN SOLO evento**: el más
reciente de los compatibles (`latestEvent` en
`dashboard/ens/core/evidence/engine.ts`, que ordena por `ts` descendente y se
queda con el primero). Los `evidence_state` van por plano y el de directorio se
emite siempre después.

**Arreglo.** Cada plano registra su veredicto y al final de la pasada se emite un
`evidence_state` **consolidado** por evidencia, con el peor estado y con un `ts`
estrictamente posterior al de todos ellos. **Peor gana: `NO_CUMPLE` >
`NO_EVALUABLE` > `CUMPLE`.** Los eventos por plano se conservan enteros: el
auditor tiene que poder ver cuál de los dos falló.

**Cómo detectarla antes.** Al mirar el ndjson, filtrar por
`.plano=="consolidado"`:

```sh
sudo jq -r 'select(.event=="evidence_state" and .plano=="consolidado")
            | [.evidence_id,.estado,(.causa//"-")] | @tsv' \
  /var/log/ensfacil/op_acc_2.json | sort -u
```

*Fuente: cabecera de `op.acc.2-ldap/lib/opacc2ldap-lib.sh`,
`op.acc.1-ldap/DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` §1.*

---

### T-45

**Un requisito cumple solo si TODAS sus evidencias conforman.**

**Síntoma.** Un control con evidencias en verde marcando **0 %**.

**Causa.** En el LDAP, `op.acc.2` tiene EV-02, EV-04 y EV-07 conformes y sigue en
cero: **EV-03 aparece en los tres requisitos del control**, así que mientras no se
resuelva, el resto no puede sumar.

**Arreglo / método.** Antes de invertir esfuerzo en una evidencia, **mira a
cuántos requisitos afecta**. El panel lo dice en la línea «Lo que separa las dos
cifras».

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §«Cómo se comporta el motor» punto
1.*

---

### T-46

**Al consolidar varias máquinas, el score se quedaba con el de la primera.**

**Síntoma.** El número no refleja a la máquina peor.

**Causa.** Al consolidar varias máquinas, el score de un requisito se quedaba con
el de la primera **aunque el veredicto fuera el peor**.

**Arreglo.** Corregido. Se encontró **auditando el código, no mirando la
pantalla**, junto con el 100 % de op.acc.3 sobre una máquina sin agente (T-07).

**Cómo detectarla antes.** Los dos hallazgos de este tipo inflaban el número y
ninguno se veía en el panel. La regla: **cuando un control pase a verde sin que
nadie haya tocado la máquina, sospecha.**

*Fuente: `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` §Paso 6.*

---

### T-47

**El agente NO lee nunca la pantalla de Configuración.**

**Síntoma.** «Rellené el parámetro y no cambia nada.»

**Causa.** Es la incoherencia estructural del producto, y hay **tres almacenes que
no se sincronizan solos**:

| Dónde | Qué va ahí | Quién lo lee |
|---|---|---|
| **La pantalla** (índice `wazuh-ens-configuration`) | la política: qué está autorizado, qué plazos rigen | **el motor**, al juzgar |
| **Ficheros de la máquina** (`/etc/ensfacil/*`) | decisiones que solo tienen sentido en ESA máquina | **el agente**, al observar |
| **El `.env`** (`/etc/ensfacil/<control>.env`) | dónde mirar: rutas, umbrales de observación | el agente |

**El plugin nunca escribe en una máquina auditada y el agente nunca lee el
índice.** En op.acc.3 y op.acc.4 el `.env` no lleva política ninguna; en
op.acc.1, op.acc.2 y mp.info.6 sí queda alguna, y ahí editar la pantalla no cambia
el veredicto.

**El defecto que produjo, y que es el peor de esta familia.** `op.acc.2` del LDAP
estuvo en **0 % por diseño**: sus evidencias emitían `NO_EVALUABLE` diciendo «la
lista se declara en P-10 de la pantalla», una condición que el agente **no puede
cumplir nunca**. Se corrigió pasándolas a juzgar contra ficheros locales.

**Arreglo / regla al escribir una evidencia.** Si el veredicto lo emite el agente,
lo que necesita para decidir tiene que estar **en la máquina**. Si la política
solo puede vivir en la pantalla, la evidencia debe declarar `judgment` en el
catálogo y dejar que juzgue el motor. **Lo que no puede es pedir algo que no
alcanza.**

**Cómo detectarla antes.** Cada `CUMPLIMIENTO.md` dice cuál es cuál en su control.
Y la prueba de que el circuito entero está vivo: **cambia un parámetro en la
pantalla y mira si el color cambia sin tocar el servidor** (añade a P-04 de
op.acc.1 una cuenta que se haya autenticado: EV-03 pasa a rojo nombrándola).

*Fuente: `Wazuh-ENS/CLAUDE.md` §Trampas conocidas,
`Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` §«Los tres sitios»,
`op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §«Cómo se comporta el motor» punto 5.*

---

### T-48

**Un criterio de producto aplicado en una sola de las dos capas que evalúan.**

**Síntoma.** op.acc.1 en el dashboard: **PARCIAL 38 %, 4 no conformidades
abiertas**. Las cuatro evidencias citadas estaban en `NO_EVALUABLE`, no en
`NO_CUMPLE`. La máquina no incumplía nada: eran parámetros del cliente sin
configurar.

**Causa.** El principio *«un hueco de medida no puede fabricar un
incumplimiento»* se implementó en los tres agentes y **no en el motor del
plugin**, que recalcula por su cuenta desde las evidencias e ignora el
`score_snapshot` del agente.

Los tres commits, **cada uno en el repo de su runbook** —en `Wazuh-ENS` no
están y `git show` responde `unknown revision`— y fechados el **31/07**, no el
30/07 como dice el documento de hallazgos (comprobado el 12/08/2026):

| Commit | Repo | Fecha |
|---|---|---|
| `63ac3bc` | `op.acc.1-identificacion` | 2026-07-31 |
| `706f04c` | `mp.info.6-proxmox-backup-runbook` | 2026-07-31 |
| `26b4dd5` | `op.acc.2-requisitos-de-acceso` | 2026-07-31 |

**Arreglo / regla.** **Un criterio de producto se aplica en TODAS las capas que lo
evalúan, y en este producto son dos: el agente y el motor.** Arreglar una sola las
hace divergir.

**Nota de vigencia.** Desde el 04/08 el criterio vigente es el contrario a nivel
de **requisito**: *lo que no se puede demostrar, NO CUMPLE* (commit `5a60647`). Lo
que sigue vivo de esta trampa es el método: el veredicto no cambia, lo que se
conserva es **poder distinguirlos** — la evidencia mantiene `NO_EVALUABLE` con su
`causa` (`CATALOG`, `CONFIGURATION`, `COLLECTION`, `EVIDENCE`) y la no conformidad
lleva `origin: MEDIDA` o `NO_EVIDENCIADA`.

*Fuente: `Wazuh-ENS/docs/HALLAZGOS_DESPLIEGUE_REAL_2026-07-31.md` §2,
`Wazuh-ENS/CLAUDE.md` §Principio rector, cabecera de
`op.acc.1-identificacion/lib/opacc1-lib.sh`.*

---

### T-49

**Readmitir un nombre de evento viejo de muestra sesgada produce un falso verde.**

**Síntoma.** Una evidencia migrada se pone verde habiendo observado casi nada.

**Causa.** Al migrar, el catálogo declara `factEventTypes` incluyendo los nombres
de evento **viejos**, para no dejar ciega a la evidencia sobre lo ya indexado. Eso
es seguro **solo si entre todos cubren la misma población que el hecho nuevo**.

- Seguro: EV-03 emitía `generic_account_login` y `auth_success`, uno por
  veredicto, y entre los dos cubrían todo lo observado.
- **No seguro:** `unauthorized_user` de EV-07 solo se emitía para los
  INFRACTORES. Readmitirlo juzga sobre una muestra sesgada: `TODOS_EN_LISTA`
  diría «todas las cuentas observadas están autorizadas» en cuanto la única
  observada resultara estar hoy en la lista, **con las otras cuarenta sin
  mirar**.

**Es la forma de falso verde que esta migración estuvo más cerca de producir.**

**Arreglo.** Antes de readmitir un nombre viejo, comprobar que su población es la
misma. Y un agregado sin el campo que se lee (`authorized_list_check` no trae
`usuario`) tampoco entra: dejaría la evidencia en `NO_EVALUABLE` permanente.

*Fuente: `Wazuh-ENS/docs/MIGRAR_UNA_EVIDENCIA.md` §4.*

---

### T-50

**Una evidencia migrada que sigue emitiendo `evidence_state` en algún sitio.**

**Síntoma.** La evidencia se pone verde sin contrastar nada.

**Causa.** Al migrar, **el corte tiene que ser total en los dos lados**: la
evidencia no emite `evidence_state` propio **ni en el recolector, ni en
`score.py`, ni en el watchdog, ni en el simulador**. Como el hecho crudo ya no
lleva `estado`, la regla «latido sin incumplimientos ⇒ CUMPLE» de `score.py`
daría la evidencia por verde sin contrastar nada.

**Arreglo.** Los cuatro sitios. Y si el requisito lo acreditaba **solo** esa
evidencia, sale del denominador del score del agente (`REQ_DELEGADOS`): dejarlo
dentro como `NO_EVALUABLE` pondría el score en PARCIAL permanente en toda máquina
sana, que es un `NO_CUMPLE` falso.

**Cómo detectarla antes.** `check-coherencia.py` lo vigila (comprobación 11 para
op.acc.4) y falla si alguien reintroduce un veredicto. Y la prueba de aceptación
de toda migración:

> **Cambiar el parámetro en la pantalla cambia el veredicto, sin tocar el
> agente.**

*Fuente: `Wazuh-ENS/docs/MIGRAR_UNA_EVIDENCIA.md` §«las tres reglas que no se
negocian» y §5, `Wazuh-ENS/CLAUDE.md`.*

---

### T-51

**Un latido fechado en el futuro daría verde perpetuo con el agente apagado.**

**Síntoma.** Potencial, y cerrado antes de producirse: aserciones negativas en
verde para siempre.

**Causa.** `resolveCollectorCoverage` decide si la ausencia de hechos puede ser
`CUMPLE`. La ventana necesita **cota superior** además de inferior: sin ella, un
latido fechado en 2099 valdría como latido perpetuo.

**Arreglo.** Cota superior con tolerancia de reloj (ahora + 5 min).

**Y lo relacionado, que sí es operativo:**

| Cobertura | Cuándo |
|---|---|
| `CONFIRMADA` | el latido declara `resultado=completada` **y** la evidencia figura en `evidencias_cubiertas` |
| `AUSENTE` | el latido declara un fallo |
| `DESCONOCIDA` | no hay latido, o no declara resultado, o no declara qué llegó a mirar |

Un latido que no declara qué miró no demuestra cobertura: demuestra que el agente
es **más viejo que el contrato**.

*Fuente: `Wazuh-ENS/docs/MIGRAR_UNA_EVIDENCIA.md` §8.*

---

### T-52

**El `ruleType` equivocado es un fallo SILENCIOSO.**

**Síntoma.** Compila, despliega y evalúa mal sin avisar.

**Causa.** Un modelo coder tiende a poner `COVERAGE_REQUIRED` genérico. Los
`ruleType` con semántica imperativa (`MAX_AGE`, `MIN_RETENTION`, `WHITELIST`,
`CONDITIONAL_REQUIRED`…) necesitan además código que los ejecute; sin él, el
requisito cae al rollup de evidencias.

**Arreglo.** Para controles a producción, fijarlo en la hoja `Motor` del Excel
(columnas `requisito | ruleType`), que el generador ya busca.

> **Dónde vive eso HOY, que no es donde lo dice la documentación vieja.**
> `CLAUDE.md` y `ENS_CONTROL_DEPLOYMENT.md` hablan de «un módulo de runtime en
> `core/policy-runtime/runtime/`», y `AUDITORIA_FASE_0.md:554` cita
> `mp-info-6.runtime.ts:965-973`. **Ese directorio y ese fichero NO EXISTEN en
> `main`** (comprobado el 12/08/2026: `find` no devuelve ninguno). Son de la
> rama `coherencia-estructura-controles`, y la propia cabecera de
> `AUDITORIA_FASE_0.md:8-11` avisa de que `policy-runtime/runtime/` «no aplica a
> lo desplegado». En `main` la semántica de los `ruleType` vive en
> `core/policy-runtime/policy-runtime.ts` (2.115 líneas) y en
> `core/policy-runtime/policies/<control>.policy.ts`.

**Riesgo hermano, y sí está vivo en `main`.** En
`core/evaluation/requirement/requirement-evaluator.ts:214-224` la decisión de la
policy **sustituye al rollup de evidencias Y a la protección de parámetros
ausentes**:

```ts
const measurement = policyDecision
  ? policyDecision.status
  : resolveMeasurement(
      requirement.evidenceIds,
      requirementEvidences,
      hasMissingRequiredParameters   // <- este argumento se pierde si hay decisión
    );
```

Por eso un constructor de decisiones tiene que devolver `[]` —no una decisión
`NO_EVALUABLE`, y desde luego no `CUMPLE`— cuando le falte el parámetro o la
variable. Devolver `[]` cede el requisito al rollup, que ya sabe caer a
`NO_EVALUABLE`. Un módulo mal construido produce un `CUMPLE` falso en vez de
degradar. **El caso observable de esto es T-69.**

*Fuente: `Wazuh-ENS/CLAUDE.md`, `Wazuh-ENS/docs/ENS_CONTROL_DEPLOYMENT.md` §Aviso
crítico, `Wazuh-ENS/docs/AUDITORIA_FASE_0.md` §3.2 (con su aviso de vigencia);
el código de `requirement-evaluator.ts` comprobado el 12/08/2026.*

---

### T-53

**Pasar un control a `ACTIVE` antes de que su agente emita pone el índice del cliente a 0 %.**

**Síntoma.** Un control nuevo hunde el número del cliente.

**Causa.** `status: 'DRAFT'` **no es una etiqueta, es un mecanismo del motor**:
`evaluateRequirement` marca no aplicable todo requisito de un control que no esté
`ACTIVE`, así que el control sale `NO_APLICA` —sin número, no un 0— y
`scoreAverage` lo excluye. Acusarlos de incumplir sería acusar de no probar
aquello para lo que todavía no existe el instrumento.

**Arreglo.** Se pasan a `ACTIVE` cambiando una línea en `catalog/<control>.ts`,
**el día que su agente emita y sus reglas estén desplegadas**. Prueba:
`tests/control-en-borrador.test.ts`.

**Estado real hoy, y contradice a `CLAUDE.md`.** Comprobado el 12/08/2026:
**los cinco controles están en `ACTIVE`.**

```bash
grep -n "status:" dashboard/ens/catalog/*.ts
# catalog/op-acc-3.ts:12:  status: 'ACTIVE',
# catalog/op-acc-4.ts:12:  status: 'ACTIVE',
```

op.acc.3 y op.acc.4 pasaron a `ACTIVE` el **06/08/2026**, commit `43854db`
(«op.acc.3 y op.acc.4 pasan a ACTIVE, y la prueba deja de fijar el estado del
día»), el mismo día que entraron. La tabla «Controles implementados» de
`Wazuh-ENS/CLAUDE.md` sigue marcándolos **DRAFT**: está desactualizada, no te
fíes de ella. El informe medido del 12/08 lo confirma por el otro lado —los dos
controles puntúan en las dos máquinas: op.acc.3 100 % y op.acc.4 20 % en
`zimbraHldap`—, y un control en DRAFT no puntúa, sale `NO_APLICA`.

**Cómo detectarla antes.** Antes de cambiar esa línea, la pregunta es
verificable y no opinable: ¿hay alertas de la banda del control en el manager de
ese cliente?

```bash
sudo grep -oE '"id":"1071[0-9]{2}"' /var/ossec/logs/alerts/alerts.json | wc -l
```

Cero alertas y `ACTIVE` a la vez es el modo exacto de hundir el índice del
cliente con un control que nadie ha ido a medir.

*Fuente: `Wazuh-ENS/CLAUDE.md` §Controles implementados (para el mecanismo; su
tabla de estados está caducada), `tests/control-en-borrador.test.ts`, y el propio
catálogo comprobado el 12/08/2026.*

---

## F · La máquina auditada

### T-54

**Sacar a alguien del grupo `sudo` no le quita el privilegio si tiene concesión nominal.**

**Síntoma.** La evidencia pasa a verde y **la cuenta sigue siendo root**. Es la
peor clase de fallo: *la forma más rápida de «cumplir» era una que no cambia el
riesgo en absoluto*.

**Causa.** En una máquina desplegada a mano —que es el caso de casi cualquier
servidor de directorio— las concesiones nominales de `sudoers` son la forma
habitual, y son **invisibles para `id -nG`**:

```
/etc/sudoers.d/dioni-ensfacil:   ldap-zimbra ALL=(ALL) NOPASSWD:ALL
```

**Arreglo.** Desde el 11/08/2026 la evidencia analiza también esas concesiones
(`_opacc1ldap_sudo_nominal` recorre `/etc/sudoers` y `/etc/sudoers.d/*` buscando
concesiones por nombre y por uid, `#1002`), así que ya no se puede «cumplir»
quitando el grupo y dejando la línea.

**Y sabe distinguir.** Una regla acotada a un binario —
`%zimbra ALL=NOPASSWD:/opt/zimbra/libexec/zmstat-fd *`— es privilegio
proporcionado y **no** se marca. Solo se consideran equivalentes a root las que
terminan en un `ALL` de órdenes.

**Cómo detectarla antes.**

```sh
sudo grep -rhE "NOPASSWD|ALL=" /etc/sudoers /etc/sudoers.d/ | grep -v '^#'
```

> Una evidencia que se puede satisfacer sin mejorar nada es peor que no tenerla,
> porque certifica lo contrario de lo que mira.

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §Paso 3,
`op.acc.1-ldap/DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` §3.*

---

### T-55

**Reescribir `sudoers.d` con `sudo tee` surte efecto en mitad del propio comando.**

**Síntoma.** Los `sudo` que vengan detrás **en la misma línea** ya fallan.

**Causa.** El cambio es inmediato: `sudo` relee la política en la siguiente
invocación.

**Arreglo.** Dejarlo como **última operación de esa sesión**, o hacerla desde la
cuenta nueva.

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §Paso 3, «Trampa verificada».*

---

### T-56

**Retirar el privilegio antes de comprobar la cuenta nueva deja la máquina sin administración remota.**

**Síntoma.** Se pierde el acceso administrativo en remoto.

**Causa.** Separar la identidad nominal de la administrativa toca **la propia
cuenta desde la que se trabaja**.

**Arreglo. El orden importa y no es paranoia:**

```sh
# 1· las cuentas que NO deben administrar, fuera de sudo
sudo deluser ldapcopy sudo
sudo deluser user     sudo

# 2· identidad administrativa diferenciada para quien SÍ administra
sudo useradd -m -s /bin/bash -c "Identidad administrativa diferenciada (ENS op.acc.1.2)" ldap-zimbra.adm
sudo usermod -aG sudo ldap-zimbra.adm
sudo install -d -m 700 -o ldap-zimbra.adm -g ldap-zimbra.adm /home/ldap-zimbra.adm/.ssh
sudo cp /home/ldap-zimbra/.ssh/authorized_keys /home/ldap-zimbra.adm/.ssh/
sudo chown ldap-zimbra.adm: /home/ldap-zimbra.adm/.ssh/authorized_keys
sudo chmod 600 /home/ldap-zimbra.adm/.ssh/authorized_keys

# 3· VERIFICAR que se entra por la nueva ANTES de quitar nada
ssh ldap-zimbra.adm@<host> 'sudo -n true && echo OK'

# 4· solo entonces, retirar el privilegio de la nominal
sudo deluser ldap-zimbra sudo
```

**El paso 3 es la red.**

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §Paso 3.*

---

### T-57

**El corte por UID < 1000 esconde justo a la cuenta que importa.**

**Síntoma.** El inventario sale limpio y el control en verde, sin ruido y sin
aviso.

**Causa.** El runbook de Linux ignora toda cuenta con `uid < 1000`. En
`ldapserver.qsprueba.com`, **`zimbra` tiene uid 999 y shell `/bin/bash`**: es la
cuenta que **ejecuta `slapd`** y la dueña de `/opt/zimbra` entera. Quien la
controla lee y modifica todas las identidades de la organización **sin tocar una
sola ACL**.

**Arreglo.** En los runbooks LDAP el criterio pasa a ser **«¿puede iniciar
sesión?»** en vez del rango del uid. Las cuentas de servicio no se esconden por
número: se **declaran** en P-03 (`cuentas_servicio_definidas`), donde el auditor
las ve.

> Esconder y declarar producen el mismo número y no son lo mismo. Una lo oculta
> del informe; la otra lo pone delante del auditor con su justificación.

**Relacionado.** Por eso `/bin/sync` está en la lista de shells que no permiten
sesión (T-31): sin él, la cuenta `sync` de Debian entraría en el inventario.

*Fuente: `op.acc.1-ldap/DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` §2, cabecera de
`op.acc.1-ldap/lib/opacc1ldap-lib.sh`.*

---

### T-58

**Endurecer la máquina cambia ficheros que el propio control vigila.**

**Síntoma.** La secuencia que más desconcierta la primera vez:

1. `op.acc.2` EV-01 no conforma: `umask 022` frente al `027` que exige P-07.
2. Se corrige en `/etc/login.defs`. **EV-01 pasa a CUMPLE.**
3. **Y EV-02 pasa a NO_CUMPLE**, porque `/etc/login.defs` es una de las rutas
   críticas de P-02 y el control de integridad acaba de ver que ha cambiado.

**Causa.** No es un fallo: es el producto funcionando. Un cambio en un fichero
vigilado se reporta SIEMPRE, lo haga un atacante o el administrador.

**Arreglo.** El hallazgo se emite UNA vez y la siguiente pasada sustituye la línea
base por la foto nueva:

```bash
sudo cp /etc/login.defs /etc/login.defs.antes-ens-$(date +%Y%m%d)
sudo sed -i 's/^UMASK\t\t022/UMASK\t\t027/' /etc/login.defs

sudo /usr/local/bin/ens_opacc2_collect.sh
sudo bash -c 'set -a; . /etc/ensfacil/opacc2.env; exec /usr/local/bin/ens_opacc2_score.py'
```

**Cómo detectarla antes / la advertencia que importa.** **Comprueba que el cambio
es el tuyo antes de volver a pasarlo.** Re-sellar la línea base sobre un cambio
que no reconoces es exactamente cómo se pierde una intrusión. Y guarda la copia
previa: es lo que enseña un auditor cuando pregunta qué había antes.

**Sobre el umask.** `022` crea ficheros 644, legibles por cualquier usuario;
`027` los crea 640. Solo afecta a ficheros NUEVOS y a procesos que arranquen
después, así que los demonios ya arrancados —Zimbra— no se enteran.

*Fuente: `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` §Paso 4,
`Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md`,
`op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §Paso 4.*

---

### T-59

**En Zimbra el socket de slapd NO está en `/var/run/ldapi`.**

**Síntoma.** `ldapsearch -Y EXTERNAL` no encuentra el socket.

**Causa.** Zimbra arranca slapd con su propia ruta de estado.

**Arreglo.** El socket es:

```
/opt/zimbra/data/ldap/state/run/ldapi
```

```sh
S="ldapi://%2Fopt%2Fzimbra%2Fdata%2Fldap%2Fstate%2Frun%2Fldapi"
sudo ldapsearch -LLL -Y EXTERNAL -H "$S" -b "dc=qsprueba,dc=com" "(objectClass=zimbraAccount)"
```

Sobre ese socket, `SASL EXTERNAL` autentica por identidad de proceso: **no hay
bind DN ni contraseña**. Nada que guardar, nada que filtrar en un log, nada que
rotar.

**Cómo detectarla antes.** Se saca de la línea de arranque, no del manual:

```sh
sudo ps -eo args | grep "[s]lapd"      # mira -h (escuchas), -F (config), -l (log)
sudo find /opt/zimbra -name ldapi
```

**Verificado hoy (12/08/2026) en `ldap-adm`:**

```
/opt/zimbra/common/libexec/slapd -l LOCAL0 -h ldap://ldapserver.qsprueba.com:389 ldapi:/// -F /opt/zimbra/data/ldap/config
srwxrwxrwx 1 zimbra zimbra 0 ago 12 08:52 /opt/zimbra/data/ldap/state/run/ldapi
```

*Fuente: `op.acc.1-ldap/DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` §6,
`op.acc.1-ldap/etc/opacc1-ldap.env.example`; comprobado en la máquina.*

---

### T-60

**`zmprov` falla con `Connection refused` porque busca 127.0.0.1.**

**Síntoma.** `zmprov` no conecta con el directorio de su propia máquina.

**Causa.** `zmprov` busca `127.0.0.1:389` mientras **slapd solo escucha en la IP
de la máquina**. Verificado hoy: la línea de arranque es
`-h ldap://ldapserver.qsprueba.com:389 ldapi:///` — no hay `localhost`.

**Arreglo.** No usar `zmprov`: el socket local (T-59) esquiva el problema entero y
además no necesita credencial.

*Fuente: `op.acc.1-ldap/DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` §6; comprobado en la
máquina el 12/08/2026.*

---

### T-61

**`cn=config` devuelve «No such object» incluso siendo root.**

**Síntoma.** `ldapsearch -Y EXTERNAL -b cn=config` → `No such object (32)`.

**Causa.** La base de configuración lleva `olcAccess: {0}to * by * none`, y el
bind EXTERNAL del socket (`gidNumber=0+uidNumber=0,cn=peercred,...`) **no es su
rootDN**. Que la política no se pueda leer por la red **es lo correcto**.

**Arreglo.** Se lee **en disco como root**, de los `.ldif` de
`/opt/zimbra/data/ldap/config` (`OPACC3LDAP_CONFIG_DIR` / `OPACC4LDAP_CONFIG_DIR`
/ `OPACC1LDAP_CONFIG_DIR`). Es la misma información y no hace falta ninguna
credencial.

**Lo que sigue sin poder leerse** —ni por disco ni por socket— son los **miembros**
de los roles: `cn=zimbra` no es legible por el socket y no está en disco. Eso se
declara `NO_EVALUABLE` con causa `CONFIGURATION` diciendo qué falta. **Jamás se da
por bueno.**

*Fuente: cabeceras de `op.acc.3-ldap/lib/opacc3ldap-lib.sh` y
`op.acc.4-ldap/lib/opacc4ldap-lib.sh`.*

---

### T-62

**Leer a medias `cn=config` produce una conclusión falsa.**

**Síntoma.** El recolector concluía «no hay módulo `accesslog` cargado». **Falso**:
sí lo estaba.

**Causa.** En Zimbra el directorio `cn=config/` es 755 pero los LDIF de dentro son
**600 `zimbra:zimbra`**, mientras que los de los overlays, en un subdirectorio,
son legibles por todos. Sin privilegios el análisis salía **no vacío** —traía los
tres overlays— y por eso nadie sospechaba.

**Arreglo.** *La configuración de slapd, o entera o nada*: si no se puede leer
todo, se degrada. Es uno de los seis controles positivos del recolector de
op.acc.3-ldap.

**El hermano del mismo tipo.** Sin `/etc/sudoers` (440 root:root) nadie sale
root-equivalente y las cuentas que administran la máquina quedarían **sin ninguna
capacidad emitida**: el motor las vería sin funciones y no habría nada que cruzar.
**Un CUMPLE fabricado por no poder leer un fichero.**

**Cómo detectarla antes.** Los cuatro últimos controles positivos salieron de la
verificación adversarial del 10/08/2026, que los reprodujo **ejecutando**, no
leyendo.

*Fuente: `op.acc.3-ldap/CUMPLIMIENTO.md` §«Cómo se sabe que el recolector no está
mintiendo».*

---

### T-63

**Tener TLS declarado no es exigirlo — y exigirlo de golpe deja fuera a Zimbra.**

**Síntoma.** Dos, y son opuestos:

- Se hace `grep olcTLS` sobre la configuración de slapd, salen siete líneas, y se
  concluye que el canal está protegido. **No lo está.**
- Y al revés: se pone `olcSecurity: ssf=128` para arreglarlo y los servicios de
  Zimbra, que conectan por `ldap://`, dejan de funcionar.

**Causa.** `olcSecurity='ssf=0'` y una escucha en claro. El servidor **no exige**
ningún cifrado mínimo, así que un cliente que no pida StartTLS hace un bind
simple en claro y slapd lo acepta: las credenciales viajan en claro por la red
interna. Es un incumplimiento **real** de op.acc.2 EV-01 (plano directorio), no
un hueco de medida.

> **CORRECCIÓN DE UNA AFIRMACIÓN QUE ESTÁ EN DOS DOCUMENTOS DEL REPO.**
> `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §6.3 y el informe
> `Wazuh-ENS/informes/estado-por-evidencia.html` dicen **«cero líneas `olcTLS*`
> en toda la configuración»**. **Es falso**, y esta versión del documento lo
> corrige. Medido en `ldap-adm` el 12/08/2026:
>
> ```
> /opt/zimbra/data/ldap/config/cn=config.ldif
>   18: olcLocalSSF: 128
>   21: olcSecurity: ssf=0
>   28: olcTLSCertificateFile: /opt/zimbra/conf/slapd.crt
>   29: olcTLSCertificateKeyFile: /opt/zimbra/conf/slapd.key
>   30: olcTLSCACertificatePath: /opt/zimbra/conf/ca
>   31: olcTLSProtocolMin: 3.1
>   32: olcTLSCipherSuite: MEDIUM:HIGH
>   33: olcTLSCRLCheck: none
>   34: olcTLSVerifyClient: never
> ```
>
> Hay **siete** directivas `olcTLS*`, y el certificado y la clave existen
> (`-rw-r----- zimbra:zimbra`). El propio recolector lo dice y es quien tiene
> razón — cabecera de `op.acc.2-ldap/lib/opacc2ldap-lib.sh:1330-1333`:
> *«Mirar solo si hay `olcTLS*` declarado es el error que hay que evitar: en
> esta máquina HAY certificado, clave y CA declarados y StartTLS funciona
> (comprobado con `LDAPTLS_REQCERT=never` el 10/08/2026), y aun así las
> credenciales viajan en claro, porque **tener TLS disponible no es
> exigirlo**.»*

**La trampa de verdad, entonces, es la contraria.** Quien haga `grep olcTLS` y
vea siete líneas concluirá que el canal está protegido. No lo está. El
recolector mira **tres cosas y hacen falta las tres**, porque cada una por su
cuenta miente:

| Qué | Valor medido el 12/08/2026 | Qué significa |
|---|---|---|
| `olcSecurity` | `ssf=0` | el servidor **no exige** ninguna fuerza de cifrado |
| `olcLocalSSF` | `128` | fuerza acreditada al socket local, que **no viaja por red**: no cuenta como escucha en claro |
| escuchas `-h` | `ldap://ldapserver.qsprueba.com:389 ldapi:///` | **no hay `ldaps://636`**; `ss -lntp` confirma que slapd solo escucha en `192.168.10.10:389` |

El veredicto sale `NO_CUMPLE` cuando hay al menos una escucha `ldap://` **y**
`ssf < OPACC2LDAP_SSF_MINIMO` (por defecto `128`). Las dos condiciones se
cumplen hoy.

**Arreglo, en este orden.** El primer paso **ya está hecho** —los certificados
existen—, así que la acción real empieza en el segundo:

1. ~~Certificados~~ · ya declarados (`slapd.crt`, `slapd.key`, CA en
   `/opt/zimbra/conf/ca`).
2. Habilitar la escucha `ldaps://636` (o exigir StartTLS) y comprobar que los
   servicios de Zimbra siguen conectando.
3. **Entonces**, y no antes, `olcSecurity: ssf=128`. Ponerlo primero deja fuera
   a los propios servicios de Zimbra, que conectan por `ldap://`.

Los pasos 2 y 3 escriben en `cn=config`, así que exigen la credencial de
administración de Zimbra, **que el cliente prohíbe usar**: hoy esto está
bloqueado por permiso, no por técnica. Decirlo así es lo correcto; declararlo
resuelto no lo sería.

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §6.3 (con la corrección de arriba),
cabecera de `op.acc.2-ldap/lib/opacc2ldap-lib.sh` §«el acceso por red exige canal
protegido»; medido en `ldap-adm` el 12/08/2026.*

---

### T-64

**Declarar como política una foto de lo que hay bendice la desviación.**

**Síntoma.** El panel se pone verde y no se ha mejorado nada. En el peor caso, se
declara autorizada la puerta trasera de un sistema ya comprometido.

**Causa.** Sembrar un parámetro con lo que la máquina tiene, sin revisarlo.

**Arreglo. La revisión ES el control.** Los tres casos concretos de `wazuh-real`:

- **op.acc.2 P-10 (SUID/SGID)**: se enumeraron, se revisaron **uno a uno** contra
  el juego estándar de Ubuntu 24.04, y **entonces** se declararon. Salieron 21,
  todos conocidos, ninguno en `/opt` ni en un `home`.

  ```bash
  sudo find /usr /bin /sbin /opt -xdev \( -perm -4000 -o -perm -2000 \) -type f | sort
  ```

- **op.acc.2 P-08 (derechos por recurso)**: los permisos que el responsable
  **exige** (`/etc/shadow 640 root:shadow`, `/etc/sudoers 440 root:root`…), no una
  foto. Si se hubiera sembrado con lo que había, cualquier desviación previa
  quedaría bendecida.

- **op.acc.4 P-01 (matriz de privilegios)**: se declaró **solo lo legítimo**.
  Faltaban `%sudo` y `syslog` en `adm`, y sin ellos EV-03 y EV-08 acusaban a dos
  cosas legítimas. **Los dos `ALL=(ALL) NOPASSWD:ALL` NO se declararon, a
  propósito**: son un privilegio por encima del mínimo y EV-02 tiene razón al
  señalarlos.

  ```bash
  sudo grep -rhE '^[^#].*ALL' /etc/sudoers /etc/sudoers.d/ | grep -v '^Defaults'
  ```

**Cómo detectarla antes.** **Un hallazgo falso es tan grave como un CUMPLE
falso.** La política tiene que describir la máquina, no una máquina ideal: si
declaras un ACL «correcto» que el sistema no tiene, no has mejorado nada, has
fabricado una desviación que nadie puede cerrar.

*Fuente: `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` §Paso 2,
`Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md`.*

---

### T-65

**«Cero bajas» no es lo mismo que «no llevo registro».**

**Síntoma.** op.acc.1 EV-04 mide el plazo de deshabilitación tras una baja. En una
máquina donde nunca se ha ido nadie, el recolector la dejaba `NO_EVALUABLE` **para
siempre**.

**Causa.** Se confundían tres situaciones distintas: registro **ausente**,
registro **declarado y vacío**, y registro **con contenido**.

**Arreglo.** Basta con que el fichero exista. Su presencia declara que ahí es
donde se anotan las bajas:

```bash
sudo tee /var/lib/ensfacil/opacc1/bajas.tsv >/dev/null <<'EOF'
# Bajas de personal declaradas a mano (P-09 de la pantalla).
# Una fila por persona: usuario<TAB>AAAA-MM-DD.
# El fichero EXISTE aunque no haya ninguna baja: su presencia declara que aquí
# es donde se anotan, y su ausencia es lo que deja EV-04 sin medir.
EOF
sudo chmod 640 /var/lib/ensfacil/opacc1/bajas.tsv
```

EV-04 pasa a `CUMPLE` con el motivo escrito: *la fuente está declarada y se ha
consultado; no consta ninguna baja, así que no hay ningún plazo que se haya
podido incumplir.* En cuanto haya una baja fuera de plazo, la misma función la
acusa.

**Y en el LDAP vale también para el plano directorio:** sin bajas da igual no
poder leer `zimbraAccountStatus`, porque no hay ninguna cuenta cuyo plazo
comprobar. El atributo solo hace falta cuando **sí** hay bajas.

**Por eso el instalador NO crea el fichero**: crearlo es la declaración, y esa la
hace la organización.

*Fuente: `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` §Paso 5, commit `fa0beae` de
`op.acc.1-ldap`.*

---

### T-66

**Y lo contrario: hay evidencias donde un fichero vacío NO acredita nada.**

**Síntoma.** Se intenta cerrar op.acc.4 EV-05 con el truco de T-65 y no funciona
— correctamente.

**Causa.** EV-05 exige que la revisión periódica de permisos **haya ocurrido**. El
ENS pide una **acción**, no la ausencia de un evento. Por eso
`opacc4-revisiones.tsv` se dejó con cabeceras y un comentario explicando por qué
está vacío.

**Arreglo.** Cuando se haga la revisión de verdad, se anota:

```
# fecha<TAB>alcance<TAB>responsable
2026-08-11	Sistema operativo y directorio LDAP de ldapserver.qsprueba.com	dioni.quer
```

El agente lee `/etc/ensfacil/opacc4-ldap-revisiones.tsv` (modo 640), toma la fila
más reciente y emite `fecha`, `alcance` y `responsable`; el motor comprueba que no
sea más antigua que los días de P-03. Merece la pena poner en los comentarios qué
se revisó y qué se cambió, para que un auditor lo contraste con el ndjson.

**La regla.** *Inventarse una fila con una fecha falsa es exactamente el CUMPLE
falso que este producto existe para no dar.*

*Fuente: `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` §Paso 5 y §«Lo que no subió»,
`op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §EV-05.*

---

### T-67

**En LDAP, P-07 tiene que cubrir las DOS poblaciones.**

**Síntoma.** EV-07 da hallazgo con una lista de usuarios aparentemente completa.

**Causa.** P-07 se contrasta con primitiva `TODOS_EN_LISTA` contra los
`account_active` que emite el recolector, y **el recolector emite las dos
poblaciones**: las identidades del sistema y las del directorio. Declarar solo
una deja la otra fuera de la lista y EV-07 da hallazgo.

**Arreglo.** Declararlas todas. **No copies un número de ningún documento:
cuéntalas en la máquina**, porque se mueve. `CUMPLIMIENTO_TOTAL.md` §Paso 5 dice
«las diez identidades, 5 del sistema y 5 del directorio»; el informe medido del
12/08/2026 dice «las **12** cuentas activas figuran en la lista autorizada
P-07», porque en medio se creó `ldap-zimbra.adm` (T-56) y cambió el censo. Las
dos cifras fueron ciertas el día que se escribieron.

```sh
# la población real de ESTA pasada, que es contra la que se juzga
sudo jq -r 'select(.event=="account_active") | [.plano, .usuario] | @tsv' \
  /var/log/ensfacil/op_acc_1.json | sort -u
```

Y ojo con T-02: la columna *Usuario* es `identifier`, un solo token sin espacios
ni comas — **un espacio ahí invalida el parámetro entero y tumba el control a
0 %**.

**La regla.** Cualquier control cuya evidencia sea «todos los observados están
en la lista» tiene un censo que cambia cada vez que alguien crea o borra una
cuenta. Recuéntalo después de cada cambio de identidades, y **especialmente
después de aplicar T-56**, que crea una cuenta nueva a propósito.

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §Paso 5;
`Wazuh-ENS/informes/estado-por-evidencia.html` (medido 12/08/2026), que da otra
cifra por el motivo dicho arriba.*

---

### T-68

**La ventana de una pasada empieza en el latido ANTERIOR, no en el último.**

**Síntoma.** Se filtra el ndjson por `.ts >= <último latido>` para ver qué valores
hay que declarar, y sale vacío: **da la impresión de que el recolector no emitió
nada**.

**Causa.** El `collector_run` es **el último evento de la pasada**, no el primero.
Filtrar desde él deja fuera todos los hechos de esa pasada.

**Arreglo.** Tomar el penúltimo latido:

```sh
TS=$(sudo jq -r 'select(.event=="collector_run")|.ts' /var/log/ensfacil/op_acc_4.json | tail -2 | head -1)
for campo in recurso sujeto usuario actor; do
  echo "── .$campo"
  sudo jq -r --arg ts "$TS" "select(.ts>\$ts and .$campo!=null)|\"  \(.evidence_id) \(.$campo)\"" \
    /var/log/ensfacil/op_acc_4.json | sort -u
done
```

**Y recuerda T-43**: para declarar política hay que mirar **la ventana de 30
días**, no solo la última pasada.

*Fuente: `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` §op.acc.4.*

---

### T-69

**Un control con evaluador de policy puede marcar 100 % con evidencias en gris.**

**Síntoma.** El espejo exacto de T-45, y desconcierta igual por el otro lado.
Medido en `zimbraHldap` el 12/08/2026:

```
op.acc.3 · Segregación de funciones     100 % · 2 de 2 requisitos
   EV-02  NO_EVALUABLE
   EV-07  NO_EVALUABLE
```

Dos evidencias sin medir y el control entero en verde. En cualquier otro control
eso sería un `CUMPLE` falso.

**Causa.** Aquí **no lo es**, y la razón es la del T-52: cuando un requisito
tiene decisión de policy, esa decisión **sustituye al rollup de evidencias**
(`requirement-evaluator.ts:214-224`). op.acc.3 es el **único** control con
evaluador propio (`core/policy-runtime/policies/op-acc-3.policy.ts`) porque su
hecho no significa nada suelto: «jgomez ejecutó `git push`» no incumple; incumple
si esa misma cuenta ejerce además una función incompatible en la ventana. La
policy sí midió —las 10 cuentas observadas, ninguna aunando funciones
incompatibles—, así que el 100 % está respaldado por una medida, solo que no por
la que se lee en la lista de evidencias.

**Por qué está aquí de todos modos.** Porque es **el único sitio del producto
donde el semáforo verde no se puede auditar leyendo las evidencias**, y por tanto
el único donde un módulo de policy mal construido daría un `CUMPLE` falso sin que
nada en pantalla lo delate. La comprobación no es mirar las evidencias, es leer
el motivo de la decisión:

```sh
# ¿sobre cuántas cuentas dice haber decidido la policy?
sudo jq -r 'select(.event=="account_action") | .usuario' \
  /var/log/ensfacil/op_acc_3.json | sort -u | wc -l
```

Si ese recuento es **cero**, el 100 % no está respaldado por nada y hay que
sospechar: es exactamente el caso que T-07 cerró exigiendo un latido
`collector_run` de las últimas 24 horas antes de dejar que el silencio acredite.

**La regla.** *Un requisito resuelto por policy hay que auditarlo por su
población observada, no por el color de sus evidencias.* Y al escribir una
policy, devolver `[]` cuando falte el dato (T-52): ceder al rollup es degradar;
decidir sin datos es fabricar.

*Fuente: `Wazuh-ENS/informes/estado-por-evidencia.html` §«por qué op.acc.3 marca
100 % con dos evidencias sin medir» (medido 12/08/2026),
`Wazuh-ENS/CLAUDE.md` §Controles implementados,
`dashboard/ens/core/evaluation/requirement/requirement-evaluator.ts:214-224`.*

---

## Las ocho reglas de método que salen de todo lo anterior

Están dispersas por las entradas; juntas son el resumen operativo.

1. **Un evento que pasa a ser load-bearing exige revisar su cadena entera**,
   empezando por si llega al índice. (T-21)
2. **Un criterio de producto se aplica en las DOS capas que evalúan**, agente y
   motor. Si solo se toca una, divergen. (T-48)
3. **Un mensaje al operador describe el estado de ESTA pasada.** Reemitir un
   motivo cacheado engaña cuando la configuración ha cambiado en medio. (T-40)
4. **Lo que el contenedor no puede validar hay que listarlo antes de desplegar**,
   no descubrirlo después. Se hizo el 31/07 y funcionó: `auditd` y SCA fueron los
   primeros que se comprobaron, y el fixture de `auditctl -l` resultó correcto.
5. **Los valores por defecto de las plantillas son decisiones de producto**, no
   relleno: determinan la primera lectura de cada cliente. (El `umask 027` de la
   plantilla frente al `022` de Ubuntu produce la primera no conformidad de todo
   cliente nuevo, y es una no conformidad **correcta**.)

Y las tres del propio despliegue:

6. **Comprueba entre paso y paso, no al final.** (T-09, T-10, T-11)
7. **Cuando un control pase a verde sin que nadie haya tocado la máquina,
   sospecha.** El silencio solo acredita si consta que se barrió. (T-07, T-23,
   T-46)
8. **Un script que puede destruir datos del cliente no avisa: pregunta.** El
   defecto tiene que ser el seguro. (T-04)

---

## Qué SÍ se ha ejecutado, y contra qué

Para que el lector sepa qué peso tiene cada afirmación:

- **`python3 tests/check-coherencia.py`** corre y devuelve `coherencia OK`
  (rc=0), con sus 13 comprobaciones. Los comandos de T-19 y T-20 funcionan.
- **Los dos guiones Python de T-01 y T-02** se han ejecutado contra un documento
  de configuración de prueba: detectan el `value: null` y enumeran las columnas.
- **El bloque `jq` de T-68** se ha ejecutado contra un ndjson de prueba y
  devuelve los valores de la pasada, no vacío.
- **En `ldap-adm` (solo lectura):** línea de arranque de slapd, `stat` del socket
  `ldapi`, `getent passwd zimbra` (uid 999, `/bin/bash`), permisos de
  `cn=config/` y de sus LDIF, `cn=module{0}.ldif` con `accesslog.la` cargado,
  las siete directivas `olcTLS*`, `olcSecurity`/`olcLocalSSF`, y `ss -lntp`
  (slapd solo en `192.168.10.10:389`). Confirman T-57, T-59, T-60, T-61, T-62 y
  **desmienten la causa que T-63 traía**.
- **En el repo:** los números de línea de T-01, T-02, T-41, T-42, T-43, T-44 y
  T-52; el contenido literal de la regla `106824` en los dos ficheros (T-19); la
  regla `106902` (T-17); el `status` de los cinco controles (T-53); y los
  commits `5a60647`, `43854db`, `6822436`, `fa0beae`, `15f6d77`, `63ac3bc`,
  `706f04c`, `26b4dd5`.

## Qué NO se ha podido verificar

Dicho con estas palabras, como manda la regla del proyecto:

- **El `build.number` y el árbol del plugin en `wazuh4`.** El acceso SSH no
  privilegiado devuelve `Permission denied` sobre
  `/usr/share/wazuh-dashboard/package.json` y `/usr/share/wazuh-dashboard/plugins/`.
  Los comandos de T-08 están tomados de
  `Wazuh-ENS/config/desplegar-plugin.sh` y de
  `docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md`, **no ejecutados contra la máquina**.
- **Los rc concretos de `ausearch`, `journalctl` y `auditctl`** (T-23, T-25, T-26,
  T-29, T-30) se toman de las cabeceras de las librerías, que declaran haberlos
  medido en contenedor sobre `audit 2.8.5` / `3.1.2` y `systemd 245` / `255`. No se
  han vuelto a ejecutar aquí. **El recuento «~22» de T-30 tampoco**: no se ha
  corrido `auditctl -l` en la máquina.
- **El estado del árbol del plugin `main` de Wazuh** (`optimize_mixin.js`,
  `package.json` del dashboard) vive fuera de este repo y no se ha leído: la
  referencia sale de la cabecera de `desplegar-plugin.sh`.
- **La cifra «65 de 83 rule IDs»** (T-20) es de la auditoría de fase 0 del
  29/07/2026 y está **parcialmente corregida** desde entonces (32 identificadores
  reparados el 30/07). No se ha vuelto a contar hoy: para saber el estado actual,
  `python3 tests/check-coherencia.py`, que hoy pasa.
- **El aviso de truncamiento a 10.000 hechos** (T-41) se ha verificado en el
  código; los números concretos (20.052 en `wazuh-real`, 17.444 de op.acc.3) salen
  de los documentos citados, no de una consulta al índice hecha hoy.
- **Los pasos 2 y 3 del arreglo de T-63** (escucha `ldaps://636` y
  `olcSecurity: ssf=128`) no se han probado: escriben en `cn=config` y exigen la
  credencial de administración de Zimbra, **que el cliente prohíbe usar**.
- **Las cifras de censo de T-67** (10 frente a 12 identidades) no se han
  recontado hoy contra el ndjson de la máquina; se citan las dos fuentes y su
  fecha, y el documento manda contarlas en la máquina en vez de copiarlas.
