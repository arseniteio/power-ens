#!/bin/bash
# power-ens-emit-opacc.sh — emisor de eventos Power ENS para op.acc.1 / op.acc.2
# Escribe ndjson en /var/log/power-ens/<control>.json con bloqueo y rotación.
# Mismo contrato que el emisor de mp.info.6.
#
# Uso:
#   power_ens_emit op.acc.1 account_inventory EV-01 op.acc.1.3 CUMPLE BAJO '"total_cuentas":42'
#   power_ens_emit op.acc.2 world_writable    EV-01 op.acc.2.1 NO_CUMPLE BAJO '"ruta":"/tmp/x","permisos":"777"'

POWER_ENS_LOG_DIR="${POWER_ENS_LOG_DIR:-/var/log/power-ens}"
POWER_ENS_MAX_BYTES="${POWER_ENS_MAX_BYTES:-10485760}"   # 10 MB
POWER_ENS_OP_ACC_1_COLLECTOR="${POWER_ENS_OP_ACC_1_COLLECTOR:-/opt/power-ens/repo/agent/collectors/ens_op_acc1_audit.py}"
POWER_ENS_FLOCK_BIN="${POWER_ENS_FLOCK_BIN:-flock}"

power_ens_emit_raw() (
  umask 027

  local control="${1:-}"
  local input_temporary=""
  local file=""
  local lock_file=""
  local flock_bin="$POWER_ENS_FLOCK_BIN"

  cleanup_raw() {
    [ -z "$input_temporary" ] || rm -f "$input_temporary"
  }

  trap cleanup_raw EXIT HUP INT TERM

  case "$control" in
    "")
      echo "power_ens_emit_raw: falta control" >&2
      return 1
      ;;
    *[!A-Za-z0-9._-]*)
      echo "power_ens_emit_raw: control inválido: $control" >&2
      return 1
      ;;
  esac

  if ! command -v python3 >/dev/null 2>&1; then
    echo "power_ens_emit_raw: python3 no disponible" >&2
    return 1
  fi

  if ! command -v "$flock_bin" >/dev/null 2>&1; then
    echo "power_ens_emit_raw: flock es obligatorio para publicación atómica" >&2
    return 1
  fi

  input_temporary="$(
    mktemp "${TMPDIR:-/tmp}/power-ens-raw-input.XXXXXX"
  )" || {
    echo "power_ens_emit_raw: no se pudo crear temporal" >&2
    return 1
  }

  if ! cat > "$input_temporary"; then
    echo "power_ens_emit_raw: no se pudo recibir NDJSON" >&2
    return 1
  fi

  if [ ! -s "$input_temporary" ]; then
    echo "power_ens_emit_raw: entrada NDJSON vacía" >&2
    return 1
  fi

  if ! PYTHONDONTWRITEBYTECODE=1 \
    python3 - "$input_temporary" "$control" <<'PY_VALIDATE_RAW'
import json
import sys
import uuid
from pathlib import Path

path = Path(sys.argv[1])
control = sys.argv[2]

required = {
    "schema_version",
    "event_id",
    "execution_id",
    "power_ens",
    "event",
    "event_class",
    "mode",
    "synthetic",
    "ts",
    "host",
    "source_system",
    "collector",
    "collector_version",
    "evidence_id",
    "requisito",
}

allowed_op_acc_1_evidences = {
    f"EV-{number:02d}"
    for number in range(1, 9)
}

lines = path.read_text(
    encoding="utf-8"
).splitlines()

if not lines:
    raise SystemExit(
        "NDJSON técnico vacío."
    )

execution_ids = set()
hosts = set()
modes = set()
collectors = set()
collector_versions = set()
schema_versions = set()
event_ids = set()
evidence_ids = set()

