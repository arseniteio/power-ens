import { ENSConfigurationLifecycleStatus } from '../types';

export type ENSPolicyLifecycleAction =
  | 'START_CONFIGURATION'
  | 'SAVE_DRAFT'
  | 'VALIDATE'
  | 'MARK_CONFIGURED'
  | 'MARK_INVALID'
  | 'RESET';

export const canEditPolicy = (
  status: ENSConfigurationLifecycleStatus
): boolean =>
  status === 'DRAFT' ||
  status === 'INCOMPLETE' ||
  status === 'INVALID' ||
  status === 'CONFIGURED';

export const canValidatePolicy = (
  status: ENSConfigurationLifecycleStatus
): boolean =>
  status === 'DRAFT' ||
  status === 'INCOMPLETE' ||
  status === 'INVALID';

export const canActivatePolicy = (
  status: ENSConfigurationLifecycleStatus
): boolean =>
  status === 'CONFIGURED';

export const getNextPolicyStatus = (
  status: ENSConfigurationLifecycleStatus,
  action: ENSPolicyLifecycleAction
): ENSConfigurationLifecycleStatus => {
  if (action === 'START_CONFIGURATION') return 'DRAFT';
  if (action === 'SAVE_DRAFT') return 'DRAFT';
  if (action === 'VALIDATE') return status;
  if (action === 'MARK_CONFIGURED') return 'CONFIGURED';
  if (action === 'MARK_INVALID') return 'INVALID';
  if (action === 'RESET') return 'DRAFT';

  return status;
};
