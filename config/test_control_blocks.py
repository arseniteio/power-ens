#!/usr/bin/env python3
"""Tests of the configuration blocks: `select` options and examples.

Two holes, same root: the parameter sheet documented a MENU of alternatives in `example`, and the form
uses `example` as placeholder, i.e. as a suggestion of what to type.

  1. The product's `select`s declared no `options`, so their validation degenerated into "not empty":
     `herramienta_backup = 'cualquier cosa'` was accepted and the control became evaluable.
  2. An auditor pasting the example as is wrote an invalid value. In three REQUIRED parameters
     (op.acc.2 P-07 and P-03, mp.info.6 P-06) that dropped the control to NO_EVALUABLE with score 0.

Tested on `config/*-control-block.json`, what is seeded in the `wazuh-ens-configuration` index and
therefore what the engine sees in production; it also checks that the compiled TypeScript says the same.

    python3 test_control_blocks.py

Runs the real TypeScript (validator and dropdown model), not a Python copy of the rule. Needs a
TypeScript-capable runtime (bun, deno or npx tsx) and the package.json dependencies installed with yarn.
Python stdlib only.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
DASHBOARD = os.path.join(ROOT, "public")


# --- runtime lookup ---------------------------------------------------------

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


# --- harness ----------------------------------------------------------------
# Kept here, not as a repo file: `public/` is what `config/build-plugin.sh` compiles and ships.

HARNESS = r"""
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import {
  hasParameterOptions,
  resolveSelectFieldModel,
  toParameterListItems,
  validateParameterValue,
} from './repo/common/ens/configuration/services/parameter-value-validator';
import { validateControlConfiguration } from './repo/common/ens/configuration/services/validation-engine';
import { ENSConfigurationRegistry } from './repo/common/ens/configuration/registry';
import { ParameterRendererFactory } from './repo/public/ens/configuration/form-engine/factory';

const cases = JSON.parse(
  readFileSync(process.argv[process.argv.length - 1], 'utf8')
);

