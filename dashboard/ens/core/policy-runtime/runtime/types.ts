import {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSRuntimeVariable,
} from '../types';

// Contrato de un módulo de runtime por control. Cada control que necesite una
// capa imperativa (variables de runtime + decisiones más allá del rollup de
// evidencias) registra un módulo de este tipo en el ControlRuntimeRegistry.
export interface ControlRuntimeModule {
  controlId: string;
  buildRuntimeVariables: (context: ENSPolicyContext) => ENSRuntimeVariable[];
  buildDecisions: (
    context: ENSPolicyContext,
    variables: ENSRuntimeVariable[]
  ) => ENSPolicyDecision[];
}
