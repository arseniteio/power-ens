"""Organisation data (plugin 1.4.0) for the scripts that write `_doc/active` directly.

The items and the view each mapped parameter reads come from their single source, the JSON array of
`common/ens/configuration/organization/organization-data-items.ts`. The rules are those of
`organization-data-views.ts`; `tests/organization-data-scripts.test.ts` runs both on the same cases.

The item value lives in `configuration.organizationData.values.<item>` (absent key: no value, never
null) and is written into every mapped parameter, so the plugin, the engine and a 1.3.0 plugin read it
in the `value` of each parameter.
"""
import json
import os
import re

ITEMS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "common", "ens", "configuration",
                          "organization", "organization-data-items.ts")
MARKER = "ENS_ORGANIZATION_DATA_ITEMS: ENSOrganizationDataItem[] ="
SCALAR_CELL = "valor"
NUMERIC_TYPES = ("number", "duration_hours", "duration_days")


def load_items(path=ITEMS_FILE):
    """The items, or None if the file is not there (script outside the repo)."""
    try:
        with open(path, encoding="utf-8") as f:
            source = f.read()
    except OSError:
        return None
    start = source.index("\n[", source.index(MARKER)) + 1
    end = source.index("\n];", start)
    return json.loads(source[start:end + 2])


def find_link(items, control_id, parameter_id):
    for item in items or []:
        for view in item.get("views", []):
            if view["controlId"] == control_id and view["parameterId"] == parameter_id:
                return item, view
    return None


def get_item(items, item_id):
    return next((item for item in items or [] if item["id"] == item_id), None)


# --- values -----------------------------------------------------------------

def cell_text(value):
    # As JavaScript's String(): true, 365 (not True, 365.0).
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return "" if value is None else str(value)


def cell(value):
    return cell_text(value).strip()


def is_empty(value):
    return value is None or (isinstance(value, str) and not value.strip()) or \
        (isinstance(value, list) and not [x for x in value if cell(x)])


def list_items(value):
    if isinstance(value, list):
        return [cell(x) for x in value if cell(x)]
    if isinstance(value, str):
        return [x.strip() for x in re.split(r"[\n,;]", value) if x.strip()]
    return []


def table_rows(value):
    if isinstance(value, list):
        return [cell_text(x) for x in value]
    if isinstance(value, str):
        return value.split("\n")
    if isinstance(value, (bool, int, float)):
        return [cell_text(value)]
    return []


def cells(row):
    return [c.strip() for c in cell_text(row).split("|")]


def serialize(row_cells):
    trimmed = [re.sub(r"[|\n\r]", " ", cell(c)).strip() for c in row_cells]
    while trimmed and not trimmed[-1]:
        trimmed.pop()
    return " | ".join(trimmed)


def normalize_row(row):
    parts = cells(row)
    while parts and not parts[-1]:
        parts.pop()
    return "|".join(parts)


def shape_of(parameter_type, value=None):
    if parameter_type == "table":
        return "table"
    if parameter_type == "list":
        return "list"
    if parameter_type:
        return "scalar"
    return "list" if isinstance(value, list) else "scalar"


def column_names(item):
    if item["type"] == "table":
        return [c["name"] for c in item.get("columns") or []]
    return [((item.get("columns") or [{}])[0]).get("name") or SCALAR_CELL]


def is_multiselect(item, column):
    return any(c["name"] == column and c.get("type") == "multiselect" for c in item.get("columns") or [])


def options(value):
    return [x.strip() for x in cell(value).split(",") if x.strip()]


def same(left, right):
    return cell(left).lower() == cell(right).lower()


def item_rows(item, value):
    if is_empty(value):
        return []
    names = column_names(item)
    if item["type"] == "table":
        rows = []
        for row in table_rows(value):
            if not row.strip():
                continue
            parts = cells(row)
            rows.append({name: parts[i] if i < len(parts) else "" for i, name in enumerate(names)})
        return rows
    if item["type"] == "list":
        return [{names[0]: x} for x in list_items(value)]
    return [{names[0]: cell(value)}]


def value_from_rows(item, rows):
    names = column_names(item)
    if item["type"] == "table":
        out = [r for r in (serialize([row.get(n, "") for n in names]) for row in rows) if r]
        return out or None
    if item["type"] == "list":
        out = [cell(row.get(names[0])) for row in rows if cell(row.get(names[0]))]
        return out or None
    scalar = cell(rows[0].get(names[0])) if rows else ""
    return scalar or None


