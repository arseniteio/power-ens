#!/usr/bin/env python3
"""Siembra el bloque de configuración de un control ENS en el documento 'active'
de wazuh-ens-configuration, preservando el resto.

Por qué hace falta: el motor del plugin evalúa los requisitos contra los
parámetros configurados. Si el control no está en el índice, sus parámetros
obligatorios cuentan como ausentes y el score cae a 0 aunque las evidencias
digan lo contrario. Y la UI no deja dar de alta un control que no esté ya ahí
(huevo/gallina), así que la primera siembra va por aquí.

Idempotente: si el control ya estaba, FUSIONA. Conserva el valor de cada
parámetro que ya tuviera uno y añade los que falten. Los valores que el auditor
puso desde la UI no se tocan.

Por qué fusiona y no sustituye: sustituía, y el 30/07 una segunda ejecución
borró la configuración de op.acc.2 en producción de pruebas y su cumplimiento
cayó de 83 % a 17 %. El script lo avisaba por pantalla. Un aviso no basta cuando
la operación destruye datos del cliente: el comportamiento por defecto tiene que
ser el seguro, y el destructivo tiene que pedirse (--sustituir).

Dry-run por defecto; --apply para escribir.

Uso:
    export OS_USER=admin
    export OS_PASS='...'
    # o, en el propio manager, sin necesidad de la contraseña:
    export OS_CERT=/etc/wazuh-indexer/certs/admin.pem
    export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem
    python3 inject-control.py op.acc.1               # dry-run
    python3 inject-control.py op.acc.1 --apply       # fusiona y escribe
    python3 inject-control.py op.acc.1 --sustituir   # descarta los valores puestos

El fichero de bloque se deduce del id del control (op.acc.1 ->
op-acc-1-control-block.json) salvo que se pase --block <fichero>.
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

p = argparse.ArgumentParser(description="Siembra un control ENS en la configuración activa.")
p.add_argument("control", help="id del control, p.ej. op.acc.1")
p.add_argument("--block", help="fichero del bloque (por defecto, deducido del id)")
p.add_argument("--apply", action="store_true", help="escribe; sin esto solo muestra el plan")
p.add_argument("--sustituir", action="store_true",
               help="DESTRUCTIVO: descarta los valores ya configurados en vez de conservarlos")
args = p.parse_args()

control_id = args.control
bloque_fichero = args.block or control_id.replace(".", "-") + "-control-block.json"

# DOS FORMAS DE AUTENTICARSE, y la del certificado existe por una razón
# práctica: en un manager de Wazuh la contraseña de `admin` vive en el keystore
# del dashboard y no se puede leer en claro, mientras que el certificado de
# administrador del indexer SIEMPRE está en /etc/wazuh-indexer/certs. Exigir la
# contraseña obligaba a ir a buscarla fuera de la máquina para una operación que
# se hace EN la máquina, y eso acaba en contraseñas pegadas en un chat.
#
#   OS_PASS               contraseña de OS_USER (por defecto, admin)
#   OS_CERT + OS_KEY      certificado de cliente. Tiene prioridad si está.
OS_CERT = os.environ.get("OS_CERT")
OS_KEY = os.environ.get("OS_KEY")

user = os.environ.get("OS_USER", "admin")
pw = os.environ.get("OS_PASS")

if not pw and not OS_CERT:
    sys.exit(
        "ERROR: exporta OS_PASS con la contraseña de OpenSearch, o bien\n"
        "       OS_CERT y OS_KEY con el certificado de administrador, p.ej.\n"
        "       export OS_CERT=/etc/wazuh-indexer/certs/admin.pem\n"
        "       export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem"
    )

if OS_CERT and not OS_KEY:
    sys.exit("ERROR: OS_CERT sin OS_KEY: hacen falta los dos.")

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
    # Con certificado NO se manda cabecera de autorización: el propio TLS
    # identifica al cliente, y mandar las dos cosas hace que OpenSearch se
    # quede con la básica y rechace por contraseña vacía.
    if not OS_CERT:
        r.add_header(
            "Authorization",
            "Basic " + base64.b64encode((user + ":" + pw).encode()).decode(),
        )
    r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, context=ctx) as resp:
        return json.loads(resp.read().decode())


# --- el bloque a sembrar
try:
    with open(bloque_fichero, encoding="utf-8") as f:
        block = json.load(f)
except FileNotFoundError:
    sys.exit("ERROR: no encuentro {}. Ejecuta desde el directorio config/ del repo del plugin.".format(bloque_fichero))

if block.get("controlId") != control_id:
    sys.exit("ERROR: {} declara controlId={!r}, no {!r}. Comprueba el fichero.".format(
        bloque_fichero, block.get("controlId"), control_id))

parametros = block.get("parameters", [])
obligatorios = [x.get("id") for x in parametros if x.get("required")]
print("Bloque: {} con {} parámetros ({} obligatorios: {})".format(
    bloque_fichero, len(parametros), len(obligatorios), ", ".join(obligatorios) or "ninguno"))

# --- documento actual
try:
    doc = req("GET", "/{}/_doc/{}".format(INDEX, DOC))
except urllib.error.HTTPError as e:
    if e.code == 404:
        sys.exit("ERROR: no existe el documento '{}' en el índice '{}'.\n"
                 "El plugin lo crea con el primer guardado desde su pantalla de Configuración;\n"
                 "guarda la configuración una vez y vuelve a ejecutar.".format(DOC, INDEX))
    raise

source = doc["_source"]
cfg = source["configuration"]
controls = cfg.get("controls", [])
presentes = [c["controlId"] for c in controls]
print("Controles ya configurados:", presentes or "(ninguno)")

ya_estaba = control_id in presentes
anterior = next((c for c in controls if c["controlId"] == control_id), None)


def tiene_valor(v):
    # "" y [] son campos vacíos, no valores configurados: un parámetro así sigue
    # contando como no configurado y su evidencia sigue en NO_EVALUABLE.
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ""
    if isinstance(v, (list, dict)):
        return len(v) > 0
    return True


# --- fusionar con lo que ya hubiera
conservados = []
nuevos = []
retirados = []

if anterior and not args.sustituir:
    valores_previos = {
        x.get("id"): x.get("value")
        for x in anterior.get("parameters", [])
        if tiene_valor(x.get("value"))
    }
    ids_previos = {x.get("id") for x in anterior.get("parameters", [])}

    for parametro in parametros:
        pid = parametro.get("id")
        if pid in valores_previos:
            parametro["value"] = valores_previos[pid]
            conservados.append(pid)
        elif pid not in ids_previos:
            nuevos.append(pid)

    ids_nuevos = {x.get("id") for x in parametros}
    retirados = [
        "{} (con valor)".format(x.get("id")) if tiene_valor(x.get("value")) else x.get("id")
        for x in anterior.get("parameters", [])
        if x.get("id") not in ids_nuevos
    ]

    print("Fusión con lo ya configurado:")
    print("  conserva su valor: {}".format(", ".join(conservados) or "ninguno"))
    print("  parámetros nuevos: {}".format(", ".join(nuevos) or "ninguno"))
    if retirados:
        print("  YA NO EXISTEN en el bloque y se pierden: {}".format(", ".join(retirados)))
elif anterior and args.sustituir:
    con_valor = [
        x.get("id") for x in anterior.get("parameters", []) if tiene_valor(x.get("value"))
    ]
    print("--sustituir: se DESCARTAN los valores ya configurados.")
    print("  se pierden: {}".format(", ".join(con_valor) or "ninguno (no había valores puestos)"))

# --- reemplazar el bloque del control sin tocar los demás
controls = [c for c in controls if c["controlId"] != control_id]
controls.append(block)
cfg["controls"] = controls

ahora = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
cfg["updatedAt"] = ahora
if not ya_estaba:
    motivo = "Alta"
elif args.sustituir:
    motivo = "Sustitución (valores descartados)"
else:
    motivo = "Actualización (valores conservados)"
cfg["changeReason"] = "{} del control {} en la configuración activa.".format(motivo, control_id)
source["updatedAt"] = ahora

print("Tras la operación:", sorted(c["controlId"] for c in cfg["controls"]))

if not args.apply:
    print("\n== DRY-RUN ==  nada se ha escrito. Añade --apply si el plan es correcto.")
    sys.exit(0)

result = req("PUT", "/{}/_doc/{}".format(INDEX, DOC), source)
print("\n== APLICADO ==  result: {} | version: {}".format(result.get("result"), result.get("_version")))
print("El control aparecerá en la pantalla de Configuración del plugin.")
print("Los parámetros obligatorios sin valor seguirán degradando sus evidencias a NO_EVALUABLE,")
print("que es el comportamiento correcto: sin dato no se afirma cumplimiento.")
