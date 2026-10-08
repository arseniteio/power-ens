# Compilar ENSFácil desde el código fuente
[English](08-building-from-source.en.md)

[[_TOC_]]

## 1. Objetivo

Esta guía compila el zip del plugin ENSFácil a partir de este repositorio, lo
valida y pasa las pruebas.

Para instalar, la forma recomendada es una release
([Instalar desde una release](07-installing-from-a-release.md)): la compila
CI desde una etiqueta y publica sus sumas SHA-256. Compila tú cuando:

- necesitas una versión que todavía no tiene release (una rama o un MR);
- evalúas otra versión de Wazuh ([compatibilidad de versiones](03-version-compatibility.md#5-evaluar-una-versión-nueva));
- desarrollas el plugin.

Hay dos formas de compilar:

| Forma | Qué necesita | Apartado |
|---|---|---|
| Con el árbol de OpenSearch Dashboards | Node.js 18.19.0, Yarn Classic 1.22.22 y el árbol preparado | 3 |
| Con la imagen de compilación, como CI | Docker | 4 |

## 2. Qué sale de la compilación

El plugin se compila dentro del código fuente de OpenSearch Dashboards `2.19.5`,
la versión que lleva Wazuh Dashboard 4.14.7. El resultado es el fichero
`ensfacil-2.19.5.zip`. Solo se instala en esa versión exacta de OpenSearch
Dashboards.

CI le cambia el nombre a `ensfacil-<versión>-osd-2.19.5.zip`, el de las
releases. El contenido es el mismo: `deploy-plugin.sh` reconoce el plugin por
lo que lleva dentro, no por el nombre del fichero.

> [!note]
> No hace falta el código del plugin de Wazuh (`wazuh-dashboard-plugins`).
> ENSFácil no lo modifica ni lo incluye.

## 3. Compilar con el árbol de OpenSearch Dashboards

Esta forma usa las rutas de la [guía de instalación](01-installation-from-scratch.md):
el repositorio en `/opt/ensfacil/repo` (apartado 10.2) y los registros en
`/opt/ensfacil/artifacts`:

```bash
sudo mkdir -p /opt/ensfacil/artifacts
sudo chown "$USER":root /opt/ensfacil/artifacts
```

### 3.1 Preparar Node.js y Yarn

Instala Node.js `18.19.0` y Yarn Classic `1.22.22` con nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 18.19.0
nvm use 18.19.0
npm install --global yarn@1.22.22
```

Comprueba las versiones:

```bash
node --version
yarn --version
```

Qué tiene que salir: `v18.19.0` y `1.22.22`. Si no coinciden, no sigas.

> [!note]
> Wazuh Dashboard 4.14.7 trae su propio Node.js `18.19.0` en
> `/usr/share/wazuh-dashboard/node/bin/node`. Si existe, `config/build-plugin.sh`
> usa ese. Yarn tiene que estar igualmente en el `PATH`.

### 3.2 Preparar el árbol de OpenSearch Dashboards 2.19.5

Se usa el código fuente de Wazuh Dashboard 4.14.7, que es OpenSearch Dashboards
`2.19.5`:

```bash
sudo mkdir -p /opt/ensfacil/build
sudo chown "$USER":root /opt/ensfacil/build
git clone --branch v4.14.7 --depth 1 https://github.com/wazuh/wazuh-dashboard.git /opt/ensfacil/build
```

Comprueba la versión:

```bash
git -C /opt/ensfacil/build describe --tags --exact-match HEAD
python3 -c 'import json; print(json.load(open("/opt/ensfacil/build/package.json"))["version"])'
```

Qué tiene que salir: `v4.14.7` y `2.19.5`.

Prepara el árbol:

```bash
cd /opt/ensfacil/build
yarn osd bootstrap
```

Qué tiene que salir: `bootstrap complete` al final. Tarda varios minutos. Los
avisos de dependencias que no detienen el proceso no son un fallo.

### 3.3 Compilar el plugin

`config/build-plugin.sh` copia el plugin a `/opt/ensfacil/build/plugins/ensfacil`,
instala sus dependencias con el `yarn.lock` del repositorio y compila. No toca
ningún otro plugin del árbol. Se ejecuta como `root`, con `yarn` en el `PATH`:

```bash
YARN_BIN=$(dirname "$(command -v yarn)")
P=$YARN_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

sudo env PATH="$P" bash /opt/ensfacil/repo/config/build-plugin.sh > /opt/ensfacil/artifacts/build.log 2>&1
tail -1 /opt/ensfacil/artifacts/build.log
```

Qué tiene que salir: `/opt/ensfacil/build/plugins/ensfacil/build/ensfacil-2.19.5.zip`.
En el registro aparecen antes `succ 1 bundles compiled successfully` y
`compressing plugin into [ensfacil-2.19.5.zip]`. Tarda alrededor de un minuto.

Para otro árbol, pásalo como argumento:
`sudo env PATH="$P" bash /opt/ensfacil/repo/config/build-plugin.sh <árbol>`.

> [!warning]
> No redirijas la salida de una compilación como `root` a un fichero de `/tmp`
> creado por otro usuario: con la protección `protected_regular` del kernel,
> `root` no puede escribir en él y la compilación termina al instante con código
> 1 sin mensaje útil. Usa `/opt/ensfacil/artifacts`.

> [!important]
> `config/build-plugin.sh` borra `/opt/ensfacil/build/plugins/ensfacil` entero
> antes de compilar: el zip anterior solo se conserva si lo copias antes a otra
> carpeta.

Sigue en el apartado 5.

## 4. Compilar con la imagen de compilación

La imagen `ensfacil-osd-builder:2.19.5` es la que usa el trabajo `build` de CI.
Lleva el árbol de OpenSearch Dashboards 2.19.5 (Wazuh Dashboard v4.14.7) ya
preparado en `/osd`, con Node.js 18.19.0 y Yarn Classic 1.22.22. Solo necesitas
Docker.

### 4.1 Construir la imagen

Desde la raíz del repositorio:

```bash
docker build -f ci/osd-builder.Dockerfile -t ensfacil-osd-builder:2.19.5 ci/
docker image ls ensfacil-osd-builder:2.19.5
```

Qué tiene que salir: la imagen `ensfacil-osd-builder:2.19.5`, de unos 7,5 GB.

- Funciona con el constructor clásico de Docker: no necesita BuildKit.
- Tarda unos 11 minutos con 4 CPU.
- No se sube a ningún registro. El runner de CI la usa desde su Docker local, así
  que se construye en la máquina del runner
  ([contribuir](../../CONTRIBUTING.md#integración-continua)).

Si cambia `ci/osd-builder.Dockerfile`, vuelve a construirla.

### 4.2 Compilar como CI

El repositorio se monta de solo lectura en `/src` y se copia dentro del
contenedor: la compilación no escribe en tu copia. El zip sale por la carpeta
`dist/`, montada en `/dist`. Desde la raíz del repositorio:

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

Qué tiene que salir: en la salida, `succ 1 bundles compiled successfully` y
`/osd/plugins/ensfacil/build/ensfacil-2.19.5.zip`; en `dist/`, el zip, a tu
nombre. Tarda alrededor de un minuto.

Ponle el nombre de las releases, con la versión de `opensearch_dashboards.json`:

```bash
V=$(python3 -c 'import json; print(json.load(open("opensearch_dashboards.json"))["version"])')
mv dist/ensfacil-2.19.5.zip "dist/ensfacil-$V-osd-2.19.5.zip"
ls dist/
```

Qué tiene que salir: `ensfacil-1.0.0-osd-2.19.5.zip` (con la versión del
repositorio).

Para tener una carpeta como la de una release, con los dos scripts y sus sumas,
haz lo mismo que el trabajo `build`:

```bash
cp config/deploy-plugin.sh config/create-admin-role.sh dist/
(cd dist && sha256sum "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh > SHA256SUMS \
  && sha256sum -c SHA256SUMS)
```

Qué tiene que salir: `OK` en los tres ficheros. Esa carpeta se instala como una
release ([guía 07, apartado 8](07-installing-from-a-release.md#8-primera-instalación)).

## 5. Validar el zip

Desde la raíz del repositorio, con `ZIP` apuntando al zip que acabas de
compilar:

```bash
ZIP=/opt/ensfacil/build/plugins/ensfacil/build/ensfacil-2.19.5.zip   # apartado 3
# ZIP=dist/ensfacil-1.0.0-osd-2.19.5.zip                             # apartado 4

unzip -t "$ZIP" | tail -1
bash config/deploy-plugin.sh --solo-id "$ZIP"
unzip -p "$ZIP" "*/target/public/*.js" | grep -c "op.exp.10"
sha256sum "$ZIP"
```

Qué tiene que salir:

| Comprobación | Resultado esperado |
|---|---|
| `unzip -t` | `No errors detected in compressed data of …` |
| `--solo-id` | `ensfacil` |
| `grep -c` | un número mayor que `0` (el zip lleva el código de los controles) |
| `sha256sum` | el hash del zip; consérvalo como referencia |

Para comprobar que el zip lleva un cambio concreto, cambia `op.exp.10` por el
identificador de un control o un texto que haya cambiado.

> [!warning]
> Si el zip no existe o alguna comprobación falla, no lo instales.

## 6. Instalar el zip

El zip se instala con el `config/deploy-plugin.sh` del mismo repositorio:

- primera instalación: [guía de instalación, apartado 13.4](01-installation-from-scratch.md#134-instalar-el-plugin-en-wazuh-dashboard),
  y después el rol (apartado 13.5);
- actualización: [guía de actualización, apartado 7](02-updating-an-existing-environment.md#7-desplegar-la-versión-actualizada);
- vuelta atrás: [diagnóstico y rollback, apartado 4](04-troubleshooting-and-rollback.md#4-reinstalar-la-versión-anterior-de-ensfácil).

Si has compilado en otra máquina, copia el zip al servidor (por ejemplo, a
`/opt/ensfacil/artifacts/`) y comprueba allí su `sha256sum`.

## 7. Pasar las pruebas

Las pruebas necesitan Python 3 y Node.js 18 o superior. Las de los scripts
necesitan además `bash`, `zip` y `unzip`.
`tests/check-consistency.py` compara el plugin con los runbooks: los busca junto
a la carpeta del plugin y los reconoce por su remoto `origin`, se llamen como se
llamen.

### 7.1 Con los runbooks ya clonados

Si tienes los runbooks junto al plugin (como en la
[guía de instalación, apartado 10.3](01-installation-from-scratch.md#103-clonar-los-runbooks-ens)),
basta el bucle del README, desde la raíz del repositorio:

```bash
python3 tests/check-consistency.py
for t in tests/*.test.ts; do timeout 180 npx --yes tsx "$t" >/dev/null 2>&1 && echo "OK   $t" || echo "FAIL $t"; done
for s in tests/*.test.sh; do bash "$s" >/dev/null 2>&1 && echo "OK   $s" || echo "FAIL $s"; done
```

Qué tiene que salir: `coherencia OK` al final de la primera orden y ninguna línea
`FAIL`.

Sin Node.js en tu equipo, cada suite de TypeScript corre en Docker:

```bash
docker run --rm -v "$PWD":/w -w /w node:22-alpine npx --yes tsx tests/plugin-manifest.test.ts
```

O todo junto, con `ci/run-tests.sh` en la misma imagen que CI. Se monta de solo
lectura la carpeta que contiene el plugin y los runbooks:

```bash
docker run --rm -v "$(dirname "$PWD")":/base:ro -w "/base/$(basename "$PWD")" node:22-bookworm \
  bash -c 'apt-get update -qq && apt-get install -y -qq --no-install-recommends zip > /dev/null && ci/run-tests.sh'
```

Qué tiene que salir: `OK` en cada suite y, al final, `las <n> suites pasan`.

`tests/mp-info-6-rules.test.sh` prueba las reglas de mp.info.6 con
`wazuh-logtest` en un contenedor `wazuh/wazuh-manager`. Sin Docker (también
dentro de otro contenedor), salta esa parte con un aviso.

### 7.2 Como CI, en una carpeta limpia

CI clona los runbooks con `ci/clone-runbooks.sh` y pasa las pruebas con
`ci/run-tests.sh`:

```bash
ci/clone-runbooks.sh <carpeta que contiene el plugin>
ci/run-tests.sh
```

- `ci/clone-runbooks.sh` saca la lista de runbooks de `tests/check-consistency.py`
  y los clona con la disposición del servidor: `<carpeta>/op.acc.1`, …,
  `<carpeta>/zimbra-mta/mp.info.6`.
- Necesita las variables `RUNBOOKS_DEPLOY_USER` y `RUNBOOKS_DEPLOY_TOKEN`, las
  mismas de CI, o `RUNBOOKS_URL=file://…` con copias locales.
- `ci/run-tests.sh` corre lo mismo que el bucle del README, enseña el final de la
  salida de cada suite que falla y sale con error si falla alguna.

> [!warning]
> `ci/clone-runbooks.sh` borra y vuelve a clonar cada carpeta de destino. Úsalo
> en una carpeta solo para las pruebas, con un clon aparte del plugin. Nunca en la
> carpeta donde tienes tus copias de trabajo de los runbooks.