for number, line in enumerate(lines, start=1):
    if not line.strip():
        raise SystemExit(
            f"Línea vacía no permitida: {number}"
        )

    try:
        payload = json.loads(line)
    except json.JSONDecodeError as exc:
        raise SystemExit(
            f"JSON inválido en línea {number}: {exc}"
        ) from exc

    if not isinstance(payload, dict):
        raise SystemExit(
            f"La línea {number} no contiene un objeto JSON."
        )

    missing = sorted(required - payload.keys())

    if missing:
        raise SystemExit(
            f"Línea {number}: faltan campos: {missing}"
        )

    if payload["power_ens"] != control:
        raise SystemExit(
            f"Línea {number}: control inesperado."
        )

    if payload["event_class"] != "technical_fact":
        raise SystemExit(
            f"Línea {number}: event_class no neutral."
        )

    if payload["synthetic"] is not False:
        raise SystemExit(
            f"Línea {number}: synthetic debe ser false."
        )

    if "estado" in payload or "nivel" in payload:
        raise SystemExit(
            f"Línea {number}: estado o nivel no permitidos."
        )

    for key in (
        "event",
        "host",
        "source_system",
        "collector",
        "collector_version",
        "schema_version",
        "evidence_id",
        "requisito",
        "mode",
        "ts",
    ):
        if (
            not isinstance(payload[key], str)
            or not payload[key].strip()
        ):
            raise SystemExit(
                f"Línea {number}: {key} inválido."
            )

    try:
        event_uuid = str(
            uuid.UUID(str(payload["event_id"]))
        )

        execution_uuid = str(
            uuid.UUID(str(payload["execution_id"]))
        )
    except ValueError as exc:
        raise SystemExit(
            f"Línea {number}: UUID inválido."
        ) from exc

    if event_uuid in event_ids:
        raise SystemExit(
            f"Línea {number}: event_id duplicado."
        )

    if (
        control == "op.acc.1"
        and payload["evidence_id"]
        not in allowed_op_acc_1_evidences
    ):
        raise SystemExit(
            f"Línea {number}: evidencia op.acc.1 inválida."
        )

    event_ids.add(event_uuid)
    execution_ids.add(execution_uuid)
    hosts.add(payload["host"])
    modes.add(payload["mode"])
    collectors.add(payload["collector"])
    collector_versions.add(
        payload["collector_version"]
    )
    schema_versions.add(
        payload["schema_version"]
    )
    evidence_ids.add(payload["evidence_id"])

if len(execution_ids) != 1:
    raise SystemExit(
        "El lote contiene varios execution_id."
    )

if len(hosts) != 1:
    raise SystemExit(
        "El lote contiene varios hosts."
    )

if len(modes) != 1:
    raise SystemExit(
        "El lote contiene varios modos."
    )

if len(collectors) != 1:
    raise SystemExit(
        "El lote contiene varios recolectores."
    )

if len(collector_versions) != 1:
    raise SystemExit(
        "El lote contiene varias versiones de recolector."
    )

if len(schema_versions) != 1:
    raise SystemExit(
        "El lote contiene varias versiones de esquema."
    )

print(f"RAW_LINES_VALIDATED={len(lines)}", file=sys.stderr)
print(
    "RAW_EXECUTION_ID="
    + next(iter(execution_ids))
, file=sys.stderr)
print(
    "RAW_HOST="
    + next(iter(hosts))
, file=sys.stderr)
print(
    "RAW_EVIDENCES="
    + ",".join(sorted(evidence_ids))
, file=sys.stderr)
PY_VALIDATE_RAW
  then
    echo "power_ens_emit_raw: validación rechazada" >&2
    return 1
  fi

  file="${POWER_ENS_LOG_DIR}/$(echo "$control" | tr '.' '_').json"
  lock_file="${file}.lock"

  case "$POWER_ENS_MAX_BYTES" in
    ""|*[!0-9]*)
      echo "power_ens_emit_raw: POWER_ENS_MAX_BYTES inválido" >&2
      return 1
      ;;
  esac

  if ! mkdir -p "$POWER_ENS_LOG_DIR"; then
    echo "power_ens_emit_raw: no se pudo crear el directorio" >&2
    return 1
  fi

  chmod 750 "$POWER_ENS_LOG_DIR" 2>/dev/null || true

  if [ -L "$file" ]; then
    echo "power_ens_emit_raw: se rechaza destino simbólico" >&2
    return 1
  fi

  if ! exec 200>"$lock_file"; then
    echo "power_ens_emit_raw: no se pudo abrir el bloqueo" >&2
    return 1
  fi

  if ! "$flock_bin" -x 200; then
    echo "power_ens_emit_raw: no se pudo adquirir flock" >&2
    return 1
  fi

  if [ ! -e "$file" ]; then
    if ! : > "$file"; then
      echo "power_ens_emit_raw: no se pudo crear el fichero" >&2
      return 1
    fi
  fi

  local current_size
  local input_size

  current_size="$(
    stat -c%s "$file" 2>/dev/null || echo 0
  )"

  input_size="$(
    stat -c%s "$input_temporary" 2>/dev/null || echo 0
  )"

  if [ "$current_size" -gt 0 ] && \
    [ $((current_size + input_size)) -gt "$POWER_ENS_MAX_BYTES" ]; then
    if ! mv -f "$file" "${file}.1"; then
      echo "power_ens_emit_raw: no se pudo rotar el fichero" >&2
      return 1
    fi

    if ! : > "$file"; then
      echo "power_ens_emit_raw: no se pudo crear el fichero posterior a la rotación" >&2
      return 1
    fi
  fi

  if ! PYTHONDONTWRITEBYTECODE=1 \
    python3 - "$file" "$input_temporary" <<'PY_APPEND'
