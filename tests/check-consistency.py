#!/usr/bin/env python3
"""Comprobación de coherencia entre el plugin y los tres runbooks.

Verifica lo que ninguna prueba unitaria puede ver, porque vive en el hueco entre
cuatro repositorios: que lo que el plugin le promete al auditor exista de verdad
en lo que se despliega en el manager.

    python3 tests/check-consistency.py

Devuelve 0 si todo cuadra, 1 si hay algún fallo. Sin dependencias.

## Por qué existe

El valor del producto es la cadena `CUMPLE -> evidencia -> rule ID -> evento`.
Un auditor la recorre entera. Si el catálogo acredita una regla que el manager
no tiene desplegada, la cadena muere en el último escalón y **nada avisa**: el
identificador es numérico, la regla existe en el repo, y todo parece correcto.

Eso pasó de verdad el 30/07 con op.acc.1: 39 de sus 51 reglas acreditadas solo
existían en `agent/rules/`, que corresponde a un recolector distinto del que
instala `install-manager.sh`. Antes de eso había pasado la versión burda del
mismo fallo: 65 de 83 identificadores eran simbólicos e inventados.

Esta comprobación es la que habría cazado los dos casos sola.

Y el 31/07, en el primer despliegue real, apareció la tercera variante del
mismo hueco, por el otro extremo: un evento que el MOTOR lee del índice
(`collector_run`) y al que nadie le había dado regla, porque cuando se decidió
no dársela solo era diagnóstico. El agente lo emitía, la regla base es
`level="0"`, no generaba alerta, no llegaba al índice, y EV-03 de op.acc.1 salía
NO_EVALUABLE permanente sobre una máquina sana. Las dos decisiones eran
correctas por separado. La comprobación 7 vigila ese contrato.

La cuarta variante vivía en el otro extremo de la cadena, el del documento que
se firma: la pantalla de Informes elegía el modelo con una cadena de ternarios
cuya rama POR DEFECTO era mp.info.6. Un control nuevo se registraba bien en
`catalog/` y en `data/`, salía en la lista con su nombre y su nivel correctos, y
al abrir su informe generaba el de las copias de seguridad —los requisitos y las
evidencias de mp.info.6— bajo su propia cabecera. Nada fallaba: salía un
documento plausible y equivocado, firmado ante un auditor. La comprobación 8
exige que todo control declarado tenga modelo de informe propio.
"""
import glob
import json
import os
import re
import pathlib
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(AQUI)
BASE = os.path.dirname(PLUGIN)

# Lo DESPLEGADO es la copia de `manager/` de cada runbook: es lo que instala
# `install-manager.sh`. La de `agent/rules/` del plugin es la fuente canónica
# para el generador, y puede divergir sin que nadie se entere.
RUNBOOKS = {
    "mp.info.6": (
        "mp.info.6-proxmox-backup-runbook",
        ["ensfacil_mp_info_6_json_rules.xml", "ensfacil_mp_info_6_pbs_rules.xml"],
    ),
    "op.acc.1": (
        "op.acc.1-identification",
        ["ensfacil_op_acc_1_json_rules.xml"],
    ),
    "op.acc.2": (
        "op.acc.2-access-requirements",
        ["ensfacil_op_acc_2_json_rules.xml"],
    ),
    "op.acc.3": (
        "op.acc.3-segregation-of-duties-and-tasks",
        ["ensfacil_op_acc_3_json_rules.xml"],
    ),
    "op.acc.4": (
        "op.acc.4-access-rights-management-process",
        ["ensfacil_op_acc_4_json_rules.xml"],
    ),
    "op.exp.1": (
        "op.exp.1-asset-inventory",
        ["ensfacil_op_exp_1_json_rules.xml"],
    ),
    "op.exp.2": (
        "op.exp.2-security-configuration",
        ["ensfacil_op_exp_2_json_rules.xml"],
    ),
    "op.acc.6": (
        "op.acc.6-organization-users-authentication",
        ["ensfacil_op_acc_6_json_rules.xml"],
    ),
    "op.acc.5": (
        "op.acc.5-external-users-authentication",
        ["ensfacil_op_acc_5_json_rules.xml"],
    ),
    "op.exp.3": (
        "op.exp.3-security-configuration-management",
        ["ensfacil_op_exp_3_json_rules.xml"],
    ),
    "op.exp.4": (
        "op.exp.4-security-maintenance-and-updates",
        ["ensfacil_op_exp_4_json_rules.xml"],
    ),
    "op.exp.9": (
        "op.exp.9-incident-management-records",
        ["ensfacil_op_exp_9_json_rules.xml"],
    ),
}

fallos = []
avisos = []


