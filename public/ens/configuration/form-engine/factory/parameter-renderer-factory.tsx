import React from 'react';

import { ENSFormFieldProps } from '../types';
import {
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
import { getActiveENSConfiguration } from '../../../../../common/ens/configuration/services/configuration-state-service';
import { getENSCatalogControl } from '../../../../../common/ens/catalog';
import { resolveControlLevel } from '../../../../../common/ens/core/control-level';

// The level the control is evaluated at (its dimension or the ENS level), to offer only the options the ENS admits there.
const applicableLevelOf = (controlId: string) => {
  const global = getActiveENSConfiguration().global;
  return resolveControlLevel(getENSCatalogControl(controlId) || {}, global.ensLevel, global);
};

// `boolean`, `path` and `url` fall to the text renderer (edited as strings). `list`, `select` and `table` need
// their own renderer.
// A `table` without declared columns falls to the list renderer, and a `select` without options to the text
// renderer (blocks seeded earlier); their validation degrades the same way (`validateTable`,
// `validateSelection`), so form and engine agree: never offer a field that accepts what the engine rejects, nor
// reject what the field lets you write. Reseed with `inject-control.py`, which keeps configured values.
// The numeric field is only for parameters whose value is just a number: mp.info.6 P-05 is `duration_days` but
// accepts 'ALTA=30; MEDIA=90', so it uses the text renderer.
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
