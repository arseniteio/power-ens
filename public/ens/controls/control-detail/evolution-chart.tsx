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
import type { ENSControlTimelinePoint } from '../../../../common/ens/core/timeline/control-timeline-points';

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

      {/* Solo se escribe lo que el gráfico no puede decir por sí mismo: que la
          serie es demasiado corta, y que un hueco no es un cero. Explicar aquí
          cómo funciona el motor sobraba. */}
      {(serieCorta || sinNumero > 0) && (
        <div
          style={{
            fontSize: 12,
            color: '#69707D',
            lineHeight: 1.5,
          }}
        >
          {serieCorta ? (
            <strong>{puntos.length} día(s) medido(s): aún no hay tendencia.</strong>
          ) : null}
          {serieCorta && sinNumero > 0 ? ' ' : null}
          {sinNumero > 0 ? (
            <>
              {sinNumero} día(s) sin dibujar: el control no aplicaba al nivel ENS
              de esa fecha. No son un cero.
            </>
          ) : null}
        </div>
      )}
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

  // CON DOS PUNTOS UNA LÍNEA NO DICE NADA, y con uno menos. Es lo que hay al
  // día siguiente de desplegar, y va a ser lo normal durante la primera semana
  // de cualquier cliente. Se dibuja igual —el histórico empieza el día que
  // empieza— pero se avisa, para que nadie lea una tendencia donde solo hay
  // dos medidas.
  const serieCorta = puntos.length < 4;

  // UNA CURVA, NO UNA POLILÍNEA QUEBRADA.
  //
  // Se traza con curvas de Bézier cuyos puntos de control están a media
  // distancia horizontal entre dos días, lo que da una curva suave que NUNCA se
  // sale del rango de los valores que une: un tramo entre 50 % y 75 % no puede
  // dibujar un pico en 80 % que nadie midió. Con `curveMonotone` o similares
  // habría que vigilarlo; con puntos de control horizontales es imposible por
  // construcción, y en un gráfico de cumplimiento eso importa más que la
  // elegancia de la curva.
  const trazo = puntos.length
    ? puntos
        .map((punto, indice) => {
          if (indice === 0) {
            return `M ${punto.x},${punto.y}`;
          }

          const previo = puntos[indice - 1];
          const medio = (previo.x + punto.x) / 2;

          return `C ${medio},${previo.y} ${medio},${punto.y} ${punto.x},${punto.y}`;
        })
        .join(' ')
    : '';

  // El relleno bajo la curva: el mismo trazo, cerrado contra el eje.
  const relleno =
    puntos.length > 1
      ? `${trazo} L ${puntos[puntos.length - 1].x},${ALTO} L ${puntos[0].x},${ALTO} Z`
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        {/* El eje, fuera del área de dibujo: así el área mide exactamente lo
            que ocupa la curva y un punto al 50 % cae en el 50 % de verdad. */}
        <div
          style={{
            height: 190,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            color: '#98A2B3',
            fontSize: 11,
            fontWeight: 600,
            paddingTop: 1,
          }}
        >
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>

        {/* ESTE div ES el área del gráfico: 100 % de ancho y 190 px de alto. Los
            puntos se posicionan dentro con `left`/`top` en porcentaje puro, que
            es lo único que cuadra sin hacer cuentas con el padding. */}
        <div
          style={{
            position: 'relative',
            flex: 1,
            height: 190,
            marginBottom: 34,
          }}
        >

        {/* EL SVG SOLO DIBUJA LA CURVA Y LA REJILLA.
            
            Con `preserveAspectRatio='none'` el viewBox de 600 se estira hasta
            los ~1900 px del contenedor, y con él se estira TODO lo que haya
            dentro: el texto salía deformado 3x a lo ancho y los puntos eran
            elipses en vez de círculos. Un trazo y un relleno aguantan esa
            deformación —de hecho la necesitan para llenar el ancho—; el texto y
            los círculos no.
            
            Así que los puntos y las etiquetas se dibujan FUERA, en HTML
            posicionado por porcentaje. Se ven nítidos, redondos y del tamaño
            que se les pide, y siguen cuadrando con la curva porque usan la
            misma coordenada. */}
        <svg
          width='100%'
          height='190'
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio='none'
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id='ens-evolucion' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='#006BB4' stopOpacity='0.22' />
              <stop offset='100%' stopColor='#006BB4' stopOpacity='0.01' />
            </linearGradient>
          </defs>

          {[0, 25, 50, 75, 100].map(valor => (
            <line
              key={valor}
              x1='0'
              y1={coordenadaY(valor)}
              x2={ANCHO}
              y2={coordenadaY(valor)}
              stroke='#E3E8F0'
              strokeDasharray={valor === 0 ? '0' : '4 6'}
              strokeWidth='1'
              vectorEffect='non-scaling-stroke'
            />
          ))}

          {relleno && <path d={relleno} fill='url(#ens-evolucion)' />}

          <path
            d={trazo}
            fill='none'
            stroke='#006BB4'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            // Sin esto el trazo también se estiraría y saldría más grueso en
            // horizontal que en vertical.
            vectorEffect='non-scaling-stroke'
          />
        </svg>

        {/* Los puntos y sus etiquetas, en HTML: nítidos y sin deformar. */}
        {puntos.map((punto, indice) => {
          const izquierda = (punto.x / ANCHO) * 100;
          const arriba = (punto.y / ALTO) * 100;

          // Las etiquetas de los extremos se anclan hacia dentro para que no se
          // salgan del panel, que es lo que pasaba con el 75 % del primer y del
          // último día.
          const anclaje =
            izquierda < 6
              ? 'translate(0, -50%)'
              : izquierda > 94
              ? 'translate(-100%, -50%)'
              : 'translate(-50%, -50%)';

          return (
            <div key={`${punto.label}-${indice}`}>
              <div
                style={{
                  position: 'absolute',
                  left: `${izquierda}%`,
                  top: `${arriba}%`,
                  transform: 'translate(-50%, -50%)',
                  width: punto.isCurrent ? 13 : 9,
                  height: punto.isCurrent ? 13 : 9,
                  borderRadius: '50%',
                  background: colorDe(punto.status),
                  border: punto.isCurrent
                    ? '2.5px solid #1A1C21'
                    : '2px solid #FFFFFF',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
                  zIndex: 2,
                }}
              />

              {(puntos.length <= 10 ||
                indice === 0 ||
                indice === puntos.length - 1 ||
                punto.isCurrent) && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${izquierda}%`,
                    top: `${arriba}%`,
                    marginTop: -19,
                    transform: anclaje,
                    fontSize: 11,
                    fontWeight: 700,
                    color: colorDe(punto.status),
                    whiteSpace: 'nowrap',
                    zIndex: 2,
                  }}
                >
                  {punto.score}%
                </div>
              )}

              <div
                style={{
                  position: 'absolute',
                  left: `${izquierda}%`,
                  bottom: -20,
                  transform:
                    izquierda < 6
                      ? 'translateX(0)'
                      : izquierda > 94
                      ? 'translateX(-100%)'
                      : 'translateX(-50%)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#98A2B3',
                  whiteSpace: 'nowrap',
                }}
              >
                {punto.label}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <EtiquetaDeLectura
        puntos={puntos}
        sinNumero={sinNumero}
        serieCorta={serieCorta}
      />
    </div>
  );
};
