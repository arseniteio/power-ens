/**
 * Un hueco de medida no fabrica un incumplimiento (ni un cumplimiento).
 *
 *     ~/.bun/bin/bun run tests/hueco-de-medida.test.ts
 *
 * Mismo montaje que `evidence-judgment.test.ts`: TypeScript suelto con su propio
 * comprobador, sin `package.json` ni `tsconfig`. Hace falta un runtime que
 * ejecute TypeScript resolviendo imports sin extensión (`bun`, probado con
 * 1.3.14).
 *
 * Qué se prueba, y por qué existe este fichero: en el primer despliegue real
 * op.acc.1 salía «PARCIAL, 38 %, 4 no conformidades abiertas» sobre EV-05, EV-03,
 * EV-04 y EV-07 — las cuatro en NO_EVALUABLE. Ninguna era una no conformidad:
 * eran parámetros del cliente sin configurar. El agente ya calculaba lo correcto
 * (`NO_EVALUABLE`, sin número, con `requisitos_sin_medir`); el motor del plugin
 * lo ignoraba y recalculaba por su cuenta.
 *
 * Cada bloque mueve UN SOLO eje respecto de su hermano: si un caso cambia dos
 * cosas a la vez no dice cuál de las dos produjo el efecto. Y toda afirmación se
 * comprueba sobre la ESTRUCTURA (estado, ausencia de número, lista de no
 * conformidades), no sobre el texto de un mensaje, que también aparece en la
 * salida normal.
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
import { evaluateControlStatus } from '../dashboard/ens/core/evaluation/control/control-evaluator';
import type { ENSRequirementEvaluationResult } from '../dashboard/ens/core/evaluation/requirement';
import type {
  ENSComplianceResult,
  ENSComplianceStatus,
} from '../dashboard/ens/core/evaluation/types';
import {
  consolidateAgentComplianceResultByControl,
  consolidateENSStatuses,
} from '../dashboard/ens/core/compliance-state/consolidation';
import { buildComplianceState } from '../dashboard/ens/core/compliance-state/engine';
import { getEvidenceDefinitions } from '../dashboard/ens/core/evidence/registry';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
import { normalizeWazuhAlerts } from '../dashboard/ens/core/data-source/data-source-engine';
import type { ENSEvidenceResolved } from '../dashboard/ens/core/evidence/types';

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
const evidencia = (
  evidenciaId: string,
  status: ENSComplianceStatus,
  motivo?: string
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
    observations: [],
    resolvedAttributes: motivo ? { motivo } : undefined,
  };
};

const TODAS = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'];

// Todas en CUMPLE salvo las que se digan. Un único eje por caso.
const evidencias = (
  excepciones: Record<string, ENSComplianceStatus> = {},
  motivos: Record<string, string> = {}
): ENSEvidenceResolved[] =>
  TODAS.map(id =>
    evidencia(id, excepciones[id] || 'CUMPLE', motivos[id])
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

const CONFIGURACION_VACIA: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parametro => ({
    ...parametro,
    value: undefined,
  })),
};

const evalua = (
  resueltas: ENSEvidenceResolved[],
  nivel: ENSLevel = 'MEDIO',
  configuracion: ENSControlConfiguration | undefined = CONFIGURACION_COMPLETA
): ENSComplianceResult =>
  evaluateENSControl(CONTROL, configuracion, nivel, resueltas, undefined, []);

const estadoDe = (
  resultado: ENSComplianceResult,
  requisitoId: string
): ENSComplianceStatus | undefined =>
  resultado.requirements.find(item => item.id === requisitoId)?.status;

const requisitos = (
  ...estados: ENSComplianceStatus[]
): ENSRequirementEvaluationResult[] =>
  estados.map((status, posicion) => ({
    id: `req-${posicion}`,
    title: `req-${posicion}`,
    level: ['BAJO', 'MEDIO', 'ALTO'],
    status,
    applicable: status !== 'NO_APLICA',
    score: 0,
    observations: [],
    evidenceIds: [],
  }));

// ---------------------------------------------------------------------------
bloque('1 · requisito: el hueco de medida NO es un PARCIAL');

{
  // Eje único frente a 1b: EV-05 pasa de CUMPLE a NO_EVALUABLE. Nada más.
  const conforme = evalua(evidencias());
  const conHueco = evalua(evidencias({ 'EV-05': 'NO_EVALUABLE' }));

  comprueba(
    'todo conforme · op.acc.1.2 CUMPLE',
    estadoDe(conforme, 'op.acc.1.2') === 'CUMPLE',
    String(estadoDe(conforme, 'op.acc.1.2'))
  );

  comprueba(
    'EV-05 sin medir · op.acc.1.2 NO_EVALUABLE, no PARCIAL',
    estadoDe(conHueco, 'op.acc.1.2') === 'NO_EVALUABLE',
    String(estadoDe(conHueco, 'op.acc.1.2'))
  );

  comprueba(
    'EV-05 sin medir · no abre ninguna no conformidad',
    conHueco.nonConformities.length === 0,
    JSON.stringify(conHueco.nonConformities.map(nc => nc.id))
  );

  comprueba(
    'EV-05 sin medir · abre un hueco de medida que la nombra',
    conHueco.measurementGaps.some(
      hueco =>
        hueco.requirementId === 'op.acc.1.2' &&
        hueco.evidenceIds.includes('EV-05')
    ),
    JSON.stringify(conHueco.measurementGaps.map(hueco => hueco.id))
  );
}

{
  // Eje único frente al anterior: EV-05 pasa de NO_EVALUABLE a NO_CUMPLE. La
  // rama del incumplimiento demostrado tiene que seguir intacta.
  const conIncumplimiento = evalua(evidencias({ 'EV-05': 'NO_CUMPLE' }));

  comprueba(
    'EV-05 incumple · op.acc.1.2 PARCIAL (EV-06 conforma, EV-05 no)',
    estadoDe(conIncumplimiento, 'op.acc.1.2') === 'PARCIAL',
    String(estadoDe(conIncumplimiento, 'op.acc.1.2'))
  );

  comprueba(
    'EV-05 incumple · SÍ abre no conformidad, y cita EV-05',
    conIncumplimiento.nonConformities.some(
      nc => nc.requirementId === 'op.acc.1.2' && nc.evidenceId === 'EV-05'
    ),
    JSON.stringify(
      conIncumplimiento.nonConformities.map(nc => `${nc.id}:${nc.evidenceId}`)
    )
  );

  comprueba(
    'EV-05 incumple · el control conserva estado y número',
    conIncumplimiento.status === 'PARCIAL' &&
      typeof conIncumplimiento.score === 'number',
    `${conIncumplimiento.status}/${String(conIncumplimiento.score)}`
  );
}

{
  // Los dos a la vez: un incumplimiento demostrado y un hueco. El incumplimiento
  // manda, y el hueco no se cuela en la lista de no conformidades.
  const mezcla = evalua(
    evidencias({ 'EV-05': 'NO_CUMPLE', 'EV-04': 'NO_EVALUABLE' })
  );

  comprueba(
    'incumplimiento + hueco · la NC de EV-05 sigue ahí',
    mezcla.nonConformities.some(nc => nc.evidenceId === 'EV-05'),
    JSON.stringify(mezcla.nonConformities.map(nc => nc.evidenceId))
  );

  comprueba(
    'incumplimiento + hueco · ninguna NC cita EV-04, que solo está sin medir',
    !mezcla.nonConformities.some(nc => nc.evidenceId === 'EV-04'),
    JSON.stringify(mezcla.nonConformities.map(nc => nc.evidenceId))
  );

  comprueba(
    'incumplimiento + hueco · EV-04 aparece como hueco de op.acc.1.4',
    mezcla.measurementGaps.some(
      hueco =>
        hueco.requirementId === 'op.acc.1.4' &&
        hueco.evidenceIds.includes('EV-04')
    ),
    JSON.stringify(mezcla.measurementGaps.map(hueco => hueco.requirementId))
  );

  comprueba(
    'incumplimiento + hueco · ningún requisito sale a la vez como NC y como hueco',
    !mezcla.nonConformities.some(nc =>
      mezcla.measurementGaps.some(
        hueco => hueco.requirementId === nc.requirementId
      )
    ),
    ''
  );
}

{
  // El caso que de verdad pone a prueba a QUIÉN señala la tarjeta: un mismo
  // requisito con una evidencia que incumple y otra que no se ha podido medir.
  // op.acc.1.3 lo acreditan EV-01, EV-02, EV-03 y EV-05, en ese orden; con
  // EV-03 sin medir y EV-05 incumpliendo, la tarjeta señalaba a EV-03 —la
  // primera «que no está en verde»— es decir, justo a la que no se ha medido.
  //
  // Sin este caso, la guarda de `badEvidences` no la ejercita ningún fixture:
  // en todos los demás, el requisito que abre NC no tiene ninguna evidencia en
  // gris, así que la restricción da igual.
  const mismaFila = evalua(
    evidencias({ 'EV-03': 'NO_EVALUABLE', 'EV-05': 'NO_CUMPLE' })
  );

  const nc = mismaFila.nonConformities.find(
    item => item.requirementId === 'op.acc.1.3'
  );

  comprueba(
    'incumplidor y hueco en el MISMO requisito · op.acc.1.3 abre NC',
    Boolean(nc),
    JSON.stringify(mismaFila.nonConformities.map(item => item.requirementId))
  );

  comprueba(
    'incumplidor y hueco en el MISMO requisito · la NC señala a EV-05, no a EV-03',
    nc?.evidenceId === 'EV-05',
    String(nc?.evidenceId)
  );

  comprueba(
    'incumplidor y hueco en el MISMO requisito · la acción no manda a revisar EV-03',
    Boolean(nc) && !nc!.requiredAction.includes('EV-03'),
    String(nc?.requiredAction)
  );
}

// ---------------------------------------------------------------------------
bloque('2 · el escenario del primer despliegue real');

{
  // Exactamente lo que se vio en el servidor: EV-03, EV-04, EV-05 y EV-07 sin
  // poder medirse (parámetro del cliente sin configurar en el agente), el resto
  // conforme, y la configuración de la pantalla COMPLETA. Antes: PARCIAL 38 % y
  // NC-001..NC-004 sobre esas cuatro evidencias.
  const servidor = evalua(
    evidencias(
      {
        'EV-03': 'NO_EVALUABLE',
        'EV-04': 'NO_EVALUABLE',
        'EV-05': 'NO_EVALUABLE',
        'EV-07': 'NO_EVALUABLE',
      },
      {
        'EV-04': 'parametro del cliente sin configurar',
        'EV-05': 'parametro del cliente sin configurar',
        'EV-07': 'parametro del cliente sin configurar',
      }
    )
  );

  comprueba(
    'servidor real · el control es NO_EVALUABLE, no PARCIAL',
    servidor.status === 'NO_EVALUABLE',
    servidor.status
  );

  comprueba(
    'servidor real · no se publica número (no es 38 %, ni 0 %)',
    servidor.score === undefined,
    String(servidor.score)
  );

  comprueba(
    'servidor real · cero no conformidades abiertas',
    servidor.nonConformities.length === 0,
    JSON.stringify(servidor.nonConformities.map(nc => nc.id))
  );

  comprueba(
    'servidor real · ninguna de las cuatro evidencias en gris abre NC',
    !servidor.nonConformities.some(nc =>
      ['EV-03', 'EV-04', 'EV-05', 'EV-07'].includes(nc.evidenceId)
    ),
    JSON.stringify(servidor.nonConformities.map(nc => nc.evidenceId))
  );

  comprueba(
    'servidor real · los cuatro huecos SÍ están, con su nombre propio PM-',
    ['EV-03', 'EV-04', 'EV-05', 'EV-07'].every(evidenciaId =>
      servidor.measurementGaps.some(hueco =>
        hueco.evidenceIds.includes(evidenciaId)
      )
    ) && servidor.measurementGaps.every(hueco => hueco.id.startsWith('PM-')),
    JSON.stringify(servidor.measurementGaps.map(hueco => hueco.id))
  );

  comprueba(
    'servidor real · el motivo del agente llega a la tarjeta del hueco',
    servidor.measurementGaps.some(hueco =>
      hueco.finding.includes('parametro del cliente sin configurar')
    ),
    JSON.stringify(servidor.measurementGaps.map(hueco => hueco.finding))
  );

  comprueba(
    'servidor real · se dice cuántos requisitos se han medido y de cuántos',
    servidor.applicableRequirements === 8 &&
      servidor.measuredRequirements === 1 &&
      servidor.unmeasuredRequirements.length === 7,
    `${servidor.applicableRequirements}/${servidor.measuredRequirements}/${servidor.unmeasuredRequirements.length}`
  );
}

// ---------------------------------------------------------------------------
bloque('3 · estado y denominador del control');

{
  const soloConformes = evaluateControlStatus(requisitos('CUMPLE', 'CUMPLE'));

  comprueba(
    'todo medido y conforme · CUMPLE al 100',
    soloConformes.status === 'CUMPLE' && soloConformes.score === 100,
    `${soloConformes.status}/${String(soloConformes.score)}`
  );

  // Eje único frente al anterior: el segundo requisito pasa a NO_EVALUABLE.
  const conHueco = evaluateControlStatus(requisitos('CUMPLE', 'NO_EVALUABLE'));

  comprueba(
    'conforme + sin medir · NO_EVALUABLE, no PARCIAL',
    conHueco.status === 'NO_EVALUABLE',
    conHueco.status
  );

  comprueba(
    'conforme + sin medir · sin número (ni el 50 de antes ni el 100 de lo medido)',
    conHueco.score === undefined,
    String(conHueco.score)
  );

  comprueba(
    'conforme + sin medir · nombra el requisito que falta por medir',
    conHueco.unmeasuredRequirements.length === 1 &&
      conHueco.unmeasuredRequirements[0] === 'req-1',
    JSON.stringify(conHueco.unmeasuredRequirements)
  );

  // Eje único frente al anterior: el segundo requisito pasa a NO_CUMPLE.
  const conIncumplimiento = evaluateControlStatus(
    requisitos('CUMPLE', 'NO_CUMPLE')
  );

  comprueba(
    'conforme + incumplidor · PARCIAL al 50, como siempre',
    conIncumplimiento.status === 'PARCIAL' && conIncumplimiento.score === 50,
    `${conIncumplimiento.status}/${String(conIncumplimiento.score)}`
  );

  const soloIncumplidor = evaluateControlStatus(
    requisitos('NO_CUMPLE', 'NO_EVALUABLE')
  );

  comprueba(
    'incumplidor + sin medir · sigue NO_CUMPLE (el hueco no lo ablanda)',
    soloIncumplidor.status === 'NO_CUMPLE' && soloIncumplidor.score === 0,
    `${soloIncumplidor.status}/${String(soloIncumplidor.score)}`
  );

  // El denominador. Con tres requisitos, uno conforme, uno incumplidor y uno sin
  // medir: 50 sobre lo medido, no 33 sobre el total. Con el denominador completo
  // el requisito sin medir restaría exactamente igual que el incumplidor.
  const denominador = evaluateControlStatus(
    requisitos('CUMPLE', 'NO_CUMPLE', 'NO_EVALUABLE')
  );

  comprueba(
    'el denominador son los medidos · 50, no 33',
    denominador.score === 50,
    String(denominador.score)
  );

  comprueba(
    'el denominador son los medidos · lo dice en el resultado (3 aplicables, 2 medidos)',
    denominador.applicableRequirements === 3 &&
      denominador.measuredRequirements === 2,
    `${denominador.applicableRequirements}/${denominador.measuredRequirements}`
  );

  const noAplica = evaluateControlStatus(requisitos('NO_APLICA', 'NO_APLICA'));

  comprueba(
    'nada aplicable · NO_APLICA y SIN número (no un 0 en rojo)',
    noAplica.status === 'NO_APLICA' && noAplica.score === undefined,
    `${noAplica.status}/${String(noAplica.score)}`
  );
}

// ---------------------------------------------------------------------------
bloque('4 · consolidación entre agentes');

{
  comprueba(
    'un agente conforme y otro sin medir · NO_EVALUABLE, no PARCIAL',
    consolidateENSStatuses(['CUMPLE', 'NO_EVALUABLE']) === 'NO_EVALUABLE',
    consolidateENSStatuses(['CUMPLE', 'NO_EVALUABLE'])
  );

  comprueba(
    'un agente incumplidor y otro sin medir · NO_CUMPLE (el hueco no lo ablanda)',
    consolidateENSStatuses(['NO_CUMPLE', 'NO_EVALUABLE']) === 'NO_CUMPLE',
    consolidateENSStatuses(['NO_CUMPLE', 'NO_EVALUABLE'])
  );

  comprueba(
    'un agente conforme y otro parcial · PARCIAL, como siempre',
    consolidateENSStatuses(['CUMPLE', 'PARCIAL']) === 'PARCIAL',
    consolidateENSStatuses(['CUMPLE', 'PARCIAL'])
  );

  comprueba(
    'todos NO_APLICA · NO_APLICA',
    consolidateENSStatuses(['NO_APLICA', 'NO_APLICA']) === 'NO_APLICA',
    consolidateENSStatuses(['NO_APLICA', 'NO_APLICA'])
  );

  // Consolidado real: un agente con un incumplimiento demostrado y otro del que
  // no se ha podido medir nada. El número consolidado sale SOLO del que trae
  // número: promediar con un 0 inventado por el que no midió es el mismo error
  // una capa más arriba.
  const conNumero = evalua(evidencias({ 'EV-05': 'NO_CUMPLE' }));
  const sinNumero = evalua(
    evidencias({
      'EV-01': 'NO_EVALUABLE',
      'EV-02': 'NO_EVALUABLE',
      'EV-03': 'NO_EVALUABLE',
      'EV-04': 'NO_EVALUABLE',
      'EV-05': 'NO_EVALUABLE',
      'EV-06': 'NO_EVALUABLE',
      'EV-07': 'NO_EVALUABLE',
      'EV-08': 'NO_EVALUABLE',
    })
  );

  comprueba(
    'el agente sin datos no trae número',
    sinNumero.score === undefined && sinNumero.status === 'NO_EVALUABLE',
    `${sinNumero.status}/${String(sinNumero.score)}`
  );

  const consolidado = consolidateAgentComplianceResultByControl(
    [
      {
        agentId: '001',
        agentName: 'CLIENTE-01',
        results: [conNumero],
        summary: undefined as never,
      },
      {
        agentId: '002',
        agentName: 'CLIENTE-02',
        results: [sinNumero],
        summary: undefined as never,
      },
    ],
    'op.acc.1'
  );

  comprueba(
    'consolidado · el número es el del agente que sí midió',
    consolidado?.score === conNumero.score,
    `${String(consolidado?.score)} vs ${String(conNumero.score)}`
  );

  comprueba(
    'consolidado · los huecos del segundo agente viajan con su etiqueta',
    (consolidado?.measurementGaps || []).some(hueco =>
      hueco.id.startsWith('002:PM-')
    ),
    JSON.stringify((consolidado?.measurementGaps || []).map(hueco => hueco.id))
  );

  comprueba(
    'consolidado · aplicables y medidos se suman entre agentes',
    consolidado?.applicableRequirements ===
      conNumero.applicableRequirements + sinNumero.applicableRequirements &&
      consolidado?.measuredRequirements ===
        conNumero.measuredRequirements + sinNumero.measuredRequirements,
    `${String(consolidado?.applicableRequirements)}/${String(
      consolidado?.measuredRequirements
    )}`
  );
}

// ---------------------------------------------------------------------------
bloque('5 · índice global de la pantalla principal');

{
  const conforme = evalua(evidencias(), 'BAJO');
  const sinMedir = evalua(
    evidencias({
      'EV-01': 'NO_EVALUABLE',
      'EV-02': 'NO_EVALUABLE',
      'EV-03': 'NO_EVALUABLE',
      'EV-04': 'NO_EVALUABLE',
      'EV-05': 'NO_EVALUABLE',
      'EV-06': 'NO_EVALUABLE',
      'EV-07': 'NO_EVALUABLE',
      'EV-08': 'NO_EVALUABLE',
    }),
    'BAJO'
  );

  // Se fuerza un control conforme de verdad: op.acc.1 no puede alcanzarlo hoy
  // porque op.acc.1.5 y op.acc.1.r1.1 no tienen ninguna evidencia declarada en
  // el catálogo (ver el hueco PM de causa CATALOG). Lo que se prueba aquí es el
  // promedio, no el catálogo, así que el control conforme se construye a mano.
  const controlConforme: ENSComplianceResult = {
    ...conforme,
    status: 'CUMPLE',
    score: 100,
  };

  const estado = buildComplianceState([controlConforme, sinMedir]);

  comprueba(
    'índice global · promedia solo sobre lo medido (100, no 50)',
    estado.controlSummary.scoreAverage === 100,
    String(estado.controlSummary.scoreAverage)
  );

  comprueba(
    'índice global · dice sobre cuántos controles se ha calculado',
    estado.controlSummary.measured === 1 &&
      estado.controlSummary.totalControls === 2,
    `${estado.controlSummary.measured}/${estado.controlSummary.totalControls}`
  );

  const nadaMedido = buildComplianceState([sinMedir]);

  comprueba(
    'índice global · sin nada medido, la base es 0 y la pantalla no puede pintar un porcentaje',
    nadaMedido.controlSummary.measured === 0,
    String(nadaMedido.controlSummary.measured)
  );
}

// ---------------------------------------------------------------------------
bloque('6 · las tres causas de un hueco tienen acción distinta');

{
  const conConfiguracion = evalua(evidencias(), 'MEDIO', CONFIGURACION_COMPLETA);

  // Causa CATALOG: op.acc.1.5 y op.acc.1.r1.1 no declaran ninguna evidencia.
  const porCatalogo = conConfiguracion.measurementGaps.filter(hueco =>
    hueco.finding.includes('no tiene ninguna evidencia declarada')
  );

  comprueba(
    'causa catálogo · se nombra tal cual, y la acción es declararlas',
    porCatalogo.length === 2 &&
      porCatalogo.every(hueco =>
        hueco.requiredAction.startsWith('Declarar en el catálogo')
      ),
    JSON.stringify(porCatalogo.map(hueco => hueco.requirementId))
  );

  // Causa CONFIGURATION: las evidencias llegan, faltan parámetros obligatorios.
  const sinConfigurar = evalua(evidencias(), 'MEDIO', CONFIGURACION_VACIA);

  const porConfiguracion = sinConfigurar.measurementGaps.filter(
    hueco => hueco.evidenceId === 'CONFIG'
  );

  comprueba(
    'causa configuración · el ancla es CONFIG, nunca una evidencia en verde',
    porConfiguracion.length > 0 &&
      porConfiguracion.every(hueco => hueco.evidenceIds.length === 0),
    JSON.stringify(porConfiguracion.map(hueco => hueco.requirementId))
  );

  comprueba(
    'causa configuración · la acción nombra el parámetro concreto',
    porConfiguracion.every(
      hueco =>
        hueco.parameterIds.length > 0 &&
        hueco.requiredAction.includes(hueco.parameterIds[0])
    ),
    JSON.stringify(porConfiguracion.map(hueco => hueco.requiredAction))
  );

  // Causa EVIDENCE: la configuración está completa y falta el dato del agente.
  const porEvidencia = evalua(
    evidencias({ 'EV-04': 'NO_EVALUABLE' })
  ).measurementGaps.filter(hueco => hueco.evidenceIds.includes('EV-04'));

  comprueba(
    'causa evidencia · la acción apunta al agente, no a "revisar las evidencias"',
    porEvidencia.length > 0 &&
      porEvidencia.every(
        hueco =>
          hueco.requiredAction.includes('el agente emite') &&
          !hueco.requiredAction.includes('Revisar')
      ),
    JSON.stringify(porEvidencia.map(hueco => hueco.requiredAction))
  );

  comprueba(
    'ningún hueco se presenta como incumplimiento',
    [...conConfiguracion.measurementGaps, ...sinConfigurar.measurementGaps].every(
      hueco => hueco.impact.includes('No es un incumplimiento')
    ),
    ''
  );
}

// ---------------------------------------------------------------------------
bloque('7 · pipeline completo desde los eventos del agente');

{
  // Sin fixtures de estado: se parte de alertas de Wazuh con la línea ndjson que
  // emite `ens_opacc1_score.py`, y se recorre normalizador -> motor de
  // evidencias -> evaluación. Es el camino que hace la pantalla.
  const alerta = (data: Record<string, unknown>, indice: number) => ({
    _id: `alerta-${indice}`,
    _source: {
      '@timestamp': '2026-07-28T23:30:00Z',
      agent: { id: '001', name: 'CLIENTE-01' },
      rule: { id: '106801', description: 'ENSFacil op.acc.1' },
      location: 'ensfacil',
      data,
    },
  });

  const estadoEvidencia = (
    evidenceId: string,
    estado: string,
    motivo?: string
  ) => ({
    ensfacil: 'op.acc.1',
    event: 'evidence_state',
    ts: '2026-07-28T23:30:00Z',
    host: 'CLIENTE-01',
    emisor: 'score',
    evidence_id: evidenceId,
    requisito: 'op.acc.1.2',
    estado,
    nivel: 'BAJO',
    ...(motivo ? { motivo } : {}),
  });

  const eventos = normalizeWazuhAlerts(
    [
      estadoEvidencia('EV-01', 'CUMPLE'),
      estadoEvidencia('EV-02', 'CUMPLE'),
      estadoEvidencia('EV-04', 'NO_EVALUABLE', 'P-05 no configurado'),
      estadoEvidencia('EV-05', 'NO_EVALUABLE', 'P-03 no configurado'),
      estadoEvidencia('EV-06', 'CUMPLE'),
      estadoEvidencia('EV-07', 'NO_EVALUABLE', 'P-07 no configurado'),
      estadoEvidencia('EV-08', 'CUMPLE'),
    ].map(alerta)
  );

  const resueltas = resolveEvidenceForControl(
    'op.acc.1',
    eventos,
    '001',
    'MEDIO',
    CONFIGURACION_COMPLETA,
    new Date('2026-07-29T00:00:00Z')
  );

  const resultado = evaluateENSControl(
    CONTROL,
    CONFIGURACION_COMPLETA,
    'MEDIO',
    resueltas,
    undefined,
    eventos
  );

  comprueba(
    'pipeline · las tres evidencias del agente llegan en NO_EVALUABLE',
    ['EV-04', 'EV-05', 'EV-07'].every(
      id => resueltas.find(item => item.id === id)?.status === 'NO_EVALUABLE'
    ),
    JSON.stringify(resueltas.map(item => `${item.id}:${item.status}`))
  );

  comprueba(
    'pipeline · el control sale NO_EVALUABLE y sin número',
    resultado.status === 'NO_EVALUABLE' && resultado.score === undefined,
    `${resultado.status}/${String(resultado.score)}`
  );

  comprueba(
    'pipeline · cero no conformidades',
    resultado.nonConformities.length === 0,
    JSON.stringify(resultado.nonConformities.map(nc => nc.id))
  );

  comprueba(
    'pipeline · el motivo del agente («P-07 no configurado») llega al hueco',
    resultado.measurementGaps.some(hueco =>
      hueco.finding.includes('P-07 no configurado')
    ),
    JSON.stringify(resultado.measurementGaps.map(hueco => hueco.finding))
  );
}

// ---------------------------------------------------------------------------

console.log(
  fallos.length
    ? `\n${fallos.length} comprobaciones FALLAN:\n  ${fallos.join('\n  ')}`
    : '\nTodas las comprobaciones pasan.'
);

process.exit(fallos.length ? 1 : 0);
