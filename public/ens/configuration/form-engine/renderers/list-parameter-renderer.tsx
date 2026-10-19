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

// Renderer of `type: 'list'` parameters. A pill combo box: the stored value is always `string[]` (what
// `ENSControlParameter['value']` and the structure validator declare).

// Conversion of the stored value to items lives in `toParameterListItems` (services/parameter-value-validator)
// so the validator counts exactly as the form. A legacy string is split by newline and comma, never by `|` (it
// separates the fields of one item).

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
            // Entries closed by a separator are confirmed; what follows the last one is still being typed.
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
