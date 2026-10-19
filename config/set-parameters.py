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

VACÍO = SIN VALOR. `null`, `""` y `[]` QUITAN el valor: en la organización
desaparece la clave `value` (un parámetro vacío es la clave ausente, nunca
`null`), igual que al vaciar un campo en la pantalla.

VALORES DE UN AGENTE (plugin 1.2.0). La clave `agents` declara valores propios
de una máquina, por su id de Wazuh; van a `configuration.agents` y no tocan el
valor de la organización:

    {
      "op.acc.1": { "P-04": ["admin", "test"] },
      "agents": {
        "001": {
          "op.acc.1": { "P-07": ["usuario1 | servidor1 | Administrador de sistema"] },
          "op.exp.4": { "P-04": null }
        }
      }
    }

Solo admiten valor por agente los parámetros por sistema y por plataforma (la
clasificación de `common/ens/configuration/agents/parameter-classes.ts`); uno de
organización se rechaza. `null` (o vacío) QUITA el valor propio de ese agente,
que vuelve a heredar de su plantilla o del valor común; quitar se admite
siempre, también para un valor que no se aplica (un control que ya no está, un
parámetro que no existe o uno de organización). La clave es el id del agente
(`7` se normaliza a `007`); un nombre se rechaza, con el id si el documento ya
conoce ese nombre.

PLANTILLA DE UN AGENTE EN UN CONTROL (plugin 1.3.0). Dentro de un control de un
agente, la clave `template` asigna la plantilla de ese control; sin ella no se
toca la asignación:

    {
      "agents": {
        "001": {
          "op.acc.1": { "template": "linux-ubuntu", "P-07": ["usuario1 | servidor1 | Administrador de sistema"] },
          "op.acc.2": { "template": "custom-servidores-web" },
          "op.exp.2": { "template": "none" },
          "op.exp.4": { "template": null }
        }
      }
    }

El valor es el id de una plantilla de serie del control (`linux-ubuntu`,
`zimbra-ldap`, `windows-server`, `manager-wazuh`, `pbs-backup`,
`zimbra-ne-backup`, las que tenga ese control) o de una plantilla propia de
`configuration.templates` del mismo control; `none` deja el agente sin plantilla
(valores comunes) y `null` quita la asignación (vuelve la plantilla de serie de
su tipo). El valor que se aplica: ajuste propio, plantilla asignada, plantilla
de serie de su tipo y valor común del control. Un documento sin la clave
`configuration.templates` y sin nada que convertir se marca como de la 1.3.0 al
escribir; si tiene plantillas o tipos guardados por la 1.2.0, no admite
`template` hasta guardar un cambio desde Configuración (el plugin lo convierte).

EXPRESIÓN REGULAR (plugin 1.3.0). En los parámetros cuyo juicio compara una
lista plana (op.acc.1 P-03 y P-04, op.acc.4 P-05, op.acc.6 P-08 y P-11), un
valor puede ser una expresión regular RE2, sin barras, que se compara con el
valor completo. Se declara con un objeto `value` + `matchMode`, igual en la
organización que en un agente:

    {
      "op.acc.1": { "P-04": { "value": "^(admin|guest)$", "matchMode": "regex" } },
      "agents": {
        "001": { "op.acc.1": { "P-03": { "value": "^svc_.*$", "matchMode": "regex" } } }
      }
    }

Un valor sin objeto es texto exacto y quita el modo que hubiera; vaciar el valor
quita también su modo. Se comprueban el modo, el parámetro y la longitud (512
caracteres como mucho); la sintaxis RE2 la comprueba
`npx --yes tsx config/validate-configuration.ts` sobre el documento escrito.

ANTES DE ESCRIBIR, la versión que se sustituye se guarda en el historial de
`wazuh-ens-configuration`, como hace el plugin, o, si el índice no lo admite,
en un fichero local `active-antes-<fecha>.json`. La herramienta dice dónde.

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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ensfacil_history import guarda_version_anterior  # noqa: E402

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

anterior = json.loads(json.dumps(actual))
config = actual.get("configuration", actual)
por_id = {c["controlId"]: c for c in config["controls"]}


def id_agente(valor):
    texto = str(valor).strip()
    return texto.zfill(3) if texto.isdigit() else texto


def clases():
    """La clasificación de los parámetros, de su única fuente: el objeto JSON
    de `parameter-classes.ts`. None si no está (el script fuera del repo)."""
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "common", "ens",
                        "configuration", "agents", "parameter-classes.ts")
    try:
        with open(ruta, encoding="utf-8") as f:
            fuente = f.read()
    except OSError:
        return None
    inicio = fuente.index("{", fuente.index("ENS_PARAMETER_CLASSES:"))
    fin = fuente.index("\n};", inicio)
    return json.loads(fuente[inicio:fin + 2])


