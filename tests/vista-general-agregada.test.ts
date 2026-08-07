/**
 * La vista general escala a decenas de agentes sin dejar de leerse.
 *
 *     ~/.bun/bin/bun run tests/vista-general-agregada.test.ts
 *
 * Mismo montaje que `hueco-de-medida.test.ts` y `evidence-judgment.test.ts`:
 * TypeScript suelto con su propio comprobador, sin `package.json` ni `tsconfig`.
 * Hace falta un runtime que ejecute TypeScript resolviendo imports sin extensión
 * (`bun`, probado con 1.3.14).
 *
 * Por qué existe este fichero: con los 7 agentes del primer despliegue real, el
 * detalle del control sin agente seleccionado era ilegible. La columna «Motivo»
 * concatenaba el mensaje de las 7 máquinas con el prefijo `[nombre (id)]` —una
 * celda de quince líneas repitiendo casi lo mismo—, y las tarjetas salían
 * multiplicadas por agente: 45 tarjetas donde hay 8 requisitos distintos, con
 * `op.acc.1.5` repetido 5 veces diciendo que no tiene evidencia declarada en el
 * catálogo, que es un hecho DEL CATÁLOGO y no de la máquina.
 *
 * Reglas de estas pruebas, las mismas de sus dos hermanas:
 *
 *   - cada bloque mueve UN SOLO eje respecto de su hermano. Si un caso cambia
 *     dos cosas a la vez no dice cuál de las dos produjo el efecto;
 *   - se comprueba la ESTRUCTURA (cuántos grupos, cuántas máquinas por grupo,
 *     en qué lista está la tarjeta), no el texto de un mensaje, que también
 *     aparece en la salida normal;
 *   - toda afirmación de «esto agrupa» lleva su REVERSIÓN al lado: los mismos
 *     agentes con el texto distinto NO agrupan. Sin ella, una prueba que solo
 *     mirase el caso agrupado pasaría igual con un `uniqueValues` ciego que
 *     borrase información;
 *   - el «antes» nunca se compara consigo mismo: sale de sumar los resultados
 *     POR AGENTE, que son objetos distintos del consolidado.
 *
 * Imports desde el FICHERO, nunca desde un barrel de alto nivel: el barrel
 * reintroduce el ciclo transitivo del TDZ de `Settings` y arrastra
 * `kibana-services`, que solo existe en el árbol del plugin `main` de Wazuh.
 */
import { opAcc1CatalogDefinition } from '../dashboard/ens/catalog/op-acc-1';
import type { ENSControlDefinition } from '../dashboard/ens/catalog/types';
import { opAcc1Configuration } from '../dashboard/ens/configuration/data/op-acc-1-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../dashboard/ens/configuration/types';
import { evaluateENSControl } from '../dashboard/ens/core/evaluation/evaluation-engine';
import type {
  ENSComplianceResult,
  ENSComplianceStatus,
} from '../dashboard/ens/core/evaluation/types';
import { consolidateAgentComplianceResultByControl } from '../dashboard/ens/core/compliance-state/consolidation';
import type { ENSAgentComplianceState } from '../dashboard/ens/core/compliance-state/types';
import { getEvidenceDefinitions } from '../dashboard/ens/core/evidence/registry';
import type { ENSEvidenceResolved } from '../dashboard/ens/core/evidence/types';
import {
  describirAlcance,
  etiquetaDeMaquinas,
  resumirMotivos,
} from '../dashboard/ens/controls/control-detail/general-view';

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

const CONTROL: ENSControlDefinition = opAcc1CatalogDefinition;

// La evidencia resuelta se construye desde la definición REAL del catálogo, no
// a mano: una fixture inventada probaría un control que no existe.
//
// `observations` y `motivoDelAgente` NO son lo mismo y aquí importa la
// diferencia: las primeras alimentan la columna «Motivo» de la tabla de
// evidencias; el segundo es el `motivo` que el agente puso en su
// `evidence_state`, viaja en `resolvedAttributes` y es lo que el motor mete
// dentro del `finding` de la tarjeta PM. Dos máquinas que no miden por razones
// distintas se distinguen por el segundo, no por las primeras.
const evidencia = (
  evidenciaId: string,
  status: ENSComplianceStatus,
  observations: string[] = [],
  motivoDelAgente?: string
): ENSEvidenceResolved => {
  const definicion = getEvidenceDefinitions('op.acc.1').find(
    item => item.id === evidenciaId
  );

  if (!definicion) {
    throw new Error(`El catálogo no define ${evidenciaId} para op.acc.1`);
  }

  return {
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
    status,
    observations,
    resolvedAttributes: motivoDelAgente
      ? { motivo: motivoDelAgente }
      : undefined,
  };
};

