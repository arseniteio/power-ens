// La celda de «Motivo», plegada.
//
// POR QUÉ. El motivo de una evidencia puede ser una línea o puede ser esto,
// literal, de op.acc.4 en wazuh-real:
//
//   «Se ha observado que 'dioni' tiene acceso='ALL=(ALL) NOPASSWD:ALL' y la
//   tabla del parámetro P-01 declara 'ALL=(ALL:ALL) ALL'; 'root' tiene… y 197
//   desviación(es) más.»
//
// Ocho filas así convierten la tabla en un muro. El usuario lo dijo el 06/08 —
// «es un lío que flipas, muchísimo texto»— y seguía igual.
//
// No se recorta el contenido: se PLIEGA. La primera línea es la que decide, y
// el resto está a un clic. Recortar de verdad sería esconder evidencia; plegar
// es no obligar a leerla toda para ver de qué va.
//
// Y la «Pregunta de auditoría» sale del cuerpo. Es la misma frase en todas las
// filas de la misma evidencia y no cambia nunca: repetida ocho veces es ruido,
// y al pie en gris sigue estando donde el auditor la busca.
import React, { useState } from 'react';
import { EuiBadge, EuiLink, EuiText } from '@elastic/eui';

const PREFIJO_PREGUNTA = 'Pregunta de auditoría:';

// Cuánto se enseña antes de plegar. No es un número redondo por capricho: es lo
// que cabe en dos líneas de la columna sin que la fila crezca.
const LIMITE = 190;

export interface MotivoLinea {
  texto: string;
  etiqueta?: string;
}

interface MotiveCellProps {
  lineas: MotivoLinea[];
  ocultos?: number;
}

export const MotiveCell = ({
  lineas,
  ocultos = 0,
}: MotiveCellProps) => {
  const [abierto, setAbierto] = useState(false);

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

  const largo = cuerpo.reduce(
    (total, linea) => total + linea.texto.length,
    0
  );

  const seDebePlegar = !abierto && (largo > LIMITE || cuerpo.length > 2);

  const visibles = seDebePlegar ? cuerpo.slice(0, 1) : cuerpo;

  return (
    <EuiText size='xs'>
      {visibles.map((linea, indice) => (
        <p key={`${linea.texto}-${indice}`} style={{ marginBottom: 6 }}>
          {linea.etiqueta && (
            <>
              <EuiBadge color='hollow'>{linea.etiqueta}</EuiBadge>{' '}
            </>
          )}
          {seDebePlegar && linea.texto.length > LIMITE
            ? `${linea.texto.slice(0, LIMITE).trimEnd()}…`
            : linea.texto}
        </p>
      ))}

      {(seDebePlegar || abierto) && (
        <p style={{ marginBottom: 6 }}>
          <EuiLink onClick={() => setAbierto(!abierto)}>
            {abierto
              ? 'Ver menos'
              : `Ver el motivo completo${
                  cuerpo.length > 1 ? ` (${cuerpo.length} líneas)` : ''
                }`}
          </EuiLink>
        </p>
      )}

      {/* Lo que no cabe se anuncia, nunca se calla: agregar no es esconder. */}
      {ocultos > 0 && (
        <p style={{ color: '#69707D', marginBottom: 6 }}>
          y {ocultos} motivo{ocultos === 1 ? '' : 's'} más · seleccione un
          agente para verlos todos
        </p>
      )}

      {pregunta && (
        <p
          style={{
            color: '#98A2B3',
            fontStyle: 'italic',
            marginBottom: 0,
          }}
        >
          {pregunta.texto}
        </p>
      )}
    </EuiText>
  );
};
