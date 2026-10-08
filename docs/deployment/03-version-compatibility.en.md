# ENSFácil version compatibility
[Español](03-version-compatibility.md)

[[_TOC_]]

## 1. Objective

This guide states which versions ENSFácil works with and what to do before using another Wazuh version.

ENSFácil is a Wazuh Dashboard plugin of its own (`ensfacil`). It does not modify the Wazuh plugin: Wazuh can be updated on its own. But ENSFácil is built for an **exact** OpenSearch Dashboards version, the one Wazuh Dashboard ships.

> [!important]
> Compatibility must never be assumed just because Wazuh installs or starts correctly. A version is compatible when ENSFácil has been built for it and validated.

## 2. Validated version

| ENSFácil | Wazuh | OpenSearch Dashboards |
|---|---|---|
| `1.0.0` | `4.14.7` | `2.19.5` |

Any other combination is not validated.

The zip carries the OpenSearch Dashboards version in its name and in its manifest (`opensearchDashboardsVersion`). OpenSearch Dashboards only accepts a plugin built for its exact version:

- on installation, `opensearch-dashboards-plugin install` rejects it with `Plugin ensfacil [2.19.5] is incompatible with OpenSearch Dashboards […]`;
- if it was already installed and the dashboard changes version, the dashboard **does not start**: `Failed to initialize plugins`.

> [!note]
> In the releases, the zip is named `ensfacil-<version>-osd-<OpenSearch Dashboards version>.zip`, for example `ensfacil-1.0.0-osd-2.19.5.zip`: there is one zip per dashboard version. Each release states in its description which Wazuh and OpenSearch Dashboards versions it is compatible with ([Installing from a release](07-installing-from-a-release.en.md#21-compatibility)). Built from source, the zip is named `ensfacil-2.19.5.zip`.

## 3. Check the installed versions

```bash
dpkg-query -W -f='${Package} ${Version}\n' wazuh-manager wazuh-indexer wazuh-dashboard
sudo python3 -c 'import json; print(json.load(open("/usr/share/wazuh-dashboard/package.json"))["version"])'
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin list
```

What you should see, with the validated combination: the three packages at `4.14.7-1`, `2.19.5` and, in the plugin list, `ensfacil@1.0.0`.

## 4. Before updating Wazuh

Check which OpenSearch Dashboards version the new Wazuh Dashboard version ships (in its release notes or in its package).

- **Same OpenSearch Dashboards version (`2.19.5`):** the ENSFácil zip is the same. Even so, the new combination is not validated until section 5 is completed in a test environment.
- **Another OpenSearch Dashboards version:** an ENSFácil zip built for it is needed. Without that zip, do not update the dashboard: with `ensfacil` installed, it would not start. If the update must happen anyway, remove ENSFácil first ([troubleshooting and rollback, section 5](04-troubleshooting-and-rollback.en.md#5-remove-ensfácil)).

> [!warning]
> Do not run this evaluation directly on a production environment.

## 5. Evaluate a new version

In a test environment:

1. Prepare the build tree of the new Wazuh Dashboard version, as in [Building from source, section 3.2](08-building-from-source.en.md#32-prepare-the-opensearch-dashboards-2195-tree), with its tag.
2. Adjust the OpenSearch Dashboards version in `package.json`, `opensearch_dashboards.json` and `config/build-plugin.sh`. To publish it through CI, also in `.gitlab-ci.yml` and `ci/osd-builder.Dockerfile`.
3. Build with `config/build-plugin.sh` and validate the zip ([Building from source, sections 3.3 and 5](08-building-from-source.en.md#33-build-the-plugin)).
4. Install with `config/deploy-plugin.sh` and check the service, the plugin list and the `401` answer of `/api/ensfacil/configuration` ([section 13.4](01-installation-from-scratch.en.md#134-install-the-plugin-on-wazuh-dashboard)).
5. Run the repository tests:

   ```bash
   cd /opt/ensfacil/repo
   for t in tests/*.test.ts; do npx --yes tsx "$t" >/dev/null 2>&1 || echo "FALLA $t"; done
   python3 tests/check-consistency.py | tail -1
   ```

   What you should see: no `FALLA` line and `coherencia OK`.

6. Go through the screens with real data: Panel, Configuración (save with and without the `ensfacil_admin` role), Controles, Detalle del control, Informes (one PDF), Evidencias and Eventos.

## 6. Criteria for declaring a version compatible

A new version is only added to the table in section 2 once it has been shown that:

- [ ] the plugin builds against that OpenSearch Dashboards version;
- [ ] the zip installs with `deploy-plugin.sh` without touching the Wazuh plugin;
- [ ] Wazuh Dashboard starts with both plugins;
- [ ] the repository tests pass;
- [ ] the ENSFácil screens work with real data;
- [ ] there is a tested way back (remove `ensfacil` or reinstall the previous version).

## 7. Non-validated versions

A version that is not in the table in section 2 is not validated. It does not mean it is incompatible, but that there is no evidence yet to authorize the deployment.

> [!important]
> With a non-validated version, stop the procedure and first run the evaluation in section 5.