def matches(item, row, view):
    for column, expected in (view.get("where") or {}).items():
        if is_multiselect(item, column):
            if not any(same(o, expected) for o in options(row.get(column))):
                return False
        elif not same(row.get(column), expected):
            return False
    return True


def is_identity(view):
    return not view.get("where") and not view.get("columns")


def project(item, view, parameter_type, rows):
    """What the parameter reads from the item rows (None: no value)."""
    columns = view.get("columns") or column_names(item)
    projected = [[cell(row.get(c)) for c in columns] for row in rows if matches(item, row, view)]
    projected = [p for p in projected if any(p)]
    shape = shape_of(parameter_type)
    if shape == "scalar":
        first = projected[0][0] if projected else ""
        if not first:
            return None
        if parameter_type in NUMERIC_TYPES and re.match(r"^-?\d+(\.\d+)?$", first):
            number = float(first)
            return int(number) if number.is_integer() else number
        return first
    entries = [p[0] if shape == "list" and len(p) == 1 else serialize(p) for p in projected]
    entries = [e for e in entries if e]
    if not is_identity(view):
        unique = []
        for e in entries:
            if e not in unique:
                unique.append(e)
        entries = unique
    return entries or None


def view_value(item, view, parameter_type, value):
    return project(item, view, parameter_type, item_rows(item, value))


def view_rows(item, view, parameter_type, value):
    """The parameter value as item rows: its cells under the view columns plus the `where` cells."""
    if is_empty(value):
        return []
    columns = view.get("columns") or column_names(item)
    shape = shape_of(parameter_type, value)
    if shape == "table":
        source = [cells(r) for r in table_rows(value) if r.strip()]
    elif shape == "list":
        source = [[x] if len(columns) == 1 else cells(x) for x in list_items(value)]
    else:
        source = [[cell(value)]]
    rows = []
    for parts in source:
        row = dict(view.get("where") or {})
        for i, column in enumerate(columns):
            row[column] = parts[i] if i < len(parts) else ""
        if len(parts) > len(columns) and any(parts[len(columns):]):
            row[columns[-1]] = " | ".join(parts[len(columns) - 1:])
        rows.append(row)
    return rows


def merge_row(item, rows, row):
    """Adds a row: with `key`, into the row with the same key (existing cells win); otherwise into an identical row."""
    key = item.get("key") or []
    if key and all(cell(row.get(k)) for k in key):
        index = next((i for i, r in enumerate(rows) if all(same(r.get(k), row.get(k)) for k in key)), -1)
    else:
        index = next((i for i, r in enumerate(rows)
                      if sorted(r) == sorted(row) and all(is_multiselect(item, c) or cell(r.get(c)) == cell(row.get(c)) for c in row)), -1)
    if index < 0:
        return rows + [dict(row)]
    merged = dict(rows[index])
    for column, value in row.items():
        if is_multiselect(item, column):
            joined = options(merged.get(column))
            for option in options(value):
                if not any(same(existing, option) for existing in joined):
                    joined.append(option)
            merged[column] = ", ".join(joined)
        elif not cell(merged.get(column)):
            merged[column] = value
    return rows[:index] + [merged] + rows[index + 1:]


def same_value(parameter_type, left, right):
    shape = shape_of(parameter_type)
    if shape == "scalar":
        return cell(left) == cell(right)
    if shape == "table":
        normalize = lambda v: sorted(set(normalize_row(r) for r in table_rows(v) if r.strip()))  # noqa: E731
    else:
        normalize = lambda v: sorted(set(list_items(v)))  # noqa: E731
    return normalize(left) == normalize(right)


# --- the document -------------------------------------------------------------

def stored_value(config, item_id):
    values = ((config.get("organizationData") or {}).get("values") or {})
    value = values.get(item_id)
    return None if is_empty(value) else value


def set_stored_value(config, item_id, value):
    block = config.get("organizationData")
    if not isinstance(block, dict):
        block = {}
    values = dict(block.get("values") or {})
    if is_empty(value):
        values.pop(item_id, None)
    else:
        values[item_id] = value
    block["values"] = values
    config["organizationData"] = block


def find_parameter(config, control_id, parameter_id):
    for control in config.get("controls") or []:
        if control.get("controlId") == control_id:
            for parameter in control.get("parameters") or []:
                if parameter.get("id") == parameter_id:
                    return parameter
    return None