const TODAS = [
  'EV-01',
  'EV-02',
  'EV-03',
  'EV-04',
  'EV-05',
  'EV-06',
  'EV-07',
  'EV-08',
];

// Todas en CUMPLE salvo las que se digan. Un único eje por caso.
const evidencias = (
  excepciones: Record<string, ENSComplianceStatus> = {},
  motivos: Record<string, string[]> = {},
  motivosDelAgente: Record<string, string> = {}
): ENSEvidenceResolved[] =>
  TODAS.map(id =>
    evidencia(
      id,
      excepciones[id] || 'CUMPLE',
      motivos[id] || [],
      motivosDelAgente[id]
    )
  );

// Valor válido para el tipo de cada parámetro: hace falta para que el eje
// «configuración incompleta» esté quieto mientras se mueve el de las evidencias.
const valorValido = (
  parametro: ENSControlParameter
): ENSControlParameter['value'] => {
  if (parametro.options && parametro.options.length) {
    return parametro.options[0];
  }

  switch (parametro.type) {
    case 'number':
    case 'duration_days':
    case 'duration_hours':
      return typeof parametro.minValue === 'number'
        ? Math.max(parametro.minValue, 1)
        : 7;
    case 'boolean':
      return true;
    case 'list':
      // Una lista que declara la forma de su elemento (`columns[0]`) no admite
      // cualquier cosa: 'valor-uno' no es una ruta absoluta. El ejemplo de la
      // ficha sí vale, y `config/test_control_blocks.py` ya obliga a que sea un
      // elemento válido.
      return parametro.columns && parametro.columns.length
        ? [parametro.example || '']
        : ['valor-uno', 'valor-dos'];
    case 'table':
      // Una fila entera. Con el `default: 'valor'` de antes, toda tabla
      // obligatoria salía INVALID y el eje «configuración» dejaba de estar
      // quieto: esta prueba mediría el hueco de configuración creyendo que mide
      // el de evidencias.
      return [parametro.example || ''];
    case 'path':
      return '/var/lib/ensfacil';
    case 'url':
      return 'https://ensfacil.example.org/api';
    default:
      return 'valor';
  }
};

const CONFIGURACION_COMPLETA: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parametro => ({
    ...parametro,
    value: valorValido(parametro),
  })),
};

const evalua = (
  resueltas: ENSEvidenceResolved[],
  nivel: ENSLevel = 'MEDIO'
): ENSComplianceResult =>
  evaluateENSControl(CONTROL, CONFIGURACION_COMPLETA, nivel, resueltas, undefined, []);

// El parque del primer despliegue real: siete máquinas.
const MAQUINAS = [
  { agentId: '021', agentName: 'CLIENTE-01' },
  { agentId: '022', agentName: 'CLIENTE-02' },
  { agentId: '023', agentName: 'CLIENTE-03' },
  { agentId: '024', agentName: 'CLIENTE-04' },
  { agentId: '025', agentName: 'CLIENTE-05' },
  { agentId: '026', agentName: 'CLIENTE-06' },
  { agentId: '027', agentName: 'CLIENTE-07' },
];

// Un parque de N máquinas, cada una con el resultado que le toque. `resultadoDe`
// recibe el índice para poder hacer que una se comporte distinta de las demás.
const parque = (
  cuantas: number,
  resultadoDe: (indice: number) => ENSComplianceResult
): ENSAgentComplianceState[] =>
  MAQUINAS.slice(0, cuantas).map((maquina, indice) => ({
    agentId: maquina.agentId,
    agentName: maquina.agentName,
    results: [resultadoDe(indice)],
    summary: undefined as never,
  }));

const consolida = (agentes: ENSAgentComplianceState[]): ENSComplianceResult => {
  const resultado = consolidateAgentComplianceResultByControl(agentes, 'op.acc.1');

  if (!resultado) {
    throw new Error('La consolidación no ha devuelto resultado para op.acc.1');
  }

  return resultado;
};

