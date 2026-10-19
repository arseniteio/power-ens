/**
 * La policy y las evidencias tienen que decir lo mismo.
 *
 *     npx tsx tests/policy-and-evidences.test.ts
 *
 * POR QUÉ EXISTE. op.acc.3 se veía así en producción el 07/08/2026:
 *
 *     Cumplimiento del control        100 %  CUMPLE
 *     Requisitos  2 de 2 cumplen
 *     Evidencias  0 de 7 cumplen · 5 sin prueba
 *
 * Un control al 100 % en el que NADA se había podido demostrar, con las dos
 * cifras a diez centímetros una de otra. Cualquiera que lo mire deja de fiarse
 * del informe entero, y hace bien.
 *
 * La causa: op.acc.3 decide sus REQUISITOS con una policy que lee hechos crudos,
 * y sus EVIDENCIAS están declaradas en el modelo clásico esperando un
 * `evidence_state` que su agente no emite —porque juzga la policy— y sin
 * `judgment` con el que derivarlo. No es que faltara un dato: no había ningún
 * camino por el que pudieran resolverse jamás.
 *
 * Lo que se prueba aquí es que el resultado de la policy llega a las evidencias
 * que ella misma declara medir, Y que eso no se convierte en una puerta trasera
 * para pisar una medida real.
 */
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';
import type { ENSPolicyDecision } from '../common/ens/core/policy-runtime/types';

declare const process: { exit(code: number): void };

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle?: unknown
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  console.log(`  FAIL ${nombre}${detalle !== undefined ? ` — ${String(detalle)}` : ''}`);
  fallos.push(nombre);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

const evidencia = (
  id: string,
  status: string
): ENSEvidenceResolved =>
  ({
    id,
    controlId: 'op.acc.3',
    status,
    observations: ['motivo original'],
    relatedRules: [],
  } as unknown as ENSEvidenceResolved);

const decision = (
  requirementId: string,
  status: string,
  evidenceIds: string[]
): ENSPolicyDecision =>
  ({
    policyId: 'op-acc-3',
    requirementId,
    status,
    evidenceIds,
    parameterIds: [],
    reason: `la policy dice ${status}`,
  } as unknown as ENSPolicyDecision);

const estadoDe = (
  lista: ENSEvidenceResolved[],
  id: string
): string | undefined => lista.find(e => e.id === id)?.status;

// --- 1. el caso de producción ---------------------------------------------

bloque('1. Lo que la policy midió llega a la evidencia');

{
  const resuelto = applyPolicyDecisionsToEvidences(
    [evidencia('EV-01', 'NO_EVALUABLE'), evidencia('EV-06', 'NO_EVALUABLE')],
    [decision('op.acc.3.1', 'CUMPLE', ['EV-01', 'EV-06'])]
  );

  comprueba(
    'una evidencia que el modelo clásico no pudo resolver toma el veredicto de la policy',
    estadoDe(resuelto, 'EV-01') === 'CUMPLE',
    estadoDe(resuelto, 'EV-01')
  );

  comprueba(
    'y se dice que la resolvió la policy, no el agente',
    (resuelto.find(e => e.id === 'EV-01')?.observations || []).some(o =>
      o.includes('política del control')
    ),
    JSON.stringify(resuelto.find(e => e.id === 'EV-01')?.observations)
  );

  comprueba(
    'sin perder el motivo que ya tenía',
    (resuelto.find(e => e.id === 'EV-01')?.observations || []).includes(
      'motivo original'
    )
  );
}

// --- 2. NUNCA pisa una medida ---------------------------------------------

bloque('2. Una evidencia ya medida manda sobre la policy');

{
  // LA MITAD QUE IMPIDE QUE ESTO SEA UNA PUERTA TRASERA. Si el agente observó un
  // incumplimiento, ninguna policy puede taparlo: eso sería el CUMPLE falso que
  // esto viene a quitar, con otra cara.
  const conHallazgo = applyPolicyDecisionsToEvidences(
    [evidencia('EV-01', 'NO_CUMPLE')],
    [decision('op.acc.3.1', 'CUMPLE', ['EV-01'])]
  );

  comprueba(
    'un NO_CUMPLE observado NO se convierte en CUMPLE por la policy',
    estadoDe(conHallazgo, 'EV-01') === 'NO_CUMPLE',
    estadoDe(conHallazgo, 'EV-01')
  );

  const yaCumple = applyPolicyDecisionsToEvidences(
    [evidencia('EV-01', 'CUMPLE')],
    [decision('op.acc.3.1', 'NO_CUMPLE', ['EV-01'])]
  );

  comprueba(
    'y un CUMPLE observado tampoco lo pisa la policy',
    estadoDe(yaCumple, 'EV-01') === 'CUMPLE',
    estadoDe(yaCumple, 'EV-01')
  );

  const noAplica = applyPolicyDecisionsToEvidences(
    [evidencia('EV-04', 'NO_APLICA')],
    [decision('op.acc.3.r1.1', 'CUMPLE', ['EV-04'])]
  );

  comprueba(
    'un NO_APLICA es una decisión de nivel y tampoco se toca',
    estadoDe(noAplica, 'EV-04') === 'NO_APLICA',
    estadoDe(noAplica, 'EV-04')
  );
}

