// op.exp.7 · Gestión de incidentes
//
// Por qué este control tiene policy propia. Las siete primitivas contrastan UN
// campo de UN hecho contra UN parámetro, y ninguna de las preguntas de
// op.exp.7 cabe ahí:
//
//   EV-02  cruzar DOS flujos de hechos: cada alerta Alta o Crítica (su
//          severidad sale del nivel de regla con P-01) tiene que caer dentro de
//          un incidente registrado de su sistema, con el plazo de P-02.
//   EV-03  MTTD/MTTR: restar instantes entre fases del registro (y con la
//          primera alerta) y comparar la MEDIA de cada severidad con su fila de
//          P-05. Ninguna primitiva resta dos hechos ni busca la fila por otra
//          columna.
//   EV-04  escalado contra P-02 (destinatario y plazo) y, desde MEDIA,
//          comunicación a los responsables de P-04 de cada sistema afectado.
//   EV-05  los sellos de los registros de cada día de cada incidente.
//   EV-06  contención de cada incidente alto o crítico: respuesta activa de P-09
//          en un sistema afectado, dentro del incidente, o contención anotada.
//   EV-07  72 horas del RGPD desde la apertura, solo en sistemas de P-07.
//   EV-08  notificación al CCN-CERT de lo que P-01 declara notificable.
//   EV-09  reconfiguración sobre los elementos de P-10.
//   EV-10  listas CDB de P-11 cargadas, usadas y al día.
//   EV-12  medidas de mejora en todo incidente cerrado.
//
// Invariantes, las mismas que `evidence/judgment.ts` y la policy de op.exp.4:
//   - el recolector emite instantes, no edades: toda antigüedad se mide aquí
//     contra `context.now`, así que el mismo hecho envejece solo;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo; nunca un CUMPLE por
//     ausencia salvo EV-02, y solo si el latido confirma que en ESA pasada se
//     leyeron las alertas Y el registro;
//   - «no hubo incidentes» no demuestra nada de lo que se hace ante un
//     incidente: EV-03 a EV-08 y EV-12 quedan NO_EVALUABLE sin incidentes;
//   - la policy nunca inventa política: ningún plazo, nivel ni destinatario
//     tiene valor por defecto. Las 72 horas de EV-07 no son política del
//     cliente: las fija el artículo 33 del RGPD, al que remite op.exp.7.2.
//
// El sujeto es el manager: los hechos llegan con agent.id 000 y dicen de qué
// sistema hablan en `sistema` / `sistemas`.
//
// Tipos y utilidades desde el fichero, nunca desde un barrel: por ahí vuelve el
// ciclo del TDZ de Settings.
// El motivo compuesto, en texto y por partes (`reasonParts`).
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSComplianceStatus, ENSGapCause } from '../../evaluation/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSControlParameter } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';

const CONTROL = 'op.exp.7';
const POLICY = 'policy.op.exp.7';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// El recolector del manager corre cada hora. 24 h + una pasada + margen: es
// tolerancia de OBSERVACIÓN, no política.
const FRESCURA_HORAS = 26;

// Mismo margen de reloj que `resolveCollectorCoverage`: un hecho del futuro no
// acredita nada.
const TOLERANCIA_FUTURO = 5 * 60 * 1000;

// La ventana de las ACCIONES (decisión del 17/09): lo que se juzga es lo que ha
// estado vivo en los últimos 30 días, la misma ventana con la que el motor lee
// las alertas.
const VENTANA_DIAS = 30;

// Artículo 33 del RGPD: notificación a la autoridad de control en 72 horas.
const AEPD_HORAS = 72;

// `causa` solo con NO_EVALUABLE: de quién es el hueco (ver `ENSGapCause`).
// Llega a la evidencia y al requisito por la decisión; sin ella la tarjeta
// heredaba la causa del modelo clásico, que no ve los hechos que lee la policy.
type Medida = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;
  motivo: string;
  causa?: ENSGapCause;
};

const cumple = (motivo: string): Medida => ({ estado: 'CUMPLE', motivo });
const noCumple = (motivo: string): Medida => ({ estado: 'NO_CUMPLE', motivo });
// Por defecto EVIDENCE: el dato llegó y no basta (o aún no hay incidente con el
// que medir). Falta de parámetro (CONFIGURATION) y falta de pasada o de fuente
// (COLLECTION) se dicen expresamente, y lo que el recolector declara llega con
// SU causa (`degradacion`).
const sinMedir = (motivo: string, causa: ENSGapCause = 'EVIDENCE'): Medida => ({
  estado: 'NO_EVALUABLE',
  motivo,
  causa,
});

// La causa de varias medidas sin medir, con el mismo orden que el motor
// (`resolveGapCause`): COLLECTION solo si lo dicen todas; CONFIGURATION si lo
// dice alguna; si no, EVIDENCE.
const causaComun = (medidas: Medida[]): ENSGapCause | undefined => {
  const causas = medidas
    .filter(m => m.estado === 'NO_EVALUABLE')
    .map(m => m.causa || 'EVIDENCE');

  if (!causas.length) {
    return undefined;
  }

  if (causas.every(c => c === 'COLLECTION')) {
    return 'COLLECTION';
  }

  return causas.includes('CONFIGURATION') ? 'CONFIGURATION' : 'EVIDENCE';
};

const GRAVEDAD: Record<Medida['estado'], number> = {
  CUMPLE: 0,
  NO_EVALUABLE: 1,
  NO_CUMPLE: 2,
};

const peor = (medidas: Medida[]): Medida['estado'] =>
  medidas.reduce<Medida['estado']>(
    (actual, medida) =>
      GRAVEDAD[medida.estado] > GRAVEDAD[actual] ? medida.estado : actual,
    'CUMPLE'
  );

// --- lectura de hechos -----------------------------------------------------

// El normalizador parte un evento con `evidence_id=EV-02,EV-03` en uno por
// evidencia (`<id>#EV-02`, `<id>#EV-03`). Aquí se juzga el HECHO, así que se
// cuenta una vez.
const hechos = (
  context: ENSPolicyContext,
  tipo: string
): ENSNormalizedEvent[] => {
  const vistos = new Set<string>();

  return context.events.filter(event => {
    if (event.controlId !== CONTROL || event.eventType !== tipo) {
      return false;
    }

    const base = String(event.id || '').split('#')[0];

    if (vistos.has(base)) {
      return false;
    }

    vistos.add(base);

    return true;
  });
};

const campo = (event: ENSNormalizedEvent, nombre: string): string => {
  const valor =
    event.attributes && Object.prototype.hasOwnProperty.call(event.attributes, nombre)
      ? event.attributes[nombre]
      : undefined;

  return valor === undefined || valor === null ? '' : String(valor).trim();
};

// Los números llegan como texto desde `alerts.json`.
const numero = (texto: string): number | undefined => {
  const limpio = (texto || '').replace(',', '.').trim();

  if (!/^-?\d+(\.\d+)?$/.test(limpio)) {
    return undefined;
  }

  const valor = Number(limpio);

  return Number.isFinite(valor) ? valor : undefined;
};

const instante = (texto: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(texto)) {
    return undefined;
  }

  const valor = new Date(texto).getTime();

  return Number.isFinite(valor) ? valor : undefined;
};

const horas = (ms: number): string => (ms / HORA).toFixed(1);

const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z');

const sinTildes = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const lista = (elementos: string[], maximo = 5): string =>
  elementos.length > maximo
    ? `${elementos.slice(0, maximo).join('; ')} y ${elementos.length - maximo} más`
    : elementos.join('; ');

// Destinatarios o responsables de una celda: «RSI + CISO», «J. Ruiz, M. Sanz».
const nombres = (texto: string): string[] =>
  texto
    .split(/[+,;]/)
    .map(n => sinTildes(n))
    .filter(n => n && n !== '-');

const mismoSistema = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// --- lectura de parámetros -------------------------------------------------

const parametro = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

// Filas de una tabla repartidas en sus columnas declaradas. Sin columnas no se
// adivina la posición: el parámetro se trata como no configurado.
const filas = (
  context: ENSPolicyContext,
  id: string
): Record<string, string>[] | undefined => {
  const p = parametro(context, id);
  const columnas = p?.columns || [];

  if (!p || !columnas.length) {
    return undefined;
  }

  const resultado = toParameterTableRows(p.value)
    .map(fila => toTableRowCells(fila))
    .filter(celdas => celdas.some(Boolean))
    .map(celdas => {
      const fila: Record<string, string> = {};

      columnas.forEach((columna, i) => {
        fila[columna.name] = celdas[i] || '';
      });

      return fila;
    });

  return resultado.length ? resultado : undefined;
};

