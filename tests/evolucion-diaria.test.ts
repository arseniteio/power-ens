/**
 * La serie diaria del gráfico de evolución.
 *
 *     ~/.bun/bin/bun run tests/evolucion-diaria.test.ts
 *
 * Mismo montaje que sus hermanas (`evidence-judgment`, `hueco-de-medida`,
 * `vista-general-agregada`): TypeScript suelto con su propio comprobador, sin
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
import { opAcc1CatalogDefinition } from '../dashboard/ens/catalog/op-acc-1';
import { mpInfo6CatalogDefinition } from '../dashboard/ens/catalog/mp-info-6';
import { mpInfo6Configuration } from '../dashboard/ens/configuration/data/mp-info-6-parameters';
import type { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';
import type { ENSEvidenceResolved } from '../dashboard/ens/core/evidence/types';
import { getEvidenceDefinitions } from '../dashboard/ens/core/evidence/registry';
import { buildPolicyContext } from '../dashboard/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../dashboard/ens/core/policy-runtime/policy-runtime';
import {
  buildENSTimelineCuts,
  startOfDay,
} from '../dashboard/ens/core/timeline/timeline-cuts';

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
  const definicion = getEvidenceDefinitions('mp.info.6').find(
    item => item.id === 'EV-01'
  );

  if (!definicion) {
    throw new Error('El catálogo no define EV-01 para mp.info.6');
  }

  // La copia se hizo el día 3 a las 9:00.
  const copia: ENSEvidenceResolved = {
    id: definicion.id,
    controlId: definicion.controlId,
    title: definicion.title,
    description: definicion.description,
    requirements: definicion.requirements,
    levels: definicion.levels,
    category: definicion.category,
    criticality: definicion.criticality,
    sourceTypes: definicion.sourceTypes,
    expectedEventTypes: definicion.expectedEventTypes,
    relatedRules: definicion.relatedRules,
    auditQuestion: definicion.auditQuestion,
    status: 'CUMPLE',
    observations: [],
    lastSeen: enDia(3),
  };

  const edadEn = (instante?: Date): number | undefined => {
    const runtime = runPolicyRuntime(
      buildPolicyContext(
        mpInfo6CatalogDefinition,
        mpInfo6Configuration,
        'BAJO',
        [],
        [copia],
        instante
      )
    );

    const variable = runtime.runtimeVariables.find(
      item => item.name === 'lastBackupAgeHours'
    );

    return typeof variable?.value === 'number'
      ? variable.value
      : undefined;
  };

  // Evaluada al final del día 3, la copia de esa mañana tiene ~15 h.
  const finDelDia3 = new Date(2026, 7, 3, 23, 59, 59, 999);

  const edadEnSuDia = edadEn(finDelDia3);

  comprueba(
    'evaluada en su propio día, la copia tiene menos de 24 h',
    edadEnSuDia !== undefined && edadEnSuDia < 24,
    `${edadEnSuDia} h`
  );

  // La reversión, que es todo el defecto en una línea: la MISMA copia medida
  // contra hoy tiene dos días. Si el instante no viajara hasta aquí, el punto
  // del día 3 se juzgaría con este número y la línea bajaría hacia el pasado
  // por el mero hecho de que el pasado es viejo.
  const edadHoy = edadEn(AHORA);

  comprueba(
    'y la misma copia medida contra hoy pasa de 24 h',
    edadHoy !== undefined && edadHoy > 24,
    `${edadHoy} h`
  );

  comprueba(
    'que son números distintos: el instante llega de verdad al runtime',
    edadEnSuDia !== edadHoy,
    `${edadEnSuDia} vs ${edadHoy}`
  );

  // Y sin instante se comporta como siempre: contra el reloj real. Es lo que
  // garantiza que el panel no ha cambiado de comportamiento.
  const edadPorDefecto = edadEn(undefined);

  comprueba(
    'sin instante, sigue midiendo contra el reloj real (el panel no cambia)',
    edadPorDefecto !== undefined && edadPorDefecto > 24,
    `${edadPorDefecto} h`
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

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(fallo => console.log(`  - ${fallo}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
