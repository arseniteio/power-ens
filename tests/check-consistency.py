#!/usr/bin/env python3
"""Consistency check between the plugin and the runbooks: what the plugin promises an auditor exists in what is deployed on the manager.

    python3 tests/check-consistency.py
    RUNBOOKS_BASE=<folder with the runbook clones> python3 tests/check-consistency.py

RUNBOOKS_BASE defaults to the folder that holds the plugin.
Exits 0 if everything matches, 1 on any failure. No dependencies.
"""
import glob
import json
import os
import re
import pathlib
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
BASE = os.environ.get("RUNBOOKS_BASE") or os.path.dirname(PLUGIN)

# control -> (runbook GitLab paths, deployed rules XMLs): what install-manager.sh installs is the manager/ copy of each runbook.
RUNBOOKS = {
    "mp.info.6": (
        ("linux/mp.info.6", "zimbra/zimbra-mta/mp.info.6"),
        ["ensfacil_mp_info_6_json_rules.xml"],
    ),
    "op.exp.1": (
        ("linux/op.exp.1",),
        ["ensfacil_op_exp_1_json_rules.xml"],
    ),
    "op.exp.2": (
        ("linux/op.exp.2",),
        ["ensfacil_op_exp_2_json_rules.xml"],
    ),
    "op.exp.3": (
        ("linux/op.exp.3",),
        ["ensfacil_op_exp_3_json_rules.xml"],
    ),
    "op.exp.4": (
        ("linux/op.exp.4",),
        ["ensfacil_op_exp_4_json_rules.xml"],
    ),
    "op.exp.5": (
        ("linux/op.exp.5",),
        ["ensfacil_op_exp_5_json_rules.xml"],
    ),
    "op.exp.6": (
        ("linux/op.exp.6",),
        ["ensfacil_op_exp_6_json_rules.xml"],
    ),
    "op.exp.7": (
        ("linux/op.exp.7",),
        ["ensfacil_op_exp_7_json_rules.xml"],
    ),
    "op.exp.8": (
        ("linux/op.exp.8",),
        ["ensfacil_op_exp_8_json_rules.xml"],
    ),
    "op.exp.9": (
        ("linux/op.exp.9",),
        ["ensfacil_op_exp_9_json_rules.xml"],
    ),
    "op.exp.10": (
        ("linux/op.exp.10",),
        ["ensfacil_op_exp_10_json_rules.xml"],
    ),
    "op.mon.1": (
        ("linux/op.mon.1",),
        ["ensfacil_op_mon_1_json_rules.xml"],
    ),
    "op.mon.2": (
        ("linux/op.mon.2",),
        ["ensfacil_op_mon_2_json_rules.xml"],
    ),
    "op.mon.3": (
        ("linux/op.mon.3",),
        ["ensfacil_op_mon_3_json_rules.xml"],
    ),
    "op.nub.1": (
        ("linux/op.nub.1",),
        ["ensfacil_op_nub_1_json_rules.xml"],
    ),
    "op.cont.3": (
        ("linux/op.cont.3",),
        ["ensfacil_op_cont_3_json_rules.xml"],
    ),
}

FORMER_FOLDERS = {
    "linux/mp.info.6": "mp.info.6-proxmox-backup-runbook",
    "zimbra/zimbra-mta/mp.info.6": "mp.info.6-zimbra",
    "linux/op.exp.1": "op.exp.1-asset-inventory",
    "linux/op.exp.2": "op.exp.2-security-configuration",
    "linux/op.exp.3": "op.exp.3-security-configuration-management",
    "linux/op.exp.4": "op.exp.4-security-maintenance-and-updates",
    "linux/op.exp.5": "op.exp.5-change-management",
    "linux/op.exp.6": "op.exp.6-malware-protection",
    "linux/op.exp.7": "op.exp.7-incident-management",
    "linux/op.exp.8": "op.exp.8-activity-logging",
    "linux/op.exp.9": "op.exp.9-incident-management-records",
    "linux/op.exp.10": "op.exp.10-cryptographic-key-protection",
}

