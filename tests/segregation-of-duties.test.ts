/**
 * La correlación de op.acc.3: funciones incompatibles en la misma cuenta.
 *
 *     ~/.bun/bin/bun run tests/segregation-of-duties.test.ts
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
import { opAcc3PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-acc-3.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opAcc3CatalogDefinition } from '../common/ens/catalog/op-acc-3';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

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

// El latido del recolector. Una máquina TRANQUILA no es una máquina MUDA: la
// tranquila ejecuta su recolector, no encuentra nada y lo dice; la muda no
// reporta. Las fixtures de silencio llevan latido porque representan la
// primera, que es la que puede acreditar. Ver el caso 9.
const LATIDO: ENSNormalizedEvent = {
  id: 'latido-fixture',
  controlId: 'op.acc.3',
  eventType: 'collector_run',
  sourceType: 'WAZUH_ALERT',
  timestamp: new Date().toISOString(),
};

// Los cuatro pares que declara un despliegue real. Cada requisito se juzga
// contra EL SUYO: op.acc.3.1 contra desarrollo|operacion, op.acc.3.2 contra
// autorizacion|control, y los dos R1 contra los suyos. Antes del 07/08/2026 la
// policy cruzaba todos contra todos y una cuenta que aunaba desarrollo y
// operación teñía también op.acc.3.2, que no habla de eso.
const P02 = parametro('P-02', [
  'desarrollo | operacion',
  'autorizacion | control',
  'configuracion | mantenimiento',
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

  const d = veredicto(unaSola, 'op.acc.3.2');

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
    veredicto(dos, 'op.acc.3.2')?.status === 'CUMPLE',
    veredicto(dos, 'op.acc.3.2')?.status
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
    veredicto(repetida, 'op.acc.3.2')?.status === 'NO_CUMPLE',
    veredicto(repetida, 'op.acc.3.2')?.status
  );
}

bloque('5. Una tarea que no se ejecutó no incumple');

{
  const P04 = parametro('P-04', ['restauracion de copia | 2']);

  // Ninguna ejecución de esa tarea en el periodo. Exigirle concurrencia sería
  // acusar por una ausencia, y aquí la ausencia no es un hallazgo: es que no
  // hubo restauración esta semana.
  const sinEjecucion = juzga([LATIDO], [P02, P03, P04]);

  comprueba(
    'sin ninguna ejecución, el enunciado general cumple',
    veredicto(sinEjecucion, 'op.acc.3.2')?.status === 'CUMPLE',
    veredicto(sinEjecucion, 'op.acc.3.2')?.status
  );

  // La reversión: en cuanto se ejecuta mal, sí acusa.
  const ejecutadaMal = juzga(
    [tarea('restauracion de copia', 'pgarcia')],
    [P02, P03, P04]
  );

  comprueba(
    'pero en cuanto se ejecuta con una sola persona, acusa',
    veredicto(ejecutadaMal, 'op.acc.3.2')?.status === 'NO_CUMPLE',
    veredicto(ejecutadaMal, 'op.acc.3.2')?.status
  );

  // Sin P-04 no se puede medir, y lo dice.
  const sinP04 = juzga([tarea('lo que sea', 'x')], [P02, P03]);

  comprueba(
    'sin P-04 el enunciado general sale NO_EVALUABLE nombrándolo',
    veredicto(sinP04, 'op.acc.3.2')?.status === 'NO_EVALUABLE' &&
      (veredicto(sinP04, 'op.acc.3.2')?.reason || '').includes('P-04'),
    veredicto(sinP04, 'op.acc.3.2')?.reason
  );
}

// --- 6. el silencio de una máquina tranquila -------------------------------

bloque('6. Sin acciones observadas, nadie aúna funciones');

{
  // Es distinto de «no se pudo medir»: aquí P-02 y P-03 están declarados y el
  // recolector miró. Que no haya habido actividad es un hecho.
  //
  // op.acc.3.2 va aparte a propósito: mide DOS cosas, el cruce y la
  // concurrencia de P-04, y esta fixture no declara P-04. Silencio con la
  // política a medias no es cumplimiento, es media medida — y media medida no
  // acredita nada. El caso de abajo prueba que con P-04 sí cumple.
  const silencio = juzga([LATIDO], [P02, P03]);

  comprueba(
    'sin acciones, los tres requisitos que solo miden el cruce cumplen',
    ['op.acc.3.1', 'op.acc.3.r1.1', 'op.acc.3.r1.2'].every(
      requisito => veredicto(silencio, requisito)?.status === 'CUMPLE'
    ),
    ['op.acc.3.1', 'op.acc.3.r1.1', 'op.acc.3.r1.2']
      .map(r => `${r}=${veredicto(silencio, r)?.status}`)
      .join(' ')
  );

  comprueba(
    'y op.acc.3.2 NO cumple por silencio si le falta P-04',
    veredicto(silencio, 'op.acc.3.2')?.status === 'NO_EVALUABLE' &&
      (veredicto(silencio, 'op.acc.3.2')?.reason || '').includes('P-04'),
    veredicto(silencio, 'op.acc.3.2')?.reason
  );

  // La reversión: con P-04 declarado, el mismo silencio sí cumple.
  const silencioCompleto = juzga(
    [LATIDO],
    [P02, P03, parametro('P-04', ['despliegue en produccion | 2'])]
  );

  comprueba(
    'con P-04 declarado, el mismo silencio sí cumple',
    veredicto(silencioCompleto, 'op.acc.3.2')?.status === 'CUMPLE',
    veredicto(silencioCompleto, 'op.acc.3.2')?.status
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

// --- 8. ninguna decisión puede caer en un requisito que no existe ----------
//
// ESTA COMPROBACIÓN NACE DE UN FALLO REAL, y de uno que las pruebas de arriba
// no solo dejaron pasar: reprodujeron.
//
// Hasta el 06/08/2026 la concurrencia se decidía contra `'op.acc.3'` — el id
// del CONTROL, no el de ningún requisito. `requirement-evaluator` casa con
// `decision.requirementId === requirement.id`, exacto, así que la decisión no
// la leía nadie: P-04 y EV-03 no movían el resultado ni un punto. El control
// existe para comprobar que dos personas distintas hacen una tarea crítica, y
// esa comprobación no llegaba a ninguna parte.
//
// Los casos 4 y 5 pasaban en verde porque preguntaban por `'op.acc.3'`, o sea
// por la misma cadena equivocada. Una prueba que copia el identificador del
// código que prueba no comprueba nada: comprueba que el código es igual a sí
// mismo. La única defensa es contrastar contra el CATÁLOGO, que es de donde
// sale la verdad.

bloque('8. Toda decisión aterriza en un requisito del catálogo');

{
  const requisitosDelCatalogo = new Set(
    opAcc3CatalogDefinition.requirements.map(r => r.id)
  );

  const completa = juzga(
    [
      accion('jgomez', 'git push', '/srv/app'),
      tarea('despliegue en produccion', 'pgarcia'),
    ],
    [
      P02,
      P03,
      parametro('P-04', ['despliegue en produccion | 2']),
      parametro('P-05', ['auditoria']),
    ]
  );

  // Y una vacía, que recorre las ramas de «no se puede medir».
  const vacia = juzga([LATIDO], []);

  [completa, vacia].forEach((resultado, i) => {
    const huerfanas = resultado.decisions
      .map(d => d.requirementId)
      .filter(id => !requisitosDelCatalogo.has(id));

    comprueba(
      `todas las decisiones existen en el catálogo (${i === 0 ? 'config completa' : 'sin configurar'})`,
      huerfanas.length === 0,
      huerfanas.join(', ')
    );
  });

  // Y al revés: EV-03 tiene que estar reclamada por algún requisito, porque una
  // evidencia que nadie reclama tampoco llega al informe.
  const evidenciasReclamadas = new Set(
    opAcc3CatalogDefinition.requirements.flatMap(r => r.evidenceIds)
  );

  comprueba(
    'EV-03 (concurrencia) la reclama algún requisito',
    evidenciasReclamadas.has('EV-03'),
    Array.from(evidenciasReclamadas).join(', ')
  );

  // La concurrencia decide de verdad: una tarea con una sola persona tiene que
  // teñir op.acc.3.2 aunque el cruce de funciones salga limpio.
  const soloConcurrencia = juzga(
    [tarea('despliegue en produccion', 'pgarcia')],
    [P02, P03, parametro('P-04', ['despliegue en produccion | 2'])]
  );

  comprueba(
    'la concurrencia tiñe op.acc.3.2 aunque el cruce esté limpio',
    veredicto(soloConcurrencia, 'op.acc.3.2')?.status === 'NO_CUMPLE',
    veredicto(soloConcurrencia, 'op.acc.3.2')?.status
  );

  // Y NO tiñe los otros tres: son el cruce y nada más.
  comprueba(
    'y no arrastra a op.acc.3.1, que solo mide el cruce',
    veredicto(soloConcurrencia, 'op.acc.3.1')?.status === 'CUMPLE',
    veredicto(soloConcurrencia, 'op.acc.3.1')?.status
  );
}

// --- 9. el silencio sin latido NO acredita --------------------------------
//
// UN CUMPLE FALSO ENCONTRADO EN PRODUCCIÓN el 07/08/2026.
//
// Cuando no se observaba ninguna acción, la policy respondía «no hay ninguna
// cuenta que aúne funciones» y daba CUMPLE: 100 puntos. Pero «no he visto a
// nadie aunar funciones» y «no he mirado» producen el MISMO conjunto vacío, y la
// policy no los distinguía. Una máquina sin recolector puntuaba 100 y subía la
// media del control.
//
// Se vio en wazuh-fake, que está en el índice del cliente y no tiene agente ENS.
//
// Lo que separa los dos casos es el latido `collector_run`, que es exactamente
// el mecanismo con el que este producto sostiene «silencio = cumplimiento».

bloque('9. Sin acciones y sin latido: NO_EVALUABLE, no CUMPLE');

{
  const latido = (cuando: Date): ENSNormalizedEvent => ({
    id: `latido-${cuando.getTime()}`,
    controlId: 'op.acc.3',
    eventType: 'collector_run',
    sourceType: 'WAZUH_ALERT',
    timestamp: cuando.toISOString(),
  });

  const AHORA = new Date(2026, 7, 7, 12, 0, 0);

  const juzgaEn = (
    eventos: ENSNormalizedEvent[]
  ) => {
    const evaluator = opAcc3PolicyDefinition.evaluator;

    if (!evaluator) {
      throw new Error('fixture rota');
    }

    return evaluator({
      ...buildPolicyContext(
        opAcc3CatalogDefinition,
        configuracion([P02, P03]),
        'ALTO',
        eventos,
        []
      ),
      now: AHORA,
    });
  };

  // EL CASO DE PRODUCCIÓN: ni acciones ni latido.
  const mudo = juzgaEn([]);

  comprueba(
    'sin acciones y sin latido, op.acc.3.1 NO cumple',
    veredicto(mudo, 'op.acc.3.1')?.status === 'NO_EVALUABLE',
    veredicto(mudo, 'op.acc.3.1')?.status
  );

  comprueba(
    'y el motivo dice que no consta que nadie haya mirado',
    (veredicto(mudo, 'op.acc.3.1')?.reason || '').includes('latido'),
    veredicto(mudo, 'op.acc.3.1')?.reason
  );

  // LA REVERSIÓN, que es la mitad importante: con latido reciente, el mismo
  // silencio SÍ acredita. Sin esto, una guarda demasiado dura dejaría en gris
  // a toda máquina tranquila y la prueba de arriba pasaría igual.
  const reciente = new Date(AHORA);
  reciente.setHours(reciente.getHours() - 2);

  const barrida = juzgaEn([latido(reciente)]);

  comprueba(
    'con latido reciente, el mismo silencio SÍ cumple',
    veredicto(barrida, 'op.acc.3.1')?.status === 'CUMPLE',
    veredicto(barrida, 'op.acc.3.1')?.status
  );

  // Un latido rancio tampoco vale: acredita el barrido de hace tres días, no el
  // silencio de hoy.
  const rancio = new Date(AHORA);
  rancio.setDate(rancio.getDate() - 3);

  comprueba(
    'un latido de hace tres días NO acredita',
    veredicto(juzgaEn([latido(rancio)]), 'op.acc.3.1')?.status === 'NO_EVALUABLE',
    veredicto(juzgaEn([latido(rancio)]), 'op.acc.3.1')?.status
  );

  // Y uno con fecha FUTURA menos: un reloj desviado valdría como latido
  // perpetuo y volvería verde para siempre una máquina muerta.
  const futuro = new Date(AHORA);
  futuro.setDate(futuro.getDate() + 5);

  comprueba(
    'un latido con fecha futura NO acredita',
    veredicto(juzgaEn([latido(futuro)]), 'op.acc.3.1')?.status === 'NO_EVALUABLE',
    veredicto(juzgaEn([latido(futuro)]), 'op.acc.3.1')?.status
  );

  // Y con acciones observadas no hace falta latido: el hecho es la prueba de
  // que se miró.
  const conAccion = juzgaEn([accion('jgomez', 'git push', '/srv/app')]);

  comprueba(
    'con acciones observadas, el latido no hace falta',
    veredicto(conAccion, 'op.acc.3.1')?.status === 'CUMPLE',
    veredicto(conAccion, 'op.acc.3.1')?.status
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
