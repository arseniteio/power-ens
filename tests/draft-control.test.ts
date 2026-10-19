/**
 * Un control en `status: 'DRAFT'` no entra en el índice.
 *
 *     ~/.bun/bin/bun run tests/draft-control.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador,
 * sin `package.json` ni `tsconfig`. Hace falta `bun` (probado con 1.3.14).
 *
 * POR QUÉ EXISTE ESTE FICHERO. El 06/08 entraron op.acc.3 y op.acc.4,
 * generados del Excel. Están definidos, se ven en pantalla y se pueden
 * configurar, pero **ninguna máquina emite sus hechos**: no hay runbook, ni
 * recolector, ni reglas en ningún manager. Sin este mecanismo, sus evidencias
 * salen NO_EVALUABLE, sus requisitos NO_CUMPLE por el criterio del 04/08, y el
 * índice global de un cliente cae por dos controles que nadie ha ido a medir.
 *
 * Eso no es exigencia, es ruido: «lo que no se puede demostrar no cumple»
 * responsabiliza al AUDITADO de probar lo que se le ha pedido medir, no de
 * probar aquello para lo que todavía no existe el instrumento. Un control en
 * borrador se comporta como un refuerzo por encima del nivel activo —NO_APLICA,
 * fuera del denominador— y pasa a ACTIVE el día que su agente emite.
 *
 * Reglas de estas pruebas, las mismas de sus hermanas: cada caso mueve UN SOLO
 * eje respecto del anterior, y toda afirmación lleva al lado la REVERSIÓN que
 * demuestra que no pasaría siempre. Aquí la reversión es literal: el mismo
 * control, el mismo día, con `status: 'ACTIVE'`.
 */
import { ENSCatalog } from '../common/ens/catalog';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import type {
  ENSControlDefinition,
  ENSRequirementDefinition,
} from '../common/ens/catalog/types';
import type { ENSLevel } from '../common/ens/configuration/types';
import { evaluateRequirements } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';

