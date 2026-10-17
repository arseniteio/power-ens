import React, { useEffect, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import type { ENSAgentParameterValue, ENSControlParameter } from '../types';
import { ParameterRendererFactory, parameterAnchorId } from '../form-engine';
import {
  isEmptyParameterValue,
  toParameterListItems,
  toParameterTableRows,
} from '../services/parameter-value-validator';
import { validateParameterValue } from '../services/parameter-value-validator';
import type { ENSResolvedValueOrigin } from '../agents/configuration-resolver';
import { getConfigurationTemplate } from '../templates';

interface AgentParameterRowProps {
  agentId: string;
  parameter: ENSControlParameter;
  parameterClass: 'system' | 'platform';
  origin: ENSResolvedValueOrigin;
  // En la fila del manager, este parámetro se junta con los de los demás.
  unionNote?: string;
  // El valor que se enseña es solo lo que aporta este sistema a una unión.
  contributionOnly?: boolean;
  applicable: boolean;
  focused: boolean;
  onSave: (value: ENSAgentParameterValue | undefined) => Promise<void>;
}

// De dónde sale el valor, dicho explícitamente.
export const describeOrigin = (origin: ENSResolvedValueOrigin, hasValue: boolean, contributionOnly = false): string => {
  if (origin.source === 'agent') return 'valor propio de este sistema';
  if (contributionOnly && origin.source !== 'template') return 'este sistema no aporta filas propias';
  if (origin.source === 'template') return `heredado de la plantilla «${getConfigurationTemplate(origin.templateId || '')?.label || origin.templateId}»`;
  if (origin.source === 'union') return `unión de la organización y de los sistemas ${(origin.contributors || []).join(', ')}`;
  return hasValue ? 'heredado de la organización' : 'sin valor: ni propio, ni de plantilla, ni de la organización';
};

const summary = (parameter: ENSControlParameter): string[] => {
  const value = parameter.value;
  if (isEmptyParameterValue(value)) return [];
  if (parameter.type === 'table') return toParameterTableRows(value).filter(row => row.trim());
  if (parameter.type === 'list') return toParameterListItems(value);
  return [String(value)];
};

export const AgentParameterRow = ({
  agentId,
  parameter,
  parameterClass,
  origin,
  unionNote,
  contributionOnly = false,
  applicable,
  focused,
  onSave,
}: AgentParameterRowProps) => {
  const [editing, setEditing] = useState(focused);
  const [draft, setDraft] = useState<ENSControlParameter['value']>(parameter.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const anchor = useRef<HTMLDivElement>(null);
  const rows = summary(parameter);
  const own = origin.source === 'agent';

  useEffect(() => {
    if (focused) anchor.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [focused]);

  const save = async (value: ENSAgentParameterValue | undefined) => {
    if (value !== undefined) {
      const verdict = validateParameterValue(parameter, value);
      if (!verdict.valid) {
        setError(`${parameter.id} · ${parameter.label}: ${verdict.reason}.`);
        return;
      }
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave(value);
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar la configuración ENS.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={anchor} id={parameterAnchorId(parameter.controlId, parameter.id, agentId)}>
      <EuiPanel paddingSize='s' color={focused ? 'primary' : 'plain'}>
        <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiText size='s'>
              <strong>{parameter.id} · {parameter.label}</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color='hollow'>{parameterClass === 'system' ? 'por sistema' : 'por plataforma'}</EuiBadge>
          </EuiFlexItem>
          {parameter.required && applicable && (
            <EuiFlexItem grow={false}>
              <EuiBadge color='warning'>obligatorio</EuiBadge>
            </EuiFlexItem>
          )}
          {!applicable && (
            <EuiFlexItem grow={false}>
              <EuiBadge color='default'>no aplica a este nivel</EuiBadge>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiBadge color={own ? 'primary' : 'default'}>{describeOrigin(origin, rows.length > 0, contributionOnly)}</EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>

        {unionNote && (
          <EuiText size='xs' color='subdued'>
            <p>{unionNote}</p>
          </EuiText>
        )}

        {!editing && (
          <EuiText size='xs'>
            {rows.length ? (
              <ul>
                {rows.slice(0, 8).map(row => <li key={row}>{row}</li>)}
                {rows.length > 8 && <li>… y {rows.length - 8} más</li>}
              </ul>
            ) : (
              <p>—</p>
            )}
          </EuiText>
        )}

        {editing && (
          <>
            <EuiSpacer size='s' />
            <ParameterRendererFactory
              parameter={parameter}
              value={draft}
              onChange={(_name, value) => setDraft(value)}
            />
          </>
        )}

        {error && (
          <>
            <EuiSpacer size='s' />
            <EuiCallOut color='danger' iconType='alert' size='s' title={error} />
          </>
        )}

        <EuiSpacer size='s' />

        <EuiFlexGroup gutterSize='s' responsive={false}>
          {editing ? (
            <>
              <EuiFlexItem grow={false}>
                <EuiButton size='s' fill isLoading={saving} onClick={() => save(draft as ENSAgentParameterValue | undefined)}>
                  Guardar para este sistema
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size='s' onClick={() => { setDraft(parameter.value); setError(undefined); setEditing(false); }}>
                  Cancelar
                </EuiButtonEmpty>
              </EuiFlexItem>
            </>
          ) : (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size='s' iconType='pencil' onClick={() => { setDraft(parameter.value); setEditing(true); }}>
                {own ? 'Editar' : 'Dar valor propio'}
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
          {own && !editing && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size='s' color='danger' isLoading={saving} onClick={() => save(undefined)}>
                Quitar valor propio (vuelve a heredar)
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiPanel>
      <EuiSpacer size='s' />
    </div>
  );
};
