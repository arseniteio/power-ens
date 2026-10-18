"""La versión anterior del documento `active`, guardada ANTES de escribir.

Lo usan `inject-control.py` y `set-parameters.py`. El plugin guarda cada
versión en el historial de `wazuh-ens-configuration` (documentos
`CONFIGURATION_HISTORY`); estas herramientas escriben `_doc/active` directamente
y, sin esto, la versión que sustituyen no quedaba en ninguna parte.

Primero se intenta el historial, con el mismo formato que el plugin y las
mismas credenciales. Si el índice no lo admite, se escribe una copia local con
fecha y hora (con la forma de `GET _doc/active`, la que restaura la guía de
diagnóstico y rollback, apartado 7). Devuelve dónde quedó, para imprimirlo.
"""
import datetime
import json
import os
import secrets


def _iso(instante):
    return instante.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (instante.microsecond // 1000)


def guarda_version_anterior(req, index, source, autor, directorio=None):
    ahora = datetime.datetime.now(datetime.timezone.utc)
    ms = int(ahora.timestamp() * 1000)
    hid = "history-%d-%s" % (ms, secrets.token_hex(6))
    documento = {
        "documentType": "CONFIGURATION_HISTORY",
        "configuration": source.get("configuration", source),
        "createdAt": _iso(ahora),
        "createdBy": autor,
    }
    try:
        req("PUT", "/%s/_doc/%s?op_type=create" % (index, hid), documento)
        return "historial de %s (%s)" % (index, hid)
    except Exception as error:  # el índice no lo admite: copia local
        ruta = os.path.join(directorio or os.getcwd(), "active-antes-%s.json" % ahora.strftime("%Y%m%d-%H%M%S"))
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({"_source": source}, f, ensure_ascii=False, indent=1)
        return "fichero local %s (el historial no admitió la copia: %s)" % (ruta, error)
