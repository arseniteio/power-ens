// La línea de cumplimiento diario de UN control.
//
// El panel tiene la suya desde el 05/08, pero promedia TODOS los controles: en
// la pantalla de detalle no dice nada sobre el que se está mirando. Esta mide
// uno solo, así que su último punto es exactamente el porcentaje grande que se
// lee arriba, y eso es lo que la hace comprobable: si no coinciden, uno de los
// dos miente y se ve.
//
// LO QUE HACE DISTINTO AL DEL PANEL: un día en que el control salió NO_APLICA
// no se dibuja. No es un cero. Pintarlo abajo diría que la máquina incumplía
// justo cuando el control ni siquiera regía —en un cliente de nivel BAJO, los
// refuerzos R1 y R2 estarían todo el histórico tocando el suelo—. La línea se
// parte y se dice cuántos días quedaron fuera.
import React from 'react';
import type { ENSControlTimelinePoint } from '../../core/timeline/control-timeline-points';

interface ControlEvolutionChartProps {
  points: ENSControlTimelinePoint[];
  controlId: string;
}

const ALTO = 200;
const ANCHO = 600;

const coordenadaY = (score: number): number =>
  ALTO - Math.max(0, Math.min(score, 100)) * 2;

const coordenadaX = (
  indice: number,
  total: number
): number => (total === 1 ? ANCHO / 2 : (indice * ANCHO) / (total - 1));

// El color dice el estado sin tener que leer el número.
const colorDe = (status: string): string => {
  if (status === 'CUMPLE') {
    return '#00A69B';
  }

  if (status === 'PARCIAL') {
    return '#F5A700';
  }

  if (status === 'NO_CUMPLE') {
    return '#BD271E';
  }

  return '#98A2B3';
};

export const ControlEvolutionChart = ({
  points,
  controlId,
}: ControlEvolutionChartProps) => {
  // Los días con número. Se conserva el índice ORIGINAL para que el eje no se
  // comprima al saltarse los NO_APLICA: la distancia entre dos puntos tiene que
  // seguir siendo el tiempo que pasó entre ellos.
  const conNumero = points
    .map((point, indice) => ({ point, indice }))
    .filter(item => typeof item.point.score === 'number');

  const sinNumero = points.length - conNumero.length;

  if (!conNumero.length) {
    return (
      <div
        style={{
          padding: 14,
          color: '#69707D',
          background: '#FAFBFC',
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        Todavía no hay ningún día con cumplimiento medido para {controlId}. La
        línea aparece en cuanto el motor pueda evaluar el control al menos un
        día de la ventana.
      </div>
    );
  }

  const puntos = conNumero.map(({ point, indice }) => ({
    ...point,
    x: coordenadaX(indice, points.length),
    y: coordenadaY(point.score as number),
  }));

  const ultimo = puntos[puntos.length - 1];

  return (
    <div>
      <div
        style={{
          position: 'relative',
          height: 250,
          padding: '8px 14px 46px 60px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 8,
            top: 8,
            bottom: 32,
            width: 40,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            color: '#69707D',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>

        <svg
          width='100%'
          height='215'
          viewBox='0 0 600 215'
          preserveAspectRatio='none'
          style={{
            overflow: 'visible',
            borderLeft: '1px solid #B9C3D0',
            borderBottom: '1px solid #B9C3D0',
          }}
        >
          {[0, 25, 50, 75, 100].map(valor => (
            <line
              key={valor}
              x1='0'
              y1={coordenadaY(valor)}
              x2={ANCHO}
              y2={coordenadaY(valor)}
              stroke='#D3DAE6'
              strokeDasharray={valor === 0 ? '0' : '6 6'}
              strokeWidth='1'
            />
          ))}

          <polyline
            fill='none'
            stroke='#006BB4'
            strokeWidth='2.5'
            strokeLinecap='round'
            strokeLinejoin='round'
            points={puntos
              .map(punto => `${punto.x},${punto.y}`)
              .join(' ')}
          />

          {puntos.map((punto, indice) => (
            <g key={`${punto.label}-${indice}`}>
              <circle
                cx={punto.x}
                cy={punto.y}
                r={punto.isCurrent ? '7' : '5'}
                fill={
                  punto.isCurrent
                    ? '#FFFFFF'
                    : colorDe(punto.status)
                }
                stroke={colorDe(punto.status)}
                strokeWidth={punto.isCurrent ? '3.5' : '2'}
              />

              {/* Solo se etiqueta el primero, el último y los extremos: con
                  treinta días, un número sobre cada punto es ilegible. */}
              {(indice === 0 ||
                indice === puntos.length - 1 ||
                punto.isCurrent) && (
                <text
                  x={punto.x}
                  y={punto.y - 12}
                  textAnchor='middle'
                  fontSize='13'
                  fontWeight='700'
                  fill={colorDe(punto.status)}
                >
                  {punto.score}%
                </text>
              )}

              <text
                x={punto.x}
                y='212'
                textAnchor='middle'
                fontSize='11'
                fontWeight='600'
                fill='#69707D'
              >
                {punto.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#69707D',
          lineHeight: 1.5,
        }}
      >
        Cada punto es una evaluación completa del motor sobre los hechos
        conocidos ese día, con los parámetros que hay declarados hoy. El último
        —el marcado en blanco— es el mismo número que el porcentaje de arriba:
        si no coinciden, uno de los dos está mal.
        {ultimo && ultimo.events > 0 ? (
          <>
            {' '}
            Hoy se han evaluado {ultimo.events} evento(s).
          </>
        ) : null}
        {sinNumero > 0 ? (
          <>
            {' '}
            {sinNumero} día(s) no se dibujan porque el control no aplicaba al
            nivel ENS activo: no son un cero.
          </>
        ) : null}
      </div>
    </div>
  );
};
