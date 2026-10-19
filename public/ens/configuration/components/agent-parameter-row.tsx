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

import type { ENSAgentParameterValue, ENSControlParameter, ENSMatchMode } from '../../../../common/ens/configuration/types';
import { withMatchMode } from '../../../../common/ens/configuration/services/parameter-pattern';
import { ParameterRendererFactory, parameterAnchorId } from '../form-engine';
import {
  isEmptyParameterValue,
  toParameterListItems,
  toParameterTableRows,
  validateParameterValue,
} from '../../../../common/ens/configuration/services/parameter-value-validator';
import type { ENSResolvedValueOrigin } from '../../../../common/ens/configuration/agents/configuration-resolver';
import { errorMessage } from './confirm-modal';

interface AgentParameterRowProps {
  agentId: string;
  // `value` es lo que se enseña y se edita: el valor efectivo o, en un
  // parámetro de contribución, solo lo que aporta este sistema.
  parameter: ENSControlParameter;
  parameterClass: 'system' | 'platform';
  origin: ENSResolvedValueOrigin;
  // Parámetro que describe otras máquinas en un control del manager (o el
  // alcance declarado): aquí se declara solo la aportación de este sistema.
  contributionOnly?: boolean;
  // Las filas de la organización, aparte y de solo lectura.
  organisationRows?: string[];
  // Lo que se evalúa de verdad (la unión en la fila del manager), de solo lectura.
  effectiveRows?: string[];
  note?: string;
  applicable: boolean;
  focused: boolean;
  // Qué pasará al guardar este valor (vacío, igual al heredado o propio).
  describeSave: (value: ENSAgentParameterValue | undefined, matchMode?: ENSMatchMode) => 'quitar' | 'igual' | 'propio';
  onSave: (value: ENSAgentParameterValue | undefined, matchMode?: ENSMatchMode) => Promise<void>;
  // Tras guardar el parámetro que pidió la URL, para que no vuelva a abrirse.
  onDone?: () => void;
}

const describeOrigin = (origin: ENSResolvedValueOrigin, hasValue: boolean, contributionOnly = false): string => {
  if (origin.source === 'agent') return 'ajuste propio de este agente';
  if (origin.source === 'template') {
    const name = origin.templateName || origin.templateId;
    return origin.via === 'type' ? `heredado de la plantilla de serie «${name}» de su tipo` : `heredado de la plantilla asignada «${name}»`;
  }
  if (contributionOnly) return 'este agente no aporta filas propias';
  if (origin.source === 'union') return `unión del valor común y de los agentes ${(origin.contributors || []).join(', ')}`;
  return hasValue ? 'heredado del valor común del control' : 'sin valor: ni ajuste propio, ni plantilla, ni valor común';
};

export const valueRows = (
  parameter: Pick<ENSControlParameter, 'type'>,
  value: ENSControlParameter['value'],
  matchMode?: ENSMatchMode
): string[] => {
  if (isEmptyParameterValue(value)) return [];
  if (matchMode === 'regex') return [`Expresión regular: ${String(value)}`];
  if (parameter.type === 'table') return toParameterTableRows(value).filter(row => row.trim());
  if (parameter.type === 'list') return toParameterListItems(value);
  return [String(value)];
};

const Rows = ({ rows }: { rows: string[] }) =>
  rows.length ? (
    <ul>
      {rows.slice(0, 8).map((row, index) => <li key={`${index}-${row}`}>{row}</li>)}
      {rows.length > 8 && <li>… y {rows.length - 8} más</li>}
    </ul>
  ) : (
    <p>—</p>
  );

const HINTS: Record<'quitar' | 'igual', string> = {
  quitar: 'Vacío: al guardar, este agente se queda sin ajuste propio y vuelve a heredar.',
  igual: 'Igual al que ya hereda: no se guarda como propio y seguirá a su origen cuando cambie.',
};