// El «antes»: lo que la pantalla habría pintado sumando los resultados por
// agente. Son objetos distintos del consolidado, no el consolidado otra vez.
const sumaPorAgente = (
  agentes: ENSAgentComplianceState[],
  selector: (resultado: ENSComplianceResult) => number
): number =>
  agentes.reduce((total, agente) => total + selector(agente.results[0]), 0);

// Hasta el 04/08 esto vivía en una lista propia, `measurementGaps`. Desde la
// decisión del responsable el veredicto de un hueco es el mismo que el de un
// incumplimiento medido, así que viven en la MISMA lista y lo que las separa es
// `origin`. La agregación que se comprueba en este fichero —una tarjeta por
// hallazgo, no por máquina— es la misma; sólo ha cambiado dónde están.
const huecos = (resultado: ENSComplianceResult) =>
  resultado.nonConformities.filter(item => item.origin === 'NO_EVIDENCIADA');

const medidas = (resultado: ENSComplianceResult) =>
  resultado.nonConformities.filter(item => item.origin === 'MEDIDA');

const MOTIVO_SIN_DATOS =
  'Sin eventos del recolector en la ventana de evaluación.';

// ---------------------------------------------------------------------------
bloque('1 · un motivo que se repite en N máquinas es UN motivo');

{
  // Eje: el TEXTO del motivo. Todo lo demás (las 7 máquinas, el estado de la
  // evidencia, la configuración) se queda quieto entre los tres casos.
  const mismoMotivo = consolida(
    parque(7, () =>
      evalua(
        evidencias({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [MOTIVO_SIN_DATOS] })
      )
    )
  );

  const ev04 = mismoMotivo.evidences.find(item => item.id === 'EV-04');

  comprueba(
    'siete máquinas con el mismo motivo · un solo grupo',
    ev04?.observationGroups?.length === 1,
    JSON.stringify(ev04?.observationGroups?.map(grupo => grupo.text))
  );

  comprueba(
    'siete máquinas con el mismo motivo · el grupo dice que son siete',
    ev04?.observationGroups?.[0].agents.length === 7,
    String(ev04?.observationGroups?.[0].agents.length)
  );

  comprueba(
    'siete máquinas con el mismo motivo · una sola línea de texto plano',
    ev04?.observations.length === 1,
    JSON.stringify(ev04?.observations)
  );

  // REVERSIÓN, moviendo solo el texto: si cada máquina trae un motivo distinto,
  // no se agrupa nada. Sin esto, la comprobación de arriba pasaría igual con un
  // borrado ciego de duplicados que perdiese los motivos que sí difieren.
  const motivoDistinto = consolida(
    parque(7, indice =>
      evalua(
        evidencias(
          { 'EV-04': 'NO_EVALUABLE' },
          { 'EV-04': [`${MOTIVO_SIN_DATOS} Detalle propio de la máquina ${indice}.`] }
        )
      )
    )
  );

  const ev04Distinto = motivoDistinto.evidences.find(item => item.id === 'EV-04');

  comprueba(
    'reversión · siete motivos distintos siguen siendo siete',
    ev04Distinto?.observationGroups?.length === 7 &&
      ev04Distinto?.observationGroups?.every(grupo => grupo.agents.length === 1),
    JSON.stringify(
      ev04Distinto?.observationGroups?.map(grupo => grupo.agents.length)
    )
  );

  // Agregar no es esconder: seis fallan por una razón y una por otra, y las dos
  // se ven, con su recuento.
  const seisYUna = consolida(
    parque(7, indice =>
      evalua(
        evidencias(
          { 'EV-04': 'NO_EVALUABLE' },
          {
            'EV-04': [
              indice === 6 ? 'El recolector no está instalado.' : MOTIVO_SIN_DATOS,
            ],
          }
        )
      )
    )
  );

  const ev04Mezcla = seisYUna.evidences.find(item => item.id === 'EV-04');
  const recuentos = (ev04Mezcla?.observationGroups || [])
    .map(grupo => grupo.agents.length)
    .sort((izquierda, derecha) => derecha - izquierda);

  comprueba(
    'seis por una razón y una por otra · dos grupos, de 6 y de 1',
    recuentos.length === 2 && recuentos[0] === 6 && recuentos[1] === 1,
    JSON.stringify(recuentos)
  );

  comprueba(
    'la máquina rara se puede nombrar: el grupo de 1 dice cuál es',
    (ev04Mezcla?.observationGroups || []).some(
      grupo => grupo.agents.length === 1 && grupo.agents[0].agentId === '027'
    ),
    JSON.stringify(
      (ev04Mezcla?.observationGroups || []).map(grupo =>
        grupo.agents.map(agente => agente.agentId)
      )
    )
  );
}

