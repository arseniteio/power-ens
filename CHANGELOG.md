# Changelog

All notable changes to Power ENS are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Madurez de la organización at the top of Panel: CMM levels accredited by the engine and assessed by people, distribution, global levels and measures below target. Detalle del control shows the maturity of the control with Valorar, and Informes adds it to the screen and the PDF. Assessments are stored in `configuration.maturity`; the server signs each changed one with the user and the date.
- `/api/powerEns/maturity/organization` returns the newest organization maturity written by the engine.
- Configuración has the tabs Estado, Máquinas, Perfiles, Pendiente, Organización and General. Estado summarises machines without a profile, unset parameters that leave evidences not evaluable, coverage per role, distribution and profile, and the latest changes.
- Máquinas lists the machines in `oscompliance-host-profile` with server-side paging, search and filters by profile, role, distribution, service and Wazuh group. Each machine opens a panel with what the engine deduced, its profiles and the value and origin of every per-machine parameter.
- Perfiles lists the built-in and stored profiles by layer, and edits them with a condition builder, a live preview of the machines that match and the values of the per-machine parameters. New profiles start blank, from a copy or from a file. Importar reads YAML or JSON with one or several profiles and shows new, changed, unchanged and invalid profiles before applying; Exportar writes YAML in the `oscompliance-policy` format.
- Profile edits are collected in one save bar (Descartar, Revisar, Guardar) and written together, with a version check against concurrent changes.
- Pendiente lists machines without a profile and the unset parameters of the last verdicts, with a link to where each one is set.
- `/api/powerEns/profiles` lists, reads, writes, deletes, imports and exports profiles, and `/api/powerEns/hosts` searches the machines and returns a machine with its profiles and values.
- The plugin ships the built-in profiles of the OSCompliance catalog in `common/ens/catalog/profiles`, and `config/sync-catalog.ts` copies them.
- New runtime dependency `yaml` 2.6.1 (ISC), used by the server to read and write profile files.

### Changed

- The organisation data and the values of each control are in the Organización tab; the client, level, groups in scope and per-control groups are in General.
- The per-machine values of the old Agentes tab open from the machine panel in Máquinas.
- Detalle del control and Informes show the value and origin of a per-machine parameter with the profiles of that machine, as the engine resolves it.
- The usage guide describes the new tabs and the order in which a machine's value is chosen; the installation guide lists the index permissions they need.
- The repository is now `arseniteio/power-ens-wazuh`, to leave room for other SIEMs. The release zips are named `power-ens-wazuh-<version>-osd-<osd>.zip`. The plugin ID `powerEns` and its paths do not change.
- The installation guide lists the disk the plugin needs on each dashboard node.
- `CONTRIBUTING.md` and `CONTRIBUTING.es.md` explain how to propose a change and the contributor license agreement.

### Fixed

- The result screens no longer fail with "Maximum call stack size exceeded" on a deployment with thousands of machines.

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
