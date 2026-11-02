// A non-conformity card.
import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { MotiveLine } from './motive-cell';
import type { NonConformityClass } from './nonconformity-class';
import {
  describeAction,
  guiltyPart,
  isGenericExpectation,
  KnownReasonParts,
  MotiveList,
  MotivePart,
  parseMotive,
  ParsedMotive,
  partToText,
} from '../../../../common/ens/evaluation/motive-parser';
import {
  LinkBadge,
  MotiveText,
  MotiveView,
  MotiveViewHandlers,
  ParameterBadges,
  statusBadgeColor,
} from './motive-view';
import { GuideCode } from './control-guide';
import type { GuideTarget } from './control-guide';
import { ENS_THEME } from '../../theme-colors';
import { statusLabel } from '../../../../common/ens/core/status-label';

interface NonConformityItem {
  id: string;
  requirement: string;
  // Distinguishes a measured failure from a missing proof and gives the card background; not tied to `status`, since every drawn card is OPEN.
  origin: string;
  finding: string;
  impact: string;
  requiredAction: string;
  expected?: string;
  actual?: string;
  parameterIds: string[];
  evidenceIds?: string[];
}

interface NonConformityCardProps {
  item: NonConformityItem;
  clase: NonConformityClass;
  criticidad?: string;
  etiquetaAlcance: string;
  textoAlcance: string;
  lineasMotivo: MotiveLine[];
  evidenciasImplicadas: string[];
  controlId: string;
  ocultos?: number;
  conocidos?: KnownReasonParts[];
  handlers?: MotiveViewHandlers;
  onGuide?: (target: GuideTarget) => void;
}

const QUESTION_PREFIX = 'Pregunta de auditoría:';

interface ParsedLine {
  linea: MotiveLine;
  motivo: ParsedMotive;
}

const readCardMotive = (
  lines: MotiveLine[],
  evidenceIds: string[],
  finding: string,
  known: KnownReasonParts[] = []
) => {
  // The engine finding of a measure is the same motive without prefixes: not repeated when already in an observation.
  const seen = new Set<string>();
  const bodies = new Set<string>();
  const parsedItems: ParsedLine[] = lines
    .filter(line => line.texto.trim() && !line.texto.startsWith(QUESTION_PREFIX))
    .map(line => ({ linea: line, motivo: parseMotive(line.texto, known) }))
    .filter(({ linea: line, motivo: motive }) => {
      const body = motive.parts.map(partToText).join(' | ');
      const key = `${motive.machines || ''}|${body}`;
      if (seen.has(key) || (line.etiqueta === 'Motor' && bodies.has(body))) return false;
      seen.add(key);
      bodies.add(body);
      return true;
    });
  const nonConforming = (p: MotivePart) => p.status && p.status !== 'CUMPLE' && p.status !== 'NO_APLICA';
  const main =
    parsedItems.find(l => l.motivo.parts.some(p => p.evidenceId && evidenceIds.includes(p.evidenceId) && nonConforming(p))) || parsedItems[0];
  const culprit = main ? guiltyPart(main.motivo.parts, evidenceIds) : undefined;
  const others = main ? main.motivo.parts.filter(p => p !== culprit) : [];
  return {
    leidas: parsedItems,
    principal: main,
    culpable: culprit,
    titular: culprit?.summary || finding,
    otrasNoConformes: others.filter(p => nonConforming(p)),
    conformes: others.filter(p => p.status === 'CUMPLE' || p.status === 'NO_APLICA'),
    pregunta: lines.find(line => line.texto.startsWith(QUESTION_PREFIX)),
  };
};

// Layout of the culprit part (no React, tested in tests/nonconformity-card.test.ts): headline (first sentence), remainder of that sentence if cut, and rest of the part.
const HEADLINE_MAX = 200;
const INTRO_MIN = 15;

interface CardTextBlock {
  text: string;
  list?: MotiveList;
}

interface CardPartLayout {
  headline: string;
  cutAtWord: boolean;
  rest?: CardTextBlock;
  detail?: CardTextBlock;
}