# Built-in template ids per control; tests/control-templates-model.test.ts checks it against the plugin.
BUILTIN_TEMPLATES = {
    "mp.info.6": ["linux-ubuntu", "zimbra-ldap", "pbs-backup", "zimbra-ne-backup"],
    "op.acc.1": ["linux-ubuntu", "zimbra-ldap", "windows-server"],
    "op.acc.2": ["linux-ubuntu", "zimbra-ldap", "windows-server"],
    "op.acc.3": ["linux-ubuntu", "zimbra-ldap", "windows-server"],
    "op.acc.4": ["linux-ubuntu", "zimbra-ldap", "windows-server"],
    "op.acc.5": ["linux-ubuntu", "zimbra-ldap"],
    "op.acc.6": ["linux-ubuntu", "zimbra-ldap"],
    "op.cont.3": ["manager-wazuh"],
    "op.exp.1": ["linux-ubuntu", "zimbra-ldap"],
    "op.exp.2": ["linux-ubuntu", "zimbra-ldap"],
    "op.exp.3": ["linux-ubuntu", "zimbra-ldap"],
    "op.exp.4": ["linux-ubuntu", "zimbra-ldap"],
    "op.exp.5": ["linux-ubuntu", "zimbra-ldap"],
    "op.exp.6": ["linux-ubuntu", "zimbra-ldap"],
    "op.exp.7": ["manager-wazuh"],
    "op.exp.8": ["linux-ubuntu", "zimbra-ldap", "manager-wazuh"],
    "op.exp.10": ["linux-ubuntu", "zimbra-ldap"],
    "op.mon.1": ["manager-wazuh"],
    "op.mon.3": ["linux-ubuntu", "zimbra-ldap", "manager-wazuh"],
}
NO_TEMPLATE = "none"
TEMPLATE_KEY = "template"

# Parameters with the «Expresión regular» mode; tests/parameter-match-mode-levels.test.ts checks it against the plugin.
PATTERN_PARAMETERS = {
    "op.acc.1": ["P-03", "P-04"],
    "op.acc.4": ["P-05"],
    "op.acc.6": ["P-08", "P-11"]
}
MAX_PATTERN_LENGTH = 512
ENTRY_KEYS = {"value", "matchMode"}


def needs_conversion(agents):
    # Profiles the plugin's 1.2.0 conversion would change: their resolution needs it before any 1.3.0 key.
    return any(isinstance(p, dict) and (isinstance(p.get("templates"), list) or p.get("detectedType") or p.get("typeOverride"))
               for p in (agents or {}).values())


def vacio(v):
    return v is None or (isinstance(v, str) and not v.strip()) or (isinstance(v, list) and not [x for x in v if str(x).strip()])


def valor_valido(v):
    if isinstance(v, bool) or isinstance(v, str):
        return True
    if isinstance(v, (int, float)):
        return v == v and v not in (float("inf"), float("-inf"))
    return isinstance(v, list) and all(isinstance(x, str) for x in v)


def unwrap(entry):
    """(value, mode, problem) of a file entry: a plain value is exact, an object carries `value` and `matchMode`."""
    if not isinstance(entry, dict):
        return entry, "exact", None
    if set(entry) - ENTRY_KEYS or "value" not in entry:
        return None, None, 'tiene un valor que no es texto, número, booleano ni lista de textos (con modo: {"value": …, "matchMode": "exact" | "regex"})'
    mode = entry.get("matchMode", "exact")
    if mode not in ("exact", "regex"):
        return None, None, 'matchMode es "exact" o "regex", no %s' % json.dumps(mode, ensure_ascii=False)
    return entry["value"], mode, None


def entry_problem(control_id, pid, entry):
    value, mode, problem = unwrap(entry)
    if problem:
        return problem
    if vacio(value):
        return None
    if not valor_valido(value):
        return "tiene un valor que no es texto, número, booleano ni lista de textos"
    if mode == "regex":
        if pid not in PATTERN_PARAMETERS.get(control_id, []):
            return "no admite expresión regular (la admiten: %s)" % "; ".join(
                "%s %s" % (c, ", ".join(ps)) for c, ps in PATTERN_PARAMETERS.items())
        if not isinstance(value, str):
            return "en modo regex el valor es una expresión regular (texto)"
        if len(value) > MAX_PATTERN_LENGTH:
            return "la expresión regular admite hasta %d caracteres" % MAX_PATTERN_LENGTH
    return None


