#!/usr/bin/env bash
# deploy-plugin.sh decide QUÉ plugin retira mirando el zip, y nunca otro.
#   bash tests/deploy-plugin.test.sh
set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fallos=0
zip_de() { mkdir -p "$T/$1/opensearch-dashboards/$2"; echo x > "$T/$1/opensearch-dashboards/$2/package.json"; (cd "$T/$1" && zip -qr "$T/$1.zip" opensearch-dashboards); }
espera() { local r; r="$(bash "$RAIZ/config/deploy-plugin.sh" --solo-id "$2" 2>&1)"; local rc=$?
  if [ "$1" = ERROR ]; then [ $rc -ne 0 ] && echo "  ok   $3" || { echo "  FALLA $3 (rc 0, salió: $r)"; fallos=$((fallos+1)); }
  else [ "$r" = "$1" ] && echo "  ok   $3" || { echo "  FALLA $3 (salió: $r)"; fallos=$((fallos+1)); }; fi; }
zip_de a ensfacil; zip_de b wazuh; zip_de c otro
espera ensfacil "$T/a.zip" "zip de ENSFácil -> ensfacil"
espera ERROR "$T/b.zip" "zip del plugin de Wazuh (wazuh) se rechaza"
espera ERROR "$T/c.zip" "un plugin que no es ENSFácil se rechaza"
# El rechazo dice por qué: el de Wazuh, que va con su paquete; cualquier otro,
# que no es ENSFácil. Y en los dos casos sin tocar nada (código 2).
r="$(bash "$RAIZ/config/deploy-plugin.sh" --solo-id "$T/b.zip" 2>&1)"; rc=$?
[ $rc -eq 2 ] && echo "$r" | grep -q "solo instala ENSFácil" && echo "$r" | grep -q "paquete oficial wazuh-dashboard" && echo "  ok   el zip de Wazuh: mensaje claro" || { echo "  FALLA el zip de Wazuh: mensaje claro (rc $rc: $r)"; fallos=$((fallos+1)); }
r="$(bash "$RAIZ/config/deploy-plugin.sh" --solo-id "$T/c.zip" 2>&1)"; rc=$?
[ $rc -eq 2 ] && echo "$r" | grep -q "no es de ENSFácil (id: 'otro')" && echo "  ok   otro zip: mensaje claro" || { echo "  FALLA otro zip: mensaje claro (rc $rc: $r)"; fallos=$((fallos+1)); }
espera ERROR "$T/no-existe.zip" "sin zip, error"
# Un zip de verdad (con node_modules) lista miles de entradas: si awk corta la
# tubería antes de que unzip acabe, SIGPIPE + pipefail = rc 141 sin mensaje.
mkdir -p "$T/d/opensearch-dashboards/ensfacil/node_modules/paquete"
for i in $(seq 1 3000); do : > "$T/d/opensearch-dashboards/ensfacil/node_modules/paquete/fichero-con-un-nombre-largo-$i.js"; done
(cd "$T/d" && zip -qr "$T/d.zip" opensearch-dashboards)
espera ensfacil "$T/d.zip" "zip grande (miles de entradas) -> ensfacil"

# Los argumentos: exactamente un zip (o `--solo-id <zip>`). Todos estos casos
# salen con el error de uso ANTES de tocar nada. `systemctl` y `sudo` van
# sustituidos por unos que fallan con 99: si el script llegara a ellos, la
# prueba lo vería y no se pararía ningún dashboard de verdad.
mkdir -p "$T/bin"
for c in systemctl sudo; do printf '#!/bin/sh\necho "TOCADO: %s $*" >&2\nexit 99\n' "$c" > "$T/bin/$c"; chmod +x "$T/bin/$c"; done
rechaza() { local d="$1"; shift; local r; r="$(PATH="$T/bin:$PATH" OSD="$T/osd" bash "$RAIZ/config/deploy-plugin.sh" "$@" 2>&1)"; local rc=$?
  [ $rc -eq 1 ] && echo "$r" | grep -q "uso:" && echo "  ok   $d" || { echo "  FALLA $d (rc $rc: $r)"; fallos=$((fallos+1)); }; }
