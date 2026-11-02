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
    except Exception as error:
        path = os.path.join(directory or os.getcwd(), "active-before-%s.json" % now.strftime("%Y%m%d-%H%M%S"))
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"_source": source}, f, ensure_ascii=False, indent=1)
        return "local file %s (the history did not accept the copy: %s)" % (path, error)