def falla(comprobacion, detalle):
    print("FALLA  {}\n       {}".format(comprobacion, detalle))
    fallos.append(comprobacion)


def avisa(comprobacion, detalle):
    print("AVISO  {}\n       {}".format(comprobacion, detalle))
    avisos.append(comprobacion)


def ok(comprobacion, detalle=""):
    print("OK     {}{}".format(comprobacion, "  " + detalle if detalle else ""))


def lee(ruta):
    with open(ruta, encoding="utf-8") as f:
        return f.read()


def reglas_de(texto):
    return set(re.findall(r'rule id="(\d+)"', texto))


def reglas_desplegadas(control):
    repo, xmls = RUNBOOKS[control]
    ids = set()
    for x in xmls:
        ruta = os.path.join(BASE, repo, "manager", x)
        if not os.path.exists(ruta):
            falla("XML desplegada existe", "no encuentro {}".format(ruta))
            continue
        ids |= reglas_de(lee(ruta))
    return ids


def bloques_evidencia(catalogo, control):
    """Devuelve (id, cuerpo) de cada evidencia del control."""
    patron = (
        r"id: '(EV-\d+)',\s*controlId: '"
        + re.escape(control)
        + r"'(.*?)(?=\n  \{|\n\];)"
    )
    return re.findall(patron, catalogo, re.S)


def campo_lista(cuerpo, nombre):
    m = re.search(nombre + r": \[([^\]]*)\]", cuerpo, re.S)
    return re.findall(r"'([^']+)'", m.group(1)) if m else []


# ---------------------------------------------------------------------------

catalogo = lee(os.path.join(PLUGIN, "dashboard/ens/core/evidence/catalog.ts"))

print("=== 1. Toda regla acreditada tiene que poder dispararse ===\n")

# Se recorren LOS CONTROLES DEL CATÁLOGO, no las claves de RUNBOOKS.
#
# Recorriendo RUNBOOKS, un control que el catálogo acredita pero que todavía no
# tiene runbook registrado aquí era INVISIBLE para esta comprobación: sus reglas
# no se miraban y el script decía «coherencia OK» sobre una cadena rota. Es
# justo el agujero por el que op.acc.1 llegó a acreditar 39 reglas que no
# existían en ningún manager, y es la comprobación que existe para evitarlo.
#
# Un control sin `relatedRules` en ninguna evidencia NO falla: es lo que se
# espera de uno recién generado, que va en `status: 'DRAFT'` y todavía no tiene
# agente. Lo que falla es acreditar una regla sin manager que la tenga.
controles_del_catalogo = sorted(set(re.findall(r"controlId: '([^']+)'", catalogo)))

for control in controles_del_catalogo:
    acreditadas = set()
    for _, cuerpo in bloques_evidencia(catalogo, control):
        acreditadas |= set(campo_lista(cuerpo, "relatedRules"))

    if not acreditadas:
        ok("{}: no acredita ninguna regla todavía (sin agente)".format(control))
        continue

    if control not in RUNBOOKS:
        falla(
            "{}: acredita reglas y no tiene runbook registrado".format(control),
            "{}: {} — añádelo a RUNBOOKS o esta comprobación no lo mira".format(
                len(acreditadas), ", ".join(sorted(acreditadas))
            ),
        )
        continue

    desplegadas = reglas_desplegadas(control)

    inalcanzables = sorted(acreditadas - desplegadas)
    if inalcanzables:
        falla(
            "{}: reglas acreditadas que el manager NO tiene".format(control),
            "{} de {}: {}".format(
                len(inalcanzables), len(acreditadas), ", ".join(inalcanzables)
            ),
        )
    else:
        ok(
            "{}: las {} reglas acreditadas están desplegadas".format(
                control, len(acreditadas)
            )
        )

print("\n=== 2. La canónica del plugin y la copia desplegada no divergen ===\n")

for control, (repo, xmls) in RUNBOOKS.items():
    for x in xmls:
        canonica = os.path.join(PLUGIN, "agent/rules", x)
        copia = os.path.join(BASE, repo, "manager", x)
        if not (os.path.exists(canonica) and os.path.exists(copia)):
            continue
        ids_can, ids_cop = reglas_de(lee(canonica)), reglas_de(lee(copia))
        if ids_can == ids_cop:
            ok("{}: mismos rule IDs en canónica y copia".format(x))
        else:
            solo_can = sorted(ids_can - ids_cop)
            solo_cop = sorted(ids_cop - ids_can)
            falla(
                "{}: la canónica y lo desplegado son juegos distintos".format(x),
                "solo en canónica ({}): {}… | solo desplegado ({}): {}".format(
                    len(solo_can),
                    ", ".join(solo_can[:6]),
                    len(solo_cop),
                    ", ".join(solo_cop[:6]) or "ninguna",
                ),
            )

