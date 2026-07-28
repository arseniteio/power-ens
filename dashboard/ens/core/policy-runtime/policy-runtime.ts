import { ENSPolicyContext, ENSPolicyRuntimeResult } from './types';
import { getControlRuntimeModule } from './runtime';

// Orquestador del runtime de políticas. No contiene lógica de ningún control:
// delega en el módulo registrado para el control (ver ./runtime). Un control sin
// módulo devuelve decisiones y variables vacías — su veredicto lo determina el
// rollup de evidencias del motor de evaluación.
export const runPolicyRuntime = (
  context: ENSPolicyContext
): ENSPolicyRuntimeResult => {
  const module = getControlRuntimeModule(context.control.id);

  const runtimeVariables = module
    ? module.buildRuntimeVariables(context)
    : [];

  return {
    controlId: context.control.id,
    policyId: context.control.id,
    evaluatedAt: new Date().toISOString(),
    decisions: module
      ? module.buildDecisions(context, runtimeVariables)
      : [],
    appliedParameters:
      context.configuration?.parameters.map(parameter => ({
        id: parameter.id,
        name: parameter.name,
        value: parameter.value,
        required: parameter.required,
      })) || [],
    runtimeVariables,
  };
};
