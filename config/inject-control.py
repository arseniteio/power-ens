#!/usr/bin/env python3
"""Siembra el bloque de configuración de un control ENS en el documento 'active'
de wazuh-ens-configuration, preservando el resto.

Por qué hace falta: el motor del plugin evalúa los requisitos contra los
parámetros configurados. Si el control no está en el índice, sus parámetros
obligatorios cuentan como ausentes y el score cae a 0 aunque las evidencias
digan lo contrario. Y la UI no deja dar de alta un control que no esté ya ahí
(huevo/gallina), así que la primera siembra va por aquí.

Idempotente: sustituye el bloque del control si ya estaba, no duplica.
Dry-run por defecto; --apply para escribir.

Uso:
    export OS_USER=admin
    export OS_PASS='...'
    python3 inject-control.py op.acc.1            # dry-run
    python3 inject-control.py op.acc.1 --apply    # escribe

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
args = p.parse_args()

control_id = args.control
bloque_fichero = args.block or control_id.replace(".", "-") + "-control-block.json"

user = os.environ.get("OS_USER", "admin")
pw = os.environ.get("OS_PASS")
if not pw:
    sys.exit("ERROR: exporta OS_PASS con la contraseña de OpenSearch.")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def req(method, path, body=None):
    r = urllib.request.Request(
        ES + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
    )
    r.add_header("Authorization", "Basic " + base64.b64encode((user + ":" + pw).encode()).decode())
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
                 "El plugin lo crea al abrir su pantalla de configuración por primera vez;\n"
                 "ábrela y vuelve a ejecutar.".format(DOC, INDEX))
    raise

source = doc["_source"]
cfg = source["configuration"]
controls = cfg.get("controls", [])
presentes = [c["controlId"] for c in controls]
print("Controles ya configurados:", presentes or "(ninguno)")

ya_estaba = control_id in presentes
if ya_estaba:
    print("AVISO: {} ya estaba; su bloque se sustituye por el de este fichero.".format(control_id))
    print("       Si habías ajustado sus valores desde la UI, se perderán.")

# --- sustituir sin tocar los demás
controls = [c for c in controls if c["controlId"] != control_id]
controls.append(block)
cfg["controls"] = controls

ahora = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
cfg["updatedAt"] = ahora
cfg["changeReason"] = "{} del control {} en la configuración activa.".format(
    "Actualización" if ya_estaba else "Alta", control_id)
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
