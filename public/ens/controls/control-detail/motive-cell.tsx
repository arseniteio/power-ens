// La celda de «Motivo»: una línea en la tabla, el texto entero en un panel.
//
// POR QUÉ. El motivo de una evidencia puede ser una línea o puede ser esto,
// literal, de op.acc.4 en wazuh-real:
//
//   «Se ha observado que 'dioni' tiene acceso='ALL=(ALL) NOPASSWD:ALL' y la
//   tabla del parámetro P-01 declara 'ALL=(ALL:ALL) ALL'; 'root' tiene… y 197
//   desviación(es) más.»
//
// Antes eso se desplegaba DENTRO de la celda. Doscientas palabras metidas en
// una columna estrecha salen apelmazadas, la fila crece hasta empujar al resto
// fuera de pantalla y leerlo es peor que no verlo. Ahora la celda enseña la
// primera línea y el resto se abre en un panel lateral, donde el texto tiene
// ancho de sobra y se puede leer como lo que es: una frase.
//
// No se recorta el contenido, se aparta. Recortar sería esconder evidencia.
//
// Y la «Pregunta de auditoría» sale del cuerpo: es la misma frase en todas las
// filas de la misma evidencia, así que repetida es ruido. Va al pie, en gris,
// que es donde el auditor la busca.
import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

const PREFIJO_PREGUNTA = 'Pregunta de auditoría:';

// Lo que cabe en dos líneas de la columna sin que la fila crezca.
const LIMITE = 190;

export interface MotivoLinea {
  texto: string;
  etiqueta?: string;
}

interface MotiveCellProps {
  lineas: MotivoLinea[];
  ocultos?: number;
  // Encabeza el panel. Sin él, el lector no sabe de qué evidencia es el
  // motivo que está leyendo, que es justo lo que el panel viene a resolver.
  titulo?: string;
}

export const MotiveCell = ({
  lineas,
  ocultos = 0,
  titulo = 'Motivo completo',
}: MotiveCellProps) => {
  const [panelAbierto, setPanelAbierto] = useState(false);

  const pregunta = lineas.find(linea =>
    linea.texto.startsWith(PREFIJO_PREGUNTA)
  );

  const cuerpo = lineas.filter(
    linea => !linea.texto.startsWith(PREFIJO_PREGUNTA)
  );

  if (!cuerpo.length && !pregunta) {
    return (
      <EuiText size='xs' color='subdued'>
        Sin motivo registrado
      </EuiText>
    );
  }

  const largo = cuerpo.reduce((total, linea) => total + linea.texto.length, 0);
  const hayMas = largo > LIMITE || cuerpo.length > 1;

  const primera = cuerpo[0];

  return (
    <>
      <EuiText size='xs'>
        {primera && (
          <p style={{ marginBottom: hayMas ? 2 : 6 }}>
            {primera.etiqueta && (
              <>
                <EuiBadge color='hollow'>{primera.etiqueta}</EuiBadge>{' '}
              </>
            )}
            {primera.texto.length > LIMITE
              ? `${primera.texto.slice(0, LIMITE).trimEnd()}…`
              : primera.texto}
          </p>
        )}

        {hayMas && (
          <EuiButtonEmpty
            size='xs'
            flush='left'
            iconType='inspect'
            onClick={() => setPanelAbierto(true)}
          >
            {cuerpo.length > 1
              ? `Ver motivo completo (${cuerpo.length} líneas)`
              : 'Ver motivo completo'}
          </EuiButtonEmpty>
        )}

        {/* Lo que no cabe se anuncia, nunca se calla: agregar no es esconder. */}
        {ocultos > 0 && (
          <p style={{ color: '#69707D', marginBottom: 6 }}>
            y {ocultos} motivo{ocultos === 1 ? '' : 's'} más · seleccione un
            agente para verlos todos
          </p>
        )}

        {pregunta && (
          <p style={{ color: '#98A2B3', fontStyle: 'italic', marginBottom: 0 }}>
            {pregunta.texto}
          </p>
        )}
      </EuiText>

      {panelAbierto && (
        <EuiFlyout
          onClose={() => setPanelAbierto(false)}
          size='m'
          ownFocus
          aria-labelledby='motivo-panel-titulo'
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size='s'>
              <h2 id='motivo-panel-titulo'>{titulo}</h2>
            </EuiTitle>
          </EuiFlyoutHeader>

          <EuiFlyoutBody>
            <EuiText size='s'>
              {cuerpo.map((linea, indice) => (
                <p key={`${linea.texto}-${indice}`}>
                  {linea.etiqueta && (
                    <>
                      <EuiBadge color='hollow'>{linea.etiqueta}</EuiBadge>{' '}
                    </>
                  )}
                  {linea.texto}
                </p>
              ))}
            </EuiText>

            {pregunta && (
              <>
                <EuiSpacer size='m' />
                <EuiText size='s' color='subdued'>
                  <p style={{ fontStyle: 'italic' }}>{pregunta.texto}</p>
                </EuiText>
              </>
            )}
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
};
