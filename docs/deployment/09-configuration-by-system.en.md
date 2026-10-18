# Configuration by system and templates

This guide describes the configuration by system introduced in ENSFácil 1.2.0: the two levels of the Configuración screen, the detection of each system's type, the templates, value inheritance, the migration of an earlier configuration and the declaration of per-system values from the server.

## 1. Objective

Declare the common policy once, at organisation level, and declare in each system in scope only what belongs to that machine (its accounts, services, paths, criticality or owner) or to its platform (Linux, Zimbra LDAP server, Windows, Wazuh manager).

## 2. Prerequisites

| Requirement | Check |
|---|---|
| ENSFácil plugin 1.2.0 or later deployed | ENSFácil > Configuración shows the «Organización» and «Sistemas» tabs |
| User with the `ensfacil_admin` or `all_access` role | A save from Configuración does not return the 403 error ([installation from scratch, section 13.5](01-installation-from-scratch.en.md#135-create-the-ensfacil_admin-role)) |
| `active` document created and controls seeded | [Installation from scratch, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration) |
| Backup of the `active` document before each change from the server | [Installation from scratch, section 14.2](01-installation-from-scratch.en.md#142-back-up-the-document-before-changing-it) |

> [!note]
> The ENS scope (which agents are included) is not edited in Configuración: it is defined in the [initial setup](https://gitlab.com/quersystem/ens-controls-runbook/initial-setup). The «Sistemas» tab lists the agents of that scope.

## 3. The two levels of Configuración

Each parameter of each control belongs to one of three classes. The classification is unique and is used by the screen, the evaluation, the validator and `set-parameters.py`; it lives in `public/ens/configuration/agents/parameter-classes.ts`.

| Class | What it describes | Parameters (23 controls) | Where it is declared |
|---|---|---|---|
| Organisation | Common policy: periodicities, thresholds, roles, registers, procedures, documents, cloud, continuity plan | 163 | «Organización» tab, in each control's page |
| Per system | The state of one specific machine: its accounts, services, paths, ACLs, keys, backup schedule, criticality or owner | 41 | «Sistemas» tab, inside each agent |
| Per platform | What depends on the operating system or product and is the same on every machine of that platform | 35 | «Sistemas» tab, inside each agent, usually through a template |

In a control's page on the «Organización» tab, the organisation parameters are shown first, and the control status («Configurado», «Configuración incompleta») is computed from them only. Per-system and per-platform parameters appear in the «Valores que heredan los sistemas» drop-down: their value is the one inherited by a machine without its own value or a template that sets it.

## 4. How a value is resolved

To evaluate a control on a machine's row, each per-system or per-platform parameter takes the first value available in this order:

1. the agent's own value;
2. the value of its templates, in the order they are applied (the first template that sets the parameter wins);
3. the organisation value.

Organisation parameters always come from the organisation.

Resolution rules:

- The **whole** parameter is replaced: an agent's table replaces the organisation's table, rows are not merged. This is the same rule as `set-parameters.py`.
- Per-system parameters that describe **other** machines in a control measured on the manager are resolved by **union**: on the manager's row, the value is the organisation value plus the rows of each agent (own value or template value), without duplicates. These are op.exp.7 P-04 and P-07, op.cont.3 P-07, op.mon.1 P-01 and, on the manager's row, op.exp.8 P-02 and op.mon.3 P-01, P-03 and P-07.
- The declared scope of mp.info.6 (P-04) is also resolved by union, on every row: the engine reads it whole to know on which machines the control is measured.
- Without per-system values, the evaluation receives exactly the organisation configuration, and the verdicts are the same as in 1.1.0.

The screen shows the origin of each value of a system: «valor propio de este sistema» (own value), «heredado de la plantilla …» (inherited from a template), «heredado de la organización» (inherited from the organisation) or, in a union, «este sistema no aporta filas propias» (this system contributes no rows).

## 5. System type detection

The «Sistemas» tab detects each agent's type with the first rule that applies:

| Order | Rule | Type | Evidence shown |
|---|---|---|---|
| 1 | The agent id is `000` | Manager | «el id 000, que en Wazuh es siempre el manager» |
| 2 | `os.platform` is `windows` in the agent inventory | Windows | «os.platform = windows en el inventario de agentes» |
| 3 | There are ENSFácil facts with `data.plano = directorio` in the last 30 days | LDAP (Zimbra) | «N hechos del recolector LDAP (data.plano = directorio) en 30 días» |
| 4 | `os.platform` belongs to the Linux family, or `os.uname` starts with «Linux» | Linux | «os.platform = ubuntu en el inventario de agentes» |
| 5 | `os.platform` has a value other than the above | Not detected | «os.platform = …: no es un tipo previsto; se elige a mano» |
| 6 | The inventory has no operating system | Not detected | «el inventario no trae su sistema operativo …; se elige a mano» |

In addition, mp.info.6 facts with `data.origen = pbs` propose the «Copias con PBS» add-on, and those with `data.origen = zimbra-ne`, the «Copias Zimbra NE» add-on. Proposing a template does not apply it.

The inventory comes from `wazuh-monitoring-*` and the facts from a single aggregation over `wazuh-alerts-*` for the last 30 days, without downloading documents.

> [!note]
> A newly installed Zimbra LDAP server, still without facts, is detected as Linux: in the inventory it is just another Ubuntu. Correct it by hand with the following procedure.

### 5.1 Correct the type by hand

1. Open ENSFácil > Configuración > Sistemas and click the agent.

   Expected result: the agent's page opens with the «Tipo de sistema» field and, below it, the text «detectado por …».

2. Choose the type in «Tipo de sistema».

   Expected result: the text changes to «corregido a mano (detectado: …, por …)» and the list of systems shows the new type.

3. To go back to the detected type, choose «El detectado: …».

   Expected result: the text changes back to «detectado por …».

The corrected type decides which template is proposed and, on Windows, which controls count towards completeness. It does not change any value by itself.

## 6. Templates

A template sets per-platform parameters and, when a grounded value exists, seeds per-system parameters. It never touches an organisation parameter. Each value comes from an example in the seed block, from a runbook's `.env.example` or configuration template, or from a real laboratory value without what belongs to another platform or to that installation. What cannot be grounded stays without a value. Templates ship with the plugin: they change with its version, and the document stores which templates each agent has, not a copy of their values.

| Template | Kind | What it sets | What it leaves without a value |
|---|---|---|---|
| Linux Ubuntu | platform | op.acc.1 P-01 `Local`, P-03 Ubuntu system accounts, P-10 `1000`, P-11; op.acc.2 P-02 critical paths, P-10 Ubuntu 22.04 and 24.04 SUID, P-11, P-12; op.acc.3 P-03; op.acc.4 P-06; op.acc.6 P-03, P-07, P-08, P-11; op.exp.2 P-03; op.exp.3 P-01, P-04; op.exp.4 P-03, P-05; op.exp.6 P-01, P-04, P-07; op.exp.8 P-01, P-03, P-08; op.exp.10 P-02, P-08 | op.acc.4 P-04 (each organisation's SSH port and origin), op.exp.2 P-01 (the first column names the machine), op.exp.6 P-08 |
| Servidor LDAP Zimbra | platform | Everything in «Linux Ubuntu» plus: op.acc.1 P-01 `LDAP` and the `zimbra` and `ldapcopy` accounts; op.acc.2 P-02 with `/opt/zimbra/conf/localconfig.xml` and P-12 without `adm`; op.acc.6 slapd channel and exposure; op.exp.2 P-03 Zimbra `admin`; op.exp.3 P-04 and op.exp.6 P-07 with the Zimbra paths; op.exp.4 P-03 with Zimbra; op.exp.8 P-01 and P-03 with slapd | The Zimbra accounts with a random suffix (`spam.*`, `ham.*`, `virus-quarantine.*`, `galsync.*`): they belong to each installation and are declared as an own value |
| Windows Server | platform | op.acc.1 P-11 and op.acc.4 P-06 `Administrators` | op.acc.1 P-01 (standalone or domain member), op.acc.1 P-10 and op.acc.2 P-07, P-10 and P-11 (Linux only), op.acc.4 P-04 (the allowed origin). Only op.acc.1, op.acc.2, op.acc.3 and op.acc.4 have a Windows collector: the other controls are not measured on this platform, which is not a non-compliance |
| Manager Wazuh | platform | op.exp.8 P-01 and P-03 (auditd) and P-08 (`root`, `syslog`, `wazuh`, `wazuh-indexer`) | The rest of what is measured on the manager is organisation policy |
| Copias con PBS | add-on | mp.info.6 P-06 `/backup`, P-07 `root`, P-10 `pbs`, P-11 PBS key, P-12 `root.pxar`, P-13 restore witness | — |
| Copias Zimbra NE | add-on | mp.info.6 P-06 `/opt/zimbra/backup`, P-07 `zimbra`, P-10 `zimbra-ne` | mp.info.6 P-11, P-12 and P-13 (PBS only) |

Application rules:

- A machine has a single platform template: applying another one replaces the previous one and keeps the add-ons.
- «Copias con PBS» and «Copias Zimbra NE» do not combine: the plugin rejects the second one and states why. Zimbra 10 Network with zmbackup is never mixed with PBS.
- Platform templates go before add-ons; in the resolution, the first template that sets each parameter wins.

### 6.1 Apply a template to one or several systems

Before saving, the plugin shows a preview per system: how many parameters change their effective value and which ones, what the template sets, which own values keep winning and, if the template is not meant for the system's type or replaces another platform template, the warning. With a warning, the confirmation requires typing `aplicar`.

1. Open ENSFácil > Configuración > Sistemas.

   Expected result: the table of systems with their type, templates and completeness, and the template drop-down on «Elegir plantilla…».

2. Tick the systems, choose the template in the drop-down above the table and click «Aplicar a N sistema(s) seleccionado(s)…».

   Expected result: the «Aplicar «…» a N sistema(s)» window with one section per system. A system that does not accept the template shows «No se aplica: …».

3. Review each system and click «Aplicar la plantilla»; if «Tipo distinto» or «Sustituye a la plantilla …» appears, type `aplicar` first.

   Expected result: the notice «… aplicada a …», the template in the «Plantillas» column of each system, and the checkboxes cleared.

4. For a single system, open the agent, choose the template in the «Plantillas aplicadas» drop-down and click «Aplicar…». The one proposed for its type carries «(propuesta)» and is updated when detection completes; a platform template that would replace another carries «(sustituye a «…»)».

   Expected result: the same preview for that system; after confirming, the template in «Plantillas aplicadas» and the parameters it sets with «heredado de la plantilla …».

5. To remove a template, click the cross on its badge in «Plantillas aplicadas».

   Expected result: the badge disappears and those parameters inherit again from another applied template or from the organisation, except those with an own value.

## 7. Own values of a system

Inside each agent, per-system and per-platform parameters are grouped by control. Each one shows its class («por sistema» or «por plataforma»), whether it is mandatory at the control's level, and the origin of its value.

1. Open the agent and expand the control.

   Expected result: each parameter with its effective value and its origin.

2. Click «Dar valor propio» (or «Editar» if it already has one), type the value and click «Guardar para este sistema».

   Expected result: the origin changes to «valor propio de este sistema». A value that is not valid for the parameter is rejected with the reason and not saved.

3. To inherit again, click «Quitar valor propio (vuelve a heredar)», or empty the field and save.

   Expected result: the origin changes to «heredado de la plantilla …» or «heredado de la organización».

Save rules, which the editor states before saving:

- An empty value is not saved as an own value: the system inherits again. A system therefore cannot declare «no rows» to stop inheriting an organisation table; if a machine must not inherit a row, the row is removed from the organisation and declared on the machines it applies to.
- A value equal to the one the system already inherited is not saved as its own: it keeps following its origin when that changes.
- Saves on the same page run in order and on the latest version of the document: two changes in a row do not overwrite each other.

Per-system parameters of a control measured on the manager (op.exp.7 P-04 and P-07, op.cont.3 P-07, op.mon.1 P-01, op.exp.8 P-02 and op.mon.3 P-01, P-03 and P-07) and the declared scope of mp.info.6 describe machines: each system declares only its own rows. The page shows the organisation rows separately and read-only under «De la organización», and the button is «Declarar filas de este sistema»: the editor starts from what the system already contributes, not from the organisation rows. The manager's page also shows «Lo que se evalúa en esta fila», the complete union.

Each save writes the whole document; the server stores the previous version in the history and an entry in `auditTrail`.

### 7.1 Remove values that do not apply

A profile can hold values that do not apply: one for a parameter the control no longer declares (after seeding with `inject-control.py`), one for a control that is not in the configuration, or one for an organisation parameter. The agent's page lists them under «Valores de este sistema que no se aplican», and the «Sistemas» tab under «Valores por sistema que hay que corregir».

1. Click «Quitar» next to the value.

   Expected result: the value disappears from the list and from the document; the rest of the profile is kept.

What this version does not know (a profile key saved by a later version) is ignored and listed under «Claves que esta versión no conoce (se ignoran)»: it is not an error and it is not removed.

### 7.2 Other names of a machine

The migration (section 8) recognises a machine by its id, its agent name and its hostname. If the tables name it differently, that name is declared on its page.

1. Type the names in «Otros nombres de esta máquina», separated by commas, and click «Guardar otros nombres».

   Expected result: the names stay in the field after saving, and the «Sistemas» tab stops warning about the rows that use them and offers them in «Migrar a sistemas».

## 8. Migration to systems

Before 1.2.0, what belonged to one machine was declared at organisation level: tables with a column that names the system (`sistema`, `activo`, `equipo`, `servidor`, `perfil`, `ambito`…) and lists that mix machines. The migration copies those rows to each machine without losing any and without leaving any machine without a value:

- Rows of tables with a system column that name an agent are **copied** to that agent. The agent is recognised by its id, its name, the `os.uname` hostname, the short form of both (before the first dot) and its other names (section 7.2), case-insensitively.
- A copied row **leaves** the organisation only if no machine in scope that evaluates the control is left without a value: if the parameter is optional, or if each of those machines ends up with an own, template or union value. Otherwise the row also stays in the organisation, and machines without their own rows keep inheriting today's table.
- `*` rows stay in the organisation and are also copied to the agent that receives its own rows, because its own value replaces the organisation value.
- Rows that name no agent, or several, stay in the organisation and are listed as warnings.
- Two rows are the same only if they are identical: case matters (`Ana` and `ana` are two accounts).
- Scope lists (mp.info.6 P-04, op.acc.1 P-02, op.acc.2 P-01), per-system tables without a system column (paths, ACLs, privilege matrices) and lists that mix platforms are not touched: they are distributed in each agent or through a template.
- Nothing is deleted: an organisation parameter left without rows loses its `value` key (`null` is never written), and the previous version of the document stays in the history.
- It is idempotent: on an already migrated document it changes nothing.

The «Sistemas» tab computes the migration when it loads, without writing: if there are rows to copy, it shows «Hay valores de organización que son de un sistema concreto», the summary (how many rows leave the organisation and how many are copied), the detail under «Ver qué se mueve y qué se copia» and the «Migrar a sistemas» button. Warnings about rows without an agent are shown whenever they exist.

### 8.1 Migrate

1. Back up the `active` document as in [installation from scratch, section 14.2](01-installation-from-scratch.en.md#142-back-up-the-document-before-changing-it).

   Expected result: `COPIA_OK`.

2. Open ENSFácil > Configuración > Sistemas and review «Ver qué se mueve y qué se copia» and the warnings.

   Expected result: each line states agent, control, parameter, number of rows and whether they leave the organisation or are copied; each warning states the row and the name that does not match.

3. Click «Migrar a sistemas».

   Expected result: the «Migrar a sistemas» window with, per system, what moves and what is copied; «Parámetros que se quedarían sin valor en alguna máquina del alcance: ninguno»; the notice that those machines' verdicts can change; the notice that a 1.1.0 plugin stops seeing the rows that leave the organisation; and the notice that the previous version stays in the history.

4. Type `migrar` and click «Migrar».

   Expected result: the notice «Migración a sistemas: … La versión anterior queda en el historial.» and the migration block disappears. Warnings about rows without an agent remain visible.

5. Validate the whole document (section 11.2).

   Expected result: `ESTRUCTURA VÁLIDA` and `VALORES POR SISTEMA VÁLIDOS.`

6. For a row that names a machine in scope under another name, declare that name on the machine (section 7.2) and repeat steps 2 to 5.

   Expected result: the warning for that row disappears and the row appears under «Ver qué se mueve y qué se copia» in step 2.

## 9. Catalog controls not yet added

The «Organización» tab lists, under «Controles del catálogo sin añadir», the controls that exist in the plugin version but are not in the document. They are not evaluated until they are added.

1. Click «Añadir con valores por defecto» on the control, or «Añadir los N con valores por defecto».

   Expected result: the control appears in «Controles configurables» with its parameters without values (except its block's `defaultValue`s), and disappears from the list of controls not yet added.

2. Declare its mandatory parameters.

   Expected result: the control status changes to «Configurado» once all of them are declared.

The button adds the control definition as is, the same as the seed block in `config/`, just as `inject-control.py` does with a control that was not present. It does not change the other controls or the per-system values. To merge an existing control with a new version of its block, `inject-control.py` is still used ([updating an existing environment, section 8](02-updating-an-existing-environment.en.md#8-seed-and-validate-the-configuration)).

> [!note]
> While a mandatory control has parameters without values, its evidences stay `NO_EVALUABLE` with cause `CONFIGURATION`. Missing information is not compliance.

## 10. Open a control from the URL

The Configuración tab opens on a control, an agent or a parameter with these parameters of the ENSFácil URL. The Control detail uses them to link to the control's configuration.

| URL (query) | Opens |
|---|---|
| `?tabView=configuration&configControl=op.acc.1` | «Organización», op.acc.1 page |
| `?tabView=configuration&configControl=op.acc.1&configParam=P-04` | The same page, with the form open on P-04 |
| `?tabView=configuration&configView=sistemas` | «Sistemas», list of systems |
| `?tabView=configuration&configAgent=001` | «Sistemas», page of agent 001 |
| `?tabView=configuration&configAgent=001&configControl=op.acc.1&configParam=P-07` | Agent 001's page with op.acc.1 expanded and P-07 in edit mode |

If the control is not in the document, the «Organización» tab says so and highlights it under «Controles del catálogo sin añadir»; if it is not a catalog control at all, it says so. An agent that is neither in the inventory nor in the configuration opens with a warning. After saving the parameter the URL asked for, the editor closes and the URL stops asking for it. Navigation inside Configuración updates the URL, so the browser's back button returns to the previous view; switching to another ENSFácil tab drops the Configuración control and agent from the URL.

## 11. From the server

The tools in `config/` run with the indexer administrator certificate, as in [installation from scratch, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration):

```bash
CERT="OS_CERT=/etc/wazuh-indexer/certs/admin.pem OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem"
```

### 11.1 Declare a system's values with set-parameters.py

Besides organisation values, `set-parameters.py` accepts an `agents` section with each machine's own values, by Wazuh agent id:

```json
{
  "op.acc.1": { "P-04": ["admin", "test"] },
  "agents": {
    "001": {
      "op.acc.1": { "P-07": ["usuario1 | servidor1 | Administrador de sistema"] },
      "op.exp.4": { "P-04": null }
    }
  }
}
```

Rules:

- The key is the agent id; `7` is normalised to `007`. A name is rejected with `"<name>" no es un id de agente; usar el id …` and, if the document already knows that name (as a profile's name or other names), with its id.
- Only per-system and per-platform parameters accept a per-agent value; an organisation parameter is rejected.
- Empty means no value: `null`, `""` and `[]` remove the agent's own value, which inherits again, and at organisation level they remove the `value` key. `null` is never written to the document.
- Removing is always accepted, also for a value that does not apply: a parameter the control no longer declares, an organisation parameter or a control that is not present.
- As for the organisation, the value of each named parameter is replaced whole.
- The tool reads the classification from `public/ens/configuration/agents/parameter-classes.ts`: run it from `config/` inside the complete plugin repository.

```bash
cd /opt/ensfacil/repo/config
sudo env $CERT python3 set-parameters.py /path/systems.json            # plan
sudo env $CERT python3 set-parameters.py /path/systems.json --apply    # write
```

Expected result: without `--apply`, one line per change under `── agente 001` and `DRY-RUN: nada escrito`; with `--apply`, `Versión anterior guardada en: historial de wazuh-ens-configuration (…)` and `<n> cambio(s) escritos en wazuh-ens-configuration/active`. For a control that is not seeded, a parameter that does not exist, an organisation parameter, a name instead of an id or a value with an impossible shape, the tool prints `ERROR:` and writes nothing.

> [!note]
> In Docker ([Wazuh in Docker, section 10](06-wazuh-in-docker.en.md#10-declare-the-policy-t-and-d-levels)), the `agents` section needs the complete repository mounted: `-v <repo>:/repo:ro -w /repo/config` instead of `-v <repo>/config:/cfg:ro -w /cfg`.

### 11.2 Validate the document

`config/validate-configuration.ts` also checks per-system values ([installation from scratch, section 14.4](01-installation-from-scratch.en.md#144-validate-the-whole-document)):

```bash
cd /opt/ensfacil/repo
npx --yes tsx config/validate-configuration.ts /opt/ensfacil/artifacts/active-now.json
```

Expected result: `ESTRUCTURA VÁLIDA: el plugin cargará esta configuración.`, one line per agent with its type, templates and own values, and `VALORES POR SISTEMA VÁLIDOS.` Without per-system values, the line is `valores por sistema: ninguno (todo se evalúa con el valor de la organización)`.

| Message | Meaning | Action |
|---|---|---|
| `ESTRUCTURA INVÁLIDA` with `configuration.agents…` | A `null` value or an object in an agent, or a known field with the wrong type: the plugin does not load the environment | Restore the backup and fix the agent indicated |
| `VALORES POR SISTEMA INVÁLIDOS` with «no se aplica» | A profile saved under a name instead of an id, a control or parameter that does not exist, or an organisation parameter: the value is ignored | Remove it with «Quitar» (section 7.1) or with `set-parameters.py` and `null` |
| `VALORES POR SISTEMA INVÁLIDOS` with «se evalúa con una configuración inválida» | A value that is invalid for its parameter: that machine is evaluated with an invalid configuration | Fix the value in the agent's page or with `set-parameters.py` |
| `VALORES POR SISTEMA INVÁLIDOS` with a template | A template that does not exist in this version, or two that do not combine | Remove the template in the agent's page |
| `avisos (…): claves que esta versión no conoce y que ignora` | Keys from a later plugin version | None: they do not change the exit code |

### 11.3 Seed controls

`inject-control.py` keeps `configuration.agents` on every seed, also with `--sustituir`. If the block no longer declares a parameter and an agent had an own value for it, the plan shows, when merging and when replacing, `AVISO: valores por agente de parámetros retirados, quedan huérfanos: …`; those values do not apply and are removed as in section 7.1. Seeding a new control creates no per-system values.

## 12. Compatibility and rollback

- Per-system values live in a new top-level key, `configuration.agents`. `controls[].parameters[].value` remains the organisation value, which is what a 1.1.0 plugin and the scripts read.
- A 1.1.0 plugin loads a 1.2.0 document: its validator does not check unknown keys, ignores `agents` and evaluates with the organisation values. A save from a 1.1.0 plugin keeps `agents`, because it sends the whole document back.
- Likewise, 1.2.0 ignores, with a warning, the keys a later version stores in a profile: going back to 1.2.0 from a later version does not prevent the environment from loading.
- The 1.2.0 server rejects with the 400 error a save whose `agents` does not have the right shape or stores a profile under a key that is not an id, and keeps the existing `agents` when the body does not carry the key.
- **Each version of the document goes into the history before it is replaced**, whoever writes: the server adds it to the history if it is not already its latest entry (for example, because `inject-control.py` or `set-parameters.py` wrote it), also for the migration; and both tools store the version they replace before writing, in the history with the same format as the plugin or, if the index does not accept it, in a local file `active-antes-<date>.json` in the directory they run from. Both print where it went with `Versión anterior guardada en: …`.
- Going back to 1.1.0 only requires deploying its zip ([installing from a release, section 15](07-installing-from-a-release.en.md#15-change-version-or-uninstall)). After the migration, the rows that left the organisation are no longer in it and a 1.1.0 does not see them; the copied ones remain.

To recover in 1.1.0 the configuration from before the migration, restore the backup from section 8.1, step 1, as described in the [troubleshooting and rollback guide](04-troubleshooting-and-rollback.en.md#7-restore-the-ens-configuration). Without that backup, use the version in the history:

1. List the latest versions in the history:

   ```bash
   C="--cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem"
   sudo curl -sk $C "https://127.0.0.1:9200/wazuh-ens-configuration/_search?q=documentType:CONFIGURATION_HISTORY&sort=createdAt:desc&size=10&filter_path=hits.hits._id,hits.hits._source.createdAt,hits.hits._source.createdBy,hits.hits._source.configuration.changeReason&pretty"
   ```

   Expected result: the versions from newest to oldest, with their `_id`. The one before the migration is the one right after the version whose `changeReason` is «Migración a sistemas: …».

2. Copy it as the active document, with the `_id` from step 1:

   ```bash
   ID=<_id of the version before the migration>
   sudo curl -sk $C "https://127.0.0.1:9200/wazuh-ens-configuration/_doc/$ID" -o /opt/ensfacil/artifacts/historial.json
   sudo python3 -c "import json,sys; d=json.load(open(sys.argv[1])); s=d['_source']; s['documentType']='ACTIVE_CONFIGURATION'; json.dump({'_source': s, 'found': True}, open(sys.argv[2],'w'), ensure_ascii=False)" \
     /opt/ensfacil/artifacts/historial.json /opt/ensfacil/artifacts/active-desde-historial.json
   ```

   Expected result: the file `/opt/ensfacil/artifacts/active-desde-historial.json`.

3. Restore that file as described in the [troubleshooting and rollback guide](04-troubleshooting-and-rollback.en.md#7-restore-the-ens-configuration), with `COPIA=/opt/ensfacil/artifacts/active-desde-historial.json`.

   Expected result: the response includes `"result":"updated"`.
