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
| `active` document created | [Installation from scratch, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration). Without it, a record returns 409 «Todavía no hay configuración ENS guardada» |
| Backup of the `active` document before changes from the server | [Installation from scratch, section 14.2](01-installation-from-scratch.en.md#142-back-up-the-document-before-changing-it) |

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
| L2 | Recurrent facts without gaps | Automatic | Every machine that measures the control has facts on each of the last 7 whole days (daily period) |
| L3 | Mandatory parameters complete | Automatic | The control is in the active configuration and no mandatory parameter is missing or invalid |
| L3 | Procedure documented and disseminated | Documentary | The recorded procedure (section 6) is complete, has a usable link, is approved and still valid |
| L3 | Evidence continuous without gaps | Automatic | Every machine has facts on every whole day of the window and every applicable requirement is evidenced |
| L4 | Threshold defined and watched | Declared and measured | A compliance threshold is declared; the reason says whether the current score is within it or deviating |
| L4 | Periodic reviews recorded | Declared and measured | The last recorded review is not older than the declared period (365 days by default) |
| L5 | Historical series with an improving trend | Automatic | In the last 180 days there are at least 90 days and 10 snapshots (section 10), and the mean of the second half exceeds the first, or the score stays at 100 % |
| L5 | Feedback closed with a procedure change | Documentary and declared | A recorded lesson or deficiency (section 7.3) is closed with a procedure version approved after it was opened |

Rules:

- Red and grey do not set L0. A grey control (it could not be measured) does not accredit L2 or above from the evidence. A machine that stops sending data prevents L2 even if the others report: the reason names the machine and the days without facts.
- An evidence that never arrives while the collector reports daily does not prevent L2: it prevents L3 (requirements without evidence).
- A control in draft (`DRAFT`) shows «Sin medición todavía» and has no accredited level. Its assessed level can still be recorded.
- A control that does not apply at the ENS level (every requirement above it) shows «no aplica en este nivel» and is left out of the distribution.
- The evaluation window is the one in Configuration > General. With «Últimas 24 horas» there are no whole days, and neither L2 nor above is accredited.

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
2. Enter the date, the reviewer, the result («Conforme», «Con desviaciones» or «No conforme») and the actions. Actions are mandatory when the review is not conforming.
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

The assessment keeps the accredited level of that moment. If the accredited level changes later, the mark is recomputed with the current level.

## 9. History

What is recorded goes to `configuration.maturity` of the `active` document in `wazuh-ens-configuration`, per control and in append-only lists: procedures, reviews, assessments, thresholds and feedback. Each entry carries `recordedAt` and `recordedBy`, set by the server.

- Nothing is overwritten or deleted: the current entry is the last one.
- Each record leaves the previous version of the document in the configuration history and a line in `auditTrail` («Madurez de op.acc.1: nivel valorado L3.»).
- Saving Configuration always keeps the stored maturity, even if the browser sends it different or does not send it.
- If the configuration changed since the page was opened, the record is refused (409) with «La configuración ha cambiado desde que la abriste». Reload the page and repeat it.

Read the recorded maturity from the server (variable `IDX` from [installation from scratch, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration)):

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  "$IDX/wazuh-ens-configuration/_doc/active?filter_path=_source.configuration.maturity&pretty"
```

Expected result: one object per control with the lists `attestations`, `reviews`, `assessments`, `indicators` and `feedback`, from the oldest entry to the newest. With nothing recorded, `{}`.

## 10. Daily snapshots

The `wazuh-ens-snapshots` index keeps one snapshot per control and day: status, score, coverage, applicable and measured requirements, applicable ENS level, accredited level, assessed level and target. The series feeds the L5 trend and the annual report.

- The server evaluation writes it when a user with the `ensfacil_admin` or `all_access` role opens a whole-organisation view (Vista general, panel, control list or a control's detail) and the result is complete and current. A view narrowed by another user's permissions does not set the organisation's series.
- The id is `<control>|<YYYY-MM-DD>`, with the day in the time zone of Configuration > General: evaluating again the same day replaces that day's document, never duplicates it. A day with no administrator view has no snapshot.
- Retention: 1095 days (three years). Older ones are deleted on the first write of each day.

Read a control's snapshots:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  -H 'Content-Type: application/json' "$IDX/wazuh-ens-snapshots/_search?pretty" \
  -d '{"size":400,"query":{"term":{"controlId":"op.acc.1"}},"sort":[{"date":"asc"}]}'
```

Expected result: one document per day with `date`, `status`, `score`, `accredited`, `assessed` and `target`.

From the dashboard, with a session and the administration role: `GET /api/ensfacil/maturity/snapshots?from=YYYY-MM-DD&to=YYYY-MM-DD[&controlId=…]`, at most 400 days per request.

## 11. Report

Each control's report, on screen and in PDF, carries after the result the «Madurez del proceso (CMM)» block: the assessed, accredited and target levels, the mark and the justification when assessed above the accredited level, the gates with their reason, the procedure, the last review, the threshold, the feedback and the methodological note (operational traffic light, normative maturity). The block is the same for every catalog control, including those added later.

The overview shows under each control its level («L2 acr. · obj. L3»: accredited, not assessed) and the «Madurez de la organización» table; the panel shows the same table.

## 12. Compatibility and rollback

- A 1.3.0 plugin loads a document with `maturity` and `global.maturityTargets`: it does not read them. Back on 1.4.0, the recorded maturity is still in the document or, if a 1.3.0 save removed it, in the configuration history (restore it with the [troubleshooting and rollback guide, section 7](04-troubleshooting-and-rollback.en.md#7-restore-the-ens-configuration)).
- No earlier version reads the `wazuh-ens-snapshots` index. To remove it:

  ```bash
  sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
    -X DELETE "$IDX/wazuh-ens-snapshots"
  ```

  Expected result: `{"acknowledged":true}`. The L5 trend starts again from zero.