const etiqueta = (context: ENSPolicyContext, id: string): string => {
  const p = parametro(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

// La fila de un sistema: la de su nombre o, si no tiene, la de «*».
const filaDelSistema = (
  tabla: Record<string, string>[],
  columna: string,
  sistema: string
): Record<string, string> | undefined =>
  tabla.find(f => mismoSistema(f[columna] || '', sistema)) ||
  tabla.find(f => (f[columna] || '').trim() === '*');

// --- severidades -----------------------------------------------------------

const SEVERIDADES = ['baja', 'media', 'alta', 'critica'];
const RELEVANTES = ['alta', 'critica'];

const NOMBRE: Record<string, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

const rango = (severidad: string): number => SEVERIDADES.indexOf(severidad);

type Clasificacion = {
  // [nivel mínimo, severidad], de nivel más alto a más bajo.
  umbrales: [number, string][];
  // Nivel desde el que una alerta es Alta o Crítica.
  relevanteDesde?: number;
  notificables: Set<string>;
};

const clasificacion = (context: ENSPolicyContext): Clasificacion | undefined => {
  const tabla = filas(context, 'P-01');

  if (!tabla) {
    return undefined;
  }

  const umbrales: [number, string][] = [];
  const notificables = new Set<string>();

  tabla.forEach(fila => {
    const severidad = sinTildes(fila.severidad || '');
    const minimo = numero(fila.nivel_minimo || '');

    if (!SEVERIDADES.includes(severidad)) {
      return;
    }

    if (sinTildes(fila.notificable_ccn_cert || '') === 'si') {
      notificables.add(severidad);
    }

    if (minimo !== undefined) {
      umbrales.push([minimo, severidad]);
    }
  });

  if (!umbrales.length) {
    return undefined;
  }

  umbrales.sort((a, b) => b[0] - a[0] || rango(b[1]) - rango(a[1]));

  const relevantes = umbrales.filter(([, s]) => RELEVANTES.includes(s)).map(([n]) => n);

  return {
    umbrales,
    relevanteDesde: relevantes.length ? Math.min(...relevantes) : undefined,
    notificables,
  };
};

// La severidad más alta cuyo nivel mínimo alcanza la alerta.
const severidadDeNivel = (nivel: number, c: Clasificacion): string | undefined => {
  const alcanzadas = c.umbrales.filter(([minimo]) => nivel >= minimo).map(([, s]) => s);

  return alcanzadas.length
    ? alcanzadas.reduce((a, b) => (rango(b) > rango(a) ? b : a))
    : undefined;
};

// P-02: severidad -> destinatarios y plazo en horas. Plazo vacío: sin plazo.
type Escalado = { destinatario: string; plazo?: number };

const escalados = (context: ENSPolicyContext): Map<string, Escalado> | undefined => {
  const tabla = filas(context, 'P-02');

  if (!tabla) {
    return undefined;
  }

  const mapa = new Map<string, Escalado>();

  tabla.forEach(fila => {
    const severidad = sinTildes(fila.severidad || '');

    if (SEVERIDADES.includes(severidad)) {
      mapa.set(severidad, {
        destinatario: fila.destinatario || '',
        plazo: numero(fila.plazo_horas || ''),
      });
    }
  });

  return mapa.size ? mapa : undefined;
};

// --- el latido -------------------------------------------------------------

type Latido = { evento: ENSNormalizedEvent; t: number };

const latidos = (context: ENSPolicyContext, ahora: number): Latido[] =>
  hechos(context, 'collector_run')
    .map(evento => ({ evento, t: instante(evento.timestamp) }))
    .filter((x): x is Latido => x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO)
    .sort((a, b) => b.t - a.t);

const ultimoLatido = (context: ENSPolicyContext, ahora: number): Latido | undefined => {
  const ultimo = latidos(context, ahora)[0];

  return ultimo && ahora - ultimo.t <= FRESCURA_HORAS * HORA ? ultimo : undefined;
};

const enLista = (texto: string, valor: string): boolean =>
  texto.split(',').map(s => s.trim()).includes(valor);

// La degradación que el recolector declaró para una evidencia en la MISMA
// pasada que el último latido (o después): una de hace días ya no dice nada.
// Viaja con la causa que ÉL declara (sin causa declarada, COLLECTION): es
// quien sabe si falta un registro que la organización no mantiene o una
// fuente que no pudo leer.
const degradacion = (
  context: ENSPolicyContext,
  evidencia: string,
  latido: Latido
): { motivo: string; causa: ENSGapCause } | undefined => {
  const candidatas = context.events
    .filter(
      e =>
        e.controlId === CONTROL &&
        e.eventType === 'evidence_state' &&
        (e.evidenceId === evidencia || enLista(campo(e, 'evidence_id'), evidencia))
    )
    .map(e => ({ e, t: instante(e.timestamp) }))
    .filter(x => x.t !== undefined && (x.t as number) >= latido.t - HORA && (x.t as number) <= latido.t + TOLERANCIA_FUTURO)
    .sort((a, b) => (b.t as number) - (a.t as number));

  if (!candidatas.length) {
    return undefined;
  }

  const declarada = campo(candidatas[0].e, 'causa').toUpperCase();

  return {
    motivo: campo(candidatas[0].e, 'motivo'),
    causa: ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'].includes(declarada)
      ? (declarada as ENSGapCause)
      : 'COLLECTION',
  };
};

type Fuentes = { alertas?: boolean; registro?: boolean; ossecConf?: boolean };

// ¿Se pudo leer lo que esta evidencia necesita en la última pasada? Si no, la
// medida es NO_EVALUABLE con el motivo que dio el propio recolector.
const fuentes = (
  context: ENSPolicyContext,
  ahora: number,
  evidencia: string,
  que: Fuentes
): Latido | Medida => {
  const latido = ultimoLatido(context, ahora);

  if (!latido) {
    return sinMedir(
      'No hay ninguna pasada reciente del recolector del manager (ens_opexp7_collect.sh): sin ella no se sabe qué alertas, incidentes ni sellos hay hoy. Revisa su cron en el manager y que el alcance del plugin incluya el agente 000.',
      'COLLECTION'
    );
  }

  const miradas = campo(latido.evento, 'evidencias_miradas');
  const registro = campo(latido.evento, 'registro_incidentes');
  const motivo = degradacion(context, evidencia, latido);

  // Un registro de incidentes ausente es de CONFIGURACIÓN: la organización no
  // lo mantiene. Uno que no se pudo leer, de RECOGIDA.
  if (que.registro && !['presente', 'vacio'].includes(registro)) {
    return motivo
      ? sinMedir(motivo.motivo, motivo.causa)
      : registro === 'ausente'
      ? sinMedir(
          'No existe el registro de incidentes del manager (/etc/ensfacil/incident-register.tsv): la organización no ha empezado a registrar incidentes.',
          'CONFIGURATION'
        )
      : sinMedir(`El registro de incidentes no se ha podido leer en la última pasada (${registro || 'sin dato'}).`, 'COLLECTION');
  }

  if (que.alertas && !enLista(miradas, 'EV-01')) {
    return motivo
      ? sinMedir(motivo.motivo, motivo.causa)
      : sinMedir('La última pasada del recolector no pudo leer las alertas del manager.', 'COLLECTION');
  }

  if (que.ossecConf && !enLista(miradas, 'EV-10')) {
    return motivo
      ? sinMedir(motivo.motivo, motivo.causa)
      : sinMedir('La última pasada del recolector no pudo leer el ossec.conf del manager.', 'COLLECTION');
  }

  return latido;
};

const esMedida = (x: unknown): x is Medida =>
  typeof x === 'object' && x !== null && (x as Medida).estado !== undefined;

// --- las respuestas activas ejecutadas ------------------------------------

// Una ejecución de respuesta activa solo es RESPUESTA AUTOMÁTICA si la disparó
// una alerta: `regla_disparadora` es la regla de esa alerta. Sin ella (`-`) es
// un reinicio pedido a mano o desde la API —el `restart-wazuh.exe` de
// WIN-OPACC-LAB del 24/09—, que no demuestra ni contención, ni reconfiguración,
// ni que la respuesta automática opere. Se nombra en el motivo, pero no
// acredita.
const conOrigen = (e: ENSNormalizedEvent): boolean => {
  const regla = campo(e, 'regla_disparadora');

  return regla !== '' && regla !== '-';
};

const notaSinOrigen = (context: ENSPolicyContext): string => {
  const sin = hechos(context, 'active_response_executed').filter(e => !conOrigen(e));

  return sin.length
    ? ` Ejecuciones sin alerta que las dispare (no acreditan): ${lista(
        sin.map(e => `${campo(e, 'programa') || campo(e, 'comando')} ${campo(e, 'accion')} en ${campo(e, 'sistema')} (${campo(e, 'instante')})`)
      )}.`
    : '';
};

// --- los incidentes --------------------------------------------------------

type Notificacion = { fecha: number; escaladoA: string; notificadoA: string };

type Incidente = {
  id: string;
  severidad: string;
  sistemas: string[];
  apertura: number;
  contencion?: number;
  cierre?: number;
  datosPersonales: 'si' | 'no' | '-';
  notificaciones: Notificacion[];
  ccnCert?: number;
  mejoras: string[];
};

const incidentes = (context: ENSPolicyContext, ahora: number): Incidente[] => {
  // Una fila por (incidente, fase, fecha): si el registro se reemitió varias
  // veces en la ventana, cuenta la última copia.
  const filasVistas = new Map<string, ENSNormalizedEvent>();

  hechos(context, 'incident_registered').forEach(e => {
    const clave = [campo(e, 'incidente_id'), campo(e, 'fase'), campo(e, 'fecha')].join('|');
    const previa = filasVistas.get(clave);

    if (!previa || (instante(e.timestamp) || 0) >= (instante(previa.timestamp) || 0)) {
      filasVistas.set(clave, e);
    }
  });

  const porId = new Map<string, Incidente>();

  filasVistas.forEach(e => {
    const id = campo(e, 'incidente_id');
    const fecha = instante(campo(e, 'fecha'));

    if (!id || fecha === undefined) {
      return;
    }

    const actual: Incidente = porId.get(id) || {
      id,
      severidad: '',
      sistemas: [],
      apertura: fecha,
      datosPersonales: '-',
      notificaciones: [],
      mejoras: [],
    };

    // La severidad del incidente es la más alta registrada en cualquiera de
    // sus fases, la misma regla que op.exp.9: un incidente que llegó a crítico
    // no se juzga con el plazo de uno bajo porque se rebajara al cerrarlo.
    const severidad = sinTildes(campo(e, 'severidad'));

    if (SEVERIDADES.includes(severidad) && rango(severidad) > rango(actual.severidad)) {
      actual.severidad = severidad;
    }

    campo(e, 'sistemas')
      .split(',')
      .map(s => s.trim())
      .filter(s => s && s !== '-')
      .forEach(s => {
        if (!actual.sistemas.some(x => mismoSistema(x, s))) {
          actual.sistemas.push(s);
        }
      });

    actual.apertura = Math.min(actual.apertura, fecha);

    const fase = campo(e, 'fase');

    if (fase === 'intermedio') {
      actual.contencion = Math.min(actual.contencion ?? fecha, fecha);
    }

    if (fase === 'final') {
      actual.cierre = Math.max(actual.cierre ?? fecha, fecha);
    }

    const dp = campo(e, 'datos_personales');

    if (dp === 'si' || (dp === 'no' && actual.datosPersonales !== 'si')) {
      actual.datosPersonales = dp;
    }

    porId.set(id, actual);
  });

  hechos(context, 'incident_notification_recorded').forEach(e => {
    const incidente = porId.get(campo(e, 'incidente_id'));
    const fecha = instante(campo(e, 'fecha'));

    if (incidente && fecha !== undefined) {
      incidente.notificaciones.push({
        fecha,
        escaladoA: campo(e, 'escalado_a'),
        notificadoA: campo(e, 'notificado_a'),
      });
    }
  });

  hechos(context, 'ccn_cert_notification_recorded').forEach(e => {
    const incidente = porId.get(campo(e, 'incidente_id'));
    const fecha = instante(campo(e, 'notificacion_ccn_cert'));

    if (incidente && fecha !== undefined) {
      incidente.ccnCert = Math.min(incidente.ccnCert ?? fecha, fecha);
    }
  });

  hechos(context, 'improvement_action_recorded').forEach(e => {
    const incidente = porId.get(campo(e, 'incidente_id'));
    const medidas = campo(e, 'medidas_mejora');

    if (incidente && medidas && medidas !== '-') {
      incidente.mejoras.push(medidas);
    }
  });

  // Vivos en la ventana: abiertos, o cerrados en los últimos 30 días. Un
  // incidente fechado en el futuro no acredita nada.
  return Array.from(porId.values())
    .filter(
      i =>
        i.apertura <= ahora + TOLERANCIA_FUTURO &&
        (i.cierre === undefined || i.cierre >= ahora - VENTANA_DIAS * DIA)
    )
    .sort((a, b) => a.apertura - b.apertura);
};

// --- las alertas -----------------------------------------------------------

type Alerta = {
  sistema: string;
  nivel: number;
  regla: string;
  alertas: number;
  primera: number;
  ultima: number;
  descripcion: string;
};

const alertas = (context: ENSPolicyContext, ahora: number): Alerta[] =>
  hechos(context, 'security_alert_observed')
    .map(e => ({
      sistema: campo(e, 'sistema'),
      nivel: numero(campo(e, 'nivel')),
      regla: campo(e, 'regla'),
      alertas: numero(campo(e, 'alertas')) || 0,
      primera: instante(campo(e, 'primera')),
      ultima: instante(campo(e, 'ultima')),
      descripcion: campo(e, 'descripcion'),
    }))
    .filter(
      (a): a is Alerta =>
        a.nivel !== undefined &&
        a.primera !== undefined &&
        a.ultima !== undefined &&
        a.ultima <= ahora + TOLERANCIA_FUTURO &&
        a.ultima >= ahora - VENTANA_DIAS * DIA
    );

// ¿Cubre algún incidente de ese sistema el instante `t`? Un incidente cubre lo
// que pasa mientras está abierto y lo que pasó hasta `plazo` horas antes de su
// apertura: registrar dentro del plazo de escalado es convertir la alerta en
// incidente; registrar más tarde, no.
const cubierta = (
  sistema: string,
  t: number,
  plazoMs: number,
  candidatos: Incidente[]
): Incidente | undefined =>
  candidatos.find(
    i =>
      i.sistemas.some(s => mismoSistema(s, sistema)) &&
      i.apertura <= t + plazoMs &&
      (i.cierre === undefined || t <= i.cierre)
  );

// --- las evidencias --------------------------------------------------------

const ev01 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-01', { alertas: true });

  if (esMedida(latido)) {
    return latido;
  }

  const c = clasificacion(context);

  if (!c) {
    return sinMedir(
      `${etiqueta(context, 'P-01')} está sin configurar o no declara ningún nivel mínimo: las alertas llegan sin severidad ENS.`,
      'CONFIGURATION'
    );
  }

  // El recolector solo ve desde su nivel de observación. Lo que tiene que ver
  // sin falta es el umbral de «relevante» (Alta o Crítica): por debajo de él,
  // una severidad declarada pero no observada se dice, no se inventa.
  const desde = numero(campo(latido.evento, 'nivel_observado_desde'));
  const minimoDeclarado = Math.min(...c.umbrales.map(([n]) => n));

  if (desde !== undefined && c.relevanteDesde !== undefined && desde > c.relevanteDesde) {
    return sinMedir(
      `El recolector observa alertas desde nivel ${desde} y P-01 declara Alta o Crítica desde nivel ${c.relevanteDesde}: las alertas relevantes entre esos niveles no se ven. Baja OPEXP7_NIVEL_OBSERVADO en /etc/ensfacil/opexp7.env del manager.`,
      'CONFIGURATION'
    );
  }

  const noVistas =
    desde !== undefined && desde > minimoDeclarado
      ? ` Las severidades de P-01 por debajo de nivel ${desde} no se observan (OPEXP7_NIVEL_OBSERVADO).`
      : '';

  // ¿Escribe alertas el manager? Lo leído en las pasadas del último día.
  const leidas = latidos(context, ahora)
    .filter(l => ahora - l.t <= DIA)
    .reduce((total, l) => total + (numero(campo(l.evento, 'alertas_leidas')) || 0), 0);

  if (leidas === 0) {
    return sinMedir(
      'Las pasadas del último día no han leído ninguna alerta en el manager: o no escribe alerts.json (jsonout_output) o el recolector no ve el fichero.',
      'COLLECTION'
    );
  }

  const porSeveridad = new Map<string, { n: number; sistemas: Set<string> }>();

  alertas(context, ahora).forEach(a => {
    const severidad = severidadDeNivel(a.nivel, c) || 'sin severidad';
    const actual = porSeveridad.get(severidad) || { n: 0, sistemas: new Set<string>() };

    actual.n += a.alertas;
    actual.sistemas.add(a.sistema);
    porSeveridad.set(severidad, actual);
  });

  const resumen = [...SEVERIDADES].reverse()
    .concat('sin severidad')
    .filter(s => porSeveridad.has(s))
    .map(s => {
      const x = porSeveridad.get(s)!;

      return `${NOMBRE[s] || 'Sin severidad en P-01'} ${x.n} (${Array.from(x.sistemas).join(', ')})`;
    });

  return cumple(
    `El SIEM detecta y clasifica: las pasadas del recolector del último día leyeron ${leidas} alertas del manager; en los últimos ${VENTANA_DIAS} días, por severidad de P-01: ${resumen.length ? resumen.join('; ') : `ninguna de nivel ${desde ?? minimoDeclarado} o superior`}.${noVistas}`
  );
};

const ev02 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-02', { alertas: true, registro: true });

  if (esMedida(latido)) {
    return latido;
  }

  const c = clasificacion(context);

  if (!c || c.relevanteDesde === undefined) {
    return sinMedir(
      `${etiqueta(context, 'P-01')} no declara desde qué nivel una alerta es Alta o Crítica: no hay alerta relevante que conciliar.`,
      'CONFIGURATION'
    );
  }

  const p02 = escalados(context);

  if (!p02) {
    return sinMedir(
      `${etiqueta(context, 'P-02')} está sin configurar: sin plazo de escalado no se sabe cuándo una alerta se ha quedado sin incidente.`,
      'CONFIGURATION'
    );
  }

  const excluidas = new Map<string, string>();

  (filas(context, 'P-12') || []).forEach(f => {
    if (f.regla) {
      excluidas.set(f.regla.trim(), f.motivo || '');
    }
  });

  const registrados = incidentes(context, ahora);
  const huerfanas: { texto: string; peso: number }[] = [];
  const sinPlazo = new Set<string>();
  const excluidasContadas = new Map<string, number>();
  let relevantes = 0;
  let pendientes = 0;
  const cubridores = new Set<string>();

  alertas(context, ahora).forEach(a => {
    const severidad = severidadDeNivel(a.nivel, c);

    if (!severidad || !RELEVANTES.includes(severidad)) {
      return;
    }

    if (excluidas.has(a.regla)) {
      excluidasContadas.set(a.regla, (excluidasContadas.get(a.regla) || 0) + a.alertas);

      return;
    }

    relevantes += a.alertas;

    const plazo = p02.get(severidad)?.plazo;

    if (plazo === undefined) {
      sinPlazo.add(NOMBRE[severidad]);

      return;
    }

    const plazoMs = plazo * HORA;
    const alPrincipio = cubierta(a.sistema, a.primera, plazoMs, registrados);
    const alFinal = cubierta(a.sistema, a.ultima, plazoMs, registrados);

    if (alPrincipio && alFinal) {
      cubridores.add(alPrincipio.id);
      cubridores.add(alFinal.id);

      return;
    }

    if (ahora - a.primera <= plazoMs) {
      pendientes += a.alertas;

      return;
    }

    huerfanas.push({
      peso: rango(severidad) * 1e6 + a.alertas,
      texto: `${a.sistema}: ${a.alertas} alerta(s) ${NOMBRE[severidad]} de la regla ${a.regla} (nivel ${a.nivel}, «${a.descripcion}») entre ${iso(a.primera)} y ${iso(a.ultima)}, sin incidente registrado en ${plazo} h`,
    });
  });

  const notaExcluidas = excluidasContadas.size
    ? ` No se concilian, por decisión escrita en P-12: ${Array.from(excluidasContadas.entries())
        .map(([regla, n]) => `${n} alerta(s) de la regla ${regla} (${excluidas.get(regla) || 'sin motivo'})`)
        .join('; ')}.`
    : '';

  const herramienta = (filas(context, 'P-03') || [])[0]?.herramienta;
  const notaP03 = herramienta ? ` Expedientes en: ${herramienta}.` : '';
  const notaPendientes = pendientes
    ? ` ${pendientes} alerta(s) relevantes todavía dentro de su plazo de escalado.`
    : '';

  if (huerfanas.length) {
    huerfanas.sort((a, b) => b.peso - a.peso);

    return noCumple(
      `Alertas de severidad Alta o Crítica que no se convirtieron en incidente registrado: ${lista(huerfanas.map(h => h.texto))}.${notaExcluidas}${notaPendientes}${notaP03}`
    );
  }

  if (sinPlazo.size) {
    return sinMedir(
      `P-02 no tiene plazo para la severidad ${Array.from(sinPlazo).join(', ')}: esas alertas no se pueden conciliar.${notaExcluidas}`,
      'CONFIGURATION'
    );
  }

  if (!enLista(campo(latido.evento, 'evidencias_cubiertas'), 'EV-02')) {
    return sinMedir('La última pasada no declara haber leído a la vez las alertas y el registro: el silencio no acredita nada.', 'COLLECTION');
  }

  return cumple(
    relevantes
      ? `Las ${relevantes} alertas de severidad Alta o Crítica de los últimos ${VENTANA_DIAS} días están dentro de un incidente registrado (${Array.from(cubridores).join(', ')}).${notaExcluidas}${notaPendientes}${notaP03}`
      : `Ninguna alerta de severidad Alta o Crítica (nivel ${c.relevanteDesde} o superior según P-01) en los últimos ${VENTANA_DIAS} días que haya que convertir en incidente.${notaExcluidas}${notaPendientes}${notaP03}`
  );
};

