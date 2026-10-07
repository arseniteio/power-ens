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
import React, { useState } from 'react';
import {
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

export interface ClaseNoConformidad {
  color: string;
  badgeColor: string;
  icono: string;
  etiqueta: string;
  accion: string;
  responsable: string;
}

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
}

const PREFIJO_PREGUNTA = 'Pregunta de auditoría:';

// El titular. Se prefiere la primera línea del motivo —lo que de verdad se
// observó en la máquina— y solo si no la hay se cae al `finding` del motor,
// que es más genérico. La pregunta de auditoría nunca encabeza: es la misma
// frase en todas las tarjetas de la misma evidencia.
const titularDe = (lineas: MotivoLinea[], finding: string): string => {
  const util = lineas.find(
    linea => !linea.texto.startsWith(PREFIJO_PREGUNTA) && linea.texto.trim()
  );

  return util ? util.texto : finding;
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
}: NonConformityCardProps) => {
  const [panelAbierto, setPanelAbierto] = useState(false);

  const titular = titularDe(lineasMotivo, item.finding);

  const cuerpoMotivo = lineasMotivo.filter(
    linea => !linea.texto.startsWith(PREFIJO_PREGUNTA)
  );

  const pregunta = lineasMotivo.find(linea =>
    linea.texto.startsWith(PREFIJO_PREGUNTA)
  );

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
        <EuiFlexGroup
          gutterSize='xs'
          alignItems='center'
          wrap
          responsive={false}
        >
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

        {/* 1 · QUÉ FALLA */}
        <EuiText size='s'>
          <strong>{titular}</strong>
        </EuiText>

        <EuiSpacer size='xs' />

        {/* 2 · DÓNDE */}
        <EuiText size='xs' color='subdued'>
          {contexto.join(' · ')}
        </EuiText>

        {/* Los dos lados de la medida, cuando el motor los publica. «Se pedía
            X, hay Y» es la frase que un técnico necesita. */}
        {(item.expected || item.actual) && (
          <>
            <EuiSpacer size='s' />
            <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
              {item.expected && (
                <EuiFlexItem grow={false}>
                  <EuiText size='xs' color='subdued'>
                    Se pedía
                  </EuiText>
                  <EuiText size='xs'>
                    <strong>{item.expected}</strong>
                  </EuiText>
                </EuiFlexItem>
              )}
              {item.actual && (
                <EuiFlexItem grow={false}>
                  <EuiText size='xs' color='subdued'>
                    Hay
                  </EuiText>
                  <EuiText size='xs'>
                    <strong>{item.actual}</strong>
                  </EuiText>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </>
        )}

        <EuiSpacer size='m' />

        {/* 3 · QUÉ SE HACE, y quién. Corregir la máquina, declarar la decisión
            o habilitar la prueba no las hace la misma persona. */}
        <EuiFlexGroup
          gutterSize='xs'
          alignItems='center'
          justifyContent='spaceBetween'
          responsive={false}
          wrap
        >
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
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size='xs'
              flush='right'
              iconType='inspect'
              onClick={() => setPanelAbierto(true)}
            >
              Ver detalle
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      {panelAbierto && (
        <EuiFlyout
          onClose={() => setPanelAbierto(false)}
          size='m'
          ownFocus
          aria-labelledby='nc-panel-titulo'
        >
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
            <EuiText size='s'>
              {cuerpoMotivo.length > 0 ? (
                cuerpoMotivo.map((linea, indice) => (
                  <p key={`${linea.texto}-${indice}`}>
                    {linea.etiqueta && (
                      <>
                        <EuiBadge color='hollow'>{linea.etiqueta}</EuiBadge>{' '}
                      </>
                    )}
                    {linea.texto}
                  </p>
                ))
              ) : (
                <p>{item.finding}</p>
              )}
            </EuiText>

            {ocultos > 0 && (
              <EuiText size='xs' color='subdued'>
                <p>
                  y {ocultos} motivo{ocultos === 1 ? '' : 's'} más · seleccione
                  un agente para verlos todos
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
                <strong>Evidencias:</strong>{' '}
                {evidenciasImplicadas.join(', ') || '—'}
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
                <strong>Acción requerida:</strong> {item.requiredAction}
              </p>
              {item.parameterIds.length > 0 && (
                <p>
                  <strong>Parámetros:</strong> {item.parameterIds.join(', ')}
                </p>
              )}
            </EuiText>

            {pregunta && (
              <>
                <EuiSpacer size='m' />
                <EuiText size='s' color='subdued'>
                  <p style={{ fontStyle: 'italic' }}>{pregunta.texto}</p>
                </EuiText>
              </>
            )}

            <EuiSpacer size='m' />

            <EuiLink
              href='https://gobernanza.ccn-cert.cni.es/ens-navegable'
              target='_blank'
              external
            >
              Ver control en ENS navegable (CCN-CERT)
            </EuiLink>
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
};
