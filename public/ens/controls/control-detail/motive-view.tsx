// Un motivo partido (`motive-parser.ts`), pintado para leerlo: insignias de
// evidencia y estado, el texto en peso normal, las listas como listas, las
// fechas en es-ES (la ISO en el `title`), los parámetros como insignias que
// llevan a Configuración y lo de «Además» aparte, en gris. Nada se recorta: lo
// que no se ve de golpe se despliega.
import React, { useState } from 'react';
import { EuiBadge, EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { formatTimestamp, MotiveList, MotivePart, ParsedMotive, splitTimestamps } from '../../../../common/ens/evaluation/motive-parser';

export const statusBadgeColor = (status?: string) =>
  status === 'CUMPLE' ? 'success' : status === 'NO_CUMPLE' ? 'danger' : status === 'PARCIAL' ? 'warning' : status === 'NO_EVALUABLE' ? 'default' : 'hollow';

// Un parámetro citado: su valor para la máquina y de dónde sale, si se sabe.
export interface MotiveParameterInfo {
  id: string;
  label?: string;
  value?: string;
  origin?: string;
}

export interface MotiveViewHandlers {
  onParameter?: (parameterId: string) => void;
  onEvidence?: (evidenceId: string) => void;
  parameterInfo?: (parameterId: string) => MotiveParameterInfo | undefined;
}

const LISTA_VISIBLE = 5;

const ConFechas = ({ texto }: { texto: string }) => (
  <>
    {splitTimestamps(texto).map((trozo, i) =>
      trozo.iso ? (
        <span key={i} title={trozo.iso} style={{ borderBottom: '1px dotted #98A2B3' }}>
          {formatTimestamp(trozo.iso)}
        </span>
      ) : (
        <React.Fragment key={i}>{trozo.text}</React.Fragment>
      )
    )}
  </>
);

const Lista = ({ list }: { list: MotiveList }) => {
  const [abierta, setAbierta] = useState(false);
  const visibles = abierta ? list.values : list.values.slice(0, LISTA_VISIBLE);
  const ocultos = list.values.length - visibles.length;
  return (
    <>
      <ul style={{ margin: '4px 0 4px 18px', listStyle: 'disc' }}>
        {visibles.map((valor, i) => (
          <li key={i}>
            <code>
              <ConFechas texto={valor} />
            </code>
          </li>
        ))}
      </ul>
      {ocultos > 0 && (
        <EuiButtonEmpty size='xs' flush='left' onClick={() => setAbierta(true)}>
          {`y ${ocultos} más en la lista`}
        </EuiButtonEmpty>
      )}
      {list.more !== undefined && (
        <EuiText size='xs' color='subdued'>
          <span>{`y ${list.more} más (el motivo solo nombra ${list.values.length})`}</span>
        </EuiText>
      )}
    </>
  );
};

// El texto de una parte, con su lista (si la hay) como lista.
export const MotiveText = ({ texto, list }: { texto: string; list?: MotiveList }) =>
  list ? (
    <>
      <ConFechas texto={texto.slice(0, list.start)} />
      <Lista list={list} />
      <ConFechas texto={texto.slice(list.end)} />
    </>
  ) : (
    <ConFechas texto={texto} />
  );

export const ParameterBadges = ({ ids, handlers }: { ids: { id: string; label?: string }[]; handlers: MotiveViewHandlers }) => (
  <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
    {ids.map(parametro => {
      const info = handlers.parameterInfo?.(parametro.id);
      const texto = `${parametro.id}${parametro.label || info?.label ? ` · ${parametro.label || info?.label}` : ''}`;
      const detalle = info?.value !== undefined ? `${info.value}${info.origin ? ` (${info.origin})` : ''}` : undefined;
      return (
        <EuiFlexItem grow={false} key={parametro.id}>
          <EuiBadge
            color='hollow'
            iconType='gear'
            title={detalle ? `Valor que aplica: ${detalle}` : `Configurar ${parametro.id}`}
            onClick={handlers.onParameter ? () => handlers.onParameter!(parametro.id) : undefined}
            onClickAriaLabel={`Configurar ${parametro.id}`}
          >
            {texto}
          </EuiBadge>
          {detalle && (
            <EuiText size='xs' color='subdued'>
              <span>{`aplica: ${detalle}`}</span>
            </EuiText>
          )}
        </EuiFlexItem>
      );
    })}
  </EuiFlexGroup>
);

// Una parte: [EV-11] [NO_CUMPLE] texto; parámetros; «Además».
export const MotivePartView = ({ part, handlers, withSummary = true }: { part: MotivePart; handlers: MotiveViewHandlers; withSummary?: boolean }) => (
  <div style={{ marginBottom: 8 }}>
    <EuiText size='s'>
      <p style={{ marginBottom: 4 }}>
        {part.evidenceId && (
          <>
            <EuiBadge
              color='hollow'
              onClick={handlers.onEvidence ? () => handlers.onEvidence!(part.evidenceId!) : undefined}
              onClickAriaLabel={`Ver ${part.evidenceId} en Evidencias`}
            >
              {part.evidenceId}
            </EuiBadge>{' '}
            <EuiBadge color={statusBadgeColor(part.status)}>{part.status}</EuiBadge>{' '}
          </>
        )}
        {withSummary ? <MotiveText texto={part.text} list={part.list} /> : <MotiveText texto={part.detail} list={undefined} />}
      </p>
    </EuiText>
    {part.parameters.length > 0 && <ParameterBadges ids={part.parameters} handlers={handlers} />}
    {part.secondary !== undefined && (
      <EuiText size='xs' color='subdued'>
        <p style={{ marginTop: 4 }}>
          <strong>Además:</strong> <MotiveText texto={part.secondary} />
        </p>
      </EuiText>
    )}
  </div>
);

// Un motivo entero (el panel «Ver detalle» y la celda de la tabla): su rótulo
// (evidencia o máquinas), la política que lo resolvió y cada parte.
export const MotiveView = ({ parsed, label, handlers }: { parsed: ParsedMotive; label?: string; handlers: MotiveViewHandlers }) => (
  <div style={{ marginBottom: 12 }}>
    {(label || parsed.machines || parsed.policy) && (
      <EuiText size='xs' color='subdued'>
        <p style={{ marginBottom: 4 }}>
          {[label, parsed.machines, parsed.policy ? `resuelta por ${parsed.policy.policyId} (${parsed.policy.requirementId})` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
      </EuiText>
    )}
    {parsed.question !== undefined ? (
      <EuiText size='s' color='subdued'>
        <p style={{ fontStyle: 'italic' }}>Pregunta de auditoría: {parsed.question}</p>
      </EuiText>
    ) : (
      parsed.parts.map((part, i) => <MotivePartView key={i} part={part} handlers={handlers} />)
    )}
  </div>
);
