# Article 32 annual report
[Español](11-annual-report-art-32.md)

Data set of the annual report of article 32 of RD 311/2022 in ENSFácil 1.4.0: what each field contains, where it comes from, what is declared by hand, how it is frozen at the closing and how it is exported.

## 1. Purpose

op.mon.2.1 refers to the annual report of article 32, which public administrations deliver to the CCN (INES campaign). ENSFácil produces its data without manual assembly: for each Annex II measure, its applicability, level, implementation, coverage and maturity; the categorisation; the incidents; the resources and the reliability of the measurement. Each figure carries its source and its trace.

The exact fields of the current INES questionnaire are not confirmed. The data set does not imitate that form: it is a stable set with documented field ids (section 9), mapped to the questionnaire once it is available. A field id never changes meaning; a new datum is a new id.

## 2. Prerequisites

| Requirement | Check |
|---|---|
| ENSFácil plugin 1.4.0 or later | The op.mon.2 detail shows the «Informe anual (art. 32)» panel |
| op.mon.2 configured: P-01 (Statement of Applicability) and P-02 (periodicity and `cierre_anual`) | Configuration > op.mon.2 |
| op.mon.2 runbook on the manager, with the cycle register and op.exp.7's incident register | [Runbooks and registers](05-runbooks-and-registers.en.md) |
| Role `ensfacil_admin` or `all_access` to declare, freeze and regenerate | A declaration does not return error 403 |
| Read access to the `wazuh-ens-snapshots` index to see the frozen reports | Section 6.4 |

## 3. Where it is shown

| Screen | Content |
|---|---|
| Controls > op.mon.2 > «Informe anual (art. 32)» | Period, state (open, closed without freeze or frozen), summary, «Descargar JSON», «Descargar CSV», «Congelar» or «Regenerar» and «Recursos TIC totales» |
| Controls > op.mon.2 > «Medidas sin motor» | The 50 Annex II measures that ENSFácil does not measure, with their declared entry and the «Declarar» button |
| Reports > op.mon.2 | The same panel; field 8 of the PDF («Datos para el informe anual del artículo 32») is the summary of the same data set |

The report belongs to the organisation: it is the same with or without a machine selected.

## 4. The period

- Period N ends on P-02's closing day (`cierre_anual`, MM-DD) of year N and starts on the day after the closing of the previous year. Without `cierre_anual`, the closing is 31 December. A `02-29` closing falls on 28 February in common years.
- The day boundaries are those of the time zone in Configuration > General.
- The period id is the year of its closing: with closing `03-31`, period `2027` runs from 2026-04-01 to 2027-03-31.
- An open period shows today's figures. A closed period without a freeze also shows today's figures, and the panel warns about it. Only a frozen period shows the figures of its closing.

## 5. What is declared by hand