// El repo no tiene @types/node y no va a tenerlos.
declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

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
  console.log(`  FAIL ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

const control = (controlId: string): ENSControlDefinition => {
  const encontrado = ENSCatalog.find(item => item.id === controlId);

  if (!encontrado) {
    throw new Error(`fixture rota: ${controlId} no está en el catálogo`);
  }

  return encontrado;
};

// Se evalúa SIN evidencias y SIN parámetros configurados: es el estado real de
// un control recién generado, que es exactamente el caso que esto protege.
const evalua = (
  requisitos: ENSRequirementDefinition[],
  nivel: ENSLevel,
  estado: ENSControlDefinition['status']
) =>
  evaluateControlStatus(
    evaluateRequirements(requisitos, nivel, [], true, [], estado)
  );

const NIVELES: ENSLevel[] = ['BAJO', 'MEDIO', 'ALTO'];

// --- 1. el estado de cada control dice la verdad sobre su agente ----------
//
// ESTA SECCIÓN YA NO FIJA QUIÉN ESTÁ EN BORRADOR, y el cambio es a propósito.
//
// Antes decía «op.acc.3 y op.acc.4 nacen en DRAFT», que era cierto el día que
// se escribió y dejó de serlo el 06/08/2026, cuando sus reglas se desplegaron
// en el manager y su agente empezó a emitir. Una prueba que fija el estado de
// hoy obliga a editarla cada vez que el estado avanza legítimamente, y en esa
// edición es donde se cuela el error: se cambia el número y no se comprueba la
// regla.
//
// La regla es esta y no cambia: DRAFT significa «ninguna máquina emite sus
// hechos todavía», y existe para no acusar a un cliente de incumplir aquello
// para lo que aún no hay instrumento. Así que lo que se comprueba es la
// COHERENCIA: un control ACTIVE tiene que acreditar reglas, y uno en DRAFT no
// puede acreditar ninguna, porque si las acredita es que ya hay con qué medir.

bloque('1. El estado de cada control es coherente con lo que puede medir');

{
  for (const c of ENSCatalog) {
    const controlId = c.id;

    comprueba(
      `${controlId} · declara un estado válido`,
      c.status === 'ACTIVE' || c.status === 'DRAFT',
      c.status
    );

    const acreditaReglas = c.requirements.some(
      requisito => requisito.evidenceIds.length > 0
    );

    if (c.status === 'DRAFT') {
      comprueba(
        `${controlId} · en DRAFT no acredita evidencias todavía`,
        !acreditaReglas,
        'está en DRAFT y sus requisitos ya declaran evidencias'
      );
    } else {
      comprueba(
        `${controlId} · ACTIVE y con evidencias con las que demostrarse`,
        acreditaReglas,
        'está ACTIVE y ningún requisito declara evidencia'
      );
    }
  }
}

// --- 2. un control en borrador queda fuera del denominador -----------------

bloque('2. En borrador: NO_APLICA y sin puntuación, en los tres niveles');

{
  for (const controlId of ['op.acc.3', 'op.acc.4']) {
    for (const nivel of NIVELES) {
      const resultado = evalua(
        control(controlId).requirements,
        nivel,
        'DRAFT'
      );

      comprueba(
        `${controlId} en ${nivel} · NO_APLICA`,
        resultado.status === 'NO_APLICA',
        resultado.status
      );

      // SIN número, no un 0. Es lo que lo saca del promedio: `scoreAverage`
      // excluye NO_APLICA, y un 0 se pintaría en rojo como un incumplimiento.
      comprueba(
        `${controlId} en ${nivel} · sin puntuación`,
        resultado.score === undefined,
        String(resultado.score)
      );

      comprueba(
        `${controlId} en ${nivel} · ningún requisito aplicable`,
        resultado.applicableRequirements === 0,
        String(resultado.applicableRequirements)
      );
    }
  }
}

// --- 3. la reversión: activos, esos mismos controles sí acusan -------------

bloque('3. LA REVERSIÓN — el mismo control en ACTIVE sí incumple');

{
  // Mismo control, mismos requisitos, mismo día, sin evidencias. Lo único que
  // cambia es el estado. Si esto no pasara a NO_CUMPLE, el bloque 2 estaría
  // pasando por una razón distinta de la que dice —por ejemplo, porque el
  // catálogo no tenga requisitos— y no protegería nada.
  const activo = evalua(
    control('op.acc.4').requirements,
    'BAJO',
    'ACTIVE'
  );

  comprueba(
    'op.acc.4 en BAJO y ACTIVE · NO_CUMPLE (lo no demostrado no cumple)',
    activo.status === 'NO_CUMPLE',
    activo.status
  );

  comprueba(
    'op.acc.4 en BAJO y ACTIVE · sí tiene requisitos aplicables',
    activo.applicableRequirements === 5,
    String(activo.applicableRequirements)
  );

  comprueba(
    'op.acc.4 en BAJO y ACTIVE · con puntuación 0, que sí resta',
    activo.score === 0,
    String(activo.score)
  );

  // Y op.acc.3 en MEDIO, que es donde empieza a regir.
  const tresActivo = evalua(
    control('op.acc.3').requirements,
    'MEDIO',
    'ACTIVE'
  );

  comprueba(
    'op.acc.3 en MEDIO y ACTIVE · NO_CUMPLE',
    tresActivo.status === 'NO_CUMPLE',
    tresActivo.status
  );
}

// --- 4. op.acc.3 no es exigible en BAJO, y eso es del ENS -------------------

bloque('4. op.acc.3 no rige en BAJO ni estando activo');

{
  // Distinto del bloque 2: aquí el control está ACTIVE y aun así no aplica,
  // porque el Anexo II lo declara `n.a.` en BAJO. Son dos motivos distintos
  // para el mismo NO_APLICA y conviene que ninguno tape al otro.
  const enBajo = evalua(
    control('op.acc.3').requirements,
    'BAJO',
    'ACTIVE'
  );

  comprueba(
    'op.acc.3 en BAJO · NO_APLICA aunque el control esté activo',
    enBajo.status === 'NO_APLICA',
    enBajo.status
  );

  comprueba(
    'el catálogo declara op.acc.3 solo en MEDIO y ALTO',
    control('op.acc.3').levels.join(',') === 'MEDIO,ALTO',
    control('op.acc.3').levels.join(',')
  );

  // La reversión: op.acc.4 sí rige en los tres, y el ENS no le pone refuerzos.
  comprueba(
    'y op.acc.4 sí rige en los tres niveles',
    control('op.acc.4').levels.join(',') === 'BAJO,MEDIO,ALTO',
    control('op.acc.4').levels.join(',')
  );
}

// --- 5. los refuerzos que el ENS define pero no exige -----------------------

bloque('5. R2 y R3 de op.acc.3 no entran en el denominador');

{
  // El texto del ENS define op.acc.3.r2.1 y op.acc.3.r3.1 pero NO los exige en
  // ningún nivel de la tabla de aplicabilidad. Entraron heredando ALTO de la
  // sección anterior y salían NO_CUMPLE para siempre: una no conformidad
  // inventada sobre algo que la norma no pide, que es el reflejo exacto del
  // CUMPLE falso que este producto no comete.
  const sinNivel = control('op.acc.3').requirements.filter(
    requisito => requisito.applicability.levels.length === 0
  );

  comprueba(
    'son exactamente dos, y son R2 y R3',
    sinNivel.map(requisito => requisito.id).sort().join(',') ===
      'op.acc.3.r2.1,op.acc.3.r3.1',
    sinNivel.map(requisito => requisito.id).join(',')
  );

  // La reversión: los refuerzos que el ENS SÍ exige conservan su nivel.
  const r1 = control('op.acc.3').requirements.filter(requisito =>
    requisito.id.startsWith('op.acc.3.r1.')
  );

  comprueba(
    'y los dos de R1, que el ENS sí exige, siguen en ALTO',
    r1.length === 2 &&
      r1.every(
        requisito =>
          requisito.applicability.levels.join(',') === 'ALTO'
      ),
    r1.map(r => `${r.id}=${r.applicability.levels.join('|')}`).join(' ')
  );

  // En ALTO y ACTIVE, el denominador son los CUATRO exigidos, no los seis.
  const enAlto = evalua(
    control('op.acc.3').requirements,
    'ALTO',
    'ACTIVE'
  );

  comprueba(
    'en ALTO el denominador son 4 requisitos, no 6',
    enAlto.applicableRequirements === 4,
    String(enAlto.applicableRequirements)
  );
}

// --- 6. ninguna evidencia acredita una regla que no existe -----------------

bloque('6. La trazabilidad no se inventa: cada regla existe en un manager');

{
  // `relatedRules` es la cadena que un auditor recorre —CUMPLE → evidencia →
  // rule ID → evento crudo—, y una regla solo existe cuando está desplegada en
  // un manager. El generador fabricaba `ENS-OPACC4-EV01`, que no existe en
  // ningún sitio: la cadena parecía completa y se rompía en el último salto.
  // En op.acc.1 eso dejó 39 de 52 reglas apuntando a la nada.
  const nuevas = ENSEvidenceCatalog.filter(evidencia =>
    ['op.acc.3', 'op.acc.4'].includes(evidencia.controlId)
  );

  comprueba(
    'las 15 evidencias de los dos controles están declaradas',
    nuevas.length === 15,
    String(nuevas.length)
  );

  // op.acc.3 tiene recolector desde el 06/08. Sus siete evidencias acreditan
  // regla, y CINCO comparten la misma (107001): comparten el hecho, y lo que
  // las distingue es la pregunta que el motor le hace. Un hecho crudo describe
  // una observación, no un veredicto.
  const tres = nuevas.filter(
    evidencia => evidencia.controlId === 'op.acc.3'
  );

  comprueba(
    'op.acc.3 · las siete acreditan una regla de su banda',
    tres.length === 7 &&
      tres.every(
        evidencia =>
          evidencia.relatedRules.length === 1 &&
          /^1070\d\d$/.test(evidencia.relatedRules[0])
      ),
    tres.map(e => `${e.id}=${e.relatedRules.join('|')}`).join(' ')
  );

  comprueba(
    'y cinco de ellas comparten la misma regla: comparten el hecho',
    tres.filter(
      evidencia => evidencia.relatedRules[0] === '107001'
    ).length === 5,
    tres.map(e => `${e.id}=${e.relatedRules[0]}`).join(' ')
  );

  // op.acc.4 SÍ tiene recolector desde el 06/08, así que sus ocho evidencias
  // acreditan la regla que las recoge. La comprobación de que esas reglas
  // existen de verdad en un manager la hace `check-consistency.py` (1).
  const cuatro = nuevas.filter(
    evidencia => evidencia.controlId === 'op.acc.4'
  );

  comprueba(
    'op.acc.4 · las ocho acreditan exactamente una regla de su banda',
    cuatro.length === 8 &&
      cuatro.every(
        evidencia =>
          evidencia.relatedRules.length === 1 &&
          /^1071\d\d$/.test(evidencia.relatedRules[0])
      ),
    cuatro.map(e => `${e.id}=${e.relatedRules.join('|')}`).join(' ')
  );

  // La reversión, sin la cual un `relatedRules` vacío en TODO el catálogo
  // pasaría esta prueba igual: los tres controles desplegados sí acreditan
  // reglas, y son numéricas porque existen en un manager.
  const desplegadas = ENSEvidenceCatalog.filter(evidencia =>
    ['mp.info.6', 'op.acc.1', 'op.acc.2'].includes(evidencia.controlId)
  );

  const sinRegla = desplegadas.filter(
    evidencia => evidencia.relatedRules.length === 0
  );

  comprueba(
    'y las de los controles desplegados sí la acreditan',
    desplegadas.length > 0 && sinRegla.length === 0,
    `${sinRegla.length} sin regla de ${desplegadas.length}`
  );

  comprueba(
    'con identificadores numéricos, que es lo que existe en un manager',
    desplegadas.every(evidencia =>
      evidencia.relatedRules.every(regla => /^\d+$/.test(regla))
    ),
    desplegadas
      .flatMap(e => e.relatedRules)
      .filter(r => !/^\d+$/.test(r))
      .join(', ')
  );
}

// --- 7. un control ACTIVE sin runbook tiene que estar declarado -------------
//
// Un control con runbook acredita reglas: una regla solo existe si un runbook
// la despliega en el manager. Uno ACTIVE que no acredita NINGUNA no tiene
// runbook, y eso solo es legítimo si está declarado, con su motivo, en
// `tests/controls-without-runbook.json` (op.cont.2: todo lo que decide está en
// la pantalla). Es la misma lista que lee `check-consistency.py`
// (comprobación 14): una sola lista, no dos que puedan divergir.

bloque('7. Un control ACTIVE sin runbook tiene que estar declarado');

const SIN_RUNBOOK: Record<string, string> = Object.fromEntries(
  Object.entries(require('./controls-without-runbook.json') as Record<string, string>).filter(
    ([clave]) => !clave.startsWith('_')
  )
);

// Por qué un control no cuadra con su runbook, o `undefined` si cuadra.
const problemaDeRunbook = (
  c: Pick<ENSControlDefinition, 'id' | 'status'>,
  reglas: string[],
  declarados: Record<string, string>
): string | undefined => {
  if (c.status !== 'ACTIVE') {
    return undefined;
  }

  const declarado = Object.prototype.hasOwnProperty.call(declarados, c.id);

  if (!declarado) {
    return reglas.length
      ? undefined
      : 'ACTIVE sin runbook (no acredita ninguna regla) y sin declarar en tests/controls-without-runbook.json';
  }

  if (!String(declarados[c.id]).trim()) {
    return 'declarado sin runbook pero sin motivo';
  }

  return reglas.length
    ? `declarado sin runbook y acredita reglas (${reglas.join(', ')}): una regla solo existe si un runbook la despliega`
    : undefined;
};

const reglasDe = (controlId: string): string[] =>
  ENSEvidenceCatalog.filter(evidencia => evidencia.controlId === controlId).flatMap(
    evidencia => evidencia.relatedRules
  );

{
  for (const c of ENSCatalog) {
    const problema = problemaDeRunbook(c, reglasDe(c.id), SIN_RUNBOOK);

    comprueba(
      `${c.id} · ${Object.prototype.hasOwnProperty.call(SIN_RUNBOOK, c.id) ? 'declarado sin runbook' : 'cuadra con su runbook'}`,
      problema === undefined,
      problema
    );
  }

  comprueba(
    'cada control declarado sin runbook lleva su motivo',
    Object.values(SIN_RUNBOOK).every(motivo => String(motivo).trim().length > 0),
    Object.keys(SIN_RUNBOOK).join(', ')
  );

  comprueba(
    'op.cont.2 está declarado sin runbook (spec §5.4)',
    Object.prototype.hasOwnProperty.call(SIN_RUNBOOK, 'op.cont.2')
  );

  // Con un control inventado, que es lo único que demuestra que la regla
  // FAIL: con el catálogo de hoy todo cuadra y la comprobación de arriba
  // pasaría también con una implementación que no mirase nada.
  const inventado = { id: 'op.zzz.9', status: 'ACTIVE' as const };

  comprueba(
    'ACTIVE, sin reglas y sin declarar: falla',
    problemaDeRunbook(inventado, [], {}) !== undefined
  );
  comprueba(
    'la reversión · declarado con su motivo: cuadra',
    problemaDeRunbook(inventado, [], { 'op.zzz.9': 'control documental' }) === undefined
  );
  comprueba(
    'la reversión · con reglas (tiene runbook) y sin declarar: cuadra',
    problemaDeRunbook(inventado, ['111999'], {}) === undefined
  );
  comprueba(
    'declarado pero sin motivo: falla',
    problemaDeRunbook(inventado, [], { 'op.zzz.9': '  ' }) !== undefined
  );
  comprueba(
    'declarado sin runbook y acreditando reglas: falla',
    problemaDeRunbook(inventado, ['111999'], { 'op.zzz.9': 'control documental' }) !== undefined
  );
  comprueba(
    'en DRAFT no se le exige nada',
    problemaDeRunbook({ id: 'op.zzz.9', status: 'DRAFT' }, [], {}) === undefined
  );
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} check(s) FAIL:`);
  fallos.forEach(fallo => console.log(`  - ${fallo}`));
  process.exit(1);
}

console.log('All checks pass.');
