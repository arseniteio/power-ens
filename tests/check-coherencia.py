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

Y el 31/07, en el primer despliegue real, apareció la tercera variante del
mismo hueco, por el otro extremo: un evento que el MOTOR lee del índice
(`collector_run`) y al que nadie le había dado regla, porque cuando se decidió
no dársela solo era diagnóstico. El agente lo emitía, la regla base es
`level="0"`, no generaba alerta, no llegaba al índice, y EV-03 de op.acc.1 salía
NO_EVALUABLE permanente sobre una máquina sana. Las dos decisiones eran
correctas por separado. La comprobación 7 vigila ese contrato.
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

print()
if fallos:
    print("{} comprobación(es) FALLAN: {}".format(len(fallos), "; ".join(fallos)))
if avisos:
    print("{} aviso(s), no bloquean.".format(len(avisos)))
if not fallos:
    print("coherencia OK")
sys.exit(1 if fallos else 0)
