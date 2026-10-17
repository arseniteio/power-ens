# Changelog
[Español](CHANGELOG.md)

The changes in each ENSFácil version are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions
follow [semantic versioning](https://semver.org/).

Each version's entry in the Spanish file, `CHANGELOG.md`, is the notes of its
GitLab release.

## [1.1.0] - 2026-10-10

Six new controls: the catalog goes from 17 to 23.

### Added

- Six controls in the catalog, all measured on the manager (op.mon.3 on the
  machines too):
  - `op.cont.2` Continuity plan (only with D at HIGH), without a collector or
    rules (documentation-only runbook): the plugin judges it from the screen
    tables and their validity;
  - `op.cont.3` Periodic tests (only with D at HIGH), with the manager's test
    and deficiency registers and the outages and starts measured in each
    test's real window;
  - `op.mon.1` Intrusion detection;
  - `op.mon.2` Metrics system, with the metrics cycle register;
  - `op.mon.3` Monitoring, on the manager and on the machines of the `ens`
    group;
  - `op.nub.1` Protection of cloud services.
- The Availability (D) dimension: in Configuration > Global configuration, the
  optional **Availability level (D)** field. Only op.cont.2 and op.cont.3 read
  it; empty, they use the global ENS level.
- The documentary attestation flag (`attested`) in policy decisions: a
  requirement met by a valid declaration reads «Acreditado documentalmente»
  (documentarily accredited), never «Medido» (measured), and does not fill its
  evidences as measured.
- The documentary flag (`documental`) in the decisions that come only from the
  screen tables (all of op.cont.2, op.mon.1 R2 and the documentary part of
  op.nub.1): a stale collector or a scope without machines does not erase
  them, and a documentary non-conformity reads «Declarado (documental)» and
  asks to renew or complete the documentation, not to fix the machine.
- Reports: the op.mon.2 report receives the result of every control (the
  panorama) through a second facts search, the same as the dashboard's.

### Changed

- On new installations, the configuration index, `wazuh-ens-configuration`,
  is created with `auto_expand_replicas: 0-1`: on a single-node indexer it no
  longer stays yellow. The plugin does not touch an index that already exists:
  one created by 1.0.0 is adjusted by hand when updating (update guide,
  section 8).
- A control whose evidences listen to no facts (op.cont.2) expects no facts:
  what it cannot prove is a CONFIGURATION gap, never a COLLECTION one.
- An evidence named by the policy only replaces a NO_EVALUABLE inherited from
  its requirement; an inherited NO_CUMPLE or PARCIAL still wins.
- In the control detail, documentary non-conformities have their own block and
  are not counted under «Corregir el sistema auditado» (fix the audited system).

## [1.0.0] - 2026-10-08

First version of ENSFácil as a standalone Wazuh Dashboard plugin.

### Added

- The `ensfacil` plugin for OpenSearch Dashboards 2.19.5 (Wazuh 4.14.7). It is
  installed next to the Wazuh plugin and does not modify it.
- The «ENSFácil» app, in the «Security operations» menu, with the Panel,
  Configuración, Controles, Detalle del control, Informes, Evidencias and
  Eventos tabs, and the «Máquina» selector.
- 17 controls in the catalog:
  - `mp.info.6` Backups;
  - `op.acc.1` Identification;
  - `op.acc.2` Access requirements;
  - `op.acc.3` Segregation of duties and tasks;
  - `op.acc.4` Access rights management process;
  - `op.acc.5` Authentication mechanism (external users);
  - `op.acc.6` Authentication mechanism (organization users);
  - `op.exp.1` Asset inventory;
  - `op.exp.2` Security configuration;
  - `op.exp.3` Security configuration management;
  - `op.exp.4` Security maintenance and updates;
  - `op.exp.5` Change management;
  - `op.exp.6` Malware protection;
  - `op.exp.7` Incident management;
  - `op.exp.8` Activity logging;
  - `op.exp.9` Incident management records;
  - `op.exp.10` Cryptographic key protection.
- The plugin's own configuration routes, `/api/ensfacil/configuration` and its
  history.
- The `ensfacil_admin` role: only users who have it, or have `all_access`, can
  save the configuration and see its history. Refused attempts are written to
  the dashboard log. `config/create-admin-role.sh` creates the role and assigns
  it.
- `config/build-plugin.sh` builds the plugin and `config/deploy-plugin.sh`
  installs it: it bumps the dashboard `build.number`, first keeps the installed
  plugin and, if it fails, says how to go back.
- Releases through CI/CD: every `vX.Y.Z` tag publishes in GitLab the
  `ENSFácil X.Y.Z` release with `ensfacil-X.Y.Z-osd-2.19.5.zip`,
  `deploy-plugin.sh`, `create-admin-role.sh` and `SHA256SUMS`.
- The guides to install from a release and to build from source, the
  contributing guide and this changelog.

### Changed

- The ENS configuration stays in the same index, `wazuh-ens-configuration`, and
  with the same format as in the integrated version: it does not need migrating.

### Removed

- The integrated version, which modified the Wazuh plugin and added the «ENS»
  app. It is no longer maintained or distributed, and the Wazuh plugin is the
  official one again. The transition is in the update guide, section 10.
