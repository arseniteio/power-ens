/**
 * La serie diaria del gráfico de evolución.
 *
 *     ~/.bun/bin/bun run tests/daily-evolution.test.ts
 *
 * Mismo montaje que sus hermanas (`evidence-judgment`, `measurement-gap`,
 * `aggregated-overview`): TypeScript suelto con su propio comprobador, sin
 * `package.json` ni `tsconfig`. Hace falta un runtime que ejecute TypeScript
 * resolviendo imports sin extensión (`bun`, probado con 1.3.14).
 *
 * POR QUÉ EXISTE ESTE FICHERO. Hasta el 05/08 el gráfico promediaba por SEMANA
 * los `score_snapshot` del agente, que son OTRO número: el agente puntúa sobre
 * su propio denominador y no lee los parámetros que el auditor declara en la
 * pantalla. El panel y la línea podían decir cosas distintas sin que nada lo
 * avisara, y con op.acc.2 en 0 % lo decían. Ahora la serie la calcula el mismo
 * motor que el panel, un punto por día, y lo único que cambia entre dos puntos
 * es el instante al que se evalúa.
 *
 * Se prueban las dos mitades por separado, porque solo una de ellas se puede
 * importar aquí:
 *
 *   - EL REPARTO POR DÍAS (`timeline-cuts.ts`), que es donde está la lógica que
 *     puede equivocarse. No importa el motor, y por eso se puede probar fuera
 *     del árbol del plugin de Wazuh.
 *   - QUE EL INSTANTE LLEGA DE VERDAD hasta donde se mide la antigüedad
 *     (`runPolicyRuntime`). Sin esto los cortes serían correctos y todos los
 *     puntos se juzgarían igual contra hoy, que es el defecto silencioso que
 *     esta serie viene a evitar.
 *
 * `compliance-timeline.ts` —la composición de las dos— no se puede importar:
 * arrastra el motor, y el motor arrastra `kibana-services`, que solo existe en
 * el árbol del plugin `main`. Es de tres líneas y no tiene lógica propia.
 *
 * Reglas de estas pruebas, las mismas de sus hermanas: cada caso mueve UN SOLO
 * eje respecto del anterior, y toda afirmación de «esto pasa» lleva al lado la
 * REVERSIÓN que demuestra que no pasaría siempre.
 */
import { opAcc1CatalogDefinition } from '../public/ens/catalog/op-acc-1';
import { mpInfo6CatalogDefinition } from '../public/ens/catalog/mp-info-6';
import { mpInfo6Configuration } from '../public/ens/configuration/data/mp-info-6-parameters';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../public/ens/core/policy-runtime/policy-runtime';
import {
  buildENSTimelineCuts,
  startOfDay,
} from '../public/ens/core/timeline/timeline-cuts';

// El repo no tiene @types/node y no va a tenerlos.
declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle: string = ''
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

// Las fechas se construyen en HORA LOCAL a propósito: el corte de un día es el
// final del día del operador, no el de UTC. Con `Z` la prueba pasaría o fallaría
// según el huso de la máquina que la ejecuta.
const enDia = (
  dia: number,
  hora: number = 9
): string =>
  new Date(2026, 7, dia, hora, 0, 0).toISOString();

let contador = 0;

const evento = (
  timestamp: string,
  extra: Partial<ENSNormalizedEvent> = {}
): ENSNormalizedEvent => ({
  id: `evt-${(contador += 1)}`,
  controlId: 'op.acc.1',
  eventType: 'account_active',
  sourceType: 'WAZUH_ALERT',
  timestamp,
  ...extra,
});

// 5 de agosto de 2026, mediodía.
const AHORA = new Date(2026, 7, 5, 12, 0, 0);

// --- 1. el reparto por días ------------------------------------------------

bloque('1. Un punto por día, y el último es el presente');

{
  const cortes = buildENSTimelineCuts(
    [
      evento(enDia(3)),
      evento(enDia(4)),
      evento(enDia(5)),
    ],
    { now: AHORA, days: 7 }
  );

  comprueba(
    'tres días con eventos producen tres puntos',
    cortes.length === 3,
    `${cortes.length}`
  );

  comprueba(
    'las etiquetas son dd/mm, no la semana',
    cortes.map(corte => corte.label).join(' ') ===
      '03/08 04/08 05/08',
    cortes.map(corte => corte.label).join(' ')
  );

  comprueba(
    'solo el último punto es el presente',
    cortes.filter(corte => corte.isCurrent).length === 1 &&
      cortes[2].isCurrent,
    cortes.map(corte => String(corte.isCurrent)).join(',')
  );

  // Lo que hace que el último punto SEA el número del panel: mismo instante y
  // mismos eventos que la evaluación de arriba, sin recortar nada.
  comprueba(
    'el punto del presente se evalúa AHORA, no al final del día',
    cortes[2].cutoff.getTime() === AHORA.getTime(),
    cortes[2].cutoff.toISOString()
  );

  comprueba(
    'y los puntos pasados, al final de SU día',
    cortes[0].cutoff.getHours() === 23 &&
      cortes[0].cutoff.getMinutes() === 59 &&
      cortes[0].cutoff.getDate() === 3,
    cortes[0].cutoff.toISOString()
  );
}

