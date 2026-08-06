/**
 * Atestación documental: acreditar por documento lo que ninguna telemetría
 * puede demostrar.
 *
 *     ~/.bun/bin/bun run tests/atestacion-documental.test.ts
 *
 * POR QUÉ EXISTE ESTE FICHERO. `op.acc.1.5` (eIDAS) y `op.acc.1.r1.1`
 * (singularizar a la persona) no son requisitos técnicos y no lo van a ser: un
 * agente no puede observar ninguno de los dos, y su prueba es un documento
 * aprobado, que es como los audita un auditor humano. Rechazarlos por no tener
 * telemetría dejaba op.acc.1 con un techo permanente del 75 % sobre algo que el
 * cliente puede tener perfectamente cumplido.
 *
 * Pero una atestación es exactamente por donde entraría un CUMPLE falso, así
 * que este fichero prueba sobre todo LOS DOS LÍMITES:
 *
 *   1. una atestación NO puede tapar una medida que falla — solo se admite en
 *      requisitos que el catálogo declara con `evidenceIds: []`;
 *   2. una atestación incompleta NO acredita — una casilla marcada no es una
 *      prueba.
 *
 * Y que lo acreditado va MARCADO como documental: el requisito cumple, pero
 * `attested` lo separa de lo medido para que la pantalla y el informe no puedan
 * confundirlos.
 */
import {
  describeAttestation,
  isAttestationSufficient,
  parseRequirementAttestations,
} from '../dashboard/ens/configuration/services/attestation-service';
import { evaluateRequirement } from '../dashboard/ens/core/evaluation/requirement/requirement-evaluator';
import { opAcc1CatalogDefinition } from '../dashboard/ens/catalog/op-acc-1';
import { opAcc1Configuration } from '../dashboard/ens/configuration/data/op-acc-1-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../dashboard/ens/configuration/types';
import type { ENSEvidenceResolved } from '../dashboard/ens/core/evidence/types';
import { getEvidenceDefinitions } from '../dashboard/ens/core/evidence/registry';

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

