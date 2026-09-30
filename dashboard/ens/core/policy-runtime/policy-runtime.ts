import {
  ENSPolicyContext,
  ENSPolicyRuntimeResult,
} from './types';
import {
  getPolicyDefinition,
} from './policies';

// Ejecuta la policy de un control. Si su definición trae `evaluator`, ella
// decide los requisitos y mide las evidencias que declara. Si no lo trae, el
// control se evalúa solo por sus evidencias (primitivas del catálogo o el
// `evidence_state` del agente) y aquí no se produce ninguna decisión.
//
// Aquí vivía el juicio imperativo de mp.info.6 (umbrales de periodicidad,
// retención, lista blanca de acceso, edad de la restauración y copia offsite).
// Se retiró cuando mp.info.6 pasó a juzgar hechos en su propia policy, como
// los demás controles: ver `policies/mp-info-6.policy.ts`.
export const runPolicyRuntime = (
  context: ENSPolicyContext
): ENSPolicyRuntimeResult => {
  const policyDefinition =
    getPolicyDefinition(
      context.control.id
    );

  const evaluator =
    policyDefinition?.evaluator;

  const appliedParameters =
    context.configuration
      ?.parameters.map(
        parameter => ({
          id: parameter.id,
          name: parameter.name,
          value: parameter.value,
          required:
            parameter.required,
        })
      ) || [];

  if (evaluator) {
    const evaluated =
      evaluator(context);

    return {
      controlId:
        context.control.id,
      policyId:
        policyDefinition.id,
      evaluatedAt:
        new Date().toISOString(),
      decisions:
        evaluated.decisions,
      appliedParameters,
      runtimeVariables:
        evaluated.runtimeVariables,
    };
  }

  return {
    controlId: context.control.id,
    policyId: context.control.id,
    evaluatedAt: new Date().toISOString(),
    decisions: [],
    appliedParameters,
    runtimeVariables: [],
  };
};
