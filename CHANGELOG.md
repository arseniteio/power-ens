# Changelog

All notable changes to Power ENS are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-13

First release.

### Added

- Configuration screens Organización, Plantillas and Agentes, stored in the `wazuh-ens-configuration` index, with built-in templates per system type.
- Result screens Panel, Vista general, Detalle del control, Evidencias, Eventos and Informes, read from the `oscompliance-verdicts` index. Informes exports each control report to PDF.
- Role `power_ens_admin` and `create-admin-role.sh`, which creates it and maps users to it.
- `deploy-plugin.sh`, which validates the zip, keeps a copy of the previous version and installs the plugin.
- `set-parameters.py`, which loads control and machine parameters from a JSON file.
- Plugin builds for OpenSearch Dashboards 2.19.5 (Wazuh 4.14.7) and 2.19.6 (Wazuh 4.14.8 and 4.14.9), and `dashboard.Dockerfile` for Wazuh on Docker.

[Unreleased]: https://github.com/arseniteio/power-ens/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/arseniteio/power-ens/releases/tag/v1.0.0
