import React from 'react';
import {
  EuiFlexGrid,
  EuiFlexItem,
} from '@elastic/eui';

import {
  ENSControlConfiguration,
  ENSLevel,
} from '../../../../common/ens/configuration/types';
import { ControlCard } from './control-card';

interface ConfigurationCatalogProps {
  controls: ENSControlConfiguration[];
  // Nivel de cada control: el global o el de su dimensión (ver
  // `core/control-level.ts`), el mismo con el que lo evalúa el motor.
  getActiveLevel: (controlId: string) => ENSLevel;
  selectedControlId?: string;
  onOpenControl: (
    controlId: string
  ) => void;
}

export const ConfigurationCatalog = ({
  controls,
  getActiveLevel,
  selectedControlId,
  onOpenControl,
}: ConfigurationCatalogProps) => (
  <EuiFlexGrid
    columns={3}
    gutterSize='m'
  >
    {controls.map(control => (
      <EuiFlexItem
        key={control.controlId}
      >
        <ControlCard
          control={control}
          activeLevel={getActiveLevel(
            control.controlId
          )}
          isSelected={
            control.controlId ===
            selectedControlId
          }
          onOpen={onOpenControl}
        />
      </EuiFlexItem>
    ))}
  </EuiFlexGrid>
);
