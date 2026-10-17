#!/usr/bin/env python3
"""Declara los valores de los parámetros de un control, sin pasar por la pantalla.

POR QUÉ EXISTE. `inject-control.py` SIEMBRA la definición de un control —qué
parámetros tiene, de qué tipo y qué significan— pero deja sus valores vacíos:
rellenarlos es una decisión del responsable y se hace en la pantalla. Eso está
bien para un cliente y es un problema para todo lo demás: montar un entorno de
pruebas, reproducir el estado de una máquina, documentar «esto es lo que hay que
declarar» de forma que alguien lo pueda ejecutar y comprobar.

Esta herramienta cierra ese hueco. Toma un fichero con los valores, los FUSIONA
con lo que ya haya y escribe. Lo que no se nombra no se toca.

La fusión es por PARÁMETRO, no por fila: el valor de cada parámetro nombrado se
SUSTITUYE entero. Una lista o una tabla no se amplía; para añadir una fila hay
que pasar la lista completa, con las filas que ya había.

    export OS_CERT=/etc/wazuh-indexer/certs/admin.pem
    export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem
    python3 set-parameters.py politica.json            # plan
    python3 set-parameters.py politica.json --apply    # escribe

El fichero es JSON:

    {
      "op.acc.1": {
        "P-03": ["www-data", "sshd"],
        "P-07": ["usuario1 | servidor1 | Administrador de sistema"]
      }
    }

Una lista se guarda como lista (es lo que espera un parámetro `list` o `table`,
una fila por elemento); una cadena, como cadena; un número, como número.

VALORES DE UN AGENTE (plugin 1.2.0). La clave `agents` declara valores propios
de una máquina, por su id de Wazuh; van a `configuration.agents` y no tocan el
valor de la organización:

    {
      "op.acc.1": { "P-04": ["admin", "test"] },
      "agents": {
        "028": {
          "op.acc.1": { "P-07": ["usuario1 | servidor1 | Administrador de sistema"] },
          "op.exp.4": { "P-04": null }
        }
      }
    }

Solo admiten valor por agente los parámetros por sistema y por plataforma (la
clasificación de `public/ens/configuration/agents/parameter-classes.ts`); uno de
organización se rechaza. `null` QUITA el valor propio de ese agente (vuelve a
heredar de su plantilla o de la organización); en el documento nunca se
escribe `null`. El id se normaliza a tres cifras (`28` es `028`).

DRY-RUN POR DEFECTO. Escribir exige `--apply`, igual que en `inject-control.py`
y por la misma razón: esto sobreescribe decisiones del responsable, y cuando una
operación puede destruir datos del cliente el defecto tiene que ser el seguro.

NO INVENTA PARÁMETROS. Si el fichero nombra un parámetro que el control no
declara, se para y lo dice en vez de añadirlo: un parámetro que el motor no
conoce no lo lee nadie, y verlo «configurado» en la pantalla sugiere un
cumplimiento que no existe.
"""
import argparse
import base64
import datetime
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

ES = os.environ.get("ENS_OS_URL", "https://localhost:9200")
INDEX = "wazuh-ens-configuration"
DOC = "active"

p = argparse.ArgumentParser(description="Declara valores de parámetros de controles ENS.")
p.add_argument("fichero", help="JSON con {control: {parametro: valor}}")
p.add_argument("--apply", action="store_true", help="escribe; sin esto solo muestra el plan")
args = p.parse_args()

OS_CERT = os.environ.get("OS_CERT")
OS_KEY = os.environ.get("OS_KEY")
user = os.environ.get("OS_USER", "admin")
pw = os.environ.get("OS_PASS")

if not pw and not OS_CERT:
    sys.exit(
        "ERROR: exporta OS_PASS, o bien OS_CERT y OS_KEY con el certificado de\n"
        "       administrador del indexer:\n"
        "       export OS_CERT=/etc/wazuh-indexer/certs/admin.pem\n"
        "       export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem"
    )

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

if OS_CERT:
    ctx.load_cert_chain(certfile=OS_CERT, keyfile=OS_KEY)


def req(method, path, body=None):
    r = urllib.request.Request(
        ES + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
    )
    if not OS_CERT:
        r.add_header(
            "Authorization",
            "Basic " + base64.b64encode((user + ":" + pw).encode()).decode(),
        )
    r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, context=ctx) as resp:
        return json.loads(resp.read().decode())


with open(args.fichero, encoding="utf-8") as f:
    deseado = json.load(f)

por_agente = deseado.pop("agents", None) or {}

try:
    actual = req("GET", "/%s/_doc/%s" % (INDEX, DOC))["_source"]
except urllib.error.HTTPError as e:
    sys.exit("ERROR: no se pudo leer la configuración activa (%s). ¿Has sembrado los controles con inject-control.py?" % e)

config = actual.get("configuration", actual)
por_id = {c["controlId"]: c for c in config["controls"]}


def id_agente(valor):
    texto = str(valor).strip()
    return texto.zfill(3) if texto.isdigit() else texto


