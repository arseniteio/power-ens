#!/bin/bash
# ensfacil-emit-opacc.sh — emisor de eventos ENSFácil para op.acc.1 / op.acc.2
# Escribe ndjson en /var/log/ensfacil/<control>.json con bloqueo y rotación.
# Mismo contrato que el emisor de mp.info.6.
#
# Uso:
#   ensfacil_emit op.acc.1 account_inventory EV-01 op.acc.1.3 CUMPLE BAJO '"total_cuentas":42'
#   ensfacil_emit op.acc.2 world_writable    EV-01 op.acc.2.1 NO_CUMPLE BAJO '"ruta":"/tmp/x","permisos":"777"'

ENSFACIL_LOG_DIR="${ENSFACIL_LOG_DIR:-/var/log/ensfacil}"
ENSFACIL_MAX_BYTES="${ENSFACIL_MAX_BYTES:-10485760}"   # 10 MB

ensfacil_emit() {
  local control="$1" event="$2" evidence="$3" requisito="$4"
  local estado="$5" nivel="$6" extra="$7"

  [ -z "$control" ] || [ -z "$event" ] && {
    echo "ensfacil_emit: faltan control y/o event" >&2; return 1; }

  local file="${ENSFACIL_LOG_DIR}/$(echo "$control" | tr '.' '_').json"
  local ts host line
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  host="$(hostname)"

  mkdir -p "$ENSFACIL_LOG_DIR"
  chmod 750 "$ENSFACIL_LOG_DIR" 2>/dev/null

  line="{\"ensfacil\":\"${control}\",\"event\":\"${event}\",\"ts\":\"${ts}\",\"host\":\"${host}\""
  [ -n "$evidence"  ] && line="${line},\"evidence_id\":\"${evidence}\""
  [ -n "$requisito" ] && line="${line},\"requisito\":\"${requisito}\""
  [ -n "$estado"    ] && line="${line},\"estado\":\"${estado}\""
  [ -n "$nivel"     ] && line="${line},\"nivel\":\"${nivel}\""
  [ -n "$extra"     ] && line="${line},${extra}"
  line="${line}}"

  # Validar JSON antes de escribir (si hay jq o python3)
  if command -v jq >/dev/null 2>&1; then
    echo "$line" | jq -e . >/dev/null 2>&1 || {
      echo "ensfacil_emit: JSON inválido, no se emite: $line" >&2; return 1; }
  fi

  # Rotación simple
  if [ -f "$file" ]; then
    local size; size=$(stat -c%s "$file" 2>/dev/null || echo 0)
    [ "$size" -gt "$ENSFACIL_MAX_BYTES" ] && mv "$file" "${file}.1"
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

# Si se ejecuta directamente (no sourced), emitir con los argumentos recibidos
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  ensfacil_emit "$@"
fi
