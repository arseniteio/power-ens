import React, { useLayoutEffect, useRef, useState } from 'react';
import { EuiComboBox, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import {
  toParameterListItems,
  validateParameterValue,
} from '../../../../../common/ens/configuration/services/parameter-value-validator';
import {
  hasParameterSeparator,
  parseParameterInput,
  splitsParameterOnSpaces,
} from '../../../../../common/ens/configuration/services/parameter-input';

export const ListParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const comboBox = useRef<EuiComboBox<string>>(null);
  const [searchClears, setSearchClears] = useState(0);
  const items = toParameterListItems(value);

  // EUI 1.19 owns the search text and overwrites a clear made during onSearchChange, so it waits for the commit.
  useLayoutEffect(() => {
    if (searchClears) comboBox.current?.clearSearchValue();
  }, [searchClears]);

  const clearSearch = () => setSearchClears(count => count + 1);

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
            clearSearch();
          }
        }}
      >
        <EuiComboBox
          fullWidth
          noSuggestions
          ref={comboBox}
          onSearchChange={text => {
            if (!hasParameterSeparator(parameter, text)) return;
            publish([...items, ...parseParameterInput(parameter, text)]);
            clearSearch();
          }}
          isInvalid={!verdict.valid}
          placeholder={parameter.example}
          selectedOptions={items.map(label => ({ label }))}
          onCreateOption={text => {
            const additions = parseParameterInput(parameter, String(text));
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
