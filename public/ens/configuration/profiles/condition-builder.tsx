import React, { useEffect, useState } from 'react';
import { EuiBadge, EuiButtonEmpty, EuiButtonIcon, EuiFieldText, EuiFlexGroup, EuiFlexItem, EuiFormRow, EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';
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

const valueLabel = (field: string, value: string): string => (field === 'role' ? roleLabel(value) : value);

const SUGGESTIONS_SHOWN = 12;

const placeholderOf = (op: string): string => (op === 'matches' ? 'ubuntu-*' : op === 'in' ? 'web-01, web-02' : 'Valor');

const ValueInput = ({
  condition,
  suggestions,
  readOnly,
  onChange,
}: {
  condition: ENSProfileCondition;
  suggestions: string[];
  readOnly: boolean;
  onChange: (value: string) => void;
}) => {
  const typed = condition.value.trim().toLowerCase();
  const shown = suggestions
    .filter(value => value !== condition.value && (!typed || value.toLowerCase().includes(typed) || valueLabel(condition.field, value).toLowerCase().includes(typed)))
    .slice(0, SUGGESTIONS_SHOWN);
  return (
    <>
      <EuiFieldText
        compressed
        fullWidth
        readOnly={readOnly}
        value={condition.value}
        placeholder={placeholderOf(condition.op)}
        onChange={event => onChange(event.target.value)}
        aria-label='Valor'
      />
      {!readOnly && shown.length > 0 && (
        <>
          <EuiSpacer size='xs' />
          <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
            {shown.map(value => (
              <EuiFlexItem grow={false} key={value}>
                <EuiBadge color='hollow' onClick={() => onChange(value)} onClickAriaLabel={`Usar ${valueLabel(condition.field, value)}`}>
                  {valueLabel(condition.field, value)}
                </EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </>
      )}
    </>
  );
};

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
  return (
    <EuiPanel color='subdued' paddingSize='s' hasBorder>
      <EuiFlexGroup gutterSize='s' alignItems='flexStart' responsive={false}>
        <EuiFlexItem>
          <EuiFormRow label='Campo' fullWidth display='rowCompressed'>
            <Choice
              legend='Campo'
              options={FIELDS.map(field => ({ value: field, text: FIELD_LABELS[field] }))}
              value={condition.field}
              onChange={(field: string) => onChange({ field, op: isListField(field) ? 'has' : 'is', value: '' })}
              disabled={readOnly}
            />
          </EuiFormRow>
          <EuiFormRow label='Operador' fullWidth display='rowCompressed'>
            <Choice
              legend='Operador'
              options={ops.map(op => ({ value: op, text: OP_LABELS[op] }))}
              value={condition.op}
              onChange={(op: string) => onChange({ ...condition, op })}
              disabled={readOnly}
            />
          </EuiFormRow>
          <EuiFormRow label='Valor' fullWidth display='rowCompressed'>
            <ValueInput condition={condition} suggestions={suggestions} readOnly={readOnly} onChange={value => onChange({ ...condition, value })} />
          </EuiFormRow>
        </EuiFlexItem>
        {!readOnly && (
          <EuiFlexItem grow={false}>
            <EuiButtonIcon iconType='trash' color='danger' onClick={onRemove} aria-label='Quitar condición' />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPanel>
  );
};

export const ConditionBuilder = ({ match, suggestions, readOnly, onChange }: ConditionBuilderProps) => (
  <>
    {match.map((condition, index) => (
      <React.Fragment key={index}>
        {index > 0 && (
          <EuiText size='xs' color='subdued'>
            <p>Y</p>
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