import os
import sys
from pathlib import Path

destination = Path(sys.argv[1])
source = Path(sys.argv[2])

payload = source.read_bytes()

if not payload:
    raise SystemExit(
        "El lote validado está vacío."
    )

flags = (
    os.O_WRONLY
    | os.O_APPEND
    | os.O_CREAT
)

descriptor = os.open(
    destination,
    flags,
    0o640,
)

written = 0

try:
    while written < len(payload):
        count = os.write(
            descriptor,
            payload[written:],
        )

        if count <= 0:
            raise OSError(
                "La escritura no avanzó."
            )

        written += count

    os.fsync(descriptor)

finally:
    os.close(descriptor)

if written != len(payload):
    raise SystemExit(
        "El append no escribió el lote completo."
    )

print(f"APPEND_BYTES={written}", file=sys.stderr)
PY_APPEND
  then
    echo "power_ens_emit_raw: falló el append serializado" >&2
    return 1
  fi

  chmod 640 "$file" 2>/dev/null || true
  return 0
)
power_ens_collect_op_acc_1() (
  umask 077

  local collector="$POWER_ENS_OP_ACC_1_COLLECTOR"
  local run_temporary=""
  local evidence_temporary=""

  cleanup_collect() {
    [ -z "$evidence_temporary" ] || rm -f "$evidence_temporary"
    [ -z "$run_temporary" ] || rm -f "$run_temporary"
  }

  trap cleanup_collect EXIT HUP INT TERM

  if [ ! -x "$collector" ]; then
    echo "power_ens_collect_op_acc_1: recolector no ejecutable: $collector" >&2
    return 1
  fi

  local argument

  for argument in "$@"; do
    case "$argument" in
      --execution-id|--execution-id=*|--evidence|--evidence=*)
        echo "power_ens_collect_op_acc_1: no se permite proporcionar $argument" >&2
        return 1
        ;;
    esac
  done

  local execution_id

  if [ -r /proc/sys/kernel/random/uuid ]; then
    execution_id="$(cat /proc/sys/kernel/random/uuid)"
  else
    execution_id="$(
      PYTHONDONTWRITEBYTECODE=1 \
      python3 - <<'PY_UUID'
import uuid
print(uuid.uuid4())
PY_UUID
    )"
  fi

  run_temporary="$(
    mktemp "${TMPDIR:-/tmp}/power-ens-op-acc-1-run.XXXXXX"
  )" || {
    echo "power_ens_collect_op_acc_1: no se pudo crear temporal" >&2
    return 1
  }

  local evidence

  for evidence in \
    EV-01 \
    EV-02 \
    EV-03 \
    EV-04 \
    EV-05 \
    EV-06 \
    EV-07 \
    EV-08
  do
    evidence_temporary="$(
      mktemp "${TMPDIR:-/tmp}/power-ens-op-acc-1-${evidence}.XXXXXX"
    )" || {
      echo "power_ens_collect_op_acc_1: no se pudo crear temporal para $evidence" >&2
      return 1
    }

    if ! "$collector" \
      "$@" \
      --evidence "$evidence" \
      --execution-id "$execution_id" \
      > "$evidence_temporary"
    then
      echo "power_ens_collect_op_acc_1: falló $evidence; ejecución descartada" >&2
      return 1
    fi

    if [ ! -s "$evidence_temporary" ]; then
      echo "power_ens_collect_op_acc_1: $evidence no produjo eventos" >&2
      return 1
    fi

    if ! PYTHONDONTWRITEBYTECODE=1 \
      python3 - \
        "$evidence_temporary" \
        "$evidence" \
        "$execution_id" <<'PY_VALIDATE_EVIDENCE'
