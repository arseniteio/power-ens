#!/usr/bin/env python3
"""Inyecta op.acc.2 en el documento 'active' de wazuh-ens-configuration,
preservando el resto. Idempotente. Dry-run por defecto; --apply para ejecutar.
Uso:  export OS_USER=admin; export OS_PASS='...'; python3 inject-opacc2.py [--apply]"""
import json, os, sys, urllib.request, ssl, datetime, base64
ES="https://localhost:9200"; INDEX="wazuh-ens-configuration"; DOC="active"; BLOCK="op-acc-2-control-block.json"
user=os.environ.get("OS_USER","admin"); pw=os.environ.get("OS_PASS")
if not pw: sys.exit("ERROR: exporta OS_PASS.")
apply="--apply" in sys.argv
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def req(method,path,body=None):
    r=urllib.request.Request(f"{ES}{path}", data=json.dumps(body).encode() if body is not None else None, method=method)
    r.add_header("Authorization","Basic "+base64.b64encode(f"{user}:{pw}".encode()).decode())
    r.add_header("Content-Type","application/json")
    with urllib.request.urlopen(r,context=ctx) as resp: return json.loads(resp.read().decode())
doc=req("GET",f"/{INDEX}/_doc/{DOC}"); source=doc["_source"]; cfg=source["configuration"]
controls=cfg["controls"]; print("Controles actuales:", [c["controlId"] for c in controls])
block=json.load(open(BLOCK,encoding="utf-8")); print("A inyectar:", block["controlId"], "con", len(block["parameters"]), "parámetros")
controls=[c for c in controls if c["controlId"]!="op.acc.2"]; controls.append(block); cfg["controls"]=controls
now=datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
cfg["updatedAt"]=now; cfg["changeReason"]="Alta del control op.acc.2 (Requisitos de acceso) en la configuración activa."; source["updatedAt"]=now
print("Tras la operación:", [c["controlId"] for c in cfg["controls"]])
if not apply:
    print("\n== DRY-RUN ==  ejecuta con --apply si es correcto"); sys.exit(0)
result=req("PUT",f"/{INDEX}/_doc/{DOC}",source); print("\n== APLICADO ==  result:", result.get("result"),"| version:",result.get("_version"))
