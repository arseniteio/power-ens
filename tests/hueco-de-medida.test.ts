/**
 * Lo que no se puede demostrar NO CUMPLE — y se sigue distinguiendo de lo que se
 * ha medido y falla.
 *
 *     ~/.bun/bin/bun run tests/hueco-de-medida.test.ts
 *
 * Mismo montaje que `evidence-judgment.test.ts`: TypeScript suelto con su propio
 * comprobador, sin `package.json` ni `tsconfig`. Hace falta un runtime que
 * ejecute TypeScript resolviendo imports sin extensión (`bun`, probado con
 * 1.3.14).
 *
 * HISTORIA DE ESTE FICHERO, que es lo que le da valor. Nació el 31/07 (346e56b)
 * fijando el criterio contrario: un hueco de medida no fabricaba una no
 * conformidad y el control salía `NO_EVALUABLE` sin número. El 04/08 el
 * responsable lo revirtió en parte, y ésta es la convención vigente:
 *
 *     **Si algo no está configurado o no se puede demostrar, NO CUMPLE.**
 *
 * Es la convención de auditoría: la carga de la prueba es del auditado. Un
 * auditor no escribe «no evaluable», escribe «no evidenciado» y lo cuenta en
 * contra. En estos controles es literal — `op.acc.2.2` exige que los derechos de
 * acceso sigan la política interna «y las decisiones del responsable del
 * recurso»: con la política vacía, esas decisiones no se han tomado.
 *
 * El fichero NO se ha borrado ni reescrito desde cero a propósito: su valor es
 * fijar el comportamiento, y las preguntas que se hacía siguen siendo las
 * correctas, sólo que con la respuesta contraria. Lo que se conserva ENTERO es
 * la mitad que el 04/08 no revirtió: que el motivo y la acción de un
 * incumplimiento no evidenciado son distintos de los de uno medido.
 *
 * Cada bloque mueve UN SOLO eje respecto de su hermano: si un caso cambia dos
 * cosas a la vez no dice cuál de las dos produjo el efecto. Y toda afirmación se
 * comprueba sobre la ESTRUCTURA (estado, número, `origin`, `cause`), no sobre el
 * texto de un mensaje, que también aparece en la salida normal.
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
  ENSLevel,
} from '../dashboard/ens/configuration/types';
import { evaluateENSControl } from '../dashboard/ens/core/evaluation/evaluation-engine';
import { evaluateControlStatus } from '../dashboard/ens/core/evaluation/control/control-evaluator';
import type { ENSRequirementEvaluationResult } from '../dashboard/ens/core/evaluation/requirement';
import type {
  ENSComplianceResult,
  ENSComplianceStatus,
  ENSGapCause,
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
  motivo?: string,
  gapCause: ENSGapCause = 'EVIDENCE'
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
    gapCause: status === 'NO_EVALUABLE' ? gapCause : undefined,
  };
};

const TODAS = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'];

// Todas en CUMPLE salvo las que se digan. Un único eje por caso.
const evidencias = (
  excepciones: Record<string, ENSComplianceStatus> = {},
  motivos: Record<string, string> = {},
  causas: Record<string, ENSGapCause> = {}
): ENSEvidenceResolved[] =>
  TODAS.map(id =>
    evidencia(id, excepciones[id] || 'CUMPLE', motivos[id], causas[id])
  );

const TODO_SIN_MEDIR = Object.fromEntries(
  TODAS.map(id => [id, 'NO_EVALUABLE' as ENSComplianceStatus])
);

// El valor de referencia de cada parámetro es el `example` que declara su propia
// ficha, NO un valor inventado por tipo. Los parámetros de tipo `table` y las
// listas con columnas rechazan cualquier cadena suelta, así que un fixture "por
// tipo" dejaba la configuración INVÁLIDA y medía un escenario que no existe: el
// control saldría bloqueado por `NC-CFG` en todos los casos y la prueba estaría
// afirmando cosas sobre otro estado del mundo.
const CONFIGURACION_COMPLETA: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parametro => ({
    ...parametro,
    value: parametro.example,
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

const demostrado = (
  resultado: ENSComplianceResult,
  requisitoId: string
): boolean | undefined =>
  resultado.requirements.find(item => item.id === requisitoId)?.evidenced;

const tarjeta = (resultado: ENSComplianceResult, requisitoId: string) =>
  resultado.nonConformities.find(item => item.requirementId === requisitoId);

const medidas = (resultado: ENSComplianceResult) =>
  resultado.nonConformities.filter(item => item.origin === 'MEDIDA');

const noEvidenciadas = (resultado: ENSComplianceResult) =>
  resultado.nonConformities.filter(item => item.origin === 'NO_EVIDENCIADA');

// `evidenced` viaja siempre: es lo único que separa un NO_CUMPLE medido de uno
// no evidenciado, porque el veredicto ya no los distingue.
const requisitos = (
  ...estados: ENSComplianceStatus[]
): ENSRequirementEvaluationResult[] =>
  estados.map((status, posicion) => ({
    id: `req-${posicion}`,
    title: `req-${posicion}`,
    level: ['BAJO', 'MEDIO', 'ALTO'],
    status,
    applicable: status !== 'NO_APLICA',
    evidenced: status !== 'NO_EVALUABLE' && status !== 'NO_APLICA',
    score: 0,
    observations: [],
    evidenceIds: [],
  }));

// ---------------------------------------------------------------------------
bloque('1 · requisito: lo no demostrado NO CUMPLE, y se sabe que no se midió');

{
  // Eje único frente al bloque siguiente: EV-05 pasa de CUMPLE a NO_EVALUABLE.
  const conforme = evalua(evidencias());
  const sinDemostrar = evalua(evidencias({ 'EV-05': 'NO_EVALUABLE' }));

  comprueba(
    'todo conforme · op.acc.1.2 CUMPLE',
    estadoDe(conforme, 'op.acc.1.2') === 'CUMPLE',
    String(estadoDe(conforme, 'op.acc.1.2'))
  );

  comprueba(
    'EV-05 sin demostrar · op.acc.1.2 NO_CUMPLE, ya no NO_EVALUABLE',
    estadoDe(sinDemostrar, 'op.acc.1.2') === 'NO_CUMPLE',
    String(estadoDe(sinDemostrar, 'op.acc.1.2'))
  );

  comprueba(
    'EV-05 sin demostrar · el requisito declara que NO se ha medido',
    demostrado(sinDemostrar, 'op.acc.1.2') === false &&
      demostrado(conforme, 'op.acc.1.2') === true,
    `${String(demostrado(sinDemostrar, 'op.acc.1.2'))}/${String(
      demostrado(conforme, 'op.acc.1.2')
    )}`
  );

  comprueba(
    'EV-05 sin demostrar · SÍ abre no conformidad, y la nombra',
    tarjeta(sinDemostrar, 'op.acc.1.2')?.evidenceIds.includes('EV-05') === true,
    JSON.stringify(
      sinDemostrar.nonConformities.map(nc => `${nc.id}:${nc.requirementId}`)
    )
  );

  comprueba(
    'EV-05 sin demostrar · la tarjeta se marca NO_EVIDENCIADA, no MEDIDA',
    tarjeta(sinDemostrar, 'op.acc.1.2')?.origin === 'NO_EVIDENCIADA',
    String(tarjeta(sinDemostrar, 'op.acc.1.2')?.origin)
  );
}

{
  // Eje único frente al anterior: EV-05 pasa de NO_EVALUABLE a NO_CUMPLE. El
  // veredicto del requisito es EL MISMO; lo que cambia es el diagnóstico.
  const conIncumplimiento = evalua(evidencias({ 'EV-05': 'NO_CUMPLE' }));

  comprueba(
    'EV-05 incumple · op.acc.1.2 PARCIAL (EV-06 conforma, EV-05 no)',
    estadoDe(conIncumplimiento, 'op.acc.1.2') === 'PARCIAL',
    String(estadoDe(conIncumplimiento, 'op.acc.1.2'))
  );

  comprueba(
    'EV-05 incumple · la tarjeta se marca MEDIDA, y cita EV-05',
    tarjeta(conIncumplimiento, 'op.acc.1.2')?.origin === 'MEDIDA' &&
      tarjeta(conIncumplimiento, 'op.acc.1.2')?.evidenceId === 'EV-05',
    `${String(tarjeta(conIncumplimiento, 'op.acc.1.2')?.origin)}/${String(
      tarjeta(conIncumplimiento, 'op.acc.1.2')?.evidenceId
    )}`
  );

  comprueba(
    'EV-05 incumple · una MEDIDA no lleva causa de hueco',
    tarjeta(conIncumplimiento, 'op.acc.1.2')?.cause === undefined,
    String(tarjeta(conIncumplimiento, 'op.acc.1.2')?.cause)
  );

  // La comprobación que sostiene todo el diseño: mismo veredicto, distinta
  // acción. Si esto se fundiera, el cambio habría perdido lo que conserva.
  const sinDemostrar = evalua(evidencias({ 'EV-05': 'NO_EVALUABLE' }));

  comprueba(
    'medido y no evidenciado: misma lista, pero acción distinta',
    tarjeta(sinDemostrar, 'op.acc.1.2')!.requiredAction !==
      tarjeta(conIncumplimiento, 'op.acc.1.2')!.requiredAction,
    `${tarjeta(sinDemostrar, 'op.acc.1.2')!.requiredAction} vs ${
      tarjeta(conIncumplimiento, 'op.acc.1.2')!.requiredAction
    }`
  );
}

{
  // Los dos a la vez: un incumplimiento demostrado y uno sin demostrar. Los dos
  // cuentan, en la misma lista, pero cada uno con su origen.
  const mezcla = evalua(
    evidencias({ 'EV-05': 'NO_CUMPLE', 'EV-04': 'NO_EVALUABLE' })
  );

  comprueba(
    'incumplimiento + hueco · la tarjeta de EV-05 sigue siendo MEDIDA',
    tarjeta(mezcla, 'op.acc.1.2')?.origin === 'MEDIDA',
    String(tarjeta(mezcla, 'op.acc.1.2')?.origin)
  );

  comprueba(
    'incumplimiento + hueco · op.acc.1.4 (EV-04) sale NO_EVIDENCIADA',
    tarjeta(mezcla, 'op.acc.1.4')?.origin === 'NO_EVIDENCIADA' &&
      tarjeta(mezcla, 'op.acc.1.4')?.evidenceIds.includes('EV-04') === true,
    JSON.stringify(
      mezcla.nonConformities.map(nc => `${nc.requirementId}:${nc.origin}`)
    )
  );

  comprueba(
    'incumplimiento + hueco · ningún requisito abre DOS tarjetas',
    new Set(mezcla.nonConformities.map(nc => nc.requirementId)).size ===
      mezcla.nonConformities.length,
    JSON.stringify(mezcla.nonConformities.map(nc => nc.requirementId))
  );

  comprueba(
    'incumplimiento + hueco · el total es la suma de las dos clases',
    medidas(mezcla).length + noEvidenciadas(mezcla).length ===
      mezcla.nonConformities.length,
    `${medidas(mezcla).length}+${noEvidenciadas(mezcla).length}=${
      mezcla.nonConformities.length
    }`
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
  // en todos los demás, el requisito que abre una tarjeta MEDIDA no tiene
  // ninguna evidencia en gris, así que la restricción da igual.
  const mismaFila = evalua(
    evidencias({ 'EV-03': 'NO_EVALUABLE', 'EV-05': 'NO_CUMPLE' })
  );

  const nc = tarjeta(mismaFila, 'op.acc.1.3');

  comprueba(
    'incumplidor y hueco en el MISMO requisito · la tarjeta es MEDIDA',
    nc?.origin === 'MEDIDA',
    String(nc?.origin)
  );

  comprueba(
    'incumplidor y hueco en el MISMO requisito · señala a EV-05, no a EV-03',
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
bloque('2 · el escenario del primer despliegue real, con el criterio nuevo');

{
  // Exactamente lo que se vio en el servidor: EV-03, EV-04, EV-05 y EV-07 sin
  // poder medirse (parámetro del cliente sin configurar en el agente), el resto
  // conforme, y la configuración de la pantalla COMPLETA.
  //
  //   31/07 → NO_EVALUABLE, sin número, 0 no conformidades, 7 tarjetas PM
  //   04/08 → veredicto con número, y esas 7 son no conformidades
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
    'servidor real · el control ya no sale NO_EVALUABLE',
    servidor.status !== 'NO_EVALUABLE',
    servidor.status
  );

  comprueba(
    'servidor real · ahora SÍ se publica número',
    typeof servidor.score === 'number',
    String(servidor.score)
  );

  comprueba(
    'servidor real · el número sale sobre los APLICABLES (1 de 8 conforma → 13)',
    servidor.score === 13,
    `${String(servidor.score)} con ${servidor.applicableRequirements} aplicables`
  );

  comprueba(
    'servidor real · las cuatro evidencias en gris abren no conformidad',
    ['EV-03', 'EV-04', 'EV-05', 'EV-07'].every(evidenciaId =>
      servidor.nonConformities.some(nc => nc.evidenceIds.includes(evidenciaId))
    ),
    JSON.stringify(
      servidor.nonConformities.map(nc => `${nc.id}:${nc.evidenceIds.join('+')}`)
    )
  );

  comprueba(
    'servidor real · todas marcadas NO_EVIDENCIADA, ninguna como medida',
    medidas(servidor).length === 0 && noEvidenciadas(servidor).length > 0,
    `${medidas(servidor).length} medidas / ${
      noEvidenciadas(servidor).length
    } no evidenciadas`
  );

  comprueba(
    'servidor real · el motivo del agente llega a la tarjeta',
    servidor.nonConformities.some(nc =>
      nc.finding.includes('parametro del cliente sin configurar')
    ),
    JSON.stringify(servidor.nonConformities.map(nc => nc.finding))
  );

  comprueba(
    'servidor real · se sigue diciendo cuántos requisitos se han demostrado',
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
    'todo demostrado y conforme · CUMPLE al 100',
    soloConformes.status === 'CUMPLE' && soloConformes.score === 100,
    `${soloConformes.status}/${String(soloConformes.score)}`
  );

  // Eje único frente al anterior: el segundo requisito pasa a no demostrado.
  const sinDemostrar = evaluateControlStatus(
    requisitos('CUMPLE', 'NO_EVALUABLE')
  );

  comprueba(
    'conforme + sin demostrar · PARCIAL, ya no NO_EVALUABLE',
    sinDemostrar.status === 'PARCIAL',
    sinDemostrar.status
  );

  comprueba(
    'conforme + sin demostrar · CON número, y es 50',
    sinDemostrar.score === 50,
    String(sinDemostrar.score)
  );

  comprueba(
    'conforme + sin demostrar · sigue nombrando el requisito que no se midió',
    sinDemostrar.unmeasuredRequirements.length === 1 &&
      sinDemostrar.unmeasuredRequirements[0] === 'req-1',
    JSON.stringify(sinDemostrar.unmeasuredRequirements)
  );

  // Eje único frente al anterior: el segundo requisito pasa a NO_CUMPLE medido.
  const conIncumplimiento = evaluateControlStatus(
    requisitos('CUMPLE', 'NO_CUMPLE')
  );

  comprueba(
    'conforme + incumplidor medido · PARCIAL al 50',
    conIncumplimiento.status === 'PARCIAL' && conIncumplimiento.score === 50,
    `${conIncumplimiento.status}/${String(conIncumplimiento.score)}`
  );

  // Ésta es la afirmación central del cambio: el veredicto y el número son
  // idénticos, y lo único que separa los dos escenarios es `measuredRequirements`.
  comprueba(
    'demostrado y no demostrado pesan IGUAL en el número',
    sinDemostrar.score === conIncumplimiento.score &&
      sinDemostrar.status === conIncumplimiento.status,
    `${String(sinDemostrar.score)} vs ${String(conIncumplimiento.score)}`
  );

  comprueba(
    'y aun así se distinguen: 1 demostrado frente a 2',
    sinDemostrar.measuredRequirements === 1 &&
      conIncumplimiento.measuredRequirements === 2,
    `${sinDemostrar.measuredRequirements} vs ${conIncumplimiento.measuredRequirements}`
  );

  const todoSinDemostrar = evaluateControlStatus(
    requisitos('NO_EVALUABLE', 'NO_EVALUABLE')
  );

  comprueba(
    'nada demostrado · NO_CUMPLE al 0, no un gris sin número',
    todoSinDemostrar.status === 'NO_CUMPLE' && todoSinDemostrar.score === 0,
    `${todoSinDemostrar.status}/${String(todoSinDemostrar.score)}`
  );

  // El denominador. Con tres requisitos, uno conforme, uno incumplidor y uno sin
  // demostrar: 33 sobre los aplicables, no 50 sobre los medidos. Con el
  // denominador de lo medido, cuanto menos se mide más sube el porcentaje.
  const denominador = evaluateControlStatus(
    requisitos('CUMPLE', 'NO_CUMPLE', 'NO_EVALUABLE')
  );

  comprueba(
    'el denominador son los APLICABLES · 33, no 50',
    denominador.score === 33,
    String(denominador.score)
  );

  comprueba(
    'el denominador son los aplicables · lo dice en el resultado (3 aplicables, 2 demostrados)',
    denominador.applicableRequirements === 3 &&
      denominador.measuredRequirements === 2,
    `${denominador.applicableRequirements}/${denominador.measuredRequirements}`
  );

  // `evidenced` manda sobre la ETIQUETA que traiga el requisito. En producción
  // `evaluateRequirement` ya convierte el estado, así que esta guarda no se
  // ejercita sola: sin este caso, se puede borrar entera y no falla nada — lo
  // dijo la verificación por reversión. Y no es teórica: es lo que hace que el
  // evaluador de control dé la misma respuesta si alguien le pasa la MEDIDA en
  // crudo en vez del veredicto, que es justo el error que se cometería al
  // añadir un camino de evaluación nuevo.
  const etiquetaMentirosa = evaluateControlStatus([
    {
      id: 'req-0',
      title: 'req-0',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      // Dice CUMPLE, pero declara que no se ha demostrado. Manda lo segundo.
      status: 'CUMPLE',
      applicable: true,
      evidenced: false,
      score: 0,
      observations: [],
      evidenceIds: [],
    },
    ...requisitos('CUMPLE'),
  ]);

  comprueba(
    'un «CUMPLE» que declara no estar demostrado NO cuenta como conforme',
    etiquetaMentirosa.status === 'PARCIAL' &&
      etiquetaMentirosa.score === 50 &&
      etiquetaMentirosa.measuredRequirements === 1,
    `${etiquetaMentirosa.status}/${String(etiquetaMentirosa.score)}/${
      etiquetaMentirosa.measuredRequirements
    }`
  );

  const noAplica = evaluateControlStatus(requisitos('NO_APLICA', 'NO_APLICA'));

  comprueba(
    'nada aplicable · NO_APLICA y SIN número (no un 0 en rojo)',
    noAplica.status === 'NO_APLICA' && noAplica.score === undefined,
    `${noAplica.status}/${String(noAplica.score)}`
  );

  // Lo intocable: un refuerzo por encima del nivel activo no arrastra. Con dos
  // conformes y un refuerzo fuera de nivel, el control llega al 100.
  const conRefuerzoFuera = evaluateControlStatus(
    requisitos('CUMPLE', 'CUMPLE', 'NO_APLICA')
  );

  comprueba(
    'un refuerzo NO_APLICA no impide el 100 %',
    conRefuerzoFuera.status === 'CUMPLE' &&
      conRefuerzoFuera.score === 100 &&
      conRefuerzoFuera.applicableRequirements === 2,
    `${conRefuerzoFuera.status}/${String(conRefuerzoFuera.score)}/${
      conRefuerzoFuera.applicableRequirements
    }`
  );
}

// ---------------------------------------------------------------------------
bloque('4 · consolidación entre agentes');

{
  // `consolidateENSStatuses` no cambia: sigue recibiendo veredictos, y desde el
  // 04/08 los de control y requisito ya no incluyen NO_EVALUABLE. Sus ramas de
  // gris las ejercitan ahora sólo las EVIDENCIAS, que conservan ese estado como
  // observación en crudo.
  comprueba(
    'el gris sigue siendo gris al consolidar EVIDENCIAS',
    consolidateENSStatuses(['CUMPLE', 'NO_EVALUABLE']) === 'NO_EVALUABLE',
    consolidateENSStatuses(['CUMPLE', 'NO_EVALUABLE'])
  );

  comprueba(
    'un agente incumplidor y otro sin medir · NO_CUMPLE (el hueco no lo ablanda)',
    consolidateENSStatuses(['NO_CUMPLE', 'NO_EVALUABLE']) === 'NO_CUMPLE',
    consolidateENSStatuses(['NO_CUMPLE', 'NO_EVALUABLE'])
  );

  comprueba(
    'todos NO_APLICA · NO_APLICA',
    consolidateENSStatuses(['NO_APLICA', 'NO_APLICA']) === 'NO_APLICA',
    consolidateENSStatuses(['NO_APLICA', 'NO_APLICA'])
  );

  // Consolidado real: un agente con un incumplimiento demostrado y otro del que
  // no se ha podido medir nada. El segundo ya NO se cae del promedio.
  const conNumero = evalua(evidencias({ 'EV-05': 'NO_CUMPLE' }));
  const sinNada = evalua(evidencias(TODO_SIN_MEDIR));

  comprueba(
    'el agente sin datos ya trae número, y es 0',
    sinNada.score === 0 && sinNada.status === 'NO_CUMPLE',
    `${sinNada.status}/${String(sinNada.score)}`
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
        results: [sinNada],
        summary: undefined as never,
      },
    ],
    'op.acc.1'
  );

  comprueba(
    'consolidado · el agente que no demuestra nada arrastra el promedio',
    consolidado?.score ===
      Math.round(((conNumero.score as number) + (sinNada.score as number)) / 2),
    `${String(consolidado?.score)} de ${String(conNumero.score)} y ${String(
      sinNada.score
    )}`
  );

  comprueba(
    'consolidado · las tarjetas del segundo agente viajan con su etiqueta',
    (consolidado?.nonConformities || []).some(nc => nc.id.startsWith('002:NC-')),
    JSON.stringify((consolidado?.nonConformities || []).map(nc => nc.id))
  );

  comprueba(
    'consolidado · aplicables y demostrados se suman entre agentes',
    consolidado?.applicableRequirements ===
      conNumero.applicableRequirements + sinNada.applicableRequirements &&
      consolidado?.measuredRequirements ===
        conNumero.measuredRequirements + sinNada.measuredRequirements,
    `${String(consolidado?.applicableRequirements)}/${String(
      consolidado?.measuredRequirements
    )}`
  );

  // Un requisito demostrado en una máquina y no en otra no está demostrado para
  // el conjunto: basta una sin prueba.
  const requisitoConsolidado = (consolidado?.requirements || []).find(
    item => item.id === 'op.acc.1.2'
  );

  comprueba(
    'consolidado · basta una máquina sin prueba para que el requisito no lo esté',
    requisitoConsolidado?.evidenced === false,
    String(requisitoConsolidado?.evidenced)
  );

  // Y la agregación de la vista general sigue intacta: una tarjeta idéntica en
  // dos máquinas es UNA tarjeta con dos máquinas, no dos.
  const consolidadoIgual = consolidateAgentComplianceResultByControl(
    [
      {
        agentId: '001',
        agentName: 'CLIENTE-01',
        results: [sinNada],
        summary: undefined as never,
      },
      {
        agentId: '002',
        agentName: 'CLIENTE-02',
        results: [sinNada],
        summary: undefined as never,
      },
    ],
    'op.acc.1'
  );

  comprueba(
    'consolidado · el mismo hallazgo en dos máquinas sigue siendo UNA tarjeta',
    (consolidadoIgual?.nonConformities || []).length ===
      sinNada.nonConformities.length,
    `${(consolidadoIgual?.nonConformities || []).length} de ${
      sinNada.nonConformities.length * 2
    } sin agregar`
  );

  comprueba(
    'consolidado · y nombra las dos máquinas, salvo en lo que es del catálogo',
    (consolidadoIgual?.nonConformities || [])
      .filter(nc => nc.cause !== 'CATALOG')
      .every(nc => (nc.agents || []).length === 2) &&
      (consolidadoIgual?.nonConformities || [])
        .filter(nc => nc.cause === 'CATALOG')
        .every(nc => (nc.agents || []).length === 0),
    JSON.stringify(
      (consolidadoIgual?.nonConformities || []).map(
        nc => `${nc.cause}:${(nc.agents || []).length}`
      )
    )
  );
}

// ---------------------------------------------------------------------------
bloque('5 · índice global de la pantalla principal');

{
  const conforme = evalua(evidencias(), 'BAJO');
  const sinNada = evalua(evidencias(TODO_SIN_MEDIR), 'BAJO');

  // Se fuerza un control conforme de verdad: op.acc.1 no puede alcanzarlo hoy
  // porque op.acc.1.5 no tiene ninguna evidencia declarada en el catálogo. Lo
  // que se prueba aquí es el promedio, no el catálogo.
  const controlConforme: ENSComplianceResult = {
    ...conforme,
    status: 'CUMPLE',
    score: 100,
  };

  const estado = buildComplianceState([controlConforme, sinNada]);

  comprueba(
    'índice global · el control sin demostrar aporta su 0 (50, no 100)',
    estado.controlSummary.scoreAverage === 50,
    String(estado.controlSummary.scoreAverage)
  );

  comprueba(
    'índice global · la base son los dos controles aplicables',
    estado.controlSummary.measured === 2 &&
      estado.controlSummary.totalControls === 2,
    `${estado.controlSummary.measured}/${estado.controlSummary.totalControls}`
  );

  // Un control NO_APLICA sigue fuera del promedio: es lo que permite el 100 %.
  const noAplica: ENSComplianceResult = {
    ...conforme,
    status: 'NO_APLICA',
    score: undefined,
  };

  const conNoAplica = buildComplianceState([controlConforme, noAplica]);

  comprueba(
    'índice global · un control NO_APLICA no baja el índice',
    conNoAplica.controlSummary.scoreAverage === 100 &&
      conNoAplica.controlSummary.measured === 1,
    `${conNoAplica.controlSummary.scoreAverage}/${conNoAplica.controlSummary.measured}`
  );

  // El contador de máquinas que NO han reportado. Es el único sitio de la
  // pantalla principal donde el agente caído sigue teniendo nombre propio: el
  // veredicto ya no lo delata —ahora todas las máquinas tienen veredicto,
  // incluida la que no ha mandado nada en su vida— así que este contador tiene
  // que mirar si se ha llegado a MEDIR algo, no el estado.
  //
  // Sin esta comprobación se puede revertir a la versión que mira el estado y
  // no falla nada; lo dijo la verificación por reversión.
  const estadoConAgentes = buildComplianceState(
    [controlConforme, sinNada],
    [
      {
        agentId: '001',
        agentName: 'CLIENTE-01',
        results: [conforme],
        summary: undefined as never,
      },
      {
        agentId: '002',
        agentName: 'CLIENTE-02',
        results: [sinNada],
        summary: undefined as never,
      },
    ]
  );

  comprueba(
    'agentes · la máquina que no ha demostrado nada cuenta como «sin resultados»',
    estadoConAgentes.agentSummary.totalAgents === 2 &&
      estadoConAgentes.agentSummary.agentsWithResults === 1 &&
      estadoConAgentes.agentSummary.agentsWithoutResults === 1,
    JSON.stringify(estadoConAgentes.agentSummary)
  );
}

// ---------------------------------------------------------------------------
bloque('6 · las cuatro causas tienen texto y acción distintos');

{
  const conConfiguracion = evalua(evidencias(), 'MEDIO', CONFIGURACION_COMPLETA);

  // Causa CATALOG: op.acc.1.5 y op.acc.1.r1.1 no declaran ninguna evidencia.
  const porCatalogo = noEvidenciadas(conConfiguracion).filter(
    nc => nc.cause === 'CATALOG'
  );

  comprueba(
    'causa catálogo · son dos, y la acción es declararlas en el catálogo',
    porCatalogo.length === 2 &&
      porCatalogo.every(nc =>
        nc.requiredAction.startsWith('Declarar en el catálogo')
      ),
    JSON.stringify(porCatalogo.map(nc => nc.requirementId))
  );

  // Causa CONFIGURATION: faltan parámetros obligatorios del control.
  const sinConfigurar = evalua(evidencias(), 'MEDIO', CONFIGURACION_VACIA);

  const porConfiguracion = noEvidenciadas(sinConfigurar).filter(
    nc => nc.cause === 'CONFIGURATION' && nc.id !== 'NC-CFG'
  );

  comprueba(
    'causa configuración · el ancla es CONFIG, nunca una evidencia en verde',
    porConfiguracion.length > 0 &&
      porConfiguracion.every(
        nc => nc.evidenceIds.length === 0 && nc.evidenceId === 'CONFIG'
      ),
    JSON.stringify(porConfiguracion.map(nc => nc.evidenceId))
  );

  comprueba(
    'causa configuración · la acción nombra el parámetro concreto',
    porConfiguracion.every(
      nc =>
        nc.parameterIds.length > 0 &&
        nc.requiredAction.includes(nc.parameterIds[0])
    ),
    JSON.stringify(porConfiguracion.map(nc => nc.requiredAction))
  );

  // Causa EVIDENCE: llega el dato del agente y no basta.
  const porEvidencia = noEvidenciadas(
    evalua(evidencias({ 'EV-04': 'NO_EVALUABLE' }))
  ).filter(nc => nc.evidenceIds.includes('EV-04'));

  comprueba(
    'causa evidencia · la acción apunta al productor, no a "revisar las evidencias"',
    porEvidencia.length > 0 &&
      porEvidencia.every(
        nc =>
          nc.cause === 'EVIDENCE' &&
          nc.requiredAction.includes('productor') &&
          !nc.requiredAction.includes('Revisar')
      ),
    JSON.stringify(porEvidencia.map(nc => `${nc.cause}:${nc.requiredAction}`))
  );

  comprueba(
    'ninguna tarjeta se presenta ya como "no es un incumplimiento"',
    [...noEvidenciadas(conConfiguracion), ...noEvidenciadas(sinConfigurar)].every(
      nc => !nc.impact.includes('No es un incumplimiento')
    ),
    ''
  );

  comprueba(
    'todas dicen que la carga de la prueba es del auditado',
    [...noEvidenciadas(conConfiguracion), ...noEvidenciadas(sinConfigurar)].every(
      nc => nc.impact.includes('carga de la prueba')
    ),
    ''
  );
}

// ---------------------------------------------------------------------------
bloque('7 · el agente caído: mismo veredicto, otro culpable y otra acción');

{
  // Dos escenarios que dan EXACTAMENTE el mismo veredicto y sólo se diferencian
  // en de dónde viene la falta de prueba:
  //
  //   a) el agente reporta y él mismo declara que no ha podido medir  → EVIDENCE
  //   b) no ha llegado nada de esa máquina                            → COLLECTION
  //
  // Eje único: la causa de la evidencia. Todo lo demás es idéntico.
  const declaraElAgente = evalua(
    evidencias(
      { 'EV-04': 'NO_EVALUABLE' },
      { 'EV-04': 'P-05 no configurado en el agente' },
      { 'EV-04': 'EVIDENCE' }
    )
  );

  const agenteCaido = evalua(
    evidencias({ 'EV-04': 'NO_EVALUABLE' }, {}, { 'EV-04': 'COLLECTION' })
  );

  comprueba(
    'agente caído · el veredicto del control es el MISMO que si el agente reporta',
    declaraElAgente.status === agenteCaido.status &&
      declaraElAgente.score === agenteCaido.score,
    `${declaraElAgente.status}/${String(declaraElAgente.score)} vs ${
      agenteCaido.status
    }/${String(agenteCaido.score)}`
  );

  const cardCaido = tarjeta(agenteCaido, 'op.acc.1.4');
  const cardDeclara = tarjeta(declaraElAgente, 'op.acc.1.4');

  comprueba(
    'agente caído · la causa publicada es COLLECTION, no EVIDENCE',
    cardCaido?.cause === 'COLLECTION' && cardDeclara?.cause === 'EVIDENCE',
    `${String(cardCaido?.cause)} vs ${String(cardDeclara?.cause)}`
  );

  comprueba(
    'agente caído · el motivo dice que es un fallo de RECOGIDA',
    cardCaido!.finding.includes('RECOGIDA'),
    cardCaido!.finding
  );

  comprueba(
    'agente caído · el motivo niega que sea un hallazgo sobre la máquina',
    cardCaido!.finding.includes('NO un hallazgo sobre la máquina'),
    cardCaido!.finding
  );

  comprueba(
    'agente caído · la acción es restablecer la recogida, no corregir el sistema',
    cardCaido!.requiredAction.includes('Restablecer la RECOGIDA') &&
      cardCaido!.requiredAction.includes(
        'no una corrección en el sistema auditado'
      ),
    cardCaido!.requiredAction
  );

  comprueba(
    'agente caído · y la acción NO es la misma que cuando el agente sí reporta',
    cardCaido!.requiredAction !== cardDeclara!.requiredAction,
    ''
  );

  // Y frente a un incumplimiento medido de verdad en el mismo requisito: aquí
  // sí hay que tocar la máquina.
  const incumpleDeVerdad = evalua(evidencias({ 'EV-04': 'NO_CUMPLE' }));

  comprueba(
    'agente caído · un incumplimiento medido del mismo requisito sí manda revisar',
    tarjeta(incumpleDeVerdad, 'op.acc.1.4')?.origin === 'MEDIDA' &&
      !tarjeta(incumpleDeVerdad, 'op.acc.1.4')!.requiredAction.includes(
        'RECOGIDA'
      ),
    String(tarjeta(incumpleDeVerdad, 'op.acc.1.4')?.requiredAction)
  );

  // Mezcla dentro del MISMO requisito: una evidencia que no llega y otra que
  // llega mal. Lo que hay no es silencio, así que no se puede culpar a la
  // recogida. Sin este caso, la guarda del `every(COLLECTION)` no la ejercita
  // ningún fixture — que es como se coló el fallo de `badEvidences` en 346e56b.
  const mezclaEnElMismoRequisito = evalua(
    evidencias(
      { 'EV-04': 'NO_EVALUABLE', 'EV-08': 'NO_EVALUABLE' },
      {},
      { 'EV-04': 'COLLECTION', 'EV-08': 'EVIDENCE' }
    )
  );

  comprueba(
    'una que no llega y otra que llega mal · no se culpa a la recogida',
    tarjeta(mezclaEnElMismoRequisito, 'op.acc.1.4')?.cause === 'EVIDENCE',
    String(tarjeta(mezclaEnElMismoRequisito, 'op.acc.1.4')?.cause)
  );
}

// ---------------------------------------------------------------------------
bloque('8 · pipeline completo desde los eventos del agente');

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
    'pipeline · el agente reportó: la causa es del productor, no de la recogida',
    ['EV-04', 'EV-05', 'EV-07'].every(
      id => resueltas.find(item => item.id === id)?.gapCause === 'EVIDENCE'
    ),
    JSON.stringify(resueltas.map(item => `${item.id}:${String(item.gapCause)}`))
  );

  comprueba(
    'pipeline · EV-03, que nadie emitió, sí es un fallo de recogida',
    resueltas.find(item => item.id === 'EV-03')?.gapCause === 'COLLECTION',
    String(resueltas.find(item => item.id === 'EV-03')?.gapCause)
  );

  comprueba(
    'pipeline · el control sale con veredicto y con número',
    resultado.status !== 'NO_EVALUABLE' && typeof resultado.score === 'number',
    `${resultado.status}/${String(resultado.score)}`
  );

  comprueba(
    'pipeline · hay no conformidades, y son todas no evidenciadas',
    resultado.nonConformities.length > 0 && medidas(resultado).length === 0,
    JSON.stringify(
      resultado.nonConformities.map(nc => `${nc.id}:${nc.origin}:${nc.cause}`)
    )
  );

  comprueba(
    'pipeline · el motivo del agente («P-07 no configurado») llega a la tarjeta',
    resultado.nonConformities.some(nc =>
      nc.finding.includes('P-07 no configurado')
    ),
    JSON.stringify(resultado.nonConformities.map(nc => nc.finding))
  );
}

// ---------------------------------------------------------------------------
bloque('9 · el agente que deja de reportar, de punta a punta');

{
  // Cero eventos: la máquina está en el alcance pero su agente no manda nada.
  const resueltas = resolveEvidenceForControl(
    'op.acc.1',
    [],
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
    []
  );

  comprueba(
    'sin un solo evento · TODAS las evidencias declaran fallo de recogida',
    resueltas.every(item => item.gapCause === 'COLLECTION'),
    JSON.stringify(resueltas.map(item => `${item.id}:${String(item.gapCause)}`))
  );

  comprueba(
    'sin un solo evento · el control es NO_CUMPLE al 0, no un gris sin número',
    resultado.status === 'NO_CUMPLE' && resultado.score === 0,
    `${resultado.status}/${String(resultado.score)}`
  );

  comprueba(
    'sin un solo evento · los requisitos con evidencia culpan a la RECOGIDA',
    noEvidenciadas(resultado).filter(nc => nc.cause === 'COLLECTION').length ===
      6,
    JSON.stringify(
      noEvidenciadas(resultado).map(nc => `${nc.requirementId}:${nc.cause}`)
    )
  );

  comprueba(
    'sin un solo evento · los que no declaran evidencia siguen siendo del catálogo',
    noEvidenciadas(resultado).filter(nc => nc.cause === 'CATALOG').length === 2,
    JSON.stringify(
      noEvidenciadas(resultado).map(nc => `${nc.requirementId}:${nc.cause}`)
    )
  );

  comprueba(
    'sin un solo evento · ni una tarjeta acusa a la máquina de algo medido',
    medidas(resultado).length === 0,
    JSON.stringify(medidas(resultado).map(nc => nc.requirementId))
  );
}

// ---------------------------------------------------------------------------

console.log(
  fallos.length
    ? `\n${fallos.length} comprobaciones FALLAN:\n  ${fallos.join('\n  ')}`
    : '\nTodas las comprobaciones pasan.'
);

process.exit(fallos.length ? 1 : 0);