import json
import sys
import uuid
from pathlib import Path

path = Path(sys.argv[1])
expected_evidence = sys.argv[2]
expected_execution_id = str(
    uuid.UUID(sys.argv[3])
)

lines = path.read_text(
    encoding="utf-8"
).splitlines()

if not lines:
    raise SystemExit(
        f"{expected_evidence} no produjo líneas."
    )

hosts = set()
event_ids = set()

for number, line in enumerate(lines, start=1):
    if not line.strip():
        raise SystemExit(
            f"{expected_evidence}: línea vacía."
        )

    payload = json.loads(line)

    if not isinstance(payload, dict):
        raise SystemExit(
            f"{expected_evidence}: objeto inválido."
        )

    if payload.get("power_ens") != "op.acc.1":
        raise SystemExit(
            f"{expected_evidence}: control incorrecto."
        )

    if payload.get("evidence_id") != expected_evidence:
        raise SystemExit(
            f"{expected_evidence}: evidence_id incorrecto."
        )

    try:
        execution_id = str(
            uuid.UUID(
                str(payload.get("execution_id"))
            )
        )

        event_id = str(
            uuid.UUID(
                str(payload.get("event_id"))
            )
        )
    except ValueError as exc:
        raise SystemExit(
            f"{expected_evidence}: UUID inválido."
        ) from exc

    if execution_id != expected_execution_id:
        raise SystemExit(
            f"{expected_evidence}: execution_id distinto."
        )

    if event_id in event_ids:
        raise SystemExit(
            f"{expected_evidence}: event_id duplicado."
        )

    if payload.get("event_class") != "technical_fact":
        raise SystemExit(
            f"{expected_evidence}: event_class no neutral."
        )

    if payload.get("synthetic") is not False:
        raise SystemExit(
            f"{expected_evidence}: synthetic inválido."
        )

    if "estado" in payload or "nivel" in payload:
        raise SystemExit(
            f"{expected_evidence}: contiene decisión ENS."
        )

    host = payload.get("host")

    if not isinstance(host, str) or not host.strip():
        raise SystemExit(
            f"{expected_evidence}: host inválido."
        )

    hosts.add(host)
    event_ids.add(event_id)

if len(hosts) != 1:
    raise SystemExit(
        f"{expected_evidence}: varios hosts."
    )

print(
    f"EVIDENCE_VALIDATED={expected_evidence}"
, file=sys.stderr)
print(
    f"EVIDENCE_EVENTS={len(lines)}"
, file=sys.stderr)
PY_VALIDATE_EVIDENCE
    then
      echo "power_ens_collect_op_acc_1: validación rechazada para $evidence" >&2
      return 1
    fi

    if ! cat "$evidence_temporary" >> "$run_temporary"; then
      echo "power_ens_collect_op_acc_1: no se pudo acumular $evidence" >&2
      return 1
    fi

    rm -f "$evidence_temporary"
    evidence_temporary=""
  done

  if ! PYTHONDONTWRITEBYTECODE=1 \
    python3 - "$run_temporary" "$execution_id" <<'PY_VALIDATE_RUN'
import json
import sys
import uuid
from collections import Counter
from pathlib import Path

path = Path(sys.argv[1])
expected_execution_id = str(
    uuid.UUID(sys.argv[2])
)

events = [
    json.loads(line)
    for line in path.read_text(
        encoding="utf-8"
    ).splitlines()
    if line.strip()
]

if not events:
    raise SystemExit(
        "La ejecución completa está vacía."
    )

expected_evidences = {
    f"EV-{number:02d}"
    for number in range(1, 9)
}

evidence_counts = Counter(
    event.get("evidence_id")
    for event in events
)

if set(evidence_counts) != expected_evidences:
    raise SystemExit(
        "La ejecución no contiene EV-01 a EV-08."
    )

if any(
    count < 1
    for count in evidence_counts.values()
):
    raise SystemExit(
        "Existe una evidencia sin eventos."
    )