// --- 3. entre varias decisiones, gana la peor -----------------------------

bloque('3. Si una evidencia respalda dos requisitos, gana el peor');

{
  const resuelto = applyPolicyDecisionsToEvidences(
    [evidencia('EV-06', 'NO_EVALUABLE')],
    [
      decision('op.acc.3.1', 'CUMPLE', ['EV-06']),
      decision('op.acc.3.2', 'NO_CUMPLE', ['EV-06']),
    ]
  );

  comprueba(
    'una evidencia que respalda un requisito que falla no sale en verde',
    estadoDe(resuelto, 'EV-06') === 'NO_CUMPLE',
    estadoDe(resuelto, 'EV-06')
  );

  // Y da igual el orden en que lleguen las decisiones.
  const alReves = applyPolicyDecisionsToEvidences(
    [evidencia('EV-06', 'NO_EVALUABLE')],
    [
      decision('op.acc.3.2', 'NO_CUMPLE', ['EV-06']),
      decision('op.acc.3.1', 'CUMPLE', ['EV-06']),
    ]
  );

  comprueba(
    'y da igual el orden de las decisiones',
    estadoDe(alReves, 'EV-06') === estadoDe(resuelto, 'EV-06'),
    `${estadoDe(alReves, 'EV-06')} vs ${estadoDe(resuelto, 'EV-06')}`
  );
}

// --- 4. lo que la policy no nombra, no se toca ----------------------------

bloque('4. Una evidencia que la policy no mide se queda como estaba');

{
  const resuelto = applyPolicyDecisionsToEvidences(
    [evidencia('EV-07', 'NO_EVALUABLE')],
    [decision('op.acc.3.1', 'CUMPLE', ['EV-01'])]
  );

  comprueba(
    'EV-07 sigue sin demostrar porque nadie la midió',
    estadoDe(resuelto, 'EV-07') === 'NO_EVALUABLE',
    estadoDe(resuelto, 'EV-07')
  );

  // Y sin decisiones, la lista sale intacta.
  const sinPolicy = applyPolicyDecisionsToEvidences(
    [evidencia('EV-01', 'NO_EVALUABLE')],
    []
  );

  comprueba(
    'sin ninguna decisión, nada cambia',
    estadoDe(sinPolicy, 'EV-01') === 'NO_EVALUABLE'
  );
}

// --- 5. una decisión que no nombra evidencias hereda las del requisito ----
//
// LA PIEZA QUE FALTABA, y sin ella el puente solo arreglaba medio problema.
//
// En op.acc.3 solo la decisión de op.acc.3.2 declaraba `evidenceIds`. Las otras
// tres iban con la lista vacía, así que EV-01 y EV-02 seguían en «sin prueba»
// mientras los requisitos que se apoyan en ellas salían decididos. En la misma
// pantalla: «EV-02 · sin prueba» arriba y «op.acc.3.2 · CUMPLE» abajo.
//
// Que una policy decida un requisito significa, POR DEFINICIÓN, que ha medido
// aquello con lo que ese requisito se demuestra. Si no dice cuáles, son las
// suyas. Depender de que el autor de la policy se acuerde de rellenar un campo
// es depender de que nadie olvide nada nunca.

bloque('5. Sin `evidenceIds`, la decisión hereda las del requisito');