const configuracion = (
  filas: string[]
): ENSControlConfiguration =>
  ({
    controlId: 'op.acc.1',
    controlName: 'Identificación',
    family: 'Marco operacional',
    enabled: true,
    applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
    parameters: [
      {
        id: 'P-ATT',
        controlId: 'op.acc.1',
        name: 'atestaciones_documentales',
        label: 'Atestaciones',
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

const requisito = (id: string) => {
  const encontrado = opAcc1CatalogDefinition.requirements.find(
    item => item.id === id
  );

  if (!encontrado) {
    throw new Error(`fixture rota: ${id} no está en el catálogo`);
  }

  return encontrado;
};

const evidencia = (
  evidenciaId: string,
  status: ENSEvidenceResolved['status']
): ENSEvidenceResolved => {
  const definicion = getEvidenceDefinitions('op.acc.1').find(
    item => item.id === evidenciaId
  );

  if (!definicion) {
    throw new Error(`fixture rota: ${evidenciaId}`);
  }

  return { ...definicion, status, observations: [] } as ENSEvidenceResolved;
};

const ATESTACION_BUENA =
  'op.acc.1.5 | Política de identificación v3 | https://intranet/pol-id-v3.pdf | 2026-05-12 | RSI';

const juzga = (
  requisitoId: string,
  filas: string[],
  evidencias: ENSEvidenceResolved[] = [],
  nivel: ENSLevel = 'MEDIO'
) =>
  evaluateRequirement(
    requisito(requisitoId),
    nivel,
    evidencias,
    false,
    [],
    'ACTIVE',
    parseRequirementAttestations(configuracion(filas)).get(requisitoId)
  );

// --- 1. lo que no tiene evidencia técnica, se acredita con documento --------

bloque('1. Un requisito sin evidencia técnica SÍ se puede acreditar');

{
  // op.acc.1.5 (eIDAS) no declara ninguna evidencia en el catálogo.
  comprueba(
    'op.acc.1.5 no tiene evidencia técnica en el catálogo',
    requisito('op.acc.1.5').evidenceIds.length === 0,
    String(requisito('op.acc.1.5').evidenceIds.length)
  );

  const sin = juzga('op.acc.1.5', []);

  comprueba(
    'sin atestación NO cumple, que es el criterio por defecto',
    sin.status === 'NO_CUMPLE',
    sin.status
  );

  const con = juzga('op.acc.1.5', [ATESTACION_BUENA]);

  comprueba(
    'con el documento y su enlace, CUMPLE',
    con.status === 'CUMPLE',
    con.status
  );

  // Y VA MARCADO. Es lo que impide que se confunda con una medida.
  comprueba(
    'pero marcado como acreditado documentalmente, no como medido',
    con.attested === true,
    String(con.attested)
  );

  comprueba(
    'y el motivo nombra el documento y deja el enlace',
    (con.observations[0] || '').includes('Política de identificación v3') &&
      (con.observations[0] || '').includes('https://intranet/pol-id-v3.pdf'),
    con.observations[0]
  );

  // La reversión que separa lo documental de lo medido: un requisito que SÍ se
  // mide no lleva la marca.
  const medido = juzga(
    'op.acc.1.1',
    [],
    [evidencia('EV-03', 'CUMPLE')]
  );

  comprueba(
    'un requisito medido cumple SIN la marca de atestación',
    medido.status === 'CUMPLE' && !medido.attested,
    `${medido.status} attested=${medido.attested}`
  );
}

// --- 2. EL LÍMITE: no puede tapar una medida -------------------------------

bloque('2. Una atestación NO puede tapar una medida que falla');

{
  // op.acc.1.1 SÍ tiene evidencia técnica (EV-03). Se declara una atestación
  // para él y la evidencia en rojo: tiene que seguir sin cumplir.
  const conTrampa = juzga(
    'op.acc.1.1',
    ['op.acc.1.1 | Un documento cualquiera | https://intranet/lo-que-sea.pdf'],
    [evidencia('EV-03', 'NO_CUMPLE')]
  );

  comprueba(
    'el requisito medido y fallando sigue en NO_CUMPLE',
    conTrampa.status === 'NO_CUMPLE',
    conTrampa.status
  );

  comprueba(
    'y no se marca como atestado',
    !conTrampa.attested,
    String(conTrampa.attested)
  );

  // Ni siquiera cuando la evidencia no ha llegado: si el catálogo declara que
  // ese requisito SE MIDE, la prueba tiene que ser la medida.
  const sinDatos = juzga(
    'op.acc.1.1',
    ['op.acc.1.1 | Un documento cualquiera | https://intranet/lo-que-sea.pdf'],
    []
  );

  comprueba(
    'ni tapando una evidencia que no ha llegado',
    sinDatos.status === 'NO_CUMPLE' && !sinDatos.attested,
    `${sinDatos.status} attested=${sinDatos.attested}`
  );
}

// --- 3. EL OTRO LÍMITE: una casilla marcada no es una prueba ---------------

bloque('3. Una atestación incompleta NO acredita');

{
  const casos: [string, string][] = [
    ['sin enlace', 'op.acc.1.5 | Política de identificación v3'],
    ['con un enlace que no lleva a ninguna parte',
     'op.acc.1.5 | Política v3 | está en el SharePoint'],
    ['sin documento', 'op.acc.1.5 |  | https://intranet/algo.pdf'],
  ];

  for (const [nombre, fila] of casos) {
    const resultado = juzga('op.acc.1.5', [fila]);

    comprueba(
      `${nombre}: no acredita`,
      resultado.status === 'NO_CUMPLE' && !resultado.attested,
      `${resultado.status} attested=${resultado.attested}`
    );
  }

  // La reversión: con las dos cosas, sí.
  comprueba(
    'y con documento Y enlace, sí acredita',
    juzga('op.acc.1.5', [ATESTACION_BUENA]).status === 'CUMPLE'
  );

  // La fecha y el responsable NO bloquean: una política sin fecha sigue siendo
  // una política, mientras que una sin documento al que apuntar no es nada.
  comprueba(
    'la fecha y el responsable son deseables, no bloqueantes',
    juzga('op.acc.1.5', [
      'op.acc.1.5 | Política v3 | https://intranet/p.pdf',
    ]).status === 'CUMPLE'
  );
}

// --- 4. varios enlaces -----------------------------------------------------

bloque('4. Varios enlaces en la misma atestación');

{
  const atestaciones = parseRequirementAttestations(
    configuracion([
      'op.acc.1.5 | Política v3 y su anexo | https://a/p.pdf https://a/anexo.pdf | 2026-05-12',
    ])
  );

  const a = atestaciones.get('op.acc.1.5');

  comprueba(
    'se conservan los dos enlaces',
    a?.links.length === 2,
    String(a?.links.length)
  );

  comprueba(
    'y los dos salen en el motivo',
    describeAttestation(a!).includes('https://a/anexo.pdf'),
    describeAttestation(a!)
  );

  // Se admiten rutas de red y file://, que es como media administración guarda
  // sus políticas. Lo que no se admite es texto suelto.
  comprueba(
    'una ruta de red vale como enlace',
    isAttestationSufficient(
      parseRequirementAttestations(
        configuracion(['op.acc.1.5 | Política | \\\\srv\\politicas\\id.pdf'])
      ).get('op.acc.1.5')
    )
  );
}

// --- 5. el techo del control desaparece ------------------------------------

bloque('5. Con los dos documentales acreditados, op.acc.1 llega al 100 %');

{
  // Los dos requisitos que ponían el techo del 75 % en MEDIO.
  const documentales = ['op.acc.1.5', 'op.acc.1.r1.1'];

  for (const id of documentales) {
    comprueba(
      `${id} · sin evidencia técnica en el catálogo`,
      requisito(id).evidenceIds.length === 0
    );
  }

  const filas = [
    'op.acc.1.5 | Política de identificación v3 | https://intranet/pol-id.pdf | 2026-05-12 | RSI',
    'op.acc.1.r1.1 | Procedimiento de alta de personal v2 | https://intranet/alta.pdf | 2026-04-01 | RRHH',
  ];

  const acreditados = documentales.map(id => juzga(id, filas));

  comprueba(
    'los dos acreditan con su documento',
    acreditados.every(r => r.status === 'CUMPLE' && r.attested),
    acreditados.map(r => `${r.id}=${r.status}/${r.attested}`).join(' ')
  );

  // La reversión: si se declara SOLO uno, el otro sigue sin cumplir. Sin esto,
  // la prueba pasaría igual con una implementación que acreditara todo.
  const soloUno = juzga('op.acc.1.r1.1', [filas[0]]);

  comprueba(
    'y declarar uno no acredita al otro',
    soloUno.status === 'NO_CUMPLE',
    soloUno.status
  );
}

// --- 6. el EJEMPLO del parámetro no puede acreditar ------------------------

bloque('6. El ejemplo que se entrega no acredita nada');

{
  // Lo destaparon `hueco-de-medida` y `vista-general-agregada`, que rellenan
  // cada parámetro con su propio `example`: con un ejemplo utilizable,
  // op.acc.1.5 salía acreditado en una configuración de prueba, y en
  // producción bastaría con copiar la fila tal cual para tener un requisito en
  // verde apuntando a un documento que no existe.
  //
  // Misma disciplina que en op.acc.2: copiar la plantilla `.example` no
  // configura nada, porque declararía como política un ejemplo.
  const ejemplo = opAcc1Configuration.parameters.find(
    parametro => parametro.id === 'P-ATT'
  )?.example;

  comprueba(
    'el parámetro trae un ejemplo, para que se vea la forma',
    Boolean(ejemplo && ejemplo.includes('|')),
    ejemplo
  );

  const conElEjemplo = juzga('op.acc.1.5', [ejemplo || '']);

  comprueba(
    'pero copiarlo tal cual NO acredita',
    conElEjemplo.status === 'NO_CUMPLE' && !conElEjemplo.attested,
    `${conElEjemplo.status} attested=${conElEjemplo.attested}`
  );

  // La reversión: el mismo ejemplo con un enlace de verdad sí acredita, así
  // que lo que rechaza es el enlace de mentira y no la fila entera.
  const conEnlaceReal = juzga('op.acc.1.5', [
    (ejemplo || '').replace(
      /https:\/\/EJEMPLO\.invalido\/[^ |]+/,
      'https://intranet/politica-real.pdf'
    ),
  ]);

  comprueba(
    'y con un enlace real, la misma fila sí acredita',
    conEnlaceReal.status === 'CUMPLE' && conEnlaceReal.attested === true,
    `${conEnlaceReal.status} attested=${conEnlaceReal.attested}`
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
