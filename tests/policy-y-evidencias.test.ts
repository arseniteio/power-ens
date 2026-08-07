/**
 * La policy y las evidencias tienen que decir lo mismo.
 *
 *     npx tsx tests/policy-y-evidencias.test.ts
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
import { applyPolicyDecisionsToEvidences } from '../dashboard/ens/core/evaluation/policy-evidence-bridge';
import type { ENSEvidenceResolved } from '../dashboard/ens/core/evidence/types';
import type { ENSPolicyDecision } from '../dashboard/ens/core/policy-runtime/types';

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

  console.log(`  FALLA ${nombre}${detalle !== undefined ? ` — ${String(detalle)}` : ''}`);
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

// --- salida ---------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
