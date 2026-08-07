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

// La leyenda y el pie, compartidos por las dos formas del gráfico —barras
// cuando hay pocos días, línea cuando hay bastantes—. Va aparte para que no se
// dupliquen: dos copias del mismo texto acaban divergiendo, y el que se queda
// viejo es el que lee el auditor.
const EtiquetaDeLectura = ({
  puntos,
  sinNumero,
  serieCorta,
}: {
  puntos: { events: number; isCurrent: boolean }[];
  sinNumero: number;
  serieCorta: boolean;
}) => {
  const ultimo = puntos[puntos.length - 1];

  return (
    <>
      {/* La leyenda existe porque el color de un punto es el estado DE ESE DÍA,
          no el de hoy. Sin ella, un naranja en el histórico de un control que
          hoy está en verde se lee como una contradicción. */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'center',
          fontSize: 12,
          color: '#69707D',
          marginBottom: 6,
        }}
      >
        {[
          { estado: 'CUMPLE', texto: 'cumple' },
          { estado: 'PARCIAL', texto: 'parcial' },
          { estado: 'NO_CUMPLE', texto: 'no cumple' },
        ].map(item => (
          <span
            key={item.estado}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: colorDe(item.estado),
                display: 'inline-block',
              }}
            />
            {item.texto}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: '50%',
              border: '2px solid #1A1C21',
              display: 'inline-block',
            }}
          />
          hoy
        </span>
        <span>· el color es el estado de ESE día, no el de hoy</span>
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#69707D',
          lineHeight: 1.5,
        }}
      >
        {serieCorta ? (
          <>
            <strong>
              Solo hay {puntos.length} día(s) medido(s): todavía no hay
              tendencia que leer.
            </strong>{' '}
            La línea se irá llenando conforme el recolector siga reportando.{' '}
          </>
        ) : null}
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
    </>
  );
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

  // Los puntos se reparten por su POSICIÓN EN LA SERIE, no por su orden entre
  // los que tienen número: así la distancia entre dos puntos sigue siendo el
  // tiempo que pasó, y un hueco de tres días se ve como un hueco.
  const puntos = conNumero.map(({ point, indice }) => ({
    ...point,
    x: coordenadaX(indice, points.length),
    y: coordenadaY(point.score as number),
  }));

  const ultimo = puntos[puntos.length - 1];

  // CON DOS PUNTOS UNA LÍNEA NO DICE NADA, y con uno menos. Es lo que hay al
  // día siguiente de desplegar, y va a ser lo normal durante la primera semana
  // de cualquier cliente. Se dibuja igual —el histórico empieza el día que
  // empieza— pero se avisa, para que nadie lea una tendencia donde solo hay
  // dos medidas.
  const serieCorta = puntos.length < 4;

  // El relleno bajo la línea. Da volumen a lo que si no son dos puntos sueltos
  // sobre una rejilla vacía.
  const areaPoints = puntos.length > 1
    ? [
        ...puntos.map(punto => `${punto.x},${punto.y}`),
        `${puntos[puntos.length - 1].x},${ALTO}`,
        `${puntos[0].x},${ALTO}`,
      ].join(' ')
    : '';

  // CON POCOS DÍAS, BARRAS. Una línea necesita al menos tres o cuatro puntos
  // para decir algo; con dos es una raya diagonal sobre una rejilla vacía, y con
  // uno ni eso. Es lo normal la primera semana de cualquier despliegue, así que
  // no es un caso raro que se pueda ignorar: es lo que ve todo cliente nuevo.
  //
  // Las barras no fingen una tendencia que no existe. Cada una es un día y se
  // lee sola.
  if (puntos.length <= 3) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 18,
            height: 190,
            padding: '10px 0 0 10px',
            borderLeft: '1px solid #D3DAE6',
            borderBottom: '1px solid #D3DAE6',
          }}
        >
          {puntos.map((punto, indice) => (
            <div
              key={`${punto.label}-${indice}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                width: 86,
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: colorDe(punto.status),
                  marginBottom: 6,
                }}
              >
                {punto.score}%
              </div>

              <div
                style={{
                  width: '100%',
                  height: `${Math.max(2, (punto.score as number) * 1.35)}px`,
                  background: colorDe(punto.status),
                  borderRadius: '4px 4px 0 0',
                  opacity: punto.isCurrent ? 1 : 0.55,
                  border: punto.isCurrent
                    ? '2px solid #1A1C21'
                    : '2px solid transparent',
                }}
              />

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#69707D',
                  marginTop: 6,
                }}
              >
                {punto.label}
                {punto.isCurrent ? ' · hoy' : ''}
              </div>
            </div>
          ))}
        </div>

        <EtiquetaDeLectura
          puntos={puntos}
          sinNumero={sinNumero}
          serieCorta
        />
      </div>
    );
  }

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

          {areaPoints && (
            <polygon
              points={areaPoints}
              fill='rgba(0, 107, 180, 0.12)'
            />
          )}

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
              {/* EL PUNTO DE HOY LLEVA SU COLOR, no blanco. Antes se pintaba
                  hueco para distinguirlo, y en un control al 100 % el único
                  color que se veía era el naranja de un día pasado: parecía que
                  el control estaba en amarillo cuando estaba en verde. Se
                  distingue por el anillo blanco y el tamaño, no por perder el
                  color, que es el dato. */}
              {punto.isCurrent && (
                <circle
                  cx={punto.x}
                  cy={punto.y}
                  r='9'
                  fill='#FFFFFF'
                  stroke='#FFFFFF'
                  strokeWidth='3'
                />
              )}

              <circle
                cx={punto.x}
                cy={punto.y}
                r={punto.isCurrent ? '6.5' : '5'}
                fill={colorDe(punto.status)}
                stroke={punto.isCurrent ? '#1A1C21' : colorDe(punto.status)}
                strokeWidth={punto.isCurrent ? '2' : '2'}
              />

              {/* Con pocos puntos se etiquetan todos; con treinta, un número
                  sobre cada uno es ilegible y solo se marcan los extremos. */}
              {(puntos.length <= 8 ||
                indice === 0 ||
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

      <EtiquetaDeLectura
        puntos={puntos}
        sinNumero={sinNumero}
        serieCorta={serieCorta}
      />
    </div>
  );
};
