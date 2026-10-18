/**
 * La fila de la matriz se identifica por SUJETO Y RECURSO, no solo por sujeto.
 *
 *     docker run --rm -v "$PWD":/w -w /w node:22-alpine npx --yes tsx tests/table-composite-key.test.ts
 *
 * POR QUÉ EXISTE ESTE FICHERO. `CONFORME_A_TABLA` indexaba la política por una
 * sola columna y, cuando la misma clave se repetía, se quedaba con la última
 * fila. En op.acc.4 eso significaba juzgar el `sudo` de root contra la fila del
 * cortafuegos de root: un privilegio correctamente declarado salía como
 * incumplimiento, y el auditor leía una no conformidad que no existe. El 23/09
 * era la única razón por la que op.acc.4 no pasaba de 20 % en wazuh-real.
 *
 * El límite que se prueba: la clave compuesta NO relaja nada. Un privilegio que
 * no figura en la matriz sigue siendo un hallazgo, y una fila que declara otro
 * acceso para ese mismo recurso sigue incumpliendo.
 */
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { opAcc4Configuration } from '../common/ens/configuration/data/op-acc-4-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../common/ens/configuration/types';

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

const AHORA = new Date('2026-09-23T12:00:00Z');

let contador = 0;

const hecho = (
  sujeto: string,
  recurso: string,
  acceso: string
): ENSNormalizedEvent => ({
  id: `evt-${(contador += 1)}`,
  agentId: '024',
  controlId: 'op.acc.4',
  evidenceId: 'EV-02',
  eventType: 'privilege_grant',
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-09-23T11:00:00Z',
  attributes: { sujeto, recurso, acceso },
});

const latido = (): ENSNormalizedEvent => ({
  id: `evt-${(contador += 1)}`,
  agentId: '024',
  controlId: 'op.acc.4',
  eventType: 'collector_run',
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-09-23T11:00:30Z',
  attributes: { resultado: 'completada', evidencias_cubiertas: 'EV-02' },
});

const configuracion = (matriz: string[]): ENSControlConfiguration => ({
  ...opAcc4Configuration,
  parameters: opAcc4Configuration.parameters.map(parametro =>
    parametro.id === 'P-01'
      ? ({ ...parametro, value: matriz } as ENSControlParameter)
      : ({ ...parametro } as ENSControlParameter)
  ),
});

const estadoEV02 = (matriz: string[], hechos: ENSNormalizedEvent[]) =>
  resolveEvidenceForControl(
    'op.acc.4',
    [...hechos, latido()],
    '024',
    'MEDIO',
    configuracion(matriz),
    AHORA
  ).find(evidencia => evidencia.id === 'EV-02');

// --- 1. un sujeto con varios recursos ----------------------------------------

bloque('1. Cada privilegio se juzga contra la fila de SU recurso');

{
  const matriz = [
    'root | sudo | ALL=(ALL:ALL) ALL,ALL=(ALL) NOPASSWD:ALL',
    'root | cortafuegos | administracion del cortafuegos del sistema',
  ];

  const resultado = estadoEV02(matriz, [
    hecho('root', 'sudo', 'ALL=(ALL:ALL) ALL'),
    hecho('root', 'sudo', 'ALL=(ALL) NOPASSWD:ALL'),
    hecho('root', 'cortafuegos', 'administracion del cortafuegos del sistema'),
  ]);

  comprueba(
    'los tres privilegios declarados CUMPLEN',
    resultado?.status === 'CUMPLE',
    `${resultado?.status}: ${(resultado?.observations || []).join(' ¦ ').slice(0, 200)}`
  );
}

// --- 2. el límite: la clave compuesta no relaja nada --------------------------

bloque('2. Lo que no está declarado sigue siendo un hallazgo');

{
  const matriz = [
    'root | sudo | ALL=(ALL:ALL) ALL',
    'root | cortafuegos | administracion del cortafuegos del sistema',
  ];

  const conAccesoDeMas = estadoEV02(matriz, [
    hecho('root', 'sudo', 'ALL=(ALL) NOPASSWD:ALL'),
  ]);

  comprueba(
    'un acceso que la fila de ese recurso no declara NO cumple',
    conAccesoDeMas?.status === 'NO_CUMPLE',
    String(conAccesoDeMas?.status)
  );

  const recursoSinFila = estadoEV02(matriz, [
    hecho('root', 'base de datos', 'lectura y escritura'),
  ]);

  comprueba(
    'un recurso sin fila no se da por bueno: no hay política contra la que medir',
    recursoSinFila?.status !== 'CUMPLE',
    String(recursoSinFila?.status)
  );

  const otroSujeto = estadoEV02(matriz, [
    hecho('invitado', 'sudo', 'ALL=(ALL:ALL) ALL'),
  ]);

  comprueba(
    'otro sujeto con el mismo recurso tampoco hereda la fila de root',
    otroSujeto?.status !== 'CUMPLE',
    String(otroSujeto?.status)
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
