#!/usr/bin/env python3
"""Pruebas de inject-control.py contra un OpenSearch de mentira.

Lo que se prueba es una sola cosa, la que falló el 30/07: sembrar dos veces un
control ya configurado NO puede borrar los valores que el auditor puso desde la
UI. El comportamiento destructivo existe, pero hay que pedirlo.

    python3 test_inject_control.py

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
SCRIPT = os.path.join(AQUI, "inject-control.py")

# El documento 'active' que sirve el índice de mentira. Cada prueba lo reinicia.
estado = {"doc": None, "version": 0}

BLOQUE = {
    "controlId": "op.acc.1",
    "parameters": [
        {"id": "P-01", "name": "fuente_identidad", "type": "select", "required": True, "value": None},
        {"id": "P-04", "name": "cuentas_genericas_prohibidas", "type": "list", "required": True, "value": None},
        {"id": "P-09", "name": "parametro_nuevo", "type": "string", "required": False, "value": None},
    ],
}

# Lo que "ya había configurado el auditor": P-01 y P-04 con valor, y un P-99 que
# el bloque nuevo ya no contempla.
CONFIGURADO = {
    "controlId": "op.acc.1",
    "parameters": [
        {"id": "P-01", "value": "active_directory"},
        {"id": "P-04", "value": ["admin", "operador"]},
        {"id": "P-99", "value": "parametro_retirado"},
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
        if estado["doc"] is None:
            self._responde({"error": "not found"}, 404)
            return
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
        pass  # sin ruido en la salida de las pruebas


def arranca_indice():
    servidor = HTTPServer(("127.0.0.1", 0), Indice)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    return servidor


def siembra(url, bloque_path, *extra):
    entorno = dict(os.environ, ENS_OS_URL=url, OS_USER="admin", OS_PASS="x")
    return subprocess.run(
        [sys.executable, SCRIPT, "op.acc.1", "--block", bloque_path, *extra],
        capture_output=True, text=True, env=entorno,
    )


def valores():
    control = next(
        c for c in estado["doc"]["configuration"]["controls"] if c["controlId"] == "op.acc.1"
    )
    return {p["id"]: p.get("value") for p in control["parameters"]}


fallos = []


def comprueba(nombre, condicion, detalle=""):
    print("{}  {}{}".format("OK    " if condicion else "FALLA ", nombre,
                            "" if condicion else "  -> " + detalle))
    if not condicion:
        fallos.append(nombre)


def main():
    servidor = arranca_indice()
    url = "http://127.0.0.1:{}".format(servidor.server_port)

    with tempfile.TemporaryDirectory() as tmp:
        bloque_path = os.path.join(tmp, "op-acc-1-control-block.json")
        with open(bloque_path, "w", encoding="utf-8") as f:
            json.dump(BLOQUE, f)

        # --- alta: el control no estaba
        estado["doc"] = {"configuration": {"controls": []}, "updatedAt": ""}
        r = siembra(url, bloque_path, "--apply")
        comprueba("alta · siembra un control nuevo", r.returncode == 0, r.stderr)
        comprueba("alta · sin valores, que es lo correcto",
                  valores() == {"P-01": None, "P-04": None, "P-09": None}, str(valores()))

        # --- el caso del 30/07: sembrar sobre un control ya configurado
        estado["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURADO))]},
                         "updatedAt": ""}
        r = siembra(url, bloque_path, "--apply")
        v = valores()
        comprueba("fusión · conserva el valor de P-01", v.get("P-01") == "active_directory", str(v))
        comprueba("fusión · conserva la lista de P-04",
                  v.get("P-04") == ["admin", "operador"], str(v))
        comprueba("fusión · añade el parámetro nuevo sin valor", v.get("P-09") is None, str(v))
        comprueba("fusión · avisa del parámetro retirado con valor",
                  "P-99 (con valor)" in r.stdout, r.stdout)

        # --- idempotencia: una segunda pasada sigue conservando los valores.
        # Se comprueba contra los valores REALES esperados, no contra "lo que
        # hubiera antes": comparar el resultado consigo mismo pasa también
        # cuando las dos pasadas borran, que es justo el fallo a detectar.
        siembra(url, bloque_path, "--apply")
        comprueba("idempotencia · dos pasadas conservan los valores del auditor",
                  valores() == {"P-01": "active_directory",
                                "P-04": ["admin", "operador"],
                                "P-09": None}, str(valores()))

        # --- a pattern keeps its mode
        with_pattern = json.loads(json.dumps(CONFIGURADO))
        with_pattern["parameters"][1].update(value="^svc_.*$", matchMode="regex")
        estado["doc"] = {"configuration": {"controls": [with_pattern]}, "updatedAt": ""}
        siembra(url, bloque_path, "--apply")
        siembra(url, bloque_path, "--apply")
        p04 = next(p for p in estado["doc"]["configuration"]["controls"][0]["parameters"] if p["id"] == "P-04")
        comprueba("merge · keeps the pattern AND its mode after two seeds",
                  p04.get("value") == "^svc_.*$" and p04.get("matchMode") == "regex", str(p04))
        p01 = next(p for p in estado["doc"]["configuration"]["controls"][0]["parameters"] if p["id"] == "P-01")
        comprueba("merge · a value without mode stays without mode", "matchMode" not in p01, str(p01))

        # --- dry-run: no escribe
        estado["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURADO))]},
                         "updatedAt": ""}
        version_antes = estado["version"]
        r = siembra(url, bloque_path)
        comprueba("dry-run · no escribe nada", estado["version"] == version_antes, r.stdout)

        # --- destructivo, pero solo si se pide
        estado["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURADO))]},
                         "updatedAt": ""}
        r = siembra(url, bloque_path, "--apply", "--sustituir")
        v = valores()
        comprueba("--sustituir · descarta los valores puestos",
                  v == {"P-01": None, "P-04": None, "P-09": None}, str(v))
        comprueba("--sustituir · dice cuáles se pierden",
                  "P-01" in r.stdout and "P-04" in r.stdout, r.stdout)

        # --- la capa por sistema (1.2.0) sobrevive a la siembra
        agentes = {"028": {"templates": ["zimbra-ldap"],
                           "controls": {"op.acc.1": {"parameters": {"P-07": ["u | s | r"], "P-99": "x"}}}}}
        estado["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURADO))],
                                           "agents": json.loads(json.dumps(agentes))},
                         "updatedAt": ""}
        r = siembra(url, bloque_path, "--apply")
        comprueba("agents · resembrar no borra configuration.agents",
                  estado["doc"]["configuration"].get("agents") == agentes,
                  str(estado["doc"]["configuration"].get("agents")))
        comprueba("agents · avisa del valor por agente de un parámetro retirado",
                  "P-99 en el agente 028" in r.stdout, r.stdout)
        r = siembra(url, bloque_path, "--apply", "--sustituir")
        comprueba("agents · ni con --sustituir",
                  estado["doc"]["configuration"].get("agents") == agentes, r.stdout)
        comprueba("agents · con --sustituir también avisa de los huérfanos",
                  "P-99 en el agente 028" in r.stdout, r.stdout)

        # --- 1.3.0: custom templates and per-control assignments survive seeding
        templates = [{"id": "custom-web", "controlId": "op.acc.1", "name": "Web", "values": {"P-01": "LDAP", "P-99": "x"}}]
        agents = {"028": {"controls": {"op.acc.1": {"templateId": "custom-web", "parameters": {"P-04": ["x"]}}}}}
        estado["doc"] = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURADO))],
                                           "agents": json.loads(json.dumps(agents)),
                                           "templates": json.loads(json.dumps(templates))},
                         "updatedAt": ""}
        r = siembra(url, bloque_path, "--apply")
        comprueba("templates · reseeding keeps configuration.templates and the assignments",
                  estado["doc"]["configuration"].get("templates") == templates
                  and estado["doc"]["configuration"].get("agents") == agents, r.stdout)
        comprueba("templates · warns about a template value of a withdrawn parameter",
                  "P-99 en la plantilla custom-web" in r.stdout and "Plantillas propias" in r.stdout, r.stdout)

        # --- la versión anterior, al historial ANTES de escribir
        estado["historial"] = []
        previo = {"configuration": {"controls": [json.loads(json.dumps(CONFIGURADO))], "changeReason": "previo"},
                  "updatedAt": ""}
        estado["doc"] = json.loads(json.dumps(previo))
        r = siembra(url, bloque_path, "--apply")
        h = estado["historial"]
        comprueba("historial · guarda la versión anterior con el formato del plugin",
                  len(h) == 1 and h[0]["doc"]["documentType"] == "CONFIGURATION_HISTORY"
                  and h[0]["doc"]["configuration"] == previo["configuration"]
                  and h[0]["doc"]["createdBy"] == "inject-control.py" and h[0]["orden"] < estado["version"],
                  str(h)[:300])
        comprueba("historial · dice dónde", "Versión anterior guardada en: historial" in r.stdout, r.stdout)

        # --- sin permiso para el historial: copia local con fecha
        estado["historial_falla"] = True
        estado["doc"] = json.loads(json.dumps(previo))
        entorno = dict(os.environ, ENS_OS_URL=url, OS_USER="admin", OS_PASS="x")
        r = subprocess.run([sys.executable, SCRIPT, "op.acc.1", "--block", bloque_path, "--apply"],
                           capture_output=True, text=True, env=entorno, cwd=tmp)
        copias = [f for f in os.listdir(tmp) if f.startswith("active-antes-")]
        contenido = json.load(open(os.path.join(tmp, copias[0]))) if copias else {}
        comprueba("historial · sin permiso, copia local restaurable (con _source)",
                  len(copias) == 1 and contenido.get("_source", {}).get("configuration") == previo["configuration"]
                  and "fichero local" in r.stdout, r.stdout + r.stderr)
        estado["historial_falla"] = False

        # --- no toca los demás controles
        otro = {"controlId": "op.acc.2", "parameters": [{"id": "P-01", "value": "intacto"}]}
        estado["doc"] = {"configuration": {"controls": [otro]}, "updatedAt": ""}
        siembra(url, bloque_path, "--apply")
        vecino = next(c for c in estado["doc"]["configuration"]["controls"]
                      if c["controlId"] == "op.acc.2")
        comprueba("aislamiento · no toca la configuración de otro control",
                  vecino["parameters"][0]["value"] == "intacto", str(vecino))

    print()
    if fallos:
        print("{} prueba(s) fallidas: {}".format(len(fallos), ", ".join(fallos)))
        return 1
    print("todas las pruebas pasan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
