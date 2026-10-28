# Build image of Power ENS: the OpenSearch Dashboards 2.19.5 tree
# (wazuh-dashboard v4.14.7) prepared with `yarn osd bootstrap` in /osd.
#
#   docker build -f ci/osd-builder.Dockerfile -t power-ens-osd-builder:2.19.5 ci/
FROM node:18.19.0-bookworm

ARG WAZUH_DASHBOARD_REF=v4.14.7
ARG YARN_VERSION=1.22.22

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 zip unzip \
 && rm -rf /var/lib/apt/lists/*

# La imagen de node trae su propio yarn 1.x; la guía fija 1.22.22.
RUN npm install --global --force "yarn@${YARN_VERSION}" \
 && test "$(yarn --version)" = "${YARN_VERSION}"

# El bootstrap se niega a correr como root, y su --allow-root no llega a los
# scripts que lanza: el árbol se prepara con el usuario `node`, como la guía lo
# hace con un usuario normal.
RUN mkdir /osd && chown node:node /osd
USER node

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

# El trabajo `build` corre como root, igual que build-plugin.sh en el servidor
# (que compila con --allow-root). El optimizador llama a git en /osd, que es de
# `node`: sin esta excepción, git se niega («dubious ownership»).
USER root
RUN git config --system --add safe.directory /osd
