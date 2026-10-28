#!/usr/bin/env python3
"""Tests of set-parameters.py against a fake OpenSearch.

Covered:
  - organization values are declared as always and the per-system layer (`configuration.agents`) survives;
  - the `agents` section declares a machine's own values, `null` removes them, and the id is normalised;
  - it does not invent: it rejects an unseeded control, a nonexistent parameter, an organization
    parameter per agent and an impossible value shape, writing nothing;
  - dry-run by default;
  - the «Expresión regular» mode (`matchMode`) in the organization and in an agent;
  - organisation data (1.4.0): items by id, the P-xx form writing to its item, partial views.

    python3 test_set_parameters.py

No dependencies: the stdlib http.server acts as the index.
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "set-parameters.py")

state = {"doc": None, "version": 0}

CONTROL = {
    "controlId": "op.acc.1",
    "parameters": [
        {"id": "P-01", "value": "Local"},
        {"id": "P-04", "value": ["admin"]},
        {"id": "P-07"},
        {"id": "P-11", "value": ["sudo"]},
        {"id": "P-03"},
    ],
}


class Index(BaseHTTPRequestHandler):
    def _respond(self, body, code=200):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._respond({"_source": state["doc"], "_seq_no": state["version"], "_primary_term": 1})

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length).decode())
        # The previous version the tools save before writing.
        if "/_doc/history-" in self.path:
            if state.get("history_fails"):
                self._respond({"error": "no"}, 403)
                return
            state.setdefault("history", []).append({"order": state["version"], "path": self.path, "doc": body})
            self._respond({"result": "created"})
            return
        state["last_put_path"] = self.path
        if state.get("conflict") and "if_seq_no=" in self.path:
            self._respond({"error": {"type": "version_conflict_engine_exception"}}, 409)
            return
        state["doc"] = body
        state["version"] += 1
        self._respond({"result": "updated", "_version": state["version"]})

    def log_message(self, *_):
        pass


failures = []


def check(name, condition, detail=""):
    print("{}  {}{}".format("OK    " if condition else "FAIL  ", name,
                            "" if condition else "  -> " + detail))
    if not condition:
        failures.append(name)


def reset(agents=None):
    cfg = {"controls": [json.loads(json.dumps(CONTROL))]}
    if agents is not None:
        cfg["agents"] = json.loads(json.dumps(agents))
    state["doc"] = {"configuration": cfg}


def run_script(url, tmp, content, *extra_args):
    path = os.path.join(tmp, "valores.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(content, f)
    env = dict(os.environ, ENS_OS_URL=url, OS_USER="admin", OS_PASS="x")
    return subprocess.run([sys.executable, SCRIPT, path, *extra_args], capture_output=True, text=True, env=env)


def main():
    server = HTTPServer(("127.0.0.1", 0), Index)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:{}".format(server.server_port)
    agents_doc = {"028": {"templates": ["zimbra-ldap"], "controls": {"op.acc.1": {"parameters": {"P-07": ["a | b | c"]}}}}}

    with tempfile.TemporaryDirectory() as tmp:
        reset(agents_doc)
        r = run_script(url, tmp, {"op.acc.1": {"P-04": ["admin", "test"]}}, "--apply")
        cfg = state["doc"]["configuration"]
        check("organization · declared as always", r.returncode == 0 and cfg["controls"][0]["parameters"][1]["value"] == ["admin", "test"], r.stderr)
        check("organization · configuration.agents survives", cfg.get("agents") == agents_doc, str(cfg.get("agents")))

        reset(agents_doc)
        version = state["version"]
        r = run_script(url, tmp, {"agents": {"28": {"op.acc.1": {"P-11": ["sudo", "wheel"]}}}})
        check("dry-run · writes nothing", state["version"] == version and "DRY-RUN" in r.stdout, r.stdout + r.stderr)

        r = run_script(url, tmp, {"agents": {"28": {"op.acc.1": {"P-11": ["sudo", "wheel"]}}, "024": {"op.acc.1": {"P-07": ["x | y | z"]}}}}, "--apply")
        cfg = state["doc"]["configuration"]
        check("agent · own value, with the id normalised (28 → 028)",
                  r.returncode == 0 and cfg["agents"]["028"]["controls"]["op.acc.1"]["parameters"]["P-11"] == ["sudo", "wheel"], r.stdout + r.stderr)
        check("agent · keeps what it already had (P-07, templates)",
                  cfg["agents"]["028"]["controls"]["op.acc.1"]["parameters"]["P-07"] == ["a | b | c"] and cfg["agents"]["028"]["templates"] == ["zimbra-ldap"], str(cfg["agents"]["028"]))
        check("agent · creates the profile of a new agent", cfg["agents"]["024"]["controls"]["op.acc.1"]["parameters"]["P-07"] == ["x | y | z"], str(cfg["agents"].get("024")))
        check("agent · the organization value does not change", cfg["controls"][0]["parameters"][3]["value"] == ["sudo"], str(cfg["controls"][0]))

        r = run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"P-07": None, "P-11": None}}}}, "--apply")
        cfg = state["doc"]["configuration"]
        check("agent · null removes the own value (without writing null)",
                  r.returncode == 0 and "controls" not in cfg["agents"]["028"] and "null" not in json.dumps(cfg["agents"]), json.dumps(cfg["agents"]))

        # --- empty = no value, also in the organization (never null)
        reset(agents_doc)
        r = run_script(url, tmp, {"op.acc.1": {"P-04": [], "P-01": None}}, "--apply")
        params = {x["id"]: x for x in state["doc"]["configuration"]["controls"][0]["parameters"]}
        check("organization · [] and null remove the value key",
                  r.returncode == 0 and "value" not in params["P-04"] and "value" not in params["P-01"], json.dumps(params))

        # --- removing is always accepted: an orphan value too
        reset({"028": {"controls": {"op.acc.1": {"parameters": {"P-99": "x", "P-04": ["y"]}},
                                       "op.exp.1": {"parameters": {"P-01": ["a | b | c | d"]}}}}})
        r = run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"P-99": None, "P-04": ""}, "op.exp.1": {"P-01": None}}}}, "--apply")
        check("agent · null removes values that do not apply (nonexistent parameter, organization one, unseeded control)",
                  r.returncode == 0 and "controls" not in state["doc"]["configuration"]["agents"]["028"],
                  r.stdout + r.stderr + json.dumps(state["doc"]["configuration"].get("agents")))

        # --- the key is the id; a name is rejected, with the id if known
        reset({"028": {"name": "dirHost", "aliases": ["dir01.example.com"]}})
        version = state["version"]
        r = run_script(url, tmp, {"agents": {"dirHost": {"op.acc.1": {"P-07": ["x | y | z"]}}}}, "--apply")
        check("key · a name is rejected and the id is proposed",
                  r.returncode == 1 and '"dirHost" is not an agent id; use the id (028)' in r.stderr and state["version"] == version, r.stderr)
        r = run_script(url, tmp, {"agents": {"srv-desconocido": {"op.acc.1": {"P-07": ["x | y | z"]}}}}, "--apply")
        check("key · an unknown name is rejected the same",
                  r.returncode == 1 and '"srv-desconocido" is not an agent id' in r.stderr, r.stderr)

        # --- the previous version goes to the history before writing
        reset(agents_doc)
        state["history"] = []
        r = run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"P-11": ["sudo"]}}}}, "--apply")
        h = state.get("history") or []
        check("history · saves the previous version and says where",
                  len(h) == 1 and h[0]["doc"]["configuration"]["agents"] == agents_doc and "Previous version saved in: history" in r.stdout,
                  r.stdout + str(h)[:200])

        # --- 1.3.0: template assignment per agent and control
        def reset_130(agents=None, templates=None):
            reset(agents)
            state["doc"]["configuration"]["templates"] = json.loads(json.dumps(templates or []))

        custom = [{"id": "custom-web", "controlId": "op.acc.1", "name": "Web", "values": {"P-11": ["wheel"]}}]
        reset_130({"028": {"detectedType": "linux", "controls": {"op.acc.1": {"parameters": {"P-07": ["a | b | c"]}}}}}, custom)
        r = run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"template": "custom-web"}}, "024": {"op.acc.1": {"template": "zimbra-ldap", "P-07": ["x | y | z"]}}}}, "--apply")
        cfg = state["doc"]["configuration"]
        check("template · assigns a custom template and keeps the overrides",
                  r.returncode == 0 and cfg["agents"]["028"]["controls"]["op.acc.1"] == {"parameters": {"P-07": ["a | b | c"]}, "templateId": "custom-web"},
                  r.stdout + r.stderr + json.dumps(cfg.get("agents")))
        check("template · a built-in and an override together, for a new agent",
                  cfg["agents"]["024"]["controls"]["op.acc.1"] == {"templateId": "zimbra-ldap", "parameters": {"P-07": ["x | y | z"]}}, json.dumps(cfg["agents"].get("024")))
        check("template · custom templates survive", cfg.get("templates") == custom)
        r = run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"template": "none"}}, "024": {"op.acc.1": {"template": None, "P-07": None}}}}, "--apply")
        cfg = state["doc"]["configuration"]
        check("template · «none» pins the common values; null removes the assignment",
                  r.returncode == 0 and cfg["agents"]["028"]["controls"]["op.acc.1"]["templateId"] == "none"
                  and "controls" not in cfg["agents"]["024"] and "null" not in json.dumps(cfg["agents"]), json.dumps(cfg["agents"]))
        # A 1.1.0-shaped document (no agents, no templates) has nothing to convert: it is marked 1.3.0 on write.
        lab = os.environ.get("POWER_ENS_LAB_DOC")
        shapes = [("synthetic", {"configuration": {"controls": [json.loads(json.dumps(CONTROL))]}})]
        if lab and os.path.exists(lab):
            with open(lab, encoding="utf-8") as handle:
                shapes.append(("lab copy", {"configuration": json.load(handle)["_source"]["configuration"]}))
        for label, document in shapes:
            state["doc"] = json.loads(json.dumps(document))
            r = run_script(url, tmp, {"agents": {"024": {"op.acc.1": {"template": "linux-ubuntu"}}}}, "--apply")
            cfg = state["doc"]["configuration"]
            check("template · 1.1.0-shaped document (%s): accepted and marked 1.3.0" % label,
                      r.returncode == 0 and cfg.get("templates") == [] and cfg["agents"]["024"]["controls"]["op.acc.1"] == {"templateId": "linux-ubuntu"}
                      and "becomes 1.3.0" in r.stdout, r.stdout + r.stderr)
        state["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONTROL))], "agents": {"028": {"detectedType": "linux"}}}}
        version = state["version"]
        r = run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"template": "linux-ubuntu"}}}}, "--apply")
        check("template · a stored 1.2.0 type needs the plugin's conversion first: refused, saying how",
                  r.returncode == 1 and "save any change from Configuración" in r.stderr and state["version"] == version, r.stderr)
        r = run_script(url, tmp, {"op.acc.1": {"P-04": ["admin", "x"]}}, "--apply")
        check("template · common values on that document still work and it is not marked",
                  r.returncode == 0 and "templates" not in state["doc"]["configuration"], r.stdout + r.stderr)

        for name, content, reason, legacy in [
            ("a built-in of another control", {"agents": {"028": {"op.acc.1": {"template": "pbs-backup"}}}}, "has no template pbs-backup", False),
            ("an unknown id", {"agents": {"028": {"op.acc.1": {"template": "nope"}}}}, "has no template nope", False),
            ("a 1.2.0 document", {"agents": {"028": {"op.acc.1": {"template": "linux-ubuntu"}}}}, "Guardar la conversión", True),
        ]:
            if legacy:
                reset(agents_doc)
            else:
                reset_130({"028": {}}, custom)
            version = state["version"]
            r = run_script(url, tmp, content, "--apply")
            check("template · refuses " + name, r.returncode == 1 and reason in r.stderr and state["version"] == version, r.stderr)

        # --- 1.3.0: «Expresión regular» travels with the value
        reset(agents_doc)
        r = run_script(url, tmp, {"op.acc.1": {"P-04": {"value": "^(admin|guest)$", "matchMode": "regex"}}}, "--apply")
        params = {x["id"]: x for x in state["doc"]["configuration"]["controls"][0]["parameters"]}
        check("regex · common value stored with its mode",
                  r.returncode == 0 and params["P-04"].get("value") == "^(admin|guest)$" and params["P-04"].get("matchMode") == "regex", r.stdout + r.stderr)
        check("regex · the plan says it is a pattern", "->  regex ^(admin|guest)$" in r.stdout, r.stdout)
        r = run_script(url, tmp, {"op.acc.1": {"P-04": ["admin"]}}, "--apply")
        params = {x["id"]: x for x in state["doc"]["configuration"]["controls"][0]["parameters"]}
        check("regex · a plain value is exact and removes the mode",
                  r.returncode == 0 and params["P-04"].get("value") == ["admin"] and "matchMode" not in params["P-04"], json.dumps(params["P-04"]))
        run_script(url, tmp, {"op.acc.1": {"P-04": {"value": "^a$", "matchMode": "regex"}}}, "--apply")
        r = run_script(url, tmp, {"op.acc.1": {"P-04": None}}, "--apply")
        params = {x["id"]: x for x in state["doc"]["configuration"]["controls"][0]["parameters"]}
        check("regex · clearing the value clears its mode", r.returncode == 0 and "value" not in params["P-04"] and "matchMode" not in params["P-04"], json.dumps(params["P-04"]))
        r = run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"P-03": {"value": "^svc_.*$", "matchMode": "regex"}}}}}, "--apply")
        entry = state["doc"]["configuration"]["agents"]["028"]["controls"]["op.acc.1"]
        check("regex · an override stored with its mode, the rest kept",
                  r.returncode == 0 and entry["parameters"]["P-03"] == "^svc_.*$" and entry["matchModes"] == {"P-03": "regex"} and entry["parameters"]["P-07"] == ["a | b | c"], json.dumps(entry))
        r = run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"P-03": {"value": ["svc_a"], "matchMode": "exact"}}}}}, "--apply")
        entry = state["doc"]["configuration"]["agents"]["028"]["controls"]["op.acc.1"]
        check("regex · an exact override removes the mode", r.returncode == 0 and entry["parameters"]["P-03"] == ["svc_a"] and "matchModes" not in entry, json.dumps(entry))
        run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"P-03": {"value": "^svc_.*$", "matchMode": "regex"}}}}}, "--apply")
        r = run_script(url, tmp, {"agents": {"028": {"op.acc.1": {"P-03": None}}}}, "--apply")
        entry = state["doc"]["configuration"]["agents"]["028"]["controls"]["op.acc.1"]
        check("regex · removing the override removes its mode", r.returncode == 0 and "P-03" not in entry["parameters"] and "matchModes" not in entry, json.dumps(entry))
        for name, content, reason in [
            ("a parameter without the mode", {"op.acc.1": {"P-11": {"value": "^s.*$", "matchMode": "regex"}}}, "does not accept a regular expression"),
            ("a list in regex mode", {"agents": {"028": {"op.acc.1": {"P-03": {"value": ["a"], "matchMode": "regex"}}}}}, "in regex mode the value is a regular expression"),
            ("a pattern over 512 characters", {"op.acc.1": {"P-04": {"value": "a" * 513, "matchMode": "regex"}}}, "up to 512 characters"),
            ("an unknown mode", {"op.acc.1": {"P-04": {"value": "^a$", "matchMode": "glob"}}}, 'matchMode is "exact" or "regex"'),
            ("a mode without value", {"op.acc.1": {"P-04": {"matchMode": "regex"}}}, '{"value": …, "matchMode"'),
            ("a pattern with surrounding spaces", {"op.acc.1": {"P-04": {"value": " ^a$", "matchMode": "regex"}}}, "cannot start or end with spaces"),
        ]:
            reset(agents_doc)
            version = state["version"]
            r = run_script(url, tmp, content, "--apply")
            check("regex · refuses " + name, r.returncode == 1 and reason in r.stderr and state["version"] == version, r.stderr)

        # --- 1.4.0: organisation data
        org_doc = {"configuration": {"controls": [
            {"controlId": "op.acc.1", "parameters": [{"id": "P-11", "type": "list", "value": ["sudo"]}, {"id": "P-06", "type": "duration_days", "value": 365}]},
            {"controlId": "op.acc.2", "parameters": [{"id": "P-12", "type": "list", "value": ["sudo"]}]},
            {"controlId": "op.acc.4", "parameters": [{"id": "P-06", "type": "list", "value": ["root"]}]},
            {"controlId": "op.exp.3", "parameters": [{"id": "P-03", "type": "list", "value": ["dioni"]}]},
            {"controlId": "mp.info.6", "parameters": [{"id": "P-07", "type": "list", "value": ["root"]}, {"id": "P-03", "type": "duration_days", "value": 30}]},
            {"controlId": "op.acc.5", "parameters": [{"id": "P-08", "type": "duration_days"}]},
        ]}}

        def org_param(control_id, parameter_id):
            control = next(c for c in state["doc"]["configuration"]["controls"] if c["controlId"] == control_id)
            return next(x for x in control["parameters"] if x["id"] == parameter_id)

        state["doc"] = json.loads(json.dumps(org_doc))
        version = state["version"]
        r = run_script(url, tmp, {"organization": {"grupos_privilegiados": ["sudo", "wheel"]}})
        check("organisation · dry-run lists every parameter that changes and writes nothing",
              state["version"] == version and "op.acc.4 P-06" in r.stdout and "DRY-RUN" in r.stdout, r.stdout + r.stderr)
        r = run_script(url, tmp, {"organization": {"grupos_privilegiados": ["sudo", "wheel"]}}, "--apply")
        cfg = state["doc"]["configuration"]
        check("organisation · an item is stored and written into every parameter that reads it",
              r.returncode == 0 and cfg["organizationData"]["values"]["grupos_privilegiados"] == ["sudo", "wheel"]
              and all(org_param(c, p)["value"] == ["sudo", "wheel"] for c, p in [("op.acc.1", "P-11"), ("op.acc.2", "P-12"), ("op.acc.4", "P-06")]),
              r.stdout + r.stderr + json.dumps(cfg.get("organizationData")))
        r = run_script(url, tmp, {"op.acc.4": {"P-06": ["wheel"]}}, "--apply")
        check("organisation · the P-xx form writes to the item and to the other parameters",
              r.returncode == 0 and state["doc"]["configuration"]["organizationData"]["values"]["grupos_privilegiados"] == ["wheel"]
              and org_param("op.acc.1", "P-11")["value"] == ["wheel"] and "is part of «Grupos con privilegio administrativo»" in r.stdout,
              r.stdout + r.stderr)
        r = run_script(url, tmp, {"organization": {"grupos_privilegiados": None}}, "--apply")
        cfg = state["doc"]["configuration"]
        check("organisation · null removes the item and the value of every parameter (no null written)",
              r.returncode == 0 and "grupos_privilegiados" not in cfg["organizationData"]["values"]
              and "value" not in org_param("op.acc.2", "P-12") and "null" not in json.dumps(cfg), r.stdout + r.stderr)

        state["doc"] = json.loads(json.dumps(org_doc))
        r = run_script(url, tmp, {"op.exp.3": {"P-03": ["ana"]}}, "--apply")
        check("organisation · part of an item without value: only the parameter is written",
              r.returncode == 0 and org_param("op.exp.3", "P-03")["value"] == ["ana"] and "organizationData" not in state["doc"]["configuration"]
              and "has no value yet" in r.stdout, r.stdout + r.stderr)
        run_script(url, tmp, {"organization": {"personal_autorizado": ["root | configuracion, copias", "ana | mantenimiento | srv"]}}, "--apply")
        r = run_script(url, tmp, {"op.exp.3": {"P-03": ["bob"]}}, "--apply")
        cfg = state["doc"]["configuration"]
        check("organisation · part of an item: only its rows change, the other uses stay",
              r.returncode == 0 and cfg["organizationData"]["values"]["personal_autorizado"] == ["root | copias", "ana | mantenimiento | srv", "bob | configuracion"]
              and org_param("op.exp.3", "P-03")["value"] == ["bob"] and org_param("mp.info.6", "P-07")["value"] == ["root"],
              r.stdout + r.stderr + json.dumps(cfg.get("organizationData")))
        run_script(url, tmp, {"organization": {"retencion": ["cuentas | | 400", "copias | | 45"]}}, "--apply")
        check("organisation · a one-value parameter reads its row as a number",
              org_param("op.acc.1", "P-06")["value"] == 400 and org_param("mp.info.6", "P-03")["value"] == 45,
              json.dumps(state["doc"]["configuration"]["controls"]))

        for name, content, reason in [
            ("an unknown item", {"organization": {"nope": ["x"]}}, "has no item nope"),
            ("the informative item", {"organization": {"sistemas_alcance": ["x"]}}, "has no item sistemas_alcance"),
            ("a mode on an item", {"organization": {"grupos_privilegiados": {"value": "^a$", "matchMode": "regex"}}}, "takes a plain value"),
            ("an item set twice", {"organization": {"grupos_privilegiados": ["a"]}, "op.acc.1": {"P-11": ["b"]}}, "is set twice"),
            ("a value that does not fit the item", {"op.exp.3": {"P-03": ["a | b"]}}, "does not fit there"),
            ("two rows for a one-value parameter", {"organization": {"retencion": ["accesos | VPN | 365", "accesos | web | 90"]}},
             "op.acc.5 P-08 lee un solo valor: dejar una sola fila con uso «accesos» en «Plazos de retención»"),
        ]:
            state["doc"] = json.loads(json.dumps(org_doc))
            state["doc"]["configuration"]["organizationData"] = {"values": {"personal_autorizado": ["root | configuracion"]}}
            version = state["version"]
            r = run_script(url, tmp, content, "--apply")
            check("organisation · refuses " + name, r.returncode == 1 and reason in r.stderr and state["version"] == version, r.stdout + r.stderr)
        if lab and os.path.exists(lab):
            with open(lab, encoding="utf-8") as handle:
                state["doc"] = {"configuration": json.load(handle)["_source"]["configuration"]}
            r = run_script(url, tmp, {"op.acc.1": {"P-11": ["sudo", "wheel", "admin"]}}, "--apply")
            check("organisation · lab copy: the P-xx form resolves the groups conflict in every control",
                  r.returncode == 0 and org_param("op.acc.4", "P-06")["value"] == ["sudo", "wheel", "admin"]
                  and state["doc"]["configuration"]["organizationData"]["values"] == {"grupos_privilegiados": ["sudo", "wheel", "admin"]},
                  r.stdout + r.stderr)
        # Only config/ copied somewhere else (Docker with config/ mounted): no items to read.
        alone = os.path.join(tmp, "solo-config")
        os.makedirs(alone, exist_ok=True)
        for name in ("set-parameters.py", "power_ens_history.py", "power_ens_organization.py"):
            with open(os.path.join(HERE, name), encoding="utf-8") as src, open(os.path.join(alone, name), "w", encoding="utf-8") as dst:
                dst.write(src.read())
        state["doc"] = json.loads(json.dumps(org_doc))
        state["doc"]["configuration"]["organizationData"] = {"values": {"grupos_privilegiados": ["sudo"]}}
        values_path = os.path.join(tmp, "solo.json")
        with open(values_path, "w", encoding="utf-8") as f:
            json.dump({"op.acc.4": {"P-06": ["wheel"]}}, f)
        r = subprocess.run([sys.executable, os.path.join(alone, "set-parameters.py"), values_path, "--apply"], capture_output=True, text=True,
                           env=dict(os.environ, ENS_OS_URL=url, OS_USER="admin", OS_PASS="x"))
        check("organisation · without the repo, the parameter alone is written and the tool warns",
              r.returncode == 0 and "WARNING: cannot read the organisation data items" in r.stdout and org_param("op.acc.4", "P-06")["value"] == ["wheel"]
              and org_param("op.acc.1", "P-11")["value"] == ["sudo"], r.stdout + r.stderr)
        with open(values_path, "w", encoding="utf-8") as f:
            json.dump({"organization": {"grupos_privilegiados": ["x"]}}, f)
        r = subprocess.run([sys.executable, os.path.join(alone, "set-parameters.py"), values_path], capture_output=True, text=True,
                           env=dict(os.environ, ENS_OS_URL=url, OS_USER="admin", OS_PASS="x"))
        check("organisation · without the repo, the organization section is refused", r.returncode == 1 and "organization-data-items.ts" in r.stderr, r.stderr)

        state["doc"] = json.loads(json.dumps(org_doc))
        state["doc"]["configuration"]["organizationData"] = {"values": {"retencion": None}}
        r = run_script(url, tmp, {"op.acc.1": {"P-11": ["x"]}}, "--apply")
        check("organisation · refuses to write over an invalid block, saying where",
              r.returncode == 1 and "organizationData.values.retencion" in r.stderr, r.stderr)
        state["doc"] = json.loads(json.dumps(org_doc))
        for control in state["doc"]["configuration"]["controls"]:
            for parameter in control["parameters"]:
                if (control["controlId"], parameter["id"]) == ("op.acc.1", "P-11"):
                    parameter["columns"] = [{"name": "grupo", "label": "Grupo privilegiado", "type": "identifier", "required": True}]
        version = state["version"]
        r = run_script(url, tmp, {"op.acc.4": {"P-06": ["Domain Admins | AD"]}}, "--apply")
        check("organisation · a value another parameter of the item does not accept is refused, saying which",
              r.returncode == 1 and "op.acc.1 P-11 does not accept the value of «Grupos con privilegio administrativo»" in r.stderr and state["version"] == version, r.stderr)

        state["doc"] = json.loads(json.dumps(org_doc))
        version = state["version"]
        r = run_script(url, tmp, {"op.acc.1": {"P-06": 400}}, "--apply")
        check("concurrency · writes only over the version it read", r.returncode == 0 and
              state.get("last_put_path", "").endswith("/_doc/active?if_seq_no=%d&if_primary_term=1" % version), state.get("last_put_path"))
        state["conflict"] = True
        before = json.dumps(state["doc"])
        r = run_script(url, tmp, {"op.acc.1": {"P-06": 500}}, "--apply")
        state["conflict"] = False
        check("concurrency · a save that landed meanwhile stops it, saying to run again",
              r.returncode == 1 and "La configuración ha cambiado mientras se aplicaba; volver a ejecutar." in r.stderr and json.dumps(state["doc"]) == before, r.stdout + r.stderr)

        state["doc"] = json.loads(json.dumps(org_doc))
        state["doc"]["configuration"]["organizationData"] = None
        r = run_script(url, tmp, {"op.acc.1": {"P-11": ["x"]}}, "--apply")
        check("organisation · a null block is refused as the plugin does (an absent one is fine)",
              r.returncode == 1 and "configuration.organizationData must be an object" in r.stderr, r.stderr)

        for name, content, reason in [
            ("rejects an organization parameter per agent", {"agents": {"028": {"op.acc.1": {"P-04": ["x"]}}}}, "organization parameter"),
            ("rejects a parameter that does not exist", {"agents": {"028": {"op.acc.1": {"P-99": "x"}}}}, "does not declare parameter P-99"),
            ("rejects an unseeded control", {"agents": {"028": {"op.exp.1": {"P-01": ["a | b | c | d"]}}}}, "is not seeded"),
            ("rejects an impossible value shape", {"agents": {"028": {"op.acc.1": {"P-07": {"a": 1}}}}}, "is not text"),
        ]:
            reset(agents_doc)
            version = state["version"]
            r = run_script(url, tmp, content, "--apply")
            check("validation · " + name, r.returncode == 1 and reason in r.stderr and state["version"] == version, r.stderr)

    server.shutdown()
    print()
    if failures:
        print("{} test(s) failed: {}".format(len(failures), ", ".join(failures)))
        return 1
    print("all tests pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
