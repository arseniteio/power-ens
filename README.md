# Power ENS

Wazuh dashboard plugin for the Spanish National Security Framework (ENS, RD 311/2022). It holds the policy parameters of each control and shows compliance per control and machine.

## Build

```bash
docker build -f ci/osd-builder.Dockerfile -t power-ens-osd-builder:2.19.5 ci/
docker run --rm -v "$PWD:/src:ro" -v "$PWD/dist:/dist" power-ens-osd-builder:2.19.5 \
  bash -c 'bash /src/config/build-plugin.sh /osd && cp /osd/plugins/powerEns/build/powerEns-2.19.5.zip /dist/'
```

Result: `dist/power-ens-2.19.5.zip`, for Wazuh Dashboard 4.14.7 (OpenSearch Dashboards 2.19.5).

## Test

```bash
ci/run-tests.sh
```
