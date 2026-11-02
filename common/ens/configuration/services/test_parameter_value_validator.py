#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
DASHBOARD = os.path.join(ROOT, "public")


def find_runtime():
    candidates = [
        (shutil.which("bun"), ["run"]),
        (os.path.expanduser("~/.bun/bin/bun"), ["run"]),
        (shutil.which("deno"), ["run", "-A", "--no-check"]),
    ]

    for binary, arguments in candidates:
        if binary and os.path.exists(binary):
            return [binary] + arguments

    if shutil.which("npx"):
        return [shutil.which("npx"), "--yes", "tsx"]

    return None


HARNESS = r"""
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { validateParameterValue } from './repo/common/ens/configuration/services/parameter-value-validator';
import {
  validateControlConfiguration,
  validateControlParameterValues,
} from './repo/common/ens/configuration/services/validation-engine';
import { evaluateENSControl } from './repo/common/ens/core/evaluation/evaluation-engine';
import { ENSCatalog } from './repo/common/ens/catalog';
import { ENSConfigurationRegistry } from './repo/common/ens/configuration/registry';

const control = (controlId) =>
  ENSConfigurationRegistry.find((item) => item.controlId === controlId);

const withValues = (controlId, values) => {
  const base = control(controlId);
  return {
    ...base,
    parameters: base.parameters.map((parameter) =>
      Object.prototype.hasOwnProperty.call(values, parameter.id)
        ? { ...parameter, value: values[parameter.id] }
        : parameter
    ),
  };
};

const cases = JSON.parse(
  readFileSync(process.argv[process.argv.length - 1], 'utf8')
);

const output = cases.map((testCase) => {
  if (testCase.kind === 'value') {
    const base = testCase.controlId
      ? control(testCase.controlId).parameters.find((p) => p.id === testCase.parameterId)
      : {};
    const parameter = { ...base, ...(testCase.parameter || {}) };
    const verdict = validateParameterValue(parameter, testCase.value);
    return { valid: verdict.valid, reason: verdict.reason || '' };
  }

  if (testCase.kind === 'control') {
    const validation = validateControlConfiguration(
      withValues(testCase.controlId, testCase.values),
      testCase.level
    );
    return {
      status: validation.status,
      statuses: validation.parameters.reduce((acc, p) => {
        acc[p.id] = p.status;
        return acc;
      }, {}),
      configured: validation.configured,
      missingRequired: validation.missingRequired.map((p) => p.id),
      invalidRequired: validation.invalidRequired.map((p) => p.id),
      issues: validation.issues.map((i) => `${i.parameterId}: ${i.reason}`),
    };
  }

  if (testCase.kind === 'form') {
    // Same as `handleSave` in configuration-session.tsx: values go by parameter NAME, not id.
    const issues = validateControlParameterValues(
      control(testCase.controlId),
      testCase.values
    );
    return { issues: issues.map((i) => `${i.parameterId} · ${i.label}: ${i.reason}`) };
  }

  if (testCase.kind === 'evaluation') {
    const catalogControl = ENSCatalog.find((item) => item.id === testCase.controlId);

    // Synthetic CUMPLE evidences for every requirement of the level: without them the control is
    // NO_EVALUABLE for lack of evidence and "an invalid value does not leave it green" would pass anyway.
    const evidences = testCase.compliantEvidences
      ? Array.from(
          new Set(
            catalogControl.requirements
              .filter((r) => r.applicability.levels.includes(testCase.level))
              .flatMap((r) => r.evidenceIds)
          )
        ).map((id) => ({
          id,
          controlId: testCase.controlId,
          status: 'CUMPLE',
          requirements: [],
          levels: [testCase.level],
          observations: [],
          relatedRules: [],
        }))
      : [];

    const result = evaluateENSControl(
      catalogControl,
      withValues(testCase.controlId, testCase.values),
      testCase.level,
      evidences,
      undefined,
      []
    );
    const cfg = result.nonConformities.find((nc) => nc.id === 'NC-CFG');
    return {
      status: result.status,
      score: result.score,
      missingParameters: result.missingParameters,
      ncCfg: cfg ? { finding: cfg.finding, requiredAction: cfg.requiredAction } : null,
      observations: result.observations,
    };
  }

  return { error: 'unknown case' };
});

console.log(JSON.stringify(output));
"""


