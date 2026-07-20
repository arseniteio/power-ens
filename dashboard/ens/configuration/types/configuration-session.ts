import {
  ENSConfigurationLifecycleStatus,
  ENSControlParameterValues,
} from './index';

export interface ConfigurationSessionState {
  controlId: string;

  values: ENSControlParameterValues;

  dirty: boolean;

  validationStatus: 'VALID' | 'INVALID';

  lifecycleStatus: ENSConfigurationLifecycleStatus;

  createdAt: string;

  updatedAt: string;
}