// La primera alerta relevante que cubre el incidente: el instante de detección.
const deteccion = (
  i: Incidente,
  context: ENSPolicyContext,
  ahora: number
): number | undefined => {
  const c = clasificacion(context);
  const plazo = escalados(context)?.get(i.severidad)?.plazo;

  if (!c || plazo === undefined) {
    return undefined;
  }

  const candidatas = alertas(context, ahora).filter(a => {
    const s = severidadDeNivel(a.nivel, c);

    return (
      s &&
      RELEVANTES.includes(s) &&
      i.sistemas.some(x => mismoSistema(x, a.sistema)) &&
      a.primera <= i.apertura &&
      a.primera >= i.apertura - plazo * HORA
    );
  });

  return candidatas.length ? Math.min(...candidatas.map(a => a.primera)) : undefined;
};

const ev03 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-03', { registro: true });

  if (esMedida(latido)) {
    return latido;
  }

  const tabla = filas(context, 'P-05');

  if (!tabla) {
    return sinMedir(`${etiqueta(context, 'P-05')} está sin configurar: no hay plazos contra los que medir la respuesta.`, 'CONFIGURATION');
  }

  const registrados = incidentes(context, ahora);

  if (!registrados.length) {
    return sinMedir(
      `No hay incidentes registrados vivos en los últimos ${VENTANA_DIAS} días: no hay tiempos de respuesta que medir.`
    );
  }

  const plazos = new Map<string, { contencion?: number; resolucion?: number }>();

  tabla.forEach(f => {
    const s = sinTildes(f.severidad || '');

    if (SEVERIDADES.includes(s)) {
      plazos.set(s, {
        contencion: numero(f.contencion_horas || ''),
        resolucion: numero(f.resolucion_horas || ''),
      });
    }
  });

  type Serie = { contencion: number[]; resolucion: number[]; deteccion: number[] };
  const series = new Map<string, Serie>();
  const sinFila = new Set<string>();
  const excedidos: string[] = [];
  const pendientes: string[] = [];

  registrados.forEach(i => {
    const plazo = plazos.get(i.severidad);

    if (!plazo) {
      sinFila.add(`${i.id} (${NOMBRE[i.severidad] || 'sin severidad'})`);

      return;
    }

    const serie = series.get(i.severidad) || { contencion: [], resolucion: [], deteccion: [] };

    // Contención: hasta la fase intermedio; si se cerró sin ella, el cierre la
    // implica. Abierto sin contener: lo que lleva, solo si ya supera el plazo.
    const medir = (fin: number | undefined, limite: number | undefined, eje: 'contencion' | 'resolucion') => {
      if (fin !== undefined) {
        serie[eje].push(fin - i.apertura);

        if (limite !== undefined && fin - i.apertura > limite * HORA) {
          excedidos.push(`${i.id} (${NOMBRE[i.severidad]}): ${eje === 'contencion' ? 'contención' : 'resolución'} en ${horas(fin - i.apertura)} h, plazo ${limite} h`);
        }

        return;
      }

      if (limite !== undefined && ahora - i.apertura > limite * HORA) {
        serie[eje].push(ahora - i.apertura);
        excedidos.push(`${i.id} (${NOMBRE[i.severidad]}): sin ${eje === 'contencion' ? 'contención' : 'resolución'} registrada tras ${horas(ahora - i.apertura)} h, plazo ${limite} h`);
      } else {
        pendientes.push(`${i.id} (${eje === 'contencion' ? 'contención' : 'resolución'})`);
      }
    };

    medir(i.contencion ?? i.cierre, plazo.contencion, 'contencion');
    medir(i.cierre, plazo.resolucion, 'resolucion');

    const detectada = deteccion(i, context, ahora);

    if (detectada !== undefined) {
      serie.deteccion.push(i.apertura - detectada);
    }

    series.set(i.severidad, serie);
  });

  const media = (xs: number[]): number | undefined =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;

  const fueraDeMedia: string[] = [];
  const resumen: string[] = [];

  series.forEach((serie, severidad) => {
    const plazo = plazos.get(severidad)!;
    const mc = media(serie.contencion);
    const mr = media(serie.resolucion);
    const md = media(serie.deteccion);

    resumen.push(
      `${NOMBRE[severidad]}: MTTD ${md !== undefined ? `${horas(md)} h` : 'sin alerta de origen'}, contención media ${mc !== undefined ? `${horas(mc)} h` : '—'} (plazo ${plazo.contencion ?? 'sin declarar'}), resolución media ${mr !== undefined ? `${horas(mr)} h` : '—'} (plazo ${plazo.resolucion ?? 'sin declarar'})`
    );

    if (mc !== undefined && plazo.contencion !== undefined && mc > plazo.contencion * HORA) {
      fueraDeMedia.push(`contención media de ${NOMBRE[severidad]} ${horas(mc)} h > ${plazo.contencion} h`);
    }

    if (mr !== undefined && plazo.resolucion !== undefined && mr > plazo.resolucion * HORA) {
      fueraDeMedia.push(`resolución media de ${NOMBRE[severidad]} ${horas(mr)} h > ${plazo.resolucion} h`);
    }
  });

  if (fueraDeMedia.length) {
    return noCumple(
      `Los tiempos de respuesta superan los plazos de P-05: ${lista(fueraDeMedia)}. Incidentes fuera de plazo: ${lista(excedidos)}. (${resumen.join(' | ')}.)`
    );
  }

  if (sinFila.size) {
    return sinMedir(`P-05 no tiene fila para la severidad de: ${lista(Array.from(sinFila))}.`, 'CONFIGURATION');
  }

  const medidos = Array.from(series.values()).some(s => s.contencion.length || s.resolucion.length);

  if (!medidos) {
    return sinMedir(`Ningún incidente ha llegado todavía a contención o resolución, y ninguno ha superado su plazo: pendientes ${lista(pendientes)}.`);
  }

  return cumple(
    `Tiempos medios dentro de P-05: ${resumen.join(' | ')}.${excedidos.length ? ` Incidentes sueltos fuera de plazo (la media sigue dentro): ${lista(excedidos)}.` : ''}${pendientes.length ? ` Pendientes: ${lista(pendientes)}.` : ''}`
  );
};