def prepare(tmp):
    shutil.copytree(DASHBOARD, os.path.join(tmp, "repo", "public"))
    shutil.copytree(os.path.join(ROOT, "common"), os.path.join(tmp, "repo", "common"))

    with open(os.path.join(tmp, "kibana-services.ts"), "w", encoding="utf-8") as f:
        f.write("export const getHttp = () => { throw new Error('stub'); };\n")

    shutil.copytree(os.path.join(ROOT, "node_modules", "re2js"), os.path.join(tmp, "node_modules", "re2js"))

    harness = os.path.join(tmp, "harness.ts")
    with open(harness, "w", encoding="utf-8") as f:
        f.write(HARNESS)

    return harness


def run(runtime, harness, tmp, cases):
    input_file = os.path.join(tmp, "cases.json")
    with open(input_file, "w", encoding="utf-8") as f:
        json.dump(cases, f)

    process = subprocess.run(
        runtime + [harness, input_file],
        capture_output=True, text=True, cwd=tmp,
    )

    if process.returncode != 0:
        print(process.stdout)
        print(process.stderr, file=sys.stderr)
        raise SystemExit("the TypeScript harness did not start")

    return json.loads(process.stdout.strip().splitlines()[-1])


def value(control_id, parameter_id, v, parameter=None):
    case = {"kind": "value", "controlId": control_id,
            "parameterId": parameter_id, "value": v}
    if parameter:
        case["parameter"] = parameter
    return case


def synthetic(parameter, v):
    return {"kind": "value", "parameter": parameter, "value": v}


SYNTHETIC_BASE = {
    "id": "P-XX", "controlId": "sintetico", "name": "sintetico",
    "label": "Sintético", "description": "", "levels": ["BAJO"],
    "requirements": [], "required": True, "wazuhUsage": "",
    "powerEnsUsage": "", "evidenceIds": [], "ruleIds": [],
    "ifNotConfigured": "",
}


def synth(type_, **extra):
    return dict(SYNTHETIC_BASE, type=type_, **extra)