print("\n=== 3. Toda evidencia escucha el contrato que emiten los agentes ===\n")

sordas = []
for control in RUNBOOKS:
    for ev, cuerpo in bloques_evidencia(catalogo, control):
        if "evidence_state" not in campo_lista(cuerpo, "expectedEventTypes"):
            sordas.append("{} {}".format(control, ev))
if sordas:
    falla(
        "evidencias que no escuchan `evidence_state`",
        ", ".join(sordas)
        + " — su agente emite ese contrato y ellas no lo oyen: quedan en"
        " NO_EVALUABLE haga lo que haga la máquina",
    )
else:
    ok("las evidencias de los tres controles escuchan `evidence_state`")

print("\n=== 4. Los tipos de evento declarados los emite alguna regla ===\n")

for control, (repo, xmls) in RUNBOOKS.items():
    emitidos = set()
    for x in xmls:
        ruta = os.path.join(BASE, repo, "manager", x)
        if os.path.exists(ruta):
            emitidos |= set(
                re.findall(r'<field name="event">([a-z0-9_]+)</field>', lee(ruta))
            )
    # `evidence_state`, `control_state` y `score_snapshot` los emiten reglas
    # genéricas que casan por otros campos; no se exigen aquí.
    genericos = {"evidence_state", "control_state", "score_snapshot"}
    declarados = set()
    for _, cuerpo in bloques_evidencia(catalogo, control):
        declarados |= set(campo_lista(cuerpo, "expectedEventTypes"))
    huerfanos = sorted(declarados - emitidos - genericos)
    if huerfanos:
        avisa(
            "{}: tipos declarados que ninguna regla emite".format(control),
            ", ".join(huerfanos),
        )
    else:
        ok("{}: todos los tipos declarados tienen regla".format(control))

print("\n=== 5. Los tres runbooks se despliegan igual ===\n")

# Tres instaladores, no cuatro. `install-fake.sh` se retiró —simulaba datos en
# una máquina de cliente— e `install-real.sh` pasó a llamarse `install.sh`: el
# runbook ya no tiene dos caminos entre los que elegir.
#
# mp.info.6 se quedó con la estructura antigua A PROPÓSITO: lo mantiene otra
# persona y lo despliega haciendo pull de su repo. Renombrarle los scripts le
# rompería el procedimiento sin avisarle. Se comprueba contra lo que ese
# runbook declara, no contra lo que declaran los de op.acc.
ESPERADOS = ["install.sh", "install-manager.sh", "uninstall.sh"]
ESPERADOS_ANTIGUOS = [
    "install-real.sh",
    "install-fake.sh",
    "install-manager.sh",
    "uninstall.sh",
]
for control, (repo, _) in RUNBOOKS.items():
    esperados = ESPERADOS_ANTIGUOS if control == "mp.info.6" else ESPERADOS
    faltan = [
        s for s in esperados if not os.path.exists(os.path.join(BASE, repo, s))
    ]
    if faltan:
        falla(
            "{}: le faltan scripts del procedimiento común".format(control),
            ", ".join(faltan),
        )
    else:
        ok("{}: tiene los scripts de su procedimiento".format(control))

print("\n=== 6. Cada control tiene su bloque de configuración ===\n")

for control in RUNBOOKS:
    fichero = control.replace(".", "-") + "-control-block.json"
    ruta = os.path.join(PLUGIN, "config", fichero)
    if not os.path.exists(ruta):
        falla("{}: falta {}".format(control, fichero), ruta)
        continue
    bloque = json.loads(lee(ruta))
    if bloque.get("controlId") != control:
        falla(
            "{}: el bloque declara otro controlId".format(control),
            repr(bloque.get("controlId")),
        )
    else:
        ok(
            "{}: bloque con {} parámetros".format(
                control, len(bloque.get("parameters", []))
            )
        )

print("\n=== 7. Lo que el MOTOR lee del índice tiene regla en el manager ===\n")

