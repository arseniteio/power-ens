# Cómo se demuestra técnicamente cada evidencia

Las **22 evidencias** de los tres controles desplegados, con lo que cada una
mira de verdad en la máquina, el evento que emite, la regla que lo recoge y —lo
que hace útil este documento— **el comando que te dice si esa evidencia está
funcionando**.

> **op.acc.3 y op.acc.4 no están aquí, y es correcto.** Entraron el 06/08 con
> sus 15 evidencias declaradas, pero **ninguna tiene todavía cómo demostrarse**:
> no hay runbook, ni recolector, ni una sola regla en ningún manager. Por eso
> los dos controles están en `status: 'DRAFT'` y no entran en el índice. Este
> documento se amplía cuando exista su agente, no antes: una fila que dijera
> «ejecuta esto para comprobarlo» sobre un recolector que no existe sería
> exactamente el tipo de trazabilidad falsa que el producto no comete.

Sirve para recorrerlas una a una y marcar cuáles van. Si buscas qué *configurar*
para que salgan en verde, eso es
[`CUMPLIMIENTO_TOTAL.md`](CUMPLIMIENTO_TOTAL.md); esto es lo otro: **si el
mecanismo funciona**, independientemente de si la máquina cumple.

---

## Cómo leer las tablas

| Columna | Qué dice |
|---|---|
| **Mira** | qué consulta el agente en la máquina. Es *lo que se demuestra técnicamente* |
| **Emite** | el evento del NDJSON. Sin él, no hay nada que juzgar |
| **Regla** | la que lo recoge en el manager. Sin ella el evento no llega al plugin |
| **Juzga** | **agente** (modelo clásico: él decide y emite `estado`) o **motor** (emite el hecho crudo y decide el plugin contra un parámetro de la pantalla) |

**Las dos preguntas son distintas y hay que separarlas:**

- *¿Funciona la evidencia?* → llega su evento al NDJSON y a Wazuh.
- *¿Cumple la máquina?* → el veredicto de ese evento.

Una evidencia puede funcionar perfectamente y salir en rojo. Es lo normal, y es
lo que hace que el producto valga.

### El único comando que necesitas para empezar

Una pasada aislada de un control y qué evidencias dejaron rastro:

```bash
CTL=op_acc_1     # o op_acc_2, mp_info_6
mv /var/log/ensfacil/$CTL.json /var/log/ensfacil/$CTL.json.antes 2>/dev/null
/usr/local/bin/ens_${CTL//_/}_collect.sh 2>/dev/null || \
  /usr/local/bin/ens_mpinfo6_evidence.sh

jq -r 'select(.evidence_id != null)
       | .evidence_id + "  " + .event + "  " + (.estado // "—")' \
  /var/log/ensfacil/$CTL.json | sort -u
```

> **El NDJSON es un histórico.** Un `tail` mezcla ejecuciones y te enseña
> estados ya superados. Aísla siempre la pasada con el `mv`, o estarás
> diagnosticando el pasado.

---

## op.acc.1 · Identificación

| Ev | Mira | Emite | Regla | Juzga |
|---|---|---|---|---|
| **EV-01** | `/etc/passwd`: cuentas con uid ≥ P-10 y shell distinto de `nologin`/`false`, y UIDs repetidos | `account_active` (una por cuenta) + `account_inventory` (el recuento y los duplicados) | 106811, 106809/10 | agente |
| **EV-02** | `/etc/passwd` y `/etc/shadow` contra el snapshot de la pasada anterior | `account_created`, `account_modified`, `account_deleted` | 106812, 106813, 106818 | agente |
| **EV-03** | las `Accepted …` de sshd en `auth.log` o journald | `account_authenticated` (`usuario`, `origen`) | **106873** | **motor** · `NINGUNO_EN_LISTA` contra **P-04** |
| **EV-04** | fechas de baja (`bajas.tsv` o el campo *expira* de `shadow`) frente a si la cuenta sigue habilitada | `account_disabled`, `account_offboarding` | 106815, 106816/17 | agente |
| **EV-05** | **el mismo `auth.log` que EV-03** | **el mismo `account_authenticated`**, etiquetado también EV-05 | **106873** | **motor** · `NINGUNO_EN_LISTA` contra **P-03** |
| **EV-06** | pertenencia a los grupos de P-11 en `/etc/group`, y el sufijo de P-12 en el identificador | `multi_role_usage`, `privilege_use` | 106807, 106808 | agente |
| **EV-07** | **el mismo censo que EV-01** | **el mismo `account_active`**, etiquetado también EV-07 | **106811** | **motor** · `TODOS_EN_LISTA` contra la columna *usuario* de **P-07** |
| **EV-08** | el registro de cuentas deshabilitadas que mantiene EV-04, contra las que ya no están en `passwd` | `account_deleted`, `retention_violation` | 106818, 106819 | agente |

