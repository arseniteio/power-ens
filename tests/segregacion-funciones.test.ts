/**
 * La correlación de op.acc.3: funciones incompatibles en la misma cuenta.
 *
 *     ~/.bun/bin/bun run tests/segregacion-funciones.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 * Hace falta `bun` (probado con 1.3.14).
 *
 * POR QUÉ EXISTE ESTE FICHERO. op.acc.3 es el único control con evaluador de
 * policy propio, y la razón es estructural: la segregación es una propiedad del
 * CONJUNTO de acciones de una persona, no de ninguna acción suelta. «jgomez
 * ejecutó git push» no incumple nada; incumple si esa misma cuenta ejerce
 * además una función incompatible dentro de la ventana.
 *
 * Las siete primitivas de juicio contrastan UN hecho contra UN parámetro, así
 * que ninguna sirve. El evaluador hace tres cosas a la vez —clasificar por
 * P-03, agrupar por cuenta, cruzar contra P-02— y este fichero prueba las tres
 * por separado, cada una con su reversión.
 *
 * Lo que NO se prueba aquí es el recolector: eso lo hace la suite del runbook
 * sobre Ubuntu real. Aquí se prueba el JUICIO, que es lo que decide el color.
 */
import { opAcc3PolicyDefinition } from '../dashboard/ens/core/policy-runtime/policies/op-acc-3.policy';
import { buildPolicyContext } from '../dashboard/ens/core/policy-runtime/policy-context-builder';
import { opAcc3CatalogDefinition } from '../dashboard/ens/catalog/op-acc-3';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../dashboard/ens/configuration/types';
import type { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';

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

let contador = 0;

const accion = (
  usuario: string,
  accionEjecutada: string,
  ruta: string = ''
): ENSNormalizedEvent => ({
  id: `act-${(contador += 1)}`,
  controlId: 'op.acc.3',
  eventType: 'account_action',
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-08-06T10:00:00Z',
  attributes: { usuario, accion: accionEjecutada, ruta },
});

const tarea = (
  nombre: string,
  usuario: string
): ENSNormalizedEvent => ({
  id: `task-${(contador += 1)}`,
  controlId: 'op.acc.3',
  eventType: 'critical_task_run',
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-08-06T10:00:00Z',
  attributes: { tarea: nombre, usuario },
});

const parametro = (
  id: string,
  value: string[] | number
): ENSControlParameter =>
  ({
    id,
    controlId: 'op.acc.3',
    name: id,
    label: id,
    description: '',
    levels: ['MEDIO', 'ALTO'],
    requirements: [],
    type: Array.isArray(value) ? 'table' : 'number',
    example: '',
    required: true,
    wazuhUsage: '',
    ensfacilUsage: '',
    evidenceIds: [],
    ruleIds: [],
    ifNotConfigured: '',
    value,
  }) as unknown as ENSControlParameter;

const configuracion = (
  parameters: ENSControlParameter[]
): ENSControlConfiguration =>
  ({
    controlId: 'op.acc.3',
    controlName: 'Segregación de funciones y tareas',
    family: 'Marco operacional',
    enabled: true,
    applicableLevels: ['MEDIO', 'ALTO'],
    parameters,
  }) as ENSControlConfiguration;

// La traducción de acción a función y los pares prohibidos, tal como los
// escribiría un responsable en la pantalla.
const P03 = parametro('P-03', [
  'desarrollo | git | /srv/repos',
  'operacion | systemctl | /etc/init.d',
  'configuracion | visudo | /etc/sudoers',
  'auditoria | /var/log/audit | ausearch',
]);

const P02 = parametro('P-02', [
  'desarrollo | operacion',
  'auditoria | *',
]);

const juzga = (
  eventos: ENSNormalizedEvent[],
  parametros: ENSControlParameter[]
) => {
  const evaluator = opAcc3PolicyDefinition.evaluator;

  if (!evaluator) {
    throw new Error('fixture rota: op.acc.3 debería tener evaluador');
  }

  return evaluator(
    buildPolicyContext(
      opAcc3CatalogDefinition,
      configuracion(parametros),
      'ALTO',
      eventos,
      []
    )
  );
};

const veredicto = (
  resultado: ReturnType<typeof juzga>,
  requisito: string
) =>
  resultado.decisions.find(
    decision => decision.requirementId === requisito
  );

// --- 1. sin la traducción, no se puede medir -------------------------------

bloque('1. Sin P-02 o sin P-03 no hay nada que cruzar');

{
  // Hay acciones de sobra, pero nadie ha dicho qué comando es qué función.
  const sinP03 = juzga(
    [accion('pgarcia', '/usr/bin/git'), accion('pgarcia', '/usr/bin/systemctl')],
    [P02]
  );

  const d = veredicto(sinP03, 'op.acc.3.1');

  comprueba(
    'sin P-03 el requisito sale NO_EVALUABLE, no NO_CUMPLE',
    d?.status === 'NO_EVALUABLE',
    d?.status
  );

  comprueba(
    'y el motivo NOMBRA el parámetro que falta',
    (d?.reason || '').includes('P-03'),
    d?.reason
  );

  // La reversión: con P-03 pero sin P-02 tampoco, y nombra el otro.
  const sinP02 = juzga(
    [accion('pgarcia', '/usr/bin/git')],
    [P03]
  );

  comprueba(
    'sin P-02 tampoco, y nombra P-02',
    veredicto(sinP02, 'op.acc.3.1')?.status === 'NO_EVALUABLE' &&
      (veredicto(sinP02, 'op.acc.3.1')?.reason || '').includes('P-02'),
    veredicto(sinP02, 'op.acc.3.1')?.reason
  );
}

// --- 2. la correlación ------------------------------------------------------

bloque('2. Dos funciones incompatibles en la MISMA cuenta');

{
  // pgarcia desarrolla Y opera: es el caso que op.acc.3.1 prohíbe.
  const incumple = juzga(
    [
      accion('pgarcia', '/usr/bin/git', '/srv/repos/app'),
      accion('pgarcia', '/usr/bin/systemctl'),
    ],
    [P02, P03]
  );

  const d = veredicto(incumple, 'op.acc.3.1');

  comprueba(
    'una cuenta que desarrolla y opera incumple',
    d?.status === 'NO_CUMPLE',
    d?.status
  );

  comprueba(
    'y el motivo nombra la cuenta y las dos funciones',
    (d?.reason || '').includes('pgarcia') &&
      (d?.reason || '').includes('desarrollo'),
    d?.reason
  );

  // LA REVERSIÓN, y es la que da sentido a todo: las MISMAS dos acciones
  // repartidas entre DOS personas no incumplen nada. Sin esto, la prueba de
  // arriba pasaría igual con un evaluador que acusara a cualquiera que tocase
  // un git.
  const cumple = juzga(
    [
      accion('jgomez', '/usr/bin/git', '/srv/repos/app'),
      accion('mlopez', '/usr/bin/systemctl'),
    ],
    [P02, P03]
  );

  comprueba(
    'las mismas dos acciones en DOS personas distintas cumplen',
    veredicto(cumple, 'op.acc.3.1')?.status === 'CUMPLE',
    veredicto(cumple, 'op.acc.3.1')?.status
  );

  // Y una sola acción tampoco basta: una función sola no es incompatibilidad.
  const unaSola = juzga(
    [accion('pgarcia', '/usr/bin/git', '/srv/repos/app')],
    [P02, P03]
  );

  comprueba(
    'una cuenta con UNA sola función cumple',
    veredicto(unaSola, 'op.acc.3.1')?.status === 'CUMPLE',
    veredicto(unaSola, 'op.acc.3.1')?.status
  );
}

// --- 3. el comodín de la auditoría -----------------------------------------

bloque('3. `auditoria | *` es taxativo (op.acc.3.r1.2)');

{
  // Una cuenta que audita Y configura. El par `auditoria | *` dice que la
  // auditoría no puede coexistir con NINGUNA otra función: el texto del ENS no
  // admite aquí el matiz «siempre que sea posible».
  const incumple = juzga(
    [
      accion('auditor2', '/usr/bin/ausearch'),
      accion('auditor2', '/usr/sbin/visudo', '/etc/sudoers'),
    ],
    [P02, P03]
  );

  comprueba(
    'auditoría + configuración incumple por el comodín',
    veredicto(incumple, 'op.acc.3.r1.2')?.status === 'NO_CUMPLE',
    veredicto(incumple, 'op.acc.3.r1.2')?.status
  );

  // La reversión: la misma cuenta SOLO auditando cumple. El comodín no puede
  // convertir en incumplimiento el ejercicio normal de la función.
  const cumple = juzga(
    [accion('auditor1', '/usr/bin/ausearch')],
    [P02, P03]
  );

  comprueba(
    'una cuenta que SOLO audita cumple',
    veredicto(cumple, 'op.acc.3.r1.2')?.status === 'CUMPLE',
    veredicto(cumple, 'op.acc.3.r1.2')?.status
  );
}

// --- 4. la concurrencia en tareas críticas ---------------------------------

bloque('4. Tareas críticas: dos personas o no cuenta');

{
  const P04 = parametro('P-04', [
    'despliegue en produccion | 2',
    'cambio de cortafuegos | 2',
  ]);

  // Una tarea ejecutada por una sola persona.
  const unaSola = juzga(
    [tarea('despliegue en produccion', 'pgarcia')],
    [P02, P03, P04]
  );

  const d = veredicto(unaSola, 'op.acc.3');

  comprueba(
    'una tarea crítica con UNA persona incumple',
    d?.status === 'NO_CUMPLE',
    d?.status
  );

  comprueba(
    'y el motivo dice cuántas hubo y cuántas se exigían',
    (d?.reason || '').includes('pgarcia') &&
      (d?.reason || '').includes('2'),
    d?.reason
  );

  // La reversión: la misma tarea con dos personas distintas cumple.
  const dos = juzga(
    [
      tarea('despliegue en produccion', 'jgomez'),
      tarea('despliegue en produccion', 'mlopez'),
    ],
    [P02, P03, P04]
  );

  comprueba(
    'la misma tarea con DOS personas cumple',
    veredicto(dos, 'op.acc.3')?.status === 'CUMPLE',
    veredicto(dos, 'op.acc.3')?.status
  );

  // Y la misma persona dos veces NO son dos personas.
  const repetida = juzga(
    [
      tarea('despliegue en produccion', 'pgarcia'),
      tarea('despliegue en produccion', 'pgarcia'),
    ],
    [P02, P03, P04]
  );

  comprueba(
    'la misma persona dos veces NO son dos personas',
    veredicto(repetida, 'op.acc.3')?.status === 'NO_CUMPLE',
    veredicto(repetida, 'op.acc.3')?.status
  );
}

bloque('5. Una tarea que no se ejecutó no incumple');

{
  const P04 = parametro('P-04', ['restauracion de copia | 2']);

  // Ninguna ejecución de esa tarea en el periodo. Exigirle concurrencia sería
  // acusar por una ausencia, y aquí la ausencia no es un hallazgo: es que no
  // hubo restauración esta semana.
  const sinEjecucion = juzga([], [P02, P03, P04]);

  comprueba(
    'sin ninguna ejecución, el enunciado general cumple',
    veredicto(sinEjecucion, 'op.acc.3')?.status === 'CUMPLE',
    veredicto(sinEjecucion, 'op.acc.3')?.status
  );

  // La reversión: en cuanto se ejecuta mal, sí acusa.
  const ejecutadaMal = juzga(
    [tarea('restauracion de copia', 'pgarcia')],
    [P02, P03, P04]
  );

  comprueba(
    'pero en cuanto se ejecuta con una sola persona, acusa',
    veredicto(ejecutadaMal, 'op.acc.3')?.status === 'NO_CUMPLE',
    veredicto(ejecutadaMal, 'op.acc.3')?.status
  );

  // Sin P-04 no se puede medir, y lo dice.
  const sinP04 = juzga([tarea('lo que sea', 'x')], [P02, P03]);

  comprueba(
    'sin P-04 el enunciado general sale NO_EVALUABLE nombrándolo',
    veredicto(sinP04, 'op.acc.3')?.status === 'NO_EVALUABLE' &&
      (veredicto(sinP04, 'op.acc.3')?.reason || '').includes('P-04'),
    veredicto(sinP04, 'op.acc.3')?.reason
  );
}

// --- 6. el silencio de una máquina tranquila -------------------------------

bloque('6. Sin acciones observadas, nadie aúna funciones');

{
  // Es distinto de «no se pudo medir»: aquí P-02 y P-03 están declarados y el
  // recolector miró. Que no haya habido actividad es un hecho.
  const silencio = juzga([], [P02, P03]);

  comprueba(
    'sin acciones, los cuatro requisitos del cruce cumplen',
    ['op.acc.3.1', 'op.acc.3.2', 'op.acc.3.r1.1', 'op.acc.3.r1.2'].every(
      requisito => veredicto(silencio, requisito)?.status === 'CUMPLE'
    ),
    ['op.acc.3.1', 'op.acc.3.2', 'op.acc.3.r1.1', 'op.acc.3.r1.2']
      .map(r => `${r}=${veredicto(silencio, r)?.status}`)
      .join(' ')
  );

  comprueba(
    'y el motivo lo dice, en vez de fingir que se midió algo',
    (veredicto(silencio, 'op.acc.3.1')?.reason || '')
      .includes('No se ha observado ninguna acción'),
    veredicto(silencio, 'op.acc.3.1')?.reason
  );
}

// --- 7. la traza que recorre el auditor ------------------------------------

bloque('7. Toda decisión sale con su traza completa');

{
  const resultado = juzga(
    [
      accion('pgarcia', '/usr/bin/git', '/srv/repos/app'),
      accion('pgarcia', '/usr/bin/systemctl'),
    ],
    [P02, P03]
  );

  comprueba(
    'ninguna decisión sale sin policyId',
    resultado.decisions.every(decision => Boolean(decision.policyId)),
    resultado.decisions.filter(d => !d.policyId).length + ' sin policyId'
  );

  comprueba(
    'ninguna decisión sale sin traza',
    resultado.decisions.every(decision => Boolean(decision.trace)),
    resultado.decisions.filter(d => !d.trace).length + ' sin traza'
  );

  comprueba(
    'y la traza de un incumplimiento dice qué se esperaba y qué hay',
    Boolean(veredicto(resultado, 'op.acc.3.1')?.trace?.expected) &&
      Boolean(veredicto(resultado, 'op.acc.3.1')?.trace?.actual),
    JSON.stringify(veredicto(resultado, 'op.acc.3.1')?.trace)
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