# La comprobación 4 mira el contrato del catálogo: qué tipos de evento declara
# una evidencia para resolverse. Ésta mira el otro contrato, el que no está en
# el catálogo y por eso no lo vigilaba nadie: los eventos que `judgment.ts` lee
# DIRECTAMENTE del índice para decidir la cobertura del recolector.
#
# Es la comprobación que habría cazado el fallo del primer despliegue real
# (31/07/2026). `collector_run` no tenía regla en op.acc.1: eso era correcto
# mientras el evento fuese solo diagnóstico, y dejó de serlo cuando el motor
# pasó a leerlo para decidir si la ausencia de hechos puede significar CUMPLE.
# El agente lo emitía, la regla base es level="0", no generaba alerta, no
# llegaba al índice, y EV-03 salía NO_EVALUABLE permanente en una máquina sana.
# Cada mitad estaba bien, así que ninguna prueba unitaria podía verlo: solo se
# ve cruzando el motor con lo desplegado, que es lo que hace este script.
#
# La lista de tipos se DERIVA del fuente, no se escribe aquí: si alguien añade
# un tipo a `DEFAULT_COLLECTOR_RUN_EVENT_TYPES` o lo declara por evidencia en
# `collectorRunEventTypes`, esta comprobación lo exige sin tocar nada.
judgment_ts = lee(
    os.path.join(PLUGIN, "dashboard/ens/core/evidence/judgment.ts")
)

m = re.search(
    r"DEFAULT_COLLECTOR_RUN_EVENT_TYPES\s*=\s*\[(.*?)\]", judgment_ts, re.S
)
tipos_motor = set(re.findall(r"'([^']+)'", m.group(1))) if m else set()

for _, cuerpo in re.findall(
    r"id: '(EV-\d+)',(.*?)(?=\n  \{|\n\];)", catalogo, re.S
):
    declarados_por_evidencia = re.search(
        r"collectorRunEventTypes: \[([^\]]*)\]", cuerpo, re.S
    )
    if declarados_por_evidencia:
        tipos_motor |= set(
            re.findall(r"'([^']+)'", declarados_por_evidencia.group(1))
        )

if not tipos_motor:
    # Ancla del propio extractor: sin ella, un cambio de formato en judgment.ts
    # dejaría la lista vacía y los bucles de abajo aprobarían en vacío.
    falla(
        "no se ha podido leer del fuente qué eventos lee el motor",
        "revisar DEFAULT_COLLECTOR_RUN_EVENT_TYPES en"
        " dashboard/ens/core/evidence/judgment.ts",
    )
else:
    for control, (repo, xmls) in RUNBOOKS.items():
        emitidos = set()
        for x in xmls:
            ruta = os.path.join(BASE, repo, "manager", x)
            if os.path.exists(ruta):
                emitidos |= set(
                    re.findall(
                        r'<field name="event">([a-z0-9_]+)</field>', lee(ruta)
                    )
                )
        mudos = sorted(tipos_motor - emitidos)
        if mudos:
            falla(
                "{}: el motor lee eventos que el manager no indexa".format(control),
                "{} — sin regla caen en la base (level 0), no generan alerta y"
                " nunca llegan al índice: la cobertura del recolector sale"
                " siempre DESCONOCIDA y toda evidencia migrada se queda en gris"
                " permanente aunque la máquina esté sana".format(", ".join(mudos)),
            )
        else:
            ok(
                "{}: los {} evento(s) que lee el motor ({}) tienen regla".format(
                    control, len(tipos_motor), ", ".join(sorted(tipos_motor))
                )
            )

print("\n=== 8. Todo control declarado tiene su modelo de informe ===\n")

# El hueco que vigila esta comprobación NO está entre repos: está entre dos
# carpetas del plugin que nadie cruzaba. Un control se declara en `catalog/` y
# en `data/`, y su informe se registra aparte, en `informes/registry.ts`.
# Mientras el selector de modelo tuvo rama por defecto, olvidarse del segundo
# paso no tenía NINGÚN síntoma: el control salía en la lista de Informes con su
# nombre correcto y generaba el informe de mp.info.6.
#
# Las dos listas se DERIVAN del fuente, no se escriben aquí: el día que entren
# `op.acc.3` y `op.acc.4` esta comprobación los exige sin tocar este fichero.
# Y por eso mismo lleva ancla propia: si un cambio de formato dejase cualquiera
# de las dos extracciones vacía, el bucle aprobaría en vacío y el defecto
# volvería justo por donde salió.


def controles_declarados(carpeta):
    """IDs de control de los ficheros por control de `dashboard/ens/<carpeta>`.

    El `id` del propio control es el único a dos espacios de sangría: los de
    requisitos y evidencias van más adentro.
    """
    ids = {}
    ruta = os.path.join(PLUGIN, "dashboard/ens", carpeta)
    for fichero in sorted(os.listdir(ruta)):
        if not fichero.endswith(".ts") or fichero in ("index.ts", "types.ts"):
            continue
        encontrados = re.findall(
            r"^  id: '([^']+)',$", lee(os.path.join(ruta, fichero)), re.M
        )
        for control in encontrados:
            ids.setdefault(control, "{}/{}".format(carpeta, fichero))
    return ids


