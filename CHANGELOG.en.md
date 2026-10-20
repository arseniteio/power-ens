# Changelog
[Español](CHANGELOG.md)

The changes in each ENSFácil version are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions
follow [semantic versioning](https://semver.org/).

Each version's entry in the Spanish file, `CHANGELOG.md`, is the notes of its
GitLab release.

## [1.4.0] - Unreleased

Catalog corrections from the auditor's v2.0 templates: applicability by the
five dimensions, BOE literal texts with their provenance and Annex II order.
Organisation data asked once.

### Added

- Configuration > General > «Datos de la organización»: the data several
  controls ask (authorised staff, pre-production, rollback, CCN algorithms,
  retention, privileged groups, remote access channels and others) is declared
  once and each parameter that reads it keeps its `P-xx`. On load, equal values
  are unified, an empty parameter takes the value if it accepts it, and
  different values wait for a choice.
- Versioned saves: if the configuration changes while it is open, the save is
  refused (409) with «La configuración ha cambiado desde que la abriste» and the
  on-screen edits are kept. `set-parameters.py` and `inject-control.py` write
  only over the version they read.

- Confidentiality (C), Integrity (I) and Authenticity (A) levels in
  Configuration > General, next to Traceability (T) and Availability (D), each
  with the controls that use it. Absent key = ENS level, never `null`.
- «Norma ENS» (BOE literal) and «Criterio de aplicación» (ENSFácil's or the
  auditor's template interpretation) labels per row in each control's detail,
  the Controls view and the report (screen and PDF). The catalog keeps the
  interpretation apart (`interpretation`).
- Annex II section, application axis and source template of each control in
  the detail and report headers (`annexSection`, `source`). op.acc.2 stays on
  the v1.0 template, undated.
- mp.info.6: «Correspondencia con la plantilla del auditor» in the detail, the
  report and the PDF, with the coverage of each template P-xx and EV-xx.
  Deployed parameters, evidences and requirements do not change.
- op.exp.10 on Windows: rule 111109 (event 4663, a read of a key store with a
  SACL) for the `windows/op.exp.10` runbook. EV-01 accepts accesses audited by
  auditd (Linux and LDAP) or by a read SACL (Windows).
- «Niveles incoherentes» notice in Controles and the dashboard, with a link to
  General, when a dimension exceeds the ENS level; General does not save and
  `config/validate-configuration.ts` exits with code 1.

### Changed

- Application axes of the auditor's index: mp.info.6 by D; op.acc.1 by T and
  A; op.acc.2 to op.acc.6 by C, I, T and A; op.exp.8 by T; op.cont.2 and
  op.cont.3 by D. With several dimensions the highest rules.
- BOE literal requirement texts: 14 in the catalog (mp.info.6 and op.acc.1)
  and 20 in the Controls view (mp.info.6, op.acc.1 and op.acc.2).
  mp.info.6.2.a to .2.d carry the literal of their letter.
- Control lists follow the Annex II order (op.acc, op.exp, op.nub, op.cont,
  op.mon and, last, mp.info.6), including each agent's list in Configuration.
- A control governed by a dimension shows «Nivel aplicable» with its
  dimension, for example «Nivel aplicable: ALTO (Disponibilidad)».
- op.exp.10 EV-01 «Accesos auditados al material criptográfico»: reads audited
  with auditd (Linux and LDAP) or with a read SACL (Windows); FIM only detects
  integrity changes.
- op.exp.3 EV-11 is declared ENSFácil's own evidence.

### Updating from 1.3.0

- With no dimension declared, the results do not change.
- A document that declares T or D may change verdicts: D also governs
  mp.info.6, and T also op.acc.1 to op.acc.6 when it is the highest of their
  dimensions. Before updating, check the document with
  `config/validate-configuration.ts` (guide 02, section 5.1).

## [1.3.0] - 2026-10-19

Configuration by control templates, regular-expression matching and code in
English.

### Added

- Configuration in three tabs (guide 09): «Controles», with the common
  settings, the templates and the assignment per agent; «Agentes», with each
  agent's detected type and, per control, its template and its own settings
  with the origin of each value; and «General», with the ENS level, the T and
  D levels and the read-only scope.
- Templates per control: one built-in per system type (Linux, LDAP server,
  Windows, Wazuh manager, PBS backup, Zimbra NE backup) and custom ones, which are created, duplicated,
  edited and deleted. Editing or deleting a template in use shows the
  affected agents and asks for confirmation. Assignment accepts several agents
  at once.
- Value applied to an agent: its own setting; otherwise the template assigned
  in that control; otherwise the built-in template of its type; otherwise the
  control's common value.
- «Texto exacto» or «Expresión regular» matching (RE2 syntax, up to 512
  characters, full match) on op.acc.1 P-03 and P-04, op.acc.4 P-05 and
  op.acc.6 P-08 and P-11, in the common settings, the templates and each
  agent's settings, with «Probar con un valor».
- Lists accept several items separated by commas, semicolons or line breaks;
  empty and repeated entries are removed.
- The `re2js` 2.8.6 dependency.
- `config/set-parameters.py` accepts, per agent and control, the `template` key (template id, `none` or `null`) and values as a `{value, matchMode}` object; `config/inject-control.py` keeps the `matchMode` and the custom templates; `config/validate-configuration.ts` lists invalid common values and per-agent templates.

### Changed

- A 1.2.0 configuration is converted on save: applied templates become
  assignments per control. No value is lost and the previous version stays in
  the history.
- The «Controles» tab of Configuration marks a control as incomplete when a required value is
  missing for any agent.
- In the control detail and the reports, a value compared as a regular expression is labelled «Expresión regular: …».
- The control detail header: the identifier in a badge and the title on its
  own line.
- Configuration texts use parameter and agent names, without internal codes;
  parameter descriptions are shorter.
- The global configuration field «Alcance» is now «Descripción del alcance
  (informes)».
- Code, comments, log messages, `config/` scripts and tests in English. The
  user interface stays in Spanish.
- An agent's comparison mode without its own setting is shown as a setting that does not apply and is removed with «Quitar».
- More direct documentation, in Spanish and English.

### Upgrade notes

- The output of `config/` (`inject-control.py`, `set-parameters.py`, `validate-configuration.ts`, `create-admin-role.sh`, `deploy-plugin.sh`, `build-plugin.sh`) is in English; the runbooks that quote it are updated.
- The tests and `config/validate-configuration.ts` first need
  `npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive`
  (guides 01 and 08).
- Going back to 1.2.0: deploying its zip is enough. Restoring from the
  history the version before the conversion is only needed for 1.2.0 to
  evaluate with its templates (guide 09, section 12). 1.2.0 compares a
  regular expression as a literal name.

## [1.2.0] - 2026-10-18

Evaluation on the server over the whole window, configuration by system, and
screens that no longer disappear.

### Added

- Configuration by system (guide 09, «Configuration by system and templates»,
  in `docs/deployment/`). The Configuration screen has two levels:
  «Organización» (organization), with the common policy, and «Sistemas»
  (systems), with what belongs to each agent in scope and to its platform.
  Each parameter is an organization, per-system or per-platform parameter.
  In a machine's row, a per-system or per-platform parameter takes the agent's
  own value, otherwise its templates' value and otherwise the organization's;
  the ones that describe other machines in a manager control are resolved by
  union. Without per-system values, the verdicts are those of the organization
  configuration.
  - Each system's type (manager, Windows, Zimbra LDAP or Linux) is detected
    from the inventory and the facts, shown with the detection evidence, and
    can be corrected by hand.
  - Platform templates «Linux Ubuntu», «Servidor LDAP Zimbra» (Zimbra LDAP
    server), «Windows Server» and «Manager Wazuh» (Wazuh manager), and the
    add-ons «Copias con PBS» (PBS backups) and «Copias Zimbra NE» (Zimbra NE
    backups), with a per-system preview before saving.
  - «Migrar a sistemas» (migrate to systems) copies to each agent the rows of
    the organization tables that name it, without losing any row and without
    leaving any machine without a value. It is optional and is confirmed by
    typing `migrar`.
  - Every version of the document is kept in the history before it is
    replaced, whether the plugin, `inject-control.py` or `set-parameters.py`
    writes it, including the migration.
  - `config/set-parameters.py` declares a system's values (`agents` key) and
    `config/validate-configuration.ts` validates them.
- «Controles del catálogo sin añadir» (catalog controls not added), in
  «Organización»: the controls that exist in the plugin and are not in the
  document, with «Añadir con valores por defecto» (add with default values).
  The controls list and the detail of such a control offer the same button.
- The **Vista general** (overview) tab: every machine in scope and every
  control at once. It includes a per-machine summary (statuses, requirements
  not met, last data and its worst controls), the controls × machines matrix by
  compliance or by collection freshness, the work queue grouped by who has to
  act, and the 30-day trend with each control's status on each day.
- **Configurar este control** (configure this control), in the control detail,
  and a badge for each parameter cited in a non-conformity, with the value that
  applies to the machine and its origin (own, from a template or from the
  organization). They open Configuration on that control or parameter, with
  «Volver al detalle de …» (back to the detail of …). Reports also show the
  origin of the applied value.
- The «ENSFácil» card on the OpenSearch Dashboards home page (`/app/home`),
  when the dashboard includes the `home` plugin. The Wazuh home page offers no
  extension point for other plugins' cards: there, ENSFácil is still only in
  the menu.

### Changed

- **The evaluation runs on the plugin server with every fact of the 30-day
  window**, with the permissions of the viewing user. The browser no longer
  downloads facts: it receives the results (the controls list goes from about
  170 MB to a few KB). 1.1.0 evaluated in the browser with the newest 10,000
  facts (on the dashboard, of all controls together; in the list and the
  detail, of each control), which in an active scope cover hours, not the whole
  window. **When upgrading, some verdicts change**, because they are now those
  of the whole window. In the lab, with the same facts, the 1.1.0 dashboard gave
  CUMPLE to three evidences that are NO_CUMPLE over the 30 days and counted
  fewer non-conformities than there are, because it left whole machines out.
- The first load answers in parts. The controls list, the Vista general and
  the dashboard show the controls already computed within a few seconds and
  «Calculando…» (computing) on the rest, and complete without intervention;
  while controls are missing, they show no overall figures. The daily evolution
  is computed afterwards and, until it is ready, the chart reads «Calculando la
  serie…» (computing the series). After that, the stored result is shown at
  once and recomputed in the background when new facts arrive
  («Actualizando…», updating). If a recomputation fails, the reason is shown
  with «Reintentar» (retry) over the last correct result.
- The controls list always shows all 23. The ones not measured on the selected
  machine go last, in grey, with the reason and no number. A line names the
  controls that do not apply at the level («Nivel BAJO: 4 controles no aplican
  (…)»). With no machine selected, each control carries its machines bar
  («1 cumple · 1 no cumple (de 2 máquinas)»).
- Non-conformities read in parts. The headline is the failing evidence, its
  status and the first sentence of its reason, without the bridge template and
  without bold. Below come the rest of the reason, lists as lists, what follows
  «Además» (also) apart, the requirement's other evidences with their status,
  and the conforming ones folded. The reason text in Reports and in the PDF is
  unchanged.
- The control detail keeps the open control in the URL: switching tabs or
  reloading the page opens it again.
- op.acc.1: P-01 (identity source) changes from a menu to a list, because an
  organization can have several identity sources; P-03 and P-04 come with the
  system accounts of a Linux base and the forbidden generic accounts as their
  initial value.

### Fixed

- The detail of a control not measured on the selected machine was empty and
  read «Todo lo aplicable … conforme» (everything applicable … compliant). It
  now states that the control is not measured on that machine, with the
  reason.
- When switching machine, the detail evaluated the new machine with the
  previous machine's facts for a few seconds. It now shows the previous result,
  labelled with its machine and time, until the new one arrives.
- An error or a timeout replaced the whole page. The notice, with
  «Reintentar», now appears above the last result.
- «Activo:» (asset), in the detail, showed the manager's name with a machine
  selected.
- With the manager selected, the controls list hid the 14 controls measured
  only on machines (and mp.info.6, on the machines outside its P-04).
  Configuration did not show the catalog controls missing from the document.
- While loading, the controls list showed a status on every row.
- An address with a machine outside the scope set every control to «sin
  datos» (no data). The selector now says so, with «Quitar la máquina y ver
  todas» (remove the machine and see all).
- The action proposed for a control missing from the active configuration
  asked to fix the evidence producer. It now says how to add the control.
- `config/deploy-plugin.sh` stopped the dashboard before checking that its user
  could read the zip, and left it stopped if it could not (for example, with
  the zip under `/home`). It now installs from a readable copy checked before
  stopping and, if it cannot make one, exits with code 4 without touching the
  service.

### Upgrade notes

- Nothing is migrated automatically: the 1.1.0 configuration is evaluated the
  same way, with the organization values.
- «Migrar a sistemas» is optional and reversible: the previous version of the
  document stays in the history.
- To go back to 1.1.0 after migrating, restore the version of the document
  from before the migration: 1.1.0 does not see the rows that left the
  organization (guide 09, section 12).
- Each user's first load after the dashboard starts reads the whole window. In
  the lab, the first controls appear within a few seconds and the complete
  result in about 20 s; after that, the views are served at once.
- The dashboard server now evaluates the controls, which uses its memory: in
  the lab (6 machines), about 15 MB per user after the first load and about
  50 MB while computing. It is bounded by 50,000 facts per read, 4 reads at a
  time and a result memory of 64 to 256 MB depending on the scope. In a larger
  deployment, give the dashboard more heap (`--max-old-space-size`, guide 04,
  section 8.1).

## [1.1.0] - 2026-10-10

Six new controls: the catalog goes from 17 to 23.

### Added

- Six controls in the catalog, all measured on the manager (op.mon.3 on the
  machines too):
  - `op.cont.2` Continuity plan (only with D at ALTO), without a collector or
    rules (documentation-only runbook): the plugin judges it from the screen
    tables and their validity;
  - `op.cont.3` Periodic tests (only with D at ALTO), with the manager's test
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