export const AgentParameterRow = ({
  agentId,
  parameter,
  parameterClass,
  origin,
  contributionOnly = false,
  organisationRows,
  effectiveRows,
  note,
  applicable,
  focused,
  describeSave,
  onSave,
  onDone,
}: AgentParameterRowProps) => {
  // Solo al montar: el parámetro que pide la URL se abre una vez.
  const [editing, setEditing] = useState(focused);
  const [draft, setDraft] = useState<ENSControlParameter['value']>(parameter.value);
  const [draftMode, setDraftMode] = useState<ENSMatchMode>(parameter.matchMode === 'regex' ? 'regex' : 'exact');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const anchor = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const rows = valueRows(parameter, parameter.value, parameter.matchMode);
  const own = origin.source === 'agent';
  const valueKey = JSON.stringify([parameter.value ?? null, parameter.matchMode ?? null]);
  const storedMode: ENSMatchMode = parameter.matchMode === 'regex' ? 'regex' : 'exact';
  const resetDraft = () => {
    setDraft(parameter.value);
    setDraftMode(storedMode);
  };

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    if (focused) anchor.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, []);

  // Cuando el valor cambia (tras guardar), el borrador vuelve a él.
  useEffect(() => {
    if (!editing) resetDraft();
  }, [valueKey]);

  const save = async (value: ENSAgentParameterValue | undefined, matchMode: ENSMatchMode) => {
    if (value !== undefined && !isEmptyParameterValue(value)) {
      const verdict = validateParameterValue(withMatchMode(parameter, matchMode), value);
      if (!verdict.valid) {
        setError(`${parameter.id} · ${parameter.label}: ${String(verdict.reason).replace(/\.$/, '')}.`);
        return;
      }
    }
    const mode = describeSave(value, matchMode);
    setSaving(true);
    setError(undefined);
    try {
      await onSave(value, matchMode);
      if (!mounted.current) return;
      setEditing(false);
      setSaved(mode === 'propio' ? undefined : HINTS[mode]);
      onDone?.();
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const mode = editing ? describeSave(draft as ENSAgentParameterValue | undefined, draftMode) : 'propio';

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
            <EuiBadge color='hollow'>{parameterClass === 'system' ? 'cambia por agente' : 'de la plataforma'}</EuiBadge>
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

        {note && (
          <EuiText size='xs' color='subdued'>
            <p>{note}</p>
          </EuiText>
        )}

        {!editing && (
          <EuiText size='xs'>
            {contributionOnly && <p><strong>De este agente:</strong></p>}
            <Rows rows={rows} />
          </EuiText>
        )}

        {contributionOnly && organisationRows && organisationRows.length > 0 && (
          <EuiText size='xs' color='subdued'>
            <p><strong>Del valor común</strong> (solo lectura; se edita en «Controles»):</p>
            <Rows rows={organisationRows} />
          </EuiText>
        )}

        {effectiveRows && (
          <EuiText size='xs' color='subdued'>
            <p><strong>Lo que se evalúa en esta fila</strong> (solo lectura):</p>
            <Rows rows={effectiveRows} />
          </EuiText>
        )}

        {editing && (
          <>
            <EuiSpacer size='s' />
            <ParameterRendererFactory
              parameter={withMatchMode(parameter, draftMode)}
              value={draft}
              onChange={(_name, value) => setDraft(value)}
              onMatchModeChange={(_name, next) => setDraftMode(next)}
            />
            {mode !== 'propio' && (
              <EuiText size='xs' color='subdued'>
                <p>{HINTS[mode]}</p>
              </EuiText>
            )}
          </>
        )}

        {saved && !editing && (
          <EuiText size='xs' color='subdued'>
            <p>{saved}</p>
          </EuiText>
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
                <EuiButton size='s' fill isLoading={saving} onClick={() => save(draft as ENSAgentParameterValue | undefined, draftMode)}>
                  Guardar para este agente
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size='s' onClick={() => { resetDraft(); setError(undefined); setEditing(false); onDone?.(); }}>
                  Cancelar
                </EuiButtonEmpty>
              </EuiFlexItem>
            </>
          ) : (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size='s' iconType='pencil' onClick={() => { resetDraft(); setSaved(undefined); setEditing(true); }}>
                {own ? 'Editar' : contributionOnly ? 'Declarar filas de este agente' : 'Dar ajuste propio'}
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
          {own && !editing && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size='s' color='danger' isLoading={saving} onClick={() => save(undefined, 'exact')}>
                Quitar ajuste propio (vuelve a heredar)
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiPanel>
      <EuiSpacer size='s' />
    </div>
  );
};