declarados = {}
for carpeta in ("catalog", "data"):
    # `setdefault` y no `update`: si el control está en las dos carpetas —lo
    # normal, son el doble catálogo—, el mensaje cita la primera, que es
    # siempre la misma. Un aviso que cambia de fichero según el orden del
    # bucle es un aviso que cuesta seguir.
    for control, fichero in controles_declarados(carpeta).items():
        declarados.setdefault(control, fichero)

registry_ts = lee(os.path.join(PLUGIN, "dashboard/ens/reports/registry.ts"))
m = re.search(
    r"reportModelDefinitions:\s*ENSReportModelDefinition\[\]\s*=\s*\[(.*?)\n\];",
    registry_ts,
    re.S,
)
con_modelo = set(re.findall(r"controlId: '([^']+)'", m.group(1))) if m else set()

if not declarados:
    falla(
        "no se ha podido leer del fuente qué controles declara el producto",
        "revisar los ficheros por control de dashboard/ens/catalog y"
        " dashboard/ens/data",
    )
elif not con_modelo:
    falla(
        "no se ha podido leer del fuente qué controles tienen modelo de informe",
        "revisar `reportModelDefinitions` en"
        " dashboard/ens/reports/registry.ts",
    )
else:
    sin_modelo = sorted(set(declarados) - con_modelo)
    if sin_modelo:
        falla(
            "controles declarados SIN modelo de informe",
            "{}: salen en la pestaña Informes y no pueden emitir informe."
            " Registrar su modelo en dashboard/ens/reports/registry.ts"
            " (declarados en {})".format(
                ", ".join(sin_modelo),
                ", ".join(declarados[c] for c in sin_modelo),
            ),
        )
    else:
        ok(
            "los {} control(es) declarados tienen modelo de informe".format(
                len(declarados)
            ),
            ", ".join(sorted(declarados)),
        )

    huerfanos = sorted(con_modelo - set(declarados))
    if huerfanos:
        avisa(
            "modelos de informe de controles que ya no se declaran",
            ", ".join(huerfanos),
        )


print("\n=== 9. El agente y el motor acreditan los MISMOS requisitos ===\n")

# El hueco que cierra: `score.py` de cada runbook lleva su propio mapa
# evidencia -> requisitos, y el motor tiene el suyo en la policy del plugin. Si
# divergen, los dos publican un numero distinto sobre la misma maquina y nadie
# se entera, porque cada uno es coherente consigo mismo.
#
# Encontrado el 05/08 desplegando: score.py de op.acc.1 mapeaba EV-01 a
# `op.acc.1.5` y `op.acc.1.r1.1`, que en la policy no tienen NINGUNA evidencia
# (`evidenceIds: []`, son atestacion documental). El agente los daba por CUMPLE
# y el plugin por NO_CUMPLE. El agente inflaba, que es la direccion peligrosa.
#
# Se compara en UNA sola direccion a proposito: que el agente no acredite un
# requisito que la policy deja sin evidencia. Al reves NO es un fallo -la policy
# puede declarar evidencias que ese agente no emite, p.ej. las migradas al
# motor, que salen de EVIDENCIAS y pasan a EVIDENCIAS_DELEGADAS-.

def mapa_del_agente(carpeta, script):
    """evidencia -> requisitos, leido del dict EVIDENCIAS de score.py."""
    ruta = os.path.join(BASE, carpeta, "scripts", script)
    if not os.path.exists(ruta):
        return None
    texto = lee(ruta)
    mapa = {}

    # Forma A (op.acc.1, op.acc.2): dict evidencia -> [requisitos].
    m = re.search(r"^EVIDENCIAS = \{(.*?)^\}", texto, re.S | re.M)
    if m:
        for ev, reqs in re.findall(r'"(EV-\d+)":\s*\[([^\]]*)\]', m.group(1)):
            mapa[ev] = re.findall(r'"([\w.]+)"', reqs)
        return mapa

    # Forma B (mp.info.6): tuplas (requisito, [evidencias], nivel). Se invierte
    # para dejar el mismo mapa que la forma A. Se admiten las dos en vez de
    # unificarlas porque el objetivo de esta comprobacion es cazar divergencias,
    # no imponer un estilo: obligar a reescribir un score.py que funciona para
    # poder comprobarlo seria la cola meneando al perro.
    for req, evs in re.findall(r'\("([\w.]+)",\s*\[([^\]]*)\],\s*"', texto):
        for ev in re.findall(r'"(EV-\d+)"', evs):
            mapa.setdefault(ev, []).append(req)

    return mapa or None


