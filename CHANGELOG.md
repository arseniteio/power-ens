# Changelog

All notable changes to Power ENS are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The repository is now `arseniteio/power-ens-wazuh`, to leave room for other SIEMs. The release zips are named `power-ens-wazuh-<version>-osd-<osd>.zip`. The plugin ID `powerEns` and its paths do not change.
- The installation guide lists the disk the plugin needs on each dashboard node.
- `CONTRIBUTING.md` and `CONTRIBUTING.es.md` explain how to propose a change and the contributor license agreement.

## [1.2.0] - 2026-11-16

### Changed

- The default ENS level and scope come from `default-configuration.json` of the OSCompliance ENS catalog, which the engine also uses: level MEDIO and the `ens` group.
- Until a configuration is saved, the engine judges with that default, so "Guardar configuración global" (save global configuration) is no longer required before the first verdicts.

### Fixed

- The result screens load on a deployment where no configuration was ever saved, instead of failing because the `wazuh-ens-configuration` index does not exist.

## [1.1.0] - 2026-11-15

### Added

- The "Detalle del control" (control detail) page has the "Excluir de este control" (exclude from this control) and "Volver a incluir" (include again) buttons for users with `power_ens_admin` or `all_access` when "Grupos por control" (per-control groups) is on. The first button moves the machine to the `ens-excluir-<control>` group, the second moves it back, and both require a reason.
- Every exclusion and inclusion is recorded with the machine, control, reason, user and date in the add-only index `wazuh-ens-exclusions`, through `/api/powerEns/exclusions`. If the record fails, the group change is undone.

### Changed

- `SHA256SUMS` in the release also covers `deploy-plugin.sh`, `create-admin-role.sh` and `dashboard.Dockerfile`.
- The installation guide downloads the release with `curl` and `sha256sum`.

## [1.0.0] - 2026-11-13

First release.

### Added

- Configuration screens "Organización" (organisation), "Plantillas" (templates) and "Agentes" (agents), stored in the `wazuh-ens-configuration` index, with built-in templates per system type.
- Result screens "Panel" (dashboard), "Vista general" (overview), "Detalle del control" (control detail), "Evidencias" (evidences), "Eventos" (events) and "Informes" (reports), read from the `oscompliance-verdicts` index. "Informes" exports each control report to PDF.
- Role `power_ens_admin` and `create-admin-role.sh`, which creates it and maps users to it.
- `deploy-plugin.sh`, which validates the zip, keeps a copy of the previous version and installs the plugin.
- `set-parameters.py`, which loads control and machine parameters from a JSON file.
- Plugin builds for OpenSearch Dashboards 2.19.5 (Wazuh 4.14.7) and 2.19.6 (Wazuh 4.14.8 and 4.14.9), and `dashboard.Dockerfile` for Wazuh on Docker.

[Unreleased]: https://github.com/arseniteio/power-ens-wazuh/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/arseniteio/power-ens-wazuh/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/arseniteio/power-ens-wazuh/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/arseniteio/power-ens-wazuh/releases/tag/v1.0.0
