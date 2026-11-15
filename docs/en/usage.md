# Usage

Power ENS appears in the Wazuh dashboard menu. The screens are in Spanish, so this page names them as they appear. All results come from the OSCompliance engine, which runs every 15 minutes: a change made here shows after its next pass.

## Configuration

Configuración holds what the organisation declares. Saving it needs the `power_ens_admin` or `all_access` role. It has three parts.

Organización holds the client, the ENS level (BAJO, MEDIO or ALTO), the groups in scope (Grupos evaluables) and the data that several controls share, such as retention periods. Press Guardar configuración global the first time, because the engine judges nothing until a configuration exists.

Plantillas holds the values of each control. Open a control and press Completar configuración to fill in what is missing. A built-in template per system type brings values for the parameters that depend on the platform: review them against your machines.

Agentes holds what belongs to one machine. Open the machine and the control, and edit a parameter with the pencil.

After the first save, Plantillas and Agentes can also be filled in from a JSON file with `config/set-parameters.py`, which validates every value and shows the plan before writing. See [parameters from a file](https://github.com/arseniteio/oscompliance-ens/blob/main/docs/en/configuration.md#parameters-from-a-file).

A parameter nobody has set is never replaced by an assumption: the evidences that need it show as not evaluable, and the reason names the parameter. What each parameter means is on the [control pages](https://github.com/arseniteio/oscompliance-ens/tree/main/docs/en/controls).

With Grupos por control on, the engine creates one Wazuh group per control, `ens-excluir-<control>`. A machine added to one of those groups is left out of that control. In Detalle del control, a user with `power_ens_admin` or `all_access` presses Excluir de este control to move the machine to that group, and must write a reason. Power ENS records the machine, control, reason, user and date in the `wazuh-ens-exclusions` index. Volver a incluir reverses it, also with a reason. The manager belongs to no group and cannot be excluded.

## Results

Panel shows the state of the deployment: compliance per control and family, the findings by kind, and how the score has changed over time.

Vista general shows one row per machine with its total compliance. Opening a machine shows its controls and the work pending on it, and the last 30 days.

Detalle del control shows one control on one machine: each requirement, each evidence with its status and reason, and an explanation of how it is measured. Use the Máquina selector to change machine. This is where to go to find out why something fails.

Evidencias lists the evidences of all controls, with their status per machine.

Eventos lists the facts the agents have sent. It shows what the engine received, and opening one shows its document.

Informes builds the report of each control for an auditor, with its requirements, parameters and results. Exportar PDF downloads it.

## Reading a status

Cumple means measured and correct. No cumple means measured and wrong, and the reason names what failed. No evaluable means it could not be measured: a parameter is missing, or a source did not arrive. No aplica means it is outside the ENS level, or the control or machine is out of scope.

A requirement with an evidence that is not evaluable does not comply. What cannot be proven does not count as compliant. The full rules are in [Verdicts](https://github.com/arseniteio/oscompliance-ens/blob/main/docs/en/verdicts.md).
