#!/usr/bin/env python3
"""Declares the values of a control's parameters without going through the screen.

`inject-control.py` seeds a control's definition but leaves its values empty. This tool takes a file
with values, MERGES them with what exists and writes. What is not named is not touched. The merge is
per PARAMETER: the value of each named parameter is REPLACED whole (a list or table is not extended;
to add a row, pass the complete list).

    export OS_CERT=/etc/wazuh-indexer/certs/admin.pem
    export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem
    python3 set-parameters.py policy.json            # plan
    python3 set-parameters.py policy.json --apply    # writes

The file is JSON:

    {
      "op.acc.1": {
        "P-03": ["www-data", "sshd"],
        "P-07": ["usuario1 | servidor1 | Administrador de sistema"]
      }
    }

A list is stored as a list (what a `list` or `table` parameter expects, one row per item); a string as
a string; a number as a number. EMPTY = NO VALUE: `null`, `""` and `[]` REMOVE the value (the `value`
key disappears, never `null`), like emptying a field on the screen.

AGENT VALUES (plugin 1.2.0). The `agents` key declares a machine's own values by Wazuh id; they go to
`configuration.agents` and do not touch the organization value:

    {
      "op.acc.1": { "P-04": ["admin", "test"] },
      "agents": {
        "001": {
          "op.acc.1": { "P-07": ["usuario1 | servidor1 | Administrador de sistema"] },
          "op.acc.5": { "P-02": null }
        }
      }
    }

Only per-system and per-platform parameters accept a per-agent value (classification in
`common/ens/configuration/agents/parameter-classes.ts`); an organization one is rejected. `null` (or
empty) REMOVES the agent's own value, which goes back to its template or the common value; removing is
always accepted, even for a value that does not apply. The key is the agent id (`7` becomes `007`); a
name is rejected, with the id if the document already knows that name.

AGENT TEMPLATE IN A CONTROL (plugin 1.3.0). Inside an agent's control, the `template` key assigns that
control's template; without it the assignment is untouched:

    {
      "agents": {
        "001": {
          "op.acc.1": { "template": "linux-ubuntu", "P-07": ["usuario1 | servidor1 | Administrador de sistema"] },
          "op.acc.2": { "template": "custom-servidores-web" },
          "op.acc.3": { "template": "none" },
          "op.acc.4": { "template": null }
        }
      }
    }

The value is the id of a built-in template of the control (`linux-ubuntu`, `windows-server`,
`manager-wazuh`, whichever the control has) or of
a custom template in `configuration.templates` of the same control; `none` leaves the agent without
template (common values) and `null` removes the assignment (the built-in of its type applies again).
Applied value order: own setting, assigned template, built-in of its type, control common value. A
document without `configuration.templates` and with nothing to convert is marked 1.3.0 on write; one
with templates or types stored by 1.2.0 does not accept `template` until a change is saved from
Configuración (the plugin converts it).

REGULAR EXPRESSION (plugin 1.3.0). In the parameters the engine compares as names (op.acc.1 P-03
and P-04), a value can be an RE2 regular expression, without
slashes, compared with the whole value. It is declared with a `value` + `matchMode` object, in the
organization or in an agent:

    {
      "op.acc.1": { "P-04": { "value": "^(admin|guest)$", "matchMode": "regex" } },
      "agents": {
        "001": { "op.acc.1": { "P-03": { "value": "^svc_.*$", "matchMode": "regex" } } }
      }
    }

A value without object is exact text and removes any mode; emptying the value also removes its mode.
Mode, parameter, length (512 characters at most) and no leading or trailing spaces are checked; RE2
syntax is checked by `npx --yes tsx config/validate-configuration.ts` on the written document.

ORGANISATION DATA (plugin 1.4.0). The data several controls ask (who may administer, pre-production
environment, CCN-authorised algorithms, privileged groups, the Statement of Applicability…) is set once
in `configuration.organizationData` and written into every parameter that reads it. The `organization`
key sets an item by its id (list in Configuración > General > «Datos de la organización»):

    {
      "organization": {
        "grupos_privilegiados": ["sudo", "wheel"],
        "entorno_preproduccion": ["srv-app01 | pre-app01 | informe 2026-05"],
        "retencion": null
      }
    }

`null` (or empty) removes the item and its value in every parameter that reads it. The P-xx form keeps
working: a parameter that is organisation data (op.acc.1 P-11, op.acc.2 P-12…) writes to its item, and
the plan lists every other parameter that changes with it. A parameter that reads only part of an item
(op.acc.4 P-02 is the «autorizaciones» rows of «Personal autorizado») changes only that part. If the item
has no value yet and the parameter reads only part of it, only the parameter is written: the plugin moves
it to the item on load, or shows the conflict. Per-agent values work as before.

BEFORE WRITING, the version being replaced is saved in the `wazuh-ens-configuration` history, like the
plugin does, or, if the index does not accept it, in a local file `active-antes-<date>.json`. The tool
says where.

DRY-RUN BY DEFAULT. Writing requires `--apply`: this overwrites owner decisions.

IT DOES NOT INVENT PARAMETERS. If the file names a parameter the control does not declare, it stops
and says so.
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
from power_ens_history import save_previous_version  # noqa: E402
import power_ens_organization as organization  # noqa: E402

ES = os.environ.get("ENS_OS_URL", "https://localhost:9200")
INDEX = "wazuh-ens-configuration"
DOC = "active"

p = argparse.ArgumentParser(description="Declares ENS control parameter values.")
p.add_argument("fichero", help="JSON with {control: {parameter: value}}")
p.add_argument("--apply", action="store_true", help="writes; without it only the plan is shown")
args = p.parse_args()

OS_CERT = os.environ.get("OS_CERT")
OS_KEY = os.environ.get("OS_KEY")
user = os.environ.get("OS_USER", "admin")
pw = os.environ.get("OS_PASS")

if not pw and not OS_CERT:
    sys.exit(
        "ERROR: export OS_PASS, or OS_CERT and OS_KEY with the indexer\n"
        "       administrator certificate:\n"
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
    wanted = json.load(f)

per_agent = wanted.pop("agents", None) or {}
per_item = wanted.pop("organization", None) or {}

try:
    read = req("GET", "/%s/_doc/%s" % (INDEX, DOC))
    current = read["_source"]
except urllib.error.HTTPError as e:
    sys.exit("ERROR: could not read the active configuration (%s). Have the controls been seeded with inject-control.py?" % e)

previous = json.loads(json.dumps(current))
config = current.get("configuration", current)
by_id = {c["controlId"]: c for c in config["controls"]}


def agent_id(value):
    text = str(value).strip()
    return text.zfill(3) if text.isdigit() else text


def classes():
    """Parameter classification, from the engine catalog copy in `common/ens/catalog/engine/`.
    None if absent (script outside the repo)."""
    engine = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "common", "ens", "catalog", "engine")
    if not os.path.isdir(engine):
        return None
    found = {}
    for name in sorted(os.listdir(engine)):
        with open(os.path.join(engine, name), encoding="utf-8") as f:
            entry = json.load(f)
        found[entry["control"]] = {pid: p["class"] for pid, p in entry["parameters"].items()}
    return found


# Built-in template ids per control; tests/control-templates-model.test.ts checks it against the plugin.
BUILTIN_TEMPLATES = {
    "op.acc.1": ["linux-ubuntu", "windows-server", "manager-wazuh"],
    "op.acc.2": ["linux-ubuntu", "windows-server", "manager-wazuh"],
    "op.acc.3": ["linux-ubuntu", "windows-server", "manager-wazuh"],
    "op.acc.4": ["linux-ubuntu", "windows-server", "manager-wazuh"],
    "op.acc.5": ["linux-ubuntu", "manager-wazuh"],
    "op.acc.6": ["linux-ubuntu", "manager-wazuh"],
    "op.exp.2": ["linux-ubuntu", "manager-wazuh"],
    "op.exp.3": ["linux-ubuntu", "manager-wazuh"],
    "op.exp.4": ["linux-ubuntu", "manager-wazuh"],
}
NO_TEMPLATE = "none"
TEMPLATE_KEY = "template"

# Parameters with the «Expresión regular» mode; tests/parameter-match-mode-levels.test.ts checks it against the
# plugin.
PATTERN_PARAMETERS = {
    "op.acc.1": ["P-03", "P-04"]
}
MAX_PATTERN_LENGTH = 512
ENTRY_KEYS = {"value", "matchMode"}


def needs_conversion(agents):
    # Profiles the plugin's 1.2.0 conversion would change: their resolution needs it before any 1.3.0 key.
    return any(isinstance(p, dict) and (isinstance(p.get("templates"), list) or p.get("detectedType") or p.get("typeOverride"))
               for p in (agents or {}).values())


def is_empty(v):
    return v is None or (isinstance(v, str) and not v.strip()) or (isinstance(v, list) and not [x for x in v if str(x).strip()])


def valid_value(v):
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
        return None, None, 'has a value that is not text, number, boolean or list of texts (with mode: {"value": …, "matchMode": "exact" | "regex"})'
    mode = entry.get("matchMode", "exact")
    if mode not in ("exact", "regex"):
        return None, None, 'matchMode is "exact" or "regex", not %s' % json.dumps(mode, ensure_ascii=False)
    return entry["value"], mode, None


def entry_problem(control_id, pid, entry):
    value, mode, problem = unwrap(entry)
    if problem:
        return problem
    if is_empty(value):
        return None
    if not valid_value(value):
        return "has a value that is not text, number, boolean or list of texts"
    if mode == "regex":
        if pid not in PATTERN_PARAMETERS.get(control_id, []):
            return "does not accept a regular expression (accepted by: %s)" % "; ".join(
                "%s %s" % (c, ", ".join(ps)) for c, ps in PATTERN_PARAMETERS.items())
        if not isinstance(value, str):
            return "in regex mode the value is a regular expression (text)"
        if value != value.strip():
            return "the regular expression cannot start or end with spaces"
        if len(value) > MAX_PATTERN_LENGTH:
            return "the regular expression accepts up to %d characters" % MAX_PATTERN_LENGTH
    return None


def shown(value, mode):
    return ("regex " if mode == "regex" else "") + short(value)


agents_doc = config.get("agents") or {}
legacy_document = not isinstance(config.get("templates"), list)
mark_130 = legacy_document and not needs_conversion(agents_doc)


def suggestion(name):
    """The id of a profile that already knows that name (its name or an alias)."""
    searched = str(name).strip().lower()
    for aid, profile in agents_doc.items():
        names = [str((profile or {}).get("name") or "")] + list((profile or {}).get("aliases") or [])
        if searched in [n.strip().lower() for n in names if n]:
            return aid
    return None


# --- validation BEFORE touching anything ------------------------------------
errors = []

for control_id, values in wanted.items():
    if control_id not in by_id:
        errors.append("control %s is not seeded: run inject-control.py first" % control_id)
        continue
    declared = {x["id"] for x in by_id[control_id]["parameters"]}
    for pid, v in values.items():
        if pid not in declared:
            errors.append("%s does not declare parameter %s (declares: %s)"
                          % (control_id, pid, ", ".join(sorted(declared))))
        elif entry_problem(control_id, pid, v):
            errors.append("%s %s %s" % (control_id, pid, entry_problem(control_id, pid, v)))

classification = classes() if per_agent else {}
if per_agent and classification is None:
    errors.append("cannot find common/ens/configuration/agents/parameter-classes.ts: "
                  "per-agent values are declared from the config/ directory of the plugin repo")
    classification = {}

for agent, controls in per_agent.items():
    aid = agent_id(agent)
    if not aid.isdigit():
        known = suggestion(agent)
        errors.append('"%s" is not an agent id; use the id%s' % (
            agent, " (%s)" % known if known else " numeric Wazuh agent id, e.g. 001"))
        continue
    for control_id, values in (controls or {}).items():
        if TEMPLATE_KEY in (values or {}):
            template_id = values[TEMPLATE_KEY]
            custom_ids = [t.get("id") for t in (config.get("templates") or []) if isinstance(t, dict) and t.get("controlId") == control_id]
            if legacy_document and not mark_130:
                errors.append("agent %s: the document has 1.2.0 templates or types that the plugin converts on save: "
                              "save any change from Configuración (if the notice appears, «Guardar la conversión») "
                              "and run again" % aid)
            elif is_empty(template_id):
                pass
            elif not isinstance(template_id, str):
                errors.append("agent %s: %s template must be a template id, «none» or null" % (aid, control_id))
            elif control_id not in by_id:
                errors.append("agent %s: control %s is not seeded" % (aid, control_id))
            elif template_id != NO_TEMPLATE and template_id not in BUILTIN_TEMPLATES.get(control_id, []) + custom_ids:
                errors.append("agent %s: %s has no template %s (built-in: %s; custom: %s)" % (
                    aid, control_id, template_id, ", ".join(BUILTIN_TEMPLATES.get(control_id, [])) or "none",
                    ", ".join(custom_ids) or "none"))
        for pid, v in (values or {}).items():
            if pid == TEMPLATE_KEY:
                continue
            # Removing is always accepted, even a value that does not apply.
            if not unwrap(v)[2] and is_empty(unwrap(v)[0]):
                continue
            parameter_class = classification.get(control_id, {}).get(pid)
            if control_id not in by_id:
                errors.append("agent %s: control %s is not seeded" % (aid, control_id))
            elif pid not in {x["id"] for x in by_id[control_id]["parameters"]}:
                errors.append("agent %s: %s does not declare parameter %s" % (aid, control_id, pid))
            elif parameter_class not in ("system", "platform"):
                errors.append("agent %s: %s %s is an organization parameter (applies to all machines)"
                              % (aid, control_id, pid))
            elif entry_problem(control_id, pid, v):
                errors.append("agent %s: %s %s %s" % (aid, control_id, pid, entry_problem(control_id, pid, v)))

# --- organisation data: items set by id and P-xx that are a view of an item
items = organization.load_items()
# item id -> (new value, what asked for it)
item_changes = {}
# (control, parameter) written as a parameter only: the item has no value and the view is partial
partial_only = set()

if per_item and items is None:
    errors.append("cannot find common/ens/configuration/organization/organization-data-items.ts: "
                  "organisation data is declared from the config/ directory of the plugin repo")
elif items is None and config.get("organizationData") is not None and wanted:
    print("WARNING: cannot read the organisation data items (run from the config/ directory of the full plugin repo): "
          "a parameter that is organisation data is written as a parameter only, and the plugin shows it as a conflict.")
errors += organization.validate_shape(config)


def ask_item(item_id, value, source):
    if item_id in item_changes:
        errors.append("organisation data %s is set twice (%s and %s): set it once"
                      % (item_id, item_changes[item_id][1], source))
    else:
        item_changes[item_id] = (value, source)


for item_id, entry in (per_item or {}).items():
    item = organization.get_item(items, item_id)
    editable = [i["id"] for i in items or [] if i.get("views")]
    if item is None or not item.get("views"):
        errors.append("organisation data has no item %s (items: %s)" % (item_id, ", ".join(editable)))
    elif isinstance(entry, dict):
        errors.append("organisation data %s takes a plain value (no matchMode)" % item_id)
    elif not organization.is_empty(entry) and not valid_value(entry):
        errors.append("organisation data %s has a value that is not text, number, boolean or list of texts" % item_id)
    else:
        ask_item(item_id, None if organization.is_empty(entry) else entry, "organization." + item_id)

for control_id, values in wanted.items():
    if control_id not in by_id or items is None:
        continue
    for pid, entry in values.items():
        found = organization.find_link(items, control_id, pid)
        if not found or entry_problem(control_id, pid, entry):
            continue
        item, view = found
        new, _, _ = unwrap(entry)
        new = None if is_empty(new) else new
        stored = organization.stored_value(config, item["id"])
        parameter = next(x for x in by_id[control_id]["parameters"] if x["id"] == pid)
        if stored is None and not organization.is_identity(view):
            partial_only.add((control_id, pid))
            continue
        result = organization.assign_view(item, stored, view, parameter.get("type"), new)
        seen = organization.view_value(item, view, parameter.get("type"), result)
        if not organization.same_value(parameter.get("type"), seen, new) or organization.is_empty(seen) != organization.is_empty(new):
            errors.append("%s %s is part of organisation data %s and its value does not fit there "
                          "(a «|» inside an entry, or more cells than columns)" % (control_id, pid, item["id"]))
        else:
            ask_item(item["id"], result, "%s %s" % (control_id, pid))

for item_id, (value, source) in item_changes.items():
    item = organization.get_item(items, item_id)
    errors += ["%s: %s" % (source, problem) for problem in organization.single_value_problems(config, item, value)]
    # As the screen: the item is written into every parameter that reads it, so each one must accept it.
    for view in item.get("views", []):
        target = organization.find_parameter(config, view["controlId"], view["parameterId"])
        problem = target is not None and organization.value_problem(target, organization.view_value(item, view, target.get("type"), value))
        if problem:
            errors.append("%s: %s %s does not accept the value of «%s»: %s" % (source, view["controlId"], view["parameterId"], item["label"], problem))

if errors:
    for e in errors:
        print("ERROR: " + e, file=sys.stderr)
    sys.exit(1)


def short(v):
    t = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return (t[:70] + "…") if len(t) > 70 else t


def stored_mode(mode):
    return "regex" if mode == "regex" else "exact"


# --- the plan ---------------------------------------------------------------
changes = 0

for control_id, values in sorted(wanted.items()):
    print("── %s" % control_id)
    for par in by_id[control_id]["parameters"]:
        if par["id"] not in values:
            continue
        found = organization.find_link(items, control_id, par["id"]) if items else None
        if found and (control_id, par["id"]) not in partial_only:
            print("   %-6s is part of «%s» (Datos de la organización): see below" % (par["id"], found[0]["label"]))
            continue
        if found:
            print("   %-6s part of «%s», which has no value yet: only the parameter is written; the plugin "
                  "moves it on load or shows the conflict" % (par["id"], found[0]["label"]))
        new, new_mode, _ = unwrap(values[par["id"]])
        old = par.get("value")
        old_mode = stored_mode(par.get("matchMode"))
        if is_empty(new):
            if "value" not in par:
                print("   %-6s no value: nothing to remove" % par["id"])
                continue
            del par["value"]
            par.pop("matchMode", None)
            print("   %-6s %s  ->  (no value)" % (par["id"], shown(old, old_mode)))
            changes += 1
            continue
        if old == new and old_mode == new_mode:
            print("   %-6s unchanged" % par["id"])
            continue
        print("   %-6s %s  ->  %s" % (par["id"], shown(old, old_mode) if old not in (None, "") else "(empty)", shown(new, new_mode)))
        par["value"] = new
        if new_mode == "regex":
            par["matchMode"] = "regex"
        else:
            par.pop("matchMode", None)
        changes += 1

for item_id, (new, source) in sorted(item_changes.items()):
    item = organization.get_item(items, item_id)
    old = organization.stored_value(config, item_id)
    print("── organisation data «%s» (%s), from %s" % (item["label"], item_id, source))
    if json.dumps(old) == json.dumps(new):
        print("   unchanged")
    else:
        print("   %s  ->  %s" % (short(old) if old is not None else "(no value)", short(new) if new is not None else "(no value)"))
        organization.set_stored_value(config, item_id, new)
        changes += 1
    for control_id, pid, before, after in organization.write_through(config, item, new):
        print("   %s %-6s %s  ->  %s" % (control_id, pid, short(before) if before not in (None, "", []) else "(no value)",
                                       short(after) if after is not None else "(no value)"))
        changes += 1

for agent, controls in sorted(per_agent.items()):
    aid = agent_id(agent)
    print("── agent %s" % aid)
    profile = agents_doc.get(aid) or {}
    own = profile.get("controls") or {}
    for control_id, values in sorted((controls or {}).items()):
        entry_doc = dict(own.get(control_id) or {})
        parameters = dict(entry_doc.get("parameters") or {})
        modes = dict(entry_doc.get("matchModes") or {})
        if TEMPLATE_KEY in (values or {}):
            new_id = None if is_empty(values[TEMPLATE_KEY]) else values[TEMPLATE_KEY]
            old_id = entry_doc.get("templateId")
            if new_id == old_id:
                print("   %s template unchanged" % control_id)
            else:
                print("   %s template %s  ->  %s" % (control_id, old_id or "(the built-in of its type)", new_id or "(the built-in of its type)"))
                if new_id:
                    entry_doc["templateId"] = new_id
                else:
                    entry_doc.pop("templateId", None)
                changes += 1
        for pid, entry in sorted((values or {}).items()):
            if pid == TEMPLATE_KEY:
                continue
            new, new_mode, _ = unwrap(entry)
            old = parameters.get(pid)
            old_mode = stored_mode(modes.get(pid))
            if is_empty(new):
                if pid not in parameters and pid not in modes:
                    print("   %s %-6s no own value: nothing to remove" % (control_id, pid))
                    continue
                parameters.pop(pid, None)
                modes.pop(pid, None)
                print("   %s %-6s %s  ->  (inherits)" % (control_id, pid, shown(old, old_mode)))
            elif old == new and old_mode == new_mode:
                print("   %s %-6s unchanged" % (control_id, pid))
                continue
            else:
                parameters[pid] = new
                if new_mode == "regex":
                    modes[pid] = "regex"
                else:
                    modes.pop(pid, None)
                print("   %s %-6s %s  ->  %s" % (control_id, pid, shown(old, old_mode) if old is not None else "(inherits)", shown(new, new_mode)))
            changes += 1
        # Other keys stored next to `parameters` (`templateId`, or a later version's) are kept.
        if parameters:
            entry_doc["parameters"] = parameters
        else:
            entry_doc.pop("parameters", None)
        if modes:
            entry_doc["matchModes"] = modes
        else:
            entry_doc.pop("matchModes", None)
        if entry_doc:
            own[control_id] = entry_doc
        else:
            own.pop(control_id, None)
    if own:
        profile["controls"] = own
    else:
        profile.pop("controls", None)
    agents_doc[aid] = profile
if per_agent:
    config["agents"] = agents_doc

if not changes:
    print("\nNothing to change.")
    sys.exit(0)

if mark_130:
    config["templates"] = []
    print("configuration.templates: added empty (the document becomes 1.3.0; there was nothing to convert)")

if not args.apply:
    print("\n%d change(s). DRY-RUN: nothing written. Add --apply." % changes)
    sys.exit(0)

# The version being replaced, before writing (the document as read).
print("Previous version saved in: %s" % save_previous_version(req, INDEX, previous, "set-parameters.py"))

config["updatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
current["configuration"] = config
# Only over the version read: a save from the screen meanwhile is not overwritten.
try:
    req("PUT", organization.guarded_path("/%s/_doc/%s" % (INDEX, DOC), read), current)
except urllib.error.HTTPError as e:
    if e.code == 409:
        sys.exit("ERROR: " + organization.CHANGED_WHILE_APPLYING)
    raise
print("\n%d change(s) written to %s/%s." % (changes, INDEX, DOC))