def adopted_value(config, item):
    """(value, sources) the plugin moves to an item without stored value; (None, []) if none or they differ."""
    configured = []
    for view in item.get("views", []):
        parameter = find_parameter(config, view["controlId"], view["parameterId"])
        if parameter is not None and not is_empty(parameter.get("value")):
            configured.append((view, parameter))
    if not configured:
        return None, []
    rows = []
    for view, parameter in configured:
        own = []
        for row in view_rows(item, view, parameter.get("type"), parameter.get("value")):
            own = merge_row(item, own, row)
        if not same_value(parameter.get("type"), project(item, view, parameter.get("type"), own), parameter.get("value")):
            return None, []
        for row in view_rows(item, view, parameter.get("type"), parameter.get("value")):
            rows = merge_row(item, rows, row)
    for view, parameter in configured:
        if not same_value(parameter.get("type"), project(item, view, parameter.get("type"), rows), parameter.get("value")):
            return None, []
    return value_from_rows(item, rows), ["%s %s" % (view["controlId"], view["parameterId"]) for view, _ in configured]


def single_value_problems(config, item, value):
    """A parameter that reads one value and finds several rows of its use: their order would decide."""
    problems = []
    rows = item_rows(item, value)
    for view in item.get("views", []):
        parameter = find_parameter(config, view["controlId"], view["parameterId"])
        if parameter is None or shape_of(parameter.get("type")) != "scalar":
            continue
        columns = view.get("columns") or column_names(item)
        found = [r for r in rows if matches(item, r, view) and any(cell(r.get(c)) for c in columns)]
        if len(found) > 1:
            problems.append("%s %s lee un solo valor: dejar una sola fila con uso «%s» en «%s»" % (
                view["controlId"], view["parameterId"], ", ".join((view.get("where") or {}).values()), item["label"]))
    return problems


def write_through(config, item, value, only_empty=False):
    """Writes the item into every mapped parameter of the document. Returns [(control, parameter, old, new)].

    With `only_empty`, only parameters without value take it: a different value is the plugin's conflict to show.
    """
    written = []
    for view in item.get("views", []):
        parameter = find_parameter(config, view["controlId"], view["parameterId"])
        if parameter is None:
            continue
        old = parameter.get("value")
        if only_empty and not is_empty(old):
            continue
        new = view_value(item, view, parameter.get("type"), value)
        if same_value(parameter.get("type"), new, old) and is_empty(new) == is_empty(old):
            continue
        if new is None:
            parameter.pop("value", None)
        else:
            parameter["value"] = new
        written.append((view["controlId"], view["parameterId"], old, new))
    return written


def assign_view(item, stored, view, parameter_type, new_value):
    """The item value after setting one view: only that view's rows change. None if the item ends empty."""
    if is_identity(view):
        return value_from_rows(item, view_rows(item, view, parameter_type, new_value))
    columns = view.get("columns") or column_names(item)
    where = view.get("where") or {}
    rows = []
    for row in item_rows(item, stored):
        if not matches(item, row, view):
            rows.append(row)
            continue
        multi = [c for c in where if is_multiselect(item, c)]
        if multi:
            # The row keeps its other uses; it goes only if it has none left.
            for column in multi:
                row[column] = ", ".join(o for o in options(row.get(column)) if not same(o, where[column]))
            if all(options(row.get(c)) for c in multi):
                rows.append(row)
        elif item.get("key"):
            # A keyed row stays for the other views; only this view's cells are cleared.
            for column in columns:
                row[column] = ""
            rows.append(row)
    key = item.get("key") or []
    for new_row in view_rows(item, view, parameter_type, new_value):
        target = None
        if key and all(cell(new_row.get(k)) for k in key):
            target = next((r for r in rows if all(same(r.get(k), new_row.get(k)) for k in key)), None)
        if target is not None:
            target.update(new_row)
        else:
            rows.append(new_row)
    return value_from_rows(item, rows)


def validate_shape(config, path="configuration.organizationData"):
    """What would stop the plugin from loading the environment. An absent key is valid; `null` is not."""
    if "organizationData" not in config:
        return []
    block = config["organizationData"]
    if not isinstance(block, dict):
        return ["%s must be an object." % path]
    values = block.get("values")
    if not isinstance(values, dict):
        return ["%s.values must be an object keyed by item id." % path]
    errors = []
    for item_id, value in values.items():
        ok = isinstance(value, (str, bool)) or \
            (isinstance(value, (int, float)) and value == value and value not in (float("inf"), float("-inf"))) or \
            (isinstance(value, list) and all(isinstance(x, str) for x in value))
        if not ok:
            errors.append("%s.values.%s has an invalid value (a string, a number, a boolean or a string array; "
                          "to clear it, remove the key, never null)." % (path, item_id))
    return errors
