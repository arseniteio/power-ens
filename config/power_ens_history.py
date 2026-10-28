"""Saves the previous version of the `active` document BEFORE writing.

Used by `inject-control.py` and `set-parameters.py`, which write `_doc/active` directly: without this
the version they replace would be kept nowhere. The history is tried first, with the plugin's format
and the same credentials (`CONFIGURATION_HISTORY` documents of `wazuh-ens-configuration`). If the index
does not accept it, a local copy with date and time is written (shaped like `GET _doc/active`, what the
diagnosis and rollback guide, section 7, restores). Returns where it ended up, to print it.
"""
import datetime
import json
import os
import secrets


def _iso(instant):
    return instant.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (instant.microsecond // 1000)


def save_previous_version(req, index, source, author, directory=None):
    now = datetime.datetime.now(datetime.timezone.utc)
    ms = int(now.timestamp() * 1000)
    history_id = "history-%d-%s" % (ms, secrets.token_hex(6))
    document = {
        "documentType": "CONFIGURATION_HISTORY",
        "configuration": source.get("configuration", source),
        "createdAt": _iso(now),
        "createdBy": author,
    }
    try:
        req("PUT", "/%s/_doc/%s?op_type=create" % (index, history_id), document)
        return "history of %s (%s)" % (index, history_id)
    except Exception as error:  # the index does not accept it: local copy
        path = os.path.join(directory or os.getcwd(), "active-antes-%s.json" % now.strftime("%Y%m%d-%H%M%S"))
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"_source": source}, f, ensure_ascii=False, indent=1)
        return "local file %s (the history did not accept the copy: %s)" % (path, error)