const ev04 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-04', { registro: true });

  if (esMedida(latido)) {
    return latido;
  }

  const p02 = escalados(context);

  if (!p02) {
    return sinMedir(`${etiqueta(context, 'P-02')} está sin configurar: no se sabe a quién había que escalar ni en qué plazo.`, 'CONFIGURATION');
  }

  const registrados = incidentes(context, ahora);

  if (!registrados.length) {
    return sinMedir(
      `No hay incidentes registrados vivos en los últimos ${VENTANA_DIAS} días: no hay escalado que verificar.`
    );
  }

  // Desde MEDIA, además, la comunicación a los responsables de P-04 (r2.3).
  const conResponsables = context.level === 'MEDIO' || context.level === 'ALTO';
  const p04 = filas(context, 'P-04');
  const fallos: string[] = [];
  const sinDecidir: string[] = [];
  const pendientes: string[] = [];
  let bien = 0;

  registrados.forEach(i => {
    const fila = p02.get(i.severidad);
    let fallo = false;

    if (!fila) {
      sinDecidir.push(`${i.id}: P-02 no tiene fila para la severidad ${NOMBRE[i.severidad] || 'sin severidad'}`);

      return;
    }

    const exigidos = nombres(fila.destinatario);
    const escaladas = i.notificaciones.filter(n => n.escaladoA && n.escaladoA !== '-');
    const constan = new Set(escaladas.flatMap(n => nombres(n.escaladoA)));
    const faltan = exigidos.filter(d => !constan.has(d));
    const referencia = Math.min(i.apertura, deteccion(i, context, ahora) ?? i.apertura);
    const plazoMs = fila.plazo !== undefined ? fila.plazo * HORA : undefined;

    if (!escaladas.length) {
      if (plazoMs !== undefined && ahora - referencia <= plazoMs && i.cierre === undefined) {
        pendientes.push(i.id);

        return;
      }

      fallos.push(`${i.id} (${NOMBRE[i.severidad]}): no consta ningún escalado; correspondía a ${fila.destinatario}`);

      return;
    }

    if (faltan.length) {
      fallo = true;
      fallos.push(`${i.id} (${NOMBRE[i.severidad]}): no consta escalado a ${faltan.join(', ')} (P-02 exige ${fila.destinatario})`);
    }

    const primero = Math.min(...escaladas.map(n => n.fecha));

    if (plazoMs !== undefined && primero - referencia > plazoMs) {
      fallo = true;
      fallos.push(`${i.id}: escalado ${horas(primero - referencia)} h después de la detección, plazo ${fila.plazo} h`);
    }

    if (conResponsables) {
      if (!p04) {
        sinDecidir.push(`${i.id}: ${etiqueta(context, 'P-04')} sin configurar`);

        return;
      }

      const notificados = new Set(i.notificaciones.flatMap(n => nombres(n.notificadoA)));

      i.sistemas.forEach(s => {
        const r = filaDelSistema(p04, 'sistema', s);

        if (!r) {
          sinDecidir.push(`${i.id}: P-04 no tiene fila para ${s} ni una fila «*»`);

          return;
        }

        const debidos = [r.responsable_informacion, r.responsable_servicio]
          .filter(Boolean)
          .flatMap(nombres);
        const sinInformar = debidos.filter(d => !notificados.has(d));

        if (sinInformar.length) {
          if (i.cierre === undefined && plazoMs !== undefined && ahora - referencia <= plazoMs) {
            pendientes.push(`${i.id} (responsables de ${s})`);
          } else {
            fallo = true;
            fallos.push(`${i.id}: no consta comunicación a ${sinInformar.join(', ')} (responsables de ${s} en P-04)`);
          }
        }
      });
    }

    if (!fallo) {
      bien += 1;
    }
  });

  if (fallos.length) {
    return noCumple(`Escalado o comunicación incumplidos: ${lista(fallos)}.`);
  }

  // Lo que queda sin decidir es siempre una fila que P-02 o P-04 no tienen.
  if (sinDecidir.length) {
    return sinMedir(`No se puede juzgar todo: ${lista(sinDecidir)}.`, 'CONFIGURATION');
  }

  if (!bien) {
    return sinMedir(`Los incidentes están dentro de su plazo de escalado y aún no consta el escalado: ${lista(pendientes)}.`);
  }

  return cumple(
    `${bien} incidente(s) escalados a quien exige P-02 dentro de su plazo${conResponsables ? ', con comunicación a los responsables de P-04' : ''}.${pendientes.length ? ` En plazo todavía: ${lista(pendientes)}.` : ''}`
  );
};

