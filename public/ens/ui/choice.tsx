import React, { useState } from 'react';
import { EuiButtonGroup, EuiSelectable } from '@elastic/eui';

export interface ENSChoiceOption {
  value: string;
  text: string;
  disabled?: boolean;
}

interface ChoiceProps {
  legend: string;
  options: ENSChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  fullWidth?: boolean;
}

// Up to this many options are shown as buttons side by side; more become a list with a search box.
const BUTTONS_MAX = 6;

let sequence = 0;
const useId = (): string => {
  const [id] = useState(() => `ens-choice-${++sequence}`);
  return id;
};

const buttonId = (prefix: string, value: string): string => `${prefix}-${value === '' ? 'none' : value.replace(/[^A-Za-z0-9_-]/g, '_')}`;

// Every option stays visible: no menu opens on top of the page.
export const Choice = ({ legend, options, value, onChange, disabled, fullWidth }: ChoiceProps) => {
  const prefix = useId();

  if (options.length <= BUTTONS_MAX) {
    return (
      <EuiButtonGroup
        legend={legend}
        buttonSize='compressed'
        isFullWidth={fullWidth}
        isDisabled={disabled}
        idSelected={buttonId(prefix, value)}
        options={options.map(option => ({ id: buttonId(prefix, option.value), label: option.text, isDisabled: option.disabled }))}
        onChange={id => {
          const picked = options.find(option => buttonId(prefix, option.value) === id);
          if (picked) onChange(picked.value);
        }}
      />
    );
  }

  return (
    <EuiSelectable
      aria-label={legend}
      searchable
      singleSelection='always'
      isLoading={false}
      listProps={{ bordered: true, showIcons: true }}
      height={Math.min(options.length, 8) * 32}
      searchProps={{ placeholder: 'Buscar', compressed: true, disabled }}
      options={options.map(option => ({
        label: option.text,
        key: option.value,
        checked: option.value === value ? 'on' : undefined,
        disabled: disabled || option.disabled,
      }))}
      onChange={next => {
        const picked = next.find(option => option.checked === 'on');
        if (picked?.key !== undefined) onChange(String(picked.key));
      }}
    >
      {(list, search) => (
        <>
          {search}
          {list}
        </>
      )}
    </EuiSelectable>
  );
};
