/**
 * Hechos de ESTADO: se juzgan con la última pasada del recolector.
 *
 *     docker run --rm -v "$PWD":/w -w /w node:22-alpine npx --yes tsx tests/state-facts.test.ts
 *
 * POR QUÉ EXISTE ESTE FICHERO. El motor juzgaba todos los hechos de la ventana
 * de 30 días. Para una ACCIÓN es lo correcto: una edición no autorizada hace
 * tres semanas sigue contando. Para un ESTADO no: en wazuh-real se endureció la
 * política de contraseñas a las 12:00, el recolector lo observó a las 12:07, y
 * el control seguía en NO_CUMPLE por la foto de las 11:47. Un auditor leía un
 * incumplimiento que ya no existía, y lo leería durante un mes.
 *
 * Lo que prueba este fichero, sobre todo LOS LÍMITES:
 *
 *   1. solo se descartan los tipos declarados como estado, y solo del control
 *      que los declara: las acciones siguen contando la ventana entera;
 *   2. la última pasada es POR AGENTE y A FECHA DE `now`: la serie diaria evalúa
 *      el pasado y no puede juzgarlo con una pasada posterior;
 *   3. sin dos pasadas no hay límite y no se descarta nada;
 *   4. lo declarado como estado es coherente con el catálogo;
 *   5. con el motor entero, una remediación real cambia el veredicto.
 */
