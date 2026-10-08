/**
 * Declaración de Aplicabilidad: excluir un control entero cuando el sistema no
 * tiene aquello que el control regula.
 *
 *     docker run --rm -v "$PWD":/w -w /w node:22-alpine npx --yes tsx tests/applicability-declaration.test.ts
 *
 * POR QUÉ EXISTE ESTE FICHERO. op.acc.5 regula cómo se autentican los usuarios
 * AJENOS a la organización. En un servidor donde no se autentica nadie de fuera
 * no hay nada que medir, y el motor lo publicaba como 0 %: un incumplimiento
 * inventado que además hundía el índice global. El ENS resuelve eso con la
 * Declaración de Aplicabilidad, que excluye una medida con su justificación.
 *
 * Pero una exclusión es la forma más cómoda de esconder un incumplimiento, así
 * que este fichero prueba sobre todo LOS LÍMITES:
 *
 *   1. una declaración INCOMPLETA no excluye — sin motivo, sin referencia o sin
 *      un documento al que apuntar es una casilla marcada, no una prueba;
 *   2. una declaración NUNCA tapa lo medido — si en la máquina se ha medido o
 *      acreditado cualquier requisito del control, el sujeto existe y la
 *      exclusión queda contradicha, a la vista.
 */
import {
  describeDeclaration,
  isDeclarationSufficient,
  parseApplicabilityDeclaration,
} from '../public/ens/configuration/services/applicability-service';
import { applyApplicabilityDeclaration } from '../public/ens/core/evaluation/requirement/applicability';
import {
  evaluateRequirements,
  type ENSRequirementEvaluationResult,
} from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../public/ens/core/evaluation/control/control-evaluator';
import { opAcc5CatalogDefinition } from '../public/ens/catalog/op-acc-5';
import { opAcc5Configuration } from '../public/ens/configuration/data/op-acc-5-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../public/ens/configuration/types';

declare const process: { exit(code: number): void };

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

const configuracion = (filas: string[]): ENSControlConfiguration =>
  ({
    ...opAcc5Configuration,
    parameters: [
      {
        id: 'P-DA',
        controlId: 'op.acc.5',
        name: 'declaracion_aplicabilidad',
        label: 'Declaración de Aplicabilidad',
        description: '',
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        requirements: [],
        type: 'table',
        example: '',
        required: false,
        wazuhUsage: '',
        ensfacilUsage: '',
        evidenceIds: [],
        ruleIds: [],
        ifNotConfigured: '',
        value: filas,
      } as unknown as ENSControlParameter,
    ],
  }) as ENSControlConfiguration;

const DECLARACION_BUENA =
  'El sistema no tiene usuarios externos: solo administración interna | Declaración de Aplicabilidad v2 | https://intranet/da-v2.pdf | 2026-09-01 | Responsable de Seguridad';

// Lo que sale hoy en un servidor sin sujeto: nada medido, todo sin demostrar.
const sinSujeto = (): ENSRequirementEvaluationResult[] =>
  evaluateRequirements(
    opAcc5CatalogDefinition.requirements,
    'MEDIO',
    [],
    false,
    [],
    'ACTIVE'
  );

const excluye = (filas: string[], base = sinSujeto()) =>
  applyApplicabilityDeclaration(
    base,
    parseApplicabilityDeclaration(configuracion(filas))
  );

// --- 1. sin sujeto y con declaración completa, el control no aplica ----------

bloque('1. Declaración completa y nada medido: el control sale del índice');

{
  const base = sinSujeto();

  comprueba(
    'punto de partida: sin declaración, el control puntúa (y mal)',
    evaluateControlStatus(base).applicableRequirements > 0,
    String(evaluateControlStatus(base).applicableRequirements)
  );

  const excluido = excluye([DECLARACION_BUENA]);
  const control = evaluateControlStatus(excluido);

  comprueba(
    'todos los requisitos pasan a NO_APLICA',
    excluido.every(r => r.status === 'NO_APLICA' && r.applicable === false),
    excluido.map(r => r.status).join(',')
  );

  comprueba(
    'el control queda NO_APLICA y SIN número, no con un 0',
    control.status === 'NO_APLICA' && control.score === undefined,
    `${control.status} score=${control.score}`
  );

  comprueba(
    'cada requisito dice por qué: la referencia y el motivo están a la vista',
    excluido.every(r =>
      r.observations.some(
        o =>
          o.includes('Declaración de Aplicabilidad v2') &&
          o.includes('no tiene usuarios externos')
      )
    )
  );

  comprueba(
    'nada queda marcado como medido ni como acreditado',
    excluido.every(r => r.evidenced === false && r.attested !== true)
  );
}

