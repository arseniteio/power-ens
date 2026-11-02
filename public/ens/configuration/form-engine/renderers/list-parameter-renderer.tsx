import React, { useState } from 'react';
import { EuiComboBox, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import {
  toParameterListItems,
  validateParameterValue,
} from '../../../../../common/ens/configuration/services/parameter-value-validator';
import {
  parseParameterInput,
  splitsParameterOnSpaces,
} from '../../../../../common/ens/configuration/services/parameter-input';



export const ListParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const [search, setSearch] = useState('');
  const items = toParameterListItems(value);

  const verdict = validateParameterValue(parameter, value);

  const publish = (nextItems: string[]) =>
    onChange(parameter.name, nextItems.length ? Array.from(new Set(nextItems)) : undefined);

  const separators = `comas${splitsParameterOnSpaces(parameter) ? ', espacios' : ''} o saltos de línea`;

  return (
    <EuiFormRow
      label={`${parameter.id} · ${parameter.label}`}
      helpText={
        parameter.example
          ? `${parameter.description} Puedes pegar varios elementos separados por ${separators}. Ejemplo: ${parameter.example}`
          : `${parameter.description} Puedes pegar varios elementos separados por ${separators}.`
      }
      isInvalid={!verdict.valid}
      error={verdict.reason ? [verdict.reason] : undefined}
      fullWidth
    >
      <div
        onPasteCapture={event => {
          const input = event.target as HTMLInputElement;
          const text = event.clipboardData.getData('text');
          const combined =
            typeof input.value === 'string'
              ? input.value.slice(0, input.selectionStart ?? input.value.length) +
                text +
                input.value.slice(input.selectionEnd ?? input.value.length)
              : text;
          const pasted = parseParameterInput(parameter, combined);
          if (pasted.length > 1) {
            event.preventDefault();
            event.stopPropagation();
            publish([...items, ...pasted]);
            setSearch('');
          }
        }}
      >
        <EuiComboBox
          fullWidth
          noSuggestions
          searchValue={search}
          onBlur={() => {
            const pending = parseParameterInput(parameter, search);
            if (pending.length) publish([...items, ...pending]);
            setSearch('');
          }}
          onSearchChange={text => {
            const separator = splitsParameterOnSpaces(parameter) ? /[\s,;]/g : /[\n,;]/g;
            let last = -1;
            let match: RegExpExecArray | null;
            while ((match = separator.exec(text)) !== null) last = match.index;
            if (last >= 0) {
              publish([...items, ...parseParameterInput(parameter, text.slice(0, last))]);
              setSearch(text.slice(last + 1));
            } else {
              setSearch(text);
            }
          }}
          isInvalid={!verdict.valid}
          placeholder={parameter.example}
          selectedOptions={items.map(label => ({ label }))}
          onCreateOption={searchValue => {
            const additions = parseParameterInput(parameter, String(searchValue));
            if (!additions.length) {
              return;
            }
            publish([...items, ...additions]);
          }}
          onChange={selectedOptions => publish(selectedOptions.map(option => String(option.label).trim()))}
        />
      </div>
    </EuiFormRow>
  );
};