def clases():
    """La clasificación de los parámetros, de su única fuente: el objeto JSON
    de `parameter-classes.ts`. None si no está (el script fuera del repo)."""
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "ens",
                        "configuration", "agents", "parameter-classes.ts")
    try:
        with open(ruta, encoding="utf-8") as f:
            fuente = f.read()
    except OSError:
        return None
    inicio = fuente.index("{", fuente.index("ENS_PARAMETER_CLASSES:"))
    fin = fuente.index("\n};", inicio)
    return json.loads(fuente[inicio:fin + 2])


def valor_valido(v):
    if isinstance(v, bool) or isinstance(v, str):
        return True
    if isinstance(v, (int, float)):
        return v == v and v not in (float("inf"), float("-inf"))
    return isinstance(v, list) and all(isinstance(x, str) for x in v)


# --- validación ANTES de tocar nada -----------------------------------------
errores = []

for control_id, valores in deseado.items():
    if control_id not in por_id:
        errores.append("el control %s no está sembrado: ejecútalo antes con inject-control.py" % control_id)
        continue
    declarados = {x["id"] for x in por_id[control_id]["parameters"]}
    for pid in valores:
        if pid not in declarados:
            errores.append("%s no declara el parámetro %s (declara: %s)"
                           % (control_id, pid, ", ".join(sorted(declarados))))

clasificacion = clases() if por_agente else {}
if por_agente and clasificacion is None:
    errores.append("no encuentro public/ens/configuration/agents/parameter-classes.ts: "
                   "los valores por agente se declaran desde el directorio config/ del repo del plugin")
    clasificacion = {}

for agente, controles in por_agente.items():
    if not id_agente(agente):
        errores.append("agents: hay un id de agente vacío")
        continue
    for control_id, valores in (controles or {}).items():
        if control_id not in por_id:
            errores.append("agente %s: el control %s no está sembrado" % (id_agente(agente), control_id))
            continue
        declarados = {x["id"] for x in por_id[control_id]["parameters"]}
        for pid, v in (valores or {}).items():
            clase = clasificacion.get(control_id, {}).get(pid)
            if pid not in declarados:
                errores.append("agente %s: %s no declara el parámetro %s" % (id_agente(agente), control_id, pid))
            elif clase not in ("system", "platform"):
                errores.append("agente %s: %s %s es un parámetro de organización (vale para todas las máquinas)"
                               % (id_agente(agente), control_id, pid))
            elif v is not None and not valor_valido(v):
                errores.append("agente %s: %s %s tiene un valor que no es texto, número, booleano ni lista de textos"
                               % (id_agente(agente), control_id, pid))

if errores:
    for e in errores:
        print("ERROR: " + e, file=sys.stderr)
    sys.exit(1)


def corto(v):
    t = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return (t[:70] + "…") if len(t) > 70 else t


# --- el plan ----------------------------------------------------------------
cambios = 0

for control_id, valores in sorted(deseado.items()):
    print("── %s" % control_id)
    for par in por_id[control_id]["parameters"]:
        if par["id"] not in valores:
            continue
        nuevo = valores[par["id"]]
        viejo = par.get("value")
        if viejo == nuevo:
            print("   %-6s sin cambio" % par["id"])
            continue
        print("   %-6s %s  ->  %s" % (par["id"], corto(viejo) if viejo not in (None, "") else "(vacío)", corto(nuevo)))
        par["value"] = nuevo
        cambios += 1

agentes = config.get("agents") or {}
for agente, controles in sorted(por_agente.items()):
    aid = id_agente(agente)
    print("── agente %s" % aid)
    perfil = agentes.get(aid) or {}
    propios = perfil.get("controls") or {}
    for control_id, valores in sorted((controles or {}).items()):
        parametros = dict((propios.get(control_id) or {}).get("parameters") or {})
        for pid, nuevo in sorted((valores or {}).items()):
            viejo = parametros.get(pid)
            if nuevo is None:
                if pid not in parametros:
                    print("   %s %-6s sin valor propio: nada que quitar" % (control_id, pid))
                    continue
                del parametros[pid]
                print("   %s %-6s %s  ->  (hereda)" % (control_id, pid, corto(viejo)))
            elif viejo == nuevo:
                print("   %s %-6s sin cambio" % (control_id, pid))
                continue
            else:
                parametros[pid] = nuevo
                print("   %s %-6s %s  ->  %s" % (control_id, pid, corto(viejo) if viejo is not None else "(hereda)", corto(nuevo)))
            cambios += 1
        if parametros:
            propios[control_id] = {"parameters": parametros}
        else:
            propios.pop(control_id, None)
    if propios:
        perfil["controls"] = propios
    else:
        perfil.pop("controls", None)
    agentes[aid] = perfil
if por_agente:
    config["agents"] = agentes

if not cambios:
    print("\nNada que cambiar.")
    sys.exit(0)

if not args.apply:
    print("\n%d cambio(s). DRY-RUN: nada escrito. Añade --apply." % cambios)
    sys.exit(0)

config["updatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
actual["configuration"] = config
req("PUT", "/%s/_doc/%s" % (INDEX, DOC), actual)
print("\n%d cambio(s) escritos en %s/%s." % (cambios, INDEX, DOC))
