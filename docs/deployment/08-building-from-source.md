# Compilar ENSFácil desde el código fuente
[English](08-building-from-source.en.md)

[[_TOC_]]

## 1. Objetivo

Compila el zip del plugin ENSFácil desde este repositorio, lo valida y ejecuta las pruebas.

Forma recomendada de instalar: una release ([Instalar desde una release](07-installing-from-a-release.md)), compilada por CI desde una etiqueta con sumas SHA-256. La compilación local solo procede en estos casos:

- una versión que todavía no tiene release (una rama o un MR);
- la evaluación de otra versión de Wazuh ([compatibilidad de versiones](03-version-compatibility.md#5-evaluar-una-versión-nueva));
- el desarrollo del plugin.

Hay dos formas de compilar:

| Forma | Requisitos | Apartado |
|---|---|---|
| Con el árbol de OpenSearch Dashboards | Node.js 18.19.0, Yarn Classic 1.22.22 y el árbol preparado | 3 |
| Con la imagen de compilación, como CI | Docker | 4 |

## 2. Qué sale de la compilación

Compilación dentro del código fuente de OpenSearch Dashboards `2.19.5` (el de Wazuh Dashboard 4.14.7). Resultado: `ensfacil-2.19.5.zip`, instalable solo en esa versión exacta.

CI le asigna el nombre de release `ensfacil-<versión>-osd-2.19.5.zip`; el contenido es el mismo.

> [!note]
> No se necesita el código del plugin de Wazuh (`wazuh-dashboard-plugins`).
> ENSFácil no lo modifica ni lo incluye.

## 3. Compilar con el árbol de OpenSearch Dashboards

Rutas de la [guía de instalación](01-installation-from-scratch.md): repositorio en `/opt/ensfacil/repo` (apartado 10.2) y registros en `/opt/ensfacil/artifacts`:

```bash
sudo mkdir -p /opt/ensfacil/artifacts
sudo chown "$USER":root /opt/ensfacil/artifacts
```

### 3.1 Preparar Node.js y Yarn

Instalar Node.js `18.19.0` y Yarn Classic `1.22.22` con nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 18.19.0
nvm use 18.19.0
npm install --global yarn@1.22.22
```

Comprobar las versiones:

```bash
node --version
yarn --version
```

Resultado esperado: `v18.19.0` y `1.22.22`. Si no coinciden, detener el
procedimiento.

> [!note]
> Wazuh Dashboard 4.14.7 incluye su propio Node.js `18.19.0` en
> `/usr/share/wazuh-dashboard/node/bin/node`. Si existe, `config/build-plugin.sh`
> usa ese. Yarn debe estar igualmente en el `PATH`.

### 3.2 Preparar el árbol de OpenSearch Dashboards 2.19.5

Código fuente de Wazuh Dashboard 4.14.7 (OpenSearch Dashboards `2.19.5`):

```bash
sudo mkdir -p /opt/ensfacil/build
sudo chown "$USER":root /opt/ensfacil/build
git clone --branch v4.14.7 --depth 1 https://github.com/wazuh/wazuh-dashboard.git /opt/ensfacil/build
```

Comprobar la versión:

```bash
git -C /opt/ensfacil/build describe --tags --exact-match HEAD
python3 -c 'import json; print(json.load(open("/opt/ensfacil/build/package.json"))["version"])'
```

Resultado esperado: `v4.14.7` y `2.19.5`.

Preparar el árbol:

```bash
cd /opt/ensfacil/build
yarn osd bootstrap
```

Resultado esperado: `bootstrap complete` al final (varios minutos). Los avisos de dependencias que no detienen el proceso no son un fallo.

### 3.3 Compilar el plugin

`config/build-plugin.sh` copia el plugin a `/opt/ensfacil/build/plugins/ensfacil`, instala sus dependencias con el `yarn.lock` del repositorio y compila, sin modificar otros plugins del árbol. Ejecutar como `root`, con `yarn` en el `PATH`:

```bash
YARN_BIN=$(dirname "$(command -v yarn)")
P=$YARN_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

sudo env PATH="$P" bash /opt/ensfacil/repo/config/build-plugin.sh > /opt/ensfacil/artifacts/build.log 2>&1
tail -1 /opt/ensfacil/artifacts/build.log
```

Resultado esperado: `/opt/ensfacil/build/plugins/ensfacil/build/ensfacil-2.19.5.zip`.
Antes, el registro contiene `succ 1 bundles compiled successfully` y
`compressing plugin into [ensfacil-2.19.5.zip]`. La compilación tarda alrededor
de un minuto.

Para otro árbol, se indica como argumento:
`sudo env PATH="$P" bash /opt/ensfacil/repo/config/build-plugin.sh <árbol>`.

> [!warning]
> No redirigir la salida de una compilación como `root` a un fichero de `/tmp` creado por otro usuario (`protected_regular`): la compilación termina al instante con código 1. Usar `/opt/ensfacil/artifacts`.

> [!important]
> `config/build-plugin.sh` borra `/opt/ensfacil/build/plugins/ensfacil` entero
> antes de compilar: el zip anterior solo se conserva si se copia antes a otra
> carpeta.

Continuar en el apartado 5.

## 4. Compilar con la imagen de compilación

Imagen del trabajo `build` de CI: árbol de OpenSearch Dashboards 2.19.5 (Wazuh Dashboard v4.14.7) en `/osd`, Node.js 18.19.0 y Yarn Classic 1.22.22. Solo requiere Docker.

### 4.1 Construir la imagen

Desde la raíz del repositorio:

```bash
docker build -f ci/osd-builder.Dockerfile -t ensfacil-osd-builder:2.19.5 ci/
docker image ls ensfacil-osd-builder:2.19.5
```

Resultado esperado: la imagen `ensfacil-osd-builder:2.19.5`, de unos 7,5 GB.

- Constructor clásico de Docker; no requiere BuildKit.
- Tarda unos 11 minutos con 4 CPU.
- No se sube a ningún registro: se construye en la máquina del runner de CI ([contribuir](../../CONTRIBUTING.md#integración-continua)).

Si cambia `ci/osd-builder.Dockerfile`, la imagen se construye de nuevo.

### 4.2 Compilar como CI

El repositorio se monta en solo lectura en `/src` y se copia en el contenedor; el zip sale por `dist/`, montada en `/dist`. Desde la raíz del repositorio:

```bash
mkdir -p dist
docker run --rm \
  -v "$PWD":/src:ro \
  -v "$PWD/dist":/dist \
  ensfacil-osd-builder:2.19.5 \
  bash -c 'cp -a /src /repo && bash /repo/config/build-plugin.sh /osd \
    && cp /osd/plugins/ensfacil/build/ensfacil-2.19.5.zip /dist/ \
    && chown "$(stat -c %u:%g /dist)" /dist/ensfacil-2.19.5.zip'
ls -l dist/
```

Resultado esperado: en la salida, `succ 1 bundles compiled successfully` y
`/osd/plugins/ensfacil/build/ensfacil-2.19.5.zip`; en `dist/`, el zip, con el
mismo propietario que la carpeta `dist/`. La compilación tarda alrededor de un
minuto.

Asignar al zip el nombre de las releases, con la versión de
`opensearch_dashboards.json`:

```bash
V=$(python3 -c 'import json; print(json.load(open("opensearch_dashboards.json"))["version"])')
mv dist/ensfacil-2.19.5.zip "dist/ensfacil-$V-osd-2.19.5.zip"
ls dist/
```

Resultado esperado: `ensfacil-1.4.0-osd-2.19.5.zip`, con la versión del
repositorio.

Para obtener una carpeta como la de una release, con los dos scripts y sus
sumas, se repite lo que hace el trabajo `build`:

```bash
cp config/deploy-plugin.sh config/create-admin-role.sh dist/
(cd dist && sha256sum "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh > SHA256SUMS \
  && sha256sum -c SHA256SUMS)
```

Resultado esperado: `OK` en los tres ficheros. Esa carpeta se instala como una
release ([guía 07, apartado 8](07-installing-from-a-release.md#8-primera-instalación)).

## 5. Validar el zip

Desde la raíz del repositorio, con `ZIP` apuntando al zip compilado:

```bash
ZIP=/opt/ensfacil/build/plugins/ensfacil/build/ensfacil-2.19.5.zip   # apartado 3
# ZIP=dist/ensfacil-1.4.0-osd-2.19.5.zip                             # apartado 4

unzip -t "$ZIP" | tail -1
bash config/deploy-plugin.sh --solo-id "$ZIP"
unzip -p "$ZIP" "*/target/public/*.js" | grep -c "op.exp.10"
sha256sum "$ZIP"
```

Resultado esperado:

| Comprobación | Resultado esperado |
|---|---|
| `unzip -t` | `No errors detected in compressed data of …` |
| `--solo-id` | `ensfacil` |
| `grep -c` | un número mayor que `0`: el zip contiene el código de los controles |
| `sha256sum` | el hash del zip, que se conserva como referencia |

Para comprobar que el zip contiene un cambio concreto, sustituir `op.exp.10`
por el identificador de un control o un texto que haya cambiado.

> [!warning]
> Si el zip no existe o alguna comprobación falla, no instalarlo.

## 6. Instalar el zip

El zip se instala con el `config/deploy-plugin.sh` del mismo repositorio:

- primera instalación: [guía de instalación, apartado 13.4](01-installation-from-scratch.md#134-instalar-el-plugin-en-wazuh-dashboard),
  y después el rol (apartado 13.5);
- actualización: [guía de actualización, apartado 7](02-updating-an-existing-environment.md#7-desplegar-la-versión-actualizada);
- vuelta atrás: [diagnóstico y rollback, apartado 4](04-troubleshooting-and-rollback.md#4-reinstalar-la-versión-anterior-de-ensfácil).

Si el zip se compiló en otra máquina, se copia al servidor (por ejemplo, a
`/opt/ensfacil/artifacts/`) y se comprueba allí su `sha256sum`.

En Docker, `deploy-plugin.sh` no se usa: el zip compilado, `ensfacil-2.19.5.zip`,
se instala en la imagen del dashboard con la versión de
`opensearch_dashboards.json` en `ENSFACIL_VERSION`
([Wazuh en Docker, apartado 3](06-wazuh-in-docker.md#3-construir-la-imagen-del-dashboard-con-ensfácil)).

## 7. Pasar las pruebas

Requisitos: Python 3, Node.js 18 o superior y las dependencias de `package.json` en `node_modules/` (el motor importa `re2js`); para los scripts, además `bash`, `zip` y `unzip`. `tests/check-consistency.py` busca los runbooks junto a la carpeta del plugin y los reconoce por su remoto `origin`.

### 7.1 Con los runbooks ya clonados

Con los runbooks junto al plugin (como en la
[guía de instalación, apartado 10.3](01-installation-from-scratch.md#103-clonar-los-runbooks-ens)),
basta el bucle del README, desde la raíz del repositorio:

```bash
npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive
python3 tests/check-consistency.py
for p in config/test_*.py; do python3 "$p" >/dev/null 2>&1 && echo "OK   $p" || echo "FAIL $p"; done
for t in tests/*.test.ts; do timeout 180 npx --yes tsx "$t" >/dev/null 2>&1 && echo "OK   $t" || echo "FAIL $t"; done
for s in tests/*.test.sh; do bash "$s" >/dev/null 2>&1 && echo "OK   $s" || echo "FAIL $s"; done
```

Resultado esperado: `Done` al final de la primera orden, `consistency OK` al
final de la segunda y ninguna línea `FAIL`.

Sin Node.js en el equipo, cada suite de TypeScript se ejecuta en Docker:

```bash
docker run --rm -v "$PWD":/w -w /w node:22-alpine \
  sh -c 'npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive && npx --yes tsx tests/plugin-manifest.test.ts'
```

O todas juntas, con `ci/run-tests.sh` en la misma imagen que CI. Se monta en
solo lectura la carpeta que contiene el plugin y los runbooks, y la del plugin en
escritura para `node_modules/`:

```bash
docker run --rm -v "$(dirname "$PWD")":/base:ro -v "$PWD":"/base/$(basename "$PWD")" -w "/base/$(basename "$PWD")" node:22-bookworm \
  bash -c 'apt-get update -qq && apt-get install -y -qq --no-install-recommends zip > /dev/null && npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive && ci/run-tests.sh'
```

Resultado esperado: `OK` en cada suite y, al final, `las <n> suites pasan`.

`tests/mp-info-6-rules.test.sh` prueba las reglas de mp.info.6 con
`wazuh-logtest` en un contenedor `wazuh/wazuh-manager`. Sin Docker, también
dentro de otro contenedor, esa parte se omite con un aviso.

### 7.2 Como CI, en una carpeta limpia

CI clona los runbooks con `ci/clone-runbooks.sh`, instala las dependencias y
ejecuta las pruebas con `ci/run-tests.sh`:

```bash
ci/clone-runbooks.sh <carpeta que contiene el plugin>
npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive
ci/run-tests.sh
```

- `ci/clone-runbooks.sh` obtiene la lista de runbooks de
  `tests/check-consistency.py` y los clona con la disposición del servidor:
  `<carpeta>/op.acc.1`, …, `<carpeta>/zimbra-mta/mp.info.6`.
- Necesita las variables `RUNBOOKS_DEPLOY_USER` y `RUNBOOKS_DEPLOY_TOKEN`, las
  mismas de CI, o `RUNBOOKS_URL=file://…` con copias locales.
- `ci/run-tests.sh` ejecuta lo mismo que el bucle del README, muestra el final
  de la salida de cada suite que falla y sale con error si falla alguna.

> [!warning]
> `ci/clone-runbooks.sh` borra y vuelve a clonar cada carpeta de destino. Usarlo solo en una carpeta exclusiva para las pruebas, con un clon aparte del plugin, nunca en la carpeta de trabajo de los runbooks.