execution_ids = {
    str(
        uuid.UUID(
            str(event.get("execution_id"))
        )
    )
    for event in events
}

if execution_ids != {expected_execution_id}:
    raise SystemExit(
        "La ejecución contiene execution_id distintos."
    )

hosts = {
    event.get("host")
    for event in events
}

if len(hosts) != 1:
    raise SystemExit(
        "La ejecución contiene hosts distintos."
    )

event_ids = [
    str(
        uuid.UUID(
            str(event.get("event_id"))
        )
    )
    for event in events
]

if len(event_ids) != len(set(event_ids)):
    raise SystemExit(
        "La ejecución contiene event_id duplicados."
    )

print(
    f"RUN_EVENTS_VALIDATED={len(events)}"
, file=sys.stderr)
print(
    "RUN_EVIDENCES_VALIDATED="
    + ",".join(sorted(expected_evidences))
, file=sys.stderr)
print(
    "RUN_EXECUTION_ID="
    + expected_execution_id
, file=sys.stderr)
print(
    "RUN_HOST="
    + str(next(iter(hosts)))
, file=sys.stderr)
PY_VALIDATE_RUN
  then
    echo "power_ens_collect_op_acc_1: lote completo inválido" >&2
    return 1
  fi

  if ! power_ens_emit_raw op.acc.1 < "$run_temporary"; then
    echo "power_ens_collect_op_acc_1: no se pudo publicar la ejecución" >&2
    return 1
  fi

  echo \
    "[info] control=op.acc.1 execution_id=$execution_id evidences=8 publication=serialized_append" \
    >&2

  return 0
)

power_ens_emit() {
  local control="$1" event="$2" evidence="$3" requisito="$4"
  local estado="$5" nivel="$6" extra="$7"

  [ -z "$control" ] || [ -z "$event" ] && {
    echo "power_ens_emit: faltan control y/o event" >&2; return 1; }

  local file="${POWER_ENS_LOG_DIR}/$(echo "$control" | tr '.' '_').json"
  local ts host line
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  host="$(hostname)"

  mkdir -p "$POWER_ENS_LOG_DIR"
  chmod 750 "$POWER_ENS_LOG_DIR" 2>/dev/null

  line="{\"power_ens\":\"${control}\",\"event\":\"${event}\",\"ts\":\"${ts}\",\"host\":\"${host}\""
  [ -n "$evidence"  ] && line="${line},\"evidence_id\":\"${evidence}\""
  [ -n "$requisito" ] && line="${line},\"requisito\":\"${requisito}\""
  [ -n "$estado"    ] && line="${line},\"estado\":\"${estado}\""
  [ -n "$nivel"     ] && line="${line},\"nivel\":\"${nivel}\""
  [ -n "$extra"     ] && line="${line},${extra}"
  line="${line}}"

  # Validar JSON antes de escribir (si hay jq o python3)
  if command -v jq >/dev/null 2>&1; then
    echo "$line" | jq -e . >/dev/null 2>&1 || {
      echo "power_ens_emit: JSON inválido, no se emite: $line" >&2; return 1; }
  fi

  # Rotación simple
  if [ -f "$file" ]; then
    local size; size=$(stat -c%s "$file" 2>/dev/null || echo 0)
    [ "$size" -gt "$POWER_ENS_MAX_BYTES" ] && mv "$file" "${file}.1"
  fi

  # Escritura con bloqueo
  if command -v flock >/dev/null 2>&1; then
    ( flock -x 200; echo "$line" >> "$file" ) 200>"${file}.lock"
  else
    echo "$line" >> "$file"
  fi

  chmod 640 "$file" 2>/dev/null
  return 0
}

# Si se ejecuta directamente, conservar el contrato legacy y añadir
# dos puntos de entrada retrocompatibles.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  case "${1:-}" in
    --raw)
      shift
      power_ens_emit_raw "$@"
      ;;
    --collect-op-acc-1)
      shift
      power_ens_collect_op_acc_1 "$@"
      ;;
    *)
      if [ "${1:-}" = "op.acc.1" ]; then
        echo "power-ens-emit-opacc: op.acc.1 exige --raw o --collect-op-acc-1; ruta legacy bloqueada" >&2
        exit 2
      fi

      power_ens_emit "$@"
      ;;
  esac
fi