// ---------------------------------------------------------------------------
bloque('2 · las tarjetas no se multiplican por máquina');

{
  const agentes = parque(7, () =>
    evalua(evidencias({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [MOTIVO_SIN_DATOS] }))
  );

  const antes = sumaPorAgente(agentes, resultado => huecos(resultado).length);
  const consolidado = consolida(agentes);
  const despues = huecos(consolidado).length;

  // Baseline explícita: si cada agente no trajera huecos por su cuenta, la
  // reducción de abajo no probaría nada (la mutación tiene que aplicarse donde
  // se cree que se aplica).
  comprueba(
    'cada agente trae sus huecos por su cuenta (el «antes» no es cero)',
    antes === agentes.length * huecos(agentes[0].results[0]).length &&
      antes > 0,
    String(antes)
  );

  // Recuento independiente: cuántos huecos DISTINTOS hay realmente, calculado
  // fuera de la consolidación.
  const distintos = new Set(
    agentes.flatMap(agente =>
      huecos(agente.results[0]).map(
        hueco => `${hueco.requirementId}|${hueco.finding}|${hueco.requiredAction}`
      )
    )
  ).size;

  comprueba(
    'la vista general enseña tantas tarjetas como huecos distintos hay',
    despues === distintos,
    `${despues} tarjetas vs ${distintos} huecos distintos`
  );

  comprueba(
    'y son muchas menos que antes',
    despues < antes,
    `antes ${antes}, después ${despues}`
  );

  comprueba(
    'ninguna tarjeta consolidada repite identificador',
    new Set(huecos(consolidado).map(hueco => hueco.id)).size === despues,
    JSON.stringify(huecos(consolidado).map(hueco => hueco.id))
  );

  // El «antes» y el «después» de arriba salen de siete máquinas que no miden
  // por la MISMA razón. Que la tarjeta sea una es correcto justo porque el
  // motivo es el mismo:
  const huecosDeEv04 = huecos(consolidado).filter(hueco =>
    hueco.evidenceIds.includes('EV-04')
  );

  comprueba(
    'mismo motivo del recolector · una sola tarjeta con las siete máquinas',
    huecosDeEv04.length === 1 && (huecosDeEv04[0].agents || []).length === 7,
    JSON.stringify(huecosDeEv04.map(hueco => (hueco.agents || []).length))
  );

  // REVERSIÓN, moviendo solo el motivo QUE VIAJA EN LA TARJETA (el que el
  // agente pone en su `evidence_state`, no las observaciones de la evidencia):
  // dos máquinas que no miden por razones distintas siguen dando dos tarjetas.
  // Agrupar por contenido no puede tragarse una diferencia real.
  const conMotivosDistintos = parque(7, indice =>
    evalua(
      evidencias(
        { 'EV-04': 'NO_EVALUABLE' },
        {},
        { 'EV-04': `Motivo propio de la máquina ${indice}.` }
      )
    )
  );

  const huecosVariados = huecos(consolida(conMotivosDistintos)).filter(hueco =>
    hueco.evidenceIds.includes('EV-04')
  );

  comprueba(
    'reversión · siete motivos distintos siguen dando siete tarjetas',
    huecosVariados.length === 7 &&
      huecosVariados.every(hueco => (hueco.agents || []).length === 1),
    JSON.stringify(huecosVariados.map(hueco => (hueco.agents || []).length))
  );

  comprueba(
    'reversión · y cada una lleva el nombre de su máquina en el id',
    huecosVariados.every(hueco =>
      hueco.id.startsWith(`${(hueco.agents || [])[0]?.agentId}:NC-`)
    ),
    JSON.stringify(huecosVariados.map(hueco => hueco.id))
  );
}

// ---------------------------------------------------------------------------
bloque('3 · lo del catálogo no es un hallazgo por máquina');

