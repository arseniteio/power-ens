#!/usr/bin/env python3
"""Seeds the configuration block of an ENS control into the 'active' document of
wazuh-ens-configuration, preserving the rest.

The plugin engine evaluates requirements against the configured parameters: if the control is not in
the index, its required parameters count as absent and the score falls to 0. The UI cannot add a
control that is not already there, so the first seeding goes through here.

Idempotent: if the control was already there, it MERGES. It keeps the value of every parameter that had
one and adds those missing. Values the auditor set from the UI are not touched, and a value in
«Expresión regular» mode keeps its `matchMode`. It merges instead of replacing because replacing would
discard the owner's declared values: a second run would empty the control's configuration. The
destructive behaviour must be requested (--sustituir).

Dry-run by default; --apply to write.

ORGANISATION DATA (`configuration.organizationData`, plugin 1.4.0) IS KEPT AS IT IS. A parameter of the
control that reads an organisation item and has no value (a new control, or after --sustituir) takes the
item's value, as the plugin does on load; a parameter with a different value is left for the plugin to
show as a conflict.

THE PER-AGENT LAYER AND THE CUSTOM TEMPLATES (`configuration.agents` and `configuration.templates`,
plugin 1.3.0) ARE NOT TOUCHED: the whole `_source` is written and only `controls` changes. If a
parameter is withdrawn from the block and an agent or custom template had a value for it, a warning is
printed: that value is orphaned (nobody reads it) until removed on the screen. Seeding a new control
creates no templates, assignments or per-agent settings.

BEFORE WRITING, the version being replaced is saved in the `wazuh-ens-configuration` history, like the
plugin does, or, if the index does not accept it, in a local file `active-antes-<date>.json`. The tool
says where.

Usage:
    export OS_USER=admin
    export OS_PASS='...'
    # or, on the manager itself, without the password:
    export OS_CERT=/etc/wazuh-indexer/certs/admin.pem
    export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem
    python3 inject-control.py op.acc.1               # dry-run
    python3 inject-control.py op.acc.1 --apply       # merges and writes
    python3 inject-control.py op.acc.1 --sustituir   # discards the values set

The block file is derived from the control id (op.acc.1 -> op-acc-1-control-block.json) unless
--block <file> is given.
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
from ensfacil_history import save_previous_version  # noqa: E402
import ensfacil_organization as organization  # noqa: E402

ES = os.environ.get("ENS_OS_URL", "https://localhost:9200")
INDEX = "wazuh-ens-configuration"
DOC = "active"

p = argparse.ArgumentParser(description="Seeds an ENS control into the active configuration.")
p.add_argument("control", help="control id, e.g. op.acc.1")
p.add_argument("--block", help="block file (default: derived from the id)")
p.add_argument("--apply", action="store_true", help="writes; without it only the plan is shown")
p.add_argument("--sustituir", action="store_true",
               help="DESTRUCTIVE: discards the values already configured instead of keeping them")
args = p.parse_args()

control_id = args.control
block_file = args.block or control_id.replace(".", "-") + "-control-block.json"

# TWO WAYS TO AUTHENTICATE. On a Wazuh manager the `admin` password lives in the dashboard keystore and
# cannot be read in clear, while the indexer administrator certificate is available (all-in-one:
# /etc/wazuh-indexer/certs; official Docker deployment: config/wazuh_indexer_ssl_certs/).
#   OS_PASS               password of OS_USER (default admin)
#   OS_CERT + OS_KEY      client certificate. Takes priority if present.
OS_CERT = os.environ.get("OS_CERT")
OS_KEY = os.environ.get("OS_KEY")

user = os.environ.get("OS_USER", "admin")
pw = os.environ.get("OS_PASS")

if not pw and not OS_CERT:
    sys.exit(
        "ERROR: export OS_PASS with the OpenSearch password, or\n"
        "       OS_CERT and OS_KEY with the administrator certificate, e.g.\n"
        "       export OS_CERT=/etc/wazuh-indexer/certs/admin.pem\n"
        "       export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem"
    )

if OS_CERT and not OS_KEY:
    sys.exit("ERROR: OS_CERT without OS_KEY: both are needed.")

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
    # With a certificate NO authorization header is sent: TLS identifies the client, and sending both
    # makes OpenSearch keep the basic one and reject for an empty password.
    if not OS_CERT:
        r.add_header(
            "Authorization",
            "Basic " + base64.b64encode((user + ":" + pw).encode()).decode(),
        )
    r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, context=ctx) as resp:
        return json.loads(resp.read().decode())


# --- the block to seed
try:
    with open(block_file, encoding="utf-8") as f:
        block = json.load(f)
except FileNotFoundError:
    sys.exit("ERROR: cannot find {}. Run from the config/ directory of the plugin repo.".format(block_file))

if block.get("controlId") != control_id:
    sys.exit("ERROR: {} declares controlId={!r}, not {!r}. Check the file.".format(
        block_file, block.get("controlId"), control_id))

parameters = block.get("parameters", [])
required = [x.get("id") for x in parameters if x.get("required")]
print("Block: {} with {} parameters ({} required: {})".format(
    block_file, len(parameters), len(required), ", ".join(required) or "none"))

# --- current document
try:
    doc = req("GET", "/{}/_doc/{}".format(INDEX, DOC))
except urllib.error.HTTPError as e:
    if e.code == 404:
        sys.exit("ERROR: document '{}' does not exist in index '{}'.\n"
                 "The plugin creates it with the first save from its Configuración screen;\n"
                 "save the configuration once and run again.".format(DOC, INDEX))
    raise

source = doc["_source"]
previous_source = json.loads(json.dumps(source))
cfg = source["configuration"]
controls = cfg.get("controls", [])
present = [c["controlId"] for c in controls]
print("Controls already configured:", present or "(none)")

was_there = control_id in present
previous = next((c for c in controls if c["controlId"] == control_id), None)


def has_value(v):
    # "" and [] are empty fields, not configured values: such a parameter still counts as not
    # configured and its evidence stays NO_EVALUABLE.
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ""
    if isinstance(v, (list, dict)):
        return len(v) > 0
    return True


# --- merge with what was there
kept = []
new = []
withdrawn = []

# Per-agent values of parameters the block no longer declares are orphaned (nobody reads them).
# Warned on merge and on replace.
block_ids = {x.get("id") for x in parameters}
orphans = sorted(
    "{} on agent {}".format(pid, agent)
    for agent, profile in (cfg.get("agents") or {}).items()
    for pid in ((((profile or {}).get("controls") or {}).get(control_id) or {}).get("parameters") or {})
    if pid not in block_ids
) if previous else []
# Values of custom templates for withdrawn parameters are orphaned the same way.
orphans += sorted(
    "{} in template {}".format(pid, template.get("id"))
    for template in (cfg.get("templates") or [])
    if isinstance(template, dict) and template.get("controlId") == control_id
    for pid in (template.get("values") or {})
    if pid not in block_ids
) if previous else []

if previous and not args.sustituir:
    previous_values = {
        x.get("id"): x.get("value")
        for x in previous.get("parameters", [])
        if has_value(x.get("value"))
    }
    previous_ids = {x.get("id") for x in previous.get("parameters", [])}
    previous_modes = {
        x.get("id"): x.get("matchMode") for x in previous.get("parameters", [])
        if x.get("matchMode") in ("exact", "regex")
    }

    for parameter in parameters:
        pid = parameter.get("id")
        if pid in previous_values:
            parameter["value"] = previous_values[pid]
            # A pattern without its mode would be read as a literal name.
            if pid in previous_modes:
                parameter["matchMode"] = previous_modes[pid]
            kept.append(pid)
        elif pid not in previous_ids:
            new.append(pid)

    new_ids = {x.get("id") for x in parameters}
    withdrawn = [
        "{} (with value)".format(x.get("id")) if has_value(x.get("value")) else x.get("id")
        for x in previous.get("parameters", [])
        if x.get("id") not in new_ids
    ]

    print("Merge with what is already configured:")
    print("  keeps its value: {}".format(", ".join(kept) or "none"))
    print("  new parameters: {}".format(", ".join(new) or "none"))
    if withdrawn:
        print("  NO LONGER IN THE BLOCK and lost: {}".format(", ".join(withdrawn)))
    if orphans:
        print("  WARNING: values of withdrawn parameters, now orphaned: {}".format(", ".join(orphans)))
elif previous and args.sustituir:
    with_value = [
        x.get("id") for x in previous.get("parameters", []) if has_value(x.get("value"))
    ]
    print("--sustituir: the values already configured are DISCARDED.")
    print("  lost: {}".format(", ".join(with_value) or "none (no values were set)"))
    print("  per-agent settings (configuration.agents) and custom templates (configuration.templates) are kept")
    if orphans:
        print("  WARNING: values of withdrawn parameters, now orphaned: {}".format(", ".join(orphans)))

# --- replace the control's block without touching the others
controls = [c for c in controls if c["controlId"] != control_id]
controls.append(block)
cfg["controls"] = controls

# --- organisation data: kept; the control's empty parameters that read an item take its value
shape_errors = organization.validate_shape(cfg.get("organizationData"))
if shape_errors:
    print("WARNING: configuration.organizationData is not valid and the plugin will not load the environment: {}".format(
        " ".join(shape_errors)))
items = organization.load_items()
if cfg.get("organizationData") and items:
    print("Organisation data (configuration.organizationData): kept, {} item(s) with value.".format(
        len((cfg["organizationData"].get("values") or {}) if isinstance(cfg["organizationData"], dict) else {})))
for item in items or []:
    if not any(view["controlId"] == control_id for view in item.get("views", [])) or shape_errors:
        continue
    stored = organization.stored_value(cfg, item["id"])
    if stored is None:
        continue
    single = {"controls": [block]}
    for _, pid, _, value in organization.write_through(single, item, stored, only_empty=True):
        print("  {} takes «{}» from Datos de la organización: {}".format(pid, item["label"], json.dumps(value, ensure_ascii=False)[:70]))

now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
cfg["updatedAt"] = now
# Stored in the document (shown in the history): Spanish, like the rest of the user-facing text.
if not was_there:
    reason = "Alta"
elif args.sustituir:
    reason = "Sustitución (valores descartados)"
else:
    reason = "Actualización (valores conservados)"
cfg["changeReason"] = "{} del control {} en la configuración activa.".format(reason, control_id)
source["updatedAt"] = now

print("After the operation:", sorted(c["controlId"] for c in cfg["controls"]))
if cfg.get("agents"):
    print("Per-agent settings (configuration.agents): those of {} agent(s) are kept.".format(len(cfg["agents"])))
if cfg.get("templates"):
    print("Custom templates (configuration.templates): all {} are kept.".format(len(cfg["templates"])))

if not args.apply:
    print("\n== DRY-RUN ==  nothing written. Add --apply if the plan is correct.")
    sys.exit(0)

print("\nPrevious version saved in: {}".format(save_previous_version(req, INDEX, previous_source, "inject-control.py")))
result = req("PUT", "/{}/_doc/{}".format(INDEX, DOC), source)
print("\n== APPLIED ==  result: {} | version: {}".format(result.get("result"), result.get("_version")))
print("The control will appear in the plugin's Configuración screen.")
print("Required parameters without a value will keep degrading their evidence to NO_EVALUABLE,")
print("which is correct: without data no compliance is claimed.")