import type { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';
import { ENSEvidenceCatalog } from '../dashboard/ens/core/evidence/catalog';
import {
  getStateFactEventTypes,
  keepLatestRunStateFacts,
} from '../dashboard/ens/core/evidence/state-facts';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
import { evaluateENSControl } from '../dashboard/ens/core/evaluation/evaluation-engine';
import {
  buildPolicyContext,
  runPolicyRuntime,
} from '../dashboard/ens/core/policy-runtime';
import { opExp3CatalogDefinition } from '../dashboard/ens/catalog/op-exp-3';
import { opExp3Configuration } from '../dashboard/ens/configuration/data/op-exp-3-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../dashboard/ens/configuration/types';

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

let contador = 0;

const evento = (
  controlId: string,
  eventType: string,
  timestamp: string,
  attributes: Record<string, unknown> = {},
  agentId = '024',
  evidenceId?: string
): ENSNormalizedEvent => ({
  id: `evt-${(contador += 1)}`,
  agentId,
  controlId,
  evidenceId,
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp,
  attributes,
});

const latido = (
  controlId: string,
  timestamp: string,
  agentId = '024',
  cubiertas = ''
) =>
  evento(
    controlId,
    'collector_run',
    timestamp,
    { resultado: 'completada', evidencias_cubiertas: cubiertas },
    agentId
  );

const AHORA = new Date('2026-09-17T13:00:00Z');

// --- 1. solo el estado declarado, solo en su control ---------------------------

bloque('1. Solo se descartan los estados de pasadas anteriores');

{
  const estados = getStateFactEventTypes('op.acc.6');

  comprueba(
    'op.acc.6 declara password_policy_checked como estado',
    estados.has('password_policy_checked')
  );
  comprueba(
    'authentication_success NO es estado: es una acción',
    !estados.has('authentication_success')
  );

  const eventos = [
    latido('op.acc.6', '2026-09-17T11:47:05Z'),
    evento('op.acc.6', 'password_policy_checked', '2026-09-17T11:47:03Z', { longitud_minima: '6' }),
    evento('op.acc.6', 'authentication_success', '2026-09-17T11:30:00Z', { usuario: 'dioni' }),
    latido('op.acc.6', '2026-09-17T12:07:31Z'),
    evento('op.acc.6', 'password_policy_checked', '2026-09-17T12:07:29Z', { longitud_minima: '12' }),
    evento('op.exp.3', 'service_running', '2026-09-17T09:00:00Z', { servicio: 'atd.service' }),
  ];

  const resultado = keepLatestRunStateFacts('op.acc.6', eventos, AHORA);
  const politicas = resultado.filter(e => e.eventType === 'password_policy_checked');

  comprueba(
    'queda solo la política de la última pasada',
    politicas.length === 1 && politicas[0].attributes?.longitud_minima === '12',
    politicas.map(p => String(p.attributes?.longitud_minima)).join(',')
  );
  comprueba(
    'la acción de antes de la última pasada se conserva',
    resultado.some(e => e.eventType === 'authentication_success')
  );
  comprueba(
    'los eventos de otro control no se tocan',
    resultado.some(e => e.controlId === 'op.exp.3')
  );
  comprueba(
    'los latidos se conservan (hacen falta para la cobertura)',
    resultado.filter(e => e.eventType === 'collector_run').length === 2
  );
}

// --- 2. por agente y a fecha de `now` -------------------------------------------

bloque('2. La última pasada es por agente y a fecha de la evaluación');

{
  const eventos = [
    latido('op.acc.6', '2026-09-17T10:47:05Z', '024'),
    latido('op.acc.6', '2026-09-17T11:47:05Z', '024'),
    evento('op.acc.6', 'password_policy_checked', '2026-09-17T11:47:03Z', { v: 'a-vieja' }, '024'),
    latido('op.acc.6', '2026-09-17T12:07:31Z', '024'),
    evento('op.acc.6', 'password_policy_checked', '2026-09-17T12:07:29Z', { v: 'a-nueva' }, '024'),
    // El LDAP solo ha pasado una vez: no tiene límite y conserva lo suyo.
    latido('op.acc.6', '2026-09-17T11:25:00Z', '028'),
    evento('op.acc.6', 'password_policy_checked', '2026-09-17T11:24:58Z', { v: 'b-unica' }, '028'),
  ];

  const hoy = keepLatestRunStateFacts('op.acc.6', eventos, AHORA)
    .filter(e => e.eventType === 'password_policy_checked')
    .map(e => String(e.attributes?.v))
    .sort();

  comprueba(
    'cada agente conserva la foto de SU última pasada',
    hoy.join(',') === 'a-nueva,b-unica',
    hoy.join(',')
  );

  // La serie diaria evalúa las 12:00: la pasada de las 12:07 aún no existía.
  const alMediodia = keepLatestRunStateFacts(
    'op.acc.6',
    eventos.filter(e => Date.parse(e.timestamp) <= Date.parse('2026-09-17T12:00:00Z')),
    new Date('2026-09-17T12:00:00Z')
  )
    .filter(e => e.eventType === 'password_policy_checked' && e.agentId === '024')
    .map(e => String(e.attributes?.v));

  comprueba(
    'evaluado a las 12:00, vale la pasada de las 11:47',
    alMediodia.join(',') === 'a-vieja',
    alMediodia.join(',')
  );

  // Aunque el conjunto traiga eventos posteriores, `now` manda.
  const conFuturo = keepLatestRunStateFacts(
    'op.acc.6',
    eventos,
    new Date('2026-09-17T12:00:00Z')
  )
    .filter(e => e.eventType === 'password_policy_checked' && e.agentId === '024')
    .map(e => String(e.attributes?.v));

  comprueba(
    'una pasada posterior a `now` no cuenta como la última',
    conFuturo.includes('a-vieja'),
    conFuturo.join(',')
  );
}

// --- 3. sin dos pasadas no se descarta nada -------------------------------------

bloque('3. Sin dos pasadas no hay límite');

{
  const eventos = [
    evento('op.acc.6', 'password_policy_checked', '2026-09-17T11:47:03Z'),
    evento('op.acc.6', 'password_policy_checked', '2026-09-17T12:07:29Z'),
  ];

  comprueba(
    'sin ningún latido, se conserva todo',
    keepLatestRunStateFacts('op.acc.6', eventos, AHORA).length === 2
  );

  comprueba(
    'dos latidos de la MISMA pasada (a menos de un minuto) no crean límite',
    keepLatestRunStateFacts(
      'op.acc.6',
      [
        latido('op.acc.6', '2026-09-17T12:07:00Z'),
        latido('op.acc.6', '2026-09-17T12:07:31Z'),
        ...eventos,
      ],
      AHORA
    ).filter(e => e.eventType === 'password_policy_checked').length === 2
  );

  comprueba(
    'un control sin estados declarados devuelve el mismo conjunto',
    keepLatestRunStateFacts('op.acc.5', eventos, AHORA) === eventos
  );
}

// --- 4. coherencia del catálogo -------------------------------------------------

bloque('4. Todo lo declarado como estado lo escucha su evidencia');

{
  const incoherentes = ENSEvidenceCatalog.flatMap(evidencia =>
    (evidencia.stateFactEventTypes || [])
      .filter(tipo => !evidencia.expectedEventTypes.includes(tipo))
      .map(tipo => `${evidencia.controlId}/${evidencia.id}:${tipo}`)
  );

  comprueba(
    'ningún tipo de estado fuera de expectedEventTypes',
    incoherentes.length === 0,
    incoherentes.join(', ')
  );

  const prohibidos = ENSEvidenceCatalog.flatMap(evidencia =>
    (evidencia.stateFactEventTypes || [])
      .filter(tipo => tipo === 'evidence_state' || tipo === 'collector_run')
      .map(tipo => `${evidencia.controlId}/${evidencia.id}:${tipo}`)
  );

  comprueba(
    'ni evidence_state ni collector_run son hechos de estado',
    prohibidos.length === 0,
    prohibidos.join(', ')
  );
}

// --- 5. con el motor entero, la remediación cambia el veredicto ------------------

bloque('5. op.exp.3.r1.3: un servicio retirado deja de incumplir');

{
  const configuracion: ENSControlConfiguration = {
    ...opExp3Configuration,
    parameters: opExp3Configuration.parameters.map(p =>
      p.id === 'P-02'
        ? { ...p, value: ['wazuh-real | ssh.service,cron.service'] }
        : p.id === 'P-03'
          ? { ...p, value: ['dioni'] }
          : p.id === 'P-04'
            ? { ...p, value: ['/etc/ssh'] }
            : ({ ...p } as ENSControlParameter)
    ),
  };

  const servicio = (nombre: string, ts: string) =>
    evento('op.exp.3', 'service_running', ts, { perfil: 'wazuh-real', servicio: nombre }, '024', 'EV-04');

  const eventos = [
    latido('op.exp.3', '2026-09-17T10:27:30Z', '024', 'EV-02,EV-03,EV-04'),
    servicio('ssh.service', '2026-09-17T11:27:10Z'),
    servicio('atd.service', '2026-09-17T11:27:10Z'),
    latido('op.exp.3', '2026-09-17T11:27:30Z', '024', 'EV-02,EV-03,EV-04'),
    servicio('ssh.service', '2026-09-17T12:27:10Z'),
    latido('op.exp.3', '2026-09-17T12:27:30Z', '024', 'EV-02,EV-03,EV-04'),
  ];

  const veredicto = (entrada: ENSNormalizedEvent[]) => {
    const evidencias = resolveEvidenceForControl('op.exp.3', entrada, '024', 'MEDIO', configuracion, AHORA);
    const resultado = evaluateENSControl(
      opExp3CatalogDefinition,
      configuracion,
      'MEDIO',
      evidencias,
      runPolicyRuntime(buildPolicyContext(opExp3CatalogDefinition, configuracion, 'MEDIO', entrada, evidencias, AHORA)),
      entrada
    );

    return resultado.requirements.find(r => r.id === 'op.exp.3.r1.3')?.status;
  };

  comprueba(
    'con la ventana entera, atd de la pasada anterior sigue incumpliendo',
    veredicto(eventos) === 'NO_CUMPLE',
    String(veredicto(eventos))
  );

  const filtrados = keepLatestRunStateFacts('op.exp.3', eventos, AHORA);

  comprueba(
    'con la última pasada, r1.3 CUMPLE',
    veredicto(filtrados) === 'CUMPLE',
    String(veredicto(filtrados))
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
