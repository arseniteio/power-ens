#!/usr/bin/env bash
# Comprueba que agent/rules/ensfacil_mp_info_6_json_rules.xml casa con el
# contrato de hechos de mp.info.6 (cada `event` con su rule ID), que la
# degradación solo dispara con NO_EVALUABLE y que la base anclada no se
# confunde con otro control.
#
#     tests/mp-info-6-rules.test.sh
#
# La parte de wazuh-logtest necesita un manager con el XML cargado: por
# defecto usa un contenedor `wazuh/wazuh-manager:4.14.x` (Docker,
# `--platform linux/amd64` si hace falta emular). Si Docker no está
# disponible, o el manager no arranca, esa parte se salta con un aviso y solo
# corren las comprobaciones estáticas (anclaje, vocabulario prohibido,
# XML bien formado); la comprobación con wazuh-logtest real queda entonces
# para cuando el XML se despliegue en un manager de verdad.
#
# Los `<field>` de `event`/`estado` llevan `type="pcre2"` además del anclaje
# `^…$`: el matcher por defecto de Wazuh (OSMatch/OSRegex) es
# case-INsensible incluso anclado, así que `^backup_run$` sin `pcre2` sigue
# casando con `Backup_Run`. Con `pcre2` el anclaje sí es case-sensible; los
# casos negativos de más abajo lo comprueban.
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
X="$AQUI/../agent/rules/ensfacil_mp_info_6_json_rules.xml"
IMAGEN="${WAZUH_MANAGER_IMAGE:-wazuh/wazuh-manager:4.14.0}"
CONTENEDOR="ens-mp-info-6-rules-test"

fallos=0

echo "=== Estático ==="

if python3 -c 'import xml.dom.minidom,sys; xml.dom.minidom.parseString("<root>"+open(sys.argv[1]).read()+"</root>")' "$X"; then
  echo "OK    XML bien formado"
else
  echo "FALLA XML mal formado"
  fallos=1
fi

if grep -qF '<field name="ensfacil">^mp.info.6$</field>' "$X"; then
  echo "OK    base anclada (^mp.info.6\$)"
else
  echo "FALLA falta el anclaje de la regla base"
  fallos=1
fi

if grep -qiE "CUMPLE|claude|asistente" "$X"; then
  echo "FALLA el fichero menciona CUMPLE/claude/asistente"
  fallos=1
else
  echo "OK    sin CUMPLE/claude/asistente"
fi

echo
echo "=== wazuh-logtest (manager real) ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "AVISO Docker no disponible: se salta wazuh-logtest (correrá contra un manager real más adelante)"
  exit "$fallos"
fi

if ! docker run --rm --platform linux/amd64 -d --name "$CONTENEDOR" "$IMAGEN" >/tmp/mp-info-6-rules-test.cid 2>/tmp/mp-info-6-rules-test.err; then
  echo "AVISO no se pudo arrancar $IMAGEN: se salta wazuh-logtest (correrá contra un manager real más adelante)"
  cat /tmp/mp-info-6-rules-test.err
  exit "$fallos"
fi

limpiar() { docker rm -f "$CONTENEDOR" >/dev/null 2>&1; }
trap limpiar EXIT

# Espera a que wazuh-logtest responda, hasta 60s.
listo=0
for _ in $(seq 1 30); do
  if docker exec "$CONTENEDOR" bash -c 'echo "{}" | /var/ossec/bin/wazuh-logtest' >/dev/null 2>&1; then
    listo=1
    break
  fi
  sleep 2
done
if [ "$listo" -ne 1 ]; then
  echo "AVISO el manager no llegó a arrancar a tiempo: se salta wazuh-logtest (correrá contra un manager real más adelante)"
  exit "$fallos"
fi

docker cp "$X" "$CONTENEDOR:/var/ossec/etc/rules/ensfacil_mp_info_6_json_rules.xml" >/dev/null
docker exec "$CONTENEDOR" /var/ossec/bin/wazuh-control restart >/dev/null 2>&1

id_de() {
  docker exec "$CONTENEDOR" bash -c "echo '$1' | /var/ossec/bin/wazuh-logtest 2>&1" \
    | grep -oE "id: '[0-9]+'" | head -1 | grep -oE '[0-9]+'
}

