# Maturity assessment
[Español](10-maturity-assessment.md)

CMM maturity (L0 to L5) of each control in ENSFácil 1.4.0: level accredited by the evidence, gates of each level, documentary records, assessment by a person, history, daily snapshots and report.

## 1. Purpose

Assess each control as a process, as section 6 of Annex II of RD 311/2022 requires, next to the traffic light and the percentage and never mixed with them. ENSFácil computes the level the evidence accredits; a person confirms or adjusts it with a justification; every change is kept in a history that is never overwritten.

## 2. Prerequisites

| Requirement | Check |
|---|---|
| ENSFácil plugin 1.4.0 or later deployed | A control's detail shows «Madurez: …» next to the traffic light |
| User with the `ensfacil_admin` or `all_access` role to record | A maturity record does not return error 403 ([installation from scratch, section 13.5](01-installation-from-scratch.en.md#135-create-the-ensfacil_admin-role)) |
| Read access to the `wazuh-ens-snapshots` index to see the trend and the snapshots | Section 10.2 |
| Backup of the `active` and `maturity` documents before changes from the server | [Installation from scratch, section 14.2](01-installation-from-scratch.en.md#142-back-up-the-document-before-changing-it) |

## 3. Maturity and traffic light

| Indicator | Question it answers | Who sets it |
|---|---|---|
| Traffic light and percentage | Is there anything to attend to today? (operational) | The engine, from the evidence of the evaluation window |
| Maturity | Is there a process, and how institutionalised is it? (normative) | The accredited level, ENSFácil; the assessed level, a person |

Both are reported together. Green with L2 means the control works without a written procedure; amber with L4, a solid process with a detected deviation being handled.

Maturity belongs to the organisation, not to a machine: it is computed on the result consolidated over every machine in scope and is the same with or without a machine selected.

## 4. Accredited level

The accredited level is the highest one whose gates, and those of every lower level, all pass. The «Madurez» panel shows whether each gate passes and why.

| Level | Gate | Origin | Passes when |
|---|---|---|---|
| L1 | Facts of the control in the period | Automatic | There is a fact of the control in the evaluation window |
| L2 | Recurrent facts without gaps | Automatic | Every machine that measures the control has facts on each of the last 7 whole days (daily period), except those before its first fact |
| L3 | Mandatory parameters complete | Automatic | The control is in the active configuration and no mandatory parameter is missing or invalid |
| L3 | Procedure documented and disseminated | Documentary | The recorded procedure (section 6) is complete, has a usable link, is approved and still valid |
| L3 | Evidence continuous without gaps | Automatic | Every machine has facts on every whole day of the period since its first fact, and in the current evaluation every applicable requirement is evidenced |
| L4 | Threshold defined and watched | Declared and measured | A compliance threshold is declared and checked against the snapshots: with no snapshots, when they cannot be read, or when the latest is more than 2 days old («la última instantánea es del …»), it fails. If the latest is below it, there is a review (section 7.1) dated on or after the first snapshot of that run below the threshold, with actions or with the result «Desviación en tratamiento» |
| L4 | Periodic reviews recorded | Declared and measured | The last recorded review is not older than the declared period (365 days by default) |
| L5 | Historical series with an improving trend | Automatic | In the last 180 days there are at least 90 days and 10 snapshots (section 10), the latest at most 2 days old, and the mean of the second half exceeds the first, or the score stays at 100 % |
| L5 | Feedback closed with a procedure change | Documentary and declared | A recorded lesson or deficiency (section 7.3) is closed with a procedure version approved after it was opened |

Rules:

- Own period: L1 to L3 read the last 30 days of facts of the whole organisation, whatever the screen's evaluation window. L2 and L3 need every whole day of the period: if one predates the oldest fact kept (a recent installation or a short retention), they fail with the reason «Faltan N días de historial» (or «Falta 1 día»). A new installation rises above L1 once it has 30 days of facts. History counts in whole days: it is enough for the oldest fact kept to fall on or before the first whole day of the period, so 30 days of facts suffice when they cover every whole day of the period. Because daily indices follow UTC days, the period's days are local and the oldest index is deleted at a time that is not controlled, with less than 31 days L2 and L3 may not be accredited: ask for a `wazuh-alerts-*` retention of **31 days or more**.
- A machine that enters the scope during the period counts from its first fact (looked up over the last 400 days, one query for all machines, kept 24 hours and repeated when a new machine joins): the reason says so («… desde el …»). When the scope shrinks, the oldest fact is that of the remaining machines. An agent stopped at the start of the window still counts as a gap. If that query fails, every machine counts from the start of the period and the reason says so; it is not repeated for 30 minutes (1, 2, 4 and 8 hours if it keeps failing), except with «Reintentar» or when the day changes.
- Red and grey do not set L0. Only a grey caused by collection (no collector data, or a stopped collector) holds the control at L1. A grey caused by configuration or by the catalog can accredit L2 if the facts recur, as the auditor's table provides; L3 then fails on the parameters or the requirements without evidence.
- A machine that stops sending data prevents L2 even if the others report: the reason names the machine and the days without facts.
- An evidence that never arrives while the collector reports daily does not prevent L2: it prevents L3 (requirements without evidence).
- A control in draft (`DRAFT`, the 11 waiting for a collector) shows «Sin medición todavía» and has no accredited level. Its assessed level can still be recorded; above L0 it needs a justification and is marked «sin medición todavía: se apoya solo en la justificación». It counts as applicable only if one of its requirements applies at the level the control is applied with.
- A control that does not apply at the ENS level (every requirement above it) shows «no aplica en este nivel» and is left out of the distribution.
- The first time a view opens, maturity appears a few seconds after the result («Madurez: calculando…»), like the daily series: reading it never delays the evaluation. After a record or a change of configuration or scope, views (also with a machine selected) show «Actualizando la madurez…» until the new one arrives, without allowing a record over the old one; new facts do not: a machine view shows the last one computed and renews it behind. While the organisation rows are being computed, the view stays on «Actualizando la madurez…», however long it takes. If the computation fails three times and there is no maturity computed for the current records, configuration and scope, the detail, the overview and the panel say «No se ha podido calcular la madurez» with a «Reintentar» button; behind, it is tried again every 5 minutes and the notice goes away with the first good computation. If there is one, it is still shown while retrying.
- When assessing, the server computes the control's accredited level at that moment; if it cannot within 20 seconds, it saves nothing and answers «No se ha podido calcular a tiempo el nivel acreditado del control; vuelve a intentarlo en unos minutos.» (503). If it fails for another reason, it saves nothing either and answers «No se ha podido calcular el nivel acreditado del control» with the reason: no permission to read its data (401 or 403), incomplete data from the indexer (503) or, otherwise, that the details are in the dashboard log (500).

## 5. Target per category

Each control's target is that of the category it is applied with: the ENS level or, for controls applied by dimension, the highest of their dimensions. By default: L2 in BÁSICA, L3 in MEDIA and L4 in ALTA, pending the auditor's confirmation.

1. Open ENSFácil > Configuración > General.
2. In «Objetivo de madurez por categoría», choose each category's level or «Por defecto».
3. Press «Guardar configuración global».

   Expected result: each control's detail shows «objetivo L…» with the new value. The document keeps `global.maturityTargets` only with the declared categories; «Por defecto» removes the key, never leaves it as `null`.

An assessment (section 8) may set another target for one control.

## 6. Record the procedure

The procedure is the control's as a process, one per control and for the whole organisation. It does not replace the `P-ATT` attestations of each requirement.

1. Open the control's detail and, in the «Madurez» panel, press «Registrar el procedimiento».
2. Fill in the fields:

   | Field | Content |
   |---|---|
   | Referencia | Procedure code or title |
   | Versión | Approved version |
   | Enlace | `http(s)://`, `file://` or a network path. The example link is not accepted |
   | Fecha de aprobación | YYYY-MM-DD, not after today |
   | Vigente hasta | YYYY-MM-DD, not before approval. Once expired, the gate fails |
   | Fecha de difusión | YYYY-MM-DD, not before approval |
   | Difundido a | People, groups or lists who received it |
   | Responsable | Person in charge. The field suggests the people in the organisation data |

3. Press «Guardar».

   Expected result: the «Procedimiento documentado y difundido» gate passes with the reference, version and validity in its reason. A new version is recorded the same way; the previous one stays in the history and counts for feedback (section 7.3).

## 7. Reviews, threshold and feedback

### 7.1 Record a review

1. In the «Madurez» panel, press «Registrar una revisión».
2. Enter the date, the reviewer, the result («Conforme», «Con desviaciones», «No conforme» or «Desviación en tratamiento») and the actions. Actions are mandatory with deviations or when not conforming. A review with actions or with «Desviación en tratamiento» treats a threshold deviation (L4).
3. Press «Guardar».

   Expected result: «Última revisión» shows the new one and the «Revisiones periódicas registradas» gate passes if it is within the period.

### 7.2 Declare the threshold and the period

1. Press «Umbral y periodicidad de revisión».
2. Enter the compliance threshold (0 to 100 %) and the review period (1 to 1095 days).
3. Press «Guardar».

   Expected result: the «Umbral definido y vigilado» gate passes and its reason compares the current score with the threshold.

### 7.3 Record feedback

A lesson learnt (op.exp.9.3), an incident (op.exp.7), a test deficiency (op.cont.3), or an audit or review finding that affects the control.

1. Press «Registrar realimentación».
2. Enter the reference, the origin, the description and the opening date.
3. To close it, record the same reference again with the closing date and the procedure version that closes it.
4. Press «Guardar».

   Expected result: «Realimentación» shows the reference as closed. The L5 gate passes if that procedure version is recorded (section 6) with an approval after the opening.

## 8. Assess

1. In the «Madurez» panel, press «Valorar». The form states the level the evidence accredits.
2. Choose the assessed level and, if needed, the control's target. Enter the reviewer and the date.
3. Write the justification. It is mandatory when the assessed level exceeds the accredited one; the server computes the accredited level when saving and refuses an assessment without justification (400).
4. Press «Guardar».

   Expected result: the detail header shows «Madurez: L… (acreditado L…, objetivo L…)». Above the accredited level, the panel and the report mark it with the justification.

The assessment keeps the accredited level and its gates of that moment. The panel and the report always show who assessed and when; the mark «por encima de lo acreditado al registrarlo» uses that stored level. If the evidence later accredits less than then and less than the assessed level, they show «La evidencia acreditaba L… al valorarlo (date); hoy acredita L…: revisar la valoración».

## 9. History

What is recorded goes to its own document, `maturity`, in the `wazuh-ens-configuration` index (`documentType: MATURITY_RECORDS`), with its own version: recording maturity does not change the configuration, and nobody editing it gets a 409 because of it.

- Per control, append-only lists: procedures, reviews, assessments, thresholds and feedback. Each entry carries `recordedAt` and `recordedBy`, set by the server. Nothing is overwritten or deleted.
- Each record also adds a history entry (`documentType: MATURITY_HISTORY`) with the control, the kind, the entry and one line («Madurez de op.acc.1: nivel valorado L3.»).
- Each record sends the version of the document the screen showed (`expectedVersion`, required; `null` when there was none). If it changed since, the record is refused (409) with «La madurez ha cambiado desde que la abriste». Reload the page and repeat it. After a record, open screens refresh on their own.

Read the recorded maturity and its history from the server (variable `IDX` from [installation from scratch, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration)):

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  "$IDX/wazuh-ens-configuration/_doc/maturity?filter_path=found,_seq_no,_source.updatedAt&pretty"
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  -H 'Content-Type: application/json' "$IDX/wazuh-ens-configuration/_search?pretty" \
  -d '{"size":50,"query":{"term":{"documentType":"MATURITY_HISTORY"}},"sort":[{"createdAt":"desc"}]}'
```

Expected result: `"found" : true` with its `_seq_no` (or `false` with nothing recorded), and the latest history entries, newest first.

Back up the document before changes from the server, next to the `active` one:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  "$IDX/wazuh-ens-configuration/_doc/maturity" | sudo tee "/opt/ensfacil/artifacts/maturity-$(date +%Y%m%d-%H%M%S).json" >/dev/null
```

## 10. Daily snapshots

The `wazuh-ens-snapshots` index keeps one snapshot per control and day: status, score, coverage, applicable and measured requirements, applicable ENS level, accredited level, assessed level and target. The series feeds the L5 trend, the L4 deviation and the annual report.

### 10.1 Who writes it

- **The server's daily task**, with the dashboard's internal user: every day at 02:30 in the time zone of Configuration > General (Europe/Madrid when none is set; 03:30 on the spring clock-change night) and, 10 minutes after the dashboard starts, once more only if the day has no snapshot yet. It runs a complete evaluation of the whole organisation (its own, without touching the users' memory), waits for it to finish and writes the day. It writes only when the evaluation is complete and every read (facts, each machine's first fact, snapshots) succeeded: if anything fails, or the indexer refuses the write, it writes nothing that day, warns in the dashboard log every time and tries again after 30 minutes and, if it keeps failing, after 1, 2, 4 and 8 hours, as long as the attempt falls before 23:00; otherwise, the next day at 02:30. To recover, fix the cause (the internal user's permissions, an indexer disk in read-only mode): the next attempt writes the day, with no restart. On Wazuh the internal user has the built-in `manage_wazuh_index` role (read, write, delete and manage on `wazuh-*`), which is enough to create the index, write and purge; the index template also needs the cluster permission `indices:admin/index_template/put` (without it the log warns and the index is still created with its types).
- Only the task writes it: no view does, not even an administrator's. The task reads the facts and the snapshots at that moment (never from memory) and its evaluation does not compute the daily series.
- One for each catalog control, including those in draft (they carry their assessed level). The id is `<control>|<YYYY-MM-DD>`, with the day in the time zone of Configuration > General: writing again the same day replaces that day's document, never duplicates it.
- Retention: 1095 days (three years). Older ones are deleted on every run of the task; if the deletion fails, it is retried an hour later.
- The index has a template (`wazuh-ens-snapshots`) with its field types: if it is deleted and a write creates it again, it keeps them.

### 10.2 Who reads it

The L5 trend, the L4 threshold and the read route read the index **as the viewing user**: the index permissions decide who sees the organisation's series. They need `read` on `wazuh-ens-snapshots`:

| Role | Read on `wazuh-ens-snapshots` |
|---|---|
| `all_access`, `readall` (built-in) | Yes |
| `ensfacil_admin` (created with `config/create-admin-role.sh` 1.4.0 or later) | Yes: the role grants it |
| A custom role | If it has `read` on `wazuh-*` or on that index |

Without it, the trend (L5) and threshold (L4) gates fail («no se pueden leer las instantáneas»), the route answers 403 and the dashboard log warns once per user. When assessing, the server computes the accredited level reading the snapshots with its own user: the assessor's permissions never lower the justification bar.

Read a control's snapshots:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  -H 'Content-Type: application/json' "$IDX/wazuh-ens-snapshots/_search?pretty" \
  -d '{"size":400,"query":{"term":{"controlId":"op.acc.1"}},"sort":[{"date":"asc"}]}'
```

Expected result: one document per day with `date`, `status`, `score`, `accredited`, `assessed`, `target` and `recordedBy` («ENSFácil (tarea diaria)»).

From the dashboard, with a session: `GET /api/ensfacil/maturity/snapshots?from=YYYY-MM-DD&to=YYYY-MM-DD[&controlId=…]`, at most 400 days per request.

## 11. Report

Each control's report, on screen and in PDF, carries after the result the «Madurez del proceso (CMM)» block: the assessed, accredited and target levels; who assessed, when and with which justification; the mark when assessed above the accredited level at recording time, or the notice when the evidence accredits less today; the gates with their reason, the procedure, the last review, the threshold, the feedback and the methodological note (operational traffic light, normative maturity). The block is the same for every catalog control, including those added later.

The overview shows under each control its level («L2 acreditado · objetivo L3» or «L3 valorado · objetivo L3») and the «Madurez de la organización» table; the panel shows the same table.

## 12. Compatibility and rollback

- A 1.3.0 plugin does not read the `maturity` document, its history entries or `global.maturityTargets`, and its save does not touch them: back on 1.4.0 they are still there.
- No earlier version reads the `wazuh-ens-snapshots` index. To remove maturity completely:

  ```bash
  sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
    -X DELETE "$IDX/wazuh-ens-snapshots"
  sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
    -X DELETE "$IDX/wazuh-ens-configuration/_doc/maturity"
  ```

  Expected result: `{"acknowledged":true}` and `"result" : "deleted"`. The L5 trend starts again from zero; the `MATURITY_HISTORY` entries stay as a record.
