// La tarjeta de una no conformidad.
//
// POR QUÉ SE REHIZO. Cabía en una pantalla, pero no se entendía: siete bloques
// etiquetados uno debajo de otro —cabecera con tres insignias y un icono de
// ficha, Requisito, Evidencias, Motivo, Esperado/Observado, Alcance, Acción,
// Parámetros—, cada uno con su rótulo en gris. Ocho tarjetas así son un muro,
// y para saber qué falla había que leerlas enteras.
//
// Ahora la tarjeta contesta tres preguntas en tres líneas, en este orden:
//
//   1. QUÉ FALLA      el hallazgo, como titular
//   2. DÓNDE          requisito · evidencias · máquinas, en una sola línea
//   3. QUÉ SE HACE    la acción, con su responsable
//
// Todo lo demás —el motivo entero, el impacto ENS, los parámetros, el enlace
// al ENS navegable— vive en un panel lateral detrás de «Ver detalle». No se
// pierde nada: se deja de exigir leerlo para entender la tarjeta.
//
// DESDE 1.2.0 EL MOTIVO SE LEE POR PARTES (`motive-parser.ts`). Antes el
// titular era la primera línea del motivo ENTERA y en negrita: hasta 1.332
// caracteres que empezaban por la plantilla «Resuelta por la política…» y, a
// menudo, por el segmento de una evidencia que no era la culpable. Ahora:
// titular = la primera frase de la parte CULPABLE (la evidencia de esta no
// conformidad que no cumple), en peso normal, con su insignia de evidencia y de
// estado; debajo, el resto en texto normal, las listas como listas, los
// parámetros como insignias que llevan a Configuración y lo de «Además» aparte;
// las demás evidencias del requisito, con su estado, y las conformes plegadas.
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

import { MotivoLinea } from './motive-cell';
import type { ClaseNoConformidad } from './nonconformity-class';
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
import { MotiveText, MotiveView, MotiveViewHandlers, ParameterBadges, statusBadgeColor } from './motive-view';
import { ENS_THEME } from '../../theme-colors';

export type { ClaseNoConformidad } from './nonconformity-class';

export interface NoConformidadItem {
  id: string;
  requirement: string;
  // Distingue el incumplimiento medido del hueco de prueba, y es lo que da el
  // fondo de la tarjeta. Atarlo a `status` sería atarlo a una constante:
  // todas las que se pintan están ABIERTAS.
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
  item: NoConformidadItem;
  clase: ClaseNoConformidad;
  criticidad?: string;
  etiquetaAlcance: string;
  textoAlcance: string;
  lineasMotivo: MotivoLinea[];
  evidenciasImplicadas: string[];
  controlId: string;
  ocultos?: number;
  // Las partes que publicaron las policies (`reasonParts`), si las hay.
  conocidos?: KnownReasonParts[];
  handlers?: MotiveViewHandlers;
}

const PREFIJO_PREGUNTA = 'Pregunta de auditoría:';

interface LineaLeida {
  linea: MotivoLinea;
  motivo: ParsedMotive;
}

// El motivo de la tarjeta, leído: las líneas (sin la pregunta y sin repetir la
// misma medida dos veces, p. ej. la observación de la evidencia y el hallazgo
// del motor), cuál se lee primero y su parte culpable.
export const readCardMotive = (
  lineas: MotivoLinea[],
  evidenceIds: string[],
  finding: string,
  conocidos: KnownReasonParts[] = []
) => {
  // El hallazgo del motor de una medida es el mismo motivo sin prefijos: si ya
  // está en alguna observación, no se repite.
  const vistos = new Set<string>();
  const cuerpos = new Set<string>();
  const leidas: LineaLeida[] = lineas
    .filter(linea => linea.texto.trim() && !linea.texto.startsWith(PREFIJO_PREGUNTA))
    .map(linea => ({ linea, motivo: parseMotive(linea.texto, conocidos) }))
    .filter(({ linea, motivo }) => {
      const cuerpo = motivo.parts.map(partToText).join(' | ');
      const clave = `${motivo.machines || ''}|${cuerpo}`;
      if (vistos.has(clave) || (linea.etiqueta === 'Motor' && cuerpos.has(cuerpo))) return false;
      vistos.add(clave);
      cuerpos.add(cuerpo);
      return true;
    });
  const noConforma = (p: MotivePart) => p.status && p.status !== 'CUMPLE' && p.status !== 'NO_APLICA';
  const principal =
    leidas.find(l => l.motivo.parts.some(p => p.evidenceId && evidenceIds.includes(p.evidenceId) && noConforma(p))) || leidas[0];
  const culpable = principal ? guiltyPart(principal.motivo.parts, evidenceIds) : undefined;
  const otras = principal ? principal.motivo.parts.filter(p => p !== culpable) : [];
  return {
    leidas,
    principal,
    culpable,
    titular: culpable?.summary || finding,
    otrasNoConformes: otras.filter(p => noConforma(p)),
    conformes: otras.filter(p => p.status === 'CUMPLE' || p.status === 'NO_APLICA'),
    pregunta: lineas.find(linea => linea.texto.startsWith(PREFIJO_PREGUNTA)),
  };
};