const output = cases.map((testCase) => {
  if (testCase.kind === 'value') {
    const verdict = validateParameterValue(testCase.parameter, testCase.value);
    return { valid: verdict.valid, reason: verdict.reason || '' };
  }

  if (testCase.kind === 'list') {
    return { items: toParameterListItems(testCase.value) };
  }

  if (testCase.kind === 'select') {
    const model = resolveSelectFieldModel(testCase.parameter, testCase.value);
    return {
      hasOptions: hasParameterOptions(testCase.parameter),
      selected: model.selected,
      legacyValue: model.legacyValue || '',
      options: model.options.map((option) => ({
        value: option.value,
        label: option.label,
        legacy: option.legacy,
      })),
    };
  }

  // The block as is, with the value asked for each parameter: the real path, since this document is what is seeded.
  if (testCase.kind === 'control') {
    const control = {
      ...testCase.control,
      parameters: testCase.control.parameters.map((parameter) => ({
        ...parameter,
        value: Object.prototype.hasOwnProperty.call(testCase.values, parameter.id)
          ? testCase.values[parameter.id]
          : undefined,
      })),
    };

    const validation = validateControlConfiguration(control, testCase.level);

    return {
      status: validation.status,
      configured: validation.configured,
      missingRequired: validation.missingRequired.map((p) => p.id),
      invalidRequired: validation.invalidRequired.map((p) => p.id),
      issues: validation.issues.map((i) => `${i.parameterId}: ${i.reason}`),
    };
  }

  // The real form: the factory picks the renderer and it is drawn against React and EUI stubs that return the tree as data.
  if (testCase.kind === 'render') {
    const published = [];

    const element = ParameterRendererFactory({
      parameter: testCase.parameter,
      value: testCase.value,
      onChange: (name, value) => published.push([name, value === undefined ? null : value]),
    });

    const renderer = element.type.name;
    const row = element.type(element.props);
    // The list renderer wraps its field (paste handler): find the field inside the row.
    const findInput = (node) => {
      if (!node) return undefined;
      if (Array.isArray(node)) return node.map(findInput).find(Boolean);
      if (['EuiFieldText', 'EuiFieldNumber', 'EuiSelect', 'EuiComboBox'].includes(node.type?.euiName)) return node;
      return findInput(node.props?.children);
    };
    const field = findInput(row);

    if (testCase.selects !== undefined && field.props.onChange) {
      field.props.onChange({ target: { value: testCase.selects } });
    }

    return {
      renderer,
      field: field.type.euiName,
      label: row.props.label,
      help: row.props.helpText,
      invalid: row.props.isInvalid === true,
      error: row.props.error || [],
      value: field.props.value === undefined ? null : field.props.value,
      options: (field.props.options || []).map((option) => ({
        value: option.value,
        text: option.text,
      })),
      published,
    };
  }

  // The `table` grid. Unlike the other renderers it is not a single field inside an EuiFormRow but a
  // tree (headers, a row per entry, the add button): flattened by calling each component, so what is
  // checked is what the auditor would have in front.
  if (testCase.kind === 'render_table') {
    const published = [];

    const element = ParameterRendererFactory({
      parameter: testCase.parameter,
      value: testCase.value,
      onChange: (name, value) =>
        published.push([name, value === undefined ? null : value]),
    });

    const renderer = element.type.name;

    const nodes = [];
    const texts = [];

    const flatten = node => {
      if (node === null || node === undefined || node === false || node === true) {
        return;
      }

      if (Array.isArray(node)) {
        node.forEach(flatten);
        return;
      }

      if (typeof node === 'string' || typeof node === 'number') {
        texts.push(String(node));
        return;
      }

      if (typeof node !== 'object') {
        return;
      }

      const type = node.type;
      const props = node.props || {};

      if (typeof type === 'function') {
        const result = type(props);

        if (result && result.euiComponent) {
          nodes.push({ eui: result.euiComponent, props: result.props || {} });
          flatten((result.props || {}).children);
          return;
        }

        flatten(result);
        return;
      }

      flatten(props.children);
    };

    flatten(element);

    const root = nodes.find(n => n.eui === 'EuiFormRow') || { props: {} };

    const FIELDS = ['EuiFieldText', 'EuiSelect', 'EuiComboBox'];
    const fields = nodes.filter(n => FIELDS.indexOf(n.eui) >= 0);
    const addButton = nodes.find(n => n.eui === 'EuiButtonEmpty');
    const trashButtons = nodes.filter(n => n.eui === 'EuiButtonIcon');

    // Auditor actions on the freshly drawn tree.
    if (testCase.clickAdd && addButton && addButton.props.onClick) {
      addButton.props.onClick();
    }

    if (testCase.removeRow !== undefined && trashButtons[testCase.removeRow]) {
      trashButtons[testCase.removeRow].props.onClick();
    }

    if (testCase.types && fields[testCase.types.field]) {
      const field = fields[testCase.types.field];

      if (field.eui === 'EuiComboBox') {
        field.props.onChange(
          testCase.types.text.split(',').map(label => ({ label }))
        );
      } else {
        field.props.onChange({ target: { value: testCase.types.text } });
      }
    }

    return {
      renderer,
      invalid: root.props.isInvalid === true,
      error: root.props.error || [],
      help: root.props.helpText || '',
      label: root.props.label || '',
      texts,
      fields: fields.map(field => ({
        eui: field.eui,
        label: field.props['aria-label'] || '',
        value: field.props.value === undefined ? null : field.props.value,
        placeholder: field.props.placeholder || '',
        invalid: field.props.isInvalid === true,
        options: (field.props.options || []).map(
          option => option.value || option.label || option.text
        ),
        selectedOptions: (field.props.selectedOptions || []).map(
          option => option.label
        ),
      })),
      trashButtons: trashButtons.length,
      hasAdd: !!addButton,
      published,
    };
  }

  if (testCase.kind === 'registry') {
    return {
      controls: ENSConfigurationRegistry.map((control) => ({
        controlId: control.controlId,
        parameters: control.parameters.map((parameter) => ({
          id: parameter.id,
          name: parameter.name,
          type: parameter.type,
          required: parameter.required,
          example: parameter.example === undefined ? null : parameter.example,
          options: parameter.options === undefined ? null : parameter.options,
          columns: parameter.columns === undefined ? null : parameter.columns,
        })),
      })),
    };
  }

  return { error: 'unknown case' };
});

// To a file, not standard output: bun cuts at 64 KiB what it writes to a pipe on exit, and the
// parameter registry of all controls is already bigger than that.
writeFileSync(`${process.argv[process.argv.length - 1]}.output.json`, JSON.stringify(output));
"""


# React and EUI stubs. Neither is installed: renderers are functions returning JSX, so with a
# `createElement` returning `{type, props}` the drawn tree can be read as data. What is checked is which
# renderer the factory picks and which options the field offers, not how it looks.

REACT_STUB = r"""
const create = (type, props, ...children) => ({
  type,
  props: Object.assign({}, props || {}, children.length ? { children: children.length === 1 ? children[0] : children } : {}),
});