{
  // Las dos causas conviven en el MISMO resultado consolidado, así que la
  // diferencia entre ellas solo puede venir de la causa: no hay una fixture
  // para cada rama que pudiera estar midiendo otra cosa.
  const consolidado = consolida(
    parque(7, () =>
      evalua(evidencias({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [MOTIVO_SIN_DATOS] }))
    )
  );

  const delCatalogo = huecos(consolidado).filter(
    hueco => hueco.cause === 'CATALOG'
  );

  const deLaMaquina = huecos(consolidado).filter(
    hueco => hueco.cause === 'EVIDENCE'
  );

  // op.acc.1.5 y op.acc.1.r1.1 no declaran ninguna evidencia en el catálogo.
  comprueba(
    'los dos huecos del catálogo salen UNA vez, no siete',
    delCatalogo.length === 2,
    JSON.stringify(delCatalogo.map(hueco => hueco.requirementId))
  );

  comprueba(
    'op.acc.1.5 aparece exactamente una vez',
    huecos(consolidado).filter(
      hueco => hueco.requirementId === 'op.acc.1.5'
    ).length === 1,
    JSON.stringify(
      huecos(consolidado)
        .filter(hueco => hueco.requirementId === 'op.acc.1.5')
        .map(hueco => hueco.id)
    )
  );

  comprueba(
    'un hueco del catálogo no se atribuye a ninguna máquina',
    delCatalogo.every(hueco => (hueco.agents || []).length === 0),
    JSON.stringify(delCatalogo.map(hueco => (hueco.agents || []).length))
  );

  // La otra rama, en el mismo resultado: lo que SÍ es de la máquina sí las
  // nombra. Sin esto, «agents vacío» podría estar vacío para todos.
  comprueba(
    'lo que sí es de la máquina sigue nombrando a las siete',
    deLaMaquina.length > 0 &&
      deLaMaquina.every(hueco => (hueco.agents || []).length === 7),
    JSON.stringify(deLaMaquina.map(hueco => (hueco.agents || []).length))
  );

  // El identificador tampoco puede nombrar una máquina si la tarjeta es de
  // varias (o de ninguna): `025:NC-001` y `024:NC-001` parecían hermanos y no
  // lo eran, porque el número es el índice DENTRO de cada agente.
  comprueba(
    'una tarjeta compartida no lleva el nombre de una máquina en el id',
    [...delCatalogo, ...deLaMaquina].every(hueco => !hueco.id.includes(':')),
    JSON.stringify([...delCatalogo, ...deLaMaquina].map(hueco => hueco.id))
  );

  // REVERSIÓN, moviendo solo el número de máquinas: con UNA sola, la tarjeta sí
  // puede llevar su nombre, y lo lleva.
  const unaSola = consolida(
    parque(1, () =>
      evalua(evidencias({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [MOTIVO_SIN_DATOS] }))
    )
  );

  comprueba(
    'reversión · con una sola máquina, su hueco sí lleva su etiqueta',
    huecos(unaSola).some(
      hueco => hueco.cause === 'EVIDENCE' && hueco.id.startsWith('021:NC-')
    ),
    JSON.stringify(huecos(unaSola).map(hueco => hueco.id))
  );

  comprueba(
    'reversión · pero el del catálogo sigue sin llevarla ni con una máquina',
    huecos(unaSola)
      .filter(hueco => hueco.cause === 'CATALOG')
      .every(hueco => !hueco.id.includes(':')),
    JSON.stringify(
      huecos(unaSola)
        .filter(hueco => hueco.cause === 'CATALOG')
        .map(hueco => hueco.id)
    )
  );
}

// ---------------------------------------------------------------------------
bloque('4 · agregar no diluye la distinción medido / no evidenciado');