def requisitos_sin_evidencia(control):
    """Requisitos que la policy del plugin declara SIN ninguna evidencia."""
    fn = control.replace(".", "-")
    ruta = os.path.join(
        PLUGIN, "dashboard/ens/core/policy-runtime/policies", fn + ".policy.ts"
    )
    if not os.path.exists(ruta):
        return None
    texto = lee(ruta)
    sin = set()
    for bloque in re.findall(r"requirementId: '([\w.]+)',(.*?)ruleType", texto, re.S):
        req, cuerpo = bloque
        m = re.search(r"evidenceIds: \[([^\]]*)\]", cuerpo)
        if m and not m.group(1).strip():
            sin.add(req)
    return sin


# El script con el que el AGENTE se puntúa a sí mismo.
#
# op.acc.4 no está, y no es un olvido: nació entero en el modelo nuevo, así que
# su agente no calcula ningún veredicto —emite hechos crudos y juzga el motor—.
# Un control sin score no puede inflar un requisito que la policy deja sin
# evidencia, que es exactamente lo que esta comprobación vigila: la
# incoherencia que persigue no existe por construcción.
#
# Lo que SÍ hay que vigilar en un control así es que el agente no emita
# `estado` de cumplimiento por la puerta de atrás. Eso lo comprueba la
# comprobación 11.
SCORE = {
    "mp.info.6": "ens_mpinfo6_score.py",
    "op.acc.1": "ens_opacc1_score.py",
    "op.acc.2": "ens_opacc2_score.py",
}

for control, (carpeta, _reglas) in sorted(RUNBOOKS.items()):
    if control not in SCORE:
        ok(
            "{}: el agente no se puntua a si mismo (modelo nuevo)".format(control)
        )
        continue

    mapa = mapa_del_agente(carpeta, SCORE[control])
    sin_evidencia = requisitos_sin_evidencia(control)

    if mapa is None or sin_evidencia is None:
        avisa(
            "{}: no se pudo leer el mapa del agente o la policy".format(control),
            "se salta la comprobacion en vez de darla por buena",
        )
        continue

    inflados = sorted(
        {req for reqs in mapa.values() for req in reqs} & sin_evidencia
    )
    if inflados:
        quien = {
            req: sorted(ev for ev, reqs in mapa.items() if req in reqs)
            for req in inflados
        }
        falla(
            "{}: el agente acredita requisitos que la policy deja sin evidencia".format(control),
            "; ".join(
                "{} <- {}".format(req, ", ".join(evs)) for req, evs in quien.items()
            )
            + " (la policy los declara con evidenceIds: [], asi que el motor los"
            " publica NO_CUMPLE y el agente CUMPLE)",
        )
    else:
        ok(
            "{}: ningun requisito sin evidencia en la policy sale acreditado por el agente".format(control),
            "{} evidencia(s) mapeadas".format(len(mapa)),
        )


print("\n=== 10. Nadie manda a rellenar una variable que el agente ya no lee ===\n")

# Cada evidencia que se migra al motor se lleva su parametro del `.env` a la
# pantalla de Configuracion. Lo que se queda atras es lo que HABLA de ese
# parametro: el mensaje del instalador, la plantilla del `.env`, la guia.
#
# Encontrado el 05/08, dos veces el mismo dia: `install-real.sh` de op.acc.1
# seguia diciendo "REVISAR P-03 y P-07" y la guia de cumplimiento seguia dando el
# ejemplo `OPACC1_CUENTAS_SERVICIO="svc_backup,..."`. El operador los rellena, no
# cambia nada, y no se entera hasta que lo pregunta un auditor. Es peor que no
# documentarlo.
#
# La marca de "retirada" es el aviso que el propio orquestador emite al
# encontrarla en un `.env` viejo (`_opacc2_avisar_retirado` / el bloque de
# avisos de op.acc.1): si una variable esta ahi, es que ya nadie la lee.

