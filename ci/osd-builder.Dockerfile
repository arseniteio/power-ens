FROM node:18.19.0-bookworm

ARG WAZUH_DASHBOARD_REF=v4.14.7
ARG YARN_VERSION=1.22.22

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 zip unzip \
 && rm -rf /var/lib/apt/lists/*

RUN npm install --global --force "yarn@${YARN_VERSION}" \
 && test "$(yarn --version)" = "${YARN_VERSION}"

RUN mkdir /osd && chown node:node /osd
USER node

RUN git clone --branch "${WAZUH_DASHBOARD_REF}" --depth 1 \
      https://github.com/wazuh/wazuh-dashboard.git /osd

ENV CHROMEDRIVER_SKIP_DOWNLOAD=true \
    GECKODRIVER_SKIP_DOWNLOAD=true \
    CYPRESS_INSTALL_BINARY=0 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /osd
RUN yarn osd bootstrap && yarn cache clean

USER root
RUN git config --system --add safe.directory /osd