const ev05 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-05', { registro: true });

  if (esMedida(latido)) {
    return latido;
  }

  const p08 = filas(context, 'P-08');

  if (!p08) {
    return sinMedir(`${etiqueta(context, 'P-08')} está sin configurar: no se ha decidido qué evidencias se preservan.`, 'CONFIGURATION');
  }

  const registrados = incidentes(context, ahora);

  if (!registrados.length) {
    return sinMedir(
      `No hay incidentes registrados vivos en los últimos ${VENTANA_DIAS} días: no hay registros que preservar.`
    );
  }

  // El último sello comprobado de cada día.
  const dias = new Map<string, ENSNormalizedEvent>();

  hechos(context, 'alert_log_seal_checked')
    .sort((a, b) => (instante(a.timestamp) || 0) - (instante(b.timestamp) || 0))
    .forEach(e => dias.set(campo(e, 'dia'), e));

  const fallos: string[] = [];
  const pendientes: string[] = [];
  let comprobados = 0;

  registrados.forEach(i => {
    const suyos = Array.from(dias.values()).filter(e => enLista(campo(e, 'incidentes'), i.id));

    if (!suyos.length) {
      pendientes.push(i.id);

      return;
    }

    suyos.forEach(e => {
      const dia = campo(e, 'dia');
      const sello = campo(e, 'sello_sha256');
      const calculado = campo(e, 'calculado_sha256');
      const cadena = campo(e, 'cadena_sha256');
      const anterior = campo(e, 'anterior_sha256');

      comprobados += 1;

      if (campo(e, 'conservado') !== 'si') {
        fallos.push(`${i.id}: el registro de alertas del ${dia} no se conserva (${campo(e, 'fichero')})`);
      } else if (campo(e, 'sellado') !== 'si' || !sello || sello === '-') {
        fallos.push(`${i.id}: el registro del ${dia} no tiene sello de integridad`);
      } else if (sello !== calculado) {
        fallos.push(`${i.id}: el registro del ${dia} NO coincide con su sello (sellado ${sello.slice(0, 12)}…, hoy ${calculado.slice(0, 12)}…): ha sido alterado`);
      } else if (cadena && cadena !== '-' && anterior && anterior !== '-' && cadena !== anterior) {
        fallos.push(`${i.id}: la cadena de sellos se rompe el ${dia} (el sello del día anterior ha cambiado)`);
      }
    });
  });

  const otros = p08
    .map(f => f.tipo_evidencia)
    .filter(t => t && !/registro|log|alerta/i.test(t));
  const notaOtros = otros.length
    ? ` Sin verificación técnica (se acreditan fuera de ENSFácil): ${otros.join(', ')}.`
    : '';

  if (fallos.length) {
    return noCumple(`Registros de incidentes sin proteger: ${lista(fallos)}.${notaOtros}`);
  }

  if (!comprobados) {
    return sinMedir(`Ningún día de los incidentes está sellado todavía (se sella al rotar, a medianoche): ${lista(pendientes)}.`);
  }

  return cumple(
    `Los ${comprobados} registros diarios de alertas de los incidentes se conservan y coinciden con su sello SHA-256, con la cadena de sellos intacta.${pendientes.length ? ` Aún sin día sellado: ${lista(pendientes)}.` : ''}${notaOtros}`
  );
};