VALUE_CASES = [
    ("duration_days · integer", value("op.acc.1", "P-06", 365), True),
    ("duration_days · inherited numeric string", value("op.acc.1", "P-06", "365"), True),
    ("duration_days · decimal", value("op.acc.1", "P-06", 30.5), False),
    ("duration_days · negative", value("op.acc.1", "P-06", -5), False),
    ("duration_days · text", value("op.acc.1", "P-06", "treinta"), False),
    ("duration_days · number with suffix", value("op.acc.1", "P-06", "30 días"), False),
    ("duration_days · with + sign", value("op.acc.1", "P-06", "+30"), False),
    ("duration_days · below minValue", value("op.acc.1", "P-06", 0), False),
    ("duration_days · zero allowed without minValue",
     synthetic(synth("duration_days"), 0), True),
    ("duration_hours · integer", value("mp.info.6", "P-01", 24), True),
    ("duration_hours · decimal", value("mp.info.6", "P-01", 1.5), False),

    ("path · absolute POSIX", value("mp.info.6", "P-06", "/backup"), True),
    ("path · Windows with drive", value("mp.info.6", "P-06", "C:\\Backups"), True),
    ("path · Windows with forward slash", value("mp.info.6", "P-06", "C:/Backups"), True),
    ("path · UNC", value("mp.info.6", "P-09", "\\\\nas-dr\\backup"), True),
    ("path · offsite repository URI", value("mp.info.6", "P-09", "s3://bucket/copias"), True),
    ("path · relative", value("mp.info.6", "P-06", "backup"), False),
    ("path · relative with dot", value("mp.info.6", "P-06", "./backup"), False),
    ("path · home tilde", value("mp.info.6", "P-06", "~/backup"), False),
    ("path · example menu pasted as is",
     value("mp.info.6", "P-06", "/backup | C:\\Backups"), False),

    ("list · array with items", value("op.acc.1", "P-04", ["admin", "guest"]), True),
    ("list · inherited string with commas", value("op.acc.1", "P-04", "admin, guest, test"), True),
    ("list · inherited string with newlines", value("op.acc.1", "P-04", "admin\nguest"), True),
    ("list · an item with `|` is still one item",
     value("op.acc.1", "P-02", "srv-dc01 | Windows"), True),
    ("list · only separators", value("op.acc.1", "P-04", ",,,"), False),
    ("list · empty list counts as absence, not as error",
     value("op.acc.1", "P-04", []), True),

    ("boolean · true", value("mp.info.6", "P-08", True), True),
    ("boolean · 'sí'", value("mp.info.6", "P-08", "sí"), True),
    ("boolean · 'si' without accent", value("mp.info.6", "P-08", "si"), True),
    ("boolean · 'no'", value("op.acc.2", "P-03", "no"), True),
    ("boolean · 'true' as string", value("mp.info.6", "P-08", "true"), True),
    ("boolean · 'false' as string", value("mp.info.6", "P-08", "false"), True),
    ("boolean · example menu pasted as is",
     value("op.acc.2", "P-03", "no (ninguno) / sí - /tmp, /var/tmp"), False),
    ("boolean · free text", value("mp.info.6", "P-08", "quizá"), False),

    ("select · without declared options accepts anything (unreseeded block)",
     synthetic(synth("select"), "lo que sea"), True),
    ("select · with options, value from the list",
     synthetic(synth("select", options=["Veeam", "Bacula"]), "Bacula"), True),
    ("select · with options, value outside the list",
     synthetic(synth("select", options=["Veeam", "Bacula"]), "Acronis"), False),
    ("list · op.acc.1 P-01 accepts several sources",
     value("op.acc.1", "P-01", ["Active Directory", "Local"]), True),
    ("list · op.acc.1 P-01 accepts the value inherited from when it was a select",
     value("op.acc.1", "P-01", "  local "), True),
    ("select · op.acc.2 P-05 rejects free text",
     value("op.acc.2", "P-05", "lo que se nos ocurra"), False),
    ("select · op.acc.2 P-05 accepts a declared option",
     value("op.acc.2", "P-05", "Mínimo privilegio + sudo"), True),
    ("select · mp.info.6 P-10 rejects 'cualquier cosa'",
     value("mp.info.6", "P-10", "cualquier cosa"), False),
    ("select · mp.info.6 P-10 accepts a declared option",
     value("mp.info.6", "P-10", "zimbra-ne"), True),
    ("select · mp.info.6 P-10 still accepts a value stored from the previous list",
     value("mp.info.6", "P-10", "Veeam"), True),
    ("select · the example menu pasted as is no longer passes",
     value("mp.info.6", "P-10",
           "Veeam / Bacula / Amanda / rsync / Windows Backup / Otro"), False),

    ("url · with scheme", synthetic(synth("url"), "https://siem.cliente.es"), True),
    ("url · without scheme", synthetic(synth("url"), "siem.cliente.es"), False),

    ("string · text", value("op.acc.2", "P-04", "Política de acceso v2.1"), True),
    ("string · only spaces", value("op.acc.2", "P-04", "   "), True),

    ("umask · 022", value("op.acc.2", "P-07", "022"), True),
    ("umask · 0027 with fourth digit", value("op.acc.2", "P-07", "0027"), True),
    ("umask · 'abc'", value("op.acc.2", "P-07", "abc"), False),
    ("umask · digit outside octal", value("op.acc.2", "P-07", "088"), False),
    ("umask · two digits", value("op.acc.2", "P-07", "22"), False),
    ("umask · the sheet example pasted as is",
     value("op.acc.2", "P-07", "022 (permisos 755/644)"), False),

    ("table · complete row",
     value("op.acc.2", "P-08", ["/srv/datos | 750 | root:ops | u:auditor:r-x"]), True),
    ("table · several rows",
     value("op.acc.2", "P-08",
           ["/srv/datos | 750 | root:ops | u:auditor:r-x",
            "/srv/informes | 2770 | root:ops | -"]), True),
    ("table · empty optional column is legitimate",
     value("op.acc.2", "P-08", ["/srv/datos | 750 |  | "]), True),
    ("table · missing required column",
     value("op.acc.2", "P-08", ["/srv/datos"]), False),
    ("table · mode is not octal",
     value("op.acc.2", "P-08", ["/srv/datos | 8888 | root:ops | -"]), False),
    ("table · resource is not an absolute path",
     value("op.acc.2", "P-08", ["srv/datos | 750 | root:ops | -"]), False),
    ("table · row has more fields than columns",
     value("op.acc.2", "P-08", ["/srv/datos | 750 | root:ops | - | sobra"]), False),
    ("table · a blank row next to a complete one is not judged",
     value("op.acc.2", "P-08", ["/srv/datos | 750 |  | ", ""]), True),
    ("table · only blank rows counts as absence, not as error",
     value("op.acc.2", "P-08", ["", ""]), True),
    ("table · no rows counts as absence",
     value("op.acc.2", "P-08", []), True),
    ("table · identifier with spaces",
     value("op.acc.2", "P-09", ["j gomez | admin | sudo:total"]), False),
    ("table · multiselect inside the ENS vocabulary",
     value("op.acc.2", "P-06", ["ops | /srv/datos | lectura,escritura,ejecucion"]), True),
    ("table · multiselect outside the ENS vocabulary",
     value("op.acc.2", "P-06", ["ops | /srv/datos | borrado"]), False),
    ("table · the comma does not split rows",
     value("op.acc.2", "P-06", ["ops | /srv/datos | lectura,escritura"]), True),
    ("table · the old P-06 format is no longer accepted",
     value("op.acc.2", "P-06", ["ops -> lectura+escritura"]), False),
    ("table · valid leaving date",
     value("op.acc.1", "P-09", ["mlopez | 2026-03-31"]), True),
    ("table · leaving date that does not exist in the calendar",
     value("op.acc.1", "P-09", ["mlopez | 2026-02-31"]), False),
    ("table · leaving date in another format",
     value("op.acc.1", "P-09", ["mlopez | 31/03/2026"]), False),
    ("table · P-07 with the single-column inherited value",
     value("op.acc.1", "P-07", ["jgomez", "mlopez"]), True),
    ("table · P-07 with the whole row",
     value("op.acc.1", "P-07", ["jgomez | srv01 | ops"]), True),
    ("table · P-07 with a user containing spaces",
     value("op.acc.1", "P-07", ["j gomez | srv01 | ops"]), False),

    ("list with column · SUID with absolute path",
     value("op.acc.2", "P-10", ["/usr/bin/sudo", "/usr/bin/su"]), True),
    ("list with column · SUID without path (the massive false NO_CUMPLE)",
     value("op.acc.2", "P-10", ["sudo", "passwd"]), False),
    ("list with column · relative critical path",
     value("op.acc.2", "P-02", ["passwd"]), False),
    ("list with column · inherited critical paths separated by commas",
     value("op.acc.2", "P-02", "/etc/passwd,/etc/shadow"), True),
    ("list with column · privileged group with spaces",
     value("op.acc.2", "P-12", ["grupo con espacios"]), False),
    ("list WITHOUT declared column still accepts any item",
     value("op.acc.1", "P-04", ["admin", "guest"]), True),

    ("P-05 · plain integer", value("mp.info.6", "P-05", 30), True),
    ("P-05 · per-criticality contract, the sheet example",
     value("mp.info.6", "P-05", "ALTA=30; MEDIA=90"), True),
    ("P-05 · contract with non-numeric threshold", value("mp.info.6", "P-05", "ALTA=abc"), False),
    ("P-05 · unknown criticality", value("mp.info.6", "P-05", "CRITICO=30"), False),
    ("P-05 · free text", value("mp.info.6", "P-05", "cuando toque"), False),
]