for control, (carpeta, _reglas) in sorted(RUNBOOKS.items()):
    orquestador = sorted(
        glob.glob(os.path.join(BASE, carpeta, "scripts", "*_collect.sh"))
        + glob.glob(os.path.join(BASE, carpeta, "scripts", "*_evidence.sh"))
    )
    if not orquestador:
        continue

    texto = lee(orquestador[0])
    retiradas = set(re.findall(r"_avisar_retirado (\w+)", texto))
    retiradas |= set(
        re.findall(r'parametro="(\w+)"[^\n]*ya no se usa en el agente', texto)
    )
    if not retiradas:
        ok("{}: no declara ninguna variable retirada".format(control))
        continue

    # La librería NO puede leerlas, y nadie puede mandar a rellenarlas.
    culpables = []
    for fichero in sorted(
        glob.glob(os.path.join(BASE, carpeta, "*.sh"))
        + glob.glob(os.path.join(BASE, carpeta, "etc", "*.example"))
        + glob.glob(os.path.join(BASE, carpeta, "docs", "*.md"))
        + glob.glob(os.path.join(PLUGIN, "docs", "*.md"))
    ):
        cuerpo = lee(fichero)
        for var in retiradas:
            # Solo cuenta como "mandar a rellenarla" una ASIGNACION o un
            # `REVISAR`: nombrarla para decir que ya no se usa es justo lo que
            # hay que hacer, y no puede fallar esta comprobacion.
            if re.search(r'^\s*(#\s*)?{}="'.format(var), cuerpo, re.M) or re.search(
                r"REVISAR[^\n]*{}".format(var), cuerpo
            ):
                culpables.append(
                    "{} -> {}".format(os.path.basename(fichero), var)
                )

    if culpables:
        falla(
            "{}: se manda a rellenar una variable retirada".format(control),
            "; ".join(sorted(set(culpables))),
        )
    else:
        ok(
            "{}: nadie manda a rellenar sus {} variable(s) retirada(s)".format(
                control, len(retiradas)
            ),
            ", ".join(sorted(retiradas)),
        )


print("\n=== 11. Un control del modelo nuevo no juzga en la maquina ===\n")

# En el modelo nuevo el agente OBSERVA y el motor JUZGA. Un recolector que
# emitiera `estado=CUMPLE` o `estado=NO_CUMPLE` por su cuenta reintroduciria
# los dos caminos de evaluacion sobre los mismos datos, que es exactamente lo
# que se arreglo al desconectar `op-acc-1.evaluator.ts`: dos veredictos sobre
# el mismo hecho hacen imposible auditar de forma consistente, y gana el que
# llegue antes.
#
# Lo unico que el agente si puede decir es que NO PUDO MIRAR
# (`estado=NO_EVALUABLE` con su causa). Esa distincion es la que separa «la
# fuente esta rota» de «se leyo y no habia nada», y se arreglan en sitios
# distintos.
#
# Se mira el control ENTERO —todas sus evidencias declaran `judgment`— y no
# evidencia a evidencia: durante una migracion conviven las dos cosas en el
# mismo runbook y aqui no habria forma de saber cual es cual.
for control, (repo, _reglas) in sorted(RUNBOOKS.items()):
    bloques = bloques_evidencia(catalogo, control)

    if not bloques:
        continue

    todas_juzgadas = all("judgment: {" in cuerpo for _, cuerpo in bloques)

    if not todas_juzgadas:
        ok(
            "{}: modelo clasico o migracion en curso, no aplica".format(control)
        )
        continue

    carpeta = os.path.join(BASE, repo)
    culpables = []

    for raiz, _dirs, ficheros in os.walk(carpeta):
        if os.sep + ".git" in raiz or os.sep + "tests" in raiz:
            continue
        for fichero in ficheros:
            if not fichero.endswith((".sh", ".py")):
                continue
            ruta = os.path.join(raiz, fichero)
            texto = lee(ruta) or ""
            for veredicto in ("estado=CUMPLE", "estado=NO_CUMPLE",
                              '"estado": "CUMPLE"', '"estado": "NO_CUMPLE"'):
                if veredicto in texto:
                    culpables.append(
                        "{}: {}".format(os.path.relpath(ruta, carpeta), veredicto)
                    )

    if culpables:
        falla(
            "{}: el agente emite veredicto y no deberia".format(control),
            "; ".join(sorted(set(culpables))),
        )
    else:
        ok(
            "{}: el agente solo emite hechos y NO_EVALUABLE".format(control)
        )


print()

# =============================================================================
# 12. Un parametro `table` sin columnas no se puede juzgar
# =============================================================================
#
# NACE DE UN FALLO QUE COSTO CINCO EVIDENCIAS DE OCHO.
#
# P-01, P-02 y P-07 de op.acc.4 son `table` y declaraban sus columnas en
# `dashboard/ens/configuration/data/<control>-parameters.ts`, pero el BLOQUE
# SEMILLA de `config/` no las llevaba. Como el motor lee la configuracion del
# indice, y el indice se siembra del bloque, las columnas no existian donde se
# juzga: EV-01, EV-02, EV-03, EV-07 y EV-08 salian NO_EVALUABLE con
# "el parametro no declara ninguna columna".
#
# Nada avisaba. La pantalla pintaba las filas, el operador las rellenaba, el
# agente emitia los hechos, y el motor no tenia con que repartir las celdas.
# Cinco evidencias en gris por un campo ausente en un JSON.
#
# Las dos fuentes tienen que decir lo mismo: si el TS declara columnas, el
# bloque tambien; y ningun `table` puede quedarse sin ninguna.

