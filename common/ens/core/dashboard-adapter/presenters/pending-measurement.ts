import { getENSCatalogControl } from '../../../catalog';
import { isPendingMeasurement } from '../../../catalog/support/measurement-plan';
import { ENSComplianceState } from '../../compliance-state/types';

export const pendingMeasurementResults = (complianceState: Pick<ENSComplianceState, 'results'>) =>
  (complianceState.results || []).filter(result => isPendingMeasurement(getENSCatalogControl(result.control.id)));
