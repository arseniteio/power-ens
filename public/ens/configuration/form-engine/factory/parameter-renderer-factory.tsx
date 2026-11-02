import React from 'react';

import { ENSFormFieldProps } from '../types';
import {
  BooleanParameterRenderer,
  ListParameterRenderer,
  NumberParameterRenderer,
  PatternParameterRenderer,
  SelectParameterRenderer,
  TableParameterRenderer,
  TextParameterRenderer,
} from '../renderers';
import {
  hasParameterColumns,
  hasParameterOptions,
  isPlainNumericParameter,
} from '../../../../../common/ens/configuration/services/parameter-value-validator';
import { supportsParameterPattern } from '../../../../../common/ens/configuration/services/parameter-input';
import { parameterAtLevel } from '../../../../../common/ens/configuration/services/parameter-value-validator';
import {
  getActiveENSConfiguration,
} from '../../../../../common/ens/configuration/services/configuration-state-service';
import { getENSCatalogControl } from '../../../../../common/ens/catalog';
import { resolveControlLevel } from '../../../../../common/ens/core/control-level';

const applicableLevelOf = (controlId: string) => {
  const global = getActiveENSConfiguration().global;
  return resolveControlLevel(getENSCatalogControl(controlId) || {}, global.ensLevel, global);
};

export const ParameterRendererFactory = ({
  parameter: declared,
  value,
  onChange,
  onMatchModeChange,
  level,
}: ENSFormFieldProps) => {
  const parameter = declared.optionsByLevel ? parameterAtLevel(declared, level || applicableLevelOf(declared.controlId)) : declared;

  if (supportsParameterPattern(parameter) && (onMatchModeChange || parameter.matchMode === 'regex')) {
    return (
      <PatternParameterRenderer
        parameter={parameter}
        value={value}
        onChange={onChange}
        onMatchModeChange={onMatchModeChange}
      />
    );
  }

  if (parameter.type === 'boolean') {
    return (
      <BooleanParameterRenderer
        parameter={parameter}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (isPlainNumericParameter(parameter)) {
    return (
      <NumberParameterRenderer
        parameter={parameter}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (hasParameterOptions(parameter)) {
    return (
      <SelectParameterRenderer
        parameter={parameter}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (hasParameterColumns(parameter)) {
    return (
      <TableParameterRenderer
        parameter={parameter}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (
    parameter.type === 'list' ||
    parameter.type === 'table'
  ) {
    return (
      <ListParameterRenderer
        parameter={parameter}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <TextParameterRenderer
      parameter={parameter}
      value={value}
      onChange={onChange}
    />
  );
};