# Pares "event id", uno por línea: bash 3.2 (macOS sin homebrew) no tiene
# arrays asociativos, así que se evita `declare -A` a propósito.
ESPERADO="
backup_run 106601
backup_schedule 106602
backup_retention 106603
backup_access 106604
backup_storage 106605
restore_test 106606
collector_run 106797
collector_warning 106798
collector_missing 106799
"

while read -r ev esperado; do
  [ -z "$ev" ] && continue
  linea="{\"ensfacil\":\"mp.info.6\",\"event\":\"$ev\",\"ts\":\"2026-09-30T00:00:00Z\"}"
  id=$(id_de "$linea")
  if [ "$id" = "$esperado" ]; then
    echo "OK    $ev -> $id"
  else
    echo "FALLA $ev -> $id (esperado $esperado)"
    fallos=1
  fi
done <<EOF
$ESPERADO
EOF

# evidence_state solo casa con NO_EVALUABLE (106650).
id=$(id_de '{"ensfacil":"mp.info.6","event":"evidence_state","estado":"NO_EVALUABLE"}')
if [ "$id" = "106650" ]; then
  echo "OK    evidence_state/NO_EVALUABLE -> $id"
else
  echo "FALLA evidence_state/NO_EVALUABLE -> $id (esperado 106650)"
  fallos=1
fi

# El recolector no emite veredictos: evidence_state con otro estado no puede
# casar con la regla de degradación.
salida=$(docker exec "$CONTENEDOR" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"evidence_state\",\"estado\":\"CUMPLE\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$salida" | grep -q "id: '106650'"; then
  echo "FALLA evidence_state/CUMPLE no debe casar con la regla de degradación"
  fallos=1
else
  echo "OK    evidence_state/CUMPLE no casa con 106650"
fi

# Negativos del anclaje: un `event` que solo CONTIENE el nombre esperado (una
# superstring, un prefijo o una variante de mayúsculas) no puede casar con la
# regla. Antes del anclaje con `pcre2`, `backup_run_extra`, `x_backup_run` y
# `Backup_Run` disparaban igual que `backup_run`.
salida=$(docker exec "$CONTENEDOR" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"backup_run_extra\",\"ts\":\"2026-09-30T00:00:00Z\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$salida" | grep -q "id: '106601'"; then
  echo "FALLA backup_run_extra no debe casar con 106601 (superstring)"
  fallos=1
else
  echo "OK    backup_run_extra no casa con 106601"
fi

salida=$(docker exec "$CONTENEDOR" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"x_backup_run\",\"ts\":\"2026-09-30T00:00:00Z\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$salida" | grep -q "id: '106601'"; then
  echo "FALLA x_backup_run no debe casar con 106601 (prefijo)"
  fallos=1
else
  echo "OK    x_backup_run no casa con 106601"
fi

salida=$(docker exec "$CONTENEDOR" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"Backup_Run\",\"ts\":\"2026-09-30T00:00:00Z\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$salida" | grep -q "id: '106601'"; then
  echo "FALLA Backup_Run no debe casar con 106601 (mayúsculas: sin pcre2 el anclaje es case-insensible)"
  fallos=1
else
  echo "OK    Backup_Run no casa con 106601"
fi

salida=$(docker exec "$CONTENEDOR" bash -c "echo '{\"ensfacil\":\"mp.info.6\",\"event\":\"evidence_state\",\"estado\":\"NO_EVALUABLE_X\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$salida" | grep -q "id: '106650'"; then
  echo "FALLA evidence_state con estado=NO_EVALUABLE_X no debe casar con 106650 (superstring)"
  fallos=1
else
  echo "OK    evidence_state/NO_EVALUABLE_X no casa con 106650"
fi

# op.exp.1/op.exp.10 no se confunden con mp.info.6: una línea de otro control
# no puede casar con ninguna regla de esta banda.
salida=$(docker exec "$CONTENEDOR" bash -c "echo '{\"ensfacil\":\"op.exp.1\",\"event\":\"backup_run\",\"ts\":\"2026-09-30T00:00:00Z\"}' | /var/ossec/bin/wazuh-logtest 2>&1")
if echo "$salida" | grep -qE "id: '1066[0-9][0-9]'"; then
  echo "FALLA op.exp.1 con event=backup_run no debe casar con una regla de mp.info.6"
  fallos=1
else
  echo "OK    op.exp.1 no se confunde con mp.info.6"
fi

if [ "$fallos" -eq 0 ]; then
  echo
  echo "OK"
fi

exit "$fallos"