rechaza "sin argumentos" 
rechaza "dos zips" "$T/a.zip" "$T/b.zip"
rechaza "--solo-id sin zip" --solo-id
rechaza "--solo-id con dos zips" --solo-id "$T/a.zip" "$T/b.zip"
rechaza "una opción desconocida" --forzar "$T/a.zip"
rechaza "una opción en lugar del zip" -x
rechaza "un zip que no existe" "$T/no-existe.zip"
# Ruta relativa: se resuelve contra el directorio desde el que se llama.
r="$(cd "$T" && bash "$RAIZ/config/deploy-plugin.sh" --solo-id a.zip 2>&1)"
[ "$r" = ensfacil ] && echo "  ok   zip con ruta relativa" || { echo "  FALLA zip con ruta relativa (salió: $r)"; fallos=$((fallos+1)); }
# El despliegue entero, contra un dashboard de mentira: `systemctl`, `sudo` y
# `curl` sustituidos, y un instalador falso dentro de un $OSD temporal. Así se
# ejecuta de verdad lo que antes solo se buscaba escrito: el orden copia-parada,
# la carpeta de copias, la rotación y la vuelta atrás de cada fallo.
#   entorno <dir> [sin-plugin|cp-falla]  · prepara $OSD y los sustitutos
#   despliega <dir>             · lo despliega; deja la salida y el código
entorno() {
  local E="$1"
  mkdir -p "$E/bin" "$E/osd/bin" "$E/osd/plugins/wazuh"
  [ "${2:-}" = sin-plugin ] || { mkdir -p "$E/osd/plugins/ensfacil"; echo viejo > "$E/osd/plugins/ensfacil/viejo.txt"; }
  echo '{"name": "dashboard", "build": {"number": "100"}}' > "$E/osd/package.json"
  echo active > "$E/estado"
  cat > "$E/bin/systemctl" <<'EOF'
#!/bin/sh
echo "systemctl $* copias=$(ls "$ENSFACIL_BACKUP_DIR/ensfacil" 2>/dev/null | grep -c .)" >> "$FALSO/registro"
case "$1" in
  start) [ ! -f "$FALSO/falla-start" ] ;;
  is-active) cat "$FALSO/estado"; [ "$(cat "$FALSO/estado")" = active ] ;;
  *) exit 0 ;;
esac
EOF
  if [ "${2:-}" = no-legible ]; then
    printf '#!/bin/sh\n[ "$1" = -u ] && shift 2\n[ "$1" = test ] && exit 1\nexec "$@"\n' > "$E/bin/sudo"
  else
    printf '#!/bin/sh\n[ "$1" = -u ] && shift 2\nexec "$@"\n' > "$E/bin/sudo"
  fi
  printf '#!/bin/sh\nexit 0\n' > "$E/bin/curl"
  [ "${2:-}" = cp-falla ] && printf '#!/bin/sh\ncase "$1" in */package.json) exit 1 ;; esac\nexec /bin/cp "$@"\n' > "$E/bin/cp"
  cat > "$E/osd/bin/opensearch-dashboards-plugin" <<'EOF'
#!/bin/sh
OSD="$(cd "$(dirname "$0")/.." && pwd)"
echo "plugin $*" >> "$FALSO/registro"
case "$1" in
  remove) rm -rf "$OSD/plugins/$2" ;;
  install)
    [ -f "$FALSO/falla-install" ] && exit 1
    rm -rf "$FALSO/zip" && mkdir -p "$FALSO/zip" && unzip -q "${2#file://}" -d "$FALSO/zip" \
      && mv "$FALSO/zip/opensearch-dashboards/ensfacil" "$OSD/plugins/ensfacil" ;;
esac
EOF
  chmod +x "$E/bin/"* "$E/osd/bin/opensearch-dashboards-plugin"
}
despliega() {
  local E="$1"
  mkdir -p "$E/tmp"
  (cd "$E" && PATH="$E/bin:$PATH" OSD="$E/osd" ENSFACIL_BACKUP_DIR="${COPIAS:-$E/copias}" FALSO="$E" TMPDIR="$E/tmp" \
     bash "$RAIZ/config/deploy-plugin.sh" "$T/a.zip" > "$E/salida" 2>&1)
  echo $? > "$E/rc"
}
caso() { if eval "$2"; then echo "  ok   $1"; else echo "  FALLA $1"; sed 's/^/        | /' "$E/salida"; fallos=$((fallos+1)); fi; }
# Las copias van a <ENSFACIL_BACKUP_DIR>/ensfacil, una subcarpeta propia.
copias_de() { find "$E/copias/ensfacil" -maxdepth 1 -name "plugins-$1-*.tgz" 2>/dev/null | sort; }
nueva_copia() { copias_de ensfacil | grep -v "20200101_" | tail -1; }
viejas() { mkdir -p "$E/copias/ensfacil"; for n in 1 2 3 4; do : > "$E/copias/ensfacil/plugins-ensfacil-20200101_00000$n.tgz"; done; }
modo() { ls -ld "$1" | cut -c1-10; }