OPACC2_OK = {
    "P-01": ["srv01 | Linux"],
    "P-02": ["/etc/passwd", "/etc/sudoers"],
    "P-03": "no",
    "P-04": "Política de Control de Acceso v2.1",
    "P-07": "022",
    "P-08": ["/srv/datos | 750 | root:ops | u:auditor:r-x"],
    "P-10": ["/usr/bin/sudo"],
}


failures = []


def check(name, condition, detail=""):
    print("{}  {}{}".format("OK    " if condition else "FAIL  ", name,
                            "" if condition else "  -> " + detail))
    if not condition:
        failures.append(name)


def main():
    runtime = find_runtime()
    if not runtime:
        print("No TypeScript runtime (bun / deno / node >= 22.6).", file=sys.stderr)
        return 2

    print("runtime: {}\n".format(" ".join(runtime)))

    with tempfile.TemporaryDirectory() as tmp:
        harness = prepare(tmp)

        results = run(runtime, harness, tmp, [case for _, case, _ in VALUE_CASES])

        for (name, _, expected), got in zip(VALUE_CASES, results):
            check(name, got["valid"] == expected,
                  "expected valid={} and got {} ({})".format(
                      expected, got["valid"], got["reason"]))

        print()

        layer2 = run(runtime, harness, tmp, [
            {"kind": "control", "controlId": "op.acc.2", "level": "BAJO",
             "values": dict(OPACC2_OK, **{"P-07": "abc"})},
            {"kind": "control", "controlId": "op.acc.2", "level": "BAJO",
             "values": OPACC2_OK},
            {"kind": "control", "controlId": "op.acc.2", "level": "BAJO",
             "values": dict(OPACC2_OK, **{"P-07": None, "P-01": None})},
        ])

        invalid, correct, absent = layer2

        check("engine · a umask 'abc' does NOT count as configured",
              invalid["statuses"]["P-07"] == "INVALID", str(invalid["statuses"]))
        check("engine · a umask 'abc' blocks like a missing required parameter",
              invalid["invalidRequired"] == ["P-07"], str(invalid))
        check("engine · the reason says what was expected",
              any("octal" in i for i in invalid["issues"]), str(invalid["issues"]))
        check("engine · the control with valid values is CONFIGURED",
              correct["status"] == "CONFIGURED", str(correct))
        check("engine · no issues when everything is valid",
              correct["issues"] == [], str(correct["issues"]))
        check("engine · absent still counts as absent, not as invalid",
              sorted(absent["missingRequired"]) == ["P-01", "P-07"]
              and absent["invalidRequired"] == [], str(absent))

        print()

        form = run(runtime, harness, tmp, [
            {"kind": "form", "controlId": "op.acc.2",
             "values": {"umask_minimo": "abc"}},
            {"kind": "form", "controlId": "op.acc.2",
             "values": {"umask_minimo": "027"}},
            {"kind": "form", "controlId": "op.acc.2",
             "values": {"umask_minimo": None}},
        ])

        rejected, accepted, empty = form

        check("form · rejects the invalid value",
              len(rejected["issues"]) == 1 and
              rejected["issues"][0].startswith("P-07"), str(rejected))
        check("form · the rejection carries the reason",
              any("octal" in i for i in rejected["issues"]), str(rejected))
        check("form · lets the valid value be saved",
              accepted["issues"] == [], str(accepted))
        check("form · does not reject a field left empty",
              empty["issues"] == [], str(empty))

        print()

        layer4 = run(runtime, harness, tmp, [
            {"kind": "evaluation", "controlId": "op.acc.2", "level": "BAJO",
             "compliantEvidences": True,
             "values": dict(OPACC2_OK, **{"P-07": "abc"})},
            {"kind": "evaluation", "controlId": "op.acc.2", "level": "BAJO",
             "compliantEvidences": True,
             "values": OPACC2_OK},
            {"kind": "evaluation", "controlId": "op.acc.2", "level": "BAJO",
             "compliantEvidences": True,
             "values": dict(OPACC2_OK, **{"P-07": "abc", "P-01": None})},
        ])

        with_invalid, with_valid, mixed = layer4

        check("evaluation · an invalid value opens NC-CFG",
              with_invalid["ncCfg"] is not None, str(with_invalid))
        check("evaluation · with everything CUMPLE except the umask, the control is NOT green",
              with_invalid["status"] == "NO_CUMPLE", str(with_invalid["status"]))
        check("evaluation · with the umask fixed it is green",
              with_valid["status"] == "CUMPLE", str(with_valid["status"]))
        check("evaluation · with a valid umask the control measures, and measures 100",
              with_valid.get("score") == 100, str(with_valid))
        check("evaluation · unable to prove the umask, the report shows a 0",
              with_invalid.get("score") == 0 and "score" in with_invalid,
              "publishes score={}".format(with_invalid.get("score")))
        check("evaluation · the same when a required parameter is also missing",
              mixed.get("score") == 0 and "score" in mixed,
              "publishes score={}".format(mixed.get("score")))
        check("evaluation · the 0 is not an absent key in disguise",
              "score" in with_valid and with_valid["score"] != 0,
              str(with_valid.get("score")))
        check("evaluation · the invalid parameter appears as blocking",
              "P-07" in with_invalid["missingParameters"],
              str(with_invalid["missingParameters"]))
        check("evaluation · NC-CFG says 'invalido', not 'faltan'",
              with_invalid["ncCfg"] and
              "invalido" in with_invalid["ncCfg"]["finding"] and
              "faltan" not in with_invalid["ncCfg"]["finding"],
              str(with_invalid["ncCfg"]))
        check("evaluation · NC-CFG carries the reason, not just the identifier",
              with_invalid["ncCfg"] and
              "octal" in with_invalid["ncCfg"]["finding"],
              str(with_invalid["ncCfg"]))
        check("evaluation · NC-CFG asks to correct, not to fill in",
              with_invalid["ncCfg"] and
              "Corregir" in with_invalid["ncCfg"]["requiredAction"] and
              "Rellenar" not in with_invalid["ncCfg"]["requiredAction"],
              str(with_invalid["ncCfg"]))
        check("evaluation · no NC-CFG when the configuration is valid",
              with_valid["ncCfg"] is None, str(with_valid["ncCfg"]))
        check("evaluation · tells the two cases apart in the same message",
              mixed["ncCfg"] and
              "faltan P-01" in mixed["ncCfg"]["finding"] and
              "P-07" in mixed["ncCfg"]["finding"] and
              "invalido" in mixed["ncCfg"]["finding"],
              str(mixed["ncCfg"]))

    print()
    if failures:
        print("{} test(s) failed: {}".format(len(failures), ", ".join(failures)))
        return 1
    print("all tests pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
