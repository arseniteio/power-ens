import { ControlRuntimeModule } from './types';
import { mpInfo6Runtime } from './mp-info-6.runtime';

export * from './types';

// Registro de módulos de runtime por control. Un control sin módulo aquí no
// produce variables ni decisiones imperativas: su veredicto sale del rollup de
// evidencias en el motor de evaluación (caso de op.acc.1 / op.acc.2).
export const ControlRuntimeRegistry: ControlRuntimeModule[] = [
  mpInfo6Runtime,
];

export const getControlRuntimeModule = (
  controlId: string
): ControlRuntimeModule | undefined =>
  ControlRuntimeRegistry.find(module => module.controlId === controlId);