bloque('2. Los eventos de un punto son ACUMULADOS, no los del día suelto');

{
  const cortes = buildENSTimelineCuts(
    [
      evento(enDia(3)),
      evento(enDia(4)),
      evento(enDia(5)),
    ],
    { now: AHORA, days: 7 }
  );

  comprueba(
    'el primer día conoce 1 evento, el segundo 2 y el tercero 3',
    cortes.map(corte => corte.events.length).join(',') === '1,2,3',
    cortes.map(corte => corte.events.length).join(',')
  );

  // La reversión: si fueran los eventos DEL día, cada punto tendría 1. Un
  // recuento acumulado creciente es lo que distingue las dos lecturas.
  comprueba(
    'lo que descarta la lectura «solo los del día»: no es 1,1,1',
    cortes.map(corte => corte.events.length).join(',') !== '1,1,1'
  );

  comprueba(
    'y la evidencia del día 3 sigue estando en el punto del día 5',
    cortes[2].events.some(
      item => item.timestamp === enDia(3)
    )
  );
}

bloque('3. Un día sin eventos propios SÍ tiene punto, si ya hubo alguno antes');

{
  // El agente reporta el 3 y el 5, y calla el 4.
  const cortes = buildENSTimelineCuts(
    [evento(enDia(3)), evento(enDia(5))],
    { now: AHORA, days: 7 }
  );

  comprueba(
    'el día mudo no se salta: son tres puntos, no dos',
    cortes.length === 3,
    `${cortes.length}`
  );

  // Y es lo correcto: el motor juzgará ese día con la evidencia de anteayer, y
  // si la ventana del recolector ya venció, la puntuación baja. Ese bajón es
  // información real —«dejó de reportar»—, no un hueco del gráfico.
  comprueba(
    'y arrastra lo último que se sabía: 1 evento',
    cortes[1].events.length === 1,
    `${cortes[1].events.length}`
  );
}

bloque('4. Antes del primer evento NO hay punto');

{
  // Con cero eventos el motor devuelve los tres controles NO_EVALUABLE, que es
  // un 0 % legítimo como veredicto y una mentira como histórico: dibujaría a la
  // máquina incumpliendo antes de que nadie la mirase.
  const cortes = buildENSTimelineCuts(
    [evento(enDia(4)), evento(enDia(5))],
    { now: AHORA, days: 7 }
  );

  comprueba(
    'una ventana de 7 días con evidencia de 2 produce 2 puntos, no 7',
    cortes.length === 2,
    `${cortes.length}`
  );

  comprueba(
    'la serie empieza el día del primer evento',
    cortes[0].label === '04/08',
    cortes[0].label
  );

  // La reversión: con evidencia más antigua, la ventana SÍ se llena hasta su
  // tope. Sin esto, la prueba de arriba pasaría igual con un recorte ciego.
  const largos = buildENSTimelineCuts(
    [
      evento(enDia(1)),
      evento(enDia(2)),
      evento(enDia(3)),
      evento(enDia(4)),
      evento(enDia(5)),
    ],
    { now: AHORA, days: 7 }
  );

  comprueba(
    'y con evidencia desde el día 1, la serie llega hasta el día 1',
    largos.length === 5 && largos[0].label === '01/08',
    `${largos.length} puntos, empieza ${largos[0].label}`
  );

  // El tope de días recorta por el otro lado, que es lo que acota el coste:
  // cada punto es una pasada completa del motor.
  const recortados = buildENSTimelineCuts(
    [
      evento(enDia(1)),
      evento(enDia(2)),
      evento(enDia(3)),
      evento(enDia(4)),
      evento(enDia(5)),
    ],
    { now: AHORA, days: 3 }
  );

  comprueba(
    'con days=3 la serie se recorta a los 3 últimos días',
    recortados.length === 3 && recortados[0].label === '03/08',
    `${recortados.length} puntos, empieza ${recortados[0].label}`
  );
}

bloque('5. Sin eventos no hay serie, y el reloj desviado no la alarga');