print()
print("=== 12. Un parametro `table` sin columnas no se puede juzgar ===")
print()

import re as _re

for _control in sorted(RUNBOOKS):
    _slug = _control.replace(".", "-")
    _bloque = pathlib.Path(PLUGIN) / "config" / ("%s-control-block.json" % _slug)
    _fuente = pathlib.Path(PLUGIN) / "dashboard/ens/configuration/data" / ("%s-parameters.ts" % _slug)

    if not _bloque.exists():
        continue

    _d = json.loads(_bloque.read_text(encoding="utf-8"))
    _ps = _d.get("parameters") or _d.get("control", {}).get("parameters") or []
    _ts = _fuente.read_text(encoding="utf-8") if _fuente.exists() else ""

    _sin = [x["id"] for x in _ps if x.get("type") == "table" and not x.get("columns")]

    if _sin:
        falla("%s: parametros `table` sin columnas en el bloque semilla" % _control,
              "%s. El motor no puede repartir las celdas y sus evidencias salen "
              "NO_EVALUABLE." % ", ".join(_sin))
        continue

    # Y que no diverjan del TS, que es donde las mantiene el desarrollador.
    _mal = []
    for _p in _ps:
        if _p.get("type") != "table":
            continue
        _i = _ts.find("id: '%s'" % _p["id"])
        if _i < 0:
            continue
        _j = _ts.find("columns: [", _i)
        _n = _ts.find("      id: 'P-", _i + 10)
        if _j < 0 or (_n > 0 and _j > _n):
            continue
        _k = _ts.index("[", _j)
        _prof, _fin = 0, _k
        for _c in range(_k, len(_ts)):
            if _ts[_c] == "[":
                _prof += 1
            elif _ts[_c] == "]":
                _prof -= 1
                if _prof == 0:
                    _fin = _c + 1
                    break
        _en_ts = _re.findall(r"name: '([^']+)'", _ts[_k:_fin])
        _en_bloque = [c.get("name") for c in _p.get("columns") or []]
        if _en_ts and _en_ts != _en_bloque:
            _mal.append("%s (TS: %s / bloque: %s)"
                        % (_p["id"], ",".join(_en_ts), ",".join(_en_bloque)))

    if _mal:
        falla("%s: las columnas del bloque semilla divergen del TS" % _control,
              "; ".join(_mal))
    else:
        ok("%s: todo `table` declara sus columnas y coinciden con el TS" % _control)

# =============================================================================
# 13. Ninguna evidencia acredita el id de un CONTROL en vez de un requisito
# =============================================================================
#
# `requirements: ['op.acc.3']` es el id del CONTROL, no el de ningun requisito.
# EV-03 de op.acc.3 lo llevaba, y producia una incoherencia visible en la misma
# pantalla: la tabla de evidencias enseñaba "op.acc.3" en la columna Requisito
# ENS y la no conformidad de dos bloques mas abajo decia "op.acc.3.2". Un
# auditor que ve dos identificadores distintos para lo mismo deja de fiarse del
# informe entero.
#
# Es el mismo error que tenia la policy de op.acc.3 —decidir contra el id del
# control, corregido el 06/08/2026— colado tambien en el catalogo de evidencias,
# que es otro fichero. Por eso se vigila en los dos sitios.

print()
print("=== 13. Ninguna evidencia acredita el id de un CONTROL ===")
print()

_cat = (pathlib.Path(PLUGIN) / "dashboard/ens/core/evidence/catalog.ts").read_text(encoding="utf-8")

_huerfanos = []

for _m in _re.finditer(r"requirements: \[([^\]]*)\]", _cat):
    for _r in _re.findall(r"'([^']+)'", _m.group(1)):
        # Un requisito SIEMPRE lleva algo detras del id de su control:
        # `op.acc.3.1`, `op.acc.3.r1.2`. Si acaba en el numero del control, es
        # el control.
        if _re.fullmatch(r"[a-z]+\.[a-z]+\.\d+", _r):
            _huerfanos.append(_r)

if _huerfanos:
    falla("hay evidencias que acreditan el id de un CONTROL, no un requisito",
          "%s. El motor casa por identificador exacto, asi que ese requisito no "
          "existe y la pantalla ensena un id distinto del que sale en la no "
          "conformidad." % ", ".join(sorted(set(_huerfanos))))
else:
    ok("toda evidencia acredita requisitos, no controles")

if fallos:
    print("{} comprobación(es) FALLAN: {}".format(len(fallos), "; ".join(fallos)))
if avisos:
    print("{} aviso(s), no bloquean.".format(len(avisos)))
if not fallos:
    print("coherencia OK")

sys.exit(1 if fallos else 0)
