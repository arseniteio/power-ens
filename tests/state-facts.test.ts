/**
 * Hechos de ESTADO: se juzgan con la última observación de cada evidencia.
 *
 *     docker run --rm -v "$PWD":/w -w /w node:22-alpine npx --yes tsx tests/state-facts.test.ts
 *
 * POR QUÉ EXISTE ESTE FICHERO. El motor juzgaba todos los hechos de la ventana
 * de 30 días. Para una ACCIÓN es lo correcto: una edición no autorizada hace
 * tres semanas sigue contando. Para un ESTADO no: en wazuh-real se endureció la
 * política de contraseñas a las 12:00, el recolector lo observó a las 12:07, y
 * el control seguía en NO_CUMPLE por la foto de las 11:47.
 *
 * Y POR QUÉ EL CORTE NO ES «LA ÚLTIMA PASADA». El 21/09 esa primera versión
 * hundió dos controles: op.exp.3 emite el inventario de servicios una vez al
 * día y op.exp.2 solo lee el SCA cuando hay un escaneo reciente, así que su
 * última pasada no traía ni un hecho y las evidencias cayeron a NO_EVALUABLE.
 * El corte se toma POR EVIDENCIA, con lo que el propio latido declara haber
 * mirado (`evidencias_cubiertas`).
 *
 * Los límites que se prueban aquí:
 *
 *   1. solo se descartan los tipos declarados como estado, y solo del control
 *      que los declara: las acciones siguen contando la ventana entera;
 *   2. una evidencia observada de tarde en tarde conserva su última foto;
 *   3. el corte es POR AGENTE y A FECHA DE `now`: la serie diaria evalúa el
 *      pasado y no puede juzgarlo con una pasada posterior;
 *   4. sin cobertura declarada no se descarta nada;
 *   5. lo declarado como estado es coherente con el catálogo;
 *   6. con el motor entero, una remediación real cambia el veredicto.
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

// El latido declara QUÉ ha mirado esa pasada: es lo que delimita la última
// observación de cada evidencia.
const latido = (
  controlId: string,
  timestamp: string,
  cubiertas: string,
  agentId = '024'
) =>
  evento(
    controlId,
    'collector_run',
    timestamp,
    { resultado: 'completada', evidencias_cubiertas: cubiertas },
    agentId
  );

const AHORA = new Date('2026-09-21T18:00:00Z');

// --- 1. solo el estado declarado, solo en su control ---------------------------

bloque('1. Se descarta el estado anterior a la última observación');

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
    evento('op.acc.6', 'password_policy_checked', '2026-09-21T11:47:03Z', { longitud_minima: '6' }, '024', 'EV-11'),
    latido('op.acc.6', '2026-09-21T11:47:05Z', 'EV-11,EV-12'),
    evento('op.acc.6', 'authentication_success', '2026-09-21T11:30:00Z', { usuario: 'dioni' }),
    evento('op.acc.6', 'password_policy_checked', '2026-09-21T12:07:29Z', { longitud_minima: '12' }, '024', 'EV-11'),
    latido('op.acc.6', '2026-09-21T12:07:31Z', 'EV-11,EV-12'),
    evento('op.exp.3', 'service_running', '2026-09-21T09:00:00Z', { servicio: 'atd.service' }),
  ];

  const resultado = keepLatestRunStateFacts('op.acc.6', eventos, AHORA);
  const politicas = resultado.filter(e => e.eventType === 'password_policy_checked');

  comprueba(
    'queda solo la política de la última observación',
    politicas.length === 1 && politicas[0].attributes?.longitud_minima === '12',
    politicas.map(p => String(p.attributes?.longitud_minima)).join(',')
  );
  comprueba(
    'la acción anterior se conserva',
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

// --- 2. lo que se mira de tarde en tarde conserva su foto ----------------------
//
// El caso que rompió op.exp.3 y op.exp.2 el 21/09.

bloque('2. Una evidencia observada de tarde en tarde conserva su foto');

{
  const servicio = (nombre: string, ts: string) =>
    evento('op.exp.3', 'service_running', ts, { perfil: 'wazuh-real', servicio: nombre }, '024', 'EV-04');

  const eventos = [
    servicio('atd.service', '2026-09-19T23:27:10Z'),
    latido('op.exp.3', '2026-09-19T23:27:30Z', 'EV-02,EV-03,EV-04'),
    // 24 h de pasadas horarias que NO miran EV-04.
    latido('op.exp.3', '2026-09-20T22:27:30Z', 'EV-02,EV-03'),
    servicio('ssh.service', '2026-09-20T23:27:10Z'),
    latido('op.exp.3', '2026-09-20T23:27:30Z', 'EV-02,EV-03,EV-04'),
    latido('op.exp.3', '2026-09-21T16:27:30Z', 'EV-02,EV-03'),
    latido('op.exp.3', '2026-09-21T17:27:30Z', 'EV-02,EV-03'),
  ];

  const servicios = keepLatestRunStateFacts('op.exp.3', eventos, AHORA)
    .filter(e => e.eventType === 'service_running')
    .map(e => String(e.attributes?.servicio));

  comprueba(
    'la foto del inventario diario sobrevive a las pasadas que no lo miran',
    servicios.join(',') === 'ssh.service',
    servicios.join(',') || '(ninguno)'
  );
}

// --- 3. por agente y a fecha de `now` -------------------------------------------

bloque('3. El corte es por agente y a fecha de la evaluación');

{
  const politica = (v: string, ts: string, agente: string) =>
    evento('op.acc.6', 'password_policy_checked', ts, { v }, agente, 'EV-11');

  const eventos = [
    latido('op.acc.6', '2026-09-21T10:47:05Z', 'EV-11', '024'),
    politica('a-vieja', '2026-09-21T11:47:03Z', '024'),
    latido('op.acc.6', '2026-09-21T11:47:05Z', 'EV-11', '024'),
    politica('a-nueva', '2026-09-21T12:07:29Z', '024'),
    latido('op.acc.6', '2026-09-21T12:07:31Z', 'EV-11', '024'),
    // El LDAP solo ha pasado una vez: sin pasada anterior no hay corte.
    politica('b-unica', '2026-09-21T11:24:58Z', '028'),
    latido('op.acc.6', '2026-09-21T11:25:00Z', 'EV-11', '028'),
  ];

  const hoy = keepLatestRunStateFacts('op.acc.6', eventos, AHORA)
    .filter(e => e.eventType === 'password_policy_checked')
    .map(e => String(e.attributes?.v))
    .sort();

  comprueba(
    'cada agente conserva la foto de SU última observación',
    hoy.join(',') === 'a-nueva,b-unica',
    hoy.join(',')
  );

  const alMediodia = keepLatestRunStateFacts(
    'op.acc.6',
    eventos,
    new Date('2026-09-21T12:00:00Z')
  )
    .filter(e => e.eventType === 'password_policy_checked' && e.agentId === '024')
    .map(e => String(e.attributes?.v));

  comprueba(
    'evaluado a las 12:00, una pasada posterior no cuenta',
    alMediodia.includes('a-vieja'),
    alMediodia.join(',')
  );
}

// --- 4. sin cobertura declarada no se descarta nada -----------------------------

bloque('4. Sin cobertura declarada, se conserva todo');

{
  const politica = (v: string, ts: string) =>
    evento('op.acc.6', 'password_policy_checked', ts, { v }, '024', 'EV-11');

  comprueba(
    'latidos que no declaran qué miraron: no hay corte',
    keepLatestRunStateFacts(
      'op.acc.6',
      [
        politica('vieja', '2026-09-21T11:47:03Z'),
        latido('op.acc.6', '2026-09-21T11:47:05Z', ''),
        politica('nueva', '2026-09-21T12:07:29Z'),
        latido('op.acc.6', '2026-09-21T12:07:31Z', ''),
      ],
      AHORA
    ).filter(e => e.eventType === 'password_policy_checked').length === 2
  );

  comprueba(
    'una sola pasada: no hay pasada anterior con la que delimitar',
    keepLatestRunStateFacts(
      'op.acc.6',
      [
        politica('unica', '2026-09-21T12:07:29Z'),
        latido('op.acc.6', '2026-09-21T12:07:31Z', 'EV-11'),
      ],
      AHORA
    ).filter(e => e.eventType === 'password_policy_checked').length === 1
  );

  comprueba(
    'un control sin estados declarados devuelve el mismo conjunto',
    (() => {
      const eventos = [politica('x', '2026-09-21T12:07:29Z')];

      return keepLatestRunStateFacts('op.acc.5', eventos, AHORA) === eventos;
    })()
  );
}

// --- 5. coherencia del catálogo -------------------------------------------------

bloque('5. Todo lo declarado como estado lo escucha su evidencia');

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

// --- 6. con el motor entero, la remediación cambia el veredicto ------------------

bloque('6. op.exp.3.r1.3: un servicio retirado deja de incumplir');

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
    latido('op.exp.3', '2026-09-21T10:27:30Z', 'EV-02,EV-03,EV-04'),
    servicio('ssh.service', '2026-09-21T11:27:10Z'),
    servicio('atd.service', '2026-09-21T11:27:10Z'),
    latido('op.exp.3', '2026-09-21T11:27:30Z', 'EV-02,EV-03,EV-04'),
    servicio('ssh.service', '2026-09-21T12:27:10Z'),
    latido('op.exp.3', '2026-09-21T12:27:30Z', 'EV-02,EV-03,EV-04'),
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

  comprueba(
    'con la última observación, r1.3 CUMPLE',
    veredicto(keepLatestRunStateFacts('op.exp.3', eventos, AHORA)) === 'CUMPLE',
    String(veredicto(keepLatestRunStateFacts('op.exp.3', eventos, AHORA)))
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
