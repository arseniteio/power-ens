# Usage

Power ENS appears in the Wazuh dashboard menu. The screens are in Spanish, so this page names them as they appear. All results come from the OSCompliance engine, which runs every 15 minutes: a change made here shows after its next pass.

## Configuration

Configuración holds what the organisation declares. Anyone with dashboard access can read it; saving needs the `power_ens_admin` or `all_access` role. It has six tabs.

Estado summarises the deployment: how many machines the engine has described, how many get no profile, how many have evidences left not evaluable by the configuration, and which unset parameters cause it. It also shows the machines per role, distribution and profile, and the latest changes.

Máquinas lists every machine the engine describes in `oscompliance-host-profile`, page by page, with filters by profile, role, distribution, service and Wazuh group, and a search by name, hostname or agent number. The list is read from the indexer one page at a time, so it works the same with 15,000 machines. Opening a machine shows what the engine deduced (distribution, role, services and the inventory signal behind each), the profiles it gets, and the value of every per-machine parameter with where it comes from. Dar valores propios edits the values of that machine alone.

Perfiles is where values are set once per type of machine. Each profile has a layer (distribution, role, service or site), conditions on what the engine deduces, and values for the per-machine parameters. While editing, Vista previa counts the machines that meet the conditions and names some of them. Nuevo perfil starts from a blank profile, from a copy of another one, or from a file. Importar reads YAML or JSON files with one or several profiles and shows, per profile, whether it is new, changes or stays the same, and its errors, before anything is applied. Exportar writes the saved profiles as YAML, one document per profile. The built-in profiles come from the OSCompliance catalog; saving a changed copy replaces the built-in one, and deleting that copy brings it back.

Edits to profiles are collected in the bar at the bottom of the page. Revisar lists them, Descartar drops them and Guardar writes them all. The engine applies them on its next pass.

Pendiente lists what needs a decision: machines that match no profile and parameters without a value that leave evidences not evaluable, according to the last verdicts. Each parameter links to where it is set: a profile for per-machine parameters, Organización for the rest.

Organización holds the data that several controls share, entered once: authorised personnel, preproduction environment, change and incident tools, CCN-authorised algorithms, retention periods, controlled zones, remote access channels, certified products, staff training, awareness activities, privileged groups and the statement of applicability. Each control reads the rows of its use. It also holds the values of each control that apply to the whole organisation. Open a control and press Completar configuración to fill in what is missing. A control also lets a template be assigned to some machines.

General holds the client, the ENS level (BAJO, MEDIO or ALTO), the groups in scope (Grupos evaluables) and Grupos por control. Until Guardar configuración global is pressed for the first time, the engine and the plugin use the default of the catalog, `common/ens/catalog/default-configuration.json`: level MEDIO and the `ens` group in scope. Save to change them.

A machine's value comes from the first of: its own value, the template assigned to it in the control, its profiles, the built-in template of its system type, and the organisation value. Lists add up across profiles; other values come from the most specific layer. The order is described in [ENS policy](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/en/configuration.md#ens-policy).

For automation, `oscompliance-policy` reads and writes the same profiles from YAML files on the manager, and `config/set-parameters.py` fills in organisation and machine values from a JSON file after the first save. See [profiles](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/en/configuration.md#profiles) and [parameters from a file](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/en/configuration.md#parameters-from-a-file).

A parameter nobody has set is never replaced by an assumption: the evidences that need it show as not evaluable, and the reason names the parameter. What each parameter means is on the [control pages](https://github.com/arseniteio/oscompliance-ens-wazuh/tree/main/docs/en/controls).

With Grupos por control on, the engine creates one Wazuh group per control, `ens-excluir-<control>`. A machine added to one of those groups is left out of that control. In Detalle del control, a user with `power_ens_admin` or `all_access` presses Excluir de este control to move the machine to that group, and must write a reason. Power ENS records the machine, control, reason, user and date in the `wazuh-ens-exclusions` index. Volver a incluir reverses it, also with a reason. The manager belongs to no group and cannot be excluded.

## Results

Panel shows the state of the deployment: the maturity of the organization, compliance per control and family, the findings by kind, and how the score has changed over time.

Madurez de la organización is the ENS valuation (Anexo II, apdo. 6): CMM levels L0 to L5 per measure, as accredited by the evidence and as assessed by people, with a global level for each and the measures without measurement, without assessment and below their target. The evidence accredits up to L2. L3 to L5 need a written, measured and improved process: open the control and press Valorar to record the level, the target and the documents that prove it. The measures the controls cite without an engine, such as org.2 or mp.per.3, are assessed in Configuración, Organización, Medidas sin motor. The traffic light and the percentage are operational indicators, not the ENS valuation.

Vista general shows one row per machine with its total compliance. Opening a machine shows its controls and the work pending on it, and the last 30 days.

Detalle del control shows one control on one machine: each requirement, each evidence with its status and reason, and an explanation of how it is measured. Use the Máquina selector to change machine. This is where to go to find out why something fails.

Evidencias lists the evidences of all controls, with their status per machine.

Eventos lists the facts the agents have sent. It shows what the engine received, and opening one shows its document.

Informes builds the report of each control for an auditor, with its requirements, parameters, results and maturity level. Exportar PDF downloads it.

## Reading a status

Cumple means measured and correct. No cumple means measured and wrong, and the reason names what failed. No evaluable means it could not be measured: a parameter is missing, or a source did not arrive. No aplica means it is outside the ENS level, or the control or machine is out of scope.

A requirement with an evidence that is not evaluable does not comply. What cannot be proven does not count as compliant. The full rules are in [Verdicts](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/en/verdicts.md).
