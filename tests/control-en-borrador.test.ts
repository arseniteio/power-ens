/**
 * Un control en `status: 'DRAFT'` no entra en el índice.
 *
 *     ~/.bun/bin/bun run tests/control-en-borrador.test.ts
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
import { ENSCatalog } from '../dashboard/ens/catalog';
import { ENSEvidenceCatalog } from '../dashboard/ens/core/evidence/catalog';
import type {
  ENSControlDefinition,
  ENSRequirementDefinition,
} from '../dashboard/ens/catalog/types';
import type { ENSLevel } from '../dashboard/ens/configuration/types';
import { evaluateRequirements } from '../dashboard/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../dashboard/ens/core/evaluation/control/control-evaluator';

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

// --- 1. los dos controles nuevos están en borrador -------------------------

bloque('1. op.acc.3 y op.acc.4 están en el catálogo, y en borrador');

{
  for (const controlId of ['op.acc.3', 'op.acc.4']) {
    comprueba(
      `${controlId} · está declarado en el catálogo`,
      control(controlId).id === controlId
    );

    comprueba(
      `${controlId} · nace en DRAFT, porque no tiene agente`,
      control(controlId).status === 'DRAFT',
      control(controlId).status
    );
  }

  // La reversión que da sentido a lo anterior: los tres controles con agente
  // desplegado SÍ están activos. Sin esto, un DRAFT global pasaría igual.
  for (const controlId of ['mp.info.6', 'op.acc.1', 'op.acc.2']) {
    comprueba(
      `${controlId} · sigue ACTIVE (tiene agente desplegado)`,
      control(controlId).status === 'ACTIVE',
      control(controlId).status
    );
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

bloque('6. Sin agente, sin reglas: la trazabilidad no se inventa');

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

  const conRegla = nuevas.filter(
    evidencia => evidencia.relatedRules.length > 0
  );

  comprueba(
    'y NINGUNA acredita una regla: no hay manager que las tenga',
    conRegla.length === 0,
    conRegla.map(e => `${e.controlId}/${e.id}=${e.relatedRules.join('|')}`).join(' ')
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

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(fallo => console.log(`  - ${fallo}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