const shift = (list: MotiveList, from: number): MotiveList => ({ ...list, start: list.start - from, end: list.end - from });
const skipSpaces = (text: string, i: number) => {
  while (i < text.length && /\s/.test(text[i])) i += 1;
  return i;
};

const layoutGuiltyPart = (part: Pick<MotivePart, 'text' | 'summary' | 'list'>, max: number = HEADLINE_MAX): CardPartLayout => {
  const sentence = part.summary;
  const text = part.text;
  const list = part.list;
  const listInSentence = Boolean(list && list.start < sentence.length);
  const sentenceEnd = listInSentence ? Math.max(sentence.length, list!.end) : sentence.length;
  let cutoff = sentence.length;
  let cutAtWord = false;
  if (listInSentence && list!.start >= INTRO_MIN) cutoff = list!.start;
  if (cutoff > max) {
    const space = sentence.lastIndexOf(' ', max);
    cutoff = space > max / 2 ? space : max;
    cutAtWord = true;
  }
  const truncated = cutoff < sentence.length;
  const headline = !truncated ? sentence : cutAtWord ? `${sentence.slice(0, cutoff).trimEnd()}…` : sentence.slice(0, cutoff).trimEnd();
  let rest: CardTextBlock | undefined;
  if (truncated) {
    const from = skipSpaces(text, cutoff);
    rest = { text: text.slice(from, sentenceEnd), ...(listInSentence && list!.start >= from ? { list: shift(list!, from) } : {}) };
  }
  const fromDetail = skipSpaces(text, sentenceEnd);
  const remainder = text.slice(fromDetail);
  const detail = remainder
    ? { text: remainder, ...(list && !listInSentence && list.start >= fromDetail ? { list: shift(list, fromDetail) } : {}) }
    : undefined;
  return { headline, cutAtWord, ...(rest ? { rest } : {}), ...(detail ? { detail } : {}) };
};