{
  comprueba(
    'sin ningún evento, la serie está vacía (la tarjeta cae al valor de ahora)',
    buildENSTimelineCuts([], { now: AHORA }).length === 0
  );

  // Un agente con el reloj adelantado no puede crear días futuros en el eje.
  const conFuturo = buildENSTimelineCuts(
    [evento(enDia(5)), evento(enDia(9))],
    { now: AHORA, days: 7 }
  );

  comprueba(
    'un evento con fecha futura no añade puntos por delante de hoy',
    conFuturo.length === 1 &&
      startOfDay(conFuturo[0].day).getDate() === 5,
    `${conFuturo.length} puntos`
  );

  // Pero SÍ entra en el punto del presente: ahí el conjunto de eventos tiene
  // que ser exactamente el del panel, o los dos números dejarían de ser
  // comparables — que es el defecto que toda esta serie viene a corregir.
  comprueba(
    'y aun así el punto del presente ve los mismos eventos que el panel',
    conFuturo[0].events.length === 2,
    `${conFuturo[0].events.length}`
  );

  // La reversión: si solo hubiera eventos futuros, no habría nada que fechar.
  comprueba(
    'con SOLO eventos futuros no hay serie',
    buildENSTimelineCuts([evento(enDia(9))], { now: AHORA }).length === 0
  );
}

// --- 2. que el instante llega hasta donde se mide la antigüedad -------------

bloque('6. Cada punto mide la antigüedad contra SU día, no contra hoy');

{
  // La copia se hizo el día 3 a las 9:00, y no ha vuelto a salir bien. El
  // recolector de mp.info.6 lo informa en cada pasada: en la del día 3 a las
  // 9:05 y en la de hoy a las 11:00, las dos con la misma última copia
  // correcta. Evaluada al final del día 3 solo existe la primera.
  const copia = enDia(3);
  const pasada = (timestamp: string): ENSNormalizedEvent =>
    evento(timestamp, {
      controlId: 'mp.info.6',
      eventType: 'backup_run',
      evidenceId: 'EV-02',
      attributes: {
        origen: 'pbs',
        objeto: 'fichero',
        ultima_correcta: copia,
        ultima_fallida: '-',
        resultado_ultima: 'ok',
      },
    });

  const hechos = [
    pasada(new Date(2026, 7, 3, 9, 5, 0).toISOString()),
    pasada(new Date(2026, 7, 5, 11, 0, 0).toISOString()),
  ];

  const configuracion = {
    ...mpInfo6Configuration,
    parameters: mpInfo6Configuration.parameters.map(parametro =>
      parametro.id === 'P-01'
        ? { ...parametro, value: '24' }
        : parametro.id === 'P-04'
        ? { ...parametro, value: 'srv-01' }
        : parametro
    ),
  };

  // La medida de EV-02 (antigüedad de la última copia correcta) que deja la
  // policy de mp.info.6 en sus variables de ejecución.
  const medidaEn = (instante?: Date) => {
    const runtime = runPolicyRuntime(
      buildPolicyContext(
        mpInfo6CatalogDefinition,
        configuracion,
        'BAJO',
        hechos,
        [],
        instante
      )
    );

    const variable = runtime.runtimeVariables.find(
      item => item.name === 'medida_EV02'
    );

    return {
      estado: variable?.value,
      motivo: variable?.description || '',
    };
  };

  // Evaluada al final del día 3, la copia de esa mañana tiene ~15 h.
  const finDelDia3 = new Date(2026, 7, 3, 23, 59, 59, 999);

  const enSuDia = medidaEn(finDelDia3);

  comprueba(
    'evaluada en su propio día, la copia tiene menos de 24 h',
    enSuDia.estado === 'CUMPLE' && /hace 15\.0 h/.test(enSuDia.motivo),
    `${enSuDia.estado} ${enSuDia.motivo}`
  );

  // La reversión, que es todo el defecto en una línea: la MISMA copia medida
  // contra hoy tiene dos días. Si el instante no viajara hasta aquí, el punto
  // del día 3 se juzgaría con este número y la línea bajaría hacia el pasado
  // por el mero hecho de que el pasado es viejo.
  const hoy = medidaEn(AHORA);

  comprueba(
    'y la misma copia medida contra hoy pasa de 24 h',
    hoy.estado === 'NO_CUMPLE' && /hace 51\.0 h/.test(hoy.motivo),
    `${hoy.estado} ${hoy.motivo}`
  );

  comprueba(
    'que son medidas distintas: el instante llega de verdad al runtime',
    enSuDia.estado !== hoy.estado,
    `${enSuDia.estado} vs ${hoy.estado}`
  );

  // Y sin instante se comporta como siempre: contra el reloj real. Es lo que
  // garantiza que el panel no ha cambiado de comportamiento: hoy los dos
  // hechos son más viejos que la frescura de un estado, y la copia no puede
  // salir en verde.
  const porDefecto = medidaEn(undefined);

  comprueba(
    'sin instante, sigue midiendo contra el reloj real (el panel no cambia)',
    porDefecto.estado !== undefined && porDefecto.estado !== 'CUMPLE',
    `${porDefecto.estado} ${porDefecto.motivo}`
  );
}

