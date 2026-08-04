import { ENSComplianceStatus } from '../types';

/**
 * La convención de auditoría, en una función.
 *
 * **Si algo no está configurado o no se puede demostrar, NO CUMPLE.** La carga
 * de la prueba es del auditado: un auditor no escribe «no evaluable», escribe
 * «no evidenciado» y lo cuenta en contra. En estos controles es literal —
 * `op.acc.2.2` exige que los derechos de acceso sigan la política interna «y las
 * decisiones del responsable del recurso»: con la política vacía, el responsable
 * no ha tomado esas decisiones, que es justo lo que el requisito pide.
 *
 * Vive en una función y no repetida en cada evaluador porque la regla es UNA:
 * el día que se matice, se matiza aquí y no en cuatro sitios que puedan
 * divergir. Es el mismo motivo por el que no hay un evaluador por control.
 *
 * Lo que NO toca, y es intocable: `NO_APLICA`. Un refuerzo por encima del nivel
 * ENS activo no es un incumplimiento no demostrado, es un requisito que no rige,
 * y es lo que permite que un cliente de nivel BAJO llegue al 100 % sin arrastrar
 * los refuerzos de MEDIO y ALTO.
 */
export const applyAuditVerdict = (
  measurement: ENSComplianceStatus
): ENSComplianceStatus =>
  measurement === 'NO_EVALUABLE' ? 'NO_CUMPLE' : measurement;

/**
 * ¿La medida se ha llegado a hacer?
 *
 * Es lo contrario de `NO_EVALUABLE`, y se nombra aparte porque después de
 * aplicar el veredicto ya no se puede deducir del estado: un `NO_CUMPLE` medido
 * y uno no evidenciado son el mismo estado. Este booleano es lo único que los
 * separa aguas abajo, y de él sale `measuredRequirements`.
 */
export const isMeasured = (measurement: ENSComplianceStatus): boolean =>
  measurement !== 'NO_EVALUABLE';

/**
 * El veredicto publicado de un requisito, a partir de lo que traiga.
 *
 * `evidenced === false` manda sobre la etiqueta: un requisito que no se ha
 * podido demostrar no cumple, se etiquete como se etiquete. Así el evaluador de
 * control da la misma respuesta tanto si recibe requisitos ya convertidos por
 * `evaluateRequirement` (el camino de producción) como si recibe la medida en
 * crudo.
 */
export const requirementVerdict = (requirement: {
  status: ENSComplianceStatus;
  evidenced?: boolean;
}): ENSComplianceStatus =>
  requirement.status === 'NO_APLICA'
    ? 'NO_APLICA'
    : requirement.evidenced === false
    ? 'NO_CUMPLE'
    : applyAuditVerdict(requirement.status);