{
  // op.acc.1.1 se acredita SOLO con EV-03, así que el estado del requisito lo
  // decide una única evidencia: el eje se mueve limpio.
  //
  //   máquina 021       -> EV-03 NO_CUMPLE     -> incumplimiento MEDIDO
  //   máquinas 022..027 -> EV-03 NO_EVALUABLE  -> incumplimiento NO EVIDENCIADO
  //
  // Desde el 04/08 las dos cosas son no conformidades y cuentan igual, así que
  // están en la MISMA lista. Lo que no puede pasar es que se fundan en una sola
  // tarjeta: la acción de cada una es distinta y la ejecuta otra persona.
  const agentes = parque(7, indice =>
    indice === 0
      ? evalua(evidencias({ 'EV-03': 'NO_CUMPLE' }))
      : evalua(
          evidencias({ 'EV-03': 'NO_EVALUABLE' }, { 'EV-03': [MOTIVO_SIN_DATOS] })
        )
  );

  const consolidado = consolida(agentes);

  const deOpAcc11 = consolidado.nonConformities.filter(
    item => item.requirementId === 'op.acc.1.1'
  );

  const ncDeOpAcc11 = deOpAcc11.filter(item => item.origin === 'MEDIDA');

  const pmDeOpAcc11 = deOpAcc11.filter(
    item => item.origin === 'NO_EVIDENCIADA'
  );

  comprueba(
    'el mismo requisito abre DOS tarjetas en la misma lista, no una fundida',
    deOpAcc11.length === 2 &&
      ncDeOpAcc11.length === 1 &&
      pmDeOpAcc11.length === 1,
    `${deOpAcc11.length} tarjetas: ${ncDeOpAcc11.length} medidas / ${pmDeOpAcc11.length} no evidenciadas`
  );

  comprueba(
    'la no conformidad señala solo a la máquina donde se demostró',
    (ncDeOpAcc11[0]?.agents || []).length === 1 &&
      ncDeOpAcc11[0]?.agents?.[0].agentId === '021',
    JSON.stringify((ncDeOpAcc11[0]?.agents || []).map(agente => agente.agentId))
  );

  comprueba(
    'la no evidenciada señala a las otras seis, y NO a la que incumple',
    (pmDeOpAcc11[0]?.agents || []).length === 6 &&
      !(pmDeOpAcc11[0]?.agents || []).some(agente => agente.agentId === '021'),
    JSON.stringify((pmDeOpAcc11[0]?.agents || []).map(agente => agente.agentId))
  );

  comprueba(
    'ningún identificador se repite dentro de la lista',
    new Set(consolidado.nonConformities.map(item => item.id)).size ===
      consolidado.nonConformities.length,
    JSON.stringify(consolidado.nonConformities.map(item => item.id))
  );

  // Lo que ya NO puede decir ninguna tarjeta: que no es un incumplimiento. Lo
  // es. Lo que sí tiene que decir es por qué cuenta.
  comprueba(
    'ninguna tarjeta se presenta ya como «no es un incumplimiento»',
    consolidado.nonConformities.every(
      item => !item.impact.includes('No es un incumplimiento')
    ),
    JSON.stringify(consolidado.nonConformities.map(item => item.impact))
  );

  comprueba(
    'las no evidenciadas invocan la carga de la prueba; las medidas, no',
    huecos(consolidado).every(item =>
      item.impact.includes('carga de la prueba')
    ) &&
      medidas(consolidado).every(
        item => !item.impact.includes('carga de la prueba')
      ),
    JSON.stringify(consolidado.nonConformities.map(item => item.origin))
  );

  // El corazón de lo que se conserva de 346e56b: mismo requisito, mismo
  // veredicto, y aun así dos acciones distintas.
  comprueba(
    'el mismo requisito da dos acciones distintas según cómo se llegó a él',
    ncDeOpAcc11[0]?.requiredAction !== pmDeOpAcc11[0]?.requiredAction,
    `${String(ncDeOpAcc11[0]?.requiredAction)} vs ${String(
      pmDeOpAcc11[0]?.requiredAction
    )}`
  );
}

// ---------------------------------------------------------------------------
bloque('5 · lo que la pantalla recorta, lo dice');