# ACTIVE controls judged without a runbook, with their reason (also read by draft-control.test.ts).
WITHOUT_RUNBOOK = {
    control: reason
    for control, reason in json.loads(
        open(os.path.join(HERE, "controls-without-runbook.json"), encoding="utf-8").read()
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
        if not file.endswith(".ts") or file in ("index.ts", "types.ts", "engine-catalog.ts"):
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

WITH_BLOCK = list(RUNBOOKS) + sorted(c for c in WITHOUT_RUNBOOK if c in STATES)


def _repos_under(root, depth=3):
    """Git repositories under `root`, up to `depth` levels, without entering any of them."""
    found = []
    pending = [(root, 0)]
    while pending:
        folder, level = pending.pop(0)
        try:
            names = sorted(os.listdir(folder))
        except OSError:
            continue
        for name in names:
            child = os.path.join(folder, name)
            if name.startswith(".") or not os.path.isdir(child):
                continue
            if os.path.exists(os.path.join(child, ".git")):
                found.append(child)
            elif level + 1 < depth:
                pending.append((child, level + 1))
    return found


def _sibling_origins():
    """{folder: `origin` URL} of every git repository next to the plugin."""
    origins = {}
    for folder in _repos_under(BASE):
        try:
            r = subprocess.run(
                ["git", "-C", folder, "remote", "get-url", "origin"],
                capture_output=True,
                text=True,
            )
        except OSError:
            continue
        if r.returncode == 0 and r.stdout.strip():
            origins[folder] = r.stdout.strip()
    return origins


ORIGINS = _sibling_origins()
FOLDERS = {}
DUPLICATES = {}
RESOLVED_BY = {}


def folder_of(runbook):
    """Local folder of the clone of `runbook` (its GitLab path), matched by its `origin`; falls back to the former folder name."""
    if runbook in FOLDERS:
        return FOLDERS[runbook]
    patron = re.compile(r"(^|[/:])" + re.escape(runbook) + r"(\.git)?/?$")
    candidates = [c for c, url in ORIGINS.items() if patron.search(url)]
    anterior = os.path.join(BASE, FORMER_FOLDERS.get(runbook, runbook.split("/")[-1]))
    if candidates:
        chosen = anterior if anterior in candidates else candidates[0]
        if len(candidates) > 1:
            DUPLICATES[runbook] = candidates
        RESOLVED_BY[runbook] = "origin"
    else:
        chosen = anterior
        RESOLVED_BY[runbook] = "carpeta" if os.path.isdir(anterior) else None
    FOLDERS[runbook] = chosen
    return chosen


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
    repos, xmls = RUNBOOKS[control]
    ids = set()
    for repo in repos:
        for x in xmls:
            path = os.path.join(folder_of(repo), "manager", x)
            if not os.path.exists(path):
                fail(
                    "deployed XML exists",
                    "manager/{} of {} not found (in {})".format(x, repo, path),
                )
                continue
            ids |= rules_of(lee(path))
    return ids


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

print("=== 0. Every runbook has a clone next to the plugin ===\n")

for control, (repos, _xmls) in RUNBOOKS.items():
    for repo in repos:
        folder = folder_of(repo)
        if RESOLVED_BY[repo] is None:
            fail(
                "{}: no clone of {} next to the plugin".format(control, repo),
                "clone git@gitlab.com:quersystem/ens-controls-runbook/{}.git"
                " into {}".format(repo, BASE),
            )
            continue
        if repo in DUPLICATES:
            warn(
                "{}: more than one clone of {}".format(control, repo),
                "using {}; the others: {}".format(
                    os.path.basename(folder),
                    ", ".join(
                        os.path.basename(c) for c in DUPLICATES[repo] if c != folder
                    ),
                ),
            )
        ok(
            "{}: {} -> {}".format(control, repo, os.path.basename(folder)),
            "" if RESOLVED_BY[repo] == "origin" else "(by the former folder name)",
        )

print("\n=== 1. Every accredited rule must be able to fire ===\n")

catalog_controls = sorted(set(re.findall(r"controlId: '([^']+)'", catalog)))

for control in catalog_controls:
    accredited = set()
    for _, body in evidence_blocks(catalog, control):
        accredited |= set(list_field(body, "relatedRules"))

    if not accredited:
        ok("{}: accredits no rule yet (no agent)".format(control))
        continue

    if control not in RUNBOOKS:
        fail(
            "{}: accredits rules and has no registered runbook".format(control),
            "{}: {} — add it to RUNBOOKS or this check does not look at it".format(
                len(accredited), ", ".join(sorted(accredited))
            ),
        )
        continue

    deployed = deployed_rules(control)

    unreachable = sorted(accredited - deployed)
    if unreachable:
        fail(
            "{}: accredited rules the manager does NOT have".format(control),
            "{} of {}: {}".format(
                len(unreachable), len(accredited), ", ".join(unreachable)
            ),
        )
    else:
        ok(
            "{}: the {} accredited rules are deployed".format(
                control, len(accredited)
            )
        )

print("\n=== 2. The plugin's canonical copy and the deployed copy do not diverge ===\n")

for control, (repos, xmls) in RUNBOOKS.items():
    for repo in repos:
        for x in xmls:
            canonical = os.path.join(PLUGIN, "agent/rules", x)
            copy = os.path.join(folder_of(repo), "manager", x)
            if not (os.path.exists(canonical) and os.path.exists(copy)):
                continue
            ids_canonical, ids_copy = rules_of(lee(canonical)), rules_of(lee(copy))
            if ids_canonical == ids_copy:
                ok("{} ({}): same rule IDs in canonical and copy".format(x, repo))
            else:
                solo_can = sorted(ids_canonical - ids_copy)
                solo_cop = sorted(ids_copy - ids_canonical)
                fail(
                    "{} ({}): the canonical and the deployed are different sets".format(x, repo),
                    "only in canonical ({}): {}… | only deployed ({}): {}".format(
                        len(solo_can),
                        ", ".join(solo_can[:6]),
                        len(solo_cop),
                        ", ".join(solo_cop[:6]) or "ninguna",
                    ),
                )

print("\n=== 3. Every evidence listens to the contract the agents emit ===\n")

deaf = []
for control in RUNBOOKS:
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

for control, (repos, xmls) in RUNBOOKS.items():
    emitted = set()
    for repo in repos:
        for x in xmls:
            path = os.path.join(folder_of(repo), "manager", x)
            if os.path.exists(path):
                emitted |= set(
                    re.findall(
                        r'<field name="event"[^>]*>\^?([a-z0-9_]+)\$?</field>', lee(path)
                    )
                )
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

print("\n=== 5. The runbooks deploy the same way ===\n")

EXPECTED = ["install.sh", "install-manager.sh", "uninstall.sh"]
for control, (repos, _) in RUNBOOKS.items():
    for repo in repos:
        missing = [
            s for s in EXPECTED if not os.path.exists(os.path.join(folder_of(repo), s))
        ]
        if missing:
            fail(
                "{} ({}): missing scripts of the common procedure".format(control, repo),
                ", ".join(missing),
            )
        else:
            ok("{} ({}): has the scripts of its procedure".format(control, repo))

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
    for control, (repos, xmls) in RUNBOOKS.items():
        emitted = set()
        for repo in repos:
            for x in xmls:
                path = os.path.join(folder_of(repo), "manager", x)
                if os.path.exists(path):
                    emitted |= set(
                        re.findall(
                            r'<field name="event"[^>]*>\^?([a-z0-9_]+)\$?</field>',
                            lee(path),
                        )
                    )
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


print("\n=== 9. The agent and the engine accredit the SAME requirements ===\n")


def agent_map(repo, script):
    """evidence -> requirements, read from score.py's EVIDENCIAS dict."""
    path = os.path.join(folder_of(repo), "scripts", script)
    if not os.path.exists(path):
        return None
    text = lee(path)
    map_of = {}

    m = re.search(r"^EVIDENCIAS = \{(.*?)^\}", text, re.S | re.M)
    if not m:
        return None
    for ev, reqs in re.findall(r'"(EV-\d+)":\s*\[([^\]]*)\]', m.group(1)):
        map_of[ev] = re.findall(r'"([\w.]+)"', reqs)
    return map_of


def requirements_without_evidence(control):
    """Requirements the plugin policy declares WITHOUT any evidence."""
    fn = control.replace(".", "-")
    path = os.path.join(
        PLUGIN, "common/ens/core/policy-runtime/policies", fn + ".policy.ts"
    )
    if not os.path.exists(path):
        return None
    text = lee(path)
    bare = set()
    for block in re.findall(r"requirementId: '([\w.]+)',(.*?)ruleType", text, re.S):
        req, body = block
        m = re.search(r"evidenceIds: \[([^\]]*)\]", body)
        if m and not m.group(1).strip():
            bare.add(req)
    return bare


SCORE = {}

for control, (repos, _rules) in sorted(RUNBOOKS.items()):
    if control not in SCORE:
        ok(
            "{}: the agent does not score itself (new model)".format(control)
        )
        continue

    map_of = agent_map(repos[0], SCORE[control])
    without_evidence = requirements_without_evidence(control)

    if map_of is None or without_evidence is None:
        warn(
            "{}: the agent map or the policy could not be read".format(control),
            "the check is skipped instead of taken as good",
        )
        continue

    inflated = sorted(
        {req for reqs in map_of.values() for req in reqs} & without_evidence
    )
    if inflated:
        who = {
            req: sorted(ev for ev, reqs in map_of.items() if req in reqs)
            for req in inflated
        }
        fail(
            "{}: the agent accredits requirements the policy leaves without evidence".format(control),
            "; ".join(
                "{} <- {}".format(req, ", ".join(evs)) for req, evs in who.items()
            )
            + " (the policy declares them with evidenceIds: [], so the engine"
            " publishes NO_CUMPLE and the agent CUMPLE)",
        )
    else:
        ok(
            "{}: no requirement without evidence in the policy comes out accredited by the agent".format(control),
            "{} mapped evidence(s)".format(len(map_of)),
        )


print("\n=== 10. Nobody sends to fill in a variable the agent no longer reads ===\n")


for control, (repos, _rules) in sorted(RUNBOOKS.items()):
    for repo in repos:
        folder = folder_of(repo)
        orchestrator = sorted(
            glob.glob(os.path.join(folder, "scripts", "*_collect.sh"))
            + glob.glob(os.path.join(folder, "scripts", "*_evidence.sh"))
        )
        if not orchestrator:
            continue

        text = lee(orchestrator[0])
        retired = set(re.findall(r"_avisar_retirado (\w+)", text))
        retired |= set(
            re.findall(r'parametro="(\w+)"[^\n]*ya no se usa en el agente', text)
        )
        if not retired:
            ok("{} ({}): declares no retired variable".format(control, repo))
            continue

        culprits = []
        for file in sorted(
            glob.glob(os.path.join(folder, "*.sh"))
            + glob.glob(os.path.join(folder, "etc", "*.example"))
            + glob.glob(os.path.join(folder, "docs", "*.md"))
            + glob.glob(os.path.join(PLUGIN, "docs", "*.md"))
        ):
            body = lee(file)
            for var in retired:
                if re.search(r'^\s*(#\s*)?{}="'.format(var), body, re.M) or re.search(
                    r"REVISAR[^\n]*{}".format(var), body
                ):
                    culprits.append(
                        "{} -> {}".format(os.path.basename(file), var)
                    )

        if culprits:
            fail(
                "{} ({}): sends to fill in a retired variable".format(control, repo),
                "; ".join(sorted(set(culprits))),
            )
        else:
            ok(
                "{} ({}): nobody sends to fill in its {} retired variable(s)".format(
                    control, repo, len(retired)
                ),
                ", ".join(sorted(retired)),
            )


print("\n=== 11. A new-model control does not judge on the machine ===\n")

for control, (repos, _rules) in sorted(RUNBOOKS.items()):
    blocks = evidence_blocks(catalog, control)

    if not blocks:
        continue

    all_judged = all("judgment: {" in body for _, body in blocks)
    only_declares_gaps = all(
        "agentDeclaresOnlyGaps: true" in body for _, body in blocks
    )

    if not (all_judged or only_declares_gaps):
        ok(
            "{}: classic model or migration in progress, does not apply".format(control)
        )
        continue

    culprits = []

    for repo in repos:
        folder = folder_of(repo)
        listing = subprocess.run(
            ["git", "-C", folder, "ls-files"], capture_output=True, text=True
        )

        if listing.returncode == 0:
            relative = listing.stdout.splitlines()
        else:
            relative = []
            for root, _dirs, files in os.walk(folder):
                if os.sep + ".git" in root or os.sep + "tests" in root:
                    continue
                for file in files:
                    relative.append(
                        os.path.relpath(os.path.join(root, file), folder)
                    )

        for rel in relative:
            if rel == "tests" or rel.startswith("tests/"):
                continue
            if not rel.endswith((".sh", ".py")):
                continue
            path = os.path.join(folder, rel)
            if not os.path.exists(path):
                continue
            text = lee(path) or ""
            for verdict in ("estado=CUMPLE", "estado=NO_CUMPLE",
                              '"estado": "CUMPLE"', '"estado": "NO_CUMPLE"'):
                if verdict in text:
                    culprits.append("{} ({}): {}".format(rel, repo, verdict))

    if culprits:
        fail(
            "{}: the agent emits a verdict and should not".format(control),
            "; ".join(sorted(set(culprits))),
        )
    else:
        ok(
            "{}: the agent only emits facts and NO_EVALUABLE".format(control)
        )


print()


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
print("=== 14. Every ACTIVE control has a runbook or is declared without one ===")
print()


def active_without_runbook(states, runbooks, without_runbook, accredited):
    """Failures of check 14 as a list of (title, detail)."""
    errors = []
    for control, estado in sorted(states.items()):
        if estado != "ACTIVE" or control in runbooks:
            continue
        if control not in without_runbook:
            errors.append((
                "{}: ACTIVE without runbook and undeclared".format(control),
                "register its runbook in RUNBOOKS or, if it is judged without a runbook,"
                " declare it with its reason in tests/controls-without-runbook.json",
            ))
        elif not str(without_runbook[control]).strip():
            errors.append((
                "{}: declared without runbook but without a reason".format(control),
                "tests/controls-without-runbook.json must say why",
            ))
        elif accredited.get(control):
            errors.append((
                "{}: declared without runbook and accredits rules".format(control),
                "{}: a rule exists only if a runbook deploys it".format(
                    ", ".join(sorted(accredited[control]))
                ),
            ))
    for control in sorted(without_runbook):
        if control in runbooks:
            errors.append((
                "{}: has a runbook and is declared without one".format(control),
                "remove it from tests/controls-without-runbook.json",
            ))
    return errors


_anchor = active_without_runbook(
    {"op.zzz.1": "ACTIVE", "op.zzz.2": "ACTIVE", "op.zzz.3": "DRAFT", "op.zzz.4": "ACTIVE"},
    {"op.zzz.4": None},
    {"op.zzz.2": "test reason"},
    {},
)
if [t for t, _ in _anchor] != ["op.zzz.1: ACTIVE without runbook and undeclared"]:
    fail(
        "the anchor of check 14 does not give the expected",
        "; ".join(t for t, _ in _anchor) or "no failure",
    )
elif not active_without_runbook(
    {"op.zzz.2": "ACTIVE"}, {}, {"op.zzz.2": "motivo"}, {"op.zzz.2": {"123"}}
):
    fail(
        "the anchor of check 14 does not give the expected",
        "a control declared without runbook that accredits rules does not show up",
    )
else:
    _accredited = {}
    for _c in STATES:
        _rules = set()
        for _, _body in evidence_blocks(catalog, _c):
            _rules |= set(list_field(_body, "relatedRules"))
        _accredited[_c] = _rules

    _errors = active_without_runbook(STATES, RUNBOOKS, WITHOUT_RUNBOOK, _accredited)
    for _title, _detail in _errors:
        fail(_title, _detail)

    for _unreadable in UNREADABLE_CATALOG:
        fail(
            "unreadable catalog: {}".format(_unreadable),
            "the control and its `status` go at two spaces of indentation"
            " (`  id: '…',` and `  status: 'ACTIVE',`); without them this"
            " check does not know whether the control requires a runbook",
        )
    _errors = _errors + [(i, "") for i in UNREADABLE_CATALOG]

    for _c in sorted(c for c in WITHOUT_RUNBOOK if c not in STATES):
        warn(
            "{}: declared without runbook and not yet in the catalog".format(_c),
            "it will be checked when generated",
        )

    if not _errors:
        _active = sorted(c for c, e in STATES.items() if e == "ACTIVE")
        _sin = [c for c in _active if c in WITHOUT_RUNBOOK]
        ok(
            "the {} ACTIVE control(s) have a runbook or are declared without one".format(
                len(_active)
            ),
            "without runbook: {}".format(", ".join(_sin)) if _sin else "",
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
    _bases += [(os.path.basename(_ruta), r, v) for r, v in _fields(lee(_ruta), "ensfacil")]
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

for _control, (_repos, _xmls) in sorted(RUNBOOKS.items()):
    for _repo in _repos:
        for _x in _xmls:
            _copy = os.path.join(folder_of(_repo), "manager", _x)
            if not os.path.exists(_copy):
                continue
            _clashes = event_clashes(_copy)
            if _clashes:
                warn(
                    "{} ({}): the deployed copy has an unanchored `event` that matches inside another".format(_x, _repo),
                    "; ".join(_clashes[:3]) + " — copy the plugin's canonical again",
                )

print()

if failures:
    print("{} check(s) FAIL: {}".format(len(failures), "; ".join(failures)))
if warnings:
    print("{} warning(s), they do not block.".format(len(warnings)))
if not failures:
    print("consistency OK")

sys.exit(1 if failures else 0)
