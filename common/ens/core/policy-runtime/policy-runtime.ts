import {
  ENSPolicyContext,
  ENSPolicyRuntimeResult,
} from './types';
import {
  getPolicyDefinition,
} from './policies';

// Runs a control's policy. With `evaluator` it decides the requirements and measures its evidences;
// without it the control is evaluated by its evidences alone and no decision is produced here.
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