# Éxito: la copia se hace ANTES de parar, va a su subcarpeta (que crea de 0700)
# y guarda el plugin anterior; el nuevo queda instalado y build.number sube.
E="$T/exito"; entorno "$E"; despliega "$E"
caso "despliegue completo: código 0" '[ "$(cat "$E/rc")" = 0 ]'
caso "la copia existe antes de parar el dashboard" 'grep -q "^systemctl stop wazuh-dashboard copias=1$" "$E/registro"'
caso "la copia va a ENSFACIL_BACKUP_DIR/ensfacil, no junto al zip" '[ "$(copias_de ensfacil | wc -l | tr -d " ")" = 1 ] && [ -z "$(ls "$T" | grep "^plugins-")" ]'
caso "la subcarpeta de copias, que crea él, es 0700" '[ "$(modo "$E/copias/ensfacil")" = drwx------ ]'
caso "la copia guarda el plugin anterior" 'tar -tzf "$(copias_de ensfacil)" | grep -q "^plugins/ensfacil/viejo.txt$"'
caso "el plugin nuevo queda instalado, el viejo no" '[ -f "$E/osd/plugins/ensfacil/package.json" ] && [ ! -e "$E/osd/plugins/ensfacil/viejo.txt" ]'
caso "el instalador recibe file:// con la copia legible, no el zip original" 'grep -q "^plugin install file://$E/tmp/ensfacil-deploy\.[A-Za-z0-9]*/ensfacil\.zip$" "$E/registro"'
caso "la copia temporal del zip se borra al terminar" '[ -z "$(ls "$E/tmp")" ]'
caso "build.number sube" 'python3 -c "import json,sys; sys.exit(json.load(open(\"$E/osd/package.json\"))[\"build\"][\"number\"] != \"101\")"'
caso "el plugin de Wazuh no se toca" '[ -d "$E/osd/plugins/wazuh" ] && ! grep -q "remove wazuh" "$E/registro"'

# Rotación, tras un despliegue que termina bien: solo las 3 últimas de cada
# plugin, sin tocar las de otro id. La subcarpeta ya existía (0750): se usa
# como está, sin cambiarle los permisos.
E="$T/rotacion"; entorno "$E"; viejas; chmod 0750 "$E/copias/ensfacil"
: > "$E/copias/ensfacil/plugins-otro-20200101_000001.tgz"
despliega "$E"
caso "rotación: quedan 3 copias de ensfacil" '[ "$(copias_de ensfacil | wc -l | tr -d " ")" = 3 ]'
caso "rotación: son la nueva y las dos más recientes" '[ -f "$E/copias/ensfacil/plugins-ensfacil-20200101_000004.tgz" ] && [ -f "$E/copias/ensfacil/plugins-ensfacil-20200101_000003.tgz" ] && [ ! -e "$E/copias/ensfacil/plugins-ensfacil-20200101_000002.tgz" ] && [ -n "$(nueva_copia)" ]'
caso "rotación: las copias de otro plugin no se tocan" '[ -f "$E/copias/ensfacil/plugins-otro-20200101_000001.tgz" ]'
caso "una subcarpeta de copias que ya existía conserva sus permisos" '[ "$(modo "$E/copias/ensfacil")" = drwxr-x--- ]'

# ENSFACIL_BACKUP_DIR en una carpeta compartida (1777, como /tmp): no se le
# cambia nada; las copias van a su propia subcarpeta, que sí nace 0700.
E="$T/compartida"; entorno "$E"; mkdir -p "$E/comun"; chmod 1777 "$E/comun"
COPIAS="$E/comun" despliega "$E"
caso "carpeta compartida (1777): despliegue completo" '[ "$(cat "$E/rc")" = 0 ]'
caso "carpeta compartida (1777): conserva su modo" '[ "$(modo "$E/comun")" = drwxrwxrwt ]'
caso "carpeta compartida (1777): la copia va a su subcarpeta 0700" '[ "$(modo "$E/comun/ensfacil")" = drwx------ ] && [ -n "$(find "$E/comun/ensfacil" -name "plugins-ensfacil-*.tgz")" ]'

# Instalación fallida: código 5 y la vuelta atrás, que funciona. Y sin rotar:
# un despliegue que falla no empuja fuera las copias buenas de antes.
E="$T/instala"; entorno "$E"; viejas; : > "$E/falla-install"; despliega "$E"
caso "instalación fallida: código 5" '[ "$(cat "$E/rc")" = 5 ]'
caso "instalación fallida: dice cómo volver" 'grep -q "LA INSTALACIÓN HA FALLADO" "$E/salida" && grep -q "sudo tar -xzf $E/copias/ensfacil/plugins-ensfacil-.*\.tgz -C $E/osd" "$E/salida" && grep -q "sudo systemctl start wazuh-dashboard" "$E/salida"'
caso "instalación fallida: la copia devuelve el plugin anterior" 'tar -xzf "$(nueva_copia)" -C "$E/osd" && [ -f "$E/osd/plugins/ensfacil/viejo.txt" ]'
caso "instalación fallida: no se rota (las 4 viejas y la nueva)" '[ "$(copias_de ensfacil | wc -l | tr -d " ")" = 5 ]'