const ev06 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-06', { registro: true, alertas: true });

  if (esMedida(latido)) {
    return latido;
  }

  const graves = incidentes(context, ahora).filter(i => RELEVANTES.includes(i.severidad));

  if (!graves.length) {
    return sinMedir(
      `No hay incidentes de severidad Alta o Crítica vivos en los últimos ${VENTANA_DIAS} días: no hay contención que exigir.`
    );
  }

  const autorizadas = new Set(
    (filas(context, 'P-09') || []).map(f => (f.accion || '').trim().toLowerCase()).filter(Boolean)
  );
  const p02 = escalados(context);
  const plazosContencion = new Map<string, number>();

  (filas(context, 'P-05') || []).forEach(f => {
    const s = sinTildes(f.severidad || '');
    const h = numero(f.contencion_horas || '');

    if (SEVERIDADES.includes(s) && h !== undefined) {
      plazosContencion.set(s, h);
    }
  });

  const ejecuciones = hechos(context, 'active_response_executed').filter(conOrigen).map(e => ({
    sistema: campo(e, 'sistema'),
    comando: campo(e, 'comando').toLowerCase(),
    accion: campo(e, 'accion'),
    t: instante(campo(e, 'instante')),
  }));

  const fallos: string[] = [];
  const pendientes: string[] = [];
  const contenidos: string[] = [];

  graves.forEach(i => {
    const antes = (p02?.get(i.severidad)?.plazo || 0) * HORA;
    const ar = ejecuciones.find(
      x =>
        x.t !== undefined &&
        autorizadas.has(x.comando) &&
        x.accion !== 'delete' &&
        i.sistemas.some(s => mismoSistema(s, x.sistema)) &&
        x.t >= i.apertura - antes &&
        x.t <= (i.cierre ?? ahora)
    );

    if (ar) {
      contenidos.push(`${i.id} por ${ar.comando} en ${ar.sistema}`);

      return;
    }

    if (i.contencion !== undefined) {
      contenidos.push(`${i.id} (contención registrada el ${iso(i.contencion)})`);

      return;
    }

    const limite = plazosContencion.get(i.severidad);

    if (i.cierre === undefined && (limite === undefined || ahora - i.apertura <= limite * HORA)) {
      pendientes.push(i.id);

      return;
    }

    fallos.push(
      `${i.id} (${NOMBRE[i.severidad]}, ${i.sistemas.join(', ')}): ni respuesta activa de P-09 en sus sistemas ni contención registrada${i.cierre !== undefined ? ' antes del cierre' : ` en ${horas(ahora - i.apertura)} h`}`
    );
  });

  const ajenas = ejecuciones.filter(x => x.comando && !autorizadas.has(x.comando));
  const notaAjenas = ajenas.length
    ? ` Respuestas activas de comandos que P-09 no declara (no cuentan como contención): ${Array.from(new Set(ajenas.map(x => `${x.comando} en ${x.sistema}`))).join(', ')}.`
    : '';

  if (fallos.length) {
    return noCumple(`Incidentes graves sin medidas urgentes de contención: ${lista(fallos)}.${notaAjenas}`);
  }

  if (!contenidos.length) {
    return sinMedir(`Los incidentes graves están aún dentro de su plazo de contención: ${lista(pendientes)}.${notaAjenas}`);
  }

  return cumple(
    `Consta contención en los incidentes graves: ${lista(contenidos)}.${pendientes.length ? ` Aún en plazo: ${lista(pendientes)}.` : ''}${notaAjenas}`
  );
};

const ev07 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-07', { registro: true });

  if (esMedida(latido)) {
    return latido;
  }

  const p07 = filas(context, 'P-07');

  if (!p07) {
    return sinMedir(`${etiqueta(context, 'P-07')} está sin configurar: no se sabe qué sistemas tratan datos personales.`, 'CONFIGURATION');
  }

  const afectados = incidentes(context, ahora).filter(
    i =>
      i.datosPersonales === 'si' ||
      i.sistemas.some(s => filaDelSistema(p07, 'sistema', s))
  );

  if (!afectados.length) {
    return sinMedir(
      `Ningún incidente vivo en los últimos ${VENTANA_DIAS} días afecta a un sistema de P-07: no hay régimen del RGPD que verificar.`
    );
  }

  const plazo = AEPD_HORAS * HORA;
  const fallos: string[] = [];
  const pendientes: string[] = [];
  const bien: string[] = [];

  afectados.forEach(i => {
    const vencido = i.cierre !== undefined || ahora - i.apertura > plazo;

    if (i.datosPersonales === '-') {
      if (vencido) {
        fallos.push(`${i.id} (${i.sistemas.join(', ')}): sin valoración de afectación a datos personales`);
      } else {
        pendientes.push(i.id);
      }

      return;
    }

    if (i.datosPersonales === 'no') {
      bien.push(`${i.id} valorado sin afectación`);

      return;
    }

    const aepd = i.notificaciones
      .filter(n => nombres(n.notificadoA).some(x => x.includes('aepd')))
      .map(n => n.fecha);

    if (aepd.length) {
      const primera = Math.min(...aepd);

      if (primera - i.apertura > plazo) {
        fallos.push(`${i.id}: notificado a la AEPD ${horas(primera - i.apertura)} h después de la apertura (máximo ${AEPD_HORAS} h)`);
      } else {
        bien.push(`${i.id} notificado a la AEPD en ${horas(primera - i.apertura)} h`);
      }

      return;
    }

    if (vencido && ahora - i.apertura > plazo) {
      fallos.push(`${i.id}: afecta a datos personales y no consta notificación a la AEPD en ${AEPD_HORAS} h`);
    } else if (vencido) {
      fallos.push(`${i.id}: afecta a datos personales, se cerró y no consta notificación a la AEPD`);
    } else {
      pendientes.push(i.id);
    }
  });

  if (fallos.length) {
    return noCumple(`Incidentes con datos personales fuera del régimen del RGPD: ${lista(fallos)}.`);
  }

  if (!bien.length) {
    return sinMedir(`Incidentes con datos personales aún dentro de las ${AEPD_HORAS} h: ${lista(pendientes)}.`);
  }

  return cumple(`${lista(bien)}.${pendientes.length ? ` Aún dentro de las ${AEPD_HORAS} h: ${lista(pendientes)}.` : ''}`);
};

