import React, { useEffect, useState } from 'react';
import { EuiButtonEmpty, EuiButtonGroup, EuiButtonIcon, EuiComboBox, EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText } from '@elastic/eui';
import {
  ENSProfileCondition,
  ENS_PROFILE_GROUP_PREFIX,
  ENS_PROFILE_LIST_FIELDS,
  ENS_PROFILE_LIST_OPS,
  ENS_PROFILE_SCALAR_FIELDS,
  ENS_PROFILE_SCALAR_OPS,
} from '../../../../common/ens/profiles/types';
import { FIELD_LABELS, OP_LABELS, roleLabel } from './profile-labels';
import { profilesClient } from './profiles-client';
import { Choice } from '../../ui/choice';

export type ENSConditionSuggestions = Record<string, string[]>;

const FIELDS = [...ENS_PROFILE_SCALAR_FIELDS, ...ENS_PROFILE_LIST_FIELDS];
const isListField = (field: string): boolean => (ENS_PROFILE_LIST_FIELDS as string[]).includes(field);

export const useConditionSuggestions = (): ENSConditionSuggestions => {
  const [suggestions, setSuggestions] = useState<ENSConditionSuggestions>({});
  useEffect(() => {
    let current = true;
    profilesClient
      .searchHosts({ page: 0, size: 1, text: '', filters: {} })
      .then(page => {
        if (!current) return;
        const values = (buckets: Array<{ value: string }>) => buckets.map(bucket => bucket.value);
        setSuggestions({
          distro: values(page.facets.distro),
          family: values(page.facets.family),
          role: Array.from(new Set(['manager', 'server', 'workstation', ...values(page.facets.role)])),
          service: values(page.facets.service),
          group: values(page.facets.group).filter(group => !group.startsWith(ENS_PROFILE_GROUP_PREFIX)),
        });
      })
      .catch(() => current && setSuggestions({ role: ['manager', 'server', 'workstation'] }));
    return () => {
      current = false;
    };
  }, []);
  return suggestions;
};

interface ConditionBuilderProps {
  match: ENSProfileCondition[];
  suggestions: ENSConditionSuggestions;
  readOnly: boolean;
  onChange: (match: ENSProfileCondition[]) => void;
}

const valueLabel = (field: string, value: string): string => (field === 'role' ? `${roleLabel(value)} (${value})` : value);

const ConditionRow = ({
  condition,
  suggestions,
  readOnly,
  onChange,
  onRemove,
}: {
  condition: ENSProfileCondition;
  suggestions: string[];
  readOnly: boolean;
  onChange: (condition: ENSProfileCondition) => void;
  onRemove: () => void;
}) => {
  const ops = isListField(condition.field) ? ENS_PROFILE_LIST_OPS : ENS_PROFILE_SCALAR_OPS;
  const options = suggestions.map(value => ({ label: valueLabel(condition.field, value), value }));
  const selected = condition.value ? [{ label: valueLabel(condition.field, condition.value), value: condition.value }] : [];
  return (
    <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
      <EuiFlexItem grow={false} style={{ width: 190 }}>
        <Choice
          legend='Campo'
          options={FIELDS.map(field => ({ value: field, text: FIELD_LABELS[field] }))}
          value={condition.field}
          onChange={(value: string) => {
            const field = value;
            onChange({ field, op: isListField(field) ? 'has' : 'is', value: '' });
          }}
          disabled={readOnly}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonGroup
          legend='Operador'
          options={ops.map(op => ({ id: op, label: OP_LABELS[op] }))}
          idSelected={condition.op}
          isDisabled={readOnly}
          onChange={op => onChange({ ...condition, op })}
          buttonSize='compressed'
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiComboBox
          compressed
          fullWidth
          isDisabled={readOnly}
          placeholder={condition.op === 'matches' ? 'Patrón, por ejemplo ubuntu-*' : condition.op === 'in' ? 'Lista separada por comas: web-01, web-02' : 'Escribe o elige un valor'}
          singleSelection={{ asPlainText: true }}
          options={options}
          selectedOptions={selected}
          onChange={choice => onChange({ ...condition, value: String(choice[0]?.value ?? '') })}
          onCreateOption={value => onChange({ ...condition, value: value.trim() })}
          customOptionText='Usar «{searchValue}»'
          noSuggestions={!options.length}
          aria-label='Valor'
        />
      </EuiFlexItem>
      {!readOnly && (
        <EuiFlexItem grow={false}>
          <EuiButtonIcon iconType='cross' color='danger' onClick={onRemove} aria-label='Quitar la condición' />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

export const ConditionBuilder = ({ match, suggestions, readOnly, onChange }: ConditionBuilderProps) => (
  <>
    {match.map((condition, index) => (
      <React.Fragment key={index}>
        {index > 0 && (
          <EuiText size='xs' color='subdued'>
            <p>y además</p>
          </EuiText>
        )}
        <ConditionRow
          condition={condition}
          suggestions={suggestions[condition.field] || []}
          readOnly={readOnly}
          onChange={next => onChange(match.map((item, at) => (at === index ? next : item)))}
          onRemove={() => onChange(match.filter((_item, at) => at !== index))}
        />
        <EuiSpacer size='s' />
      </React.Fragment>
    ))}
    {!readOnly && (
      <EuiButtonEmpty size='s' iconType='plusInCircle' flush='left' onClick={() => onChange([...match, { field: 'distro', op: 'is', value: '' }])}>
        Añadir condición
      </EuiButtonEmpty>
    )}
  </>
);