export const NonConformityCard = ({
  item,
  clase: kind,
  criticidad: criticality,
  etiquetaAlcance: scopeLabel,
  textoAlcance: scopeText,
  lineasMotivo: motiveRows,
  evidenciasImplicadas: involvedEvidences,
  controlId,
  ocultos: hidden = 0,
  conocidos: known = [],
  handlers = {},
  onGuide,
}: NonConformityCardProps) => {
  const [panelOpen, setPanelOpen] = useState(false);

  const reading = readCardMotive(motiveRows, item.evidenceIds || involvedEvidences, item.finding, known);
  const { culpable: culprit } = reading;
  const layout: CardPartLayout = culprit ? layoutGuiltyPart(culprit) : layoutGuiltyPart({ text: reading.titular, summary: reading.titular });
  const headlineText = layout.headline;

  const parameters = [
    ...(culprit?.parameters || []),
    ...item.parameterIds.map(id => ({ id })),
  ].filter((p, i, all) => all.findIndex(q => q.id === p.id) === i);

  const genericRequest = isGenericExpectation(item.expected, item.actual);
  const action = describeAction(item.requiredAction, culprit);

  const context = [
    scopeText ? `${scopeLabel.toLowerCase()} ${scopeText}` : '',
  ].filter(Boolean);

  return (
    <>
      <EuiPanel
        paddingSize='m'
        color={item.origin === 'MEDIDA' ? 'plain' : 'subdued'}
        style={{ borderLeft: `4px solid ${kind.color}`, height: '100%' }}
      >
        <EuiFlexGroup gutterSize='xs' alignItems='center' wrap responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge color={kind.badgeColor} iconType={kind.icono}>
              {kind.etiqueta}
            </EuiBadge>
          </EuiFlexItem>
          {criticality && (
            <EuiFlexItem grow={false}>
              <EuiBadge color='hollow'>Criticidad {criticality}</EuiBadge>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              {item.id}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size='s' />

        <EuiText size='s'>
          <p style={{ marginBottom: 0 }}>
            {culprit?.evidenceId && (
              <>
                <LinkBadge
                  color='hollow'
                  onClick={handlers.onEvidence ? () => handlers.onEvidence!(culprit.evidenceId!) : undefined}
                  label={`Ver la explicación de ${culprit.evidenceId}`}
                >
                  <strong>{culprit.evidenceId}</strong>
                </LinkBadge>{' '}
                <EuiBadge color={statusBadgeColor(culprit.status)}>{statusLabel(culprit.status)}</EuiBadge>{' '}
              </>
            )}
          </p>
          <p title={reading.titular}>{headlineText}</p>
        </EuiText>

        <EuiSpacer size='xs' />

        <EuiText size='xs' color='subdued'>
          {onGuide ? (
            <>
              <GuideCode target={{ kind: 'requirement', id: item.requirement }} onOpen={onGuide} />
              {involvedEvidences.map(id => (
                <React.Fragment key={id}>
                  {', '}
                  <GuideCode target={{ kind: 'evidence', id }} onOpen={onGuide} />
                </React.Fragment>
              ))}
              {context.length > 0 && ' · '}
            </>
          ) : (
            [item.requirement, ...involvedEvidences].join(', ') + (context.length > 0 ? ' · ' : '')
          )}
          {context.join(' · ')}
        </EuiText>

        {(layout.rest || layout.detail || culprit?.secondary !== undefined) && (
          <>
            <EuiSpacer size='s' />
            <EuiText size='xs'>
              {layout.rest && (
                <div style={{ marginBottom: 6 }}>
                  {layout.cutAtWord ? '…' : ''}
                  <MotiveText texto={layout.rest.text} list={layout.rest.list} />
                </div>
              )}
              {layout.detail && (
                <div style={{ marginBottom: 6 }}>
                  <MotiveText texto={layout.detail.text} list={layout.detail.list} />
                </div>
              )}
              {culprit?.secondary !== undefined && (
                <p style={{ color: ENS_THEME.subduedText }}>
                  <strong>Además:</strong> <MotiveText texto={culprit.secondary} />
                </p>
              )}
            </EuiText>
          </>
        )}

        {reading.otrasNoConformes.length > 0 && (
          <>
            <EuiSpacer size='s' />
            {reading.otrasNoConformes.map((part, i) => (
              <EuiText size='xs' key={`${part.evidenceId}-${i}`}>
                <p style={{ marginBottom: 2 }}>
                  <LinkBadge
                    color='hollow'
                    onClick={handlers.onEvidence && part.evidenceId ? () => handlers.onEvidence!(part.evidenceId!) : undefined}
                    label={`Ver la explicación de ${part.evidenceId}`}
                  >
                    {part.evidenceId}
                  </LinkBadge>{' '}
                  <EuiBadge color={statusBadgeColor(part.status)}>{statusLabel(part.status)}</EuiBadge>{' '}
                  <MotiveText texto={part.summary} />
                </p>
              </EuiText>
            ))}
          </>
        )}
        {reading.conformes.length > 0 && (
          <EuiAccordion
            id={`nc-conformes-${item.id}`}
            buttonContent={`${reading.conformes.length} evidencia${reading.conformes.length === 1 ? '' : 's'} del requisito ${reading.conformes.length === 1 ? 'conforma' : 'conforman'}`}
            paddingSize='xs'
          >
            {reading.conformes.map((part, i) => (
              <EuiText size='xs' key={`${part.evidenceId}-${i}`} color='subdued'>
                <p style={{ marginBottom: 2 }}>
                  <EuiBadge color='hollow'>{part.evidenceId}</EuiBadge>{' '}
                  <EuiBadge color={statusBadgeColor(part.status)}>{statusLabel(part.status)}</EuiBadge>{' '}
                  <MotiveText texto={part.summary} />
                </p>
              </EuiText>
            ))}
          </EuiAccordion>
        )}

        {parameters.length > 0 && (
          <>
            <EuiSpacer size='s' />
            <ParameterBadges ids={parameters} handlers={handlers} />
          </>
        )}

        {(item.expected || item.actual) && !genericRequest && (
          <>
            <EuiSpacer size='s' />
            <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
              {item.expected && (
                <EuiFlexItem grow={false}>
                  <EuiText size='xs' color='subdued'>
                    Se pedía
                  </EuiText>
                  <EuiText size='xs'>{item.expected}</EuiText>
                </EuiFlexItem>
              )}
              {item.actual && (
                <EuiFlexItem grow={false}>
                  <EuiText size='xs' color='subdued'>
                    Hay
                  </EuiText>
                  <EuiText size='xs'>{item.actual}</EuiText>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </>
        )}

        <EuiSpacer size='m' />

        <EuiFlexGroup gutterSize='xs' alignItems='center' justifyContent='spaceBetween' responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize='xs' alignItems='center' responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiBadge color={kind.badgeColor}>{kind.accion}</EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size='xs' color='subdued'>
                  {kind.responsable}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiText size='xs'>
              <span>{action}</span>
            </EuiText>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='xs' flush='right' iconType='inspect' onClick={() => setPanelOpen(true)}>
              Ver detalle
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      {panelOpen && (
        <EuiFlyout onClose={() => setPanelOpen(false)} size='m' ownFocus aria-labelledby='nc-panel-titulo'>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size='s'>
              <h2 id='nc-panel-titulo'>{item.id}</h2>
            </EuiTitle>
            <EuiSpacer size='xs' />
            <EuiFlexGroup gutterSize='xs' responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiBadge color={kind.badgeColor} iconType={kind.icono}>
                  {kind.etiqueta}
                </EuiBadge>
              </EuiFlexItem>
              {criticality && (
                <EuiFlexItem grow={false}>
                  <EuiBadge color='hollow'>Criticidad {criticality}</EuiBadge>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlyoutHeader>

          <EuiFlyoutBody>
            <EuiTitle size='xxs'>
              <h3>Motivo</h3>
            </EuiTitle>
            <EuiSpacer size='xs' />
            {reading.leidas.length > 0 ? (
              reading.leidas.map(({ linea: line, motivo: motive }, index) => (
                <MotiveView key={`${index}`} parsed={motive} label={line.etiqueta} handlers={handlers} />
              ))
            ) : (
              <EuiText size='s'>
                <p>{item.finding}</p>
              </EuiText>
            )}

            {hidden > 0 && (
              <EuiText size='xs' color='subdued'>
                <p>
                  y {hidden} motivo{hidden === 1 ? '' : 's'} más · seleccione un agente para verlos todos
                </p>
              </EuiText>
            )}

            <EuiSpacer size='m' />

            <EuiTitle size='xxs'>
              <h3>Ficha ENS</h3>
            </EuiTitle>
            <EuiText size='s'>
              <p>
                <strong>Control:</strong> {controlId}
              </p>
              <p>
                <strong>Requisito:</strong> {item.requirement}
              </p>
              <p>
                <strong>Evidencias:</strong> {involvedEvidences.join(', ') || '—'}
              </p>
              {scopeText && (
                <p>
                  <strong>{scopeLabel}:</strong> {scopeText}
                </p>
              )}
              <p>
                <strong>Impacto ENS:</strong> {item.impact}
              </p>
              <p>
                <strong>Acción requerida:</strong> {action}
              </p>
              {action !== item.requiredAction && (
                <p style={{ color: ENS_THEME.subduedText }}>
                  <small>Del motor: {item.requiredAction}</small>
                </p>
              )}
            </EuiText>
            {parameters.length > 0 && (
              <>
                <EuiSpacer size='s' />
                <ParameterBadges ids={parameters} handlers={handlers} />
              </>
            )}

            {reading.pregunta && (
              <>
                <EuiSpacer size='m' />
                <EuiText size='s' color='subdued'>
                  <p style={{ fontStyle: 'italic' }}>{reading.pregunta.texto}</p>
                </EuiText>
              </>
            )}

            <EuiSpacer size='m' />

            <EuiLink href='https://gobernanza.ccn-cert.cni.es/ens-navegable' target='_blank' external>
              Ver control en ENS navegable (CCN-CERT)
            </EuiLink>
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
};