const React = { createElement: create, Fragment: 'Fragment' };

module.exports = React;
module.exports.default = React;
module.exports.createElement = create;
module.exports.useState = initial => [initial, () => {}];
"""

JSX_RUNTIME_STUB = r"""
const jsx = (type, props) => ({ type, props: props || {} });

module.exports = { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: 'Fragment' };
"""

EUI_STUB = r"""
const names = [
  'EuiFormRow', 'EuiSelect', 'EuiFieldText', 'EuiFieldNumber', 'EuiComboBox',
  // The ones the `table` grid composes: the stub must export them even if the test does not look at
  // them, since `import { EuiFlexGroup } from '@elastic/eui'` is a link error if the module lacks it.
  'EuiFlexGroup', 'EuiFlexItem', 'EuiButtonIcon', 'EuiButtonEmpty',
  'EuiText', 'EuiSpacer',
];

const eui = {};

for (const name of names) {
  const component = props => ({ euiComponent: name, props });
  Object.defineProperty(component, 'name', { value: name });
  component.euiName = name;
  eui[name] = component;
}

module.exports = eui;
"""


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def prepare(tmp):
    """Copies the tree and leaves the stubs where the imports look for them."""
    shutil.copytree(DASHBOARD, os.path.join(tmp, "repo", "public"))
    shutil.copytree(os.path.join(ROOT, "common"), os.path.join(tmp, "repo", "common"))

    # `configuration/services/configuration-http-client.ts` imports '../../../../../kibana-services':
    # five levels up from services/ (configuration, ens, public, repo, temp dir).
    write(os.path.join(tmp, "kibana-services.ts"),
          "export const getHttp = () => { throw new Error('stub'); };\n")

    modules = os.path.join(tmp, "node_modules")
    # The validator imports re2js: the real package, from the repository's yarn install.
    shutil.copytree(os.path.join(ROOT, "node_modules", "re2js"), os.path.join(modules, "re2js"))

    write(os.path.join(modules, "react", "package.json"), json.dumps({
        "name": "react", "version": "0.0.0-stub", "main": "index.js",
        "exports": {
            ".": "./index.js",
            "./jsx-runtime": "./jsx-runtime.js",
            "./jsx-dev-runtime": "./jsx-runtime.js",
        },
    }))
    write(os.path.join(modules, "react", "index.js"), REACT_STUB)
    write(os.path.join(modules, "react", "jsx-runtime.js"), JSX_RUNTIME_STUB)

    write(os.path.join(modules, "@elastic", "eui", "package.json"), json.dumps({
        "name": "@elastic/eui", "version": "0.0.0-stub", "main": "index.js",
    }))
    write(os.path.join(modules, "@elastic", "eui", "index.js"), EUI_STUB)

    harness = os.path.join(tmp, "harness.ts")
    write(harness, HARNESS)

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

    with open(input_file + ".output.json", encoding="utf-8") as f:
        return json.load(f)


# --- the blocks -------------------------------------------------------------

BLOCKS = [
    ("op.acc.1", "op-acc-1-control-block.json"),
    ("op.acc.2", "op-acc-2-control-block.json"),
    ("mp.info.6", "mp-info-6-control-block.json"),
]


def load_blocks():
    blocks = {}

    for control_id, file_name in BLOCKS:
        with open(os.path.join(HERE, file_name), encoding="utf-8") as f:
            block = json.load(f)

        assert block["controlId"] == control_id, file_name
        blocks[control_id] = block

    return blocks


# Options each `select` declares today. Explicit, so widening or narrowing the list is a decision: closing
# a parameter's value set changes which configurations are valid. op.acc.1 P-01 stopped being a menu
# (b47427e): an organization can have several identity sources, so it is a list now. The `mp.info.6`
# options before `pbs`/`zimbra-ne` stay so as not to invalidate what is stored.
EXPECTED_OPTIONS = {
    ("op.acc.2", "P-05"): [
        "RBAC sobre AD", "ACL granular por recurso",
        "Mínimo privilegio + sudo", "Otro",
    ],
    ("mp.info.6", "P-10"): [
        "pbs", "zimbra-ne",
        "Veeam", "Bacula", "Amanda", "rsync", "Windows Backup", "Otro",
    ],
}

# Lists whose item is ATOMIC: a path, an account name, an actor. A `|` in its example would be a menu of
# several entries disguised as a value, and the form would store it as ONE item that matches nothing.
ATOMIC_ITEM_LISTS = {
    ("op.acc.1", "P-01"),   # an identity source
    ("op.acc.1", "P-04"),   # a forbidden account name
    ("op.acc.1", "P-11"),   # a privileged group
    ("op.acc.2", "P-02"),   # a critical path
    ("op.acc.2", "P-10"),   # an authorised SUID binary
    ("op.acc.2", "P-11"),   # an excepted world-writable path
    ("op.acc.2", "P-12"),   # a privileged group
    ("mp.info.6", "P-07"),  # an authorised user or process
}

# Lists whose item DOES have fields separated by `|` ('srv-bd01 | ALTA', which the engine splits into system
# and criticality). An item with fields that are also DECLARED is a `table` and needs no entry here: its
# columns say how many fields its example carries. This set is only for lists whose item has fields nobody
# has declared yet: acknowledged debt, not a second way to declare the same thing.
LISTS_WITH_FIELDS = {
    ("op.acc.1", "P-02"),
    ("op.acc.1", "P-03"),
    ("op.acc.2", "P-01"),
    ("mp.info.6", "P-04"),
}

# The menus the sheets documented before they were separated. Kept written so what used to be pasted is on
# record and still checked to be invalid.
OLD_MENUS = [
    ("op.acc.2", "P-07", "022 (permisos 755/644) / 027 (permisos 750/640)"),
    ("op.acc.2", "P-03", "no (ninguno) / sí - /tmp, /var/tmp"),
    ("mp.info.6", "P-06", "/backup | C:\\Backups"),
    ("mp.info.6", "P-09", "/mnt/s3-backup | \\\\nas-dr\\backup"),
    ("mp.info.6", "P-08", "sí / no"),
    ("op.acc.1", "P-08", "sí / no"),
    ("mp.info.6", "P-10", "Veeam / Bacula / Amanda / rsync / Windows Backup / Otro"),
    ("op.acc.2", "P-05",
     "RBAC sobre AD / ACL granular por recurso / Mínimo privilegio + sudo"),
]


failures = []


def check(name, condition, detail=""):
    print("{}  {}{}".format("OK    " if condition else "FAIL  ", name,
                            "" if condition else "  -> " + detail))
    if not condition:
        failures.append(name)


def parameter_of(block, parameter_id):
    return next(p for p in block["parameters"] if p["id"] == parameter_id)


def main():
    runtime = find_runtime()
    if not runtime:
        print("No TypeScript runtime (bun / deno / node >= 22.6).", file=sys.stderr)
        return 2

    print("runtime: {}\n".format(" ".join(runtime)))

    blocks = load_blocks()

    with tempfile.TemporaryDirectory() as tmp:
        harness = prepare(tmp)

        # --- 1. the `select`s declare options -------------------------------

        print("== select options ==\n")

        selects = [
            (control_id, p)
            for control_id, block in blocks.items()
            for p in block["parameters"]
            if p["type"] == "select"
        ]

        check(
            "the product's two selects are still two",
            sorted((c, p["id"]) for c, p in selects) ==
            sorted(EXPECTED_OPTIONS),
            str(sorted((c, p["id"]) for c, p in selects)))

        for control_id, parameter in selects:
            key = (control_id, parameter["id"])
            options = parameter.get("options") or []

            check(
                "{} {} declares options".format(control_id, parameter["id"]),
                len(options) > 0,
                "without `options` the select accepts any text")

            check(
                "{} {} declares the expected options".format(control_id, parameter["id"]),
                options == EXPECTED_OPTIONS.get(key),
                "{!r} != {!r}".format(options, EXPECTED_OPTIONS.get(key)))

            check(
                "{} {} does not repeat options".format(control_id, parameter["id"]),
                len({o.strip().lower() for o in options}) == len(options),
                str(options))

            check(
                "{} {} has an example that is one of its options".format(
                    control_id, parameter["id"]),
                parameter.get("example") in options,
                "{!r} is not in {!r}".format(parameter.get("example"), options))

        # The real validator: an invented value no longer passes, and each option does.
        cases = []
        labels = []

        for control_id, parameter in selects:
            cases.append({"kind": "value", "parameter": parameter,
                          "value": "cualquier cosa"})
            labels.append(("rejects", control_id, parameter["id"], "cualquier cosa"))

            for option in parameter.get("options") or []:
                cases.append({"kind": "value", "parameter": parameter, "value": option})
                labels.append(("accepts", control_id, parameter["id"], option))

        results = run(runtime, harness, tmp, cases)

        for (mode, control_id, parameter_id, value), got in zip(labels, results):
            if mode == "rejects":
                check(
                    "{} {} rejects a value that is no option".format(
                        control_id, parameter_id),
                    got["valid"] is False and "opciones" in got["reason"],
                    str(got))
            else:
                check(
                    "{} {} accepts its option {!r}".format(control_id, parameter_id, value),
                    got["valid"] is True,
                    str(got))

        print()

        # --- 2. the form offers what the validator accepts ------------------
        # Declaring options without a dropdown would be worse than not declaring them: the field would
        # let you write values the save rejects afterwards.

        print("== dropdown and validator agree ==\n")

        p10 = parameter_of(blocks["mp.info.6"], "P-10")
        p05 = parameter_of(blocks["op.acc.2"], "P-05")
        without_options = dict(p10)
        without_options.pop("options", None)

        form = run(runtime, harness, tmp, [
            {"kind": "select", "parameter": p10, "value": None},
            {"kind": "select", "parameter": p10,
             "value": "Veeam Backup & Replication 12"},
            {"kind": "select", "parameter": p05, "value": "  rbac sobre ad "},
            {"kind": "select", "parameter": without_options, "value": "lo que sea"},
        ])

        empty, inherited, with_case, undeclared = form

        check("the select with options is edited as a dropdown",
              empty["hasOptions"] is True, str(empty))
        check("a block seeded without `options` is still edited as text",
              undeclared["hasOptions"] is False, str(undeclared))
        check("without a value there is no selection nor inherited option",
              empty["selected"] == "" and empty["legacyValue"] == "" and
              not any(o["legacy"] for o in empty["options"]), str(empty))

        # The inherited value that matches nothing is neither deleted nor replaced by the closest: it is
        # shown, marked, and selected.
        check("the non-matching inherited value stays selected and visible",
              inherited["selected"] == "Veeam Backup & Replication 12" and
              inherited["legacyValue"] == "Veeam Backup & Replication 12",
              str(inherited))
        check("the inherited value is offered marked as outside the list",
              any(o["legacy"] and
                  o["value"] == "Veeam Backup & Replication 12" and
                  "fuera de la lista" in o["label"]
                  for o in inherited["options"]), str(inherited["options"]))
        check("and none of the declared options is lost",
              [o["value"] for o in inherited["options"] if not o["legacy"]] ==
              EXPECTED_OPTIONS[("mp.info.6", "P-10")], str(inherited["options"]))

        check("an inherited value differing only in case resolves to its option",
              with_case["selected"] == "RBAC sobre AD" and
              with_case["legacyValue"] == "" and
              not any(o["legacy"] for o in with_case["options"]),
              str(with_case))

        # No option the dropdown offers can be rejected by the engine: the rule that makes declaring
        # options not worsen anything.
        offered = run(runtime, harness, tmp, [
            {"kind": "value", "parameter": p10, "value": o["value"]}
            for o in inherited["options"] if not o["legacy"]
        ])

        check("every option offered by the dropdown is accepted by the validator",
              all(r["valid"] for r in offered), str(offered))

        print()

        # --- 2b. the form draws the dropdown --------------------------------

        print("== the form ==\n")

        drawn = run(runtime, harness, tmp, [
            {"kind": "render", "parameter": p10, "value": None},
            {"kind": "render", "parameter": p10,
             "value": "Veeam Backup & Replication 12"},
            {"kind": "render", "parameter": without_options, "value": "lo que sea"},
            {"kind": "render", "parameter": p10, "value": None,
             "selects": "zimbra-ne"},
            {"kind": "render", "parameter": p10, "value": "zimbra-ne",
             "selects": ""},
            {"kind": "render", "parameter": parameter_of(blocks["op.acc.1"], "P-04"),
             "value": None},
            {"kind": "render", "parameter": parameter_of(blocks["mp.info.6"], "P-01"),
             "value": None},
        ])

        (empty, with_inherited, free_text, picks,
         clears, list_drawn, number) = drawn

        check("a select with options is drawn as a dropdown",
              empty["renderer"] == "SelectParameterRenderer" and
              empty["field"] == "EuiSelect", str(empty))
        check("the dropdown offers the declared options and the empty one",
              [o["value"] for o in empty["options"]] ==
              [""] + EXPECTED_OPTIONS[("mp.info.6", "P-10")],
              str(empty["options"]))
        check("a select without options is still drawn as free text",
              free_text["renderer"] == "TextParameterRenderer" and
              free_text["field"] == "EuiFieldText", str(free_text))

        # The inherited value is neither deleted on opening the form nor replaced.
        check("the inherited value is offered in the dropdown, not deleted",
              with_inherited["value"] == "Veeam Backup & Replication 12" and
              any(o["value"] == "Veeam Backup & Replication 12" and
                  "fuera de la lista" in o["text"]
                  for o in with_inherited["options"]),
              str(with_inherited["options"]))
        check("the field with an inherited value is red with the reason",
              with_inherited["invalid"] and
              any("opciones declaradas" in e for e in with_inherited["error"]),
              str(with_inherited["error"]))
        check("and the help says it is kept until one is chosen",
              "no se borra solo" in with_inherited["help"],
              with_inherited["help"])
        check("opening the form publishes no change",
              with_inherited["published"] == [], str(with_inherited["published"]))

        check("choosing an option publishes it by parameter name",
              picks["published"] == [["herramienta_backup", "zimbra-ne"]],
              str(picks["published"]))
        check("going back to 'not selected' leaves the parameter without value",
              clears["published"] == [["herramienta_backup", None]],
              str(clears["published"]))

        # The dropdown goes ahead of the list and the number in the factory: the other parameters staying
        # where they were is not free.
        check("a list still uses the list renderer",
              list_drawn["renderer"] == "ListParameterRenderer" and
              list_drawn["field"] == "EuiComboBox", str(list_drawn))
        check("a number still uses the numeric renderer",
              number["renderer"] == "NumberParameterRenderer" and
              number["field"] == "EuiFieldNumber", str(number))

        print()

        # --- 3. the `example`s are pasteable values -------------------------

        print("== the sheet examples ==\n")

        cases = []
        labels = []

        for control_id, block in blocks.items():
            for parameter in block["parameters"]:
                example = parameter.get("example")

                check(
                    "{} {} has an example".format(control_id, parameter["id"]),
                    isinstance(example, str) and example.strip() != "",
                    repr(example))

                if not example:
                    continue

                # An example with ' / ' or a misplaced ' | ' is a menu, not a value: the placeholder
                # invites pasting it and the result means nothing.
                key = (control_id, parameter["id"])
                columns = parameter.get("columns") or []
                is_table = parameter["type"] == "table"
                allows_bar = key in LISTS_WITH_FIELDS or is_table

                check(
                    "{} {} does not document a menu in the example".format(
                        control_id, parameter["id"]),
                    " / " not in example and (allows_bar or " | " not in example),
                    repr(example))

                # In a table the example `|` separates DECLARED columns. Separating exactly as many as
                # there are columns is what tells an example from a menu, and it is also each form
                # cell's placeholder: extra or missing fields would shift the suggestions.
                if is_table:
                    fields = [c.strip() for c in example.split("|")]
                    check(
                        "{} {} · the example has one cell per column".format(
                            control_id, parameter["id"]),
                        len(fields) == len(columns) and all(fields),
                        "{} fields for {} columns: {!r}".format(
                            len(fields), len(columns), example))

                # A table without columns cannot be validated per column nor drawn as a grid: it degrades
                # to a list in both places (tolerance for old index blocks), which must not come from the repo.
                check(
                    "{} {} · a table declares columns".format(
                        control_id, parameter["id"]),
                    not is_table or len(columns) > 0,
                    "type=table without columns")

                # A `select` or `multiselect` column without options accepts anything: declaring the type
                # and not the list is the fake validation removed from the `select`s.
                for column in columns:
                    if column["type"] in ("select", "multiselect"):
                        check(
                            "{} {} · column «{}» declares options".format(
                                control_id, parameter["id"], column["label"]),
                            len(column.get("options") or []) > 0,
                            repr(column))

                cases.append({"kind": "value", "parameter": parameter, "value": example})
                labels.append((control_id, parameter["id"], example))

                if parameter["type"] == "list":
                    cases.append({"kind": "list", "value": example})
                    labels.append((control_id, parameter["id"], "LIST"))

        results = run(runtime, harness, tmp, cases)

        for (control_id, parameter_id, example), got in zip(labels, results):
            if example == "LIST":
                check(
                    "{} {} · the example is ONE list entry".format(
                        control_id, parameter_id),
                    len(got["items"]) == 1, str(got["items"]))
            else:
                check(
                    "{} {} · the example is a valid value".format(control_id, parameter_id),
                    got["valid"] is True,
                    "{!r}: {}".format(example, got["reason"]))

        # Every list is classified: a new list forces deciding whether its item has fields, instead of
        # letting a menu slip in.
        lists = {
            (control_id, p["id"])
            for control_id, block in blocks.items()
            for p in block["parameters"]
            if p["type"] == "list"
        }

        check("every list is classified by the shape of its item",
              lists == ATOMIC_ITEM_LISTS | LISTS_WITH_FIELDS,
              str(sorted(lists ^ (ATOMIC_ITEM_LISTS | LISTS_WITH_FIELDS))))

        print()

        # --- 4. the auditor who pastes the examples -------------------------
        # Pasting what the sheet suggests must not bring the control down: the three controls, at all levels.

        print("== pasting all the examples leaves the control configured ==\n")

        cases = []
        labels = []

        for control_id, block in blocks.items():
            values = {
                p["id"]: p.get("example")
                for p in block["parameters"]
            }

            for level in block["applicableLevels"]:
                cases.append({"kind": "control", "control": block,
                              "values": values, "level": level})
                labels.append((control_id, level))

        results = run(runtime, harness, tmp, cases)

        for (control_id, level), got in zip(labels, results):
            check(
                "{} at level {} · pasting the examples leaves the control CONFIGURED".format(
                    control_id, level),
                got["status"] == "CONFIGURED" and got["issues"] == [],
                str(got))

        # And the old menus are still what they were: values that mean nothing.
        results = run(runtime, harness, tmp, [
            {"kind": "value",
             "parameter": parameter_of(blocks[control_id], parameter_id),
             "value": menu}
            for control_id, parameter_id, menu in OLD_MENUS
        ])

        for (control_id, parameter_id, menu), got in zip(OLD_MENUS, results):
            check(
                "{} {} · the menu the sheet documented is invalid".format(
                    control_id, parameter_id),
                got["valid"] is False,
                "{!r} was accepted".format(menu))

        print()

        # --- 4b. the table grid ---------------------------------------------
        # What is tested is the FORM, not the rule: the policy that used to be written over SSH in a .tsv
        # can be declared whole from the screen (add rows, write cells, remove them), and an unconfigured
        # table looks EMPTY AND PENDING, not with an example row someone could take for configured.

        print("== the table grid ==\n")

        acl = parameter_of(blocks["op.acc.2"], "P-08")
        accesses = parameter_of(blocks["op.acc.2"], "P-06")
        authorised = parameter_of(blocks["op.acc.1"], "P-07")

        ACL_ROW = "/srv/datos | 750 | root:ops | u:auditor:r-x"

        grid = run(runtime, harness, tmp, [
            {"kind": "render_table", "parameter": acl, "value": None},
            {"kind": "render_table", "parameter": acl, "value": None,
             "clickAdd": True},
            {"kind": "render_table", "parameter": acl, "value": [""]},
            {"kind": "render_table", "parameter": acl, "value": [""],
             "types": {"field": 0, "text": "/srv/datos"}},
            {"kind": "render_table", "parameter": acl, "value": [ACL_ROW]},
            {"kind": "render_table", "parameter": acl, "value": [ACL_ROW],
             "removeRow": 0},
            {"kind": "render_table", "parameter": acl, "value": ["/srv/datos"]},
            {"kind": "render_table", "parameter": accesses,
             "value": ["ops | /srv/datos | lectura,escritura"]},
            {"kind": "render_table", "parameter": authorised,
             "value": ["jgomez"]},
        ])

        (no_value, after_add, blank_row, after_typing, full_row,
         after_remove, short_row, with_multiselect, inherited_row) = grid

        check("factory · a table with columns is drawn as a grid",
              no_value["renderer"] == "TableParameterRenderer",
              no_value["renderer"])

        # The `example` incident: a suggested value read as a decision taken. An unconfigured table seeds no row.
        check("unconfigured table · ZERO rows, no cell to fill",
              no_value["fields"] == [] and no_value["trashButtons"] == 0,
              str(no_value["fields"]))
        check("unconfigured table · says it is pending, not blank",
              any("Sin filas" in t for t in no_value["texts"]),
              str(no_value["texts"]))
        check("unconfigured table · not drawn red (absence is not an error)",
              no_value["invalid"] is False and no_value["error"] == [],
              str(no_value["error"]))
        check("unconfigured table · the first row can be added",
              no_value["hasAdd"] is True, str(no_value))

        # Adding a row publishes a BLANK row, which `isEmptyParameterValue` still sees as absence: the
        # parameter does not become INVALID by pressing a button.
        check("add row · publishes a blank row",
              after_add["published"] == [["acl_declarada", [""]]],
              str(after_add["published"]))
        check("blank row · one cell per declared column",
              len(blank_row["fields"]) == len(acl["columns"]),
              str([c["label"] for c in blank_row["fields"]]))
        check("blank row · the parameter does NOT turn invalid",
              blank_row["invalid"] is False, str(blank_row["error"]))
        check("blank row · required cells are marked, optional ones not",
              [c["invalid"] for c in blank_row["fields"]]
              == [c["required"] for c in acl["columns"]],
              str([c["invalid"] for c in blank_row["fields"]]))

        # Each cell's placeholder comes from the parameter `example`, cell by cell: the only way the
        # suggestion lands in its column.
        check("blank row · the example suggests column by column",
              [c["placeholder"] for c in blank_row["fields"]]
              == [c.strip() for c in acl["example"].split("|")],
              str([c["placeholder"] for c in blank_row["fields"]]))

        # The row is published with ALL its cells, even empty: positions are the columns, and trimming the
        # right-hand ones would move what is typed next to another column.
        check("typing in a cell · publishes the row with that cell set",
              after_typing["published"]
              == [["acl_declarada",
                   [" | ".join(["/srv/datos", "", "", ""])]]],
              str(after_typing["published"]))

        check("full row · each cell shows its field",
              [c["value"] for c in full_row["fields"]]
              == [c.strip() for c in ACL_ROW.split("|")],
              str([c["value"] for c in full_row["fields"]]))
        check("full row · no cell red",
              not any(c["invalid"] for c in full_row["fields"]),
              str(full_row["fields"]))
        check("full row · the parameter is valid",
              full_row["invalid"] is False, str(full_row["error"]))

        # Removing the last row leaves the parameter UNCONFIGURED, not with a stored zero-row table: they
        # differ for the `inject-control.py` merge, which keeps what has a value.
        check("removing the last row · leaves the parameter unconfigured",
              after_remove["published"] == [["acl_declarada", None]],
              str(after_remove["published"]))

        check("incomplete row · the missing cell is red",
              short_row["fields"][1]["invalid"] is True
              and short_row["fields"][0]["invalid"] is False,
              str([c["invalid"] for c in short_row["fields"]]))
        check("incomplete row · the reason names the row and the column",
              any("fila 1" in e and "Modo" in e for e in short_row["error"]),
              str(short_row["error"]))

        # A closed-vocabulary column offers ONLY that vocabulary (same as the `select`s).
        combo = [c for c in with_multiselect["fields"] if c["eui"] == "EuiComboBox"]
        check("multiselect · the cell offers only the declared vocabulary",
              len(combo) == 1
              and combo[0]["options"] == accesses["columns"][2]["options"],
              str(combo))
        check("multiselect · shows the values the cell already had",
              len(combo) == 1
              and combo[0]["selectedOptions"] == ["lectura", "escritura"],
              str(combo))

        # The inherited value of the authorised-users file was a bare name: visible in its column, not lost.
        check("inherited value · the bare name shows in its column",
              [c["value"] for c in inherited_row["fields"]] == ["jgomez", "", ""],
              str([c["value"] for c in inherited_row["fields"]]))
        check("inherited value · still valid (only User is required)",
              inherited_row["invalid"] is False, str(inherited_row["error"]))

        print()

        # --- 5. the block and the TypeScript say the same -------------------
        # The block is seeded in the index; the TS is what is compiled and fills the default
        # configuration. If they diverge, the screen shows one sheet and the engine judges another.

        print("== seeded block and compiled TypeScript ==\n")

        registry = run(runtime, harness, tmp, [{"kind": "registry"}])[0]
        by_control = {c["controlId"]: c["parameters"] for c in registry["controls"]}

        for control_id, block in blocks.items():
            from_ts = by_control.get(control_id)

            check("{} is in the TypeScript registry".format(control_id),
                  from_ts is not None, str(sorted(by_control)))

            if from_ts is None:
                continue

            from_block = [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "type": p["type"],
                    "required": p["required"],
                    "example": p.get("example"),
                    "options": p.get("options"),
                    # `columns` is compared like `options`: it declares which values are valid.
                    "columns": p.get("columns"),
                }
                for p in block["parameters"]
            ]

            check(
                "{} · the block and the TypeScript declare the same parameters".format(
                    control_id),
                from_block == from_ts,
                "\n    block: {}\n    ts:    {}".format(
                    [p for p in from_block if p not in from_ts],
                    [p for p in from_ts if p not in from_block]))

    print()
    if failures:
        print("{} test(s) failed: {}".format(len(failures), ", ".join(failures)))
        return 1
    print("all tests pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