# Cualquier otro paso con el dashboard parado: código 7 y la vuelta atrás.
E="$T/python"; entorno "$E"; echo '{"name": "dashboard"}' > "$E/osd/package.json"; despliega "$E"
caso "build.number imposible (python3 falla): código 7" '[ "$(cat "$E/rc")" = 7 ]'
caso "python3 falla: dice el paso y cómo volver, package.json incluido" 'grep -q "HA FALLADO EL PASO «5/6" "$E/salida" && grep -q "sudo cp -a $E/osd/package.json.antes-.* $E/osd/package.json" "$E/salida" && grep -q "sudo tar -xzf" "$E/salida" && grep -q "sudo systemctl start wazuh-dashboard" "$E/salida"'
# Si la copia de package.json no llega a hacerse, la vuelta atrás no la nombra.
E="$T/cp"; entorno "$E" cp-falla; despliega "$E"
caso "la copia de package.json falla: código 7" '[ "$(cat "$E/rc")" = 7 ] && grep -q "HA FALLADO EL PASO «5/6" "$E/salida"'
caso "la copia de package.json falla: la vuelta atrás no nombra una copia que no existe" '! grep -q "package.json.antes" "$E/salida" && grep -q "sudo tar -xzf" "$E/salida" && grep -q "sudo systemctl start wazuh-dashboard" "$E/salida"'
E="$T/arranque"; entorno "$E"; : > "$E/falla-start"; despliega "$E"
caso "systemctl start falla: código 7" '[ "$(cat "$E/rc")" = 7 ]'
caso "systemctl start falla: dice el paso y cómo volver" 'grep -q "HA FALLADO EL PASO «6/6" "$E/salida" && grep -q "sudo tar -xzf" "$E/salida" && grep -q "sudo systemctl start wazuh-dashboard" "$E/salida"'

# El dashboard no queda activo al final: código 6, la vuelta atrás y sin rotar.
E="$T/inactivo"; entorno "$E"; viejas; echo failed > "$E/estado"; despliega "$E"
caso "dashboard no activo al final: código 6" '[ "$(cat "$E/rc")" = 6 ]'
caso "dashboard no activo: dice cómo volver" 'grep -q "EL DASHBOARD NO ESTÁ ACTIVO (failed)" "$E/salida" && grep -q "sudo tar -xzf" "$E/salida"'
caso "dashboard no activo: no se rota" '[ "$(copias_de ensfacil | wc -l | tr -d " ")" = 5 ]'

# Sin poder guardar la copia no se para nada: código 3 y todo como estaba.
E="$T/sincopia"; entorno "$E"; : > "$E/fichero"; COPIAS="$E/fichero/copias" despliega "$E"
caso "copia imposible: código 3" '[ "$(cat "$E/rc")" = 3 ]'
caso "copia imposible: el dashboard no se para y el plugin sigue" '! grep -q "systemctl stop" "$E/registro" 2>/dev/null && [ -f "$E/osd/plugins/ensfacil/viejo.txt" ] && grep -q "no se ha tocado nada" "$E/salida"'

# Sin un ensfacil anterior no hay nada que guardar, y se instala igual.
E="$T/nuevo"; entorno "$E" sin-plugin; despliega "$E"
caso "sin plugin anterior: código 0 y sin copia" '[ "$(cat "$E/rc")" = 0 ] && [ -z "$(copias_de ensfacil)" ] && grep -q "nada que guardar" "$E/salida"'

# Un zip que el usuario del dashboard no puede leer: se detecta ANTES de parar
# el dashboard (código 4) y no se toca nada.
E="$T/nolegible"; entorno "$E" no-legible; despliega "$E"
caso "zip no legible para el dashboard: código 4 y sin parar nada" '[ "$(cat "$E/rc")" = 4 ] && ! grep -q "^systemctl" "$E/registro" 2>/dev/null && grep -q "no se ha tocado nada" "$E/salida" && [ -f "$E/osd/plugins/ensfacil/viejo.txt" ]'
caso "zip no legible: la copia temporal se borra" '[ -z "$(ls "$E/tmp")" ]'

[ $fallos -eq 0 ] && echo "TODO OK" || { echo "$fallos FALLOS"; exit 1; }