// CÓMO SE REPARTE LA PARTE CULPABLE EN LA TARJETA (sin React, lo prueba
// `tests/nonconformity-card.test.ts`): el titular (su primera frase), lo que
// queda de esa frase si se corta y el resto de la parte. Tres reglas:
//   - Una lista sale UNA vez, como lista, y siempre DESPUÉS de la frase que
//     la presenta: si está en la primera frase, el titular acaba justo antes
//     de ella («…en ejecución:») y la lista abre la causa; si está en el
//     resto, va dentro de ese texto, en su sitio.
//   - Un titular largo se corta en un espacio antes de `TITULAR_MAX`
//     caracteres, con «…», y lo que no cabe abre la causa con «…»: nada queda
//     solo en el `title` ni se recorta con CSS (en una tarjeta estrecha, dos
//     líneas cortaban el titular por la mitad).
//   - Una frase que empieza casi con la lista (menos de `INTRO_MIN`
//     caracteres delante) no se parte ahí: la lista se queda en su texto.
export const TITULAR_MAX = 200;
const INTRO_MIN = 15;

export interface CardTextBlock {
  text: string;
  list?: MotiveList;
}

export interface CardPartLayout {
  headline: string;
  // El titular se cortó en un espacio (y no justo antes de su lista).
  cutAtWord: boolean;
  // Lo que queda de la primera frase tras el corte (con su lista).
  rest?: CardTextBlock;
  // El resto de la parte (con su lista, si la tiene ahí).
  detail?: CardTextBlock;
}

const desplaza = (list: MotiveList, desde: number): MotiveList => ({ ...list, start: list.start - desde, end: list.end - desde });
const saltaEspacios = (texto: string, i: number) => {
  while (i < texto.length && /\s/.test(texto[i])) i += 1;
  return i;
};

export const layoutGuiltyPart = (part: Pick<MotivePart, 'text' | 'summary' | 'list'>, max: number = TITULAR_MAX): CardPartLayout => {
  const frase = part.summary;
  const texto = part.text;
  const lista = part.list;
  const listaEnFrase = Boolean(lista && lista.start < frase.length);
  // Dónde acaba la primera frase (o su lista, si se alarga más allá).
  const finFrase = listaEnFrase ? Math.max(frase.length, lista!.end) : frase.length;
  let corte = frase.length;
  let cutAtWord = false;
  if (listaEnFrase && lista!.start >= INTRO_MIN) corte = lista!.start;
  if (corte > max) {
    const espacio = frase.lastIndexOf(' ', max);
    corte = espacio > max / 2 ? espacio : max;
    cutAtWord = true;
  }
  const cortada = corte < frase.length;
  const headline = !cortada ? frase : cutAtWord ? `${frase.slice(0, corte).trimEnd()}…` : frase.slice(0, corte).trimEnd();
  let rest: CardTextBlock | undefined;
  if (cortada) {
    const desde = saltaEspacios(texto, corte);
    rest = { text: texto.slice(desde, finFrase), ...(listaEnFrase && lista!.start >= desde ? { list: desplaza(lista!, desde) } : {}) };
  }
  const desdeDetalle = saltaEspacios(texto, finFrase);
  const resto = texto.slice(desdeDetalle);
  const detail = resto
    ? { text: resto, ...(lista && !listaEnFrase && lista.start >= desdeDetalle ? { list: desplaza(lista, desdeDetalle) } : {}) }
    : undefined;
  return { headline, cutAtWord, ...(rest ? { rest } : {}), ...(detail ? { detail } : {}) };
};