{
  const grupo = (texto: string, cuantas: number) => ({
    text: texto,
    agents: MAQUINAS.slice(0, cuantas),
  });

  const cinco = [
    grupo('motivo-a', 1),
    grupo('motivo-b', 5),
    grupo('motivo-c', 2),
    grupo('motivo-d', 1),
    grupo('motivo-e', 1),
  ];

  const resumen = resumirMotivos(cinco);

  comprueba(
    'con cinco motivos se enseñan tres y se cuentan los dos que faltan',
    resumen.visibles.length === 3 && resumen.ocultos === 2,
    `${resumen.visibles.length} visibles / ${resumen.ocultos} ocultos`
  );

  comprueba(
    'el motivo más extendido no se queda fuera nunca',
    resumen.visibles[0].text === 'motivo-b' &&
      resumen.visibles[1].text === 'motivo-c',
    JSON.stringify(resumen.visibles.map(item => item.text))
  );

  // REVERSIÓN, moviendo solo cuántos motivos hay: con tres no se oculta nada, y
  // la pantalla no puede anunciar un «y N más» que no existe.
  const tres = resumirMotivos(cinco.slice(0, 3));

  comprueba(
    'reversión · con tres motivos no se oculta ninguno',
    tres.visibles.length === 3 && tres.ocultos === 0,
    `${tres.visibles.length} visibles / ${tres.ocultos} ocultos`
  );

  // «6 de 7» y «las 7» son dos cosas distintas: la primera dice que hay una
  // máquina que se comporta de otra manera y hay que ir a buscarla.
  comprueba(
    'siete de siete se marcan como «todas»',
    (describirAlcance(MAQUINAS.slice(0, 7), 7) || '').includes('(todas)'),
    describirAlcance(MAQUINAS.slice(0, 7), 7)
  );

  comprueba(
    'reversión · seis de siete NO se marcan como «todas»',
    !(describirAlcance(MAQUINAS.slice(0, 6), 7) || '').includes('(todas)'),
    describirAlcance(MAQUINAS.slice(0, 6), 7)
  );

  comprueba(
    'a partir de la quinta máquina se cuentan en vez de nombrarlas',
    (describirAlcance(MAQUINAS.slice(0, 7), 7) || '').includes('y 3 más'),
    describirAlcance(MAQUINAS.slice(0, 7), 7)
  );

  comprueba(
    'reversión · cuatro máquinas se nombran todas, sin «y N más»',
    !(describirAlcance(MAQUINAS.slice(0, 4), 7) || '').includes('más'),
    describirAlcance(MAQUINAS.slice(0, 4), 7)
  );

  comprueba(
    'una sola máquina se nombra, no se cuenta',
    etiquetaDeMaquinas(MAQUINAS.slice(0, 1), 7) === 'CLIENTE-01 (021)',
    etiquetaDeMaquinas(MAQUINAS.slice(0, 1), 7)
  );

  comprueba(
    'sin máquinas no hay alcance que describir (lo del catálogo)',
    describirAlcance([], 7) === undefined,
    String(describirAlcance([], 7))
  );
}

// ---------------------------------------------------------------------------
bloque('6 · las cifras de la pantalla con los 7 agentes del despliegue real');

{
  // El caso que se vio en el servidor: nada medido en ninguna máquina.
  const sinMedirNada = () =>
    evalua(
      evidencias(
        Object.fromEntries(
          TODAS.map(id => [id, 'NO_EVALUABLE' as ENSComplianceStatus])
        ),
        Object.fromEntries(TODAS.map(id => [id, [MOTIVO_SIN_DATOS]]))
      )
    );

  const agentes = parque(7, sinMedirNada);
  const consolidado = consolida(agentes);

  // Una sola lista desde el 04/08: el total es directamente el de tarjetas.
  const tarjetasAntes = sumaPorAgente(
    agentes,
    resultado => resultado.nonConformities.length
  );

  const tarjetasDespues = consolidado.nonConformities.length;

  const lineasAntes = sumaPorAgente(agentes, resultado =>
    resultado.evidences.reduce(
      (total, evidencia) => total + evidencia.observations.length,
      0
    )
  );

  const lineasDespues = consolidado.evidences.reduce(
    (total, evidencia) => total + evidencia.observations.length,
    0
  );

  console.log(
    `       tarjetas: ${tarjetasAntes} -> ${tarjetasDespues} · ` +
      `líneas de motivo: ${lineasAntes} -> ${lineasDespues}`
  );

  comprueba(
    'las tarjetas dejan de multiplicarse por siete',
    tarjetasDespues * 7 === tarjetasAntes,
    `antes ${tarjetasAntes}, después ${tarjetasDespues}`
  );

  comprueba(
    'las líneas de motivo dejan de multiplicarse por siete',
    lineasDespues * 7 === lineasAntes,
    `antes ${lineasAntes}, después ${lineasDespues}`
  );

  comprueba(
    'y no se ha perdido ninguna evidencia por el camino',
    consolidado.evidences.length === agentes[0].results[0].evidences.length,
    `${consolidado.evidences.length} vs ${agentes[0].results[0].evidences.length}`
  );

  comprueba(
    'la vista general dice sobre cuántas máquinas ha resumido',
    consolidado.consolidatedAgents?.length === 7,
    String(consolidado.consolidatedAgents?.length)
  );
}

