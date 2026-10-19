#!/usr/bin/env python3
"""Pruebas de set-parameters.py contra un OpenSearch de mentira.

Lo que se prueba:
  - los valores de organización se siguen declarando como siempre y la capa
    por sistema (`configuration.agents`) sobrevive;
  - la sección `agents` declara valores propios de una máquina, `null` los
    quita, y el id se normaliza;
  - no inventa: rechaza un control no sembrado, un parámetro que no existe, un
    parámetro de organización por agente y un valor con forma imposible, sin
    escribir nada;
  - dry-run por defecto;
  - el modo «Expresión regular» (`matchMode`) en la organización y en un agente.

    python3 test_set_parameters.py

Sin dependencias: http.server de la stdlib hace de índice.
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(AQUI, "set-parameters.py")

estado = {"doc": None, "version": 0}

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


class Indice(BaseHTTPRequestHandler):
    def _responde(self, cuerpo, codigo=200):
        datos = json.dumps(cuerpo).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        self._responde({"_source": estado["doc"]})

    def do_PUT(self):
        largo = int(self.headers.get("Content-Length", 0))
        cuerpo = json.loads(self.rfile.read(largo).decode())
        # La versión anterior que guardan las herramientas antes de escribir.
        if "/_doc/history-" in self.path:
            if estado.get("historial_falla"):
                self._responde({"error": "no"}, 403)
                return
            estado.setdefault("historial", []).append({"orden": estado["version"], "path": self.path, "doc": cuerpo})
            self._responde({"result": "created"})
            return
        estado["doc"] = cuerpo
        estado["version"] += 1
        self._responde({"result": "updated", "_version": estado["version"]})

    def log_message(self, *_):
        pass


fallos = []


def comprueba(nombre, condicion, detalle=""):
    print("{}  {}{}".format("OK    " if condicion else "FALLA ", nombre,
                            "" if condicion else "  -> " + detalle))
    if not condicion:
        fallos.append(nombre)


def reinicia(agents=None):
    cfg = {"controls": [json.loads(json.dumps(CONTROL))]}
    if agents is not None:
        cfg["agents"] = json.loads(json.dumps(agents))
    estado["doc"] = {"configuration": cfg}


def ejecuta(url, tmp, contenido, *extra):
    ruta = os.path.join(tmp, "valores.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(contenido, f)
    entorno = dict(os.environ, ENS_OS_URL=url, OS_USER="admin", OS_PASS="x")
    return subprocess.run([sys.executable, SCRIPT, ruta, *extra], capture_output=True, text=True, env=entorno)


def main():
    servidor = HTTPServer(("127.0.0.1", 0), Indice)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:{}".format(servidor.server_port)
    agentes = {"028": {"templates": ["zimbra-ldap"], "controls": {"op.acc.1": {"parameters": {"P-07": ["a | b | c"]}}}}}

    with tempfile.TemporaryDirectory() as tmp:
        reinicia(agentes)
        r = ejecuta(url, tmp, {"op.acc.1": {"P-04": ["admin", "test"]}}, "--apply")
        cfg = estado["doc"]["configuration"]
        comprueba("organización · se declara como siempre", r.returncode == 0 and cfg["controls"][0]["parameters"][1]["value"] == ["admin", "test"], r.stderr)
        comprueba("organización · configuration.agents sobrevive", cfg.get("agents") == agentes, str(cfg.get("agents")))

        reinicia(agentes)
        version = estado["version"]
        r = ejecuta(url, tmp, {"agents": {"28": {"op.acc.1": {"P-11": ["sudo", "wheel"]}}}})
        comprueba("dry-run · no escribe", estado["version"] == version and "DRY-RUN" in r.stdout, r.stdout + r.stderr)

        r = ejecuta(url, tmp, {"agents": {"28": {"op.acc.1": {"P-11": ["sudo", "wheel"]}}, "024": {"op.acc.1": {"P-07": ["x | y | z"]}}}}, "--apply")
        cfg = estado["doc"]["configuration"]
        comprueba("agente · valor propio, con el id normalizado (28 → 028)",
                  r.returncode == 0 and cfg["agents"]["028"]["controls"]["op.acc.1"]["parameters"]["P-11"] == ["sudo", "wheel"], r.stdout + r.stderr)
        comprueba("agente · conserva lo que ya tenía (P-07, plantillas)",
                  cfg["agents"]["028"]["controls"]["op.acc.1"]["parameters"]["P-07"] == ["a | b | c"] and cfg["agents"]["028"]["templates"] == ["zimbra-ldap"], str(cfg["agents"]["028"]))
        comprueba("agente · crea el perfil de un agente nuevo", cfg["agents"]["024"]["controls"]["op.acc.1"]["parameters"]["P-07"] == ["x | y | z"], str(cfg["agents"].get("024")))
        comprueba("agente · el valor de organización no cambia", cfg["controls"][0]["parameters"][3]["value"] == ["sudo"], str(cfg["controls"][0]))

        r = ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"P-07": None, "P-11": None}}}}, "--apply")
        cfg = estado["doc"]["configuration"]
        comprueba("agente · null quita el valor propio (sin escribir null)",
                  r.returncode == 0 and "controls" not in cfg["agents"]["028"] and "null" not in json.dumps(cfg["agents"]), json.dumps(cfg["agents"]))

        # --- vacío = sin valor, también en la organización (nunca null)
        reinicia(agentes)
        r = ejecuta(url, tmp, {"op.acc.1": {"P-04": [], "P-01": None}}, "--apply")
        params = {x["id"]: x for x in estado["doc"]["configuration"]["controls"][0]["parameters"]}
        comprueba("organización · [] y null quitan la clave value",
                  r.returncode == 0 and "value" not in params["P-04"] and "value" not in params["P-01"], json.dumps(params))

        # --- quitar se admite siempre: un valor huérfano también
        reinicia({"028": {"controls": {"op.acc.1": {"parameters": {"P-99": "x", "P-04": ["y"]}},
                                       "op.exp.1": {"parameters": {"P-01": ["a | b | c | d"]}}}}})
        r = ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"P-99": None, "P-04": ""}, "op.exp.1": {"P-01": None}}}}, "--apply")
        comprueba("agente · null quita valores que no se aplican (parámetro inexistente, de organización, control no sembrado)",
                  r.returncode == 0 and "controls" not in estado["doc"]["configuration"]["agents"]["028"],
                  r.stdout + r.stderr + json.dumps(estado["doc"]["configuration"].get("agents")))

        # --- la clave es el id; un nombre se rechaza, con el id si se conoce
        reinicia({"028": {"name": "dirHost", "aliases": ["dir01.example.com"]}})
        version = estado["version"]
        r = ejecuta(url, tmp, {"agents": {"dirHost": {"op.acc.1": {"P-07": ["x | y | z"]}}}}, "--apply")
        comprueba("clave · un nombre se rechaza y se propone el id",
                  r.returncode == 1 and '"dirHost" no es un id de agente; usar el id (028)' in r.stderr and estado["version"] == version, r.stderr)
        r = ejecuta(url, tmp, {"agents": {"srv-desconocido": {"op.acc.1": {"P-07": ["x | y | z"]}}}}, "--apply")
        comprueba("clave · un nombre que no se conoce se rechaza igual",
                  r.returncode == 1 and '"srv-desconocido" no es un id de agente' in r.stderr, r.stderr)

        # --- la versión anterior, al historial antes de escribir
        reinicia(agentes)
        estado["historial"] = []
        r = ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"P-11": ["sudo"]}}}}, "--apply")
        h = estado.get("historial") or []
        comprueba("historial · guarda la versión anterior y dice dónde",
                  len(h) == 1 and h[0]["doc"]["configuration"]["agents"] == agentes and "Versión anterior guardada en: historial" in r.stdout,
                  r.stdout + str(h)[:200])

        # --- 1.3.0: template assignment per agent and control
        def reset_130(agents=None, templates=None):
            reinicia(agents)
            estado["doc"]["configuration"]["templates"] = json.loads(json.dumps(templates or []))

        custom = [{"id": "custom-web", "controlId": "op.acc.1", "name": "Web", "values": {"P-11": ["wheel"]}}]
        reset_130({"028": {"detectedType": "linux", "controls": {"op.acc.1": {"parameters": {"P-07": ["a | b | c"]}}}}}, custom)
        r = ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"template": "custom-web"}}, "024": {"op.acc.1": {"template": "zimbra-ldap", "P-07": ["x | y | z"]}}}}, "--apply")
        cfg = estado["doc"]["configuration"]
        comprueba("template · assigns a custom template and keeps the overrides",
                  r.returncode == 0 and cfg["agents"]["028"]["controls"]["op.acc.1"] == {"parameters": {"P-07": ["a | b | c"]}, "templateId": "custom-web"},
                  r.stdout + r.stderr + json.dumps(cfg.get("agents")))
        comprueba("template · a built-in and an override together, for a new agent",
                  cfg["agents"]["024"]["controls"]["op.acc.1"] == {"templateId": "zimbra-ldap", "parameters": {"P-07": ["x | y | z"]}}, json.dumps(cfg["agents"].get("024")))
        comprueba("template · custom templates survive", cfg.get("templates") == custom)
        r = ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"template": "none"}}, "024": {"op.acc.1": {"template": None, "P-07": None}}}}, "--apply")
        cfg = estado["doc"]["configuration"]
        comprueba("template · «none» pins the common values; null removes the assignment",
                  r.returncode == 0 and cfg["agents"]["028"]["controls"]["op.acc.1"]["templateId"] == "none"
                  and "controls" not in cfg["agents"]["024"] and "null" not in json.dumps(cfg["agents"]), json.dumps(cfg["agents"]))
        # A 1.1.0-shaped document (no agents, no templates) has nothing to convert: it is marked 1.3.0 on write.
        lab = os.environ.get("ENSFACIL_LAB_DOC")
        shapes = [("synthetic", {"configuration": {"controls": [json.loads(json.dumps(CONTROL))]}})]
        if lab and os.path.exists(lab):
            with open(lab, encoding="utf-8") as handle:
                shapes.append(("lab copy", {"configuration": json.load(handle)["_source"]["configuration"]}))
        for label, document in shapes:
            estado["doc"] = json.loads(json.dumps(document))
            r = ejecuta(url, tmp, {"agents": {"024": {"op.acc.1": {"template": "linux-ubuntu"}}}}, "--apply")
            cfg = estado["doc"]["configuration"]
            comprueba("template · 1.1.0-shaped document (%s): accepted and marked 1.3.0" % label,
                      r.returncode == 0 and cfg.get("templates") == [] and cfg["agents"]["024"]["controls"]["op.acc.1"] == {"templateId": "linux-ubuntu"}
                      and "pasa a ser de la 1.3.0" in r.stdout, r.stdout + r.stderr)
        estado["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONTROL))], "agents": {"028": {"detectedType": "linux"}}}}
        version = estado["version"]
        r = ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"template": "linux-ubuntu"}}}}, "--apply")
        comprueba("template · a stored 1.2.0 type needs the plugin's conversion first: refused, saying how",
                  r.returncode == 1 and "guardar cualquier cambio desde Configuración" in r.stderr and estado["version"] == version, r.stderr)
        r = ejecuta(url, tmp, {"op.acc.1": {"P-04": ["admin", "x"]}}, "--apply")
        comprueba("template · common values on that document still work and it is not marked",
                  r.returncode == 0 and "templates" not in estado["doc"]["configuration"], r.stdout + r.stderr)

        for nombre, contenido, motivo, legacy in [
            ("a built-in of another control", {"agents": {"028": {"op.acc.1": {"template": "manager-wazuh"}}}}, "no tiene la plantilla manager-wazuh", False),
            ("an unknown id", {"agents": {"028": {"op.acc.1": {"template": "nope"}}}}, "no tiene la plantilla nope", False),
            ("a 1.2.0 document", {"agents": {"028": {"op.acc.1": {"template": "linux-ubuntu"}}}}, "Guardar la conversión", True),
        ]:
            if legacy:
                reinicia(agentes)
            else:
                reset_130({"028": {}}, custom)
            version = estado["version"]
            r = ejecuta(url, tmp, contenido, "--apply")
            comprueba("template · refuses " + nombre, r.returncode == 1 and motivo in r.stderr and estado["version"] == version, r.stderr)

        # --- 1.3.0: «Expresión regular» travels with the value
        reinicia(agentes)
        r = ejecuta(url, tmp, {"op.acc.1": {"P-04": {"value": "^(admin|guest)$", "matchMode": "regex"}}}, "--apply")
        params = {x["id"]: x for x in estado["doc"]["configuration"]["controls"][0]["parameters"]}
        comprueba("regex · common value stored with its mode",
                  r.returncode == 0 and params["P-04"].get("value") == "^(admin|guest)$" and params["P-04"].get("matchMode") == "regex", r.stdout + r.stderr)
        comprueba("regex · the plan says it is a pattern", "->  regex ^(admin|guest)$" in r.stdout, r.stdout)
        r = ejecuta(url, tmp, {"op.acc.1": {"P-04": ["admin"]}}, "--apply")
        params = {x["id"]: x for x in estado["doc"]["configuration"]["controls"][0]["parameters"]}
        comprueba("regex · a plain value is exact and removes the mode",
                  r.returncode == 0 and params["P-04"].get("value") == ["admin"] and "matchMode" not in params["P-04"], json.dumps(params["P-04"]))
        ejecuta(url, tmp, {"op.acc.1": {"P-04": {"value": "^a$", "matchMode": "regex"}}}, "--apply")
        r = ejecuta(url, tmp, {"op.acc.1": {"P-04": None}}, "--apply")
        params = {x["id"]: x for x in estado["doc"]["configuration"]["controls"][0]["parameters"]}
        comprueba("regex · clearing the value clears its mode", r.returncode == 0 and "value" not in params["P-04"] and "matchMode" not in params["P-04"], json.dumps(params["P-04"]))
        r = ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"P-03": {"value": "^svc_.*$", "matchMode": "regex"}}}}}, "--apply")
        entry = estado["doc"]["configuration"]["agents"]["028"]["controls"]["op.acc.1"]
        comprueba("regex · an override stored with its mode, the rest kept",
                  r.returncode == 0 and entry["parameters"]["P-03"] == "^svc_.*$" and entry["matchModes"] == {"P-03": "regex"} and entry["parameters"]["P-07"] == ["a | b | c"], json.dumps(entry))
        r = ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"P-03": {"value": ["svc_a"], "matchMode": "exact"}}}}}, "--apply")
        entry = estado["doc"]["configuration"]["agents"]["028"]["controls"]["op.acc.1"]
        comprueba("regex · an exact override removes the mode", r.returncode == 0 and entry["parameters"]["P-03"] == ["svc_a"] and "matchModes" not in entry, json.dumps(entry))
        ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"P-03": {"value": "^svc_.*$", "matchMode": "regex"}}}}}, "--apply")
        r = ejecuta(url, tmp, {"agents": {"028": {"op.acc.1": {"P-03": None}}}}, "--apply")
        entry = estado["doc"]["configuration"]["agents"]["028"]["controls"]["op.acc.1"]
        comprueba("regex · removing the override removes its mode", r.returncode == 0 and "P-03" not in entry["parameters"] and "matchModes" not in entry, json.dumps(entry))
        for nombre, contenido, motivo in [
            ("a parameter without the mode", {"op.acc.1": {"P-11": {"value": "^s.*$", "matchMode": "regex"}}}, "no admite expresión regular"),
            ("a list in regex mode", {"agents": {"028": {"op.acc.1": {"P-03": {"value": ["a"], "matchMode": "regex"}}}}}, "en modo regex el valor es una expresión regular"),
            ("a pattern over 512 characters", {"op.acc.1": {"P-04": {"value": "a" * 513, "matchMode": "regex"}}}, "hasta 512 caracteres"),
            ("an unknown mode", {"op.acc.1": {"P-04": {"value": "^a$", "matchMode": "glob"}}}, 'matchMode es "exact" o "regex"'),
            ("a mode without value", {"op.acc.1": {"P-04": {"matchMode": "regex"}}}, '{"value": …, "matchMode"'),
            ("a pattern with surrounding spaces", {"op.acc.1": {"P-04": {"value": " ^a$", "matchMode": "regex"}}}, "no puede empezar ni terminar con espacios"),
        ]:
            reinicia(agentes)
            version = estado["version"]
            r = ejecuta(url, tmp, contenido, "--apply")
            comprueba("regex · refuses " + nombre, r.returncode == 1 and motivo in r.stderr and estado["version"] == version, r.stderr)

        for nombre, contenido, motivo in [
            ("rechaza un parámetro de organización por agente", {"agents": {"028": {"op.acc.1": {"P-04": ["x"]}}}}, "parámetro de organización"),
            ("rechaza un parámetro que no existe", {"agents": {"028": {"op.acc.1": {"P-99": "x"}}}}, "no declara el parámetro P-99"),
            ("rechaza un control no sembrado", {"agents": {"028": {"op.exp.1": {"P-01": ["a | b | c | d"]}}}}, "no está sembrado"),
            ("rechaza un valor con forma imposible", {"agents": {"028": {"op.acc.1": {"P-07": {"a": 1}}}}}, "no es texto"),
        ]:
            reinicia(agentes)
            version = estado["version"]
            r = ejecuta(url, tmp, contenido, "--apply")
            comprueba("validación · " + nombre, r.returncode == 1 and motivo in r.stderr and estado["version"] == version, r.stderr)

    servidor.shutdown()
    print()
    if fallos:
        print("{} prueba(s) fallidas: {}".format(len(fallos), ", ".join(fallos)))
        return 1
    print("todas las pruebas pasan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
