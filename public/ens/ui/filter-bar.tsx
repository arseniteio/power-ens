import React from 'react';
import { EuiFieldSearch, EuiFilterButton, EuiFilterGroup, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';

export interface ENSFilterOption {
  value: string;
  label: React.ReactNode;
  count?: number;
}

interface FilterBarProps {
  allLabel: string;
  options: ENSFilterOption[];
  active: string;
  onFilter: (value: string) => void;
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}

// The same filter for controls and for machines: one button per group and a search box.
export const FilterBar = ({ allLabel, options, active, onFilter, query, onQuery, placeholder, ariaLabel }: FilterBarProps) => (
  <EuiFlexGroup gutterSize='m' alignItems='center' wrap>
    <EuiFlexItem grow={false}>
      <EuiFilterGroup>
        <EuiFilterButton hasActiveFilters={!active} onClick={() => onFilter('')}>
          {allLabel}
        </EuiFilterButton>
        {options.map(option => (
          <EuiFilterButton
            key={option.value}
            hasActiveFilters={active === option.value}
            numFilters={option.count}
            onClick={() => onFilter(active === option.value ? '' : option.value)}
          >
            {option.label}
          </EuiFilterButton>
        ))}
      </EuiFilterGroup>
    </EuiFlexItem>
    <EuiFlexItem>
      <EuiFieldSearch
        fullWidth
        incremental
        isClearable
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={query}
        onChange={(event: { target: { value: string } }) => onQuery(event.target.value)}
      />
    </EuiFlexItem>
  </EuiFlexGroup>
);
