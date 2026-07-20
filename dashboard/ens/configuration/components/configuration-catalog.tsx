import React from 'react';
import {
  EuiFlexGrid,
  EuiFlexItem,
} from '@elastic/eui';

import {
  ENSControlConfiguration,
  ENSLevel,
} from '../types';
import { ControlCard } from './control-card';

interface ConfigurationCatalogProps {
  controls: ENSControlConfiguration[];
  activeLevel: ENSLevel;
  selectedControlId?: string;
  onOpenControl: (
    controlId: string
  ) => void;
}

export const ConfigurationCatalog = ({
  controls,
  activeLevel,
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
          activeLevel={activeLevel}
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