| Datum | Where it is declared | Report fields |
|---|---|---|
| Applicable measures | op.mon.2 P-01 (Statement of Applicability) | `measure.soa`, `measure.applies` |
| Entry of each measure without engine: applies, assessed and target maturity, documentary reference, link, owner, date and, when it does not apply, justification | «Medidas sin motor» > «Declarar» | `measure.applies`, `measure.maturity_assessed`, `measure.maturity_target`, `measure.documentary_reference`, `measure.owner`, `measure.assessed_at` |
| Maturity of the measured controls (procedure, assessment) | «Madurez» panel of each control ([guide 10](10-maturity-assessment.en.md)) | `measure.maturity_assessed`, `measure.documentary_reference`, `measure.owner` |
| Internal and external hours and executed budget of each cycle | Cycle register on the manager (`/etc/ensfacil/metrics-cycle-register.tsv`) | `resources.hours_internal`, `resources.hours_external`, `resources.budget_executed` |
| Total ICT budget, total ICT staff and security staff of the period | «Informe anual (art. 32)» > «Recursos TIC totales» | `resources.ict_budget_total`, `resources.ict_staff_total`, `resources.security_staff` |
| Occurrence date of each incident (optional) | `fecha_ocurrencia` column of the incident register ([op.exp.7 compliance guide](https://gitlab.com/quersystem/ens-controls-runbook/linux/op.exp.7/-/blob/main/docs/deployment/02-compliance.en.md)) | `incidents.mttd_hours`, `incidents.mttd_from_occurrence` |

Declared entries and ICT resources are stored in the maturity document (`wazuh-ens-configuration/_doc/maturity`) through the same route as the maturity: administration role, version read (`expectedVersion`), history that is never overwritten. Each new entry is appended; the current one is the last.

The 50 measures without engine are the 39 Annex II measures outside the catalog (org.1-4, op.pl.1-5, op.ext.1-4, op.cont.1, op.cont.4, mp.if.1-7, mp.per.1-4, mp.eq.1, mp.com.2, mp.si.1-5, mp.sw.1, mp.info.1-5) and the 11 catalog controls «Sin medición todavía» (mp.eq.2-4, mp.com.1, mp.com.3, mp.com.4, mp.sw.2, mp.s.1-4). A control measured by the engine does not accept a declared entry.

Declare a measure:

1. Open Controls > op.mon.2 and scroll to «Medidas sin motor».
2. Press «Declarar» on the row of the measure.
3. Fill in the form and press «Guardar».

Expected result: the row shows the entry (applies, maturity, reference, owner and date) with the source «declarada».

## 6. Annual freeze

### 6.1 Automatic freeze at the closing

The server's daily job (02:30, local time of the configured zone), after writing the day's snapshots, freezes the period that has just closed:

- only if the closing was 31 days ago or less; after that, the period is frozen on request only (section 6.2);
- with the dashboard's internal user, never with the viewer's;
- once: the document is created with `create`, and a second run, or a second dashboard, writes nothing;
- a failure does not prevent the day's snapshots and is retried with the next day's run.

The document is `annual_freeze|<period>` in the `wazuh-ens-snapshots` index, with revision 1, the instant, the author (`ENSFácil (tarea diaria)`) and the whole data set. It has no `date` field: snapshot reads, the daily job's check and the purge of snapshots older than 1095 days never touch it.

### 6.2 Freeze or regenerate on request

1. Open «Informe anual (art. 32)» and choose the closed period in «Periodo».
2. Press «Congelar» (period without freeze) or «Regenerar» (frozen period).
3. Write the reason and confirm.

Expected result: the state becomes «congelado el … por …, revisión N («reason»)».

Rules:

- only a closed period; the open period is never frozen;
- the reason is mandatory (up to 1000 characters): it stays in the data set (`header.freeze_reason`) and in the history;
- the server checks the role (`ensfacil_admin` or `all_access`) and writes with the internal user;
- the request carries the revision read (`expectedRevision`, null when there was none); if someone else changed it, it returns 409;
- the figures are those of the moment of the request, not those of the closing: a late freeze shows it with `header.frozen_at` after `header.period_end`;
- the previous revision is kept whole in `annual_freeze|<period>|r<N>` and remains available to read and export.

### 6.3 Reproducibility

The report of a frozen period is served as stored: later declared entries, configuration or facts do not change it. To include them, it is regenerated (section 6.2), which creates a new revision and keeps the previous one.

### 6.4 Check the freeze in the indexer

From the server (variable `IDX` of the [installation from scratch, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration)), with the relevant period:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  -H 'Content-Type: application/json' "$IDX/wazuh-ens-snapshots/_search" \
  -d '{"query":{"ids":{"values":["annual_freeze|2026"]}},"_source":["period","revision","frozenAt","frozenBy","reason","history"]}' \
  | jq '.hits.hits[]._source'
```

Expected result: the period, its revision, the instant, the author, the reason and the history of earlier revisions. No result: the period is not frozen.

A user without read access to `wazuh-ens-snapshots` sees the report computed at that moment and the warning «Sin permiso de lectura de wazuh-ens-snapshots». The access is granted with the index pattern `wazuh-ens-snapshots` and the `read` action in the user's role.

## 7. Export

| Format | Content | File name |
|---|---|---|
| JSON | The whole data set: `schema`, `period` and the sections `header`, `categorisation`, `implementation`, `maturity`, `measures` (each measure with its 16 data), `incidents`, `resources` and `measurement` | `ensfacil-informe-art32-<period>[-r<revision>].json` |
| CSV | One row per datum with the columns `field_id`, `key`, `value`, `unit`, `source`, `trace` | `ensfacil-informe-art32-<period>[-r<revision>].csv` |

The CSV follows RFC 4180: comma separator, double quotes for cells with commas, quotes or line breaks, CRLF line endings, UTF-8 without BOM. An empty `value` cell means «no datum»; the `trace` column says why. `key` tells apart the data that repeat: the measure (`op.acc.1`), the framework (`org`, `op`, `mp`), the incident type, the severity or the maturity level (`L0` to `L5`). The plugin bundles no XLSX writer; the CSV opens in a spreadsheet.

Each datum is an object `{ id, key, value, unit, source, trace }`. `value` is text, number, boolean or null.

## 8. Sources

| `source` | Meaning |
|---|---|
| `ENGINE` | ENSFácil's engine over the Wazuh facts (status, percentage, coverage) |
| `MATURITY_ENGINE` | Maturity level accredited by the evidence ([guide 10](10-maturity-assessment.en.md)) |
| `ASSESSMENT` | Maturity assessment recorded by a person |
| `DECLARED` | Declared entry of a measure without engine, registered procedure or total ICT resources |
| `SOA` | Statement of Applicability, op.mon.2 P-01 |
| `ANNEX_II` | Annex II table with the dimension levels |
| `CONFIGURATION` | Configuration > General or op.mon.2 P-02 |
| `CYCLE_REGISTER` | Metrics cycle register on the manager (data declared by the organisation) |
| `INCIDENT_REGISTER` | op.exp.7's incident register, re-emitted by op.mon.2 |
| `ALERT_RECONCILIATION` | op.exp.7's reconciliation of alerts and incidents |
| `FREEZE` | Freeze data |
| `NONE` | No datum or an informative datum; `trace` explains which |

## 9. Fields

### 9.1 Header

| Field | Content |
|---|---|
| `header.schema` | Format version: `ensfacil.art32.v1` |
| `header.organisation` | Configuration > General, «Cliente» |
| `header.unit` | Configuration > General, «Organización» |
| `header.system` | Configuration > General, «Alcance» (one ENSFácil is one system) |
| `header.period` | Year of the closing of the period |
| `header.period_start` | First day of the period (YYYY-MM-DD) |
| `header.period_end` | Last day of the period: the closing |
| `header.period_open` | `true` while the period has not closed |
| `header.category` | System category: BÁSICA, MEDIA or ALTA |
| `header.generated_at` | Instant of the evaluation it was generated with |
| `header.plugin_version` | ENSFácil version |
| `header.frozen` | `true` for a frozen data set |
| `header.frozen_at` | Instant of the freeze |
| `header.frozen_by` | Author of the freeze (`ENSFácil (tarea diaria)` or the user) |
| `header.revision` | Freeze revision (1 = the one at the closing) |
| `header.freeze_reason` | Reason for the regeneration |

### 9.2 Categorisation

| Field | Content |
|---|---|
| `category.level_c` | Confidentiality level; key absent: the ENS level |
| `category.level_i` | Integrity level |
| `category.level_t` | Traceability level |
| `category.level_a` | Authenticity level |
| `category.level_d` | Availability level |
| `category.ens_level` | ENS level of Configuration > General |
| `category.category` | Category: the highest dimension level (Annex I); the trace warns when a dimension exceeds the ENS level |

### 9.3 Per Annex II measure (`key` = measure)

| Field | Content |
|---|---|
| `measure.name` | Name of the measure |
| `measure.engine` | `MEDIDO` (catalog, active), `SIN_MEDICION` (catalog, draft) or `SIN_MOTOR` (outside the catalog) |
| `measure.axis` | Application axis: `Categoría` or the dimensions (`T A`) |
| `measure.level` | Level it is applied with: the category or the highest of its dimensions |
| `measure.annex_requirement` | What Annex II requires at that level: `aplica`, the reinforcements (`+R1`) or `n.a.` |
| `measure.soa` | What P-01 says: `sí`, `no` or null without a row |
| `measure.applies` | Whether it applies: P-01; without a row, the declared entry; without it, Annex II |
| `measure.status` | Engine status (`CUMPLE`, `PARCIAL`, `NO_CUMPLE`, `NO_EVALUABLE`, `NO_APLICA`), or `SIN_MEDICION` / `SIN_MOTOR` |
| `measure.implementation_pct` | Engine percentage; null without engine or when it does not apply at its level |
| `measure.coverage_pct` | Engine coverage: requirements with evidence over the applicable ones |
| `measure.maturity_accredited` | Level accredited by the evidence (measured measures only) |
| `measure.maturity_assessed` | Level assessed by a person or declared; the most recent |
| `measure.maturity_target` | Target: the declared or assessed one, or that of the category of its level (Configuration > General) |
| `measure.documentary_reference` | Documentary reference of the declared entry or, for a measured measure, the registered procedure |
| `measure.owner` | Owner of the declared entry or of the procedure |
| `measure.assessed_at` | Date of the assessment or of the declared entry |

### 9.4 Implementation degree

| Field | Content |
|---|---|
| `implementation.global_pct` | Mean of the engine percentage of the applicable measures that have one |
| `implementation.framework_pct` | The same mean per framework (`key`: `org`, `op`, `mp`) |
| `implementation.measures_applicable` | Measures that apply |
| `implementation.measures_measured` | Of those, with an engine percentage |
| `implementation.measures_declared` | Of those, without a percentage and with an assessed or declared maturity |
| `implementation.measures_without_data` | Of those, with neither; the trace lists them |

### 9.5 Maturity

| Field | Content |
|---|---|
| `maturity.measures_at_level` | Applicable measures per level (`key`: `L0` to `L5`): the assessed or declared one and, without it, the accredited one |
| `maturity.not_assessed` | Applicable measures without a level |
| `maturity.below_target` | Measures below their target; the trace lists them |

### 9.6 Incidents

| Field | Content |
|---|---|
| `incidents.window_start` | Start of the window: that of the period |
| `incidents.window_end` | End of the window: that of the period or, when open, the generation |
| `incidents.total` | Incidents opened in the period (first `inicial` phase, or the first phase) |
| `incidents.by_type` | By `clasificacion` (`key`: the type; `sin clasificar` when missing) |
| `incidents.by_severity` | By severity, the highest of its phases (`key`: `baja`, `media`, `alta`, `critica`) |
| `incidents.mttd_hours` | Mean time to detect in hours: from `fecha_ocurrencia` to the `inicial` phase; without it, from the first alert reconciled by op.exp.7 to the `inicial` phase |
| `incidents.mttd_from_occurrence` | Incidents measured with `fecha_ocurrencia` |
| `incidents.mttd_from_alert` | Incidents measured with the first reconciled alert: a lower bound, only within op.exp.7's 30-day window |
| `incidents.mttd_without_data` | Incidents with neither datum; the trace lists them |
| `incidents.mttc_hours` | Mean time to contain: from the `inicial` phase to the first `intermedio` |
| `incidents.mttr_hours` | Mean time to resolve: from the `inicial` phase to the last `final` |
| `incidents.notified_ccn_cert` | Incidents with `notificacion_ccn_cert` |
| `incidents.with_personal_data` | Incidents with `datos_personales` = `si` |
| `incidents.notified_aepd` | Of those, with `AEPD` in `notificado_a` |
| `incidents.alerts_relevant` | High and Critical alerts of op.exp.7's reconciliation (without those excluded by its P-12) |
| `incidents.alerts_in_incident` | Of those, within a recorded incident |
| `incidents.alerts_to_incident_pct` | Share of the decided alerts (in an incident, or past their deadline without one) that ended in an incident; null when none is decided |

The alert data cover the 30 days of op.exp.7's reconciliation up to the generation, not the whole period; the trace says so.

### 9.7 Resources

| Field | Content |
|---|---|
| `resources.cycles` | Cycles of the register consolidated in the period |
| `resources.hours_internal` | Sum of `horas_internas` of those cycles |
| `resources.hours_external` | Sum of `horas_externas` |
| `resources.budget_executed` | Sum of `presupuesto_ejecutado` (euros) |
| `resources.ict_budget_total` | Total ICT budget declared for the period (euros) |
| `resources.ict_staff_total` | Total ICT staff declared (people, full-time equivalents) |
| `resources.security_staff` | Security staff declared |
| `resources.budget_pct_of_ict` | Executed budget over the total ICT budget |
| `resources.security_staff_pct_of_ict` | Security staff over the total ICT staff |

### 9.8 Measurement reliability

| Field | Content |
|---|---|
| `measurement.coverage_pct` | Monitoring coverage of op.mon.2 EV-04 |
| `measurement.controls_not_evaluable` | Controls with requirements left unevaluated for lack of configuration; the trace lists them |
| `measurement.last_cycle` | Last cycle of the cycle register |
| `measurement.last_cycle_implementation_pct` | `implantacion_global` of that cycle, declared data |

## 10. API

| Route | Who | Use |
|---|---|---|
| `GET /api/ensfacil/annual-report` | Any user who can read the evaluation | Open period; `?period=YYYY` a period; `?period=YYYY&revision=N` an earlier frozen revision |
| `POST /api/ensfacil/annual-report/freeze` | `ensfacil_admin` or `all_access` | Body `{ "period": "YYYY", "reason": "…", "expectedRevision": N or null }` |

While the evaluation of all controls is being computed, the read returns `pending: true` without a data set; the panel asks again every 5 seconds.

## 11. Limitations

| Limitation | Consequence |
|---|---|
| The fields of the INES questionnaire are not confirmed | The ids are ENSFácil's; the mapping to the questionnaire is made when it is available |
| op.exp.7's alert reconciliation covers 30 days | `incidents.alerts_*` and the alert-based MTTD do not span the whole period |
| op.exp.9 and op.mon.3 require the 13-column header of the incident register | Do not add `fecha_ocurrencia` on a manager with those runbooks until they accept it |
| The engine recomputes with live facts | A period without a freeze does not reproduce the figures of its closing; a late freeze carries the figures of the day it was requested |
| One ENSFácil is one system | The list of systems of an organisation with several is put together with one report per installation |
