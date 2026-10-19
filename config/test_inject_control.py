#!/usr/bin/env python3
"""Tests of inject-control.py against a fake OpenSearch.

Main point: seeding an already configured control twice must NOT erase the values the auditor set
from the UI. The destructive behaviour exists, but must be requested.

    python3 test_inject_control.py

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
SCRIPT = os.path.join(HERE, "inject-control.py")

# The 'active' document served by the fake index. Each test resets it.
state = {"doc": None, "version": 0}

BLOCK = {
    "controlId": "op.acc.1",
    "parameters": [
        {"id": "P-01", "name": "fuente_identidad", "type": "select", "required": True, "value": None},
        {"id": "P-04", "name": "cuentas_genericas_prohibidas", "type": "list", "required": True, "value": None},
        {"id": "P-09", "name": "parametro_nuevo", "type": "string", "required": False, "value": None},
    ],
}

# What "the auditor had already configured": P-01 and P-04 with value, and a P-99 the new block no longer has.
CONFIGURED = {
    "controlId": "op.acc.1",
    "parameters": [
        {"id": "P-01", "value": "active_directory"},
        {"id": "P-04", "value": ["admin", "operador"]},
        {"id": "P-99", "value": "parametro_retirado"},
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
        if state["doc"] is None:
            self._respond({"error": "not found"}, 404)
            return
        self._respond({"_source": state["doc"]})

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
        state["doc"] = body
        state["version"] += 1
        self._respond({"result": "updated", "_version": state["version"]})

    def log_message(self, *_):
        pass  # no noise in the test output


def start_index():
    server = HTTPServer(("127.0.0.1", 0), Index)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def seed(url, block_path, *extra_args):
    env = dict(os.environ, ENS_OS_URL=url, OS_USER="admin", OS_PASS="x")
    return subprocess.run(
        [sys.executable, SCRIPT, "op.acc.1", "--block", block_path, *extra_args],
        capture_output=True, text=True, env=env,
    )


def values():
    control = next(
        c for c in state["doc"]["configuration"]["controls"] if c["controlId"] == "op.acc.1"
    )
    return {p["id"]: p.get("value") for p in control["parameters"]}


failures = []


def check(name, condition, detail=""):
    print("{}  {}{}".format("OK    " if condition else "FAIL  ", name,
                            "" if condition else "  -> " + detail))
    if not condition:
        failures.append(name)


def main():
    server = start_index()
    url = "http://127.0.0.1:{}".format(server.server_port)

    with tempfile.TemporaryDirectory() as tmp:
        block_path = os.path.join(tmp, "op-acc-1-control-block.json")
        with open(block_path, "w", encoding="utf-8") as f:
            json.dump(BLOCK, f)

        # --- new: the control was not there
        state["doc"] = {"configuration": {"controls": []}, "updatedAt": ""}
        r = seed(url, block_path, "--apply")
        check("new · seeds a new control", r.returncode == 0, r.stderr)
        check("new · without values, as it should",
                  values() == {"P-01": None, "P-04": None, "P-09": None}, str(values()))

        # --- seeding over an already configured control
        state["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURED))]},
                         "updatedAt": ""}
        r = seed(url, block_path, "--apply")
        v = values()
        check("merge · keeps the value of P-01", v.get("P-01") == "active_directory", str(v))
        check("merge · keeps the list of P-04",
                  v.get("P-04") == ["admin", "operador"], str(v))
        check("merge · adds the new parameter without value", v.get("P-09") is None, str(v))
        check("merge · warns about the withdrawn parameter with value",
                  "P-99 (with value)" in r.stdout, r.stdout)

        # --- idempotence: a second pass still keeps the values. Checked against the REAL expected values,
        # not against "what was there": comparing the result with itself also passes when both passes erase.
        seed(url, block_path, "--apply")
        check("idempotence · two passes keep the auditor values",
                  values() == {"P-01": "active_directory",
                                "P-04": ["admin", "operador"],
                                "P-09": None}, str(values()))

        # --- a pattern keeps its mode
        with_pattern = json.loads(json.dumps(CONFIGURED))
        with_pattern["parameters"][1].update(value="^svc_.*$", matchMode="regex")
        state["doc"] = {"configuration": {"controls": [with_pattern]}, "updatedAt": ""}
        seed(url, block_path, "--apply")
        seed(url, block_path, "--apply")
        p04 = next(p for p in state["doc"]["configuration"]["controls"][0]["parameters"] if p["id"] == "P-04")
        check("merge · keeps the pattern AND its mode after two seeds",
                  p04.get("value") == "^svc_.*$" and p04.get("matchMode") == "regex", str(p04))
        p01 = next(p for p in state["doc"]["configuration"]["controls"][0]["parameters"] if p["id"] == "P-01")
        check("merge · a value without mode stays without mode", "matchMode" not in p01, str(p01))

        # --- dry-run: writes nothing
        state["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURED))]},
                         "updatedAt": ""}
        version_before = state["version"]
        r = seed(url, block_path)
        check("dry-run · writes nothing", state["version"] == version_before, r.stdout)

        # --- destructive, but only if requested
        state["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURED))]},
                         "updatedAt": ""}
        r = seed(url, block_path, "--apply", "--sustituir")
        v = values()
        check("--sustituir · discards the values set",
                  v == {"P-01": None, "P-04": None, "P-09": None}, str(v))
        check("--sustituir · says which are lost",
                  "P-01" in r.stdout and "P-04" in r.stdout, r.stdout)

        # --- the per-system layer (1.2.0) survives seeding
        agents_doc = {"028": {"templates": ["zimbra-ldap"],
                           "controls": {"op.acc.1": {"parameters": {"P-07": ["u | s | r"], "P-99": "x"}}}}}
        state["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURED))],
                                           "agents": json.loads(json.dumps(agents_doc))},
                         "updatedAt": ""}
        r = seed(url, block_path, "--apply")
        check("agents · reseeding does not delete configuration.agents",
                  state["doc"]["configuration"].get("agents") == agents_doc,
                  str(state["doc"]["configuration"].get("agents")))
        check("agents · warns about the per-agent value of a withdrawn parameter",
                  "P-99 on agent 028" in r.stdout, r.stdout)
        r = seed(url, block_path, "--apply", "--sustituir")
        check("agents · not even with --sustituir",
                  state["doc"]["configuration"].get("agents") == agents_doc, r.stdout)
        check("agents · with --sustituir it also warns about orphans",
                  "P-99 on agent 028" in r.stdout, r.stdout)

        # --- 1.3.0: custom templates and per-control assignments survive seeding
        templates = [{"id": "custom-web", "controlId": "op.acc.1", "name": "Web", "values": {"P-01": "LDAP", "P-99": "x"}}]
        agents = {"028": {"controls": {"op.acc.1": {"templateId": "custom-web", "parameters": {"P-04": ["x"]}}}}}
        state["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURED))],
                                           "agents": json.loads(json.dumps(agents)),
                                           "templates": json.loads(json.dumps(templates))},
                         "updatedAt": ""}
        r = seed(url, block_path, "--apply")
        check("templates · reseeding keeps configuration.templates and the assignments",
                  state["doc"]["configuration"].get("templates") == templates
                  and state["doc"]["configuration"].get("agents") == agents, r.stdout)
        check("templates · warns about a template value of a withdrawn parameter",
                  "P-99 in template custom-web" in r.stdout and "Custom templates" in r.stdout, r.stdout)

        # --- the previous version goes to the history BEFORE writing
        state["history"] = []
        previous = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURED))], "changeReason": "previo"},
                  "updatedAt": ""}
        state["doc"] = json.loads(json.dumps(previous))
        r = seed(url, block_path, "--apply")
        h = state["history"]
        check("history · saves the previous version in the plugin format",
                  len(h) == 1 and h[0]["doc"]["documentType"] == "CONFIGURATION_HISTORY"
                  and h[0]["doc"]["configuration"] == previous["configuration"]
                  and h[0]["doc"]["createdBy"] == "inject-control.py" and h[0]["order"] < state["version"],
                  str(h)[:300])
        check("history · says where", "Previous version saved in: history" in r.stdout, r.stdout)

        # --- no permission for the history: local copy with date
        state["history_fails"] = True
        state["doc"] = json.loads(json.dumps(previous))
        env = dict(os.environ, ENS_OS_URL=url, OS_USER="admin", OS_PASS="x")
        r = subprocess.run([sys.executable, SCRIPT, "op.acc.1", "--block", block_path, "--apply"],
                           capture_output=True, text=True, env=env, cwd=tmp)
        copies = [f for f in os.listdir(tmp) if f.startswith("active-antes-")]
        content = json.load(open(os.path.join(tmp, copies[0]))) if copies else {}
        check("history · without permission, restorable local copy (with _source)",
                  len(copies) == 1 and content.get("_source", {}).get("configuration") == previous["configuration"]
                  and "local file" in r.stdout, r.stdout + r.stderr)
        state["history_fails"] = False

        # --- 1.4.0: organisation data is kept and an empty parameter that reads an item takes its value
        org_block = json.loads(json.dumps(BLOCK))
        org_block["parameters"].append({"id": "P-11", "name": "grupos_privilegiados", "type": "list", "required": False, "value": None})
        org_path = os.path.join(tmp, "org-block.json")
        with open(org_path, "w", encoding="utf-8") as f:
            json.dump(org_block, f)
        organization = {"values": {"grupos_privilegiados": ["sudo", "wheel"]}}
        state["doc"] = {"configuration": {"controls": [], "organizationData": json.loads(json.dumps(organization))}, "updatedAt": ""}
        r = seed(url, org_path, "--apply")
        check("organisation data · kept as it is", state["doc"]["configuration"].get("organizationData") == organization, r.stdout)
        check("organisation data · a new control's parameter takes the item value",
              values().get("P-11") == ["sudo", "wheel"] and "takes «Grupos con privilegio administrativo»" in r.stdout, r.stdout)
        configured = json.loads(json.dumps(CONFIGURED))
        configured["parameters"].append({"id": "P-11", "value": ["root"]})
        state["doc"] = {"configuration": {"controls": [configured], "organizationData": json.loads(json.dumps(organization))}, "updatedAt": ""}
        seed(url, org_path, "--apply")
        check("organisation data · a different value is left for the plugin to show as a conflict", values().get("P-11") == ["root"], str(values()))
        seed(url, org_path, "--apply", "--sustituir")
        check("organisation data · with --sustituir the parameter takes the item value again", values().get("P-11") == ["sudo", "wheel"], str(values()))
        state["doc"] = {"configuration": {"controls": [], "organizationData": {"values": {"retencion": None}}}, "updatedAt": ""}
        r = seed(url, org_path)
        check("organisation data · an invalid block is warned about", "configuration.organizationData is not valid" in r.stdout, r.stdout)

        # --- does not touch the other controls
        other = {"controlId": "op.acc.2", "parameters": [{"id": "P-01", "value": "intact"}]}
        state["doc"] = {"configuration": {"controls": [other]}, "updatedAt": ""}
        seed(url, block_path, "--apply")
        neighbour = next(c for c in state["doc"]["configuration"]["controls"]
                      if c["controlId"] == "op.acc.2")
        check("isolation · does not touch another control's configuration",
                  neighbour["parameters"][0]["value"] == "intact", str(neighbour))

    print()
    if failures:
        print("{} test(s) failed: {}".format(len(failures), ", ".join(failures)))
        return 1
    print("all tests pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