{
  const REQUISITOS = [
    { id: 'op.acc.3.1', evidenceIds: ['EV-01', 'EV-06'] },
    { id: 'op.acc.3.2', evidenceIds: ['EV-02', 'EV-03', 'EV-06'] },
  ];

  // La decisión NO nombra evidencias, como hacía el cruce de op.acc.3.
  const sinNombrar = {
    ...decision('op.acc.3.1', 'NO_CUMPLE', []),
  } as ENSPolicyDecision;

  const resuelto = applyPolicyDecisionsToEvidences(
    [evidencia('EV-01', 'NO_EVALUABLE'), evidencia('EV-06', 'NO_EVALUABLE')],
    [sinNombrar],
    REQUISITOS
  );

  comprueba(
    'EV-01 toma el veredicto porque op.acc.3.1 se demuestra con ella',
    estadoDe(resuelto, 'EV-01') === 'NO_CUMPLE',
    estadoDe(resuelto, 'EV-01')
  );

  comprueba(
    'y EV-06 también, que es la otra del mismo requisito',
    estadoDe(resuelto, 'EV-06') === 'NO_CUMPLE',
    estadoDe(resuelto, 'EV-06')
  );

  // Y si la decisión SÍ las nombra, manda ella: una policy puede medir un
  // subconjunto y decirlo.
  const nombrando = applyPolicyDecisionsToEvidences(
    [evidencia('EV-01', 'NO_EVALUABLE'), evidencia('EV-06', 'NO_EVALUABLE')],
    [decision('op.acc.3.1', 'CUMPLE', ['EV-01'])],
    REQUISITOS
  );

  comprueba(
    'si la decisión nombra solo EV-01, EV-06 no se toca',
    estadoDe(nombrando, 'EV-01') === 'CUMPLE' &&
      estadoDe(nombrando, 'EV-06') === 'NO_EVALUABLE',
    `${estadoDe(nombrando, 'EV-01')} / ${estadoDe(nombrando, 'EV-06')}`
  );

  // Sin catálogo y sin nombres, no se toca nada: no se inventa a quién le toca.
  const aCiegas = applyPolicyDecisionsToEvidences(
    [evidencia('EV-01', 'NO_EVALUABLE')],
    [decision('op.acc.3.1', 'CUMPLE', [])],
    []
  );

  comprueba(
    'sin catálogo ni nombres, no se toca ninguna evidencia',
    estadoDe(aCiegas, 'EV-01') === 'NO_EVALUABLE',
    estadoDe(aCiegas, 'EV-01')
  );
}

// --- 6. lo nombrado y lo heredado ------------------------------------------

bloque('6. Lo nombrado manda sobre un HUECO heredado, nunca sobre un incumplimiento');

{
  // R1 se demuestra con EV-X y no la nombra (la hereda); R2 nombra EV-X.
  const REQUISITOS = [
    { id: 'R1', evidenceIds: ['EV-X'] },
    { id: 'R2', evidenceIds: ['EV-X'] },
  ];
  const resuelve = (heredada: string, nombrada: string) =>
    estadoDe(
      applyPolicyDecisionsToEvidences(
        [evidencia('EV-X', 'NO_EVALUABLE')],
        [decision('R1', heredada, []), decision('R2', nombrada, ['EV-X'])],
        REQUISITOS
      ),
      'EV-X'
    );

  comprueba(
    'un NO_EVALUABLE heredado no tapa un CUMPLE nombrado (R1 no se pudo medir por otra cosa)',
    resuelve('NO_EVALUABLE', 'CUMPLE') === 'CUMPLE',
    resuelve('NO_EVALUABLE', 'CUMPLE')
  );
  comprueba(
    'un NO_CUMPLE heredado SÍ manda: R1 se apoya en EV-X y no conforma',
    resuelve('NO_CUMPLE', 'CUMPLE') === 'NO_CUMPLE',
    resuelve('NO_CUMPLE', 'CUMPLE')
  );
  comprueba(
    'un PARCIAL heredado también manda sobre un CUMPLE nombrado',
    resuelve('PARCIAL', 'CUMPLE') === 'PARCIAL',
    resuelve('PARCIAL', 'CUMPLE')
  );
  comprueba(
    'y sobre un NO_EVALUABLE nombrado',
    resuelve('PARCIAL', 'NO_EVALUABLE') === 'PARCIAL',
    resuelve('PARCIAL', 'NO_EVALUABLE')
  );
  comprueba(
    'pero no sobre un nombrado peor: un NO_CUMPLE nombrado queda',
    resuelve('PARCIAL', 'NO_CUMPLE') === 'NO_CUMPLE',
    resuelve('PARCIAL', 'NO_CUMPLE')
  );
  comprueba(
    'sin nada nombrado, lo heredado se aplica como siempre (incluido un hueco)',
    estadoDe(
      applyPolicyDecisionsToEvidences([evidencia('EV-X', 'NO_EVALUABLE')], [decision('R1', 'CUMPLE', [])], REQUISITOS),
      'EV-X'
    ) === 'CUMPLE'
  );
}

// --- salida ---------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} check(s) FAIL:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