def shown(value, mode):
    return ("regex " if mode == "regex" else "") + corto(value)


agentes_doc = config.get("agents") or {}
legacy_document = not isinstance(config.get("templates"), list)
mark_130 = legacy_document and not needs_conversion(agentes_doc)


def sugerencia(nombre):
    """El id de un perfil que ya conoce ese nombre (su nombre o un alias)."""
    buscado = str(nombre).strip().lower()
    for aid, perfil in agentes_doc.items():
        nombres = [str((perfil or {}).get("name") or "")] + list((perfil or {}).get("aliases") or [])
        if buscado in [n.strip().lower() for n in nombres if n]:
            return aid
    return None


# --- validación ANTES de tocar nada -----------------------------------------
errores = []

for control_id, valores in deseado.items():
    if control_id not in por_id:
        errores.append("el control %s no está sembrado: ejecútalo antes con inject-control.py" % control_id)
        continue
    declarados = {x["id"] for x in por_id[control_id]["parameters"]}
    for pid, v in valores.items():
        if pid not in declarados:
            errores.append("%s no declara el parámetro %s (declara: %s)"
                           % (control_id, pid, ", ".join(sorted(declarados))))
        elif entry_problem(control_id, pid, v):
            errores.append("%s %s %s" % (control_id, pid, entry_problem(control_id, pid, v)))

clasificacion = clases() if por_agente else {}
if por_agente and clasificacion is None:
    errores.append("no encuentro common/ens/configuration/agents/parameter-classes.ts: "
                   "los valores por agente se declaran desde el directorio config/ del repo del plugin")
    clasificacion = {}

for agente, controles in por_agente.items():
    aid = id_agente(agente)
    if not aid.isdigit():
        conocido = sugerencia(agente)
        errores.append('"%s" no es un id de agente; usar el id%s' % (
            agente, " (%s)" % conocido if conocido else " numérico del agente de Wazuh, p. ej. 001"))
        continue
    propios = ((agentes_doc.get(aid) or {}).get("controls") or {})
    for control_id, valores in (controles or {}).items():
        if TEMPLATE_KEY in (valores or {}):
            template_id = valores[TEMPLATE_KEY]
            custom_ids = [t.get("id") for t in (config.get("templates") or []) if isinstance(t, dict) and t.get("controlId") == control_id]
            if legacy_document and not mark_130:
                errores.append("agente %s: el documento tiene plantillas o tipos de la 1.2.0 que el plugin convierte al guardar: "
                               "guardar cualquier cambio desde Configuración (si aparece el aviso, «Guardar la conversión») "
                               "y volver a ejecutar" % aid)
            elif vacio(template_id):
                pass
            elif not isinstance(template_id, str):
                errores.append("agente %s: %s template tiene que ser el id de una plantilla, «none» o null" % (aid, control_id))
            elif control_id not in por_id:
                errores.append("agente %s: el control %s no está sembrado" % (aid, control_id))
            elif template_id != NO_TEMPLATE and template_id not in BUILTIN_TEMPLATES.get(control_id, []) + custom_ids:
                errores.append("agente %s: %s no tiene la plantilla %s (de serie: %s; propias: %s)" % (
                    aid, control_id, template_id, ", ".join(BUILTIN_TEMPLATES.get(control_id, [])) or "ninguna",
                    ", ".join(custom_ids) or "ninguna"))
        for pid, v in (valores or {}).items():
            if pid == TEMPLATE_KEY:
                continue
            # Quitar se admite siempre: también un valor que no se aplica.
            if not unwrap(v)[2] and vacio(unwrap(v)[0]):
                continue
            clase = clasificacion.get(control_id, {}).get(pid)
            if control_id not in por_id:
                errores.append("agente %s: el control %s no está sembrado" % (aid, control_id))
            elif pid not in {x["id"] for x in por_id[control_id]["parameters"]}:
                errores.append("agente %s: %s no declara el parámetro %s" % (aid, control_id, pid))
            elif clase not in ("system", "platform"):
                errores.append("agente %s: %s %s es un parámetro de organización (vale para todas las máquinas)"
                               % (aid, control_id, pid))
            elif entry_problem(control_id, pid, v):
                errores.append("agente %s: %s %s %s" % (aid, control_id, pid, entry_problem(control_id, pid, v)))

if errores:
    for e in errores:
        print("ERROR: " + e, file=sys.stderr)
    sys.exit(1)


def corto(v):
    t = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return (t[:70] + "…") if len(t) > 70 else t


def stored_mode(mode):
    return "regex" if mode == "regex" else "exact"


# --- el plan ----------------------------------------------------------------
cambios = 0