const ev08 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-08', { registro: true });

  if (esMedida(latido)) {
    return latido;
  }

  const p06 = filas(context, 'P-06');

  if (!p06) {
    return sinMedir(`${etiqueta(context, 'P-06')} está sin configurar: no hay ventanilla única declarada.`, 'CONFIGURATION');
  }

  const c = clasificacion(context);

  if (!c || !c.notificables.size) {
    return sinMedir(`${etiqueta(context, 'P-01')} no marca ninguna severidad como notificable al CCN-CERT: no se sabe qué incidentes había que notificar.`, 'CONFIGURATION');
  }

  const notificables = incidentes(context, ahora).filter(i => c.notificables.has(i.severidad));

  if (!notificables.length) {
    return sinMedir(
      `Ningún incidente vivo en los últimos ${VENTANA_DIAS} días es de una severidad notificable según P-01.`
    );
  }

  const p02 = escalados(context);
  const fallos: string[] = [];
  const pendientes: string[] = [];
  const bien: string[] = [];

  notificables.forEach(i => {
    const plazo = p02?.get(i.severidad)?.plazo;
    const plazoMs = plazo !== undefined ? plazo * HORA : undefined;

    if (i.ccnCert !== undefined) {
      if (plazoMs !== undefined && i.ccnCert - i.apertura > plazoMs) {
        fallos.push(`${i.id}: notificado al CCN-CERT ${horas(i.ccnCert - i.apertura)} h después de la apertura (plazo ${plazo} h)`);
      } else {
        bien.push(`${i.id} (${iso(i.ccnCert)})`);
      }

      return;
    }

    if (i.cierre !== undefined || (plazoMs !== undefined && ahora - i.apertura > plazoMs)) {
      fallos.push(`${i.id} (${NOMBRE[i.severidad]}): notificable y sin notificación al CCN-CERT`);
    } else {
      pendientes.push(i.id);
    }
  });

  if (fallos.length) {
    return noCumple(`Incidentes notificables sin notificar al CCN-CERT por ${p06[0].plataforma}: ${lista(fallos)}.`);
  }

  if (!bien.length) {
    return sinMedir(`Incidentes notificables aún en plazo: ${lista(pendientes)}.`);
  }

  return cumple(`Notificados al CCN-CERT por ${p06[0].plataforma}: ${lista(bien)}.${pendientes.length ? ` En plazo: ${lista(pendientes)}.` : ''}`);
};

const ev09 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-09', { alertas: true, ossecConf: true });

  if (esMedida(latido)) {
    return latido;
  }

  const p10 = filas(context, 'P-10');

  if (!p10) {
    return sinMedir(`${etiqueta(context, 'P-10')} está sin configurar: no hay elementos de reconfiguración dinámica declarados.`, 'CONFIGURATION');
  }

  const autorizadas = new Set(
    (filas(context, 'P-09') || []).map(f => (f.accion || '').trim().toLowerCase()).filter(Boolean)
  );

  if (!autorizadas.size) {
    return sinMedir(`${etiqueta(context, 'P-09')} está sin configurar: no hay acciones de reconfiguración autorizadas.`, 'CONFIGURATION');
  }

  const elementos = p10.map(f => f.elemento).filter(Boolean);
  // Para saber si un sistema TIENE agente vale cualquier ejecución, también
  // las que no disparó ninguna alerta: solo dicen que el agente está ahí.
  const conAgente = new Set(
    hechos(context, 'security_alert_observed')
      .concat(hechos(context, 'active_response_executed'))
      .map(e => campo(e, 'sistema').toLowerCase())
  );
  const observables = elementos.filter(e => conAgente.has(e.toLowerCase()));

  const reconfiguraciones = hechos(context, 'active_response_executed').filter(
    e =>
      conOrigen(e) &&
      autorizadas.has(campo(e, 'comando').toLowerCase()) &&
      campo(e, 'accion') !== 'delete' &&
      elementos.some(x => mismoSistema(x, campo(e, 'sistema')))
  );

  // Un incidente grave en un elemento de P-10 sin reconfiguración durante él.
  const graves = incidentes(context, ahora).filter(
    i => RELEVANTES.includes(i.severidad) && i.sistemas.some(s => elementos.some(x => mismoSistema(x, s)))
  );
  const sinReaccion = graves.filter(
    i =>
      i.cierre !== undefined &&
      !reconfiguraciones.some(e => {
        const t = instante(campo(e, 'instante'));

        return t !== undefined && t >= i.apertura && t <= (i.cierre as number) && i.sistemas.some(s => mismoSistema(s, campo(e, 'sistema')));
      })
  );

  if (sinReaccion.length) {
    return noCumple(
      `Incidentes graves en elementos de P-10 cerrados sin ninguna reconfiguración: ${lista(sinReaccion.map(i => `${i.id} (${i.sistemas.join(', ')})`))}.`
    );
  }

  if (reconfiguraciones.length) {
    return cumple(
      `Reconfiguración dinámica ejercitada: ${lista(reconfiguraciones.map(e => `${campo(e, 'comando')} en ${campo(e, 'sistema')} (${campo(e, 'instante')})`))}.`
    );
  }

  if (!observables.length) {
    return sinMedir(
      `Ningún elemento de P-10 (${elementos.join(', ')}) tiene agente de Wazuh en el alcance: sus cambios no se pueden observar.`,
      'COLLECTION'
    );
  }

  return sinMedir(
    `No consta ninguna reconfiguración con una acción de P-09 sobre ${observables.join(', ')} en los últimos ${VENTANA_DIAS} días: la capacidad no se ha ejercitado y no se puede demostrar.${notaSinOrigen(context)}`
  );
};

const ev10 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-10', { ossecConf: true });

  if (esMedida(latido)) {
    return latido;
  }

  const p11 = (filas(context, 'P-11') || []).filter(f => f.lista_cdb);

  if (!p11.length) {
    return sinMedir(`${etiqueta(context, 'P-11')} no declara ninguna lista CDB en la que se carguen los indicadores de los avisos.`, 'CONFIGURATION');
  }

  const ultimas = new Map<string, ENSNormalizedEvent>();

  hechos(context, 'threat_list_observed')
    .sort((a, b) => (instante(a.timestamp) || 0) - (instante(b.timestamp) || 0))
    .forEach(e => ultimas.set(campo(e, 'lista'), e));

  const fallos: string[] = [];
  const sinDecidir: string[] = [];
  const bien: string[] = [];

  p11.forEach(f => {
    const nombre = f.lista_cdb.trim().replace(/^\/var\/ossec\//, '');
    const e = ultimas.get(nombre);
    const plazo = numero(f.plazo_dias || '');

    if (!e) {
      fallos.push(`${nombre} no está cargada en el ossec.conf del manager`);

      return;
    }

    if (campo(e, 'existe') !== 'si') {
      fallos.push(`${nombre} está declarada en el ossec.conf pero el fichero no existe`);

      return;
    }

    if ((numero(campo(e, 'reglas_que_la_usan')) || 0) === 0) {
      fallos.push(`ninguna regla usa ${nombre}: sus indicadores no dan capacidad de detección`);

      return;
    }

    const modificada = instante(campo(e, 'modificada'));

    if (plazo === undefined) {
      sinDecidir.push(`${nombre}: P-11 no declara el plazo de incorporación`);

      return;
    }

    if (modificada === undefined) {
      sinDecidir.push(`${nombre}: sin fecha de modificación legible`);

      return;
    }

    if (ahora - modificada > plazo * DIA) {
      fallos.push(`${nombre} lleva ${Math.floor((ahora - modificada) / DIA)} días sin actualizarse (plazo ${plazo})`);

      return;
    }

    bien.push(`${nombre} (${campo(e, 'entradas')} entradas, actualizada ${campo(e, 'modificada')}, ${campo(e, 'reglas_que_la_usan')} regla(s))`);
  });

  if (fallos.length) {
    return noCumple(`Los avisos del CCN-CERT no se traducen en detección vigente: ${lista(fallos)}.`);
  }

  if (sinDecidir.length) {
    return sinMedir(`No se puede juzgar todo: ${lista(sinDecidir)}.`);
  }

  return cumple(`Listas de indicadores cargadas, usadas y al día: ${lista(bien)}.`);
};