### Comprobar que funcionan

```bash
# EV-01 y EV-07 · el censo. Tiene que salir una línea por cuenta activa,
# con LAS DOS etiquetas.
jq -c 'select(.event=="account_active")|{usuario,evidence_id}' \
  /var/log/ensfacil/op_acc_1.json | sort -u

# EV-03 y EV-05 · las autenticaciones, con las dos etiquetas y SIN estado.
jq -c 'select(.event=="account_authenticated")|{usuario,evidence_id,estado}' \
  /var/log/ensfacil/op_acc_1.json | sort -u
```

| Lo que ves | Qué significa |
|---|---|
| `"evidence_id":"EV-01,EV-07"` | funciona |
| `"evidence_id":"EV-01"` a secas | el agente corre código anterior al 05/08 |
| `"estado"` presente en `account_authenticated` | igual: el hecho crudo no lleva veredicto |
| **ninguna línea** de `account_authenticated` | **puede ser correcto**: si nadie ha entrado por ssh en la ventana, EV-03 y EV-05 callan. Lo que sostiene ese silencio es el latido, abajo |

**El latido, que es de lo que cuelga que un silencio pueda ser CUMPLE:**

```bash
jq -c 'select(.event=="collector_run")
       |{resultado,evidencias_cubiertas,evidencias_emitidas}' \
  /var/log/ensfacil/op_acc_1.json
```

Esperado: `resultado: "completada"` y `evidencias_cubiertas: "EV-03,EV-05,EV-06"`.
Si la lista sale **vacía**, el agente no pudo leer el log de autenticación, y
entonces el silencio de EV-03/EV-05 **no** vale como cumplimiento.

**Para forzar EV-03 y EV-05**, abre una sesión ssh contra la máquina y repite la
pasada. **Para forzar EV-02**, crea y borra un usuario de prueba entre dos
pasadas.

---

## op.acc.2 · Requisitos de acceso

| Ev | Mira | Emite | Regla | Juzga |
|---|---|---|---|---|
| **EV-01** | barrido propio de las rutas de P-02 buscando *world-writable*, más el `umask` declarado en `login.defs`/`profile` contra P-07 | `world_writable`, `umask_check` | 106903/04, 106905 | agente |
| **EV-02** | hash de cada fichero de P-02 contra la línea base de la pasada anterior | `fim_modified`, `fim_added`, `fim_deleted` | 106920-22 | agente |
| **EV-03** | `su`/`sudo` en el log de autenticación y los eventos de auditd | `access_denied`, `privilege_escalation`, `sudo_usage` | 106910-12 | agente |
| **EV-04** | `getfacl` de cada recurso declarado en **`opacc2-acl.tsv`** | `acl_check`, `acl_deviation` | 106913, 106914 | agente |
| **EV-05** | `sudoers` y `/etc/group` contra **`opacc2-privilegios.tsv`** | `privilege_check`, `excessive_privilege`, `group_membership` | 106930-33 | agente · **solo ALTO** |
| **EV-06** | eventos de auditd contra **`opacc2-accesos.tsv`** | `access_type_violation`, `object_access` | 106935, 106936 | agente · **solo ALTO** |
| **EV-07** | barrido propio de binarios SUID/SGID y ficheros sin dueño, contra **`opacc2-suid.allow`** | `suid_sgid`, `no_owner_file` | 106925-27 | agente |

### Comprobar que funcionan

```bash
jq -c 'select(.event=="evidence_state")
       |{evidence_id,estado,causa,motivo}' /var/log/ensfacil/op_acc_2.json
```

Aquí el diagnóstico está en la **causa**, y es lo que te dice si el mecanismo
falla o si solo falta declarar la política:

| Causa | Qué pasa | Dónde se arregla |
|---|---|---|
| `CONFIGURATION` | falta el fichero de política o el parámetro | lo escribes tú · no es un fallo |
| `COLLECTION` | la fuente no se pudo leer (auditd sin reglas, ruta ilegible) | **aquí sí hay algo roto** |
| `EVIDENCE` | el dato llegó y no sirve | el recolector |

**Dos cosas de este control que despistan:**

- **`augenrules --load` es un paso aparte.** Escribir el fichero de reglas no las
  carga en el kernel, y hasta que lo estén EV-03 y EV-06 no acreditan.
  Compruébalo con `auditctl -l | grep ensfacil_opacc2`.
- **El barrido de SUID tiene cadencia de 24 h.** Su veredicto lleva la fecha del
  barrido, no la de la pasada, y lo dice en el propio motivo. No es que esté
  atascado.

---

