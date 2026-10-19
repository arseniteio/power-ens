# Configuration by controls and templates

This guide describes the Configuración screen of ENSFácil 1.3.0: its three tabs, the value applied to each agent, each control's templates, the assignment of templates to agents, list input and the «Expresión regular» mode, the conversion of a 1.2.0 configuration and the declaration of templates and settings from the server.

## 1. Objective

Declare each control once: the organisation's common settings, the templates that group the values of each system type and, on each agent, only what belongs to that machine.

## 2. Prerequisites

| Requirement | Check |
|---|---|
| ENSFácil plugin 1.3.0 or later deployed | ENSFácil > Configuración shows the «Controles», «Agentes» and «General» tabs |
| User with the `ensfacil_admin` or `all_access` role | A save from Configuración does not return the 403 error ([installation from scratch, section 13.5](01-installation-from-scratch.en.md#135-create-the-ensfacil_admin-role)) |
| `active` document created and controls seeded | [Installation from scratch, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration) |
| Backup of the `active` document before each change from the server | [Installation from scratch, section 14.2](01-installation-from-scratch.en.md#142-back-up-the-document-before-changing-it) |

> [!note]
> The ENS scope (which agents are evaluated) is not edited in Configuración: it is defined in the [initial setup](https://gitlab.com/quersystem/ens-controls-runbook/initial-setup). The «General» tab shows it read-only and the «Agentes» tab lists its agents.

## 3. Structure of Configuración

| Tab | Content |
|---|---|
| Controles | The 23 catalog controls with their state. In each control: «Ajustes comunes», «Plantillas» and «Asignación» |
| Agentes | The agents in scope with their detected type and completeness. In each agent, control by control: the template it uses and its own settings |
| General | ENS level, Traceability level (T), Availability level (D), the rest of the global configuration and the ENS scope, read-only |

Each parameter of each control belongs to one of three classes. The classification is unique and is used by the screen, the evaluation, the validators and `set-parameters.py`; it lives in `common/ens/configuration/agents/parameter-classes.ts`.

| Class | What it describes | Parameters (23 controls) | Where it is declared |
|---|---|---|---|
| Common (organisation) | Periodicities, thresholds, roles, registers, procedures, documents, cloud, continuity plan | 163 | The control's «Ajustes comunes» |
| Per system | The state of one specific machine: accounts, services, paths, ACLs, keys, backup schedule, criticality or owner | 41 | Template or agent's own setting |
| Per platform | What depends on the operating system or product and is the same on every machine of that platform | 35 | Template or agent's own setting |

Controls op.cont.2, op.exp.9, op.mon.2 and op.nub.1 only have common settings: no templates and no assignment.

## 4. Value applied to an agent

On an agent, each per-system or per-platform parameter takes its own setting; without one, the value of the template assigned in the control or, with no template assigned, that of the built-in template of its type; if the template does not set it, the control's common value.

The «Sin plantilla (valores comunes)» assignment leaves the agent on the common value.

Resolution rules:

- Common parameters always come from the control's common settings.
- The **whole** parameter is replaced: a table from the agent or the template replaces the common one, without merging rows. This is the same criterion as `set-parameters.py`.
- A type's built-in template only applies to agents with the type **stored** in their profile (detected or corrected by hand, section 6.1). With no stored type, the agent takes the common value.
- Per-system parameters that describe **other** machines in a control measured on the manager resolve by **union**: on the manager row, the value is the common one plus each agent's rows (own setting or template), without repeats. They are op.exp.7 P-04 and P-07, op.cont.3 P-07, op.mon.1 P-01 and, on the manager row, op.exp.8 P-02 and op.mon.3 P-01, P-03 and P-07.
- The declared scope of mp.info.6 (P-04) also resolves by union, on every row.
- A value's comparison mode («Texto exacto» or «Expresión regular», section 5.5) travels with the value: the agent takes the mode of the level it takes the value from.
- The resolution is the same in the browser and in the server evaluation.

The screen shows the origin of each value of an agent: «ajuste propio de este agente», «heredado de la plantilla asignada «…»», «heredado de la plantilla de serie «…» de su tipo», «heredado del valor común del control» or, in a union, «este agente no aporta filas propias».

## 5. «Controles» tab

The tab lists the 23 catalog controls with their state and, per control, its built-in templates, its custom templates and the number of agents with a template assigned.

| State | Meaning |
|---|---|
| Configurado | Every required common setting of the control's level has a value, and no agent in scope that evaluates it lacks a required parameter |
| Incompleto | Required common settings are missing («Falta «<parameter>».») or an agent has no value for a required parameter («Falta «<parameter>» en N agentes.») |
| Inválido | A common setting has an invalid value; they are listed below |
| Sin configurar | No common setting has a value |
| Sin añadir | The control exists in the catalog but is not in the document; it is not evaluated |

While the agents are being read, the column shows «Comprobando los agentes…». The per-agent detail is in «Asignación» and on the «Agentes» tab.

### 5.1 Add a catalog control

1. Press «Añadir con valores por defecto» on the control, or «Añadir los N que faltan con valores por defecto».

   Expected result: the control moves to «Sin configurar» or «Incompleto», with its parameters without a value except the `defaultValue`s of its block, and opens with «Abrir».

2. Declare its required common settings (section 5.2).

   Expected result: the state moves to «Configurado».

The button adds the control definition as is, the same as the seed block in `config/`, as `inject-control.py` does with a control that was not present. It does not change the other controls, the templates or the agents' settings. To merge an existing control with a new version of its block, `inject-control.py` is used ([updating an existing environment, section 8](02-updating-an-existing-environment.en.md#8-seed-and-validate-the-configuration)).

> [!note]
> While a required control has parameters without a value, its evidences stay `NO_EVALUABLE` with cause `CONFIGURATION`. Missing information is not compliance.

### 5.2 Common settings

1. Open the control with «Abrir».

   Expected result: the control page with «Ajustes comunes», «Plantillas» and «Asignación».

2. In «Ajustes comunes», press «Configurar <control>» («Completar configuración», «Corregir configuración» or «Revisar configuración», depending on the state), declare the values and save.

   Expected result: the control state is updated. The «Valor común de los parámetros que cambian por agente» drop-down shows the value an agent takes when it has no own setting and no template sets the parameter.

### 5.3 Templates

A template is a named set of values for a control's per-system and per-platform parameters. It never sets a common parameter.

- **Built-in** («De serie»): shipped with the plugin, one per system type in the controls where that type applies, and not editable. Their values come from a seed block example, from a runbook's `.env.example` or configuration template, or from a lab's real value without what belongs to another platform or to that installation. What cannot be grounded stays without a value and the template says so with «Sin valores de serie en este control: se aplican los ajustes comunes».
- **Custom** («Propia»): created, duplicated, edited and deleted in the document (`configuration.templates`).

| Built-in template | Type | Controls | What it sets |
|---|---|---|---|
| Linux | Linux | The controls measured on the machines | op.acc.1 P-01 `Local`, P-03 Ubuntu system accounts, P-10 `1000`, P-11; op.acc.2 P-02 critical paths, P-10 Ubuntu 22.04 and 24.04 SUID, P-11, P-12; op.acc.3 P-03; op.acc.4 P-06; op.acc.6 P-03, P-07, P-08, P-11; op.exp.2 P-03; op.exp.3 P-01, P-04; op.exp.4 P-03, P-05; op.exp.6 P-01, P-04, P-07; op.exp.8 P-01, P-03, P-08; op.exp.10 P-02, P-08 |
| Servidor LDAP | Servidor LDAP | The same as Linux | What «Linux» sets plus: op.acc.1 P-01 `LDAP` and the `zimbra` and `ldapcopy` accounts; op.acc.2 P-02 with `/opt/zimbra/conf/localconfig.xml` and P-12 without `adm`; op.acc.6 slapd channel and exposure; op.exp.2 P-03 Zimbra `admin`; op.exp.3 P-04 and op.exp.6 P-07 with the Zimbra paths; op.exp.4 P-03 with Zimbra; op.exp.8 P-01 and P-03 with slapd |
| Windows | Windows | op.acc.1, op.acc.2, op.acc.3 and op.acc.4 (the only ones with a Windows collector) | op.acc.1 P-11 and op.acc.4 P-06 `Administrators` |
| Manager Wazuh | Manager Wazuh | The controls measured on the manager | op.exp.8 P-01 and P-03 (auditd) and P-08 (`root`, `syslog`, `wazuh`, `wazuh-indexer`) |
| Copias con PBS | Linux | mp.info.6 | P-06 `/backup`, P-07 `root`, P-10 `pbs`, P-11 PBS key, P-12 `root.pxar`, P-13 restore witness |
| Copias Zimbra NE | — | mp.info.6 | P-06 `/opt/zimbra/backup`, P-07 `zimbra`, P-10 `zimbra-ne` |

«Copias con PBS» and «Copias Zimbra NE» are mp.info.6 alternatives: they do not apply by type and are assigned per agent. mp.info.6 backup data (`data.origen = pbs` or `data.origen = zimbra-ne`) proposes them in the assignment with «Propuesta por sus datos». Zimbra 10 Network with zmbackup is not combined with PBS.

The «Plantillas» table shows, per template, the «De serie» or «Propia» badge, its type, how many parameters it sets and, in «Agentes», how many agents it is assigned to and how many it applies to by their type.

#### 5.3.1 Create or duplicate a template

1. To duplicate, press «Duplicar» on a template.

   Expected result: a custom template «<name> (copia)» with every value of the original is saved at once. To change its name or values, then press «Editar» on the copy (section 5.3.2).

2. To create an empty template, press «Crear plantilla», type the name, the description and, where relevant, the system type; declare the values of the parameters it sets and press «Guardar plantilla».

   Expected result: the template appears with the «Propia» badge. A parameter without a value takes the common value. An invalid value is rejected with its reason and nothing is saved; a name already taken by another template of the control, built-in or custom, is also rejected.

The system type of a custom template is informative: when it is assigned to an agent of another type, the preview warns about it.

#### 5.3.2 Edit a custom template

1. Press «Editar» on the template.

   Expected result: the «Editar plantilla · <control>» window with «Asignada a N agente(s): …» when it is in use.

2. Change the values and press «Guardar plantilla».

   Expected result: if the template is assigned, the «Guardar «…»: cambia N agentes» window with, per agent, the parameters that change; after pressing «Guardar plantilla» (type `aplicar` first when asked), the change applies to those agents, except for parameters with an own setting. With no agent assigned, it is saved at once.

Built-in templates only offer «Ver» and «Duplicar».

#### 5.3.3 Delete a custom template

1. Press «Borrar» on the template.

   Expected result: the «Borrar la plantilla «…»» window. If it is assigned, it lists the agents and asks for «Reasignar sus agentes a»: «La de serie de su tipo», another template of the control or «Sin plantilla (valores comunes)».

2. Choose the reassignment, type `borrar` when asked and press «Borrar».

   Expected result: the template disappears and its agents move to the chosen template. A template in use is not deleted without reassigning its agents.

### 5.4 Assignment

The «Asignación» table lists the agents in scope and the stored profiles of agents outside it, with four columns:

| Column | Content |
|---|---|
| Agente | Id and name; opens the agent page on that control |
| Tipo | The stored type or, if it is not stored, «<type> (detectado, sin guardar)» |
| Plantilla | The one that applies: the assigned one, «… (de serie, por su tipo)», «Sin plantilla (valores comunes)», «Ninguna: valores comunes» or, with the type not stored, «Ninguna hasta guardar su tipo: valores comunes» and, with no detected type, «Ninguna: sin tipo, valores comunes»; the one its data proposes; and whether the control is not evaluated on that agent |
| Ajustes propios | How many it has, how many required ones lack a value and whether it is out of scope |

To assign a template to several agents:

1. Tick the agents, choose «La de serie de su tipo», a template or «Sin plantilla (valores comunes)» in the drop-down, and press «Asignar a N agente(s)…».

   Expected result: the «Asignar … en <control> a N agente(s)» window with, per agent, the template change («… → …»), the parameters whose value changes, the own settings that keep winning, the required ones left without a value and, when the template is for another type, the «Tipo distinto» warning.

2. Review each agent and press «Asignar»; if «Tipo distinto» or «Se quedan sin valor parámetros obligatorios» appears, type `aplicar` first.

   Expected result: the template in each agent's «Plantilla» column and the boxes cleared. Own settings are kept.

### 5.5 Lists and regular expressions

In a list field, several items are typed or pasted separated by commas, semicolons or line breaks. Empty entries and duplicates are dropped. In op.acc.1 P-03 and P-04 a space also separates: `admin,test administrador` adds three accounts. In the other lists the space is part of the item: in op.acc.1 P-01, `Active Directory, Azure AD` adds two sources. Values already stored are not split again.

The parameters whose judgment compares a flat list accept two modes, «Texto exacto» and «Expresión regular», in the common settings, in templates and in an agent's own settings:

| Control | Parameters |
|---|---|
| op.acc.1 | P-03 Cuentas de servicio legítimas; P-04 Cuentas genéricas prohibidas |
| op.acc.4 | P-05 Usuarios autorizados acceso remoto |
| op.acc.6 | P-08 Puntos renovacion autenticacion; P-11 Exposiciones autenticacion admitidas |

To declare a regular expression:

1. In «Ajustes comunes» (section 5.2), in «Crear plantilla» or «Editar» (section 5.3) or in an agent's «Dar ajuste propio» (section 6.2), choose «Expresión regular» in «Modo de <parameter>».

   Expected result: the field proposes an expression that keeps the current names, with their special characters escaped (`admin.*` and `guest` give `^(?:admin\.\*|guest)$`), and «Probar con un valor» appears.

2. Type the pattern, without `/…/` slashes.

   Expected result: an invalid pattern is flagged on the field with its reason and is not saved.

3. Type a value in «Probar con un valor».

   Expected result: «Coincide con la expresión.» or «No coincide con la expresión.», with the same comparison as the evaluation.

4. Save.

   Expected result: after saving the common settings, the summary shows «Expresión regular: <pattern>»; in a template or an agent, the value is shown the same way.

Examples:

```text
^svc_.*$                        Accounts starting with svc_
^(admin|test|administrador)$    One of those three names
(?i)^admin$                     admin, case-insensitive
```

Rules:

- RE2 syntax (`re2js` 2.8.6), up to 512 characters. Lookaround and back-references are not supported. The engine is linear: a pattern cannot block the evaluation.
- The whole value is compared and case matters; `(?i)` at the start makes it case-insensitive.
- A match is not compliance by itself: in a forbidden list (op.acc.1 P-04) it flags a forbidden account; in an authorised list (op.acc.4 P-05), an allowed account.
- Switching mode while editing keeps the drafts of both modes. Only the chosen mode and its value are saved.
- The mode is stored next to the value of its level: `matchMode` next to `value` in the common settings, and `matchModes.<parameter>` in the template and in the agent's control. Only `regex` is stored; without the key, the value is exact text. The pattern is text in `value`, so the field type in the index does not change.
- The mode travels with the value (section 4): a list from a template or an own setting is compared as exact text even when the common value is a regular expression, and the other way round.
- An invalid pattern received from an external configuration leaves the evidence `NO_EVALUABLE` with the reason; `validate-configuration.ts` lists it (section 11.2).
- A configuration without `matchMode` is compared as exact text, as in 1.2.0.
- `inject-control.py` keeps the value and its mode. Clearing the control's configuration removes both.

## 6. «Agentes» tab

The tab lists the agents in scope with their type, the templates they use and their completeness, and the stored profiles of agents no longer in scope, marked «fuera del alcance».

### 6.1 System type

Each agent's type is detected with the first rule that matches:

| Order | Rule | Type | Evidence shown |
|---|---|---|---|
| 1 | The agent is the Wazuh manager (id `000`) | Manager Wazuh | «detectado por ser el manager de Wazuh» |
| 2 | `os.platform` is `windows` in the agent inventory | Windows | «detectado por el inventario de agentes (Windows)» |
| 3 | There are ENSFácil facts with `data.plano = directorio` in the last 30 days | Servidor LDAP | «detectado por N datos del directorio LDAP en 30 días» |
| 4 | `os.platform` is in the Linux family, or `os.uname` starts with «Linux» | Linux | «detectado por el inventario de agentes (Ubuntu)» |
| 5 | `os.platform` has a value not covered above | Not detected | «el sistema «…» no es un tipo previsto; se elige a mano» |
| 6 | The inventory has no operating system | Not detected | «el inventario no trae su sistema operativo …; se elige a mano» |

The type that decides the built-in template is the one **stored** in the agent's profile. While the detected type is not stored, the tables show it as «<type> (detectado, sin guardar)», the agent page says its built-in template applies once the type is saved, and the «Agentes» and «Controles» tabs show «N agente(s) con el tipo detectado sin guardar». On a new installation no built-in template applies until the types are saved. An agent with a type corrected by hand is not counted.

1. Press «Guardar los tipos detectados…».

   Expected result: the «Guardar el tipo detectado de N agente(s)» window with the parameters that change on each agent when it moves to the built-in template of its type.

2. Press «Guardar los tipos» (type `aplicar` first when asked).

   Expected result: the notice disappears and the list's «Plantillas» column names the built-in template of each type.

To correct an agent's type:

1. Open the agent and choose the type in «Tipo de sistema».

   Expected result: if the change alters a value, the «Cambiar el tipo de …» window with what changes; otherwise it is saved directly. The text below the field becomes «corregido a mano (detectado: …, por …)».

2. To go back to the detected type, choose «El detectado: …».

   Expected result: the text returns to «detectado por …».

> [!note]
> A freshly installed Zimbra LDAP server, still without facts, is detected as Linux: in the inventory it is just another Ubuntu. It is corrected by hand with the procedure above.

### 6.2 An agent's template and own settings

The agent page groups the per-system and per-platform parameters by control. Each control shows the template it uses, its own settings and, on each parameter, its class, whether it is required at the control's level and the origin of its value.

To change a control's template:

1. Choose «La de serie de su tipo («…»)» («La de serie de su tipo (tipo sin guardar)» while the type is not stored), a template of the control or «Sin plantilla (valores comunes)» in «Plantilla», and press «Asignar…».

   Expected result: if a value changes, the window with the template change and the parameters that change; once confirmed, the template in the control header.

To declare an own setting:

1. Press «Dar ajuste propio» (or «Editar», if it already has one), type the value and press «Guardar para este agente». For the parameters in section 5.5, choose the mode in «Modo de <parameter>» first.

   Expected result: the origin becomes «ajuste propio de este agente». An invalid value is rejected with its reason and not saved.

2. To inherit again, press «Quitar ajuste propio (vuelve a heredar)», or empty the field and save.

   Expected result: the origin moves to the template or to the common value.

3. To remove every own setting of a control, press «Quitar ajustes propios» and confirm.

   Expected result: the window lists each setting removed; once confirmed, the control keeps its template and its parameters inherit again.

Save rules:

- An empty value is not stored as an own setting: the agent inherits again.
- A value equal to the one the agent already inherited, in the same mode, is not stored as its own: it follows its origin when that changes.
- Saves on the same page run in order and on the latest version of the document.

Parameters that describe machines (op.exp.7 P-04 and P-07, op.cont.3 P-07, op.mon.1 P-01, op.exp.8 P-02 and op.mon.3 P-01, P-03 and P-07 in a control measured on the manager, and the declared scope of mp.info.6) are declared on each agent with its own rows only: the page shows «Del valor común» apart, read-only, and the button is «Declarar filas de este agente». The manager page also shows «Lo que se evalúa en esta fila», the full union.

Each save writes the whole document; the server keeps the previous version in the history and an `auditTrail` entry.

### 6.3 Remove settings that do not apply

A profile may store settings that do not apply: one for a parameter the control no longer declares, for a control not in the configuration, for a common parameter or a comparison mode without its own setting. The agent page lists them in «Ajustes de este agente que no se aplican», and the «Agentes» tab in «Ajustes de agentes que hay que corregir».

1. Press «Quitar» next to the setting.

   Expected result: the setting leaves the document; the rest of the profile is kept.

2. For a whole control not in the configuration, or for a profile stored under a name instead of an id, press «Quitar» next to it.

   Expected result: the «Quitar …» window with each item deleted (name, other names, corrected type, assigned templates and each setting). A whole profile requires typing `quitar`.

What this version does not know (a key stored by a later version) is listed in «Datos de otra versión del plugin (se ignoran)» and is not removed. An assignment to a template that no longer exists is shown as an error and the agent takes the built-in template of its type.

### 6.4 Other names of an agent

The distribution by agents (section 9) recognises a machine by its id, its agent name and its computer name. If the tables name it differently, that name is declared on its page.

1. Type the names in «Otros nombres de este agente», separated by commas, and press «Guardar otros nombres».

   Expected result: the names stay in the field after saving, and the «Agentes» tab stops warning about the rows that use them.

## 7. «General» tab

1. Open ENSFácil > Configuración > General.

   Expected result: the «Configuración global de evaluación» form with the ENS level, the **Traceability level (T)**, used only by op.exp.8, the **Availability level (D)**, used by op.cont.2 and op.cont.3, and the rest of the global configuration, with «Descripción del alcance (informes)», the text that describes the scope in the reports; below, «Alcance ENS», read-only, with «Agentes evaluados» and, depending on the mode, the groups or the agents.

2. Change the levels and press «Guardar configuración global».

   Expected result: «Configuración guardada». If T or D is not declared, the ENS level applies. op.cont.2 and op.cont.3 only apply with D at ALTO.

The scope is changed with the [initial setup](https://gitlab.com/quersystem/ens-controls-runbook/initial-setup).

## 8. Conversion of a 1.2.0 configuration

In 1.2.0, templates were per platform and were applied to each agent for every control at once. 1.3.0 converts that document when it loads it, with no action and without changing any value:

- Each applied template becomes the assigned template, built-in and with the same id, in every control where it set values. «Copias con PBS» and «Copias Zimbra NE» move to mp.info.6.
- If two applied templates set values in the same control and the second added parameters the first does not set, a custom template «<template> + <template> (de la 1.2.0)» is created with the values of both, the first one winning, and assigned.
- In the controls where the agent had no template and the built-in template of its stored type would set values, «Sin plantilla (valores comunes)» is assigned, so it keeps the common value as in 1.2.0.
- Own settings, other names and type are kept as they are. A 1.2.0 template unknown to this version, which was not applied either, is dropped and reported.
- The conversion is idempotent and is not written on load. The server evaluation applies the same conversion when it reads the document, so the verdicts are the same before and after it is saved.

While the conversion is not saved, Configuración shows «Configuración de la 1.2.0 convertida a plantillas por control» with the summary.

1. Back up the `active` document as in [installation from scratch, section 14.2](01-installation-from-scratch.en.md#142-back-up-the-document-before-changing-it).

   Expected result: `COPIA_OK`.

2. Press «Guardar la conversión», or save any other change in Configuración.

   Expected result: the notice disappears and the 1.2.0 version stays in the history. With «Guardar la conversión», the `auditTrail` entry is «Conversión de la configuración 1.2.0: …».

3. Validate the whole document (section 11.2).

   Expected result: `ESTRUCTURA VÁLIDA` and `AJUSTES DE AGENTES Y PLANTILLAS VÁLIDOS.`

## 9. Distribution of common rows by agents

Before 1.2.0, what belonged to a machine was declared as a common value: tables with a column naming the system (`sistema`, `activo`, `equipo`, `servidor`, `perfil`, `ambito`…). «Repartir por agentes» copies those rows to each agent as its own setting, without losing any and without leaving any agent without a value:

- Rows of tables with a system column that name an agent are **copied** to that agent. The agent is recognised by its id, its name, the `os.uname` hostname, the short part of both (before the first dot) and its other names (section 6.4), case-insensitive.
- A copied row **leaves** the common value only if no agent in scope that evaluates the control is left without a value. Otherwise, the row also stays in the common value.
- `*` rows stay in the common value and are also copied to the agent that receives rows of its own, because its own setting replaces the common value.
- Rows that name no agent, or several, stay in the common value and are listed as warnings.
- Two rows are the same only if they are identical: case counts (`Ana` and `ana` are two accounts).
- Scope lists (mp.info.6 P-04, op.acc.1 P-02, op.acc.2 P-01), per-system tables without a system column (paths, ACLs, privilege matrices) and lists that mix platforms are not touched.
- Nothing is deleted: a common parameter left without rows loses the `value` key (`null` is never written). It is idempotent.

The «Agentes» tab computes the distribution when it loads, without writing: if there are rows to copy, it shows «Hay filas del valor común que son de un agente concreto», the summary, the detail in «Ver qué se mueve y qué se copia» and the «Repartir por agentes» button. If the ENS scope has no agent, the button is disabled with the notice ««Repartir por agentes» no está disponible: el alcance ENS no tiene ningún agente».

### 9.1 Distribute

1. Back up the `active` document as in [installation from scratch, section 14.2](01-installation-from-scratch.en.md#142-back-up-the-document-before-changing-it).

   Expected result: `COPIA_OK`.

2. Open ENSFácil > Configuración > Agentes, review «Ver qué se mueve y qué se copia» and the warnings.

   Expected result: each line gives agent, control, parameter, number of rows and whether they leave the common value or are copied; each warning gives the row and the name that does not match.

3. Press «Repartir por agentes».

   Expected result: the «Repartir por agentes» window with, per agent, what moves and what is copied; «Parámetros que se quedarían sin valor en algún agente del alcance: ninguno»; and the notices about verdicts and the history.

4. Type `repartir` and press «Repartir».

   Expected result: the notice «Reparto por agentes: … La versión anterior queda en el historial.» and the distribution block disappears.

5. Validate the whole document (section 11.2).

   Expected result: `ESTRUCTURA VÁLIDA` and `AJUSTES DE AGENTES Y PLANTILLAS VÁLIDOS.`

6. For a row that names an agent in scope by another name, declare that name on the agent (section 6.4) and repeat steps 2 to 5.

   Expected result: that row's warning disappears and the row appears in «Ver qué se mueve y qué se copia».

## 10. Open Configuración from the URL

| URL (query) | Opens |
|---|---|
| `?tabView=configuration&configControl=op.acc.1` | «Controles», page of op.acc.1 |
| `?tabView=configuration&configControl=op.acc.1&configParam=P-04` | The same page, with the common settings open on P-04 |
| `?tabView=configuration&configView=agentes` | «Agentes», list of agents |
| `?tabView=configuration&configView=general` | «General» |
| `?tabView=configuration&configAgent=001` | «Agentes», page of agent 001 |
| `?tabView=configuration&configAgent=001&configControl=op.acc.1&configParam=P-07` | The page of agent 001 with op.acc.1 expanded and P-07 being edited |

A 1.2.0 link with `configView=sistemas` opens «Agentes».

From the control detail, «Configurar este control» and the parameter badges of each nonconformity add to the URL `control` (the detail's control), `agentId` (the chosen machine) and `configBack=plugins`. With a chosen machine and a per-system or per-platform parameter, the page of that agent opens on «Agentes»; with a common parameter, or without a machine, the control page on «Controles». Configuración then shows «Volver al detalle de op.acc.1 (001)», which returns to the same control and machine; while it is shown, it is the only way back («Volver a controles» and «Volver a agentes» do not appear).

Expected result: after saving and pressing «Volver al detalle de …», the control detail shows the same control and machine, and the URL no longer carries any `config*` parameter.

If the control is not in the document, the «Controles» tab says so and highlights it in the list; if it is not a catalog control, it says so. An agent that is neither in the inventory nor in the configuration opens with a warning. Navigation inside Configuración updates the URL, so the browser's «back» button returns to the previous view.

## 11. From the server

The `config/` tools run with the indexer administrator certificate, as in [installation from scratch, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration):

```bash
CERT="OS_CERT=/etc/wazuh-indexer/certs/admin.pem OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem"
```

### 11.1 Declare an agent's template and settings with set-parameters.py

Besides the common values, `set-parameters.py` accepts an `agents` section with, per agent id and per control, the assigned template (`template`) and the own settings:

```json
{
  "op.acc.1": { "P-04": ["admin", "test"] },
  "agents": {
    "001": {
      "op.acc.1": { "template": "linux-ubuntu", "P-07": ["usuario1 | servidor1 | Administrador de sistema"] },
      "op.acc.2": { "template": "custom-servidores-web" },
      "op.exp.2": { "template": "none" },
      "op.exp.4": { "template": null, "P-04": null }
    }
  }
}
```

Rules:

- `template` is the id of a built-in template of the control (`linux-ubuntu`, `zimbra-ldap`, `windows-server`, `manager-wazuh`, `pbs-backup` or `zimbra-ne-backup`, those the control has) or of a custom template of the same control; `none` leaves the agent without a template (common values); `null` removes the assignment and the built-in template of its type applies again. Without the `template` key, the assignment does not change.
- A 1.2.0 document does not accept `template`: the conversion is saved first from Configuración (section 8).
- The agent key is its id; `7` is normalised to `007`. A name is rejected and, if the document already knows it, the id is given.
- Only per-system and per-platform parameters accept an own setting; a common one is rejected.
- Empty means no value: `null`, `""` and `[]` remove the own setting, which inherits again, and in the common values remove the `value` key. `null` is never written to the document.
- Removing is always accepted, also for a setting that does not apply.
- Each named parameter's value is replaced whole.
- A regular expression (section 5.5) is declared with an object, in the common values and on an agent: `"P-04": { "value": "^(admin|guest)$", "matchMode": "regex" }`. A value without an object is exact text and removes any mode; emptying the value also removes its mode. The mode, the parameter and the length are checked; the RE2 syntax is checked by `validate-configuration.ts` (section 11.2).
- The tool reads the classification from `common/ens/configuration/agents/parameter-classes.ts`: it runs from `config/` inside the complete plugin repository.

```bash
cd /opt/ensfacil/repo/config
sudo env $CERT python3 set-parameters.py /path/agents.json            # plan
sudo env $CERT python3 set-parameters.py /path/agents.json --apply    # write
```

Expected result: without `--apply`, one line per change under `── agente 001` (`op.acc.1 template (la de serie de su tipo)  ->  linux-ubuntu` for an assignment) and `DRY-RUN: nada escrito`; with `--apply`, `Versión anterior guardada en: historial de wazuh-ens-configuration (…)` and `<n> cambio(s) escritos en wazuh-ens-configuration/active`. For a control not seeded, a parameter that does not exist, a common parameter, a template the control does not have, a name instead of an id or a value with an impossible shape, the tool shows `ERROR:` and writes nothing.

> [!note]
> In Docker ([Wazuh in Docker, section 10](06-wazuh-in-docker.en.md#10-declare-the-policy-t-and-d-levels)), the `agents` section needs the complete repository mounted: `-v <repo>:/repo:ro -w /repo/config` instead of `-v <repo>/config:/cfg:ro -w /cfg`.

Custom templates are created and edited on the screen (section 5.3).

### 11.2 Validate the document

`config/validate-configuration.ts` also checks common values, custom templates and agent settings ([installation from scratch, section 14.4](01-installation-from-scratch.en.md#144-validate-the-whole-document)):

```bash
cd /opt/ensfacil/repo
npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive
npx --yes tsx config/validate-configuration.ts /opt/ensfacil/artifacts/active-now.json
```

Expected result: `Done` after installing the dependencies; then `ESTRUCTURA VÁLIDA: el plugin cargará esta configuración.`, the line `plantillas propias: …`, one line per agent with its type, its assigned templates and its own settings, and `AJUSTES DE AGENTES Y PLANTILLAS VÁLIDOS.` Without agent settings, the line is `agentes con ajustes: ninguno (todo se evalúa con el valor común de cada control)`. With a 1.2.0 document, the line `documento de la 1.2.0: Conversión de la configuración 1.2.0: …` summarises the conversion and the rest is validated on the converted document.

| Message | Meaning | Action |
|---|---|---|
| `ESTRUCTURA INVÁLIDA` with `configuration.agents…` or `configuration.templates…` | A `null` value or an object in an agent or a template, a mode other than `exact` or `regex` in `matchModes`, or a known field with the wrong type: the plugin does not load the environment | Restore the backup and fix the item reported |
| `VALORES COMUNES INVÁLIDOS` | A common value that is not valid for its parameter, for example a regular expression written with `set-parameters.py` that does not compile: the control is «Inválido» | Fix the value in «Ajustes comunes» or with `set-parameters.py` |
| `AJUSTES DE AGENTES O PLANTILLAS INVÁLIDOS` with «no se aplica» | A profile stored under a name instead of an id, a control or parameter that does not exist, a common parameter or a comparison mode without its own setting: the setting is ignored | Remove it with «Quitar» (section 6.3) or with `set-parameters.py` and `null` |
| `AJUSTES DE AGENTES O PLANTILLAS INVÁLIDOS` with «se evalúa con una configuración inválida» | A value that is not valid for its parameter | Fix the value on the agent page or with `set-parameters.py` |
| `AJUSTES DE AGENTES O PLANTILLAS INVÁLIDOS` with «la plantilla asignada «…» no existe» | An assignment to a deleted template or one from another version: the agent takes the built-in template of its type | Assign another template (sections 5.4 or 6.2) |
| `AJUSTES DE AGENTES O PLANTILLAS INVÁLIDOS` with `plantilla <id>` | A custom template with a reserved or repeated id, of a control not present or with an invalid value | Fix or delete the template (section 5.3) |
| `AJUSTES DE AGENTES O PLANTILLAS INVÁLIDOS` with «Expresión regular inválida» or «no admite expresiones regulares» | A pattern that does not compile or the «Expresión regular» mode on a parameter that does not accept it: the evidence is `NO_EVALUABLE` | Fix the pattern or go back to «Texto exacto» (section 5.5) |
| `avisos (…)` | Keys from a later plugin version, repeated template names, unconverted 1.2.0 templates or a comparison mode without a value in a template | None: they do not change the outcome |

### 11.3 Seed controls

`inject-control.py` keeps `configuration.agents` and `configuration.templates` on every seed, also with `--sustituir`, and when merging keeps the `matchMode` of each common value. If the block no longer declares a parameter and an agent or a custom template had a value for it, the plan shows `AVISO: valores de parámetros retirados, quedan huérfanos: …`; those values do not apply and are removed as in section 6.3 or by editing the template. Seeding a new control creates no templates, assignments or agent settings.

## 12. Compatibility and rollback

- Custom templates live in the top-level key `configuration.templates`, and each agent's assignment in `configuration.agents.<id>.controls.<control>.templateId`, next to its own settings in `parameters`. `controls[].parameters[].value` remains the common value, which is what a 1.1.0 plugin, the chatbot and the scripts read.
- A 1.2.0 plugin loads a 1.3.0 document: its validator does not check unknown keys, ignores `templates` and warns about `templateId` as a key it does not know. It evaluates with the own settings and the common value, without the assigned templates.
- The 1.3.0 server rejects with a 400 error a save whose `agents` or `templates` does not have the right shape, and keeps the existing ones when the body does not carry the key.
- A 1.2.0 plugin ignores `matchMode` and `matchModes` and compares a pattern as a literal name. Before going back to 1.2.0, switch those values to «Texto exacto» or restore a version of the document without them.
- **Every version of the document stays in the history before being replaced**, whoever writes: the server adds it to the history if it is not already its last entry, also on the 1.2.0 conversion and on the distribution by agents; and `inject-control.py` and `set-parameters.py` keep the version they replace before writing, in the history or, if the index does not allow it, in a local file `active-antes-<fecha>.json`. Both say where with `Versión anterior guardada en: …`.
- Going back to 1.2.0 only requires deploying its zip ([installing from a release, section 15](07-installing-from-a-release.en.md#15-change-version-or-uninstall)). For 1.2.0 to evaluate with its templates, restore the version of the document from before the conversion. To go back to 1.1.0 after «Repartir por agentes», restore the version from before the distribution.

To restore an earlier version, with the backup from section 8 or 9.1, step 1, follow the [troubleshooting and rollback guide](04-troubleshooting-and-rollback.en.md#7-restore-the-ens-configuration). Without that backup, use the version in the history:

1. List the latest versions in the history:

   ```bash
   C="--cacert /etc/wazuh-indexer/certs/root-ca.pem --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem"
   sudo curl -s $C "https://127.0.0.1:9200/wazuh-ens-configuration/_search?q=documentType:CONFIGURATION_HISTORY&sort=createdAt:desc&size=10&filter_path=hits.hits._id,hits.hits._source.createdAt,hits.hits._source.createdBy,hits.hits._source.configuration.changeReason&pretty"
   ```

   Expected result: the versions from newest to oldest, with their `_id`. The one before the conversion comes right after the first save from 1.3.0 («Conversión de la configuración 1.2.0: …» if it was saved with «Guardar la conversión»); the one before the distribution, right after «Reparto por agentes: …».

2. Copy it as the active document, with the `_id` from step 1:

   ```bash
   ID=<_id of the version to restore>
   sudo curl -s $C "https://127.0.0.1:9200/wazuh-ens-configuration/_doc/$ID" -o /opt/ensfacil/artifacts/historial.json
   sudo python3 -c "import json,sys; d=json.load(open(sys.argv[1])); s=d['_source']; s['documentType']='ACTIVE_CONFIGURATION'; json.dump({'_source': s, 'found': True}, open(sys.argv[2],'w'), ensure_ascii=False)" \
     /opt/ensfacil/artifacts/historial.json /opt/ensfacil/artifacts/active-desde-historial.json
   ```

   Expected result: the file `/opt/ensfacil/artifacts/active-desde-historial.json`.

3. Restore that file as described in the [troubleshooting and rollback guide](04-troubleshooting-and-rollback.en.md#7-restore-the-ens-configuration), with `COPIA=/opt/ensfacil/artifacts/active-desde-historial.json`.

   Expected result: the response includes `"result":"updated"`.
