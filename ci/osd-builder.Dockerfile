# Imagen de compilación de ENSFácil: el árbol de OpenSearch Dashboards 2.19.5
# (wazuh-dashboard v4.14.7) preparado con `yarn osd bootstrap` en /osd, como en
# la guía 01, §13.1-13.2. La usa el trabajo `build` de .gitlab-ci.yml.
#
# Se construye EN el servidor del runner, desde la raíz del repositorio:
#
#   docker build -f ci/osd-builder.Dockerfile -t ensfacil-osd-builder:2.19.5 ci/
#
# No se sube nunca a un registro (pesa varios GB): el runner la usa desde el
# Docker local (pull_policy if-not-present).
FROM node:18.19.0-bookworm

ARG WAZUH_DASHBOARD_REF=v4.14.7
ARG YARN_VERSION=1.22.22

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 zip unzip \
 && rm -rf /var/lib/apt/lists/*

# La imagen de node trae su propio yarn 1.x; la guía fija 1.22.22.
RUN npm install --global --force "yarn@${YARN_VERSION}" \
 && test "$(yarn --version)" = "${YARN_VERSION}"

RUN git clone --branch "${WAZUH_DASHBOARD_REF}" --depth 1 \
      https://github.com/wazuh/wazuh-dashboard.git /osd \
 && v="$(python3 -c 'import json; print(json.load(open("/osd/package.json"))["version"])')" \
 && if [ "$v" != "2.19.5" ]; then echo "/osd/package.json es $v, no 2.19.5" >&2; exit 1; fi

# Navegadores y drivers de las pruebas end-to-end de OpenSearch Dashboards:
# compilar un plugin no los usa, alargan el bootstrap y alguno no tiene binario
# para todas las arquitecturas (chromedriver no publica linux-arm64).
ENV CHROMEDRIVER_SKIP_DOWNLOAD=true \
    GECKODRIVER_SKIP_DOWNLOAD=true \
    CYPRESS_INSTALL_BINARY=0 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /osd
# La caché de yarn solo sirve para volver a instalar: fuera, en la misma capa.
RUN yarn osd bootstrap && yarn cache clean
