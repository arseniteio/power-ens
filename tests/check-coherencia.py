#!/usr/bin/env python3
"""Comprobación de coherencia entre el plugin y los tres runbooks.

Verifica lo que ninguna prueba unitaria puede ver, porque vive en el hueco entre
cuatro repositorios: que lo que el plugin le promete al auditor exista de verdad
en lo que se despliega en el manager.

    python3 tests/check-coherencia.py

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
"""
import json
import os
import re
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
        "op.acc.1-control-access-1-runbook",
        ["ensfacil_op_acc_1_json_rules.xml"],
    ),
    "op.acc.2": (
        "op.acc.2-requisitos-acceso-runbook",
        ["ensfacil_op_acc_2_json_rules.xml"],
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

for control in RUNBOOKS:
    desplegadas = reglas_desplegadas(control)
    acreditadas = set()
    for _, cuerpo in bloques_evidencia(catalogo, control):
        acreditadas |= set(campo_lista(cuerpo, "relatedRules"))

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

ESPERADOS = ["install-manager.sh", "install-fake.sh", "install-real.sh", "uninstall.sh"]
for control, (repo, _) in RUNBOOKS.items():
    faltan = [
        s for s in ESPERADOS if not os.path.exists(os.path.join(BASE, repo, s))
    ]
    if faltan:
        falla(
            "{}: le faltan scripts del procedimiento común".format(control),
            ", ".join(faltan),
        )
    else:
        ok("{}: tiene los cuatro scripts del procedimiento".format(control))

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

print()
if fallos:
    print("{} comprobación(es) FALLAN: {}".format(len(fallos), "; ".join(fallos)))
if avisos:
    print("{} aviso(s), no bloquean.".format(len(avisos)))
if not fallos:
    print("coherencia OK")
sys.exit(1 if fallos else 0)