// --- 2. una declaración incompleta no excluye nada ---------------------------

bloque('2. Una declaración incompleta NO excluye');

{
  const casos: Array<[string, string]> = [
    [
      'sin enlace',
      'Sin usuarios externos | Declaración de Aplicabilidad v2 |  | 2026-09-01 | RSI',
    ],
    [
      'con el enlace de ejemplo',
      'Sin usuarios externos | Declaración de Aplicabilidad v2 | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-09-01 | RSI',
    ],
    [
      'sin motivo',
      ' | Declaración de Aplicabilidad v2 | https://intranet/da-v2.pdf | 2026-09-01 | RSI',
    ],
    [
      'sin referencia',
      'Sin usuarios externos |  | https://intranet/da-v2.pdf | 2026-09-01 | RSI',
    ],
    ['con texto suelto en lugar de enlace', 'Sin usuarios externos | DA v2 | está en el SharePoint | 2026-09-01 | RSI'],
  ];

  for (const [nombre, fila] of casos) {
    const resultado = excluye([fila]);

    comprueba(
      `${nombre} → el control sigue puntuando`,
      evaluateControlStatus(resultado).applicableRequirements > 0,
      evaluateControlStatus(resultado).status
    );
  }

  comprueba(
    'isDeclarationSufficient rechaza una declaración sin enlace utilizable',
    !isDeclarationSufficient(
      parseApplicabilityDeclaration(configuracion([casos[1][1]]))
    )
  );
}

// --- 3. lo medido manda sobre la declaración ---------------------------------

bloque('3. Ninguna declaración tapa lo que se ha medido');

{
  const medido = sinSujeto().map((r, i) =>
    i === 3
      ? {
          ...r,
          status: 'NO_CUMPLE' as const,
          evidenced: true,
          observations: ['se midió un servicio de acceso externo'],
        }
      : r
  );

  const resultado = excluye([DECLARACION_BUENA], medido);

  comprueba(
    'con un requisito medido, el control sigue en el índice',
    evaluateControlStatus(resultado).applicableRequirements > 0
  );

  comprueba(
    'el requisito medido conserva su NO_CUMPLE',
    resultado[3].status === 'NO_CUMPLE',
    resultado[3].status
  );

  comprueba(
    'y se ve que lo medido contradice la exclusión',
    resultado[3].observations.some(o => o.includes('contradice la exclusión'))
  );

  const acreditado = sinSujeto().map((r, i) =>
    i === 0
      ? { ...r, status: 'CUMPLE' as const, evidenced: true, attested: true }
      : r
  );

  comprueba(
    'un requisito acreditado por documento también contradice la exclusión',
    evaluateControlStatus(excluye([DECLARACION_BUENA], acreditado))
      .applicableRequirements > 0
  );
}

// --- 4. sin declaración no cambia nada ---------------------------------------

bloque('4. Sin declaración, el motor no cambia');

{
  const base = sinSujeto();
  const resultado = applyApplicabilityDeclaration(base, undefined);

  comprueba(
    'devuelve los mismos estados',
    resultado.map(r => r.status).join() === base.map(r => r.status).join()
  );

  comprueba(
    'una tabla vacía tampoco excluye',
    evaluateControlStatus(excluye([])).applicableRequirements > 0
  );
}

// --- 5. el parámetro existe en op.acc.5 y no bloquea a nadie -----------------

bloque('5. op.acc.5 declara P-DA y no es obligatorio');

{
  const pda = opAcc5Configuration.parameters.find(p => p.id === 'P-DA');

  comprueba('op.acc.5 tiene P-DA', Boolean(pda));
  comprueba(
    'no es obligatorio: sin declaración el control se evalúa normal',
    pda?.required === false
  );
  comprueba(
    'es una tabla con motivo | referencia | enlace | fecha | responsable',
    pda?.type === 'table' &&
      (pda?.columns || []).map(c => c.name).join('|') ===
        'motivo|referencia|enlace|fecha|responsable',
    (pda?.columns || []).map(c => c.name).join('|')
  );

  const decl = parseApplicabilityDeclaration(configuracion([DECLARACION_BUENA]));

  comprueba(
    'la frase dice siempre que es una exclusión declarada',
    Boolean(decl) &&
      describeDeclaration(decl!).startsWith(
        'Excluido por la Declaración de Aplicabilidad'
      )
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