bloque('7. La serie no depende de los score_snapshot del agente');

{
  // El defecto original: el gráfico leía `score_snapshot`, que es el número que
  // el agente se pone a sí mismo. Los cortes de ahora no lo miran para nada.
  const cortes = buildENSTimelineCuts(
    [
      evento(enDia(3), {
        eventType: 'score_snapshot',
        score: 100,
      }),
      evento(enDia(4)),
      evento(enDia(5)),
    ],
    { now: AHORA, days: 7 }
  );

  comprueba(
    'un score_snapshot es un evento más: no crea ni suprime puntos',
    cortes.length === 3,
    `${cortes.length}`
  );

  // La reversión frente al comportamiento viejo: antes, un conjunto SIN ningún
  // score_snapshot no producía serie ninguna y la tarjeta caía al valor actual.
  const sinSnapshots = buildENSTimelineCuts(
    [evento(enDia(3)), evento(enDia(4)), evento(enDia(5))],
    { now: AHORA, days: 7 }
  );

  comprueba(
    'y sin ningún score_snapshot la serie existe igual',
    sinSnapshots.length === 3,
    `${sinSnapshots.length}`
  );
}

bloque('8. El catálogo que el gráfico ya no consulta');

{
  // op.acc.1 se usa arriba solo como control de que el catálogo carga; si esta
  // importación se rompiera, los bloques 1-5 seguirían pasando y la prueba
  // estaría comprobando menos de lo que dice.
  comprueba(
    'el catálogo de op.acc.1 carga (control positivo de las importaciones)',
    opAcc1CatalogDefinition.id === 'op.acc.1',
    opAcc1CatalogDefinition.id
  );
}

// --- 9. el presupuesto: la serie no puede colgar la pestaña ---------------
//
// NACE DE UN FALLO QUE DEJÓ EL DASHBOARD SIN CARGAR EN PRODUCCIÓN.
//
// Cada punto es una pasada completa del motor sobre el prefijo de ese día. Con
// 97.905 eventos y 30 días —wazuh-real, 06/08/2026— son metro y medio de millón
// de evaluaciones en el hilo del navegador: la pestaña se queda en «Cargando
// configuración y alcance ENS…» y no vuelve.
//
// Lo que se recorta es el NÚMERO DE PUNTOS, nunca los eventos de un punto: un
// punto calculado sobre la mitad de los hechos seria un numero falso, y el
// valor de esta serie es que cada punto se calcula igual que el panel.

bloque('9. Con mucho volumen, menos puntos — pero nunca menos eventos');

{
  // 40.000 eventos repartidos por una ventana de 30 dias.
  const muchos: ENSNormalizedEvent[] = [];
  for (let dia = 29; dia >= 0; dia -= 1) {
    const cuando = new Date(AHORA);
    cuando.setDate(cuando.getDate() - dia);
    cuando.setHours(9, 0, 0, 0);
    for (let i = 0; i < 1333; i += 1) {
      muchos.push(evento(cuando.toISOString()));
    }
  }

  const serie = buildENSTimelineCuts(muchos, { now: AHORA, days: 30 });

  const evaluados = serie.reduce(
    (total, corte) => total + corte.events.length,
    0
  );

  comprueba(
    'la serie se mantiene dentro del presupuesto de evaluaciones',
    evaluados <= 500000,
    `${evaluados} eventos evaluados en total`
  );

  comprueba(
    'y por tanto tiene menos de 30 puntos',
    serie.length < 30 && serie.length >= 2,
    `${serie.length} puntos`
  );

  // Lo que NO puede pasar nunca, y es la mitad importante de esta prueba.
  comprueba(
    'el punto del presente sigue estando, con el paso que sea',
    serie.filter(corte => corte.isCurrent).length === 1,
    `${serie.filter(corte => corte.isCurrent).length} puntos marcados como presente`
  );

  comprueba(
    'y es el ÚLTIMO, con TODOS los eventos: es el número del panel',
    serie[serie.length - 1].isCurrent &&
      serie[serie.length - 1].events.length === muchos.length,
    `${serie[serie.length - 1].events.length} de ${muchos.length}`
  );

  // La reversión: con poco volumen el paso sigue siendo diario. Sin esto, un
  // presupuesto demasiado agresivo degradaría todas las gráficas y la prueba
  // de arriba pasaría igual.
  const pocos = [
    evento(new Date(2026, 7, 1, 9).toISOString()),
    evento(new Date(2026, 7, 3, 9).toISOString()),
  ];

  const serieCorta = buildENSTimelineCuts(pocos, { now: AHORA, days: 30 });

  comprueba(
    'con poco volumen el paso sigue siendo DIARIO',
    serieCorta.length >= 5,
    `${serieCorta.length} puntos`
  );
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(fallo => console.log(`  - ${fallo}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