// --- 7 · el score del requisito consolidado sigue al veredicto ------------
//
// UNA BOMBA ARMADA, desactivada el 07/08/2026.
//
// `consolidateRequirements` construye el requisito consolidado con
// `{...template, status: peorGana}`, y `template` es el requisito de la PRIMERA
// máquina: arrastraba su `score`. Un requisito que sale NO_CUMPLE porque falla
// en la segunda seguía llevando los 100 de la primera, y `createSummaryFromItems`
// prefiere `item.score` sobre el estado.
//
// Hoy ese índice no se pinta en ninguna pantalla —el número grande sale de
// `controlSummary`, que recalcula desde los veredictos— así que no ha mentido a
// ningún auditor. Pero un campo que contradice al estado de al lado es una
// mentira esperando a que alguien la pinte.
//
// La comprobación que importa es la de ORDEN: un arreglo a medias da el número
// bueno cuando la máquina mala va primera y el malo cuando va segunda.

bloque('7 · el score consolidado no se queda con el de la primera máquina');

{
  // Una máquina sana y una que no reporta EV-04. Son resultados de la
  // evaluación real, no objetos a mano: lo que se prueba es la consolidación.
  const sana = () => evalua(evidencias({}));
  const rota = () =>
    evalua(evidencias({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [MOTIVO_SIN_DATOS] }));

  const conOrden = (sanaPrimero: boolean) =>
    consolida(
      parque(2, indice =>
        (sanaPrimero ? indice === 0 : indice === 1) ? sana() : rota()
      )
    );

  const sanaDelante = conOrden(true);
  const sanaDetras = conOrden(false);

  const scoreDe = (r: ENSComplianceResult, id: string) =>
    (r.requirements.find(x => x.id === id) as { score?: number } | undefined)?.score;

  const estadoDe = (r: ENSComplianceResult, id: string) =>
    r.requirements.find(x => x.id === id)?.status;

  // El requisito que EV-04 acredita y que por tanto difiere entre las dos.
  const REQ = 'op.acc.1.4';

  comprueba(
    'baseline: el requisito sale distinto en la máquina sana y en la rota',
    estadoDe(sana(), REQ) !== estadoDe(rota(), REQ),
    `${estadoDe(sana(), REQ)} / ${estadoDe(rota(), REQ)}`
  );

  comprueba(
    'el estado consolidado es el mismo en los dos órdenes',
    estadoDe(sanaDelante, REQ) === estadoDe(sanaDetras, REQ),
    `${estadoDe(sanaDelante, REQ)} / ${estadoDe(sanaDetras, REQ)}`
  );

  // LA COMPROBACIÓN QUE IMPORTA: con la máquina sana delante, el score se
  // quedaba con el 100 de esa primera.
  comprueba(
    'y el score también, da igual qué máquina vaya primera',
    scoreDe(sanaDelante, REQ) === scoreDe(sanaDetras, REQ),
    `${scoreDe(sanaDelante, REQ)} / ${scoreDe(sanaDetras, REQ)}`
  );

  comprueba(
    'y el score no contradice al estado consolidado',
    (estadoDe(sanaDelante, REQ) === 'CUMPLE') ===
      (scoreDe(sanaDelante, REQ) === 100),
    `${estadoDe(sanaDelante, REQ)} con score ${scoreDe(sanaDelante, REQ)}`
  );

  // La reversión: con las dos máquinas sanas, el consolidado sí puntúa 100. Sin
  // esto, poner el score a 0 siempre pasaría las comprobaciones de arriba.
  const lasDosSanas = consolida(parque(2, () => sana()));

  comprueba(
    'con las dos máquinas conformes, el consolidado puntúa 100',
    scoreDe(lasDosSanas, REQ) === 100,
    `${estadoDe(lasDosSanas, REQ)} con score ${scoreDe(lasDosSanas, REQ)}`
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