for control_id, valores in sorted(deseado.items()):
    print("── %s" % control_id)
    for par in por_id[control_id]["parameters"]:
        if par["id"] not in valores:
            continue
        nuevo, new_mode, _ = unwrap(valores[par["id"]])
        viejo = par.get("value")
        old_mode = stored_mode(par.get("matchMode"))
        if vacio(nuevo):
            if "value" not in par:
                print("   %-6s sin valor: nada que quitar" % par["id"])
                continue
            del par["value"]
            par.pop("matchMode", None)
            print("   %-6s %s  ->  (sin valor)" % (par["id"], shown(viejo, old_mode)))
            cambios += 1
            continue
        if viejo == nuevo and old_mode == new_mode:
            print("   %-6s sin cambio" % par["id"])
            continue
        print("   %-6s %s  ->  %s" % (par["id"], shown(viejo, old_mode) if viejo not in (None, "") else "(vacío)", shown(nuevo, new_mode)))
        par["value"] = nuevo
        if new_mode == "regex":
            par["matchMode"] = "regex"
        else:
            par.pop("matchMode", None)
        cambios += 1

for agente, controles in sorted(por_agente.items()):
    aid = id_agente(agente)
    print("── agente %s" % aid)
    perfil = agentes_doc.get(aid) or {}
    propios = perfil.get("controls") or {}
    for control_id, valores in sorted((controles or {}).items()):
        entrada = dict(propios.get(control_id) or {})
        parametros = dict(entrada.get("parameters") or {})
        modes = dict(entrada.get("matchModes") or {})
        if TEMPLATE_KEY in (valores or {}):
            new_id = None if vacio(valores[TEMPLATE_KEY]) else valores[TEMPLATE_KEY]
            old_id = entrada.get("templateId")
            if new_id == old_id:
                print("   %s template sin cambio" % control_id)
            else:
                print("   %s template %s  ->  %s" % (control_id, old_id or "(la de serie de su tipo)", new_id or "(la de serie de su tipo)"))
                if new_id:
                    entrada["templateId"] = new_id
                else:
                    entrada.pop("templateId", None)
                cambios += 1
        for pid, entry in sorted((valores or {}).items()):
            if pid == TEMPLATE_KEY:
                continue
            nuevo, new_mode, _ = unwrap(entry)
            viejo = parametros.get(pid)
            old_mode = stored_mode(modes.get(pid))
            if vacio(nuevo):
                if pid not in parametros and pid not in modes:
                    print("   %s %-6s sin valor propio: nada que quitar" % (control_id, pid))
                    continue
                parametros.pop(pid, None)
                modes.pop(pid, None)
                print("   %s %-6s %s  ->  (hereda)" % (control_id, pid, shown(viejo, old_mode)))
            elif viejo == nuevo and old_mode == new_mode:
                print("   %s %-6s sin cambio" % (control_id, pid))
                continue
            else:
                parametros[pid] = nuevo
                if new_mode == "regex":
                    modes[pid] = "regex"
                else:
                    modes.pop(pid, None)
                print("   %s %-6s %s  ->  %s" % (control_id, pid, shown(viejo, old_mode) if viejo is not None else "(hereda)", shown(nuevo, new_mode)))
            cambios += 1
        # Other keys stored next to `parameters` (`templateId`, or a later version's) are kept.
        if parametros:
            entrada["parameters"] = parametros
        else:
            entrada.pop("parameters", None)
        if modes:
            entrada["matchModes"] = modes
        else:
            entrada.pop("matchModes", None)
        if entrada:
            propios[control_id] = entrada
        else:
            propios.pop(control_id, None)
    if propios:
        perfil["controls"] = propios
    else:
        perfil.pop("controls", None)
    agentes_doc[aid] = perfil
if por_agente:
    config["agents"] = agentes_doc

if not cambios:
    print("\nNada que cambiar.")
    sys.exit(0)

if mark_130:
    config["templates"] = []
    print("configuration.templates: se añade vacía (el documento pasa a ser de la 1.3.0; no había nada que convertir)")

if not args.apply:
    print("\n%d cambio(s). DRY-RUN: nada escrito. Añade --apply." % cambios)
    sys.exit(0)

# La versión que se sustituye, antes de escribir (el documento tal como se leyó).
print("Versión anterior guardada en: %s" % guarda_version_anterior(req, INDEX, anterior, "set-parameters.py"))

config["updatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
actual["configuration"] = config
req("PUT", "/%s/_doc/%s" % (INDEX, DOC), actual)
print("\n%d cambio(s) escritos en %s/%s." % (cambios, INDEX, DOC))