export const NonConformityCard = ({
  item,
  clase,
  criticidad,
  etiquetaAlcance,
  textoAlcance,
  lineasMotivo,
  evidenciasImplicadas,
  controlId,
  ocultos = 0,
  conocidos = [],
  handlers = {},
}: NonConformityCardProps) => {
  const [panelAbierto, setPanelAbierto] = useState(false);

  const leido = readCardMotive(lineasMotivo, item.evidenceIds || evidenciasImplicadas, item.finding, conocidos);
  const { culpable } = leido;
  const reparto: CardPartLayout = culpable ? layoutGuiltyPart(culpable) : layoutGuiltyPart({ text: leido.titular, summary: leido.titular });
  const titular = reparto.headline;

  // Los parámetros: los que cita el motivo y los que la no conformidad nombra.
  const parametros = [
    ...(culpable?.parameters || []),
    ...item.parameterIds.map(id => ({ id })),
  ].filter((p, i, todos) => todos.findIndex(q => q.id === p.id) === i);

  const pedidoGenerico = isGenericExpectation(item.expected, item.actual);
  const accion = describeAction(item.requiredAction, culpable);

  // La línea de contexto: dónde vive el hallazgo. Un solo renglón con
  // separadores, en vez de tres bloques rotulados.
  const contexto = [
    item.requirement,
    evidenciasImplicadas.length > 0 ? evidenciasImplicadas.join(', ') : '',
    textoAlcance ? `${etiquetaAlcance.toLowerCase()} ${textoAlcance}` : '',
  ].filter(Boolean);

  return (
    <>
      {/* LA FRANJA ES LA SEVERIDAD, y es lo único que hay que mirar para
          separar un incumplimiento medido de una falta de prueba. */}
      <EuiPanel
        paddingSize='m'
        color={item.origin === 'MEDIDA' ? 'plain' : 'subdued'}
        style={{ borderLeft: `4px solid ${clase.color}`, height: '100%' }}
      >
        <EuiFlexGroup gutterSize='xs' alignItems='center' wrap responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge color={clase.badgeColor} iconType={clase.icono}>
              {clase.etiqueta}
            </EuiBadge>
          </EuiFlexItem>
          {criticidad && (
            <EuiFlexItem grow={false}>
              <EuiBadge color='hollow'>Criticidad {criticidad}</EuiBadge>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              {item.id}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size='s' />

        {/* 1 · QUÉ FALLA: la evidencia culpable, su estado y su primera frase,
            en peso normal y en dos líneas como mucho. */}
        <EuiText size='s'>
          <p style={{ marginBottom: 0 }}>
            {culpable?.evidenceId && (
              <>
                <EuiBadge
                  color='hollow'
                  onClick={handlers.onEvidence ? () => handlers.onEvidence!(culpable.evidenceId!) : undefined}
                  onClickAriaLabel={`Ver ${culpable.evidenceId} en Evidencias`}
                >
                  <strong>{culpable.evidenceId}</strong>
                </EuiBadge>{' '}
                <EuiBadge color={statusBadgeColor(culpable.status)}>{culpable.status}</EuiBadge>{' '}
              </>
            )}
          </p>
          <p title={leido.titular}>{titular}</p>
        </EuiText>

        <EuiSpacer size='xs' />

        {/* 2 · DÓNDE */}
        <EuiText size='xs' color='subdued'>
          {contexto.join(' · ')}
        </EuiText>

        {/* La causa: el resto de la parte culpable, en texto normal. */}
        {(reparto.rest || reparto.detail || culpable?.secondary !== undefined) && (
          <>
            <EuiSpacer size='s' />
            <EuiText size='xs'>
              {reparto.rest && (
                <div style={{ marginBottom: 6 }}>
                  {reparto.cutAtWord ? '…' : ''}
                  <MotiveText texto={reparto.rest.text} list={reparto.rest.list} />
                </div>
              )}
              {reparto.detail && (
                <div style={{ marginBottom: 6 }}>
                  <MotiveText texto={reparto.detail.text} list={reparto.detail.list} />
                </div>
              )}
              {culpable?.secondary !== undefined && (
                <p style={{ color: ENS_THEME.subduedText }}>
                  <strong>Además:</strong> <MotiveText texto={culpable.secondary} />
                </p>
              )}
            </EuiText>
          </>
        )}

        {/* Las otras evidencias del requisito que tampoco conforman, con su
            estado; las conformes, plegadas. */}
        {leido.otrasNoConformes.length > 0 && (
          <>
            <EuiSpacer size='s' />
            {leido.otrasNoConformes.map((parte, i) => (
              <EuiText size='xs' key={`${parte.evidenceId}-${i}`}>
                <p style={{ marginBottom: 2 }}>
                  <EuiBadge
                    color='hollow'
                    onClick={handlers.onEvidence && parte.evidenceId ? () => handlers.onEvidence!(parte.evidenceId!) : undefined}
                    onClickAriaLabel={`Ver ${parte.evidenceId} en Evidencias`}
                  >
                    {parte.evidenceId}
                  </EuiBadge>{' '}
                  <EuiBadge color={statusBadgeColor(parte.status)}>{parte.status}</EuiBadge>{' '}
                  <MotiveText texto={parte.summary} />
                </p>
              </EuiText>
            ))}
          </>
        )}
        {leido.conformes.length > 0 && (
          <EuiAccordion
            id={`nc-conformes-${item.id}`}
            buttonContent={`${leido.conformes.length} evidencia${leido.conformes.length === 1 ? '' : 's'} del requisito ${leido.conformes.length === 1 ? 'conforma' : 'conforman'}`}
            paddingSize='xs'
          >
            {leido.conformes.map((parte, i) => (
              <EuiText size='xs' key={`${parte.evidenceId}-${i}`} color='subdued'>
                <p style={{ marginBottom: 2 }}>
                  <EuiBadge color='hollow'>{parte.evidenceId}</EuiBadge>{' '}
                  <EuiBadge color={statusBadgeColor(parte.status)}>{parte.status}</EuiBadge>{' '}
                  <MotiveText texto={parte.summary} />
                </p>
              </EuiText>
            ))}
          </EuiAccordion>
        )}

        {/* Los parámetros, como insignias que llevan a Configuración (con el
            valor que aplica a esta máquina y su origen). */}
        {parametros.length > 0 && (
          <>
            <EuiSpacer size='s' />
            <ParameterBadges ids={parametros} handlers={handlers} />
          </>
        )}

        {/* Los dos lados de la medida, cuando dicen algo. El genérico
            «EV-01 CUMPLE y EV-03 CUMPLE» / «NO_CUMPLE» no: ya lo dicen las
            insignias de estado. */}
        {(item.expected || item.actual) && !pedidoGenerico && (
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

        {/* 3 · QUÉ SE HACE, y quién. Corregir la máquina, declarar la decisión
            o habilitar la prueba no las hace la misma persona. */}
        <EuiFlexGroup gutterSize='xs' alignItems='center' justifyContent='spaceBetween' responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize='xs' alignItems='center' responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiBadge color={clase.badgeColor}>{clase.accion}</EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size='xs' color='subdued'>
                  {clase.responsable}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            {/* La acción concreta, a la vista (no solo en un `title`). */}
            <EuiText size='xs'>
              <span>{accion}</span>
            </EuiText>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='xs' flush='right' iconType='inspect' onClick={() => setPanelAbierto(true)}>
              Ver detalle
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      {panelAbierto && (
        <EuiFlyout onClose={() => setPanelAbierto(false)} size='m' ownFocus aria-labelledby='nc-panel-titulo'>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size='s'>
              <h2 id='nc-panel-titulo'>{item.id}</h2>
            </EuiTitle>
            <EuiSpacer size='xs' />
            <EuiFlexGroup gutterSize='xs' responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiBadge color={clase.badgeColor} iconType={clase.icono}>
                  {clase.etiqueta}
                </EuiBadge>
              </EuiFlexItem>
              {criticidad && (
                <EuiFlexItem grow={false}>
                  <EuiBadge color='hollow'>Criticidad {criticidad}</EuiBadge>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlyoutHeader>

          <EuiFlyoutBody>
            <EuiTitle size='xxs'>
              <h3>Motivo</h3>
            </EuiTitle>
            <EuiSpacer size='xs' />
            {leido.leidas.length > 0 ? (
              leido.leidas.map(({ linea, motivo }, indice) => (
                <MotiveView key={`${indice}`} parsed={motivo} label={linea.etiqueta} handlers={handlers} />
              ))
            ) : (
              <EuiText size='s'>
                <p>{item.finding}</p>
              </EuiText>
            )}

            {ocultos > 0 && (
              <EuiText size='xs' color='subdued'>
                <p>
                  y {ocultos} motivo{ocultos === 1 ? '' : 's'} más · seleccione un agente para verlos todos
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
                <strong>Evidencias:</strong> {evidenciasImplicadas.join(', ') || '—'}
              </p>
              {textoAlcance && (
                <p>
                  <strong>{etiquetaAlcance}:</strong> {textoAlcance}
                </p>
              )}
              <p>
                <strong>Impacto ENS:</strong> {item.impact}
              </p>
              <p>
                <strong>Acción requerida:</strong> {accion}
              </p>
              {accion !== item.requiredAction && (
                <p style={{ color: ENS_THEME.subduedText }}>
                  <small>Del motor: {item.requiredAction}</small>
                </p>
              )}
            </EuiText>
            {parametros.length > 0 && (
              <>
                <EuiSpacer size='s' />
                <ParameterBadges ids={parametros} handlers={handlers} />
              </>
            )}

            {leido.pregunta && (
              <>
                <EuiSpacer size='m' />
                <EuiText size='s' color='subdued'>
                  <p style={{ fontStyle: 'italic' }}>{leido.pregunta.texto}</p>
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