const ev11 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-11', { alertas: true, ossecConf: true });

  if (esMedida(latido)) {
    return latido;
  }

  const configuradas = hechos(context, 'active_response_configured').filter(
    e => campo(e, 'deshabilitada') !== 'si'
  );

  if (!configuradas.length) {
    return noCumple('No hay ninguna respuesta activa habilitada en el ossec.conf del manager.');
  }

  const ejecutadas = hechos(context, 'active_response_executed').filter(conOrigen);
  const texto = Array.from(new Set(configuradas.map(e => `${campo(e, 'comando')} (${campo(e, 'reglas')})`))).join(', ');

  if (!ejecutadas.length) {
    return sinMedir(
      `Respuesta automática configurada (${texto}) pero sin ninguna ejecución disparada por una alerta en los últimos ${VENTANA_DIAS} días: no hay prueba de que opere.${notaSinOrigen(context)}`
    );
  }

  return cumple(
    `Respuesta automática configurada (${texto}) y ejercitada ${ejecutadas.length} vez/veces a raíz de una alerta en los últimos ${VENTANA_DIAS} días: ${lista(
      ejecutadas.map(e => `${campo(e, 'comando')} en ${campo(e, 'sistema')} por la regla ${campo(e, 'regla_disparadora')} (${campo(e, 'instante')})`)
    )}.${notaSinOrigen(context)}`
  );
};

const ev12 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latido = fuentes(context, ahora, 'EV-12', { registro: true });

  if (esMedida(latido)) {
    return latido;
  }

  const cerrados = incidentes(context, ahora).filter(i => i.cierre !== undefined);

  if (!cerrados.length) {
    return sinMedir(
      `Ningún incidente cerrado en los últimos ${VENTANA_DIAS} días: no hay bucle de mejora que verificar.`
    );
  }

  const sin = cerrados.filter(i => !i.mejoras.length);

  if (sin.length) {
    return noCumple(
      `Incidentes cerrados sin ninguna medida de mejora registrada: ${lista(sin.map(i => i.id))}.`
    );
  }

  return cumple(`Los ${cerrados.length} incidentes cerrados tienen medidas de mejora registradas.`);
};

// --- decisiones ------------------------------------------------------------

type Evidencias = Record<string, Medida>;

const REQUISITOS: Record<string, { evidencias: string[]; parametros: string[]; tipo: ENSPolicyDecision['trace']['ruleType'] }> = {
  'op.exp.7.1': { evidencias: ['EV-01', 'EV-02', 'EV-04'], parametros: ['P-01', 'P-02', 'P-03', 'P-12'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.2': { evidencias: ['EV-07'], parametros: ['P-07'], tipo: 'CONDITIONAL_REQUIRED' },
  'op.exp.7.r1.1': { evidencias: ['EV-08'], parametros: ['P-06', 'P-01', 'P-02'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r2.1': { evidencias: ['EV-05', 'EV-06'], parametros: ['P-08', 'P-09'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r2.2': { evidencias: ['EV-03'], parametros: ['P-05', 'P-01'], tipo: 'MAX_AGE' },
  'op.exp.7.r2.3': { evidencias: ['EV-04'], parametros: ['P-02', 'P-04'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r2.4': { evidencias: ['EV-12'], parametros: [], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r3.1': { evidencias: ['EV-09'], parametros: ['P-09', 'P-10'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r3.2': { evidencias: ['EV-10'], parametros: ['P-11'], tipo: 'MAX_AGE' },
  'op.exp.7.r4.1': { evidencias: ['EV-11'], parametros: ['P-09'], tipo: 'COVERAGE_REQUIRED' },
};

const decide = (
  requisito: string,
  estado: Medida['estado'],
  evidencias: string[],
  parametros: string[],
  tipo: ENSPolicyDecision['trace']['ruleType'],
  ruleId: string,
  motivo: string,
  esperado: string,
  causa?: ENSGapCause
): ENSPolicyDecision => ({
  policyId: POLICY,
  requirementId: requisito,
  status: estado,
  parameterIds: parametros,
  evidenceIds: evidencias,
  eventIds: [],
  runtimeVariables: [],
  trace: {
    ruleId,
    ruleType: tipo,
    expression: esperado,
    expected: esperado,
    actual: estado,
    result: estado === 'CUMPLE',
  },
  reason: motivo,
  ...(estado === 'NO_EVALUABLE' && causa ? { cause: causa } : {}),
});

export const evaluateOpExp7 = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();

  const medidas: Evidencias = {
    'EV-01': ev01(context, ahora),
    'EV-02': ev02(context, ahora),
    'EV-03': ev03(context, ahora),
    'EV-04': ev04(context, ahora),
    'EV-05': ev05(context, ahora),
    'EV-06': ev06(context, ahora),
    'EV-07': ev07(context, ahora),
    'EV-08': ev08(context, ahora),
    'EV-09': ev09(context, ahora),
    'EV-10': ev10(context, ahora),
    'EV-11': ev11(context, ahora),
    'EV-12': ev12(context, ahora),
  };

  const decisions: ENSPolicyDecision[] = [];

  Object.entries(REQUISITOS).forEach(([requisito, { evidencias, parametros, tipo }]) => {
    const propias = evidencias.map(id => ({ id, medida: medidas[id] }));
    const estado = peor(propias.map(p => p.medida));

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`
    // (`find` devuelve la primera). Nombra solo las evidencias que la
    // sostienen, para que el puente no pinte una evidencia sana con el color de
    // otra.
    const responsables = propias.filter(p => p.medida.estado === estado);

    decisions.push(
      withReasonParts(decide(
        requisito,
        estado,
        responsables.map(p => p.id),
        parametros,
        tipo,
        requisito,
        compositeReason(propias),
        evidencias.map(id => `${id} CUMPLE`).join(' y '),
        causaComun(responsables.map(p => p.medida))
      ), reasonPartsOf(propias))
    );

    // Y una por evidencia, con SU estado, para que la tabla de evidencias diga
    // lo que se midió de cada una y no el agregado.
    propias.forEach(p =>
      decisions.push(
        decide(
          requisito,
          p.medida.estado,
          [p.id],
          parametros,
          tipo,
          `${requisito}/${p.id}`,
          p.medida.motivo,
          `${p.id} CUMPLE`,
          p.medida.causa
        )
      )
    );
  });

  const variables: ENSRuntimeVariable[] = Object.entries(medidas).map(([id, medida]) => ({
    name: `medida_${id.replace('-', '')}`,
    value: medida.estado,
    parameterIds: [],
    evidenceIds: [id],
    eventIds: [],
    description: medida.motivo,
  }));

  return { decisions, runtimeVariables: variables };
};

export const opExp7PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluateOpExp7,
  requirements: [
    {
      requirementId: 'op.exp.7.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-12'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      // Refuerzos acumulativos: MEDIA «+ R1 + R2», ALTA «+ R1 + R2 + R3».
      requirementId: 'op.exp.7.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06', 'P-01', 'P-02'],
      evidenceIds: ['EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-05', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r2.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05', 'P-01'],
      evidenceIds: ['EV-03'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.7.r2.3',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04'],
      evidenceIds: ['EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r2.4',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: ['EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-09', 'P-10'],
      evidenceIds: ['EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r3.2',
      levels: ['ALTO'],
      parameterIds: ['P-11'],
      evidenceIds: ['EV-10'],
      ruleType: 'MAX_AGE',
    },
    // R4 lo define el ENS pero no lo exige en ninguna categoría: sin niveles,
    // el motor lo evalúa NO_APLICA.
    {
      requirementId: 'op.exp.7.r4.1',
      levels: [],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-11'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
