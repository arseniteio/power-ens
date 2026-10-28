#!/usr/bin/env python3
"""Consistency check of the plugin: what it promises an auditor is backed by the rules it ships in agent/rules.

    python3 tests/check-consistency.py

Exits 0 if everything matches, 1 on any failure. No dependencies.
"""
import glob
import json
import os
import re
import pathlib
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
# control -> the rules XML files the plugin ships for it in agent/rules.
RULES = {
    "mp.info.6": ["power_ens_mp_info_6_json_rules.xml"],
    "op.exp.1": ["power_ens_op_exp_1_json_rules.xml"],
    "op.exp.2": ["power_ens_op_exp_2_json_rules.xml"],
    "op.exp.3": ["power_ens_op_exp_3_json_rules.xml"],
    "op.exp.4": ["power_ens_op_exp_4_json_rules.xml"],
    "op.exp.5": ["power_ens_op_exp_5_json_rules.xml"],
    "op.exp.6": ["power_ens_op_exp_6_json_rules.xml"],
    "op.exp.7": ["power_ens_op_exp_7_json_rules.xml"],
    "op.exp.8": ["power_ens_op_exp_8_json_rules.xml"],
    "op.exp.9": ["power_ens_op_exp_9_json_rules.xml"],
    "op.exp.10": ["power_ens_op_exp_10_json_rules.xml"],
    "op.mon.1": ["power_ens_op_mon_1_json_rules.xml"],
    "op.mon.2": ["power_ens_op_mon_2_json_rules.xml"],
    "op.mon.3": ["power_ens_op_mon_3_json_rules.xml"],
    "op.nub.1": ["power_ens_op_nub_1_json_rules.xml"],
    "op.cont.3": ["power_ens_op_cont_3_json_rules.xml"],
}

RULES_DIR = os.path.join(PLUGIN, "agent", "rules")

# ACTIVE controls judged without rules of their own, with their reason (also read by draft-control.test.ts).
WITHOUT_RULES = {
    control: reason
    for control, reason in json.loads(
        open(os.path.join(HERE, "controls-without-rules.json"), encoding="utf-8").read()
    ).items()
    if not control.startswith("_")
}


def catalog_states():
    """(control -> `status`, unreadable files) from `common/ens/catalog` and its engine catalog copy."""
    states = {}
    unreadable = []
    folder = os.path.join(PLUGIN, "common/ens/catalog")
    for file in sorted(os.listdir(os.path.join(folder, "engine"))):
        with open(os.path.join(folder, "engine", file), encoding="utf-8") as f:
            entry = json.load(f)
        states[entry["control"]] = entry["status"]
    for file in sorted(os.listdir(folder)):
        if not file.endswith(".ts") or file in ("index.ts", "types.ts", "engine-catalog.ts", "engine-messages.ts"):
            continue
        with open(os.path.join(folder, file), encoding="utf-8") as f:
            text = f.read()
        if "from './engine-catalog'" in text:
            continue
        ident = re.search(r"^  id: '([^']+)',$", text, re.M)
        estado = re.search(r"^  status: '([A-Z]+)',$", text, re.M)
        if not ident or not estado:
            unreadable.append(
                "{}: {}".format(
                    file,
                    "without `id` of the control" if not ident else "without `status` of the control",
                )
            )
        if ident:
            states[ident.group(1)] = estado.group(1) if estado else None
    return states, unreadable


STATES, UNREADABLE_CATALOG = catalog_states()

WITH_BLOCK = list(RULES) + sorted(c for c in WITHOUT_RULES if c in STATES)


failures = []
warnings = []


def fail(check, detail):
    print("FAIL   {}\n       {}".format(check, detail))
    failures.append(check)


def warn(check, detail):
    print("WARN   {}\n       {}".format(check, detail))
    warnings.append(check)


def ok(check, detail=""):
    print("OK     {}{}".format(check, "  " + detail if detail else ""))