## mp.info.6 · Copias de seguridad

Es el único de los tres que **ejecuta** algo: `pxbackup.sh` hace la copia y emite
la evidencia en la misma pasada. Por eso aquí la ausencia de copia sí es una no
conformidad medida — si hubiera ocurrido, se habría observado.

| Ev | Mira | Emite | Regla | Juzga |
|---|---|---|---|---|
| **EV-01** | el código de salida del mandato de copia | `backup_ok`, `backup_error` | 106650, 106690 | agente |
| **EV-02** | el instante de la última copia contra P-01 + el margen P-02 | `backup_missing` (watchdog) | 106601 | agente |
| **EV-03** | contenido del directorio local de copias (P-06) y su huella | `encfp_changed` | 106609 | agente |
| **EV-04** | permisos del fichero que nombra `MPINFO6_KEYFILE` | solo `evidence_state` | 106700-03 | agente |
| **EV-05** | restaura un archivo de prueba y compara el md5 de un canario | `restore_ok`, `restore_error`, `restore_missing` | 106651, 106607, 106606 | agente |
| **EV-06** | **nada: no hay recolector.** La copia externa la produce el PBS | solo `evidence_state` | 106702/03 | — |
| **EV-07** | la herramienta que produjo el evento y su vocabulario | `backup_error`, `encfp_changed` | 106690, 106602 | agente |

### Comprobar que funcionan

```bash
jq -c 'select(.event=="evidence_state")
       |{evidence_id,estado,causa,motivo}' /var/log/ensfacil/mp_info_6.json
```

**La sonda de restauración está dormida de fábrica**, y eso cambia lo que
esperas ver:

| `ENS_RESTORE_ARCHIVE` / `ENS_RESTORE_CANARY` | EV-05 | El watchdog |
|---|---|---|
| vacíos (de fábrica) | `NO_EVALUABLE` con su motivo | **calla**: la ausencia no está medida, así que no acusa |
| con valor | `CUMPLE` o `restore_error` | emite `restore_missing` si pasa el plazo sin prueba |

**EV-06 no se puede arreglar en la máquina.** No tiene recolector: es el tope
estructural del nivel ALTO, documentado en
[`CUMPLIMIENTO_TOTAL.md §11.1`](CUMPLIMIENTO_TOTAL.md).

---

## Qué NO va a funcionar, y no es culpa del despliegue

Antes de perseguir nada en la máquina:

| Evidencia | Por qué | Consecuencia |
|---|---|---|
| `op.acc.1` · **`op.acc.1.5`** y **`op.acc.1.r1.1`** | son requisitos sin **ninguna** evidencia técnica: atestación documental (eIDAS, singularizar a la persona) | techo de `op.acc.1`: **80 % en BAJO, 75 % en MEDIO/ALTO** |
| `mp.info.6` · **EV-06** | no hay recolector de la copia externa | nivel **ALTO no alcanzable** |
| `op.acc.2` · **EV-05** y **EV-06** | solo rigen en ALTO | en BAJO y MEDIO salen `NO_APLICA`, que **no** resta |

Las dos primeras aparecen en el plugin como no conformidades **«del catálogo»**,
con la acción correcta: *«no hay nada que configurar en el cliente ni ningún
agente que arreglar»*.

---

## Si una evidencia no emite nada

En este orden, que es de lo más frecuente a lo más raro:

```bash
# 1. ¿Corre el agente el código del repo?
md5sum /opt/ensfacil/opacc1-lib.sh ~/op.acc.1-*/lib/opacc1-lib.sh

# 2. ¿Dispara su regla en el manager?
echo '{"ensfacil":"op.acc.1","event":"account_active","usuario":"x","uid":1001}' \
  | /var/ossec/bin/wazuh-logtest 2>&1 | grep -A2 "Phase 3"

# 3. ¿Lee Wazuh el NDJSON?
grep -A3 ensfacil /var/ossec/etc/shared/ens/agent.conf

# 4. ¿Coinciden los cuatro repos?
cd /opt/ensfacil/repo && python3 tests/check-coherencia.py
```

El campo `ensfacil` de un evento de prueba lleva **el id del control**, no
`true`: un evento con `ensfacil: true` decodifica bien y no dispara nada, y
parece que las reglas no están cargadas cuando sí lo están.

## Enlaces

- [`CUMPLIMIENTO_TOTAL.md`](CUMPLIMIENTO_TOTAL.md) — qué configurar para que salgan en verde
- [`PRIMITIVAS_DE_JUICIO.md`](PRIMITIVAS_DE_JUICIO.md) — cómo juzga el motor las evidencias migradas
- `docs/07-mapa-evidencias.md` de cada runbook — evidencia ↔ evento ↔ regla, con el detalle de cada regla