def lee(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def rules_of(text):
    return set(re.findall(r'rule id="(\d+)"', text))


def deployed_rules(control):
    ids = set()
    for x in RULES[control]:
        path = os.path.join(RULES_DIR, x)
        if not os.path.exists(path):
            fail("rules XML exists", "agent/rules/{} not found".format(x))
            continue
        ids |= rules_of(lee(path))
    return ids


def emitted_events(control):
    events = set()
    for x in RULES[control]:
        path = os.path.join(RULES_DIR, x)
        if os.path.exists(path):
            events |= set(re.findall(r'<field name="event"[^>]*>\^?([a-z0-9_]+)\$?</field>', lee(path)))
    return events


def evidence_blocks(catalog, control):
    """(id, body) of each evidence of the control."""
    patron = (
        r"id: '(EV-\d+)',\s*controlId: '"
        + re.escape(control)
        + r"'(.*?)(?=\n  \{|\n\];)"
    )
    return re.findall(patron, catalog, re.S)


def list_field(body, name):
    m = re.search(name + r": \[([^\]]*)\]", body, re.S)
    return re.findall(r"'([^']+)'", m.group(1)) if m else []



catalog = lee(os.path.join(PLUGIN, "common/ens/core/evidence/catalog.ts"))

print("=== 1. Every accredited rule must be able to fire ===\n")

catalog_controls = sorted(set(re.findall(r"controlId: '([^']+)'", catalog)))

for control in catalog_controls:
    accredited = set()
    for _, body in evidence_blocks(catalog, control):
        accredited |= set(list_field(body, "relatedRules"))

    if not accredited:
        ok("{}: accredits no rule yet (no agent)".format(control))
        continue

    if control not in RULES:
        fail(
            "{}: accredits rules and has no registered rules file".format(control),
            "{}: {} — add it to RULES or this check does not look at it".format(
                len(accredited), ", ".join(sorted(accredited))
            ),
        )
        continue

    deployed = deployed_rules(control)

    unreachable = sorted(accredited - deployed)
    if unreachable:
        fail(
            "{}: accredited rules that agent/rules does NOT have".format(control),
            "{} of {}: {}".format(
                len(unreachable), len(accredited), ", ".join(unreachable)
            ),
        )
    else:
        ok(
            "{}: the {} accredited rules are in agent/rules".format(
                control, len(accredited)
            )
        )

print("\n=== 3. Every evidence listens to the contract the agents emit ===\n")

deaf = []
for control in RULES:
    for ev, body in evidence_blocks(catalog, control):
        if "evidence_state" not in list_field(body, "expectedEventTypes"):
            deaf.append("{} {}".format(control, ev))
if deaf:
    fail(
        "evidences that do not listen to `evidence_state`",
        ", ".join(deaf)
        + " — their agent emits that contract and they do not hear it: they stay in"
        " NO_EVALUABLE whatever the machine does",
    )
else:
    ok("the evidences of the three controls listen to `evidence_state`")

print("\n=== 4. The declared event types are emitted by some rule ===\n")

for control in RULES:
    emitted = emitted_events(control)
    generic = {"evidence_state", "control_state", "score_snapshot"}
    declared = set()
    for _, body in evidence_blocks(catalog, control):
        declared |= set(list_field(body, "expectedEventTypes"))
    orphans = sorted(declared - emitted - generic)
    if orphans:
        warn(
            "{}: declared types that no rule emits".format(control),
            ", ".join(orphans),
        )
    else:
        ok("{}: all declared types have a rule".format(control))

print("\n=== 6. Every control has its configuration block ===\n")

for control in WITH_BLOCK:
    file = control.replace(".", "-") + "-control-block.json"
    path = os.path.join(PLUGIN, "config", file)
    if not os.path.exists(path):
        fail("{}: missing {}".format(control, file), path)
        continue
    block = json.loads(lee(path))
    if block.get("controlId") != control:
        fail(
            "{}: the block declares another controlId".format(control),
            repr(block.get("controlId")),
        )
    else:
        ok(
            "{}: block with {} parameters".format(
                control, len(block.get("parameters", []))
            )
        )

print("\n=== 7. What the ENGINE reads from the index has a rule on the manager ===\n")

judgment_ts = lee(
    os.path.join(PLUGIN, "common/ens/core/evidence/judgment.ts")
)

m = re.search(
    r"DEFAULT_COLLECTOR_RUN_EVENT_TYPES\s*=\s*\[(.*?)\]", judgment_ts, re.S
)
engine_types = set(re.findall(r"'([^']+)'", m.group(1))) if m else set()

for _, body in re.findall(
    r"id: '(EV-\d+)',(.*?)(?=\n  \{|\n\];)", catalog, re.S
):
    declared_by_evidence = re.search(
        r"collectorRunEventTypes: \[([^\]]*)\]", body, re.S
    )
    if declared_by_evidence:
        engine_types |= set(
            re.findall(r"'([^']+)'", declared_by_evidence.group(1))
        )

if not engine_types:
    fail(
        "could not read from the source which events the engine reads",
        "review DEFAULT_COLLECTOR_RUN_EVENT_TYPES in"
        " common/ens/core/evidence/judgment.ts",
    )
else:
    for control in RULES:
        emitted = emitted_events(control)
        silent = sorted(engine_types - emitted)
        if silent:
            fail(
                "{}: the engine reads events the manager does not index".format(control),
                "{} — without a rule they fall to the base (level 0), generate no alert and"
                " never reach the index: the collector's coverage always comes out"
                " UNKNOWN and every migrated evidence stays permanently grey"
                " even if the machine is healthy".format(", ".join(silent)),
            )
        else:
            ok(
                "{}: the {} event(s) the engine reads ({}) have a rule".format(
                    control, len(engine_types), ", ".join(sorted(engine_types))
                )
            )

print("\n=== 8. Every declared control has its report model ===\n")



def declared_controls(folder):
    """Control IDs of the per-control files in `<folder>`."""
    ids = {}
    path = os.path.join(PLUGIN, folder)
    for file in sorted(os.listdir(path)):
        if not file.endswith(".ts") or file in ("index.ts", "types.ts"):
            continue
        found = re.findall(
            r"^  id: '([^']+)',$", lee(os.path.join(path, file)), re.M
        )
        for control in found:
            ids.setdefault(control, "{}/{}".format(folder, file))
    return ids


declared = {}
for folder in ("common/ens/catalog", "public/ens/data"):
    for control, file in declared_controls(folder).items():
        declared.setdefault(control, file)
for file in sorted(glob.glob(os.path.join(PLUGIN, "common/ens/catalog/engine", "*.json"))):
    declared.setdefault(json.loads(lee(file))["control"], os.path.relpath(file, PLUGIN))

registry_ts = lee(os.path.join(PLUGIN, "public/ens/reports/registry.ts"))
m = re.search(
    r"reportModelDefinitions:\s*ENSReportModelDefinition\[\]\s*=\s*\[(.*?)\n\];",
    registry_ts,
    re.S,
)
with_model = set(re.findall(r"controlId: '([^']+)'", m.group(1))) if m else set()

if not declared:
    fail(
        "could not read from the source which controls the product declares",
        "review the per-control files of common/ens/catalog and"
        " public/ens/data",
    )
elif not with_model:
    fail(
        "could not read from the source which controls have a report model",
        "review `reportModelDefinitions` in"
        " public/ens/reports/registry.ts",
    )
else:
    without_model = sorted(set(declared) - with_model)
    if without_model:
        fail(
            "declared controls WITHOUT a report model",
            "{}: they appear in the Reports tab and cannot issue a report."
            " Register their model in public/ens/reports/registry.ts"
            " (declared in {})".format(
                ", ".join(without_model),
                ", ".join(declared[c] for c in without_model),
            ),
        )
    else:
        ok(
            "the {} declared control(s) have a report model".format(
                len(declared)
            ),
            ", ".join(sorted(declared)),
        )

    orphans = sorted(with_model - set(declared))
    if orphans:
        warn(
            "report models of controls no longer declared",
            ", ".join(orphans),
        )


print()
print("=== 12. A `table` parameter without columns cannot be judged ===")
print()

import re as _re

for _control in sorted(WITH_BLOCK):
    _slug = _control.replace(".", "-")
    _block = pathlib.Path(PLUGIN) / "config" / ("%s-control-block.json" % _slug)
    _source = pathlib.Path(PLUGIN) / "common/ens/configuration/data" / ("%s-parameters.ts" % _slug)

    if not _block.exists():
        continue

    _d = json.loads(_block.read_text(encoding="utf-8"))
    _ps = _d.get("parameters") or _d.get("control", {}).get("parameters") or []
    _ts = _source.read_text(encoding="utf-8") if _source.exists() else ""

    _sin = [x["id"] for x in _ps if x.get("type") == "table" and not x.get("columns")]

    if _sin:
        fail("%s: `table` parameters without columns in the seed block" % _control,
              "%s. The engine cannot distribute the cells and their evidences come out "
              "NO_EVALUABLE." % ", ".join(_sin))
        continue

    _mal = []
    for _p in _ps:
        if _p.get("type") != "table":
            continue
        _i = _ts.find("id: '%s'" % _p["id"])
        if _i < 0:
            continue
        _j = _ts.find("columns: [", _i)
        _n = _ts.find("      id: 'P-", _i + 10)
        if _j < 0 or (_n > 0 and _j > _n):
            continue
        _k = _ts.index("[", _j)
        _prof, _fin = 0, _k
        for _c in range(_k, len(_ts)):
            if _ts[_c] == "[":
                _prof += 1
            elif _ts[_c] == "]":
                _prof -= 1
                if _prof == 0:
                    _fin = _c + 1
                    break
        _en_ts = _re.findall(r"name: '([^']+)'", _ts[_k:_fin])
        _in_block = [c.get("name") for c in _p.get("columns") or []]
        if _en_ts and _en_ts != _in_block:
            _mal.append("%s (TS: %s / bloque: %s)"
                        % (_p["id"], ",".join(_en_ts), ",".join(_in_block)))

    if _mal:
        fail("%s: the seed block's columns diverge from the TS" % _control,
              "; ".join(_mal))
    else:
        ok("%s: every `table` declares its columns and they match the TS" % _control)


print()
print("=== 13. No evidence accredits a CONTROL id ===")
print()

_cat = (pathlib.Path(PLUGIN) / "common/ens/core/evidence/catalog.ts").read_text(encoding="utf-8")

_orphans = []

for _m in _re.finditer(r"requirements: \[([^\]]*)\]", _cat):
    for _r in _re.findall(r"'([^']+)'", _m.group(1)):
        if _re.fullmatch(r"[a-z]+\.[a-z]+\.\d+", _r):
            _orphans.append(_r)

if _orphans:
    fail("there are evidences that accredit a CONTROL id, not a requirement",
          "%s. The engine matches by exact identifier, so that requirement does not "
          "exist and the screen shows an id different from the one in the "
          "nonconformity." % ", ".join(sorted(set(_orphans))))
else:
    ok("every evidence accredits requirements, not controls")


print()
print("=== 14. Every ACTIVE control has rules or is declared without them ===")
print()


def active_without_rules(states, rules, without_rules, accredited):
    """Failures of check 14 as a list of (title, detail)."""
    errors = []
    for control, estado in sorted(states.items()):
        if estado != "ACTIVE" or control in rules:
            continue
        if control not in without_rules:
            errors.append((
                "{}: ACTIVE without rules and undeclared".format(control),
                "register its rules in RULES or, if it is judged without rules of its own,"
                " declare it with its reason in tests/controls-without-rules.json",
            ))
        elif not str(without_rules[control]).strip():
            errors.append((
                "{}: declared without rules but without a reason".format(control),
                "tests/controls-without-rules.json must say why",
            ))
        elif accredited.get(control):
            errors.append((
                "{}: declared without rules and accredits rules".format(control),
                "{}: an accredited rule must ship in agent/rules".format(
                    ", ".join(sorted(accredited[control]))
                ),
            ))
    for control in sorted(without_rules):
        if control in rules:
            errors.append((
                "{}: has rules and is declared without them".format(control),
                "remove it from tests/controls-without-rules.json",
            ))
    return errors


_anchor = active_without_rules(
    {"op.zzz.1": "ACTIVE", "op.zzz.2": "ACTIVE", "op.zzz.3": "DRAFT", "op.zzz.4": "ACTIVE"},
    {"op.zzz.4": None},
    {"op.zzz.2": "test reason"},
    {},
)
if [t for t, _ in _anchor] != ["op.zzz.1: ACTIVE without rules and undeclared"]:
    fail(
        "the anchor of check 14 does not give the expected",
        "; ".join(t for t, _ in _anchor) or "no failure",
    )
elif not active_without_rules(
    {"op.zzz.2": "ACTIVE"}, {}, {"op.zzz.2": "motivo"}, {"op.zzz.2": {"123"}}
):
    fail(
        "the anchor of check 14 does not give the expected",
        "a control declared without rules that accredits rules does not show up",
    )
else:
    _accredited = {}
    for _c in STATES:
        _rules = set()
        for _, _body in evidence_blocks(catalog, _c):
            _rules |= set(list_field(_body, "relatedRules"))
        _accredited[_c] = _rules

    _errors = active_without_rules(STATES, RULES, WITHOUT_RULES, _accredited)
    for _title, _detail in _errors:
        fail(_title, _detail)

    for _unreadable in UNREADABLE_CATALOG:
        fail(
            "unreadable catalog: {}".format(_unreadable),
            "the control and its `status` go at two spaces of indentation"
            " (`  id: '…',` and `  status: 'ACTIVE',`); without them this"
            " check does not know whether the control requires rules",
        )
    _errors = _errors + [(i, "") for i in UNREADABLE_CATALOG]

    for _c in sorted(c for c in WITHOUT_RULES if c not in STATES):
        warn(
            "{}: declared without rules and not yet in the catalog".format(_c),
            "it will be checked when generated",
        )

    if not _errors:
        _active = sorted(c for c, e in STATES.items() if e == "ACTIVE")
        _sin = [c for c in _active if c in WITHOUT_RULES]
        ok(
            "the {} ACTIVE control(s) have rules or are declared without them".format(
                len(_active)
            ),
            "without rules: {}".format(", ".join(_sin)) if _sin else "",
        )



print()
print("=== 15. No unanchored `event` matches inside another event ===")
print()


def _fields(text, name):
    """(rule id, value) of each `<field name=name>`, without comments."""
    cleaned = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    output = []
    for rule, body in re.findall(r'<rule\s+id="(\d+)"[^>]*>(.*?)</rule>', cleaned, flags=re.S):
        for valor in re.findall(r'<field\s+name="%s"[^>]*>([^<]*)</field>' % name, body):
            output.append((rule, valor.strip()))
    return output


def _matches(patron, name):
    try:
        return re.search(patron, name) is not None
    except re.error:
        return True


def event_clashes(path):
    events = _fields(lee(path), "event")
    names = {v.strip("^$") for _, v in events}
    return [
        "{} «{}» matches inside «{}»".format(rule, valor, other)
        for rule, valor in events
        for other in sorted(names - {valor.strip("^$")})
        if _matches(valor, other)
    ]


_canonical = sorted(glob.glob(os.path.join(PLUGIN, "agent", "rules", "*.xml")))
_bases = []
_with_clashes = 0

for _ruta in _canonical:
    _bases += [(os.path.basename(_ruta), r, v) for r, v in _fields(lee(_ruta), "power_ens")]
    _clashes = event_clashes(_ruta)
    if _clashes:
        _with_clashes += 1
        fail(
            "{}: an unanchored `event` matches inside another".format(os.path.basename(_ruta)),
            "; ".join(_clashes) + " — anchor it: ^name$",
        )

_ids = {v.strip("^$") for _, _, v in _bases}
_base_clashes = [
    "{} {} «{}» matches inside «{}»".format(f, r, v, other)
    for f, r, v in _bases
    for other in sorted(_ids - {v.strip("^$")})
    if _matches(v, other)
]
if _base_clashes:
    fail("a base rule matches the id of another control", "; ".join(_base_clashes) + " — anchor it: ^id$")

if not _with_clashes and not _base_clashes:
    ok(
        "the {} canonical XML files: no `event` or base rule matches inside another".format(len(_canonical))
    )

print()

if failures:
    print("{} check(s) FAIL: {}".format(len(failures), "; ".join(failures)))
if warnings:
    print("{} warning(s), they do not block.".format(len(warnings)))
if not failures:
    print("consistency OK")

sys.exit(1 if failures else 0)
