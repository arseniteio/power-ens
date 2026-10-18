// op.exp.9 · Registro de la gestión de incidentes
//
// Por qué este control tiene policy propia. Las siete primitivas contrastan UN
// hecho contra UN parámetro, agrupando por máquina. Aquí casi todo se agrupa
// por otra clave que ningún control usaba: el EXPEDIENTE (`incidente_id`), y
// casi todo cruza dos flujos de hechos distintos por esa clave:
//
//   EV-01  cada sistema afectado de cada incidente conserva sus alertas y los
//          archivos diarios de la ventana verifican su suma encadenada.
//   EV-02  cada incidente tiene las fases de reporte de P-02, con la
//          excepción de la duración y del final de un incidente abierto.
//   EV-03  toda respuesta activa observada en la ventana de un incidente
//          consta como actuación de emergencia de ESE incidente.
//   EV-04  todo objeto cambiado en un sistema afectado durante el incidente
//          consta como modificación derivada de ESE incidente.
//   EV-05  un incidente con relevancia jurídica tiene sellada cada evidencia
//          de P-03 (condicionado por la marca del registro y por P-04).
//   EV-06  cada evidencia sellada está en un destino de P-05, tiene cadena de
//          custodia y su SHA-256 sigue coincidiendo (plazo más largo de P-06).
//   EV-07  el periodo de un incidente abierto o con relevancia jurídica sigue
//          en disco; la protección del indexer no se ve sin credenciales.
//   EV-08  un incidente cerrado de una severidad de P-07 tiene su revisión de
//          eventos auditables dentro del plazo (el reloj empieza en el CIERRE).
//   EV-09  cada fila del expediente enlaza con él (referencia).
//
// Un registro VACÍO no es un registro AUSENTE. Ausente, no hay contra qué
// juzgar. Vacío se juzga: cero incidentes frente a las alertas que el manager
// vio (P-08, sin los grupos de P-09). Y lo que no exige nada —ningún incidente con relevancia jurídica,
// ninguna revisión vencida— se dice con el registro leído como prueba, no se
// da por bueno sin leerlo.
//
// Invariantes, las mismas que `evidence/judgment.ts`:
//   - el recolector emite instantes y recuentos, no veredictos ni edades: los
//     plazos se miden aquí contra `context.now`;
//   - sin latido reciente, sin registro o sin parámetro, NO_EVALUABLE con
//     motivo; nunca un CUMPLE por ausencia de datos;
//   - la policy no inventa política: ningún plazo ni nivel tiene valor por
//     defecto.
//
// Tipos y utilidades desde el fichero, nunca desde un barrel: por ahí vuelve el
// ciclo del TDZ de Settings.
// El motivo compuesto, en texto y por partes (`reasonParts`).
import { conPartes, motivoCompuesto, partesDe } from './policy-kit';
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

const CONTROL = 'op.exp.9';
const POLICY = 'policy.op.exp.9';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// El recolector del manager late cada hora y reemite ENTERO el estado de los
// registros en cada pasada: 24 h + una pasada + margen. Es tolerancia de
// OBSERVACIÓN, no política.
const FRESCURA_HORAS = 26;

// Mismo margen de reloj que `resolveCollectorCoverage`.
const TOLERANCIA_FUTURO = 5 * 60 * 1000;

// Debe coincidir con la primera opción de P-01.
const REGISTRO_ENSFACIL = 'Registro ENSFácil (/etc/ensfacil/incident-register.tsv)';

type Estado = Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;

// `causa` solo con NO_EVALUABLE: de quién es el hueco (ver `ENSGapCause`).
// Llega a la evidencia y al requisito por la decisión; sin ella la tarjeta
// heredaba la causa del modelo clásico, que no ve los hechos que lee la policy
// (un registro de incidentes ausente salía «EVIDENCE», no CONFIGURATION).
type Medida = {
  estado: Estado;
  motivo: string;
  causa?: ENSGapCause;
};

const cumple = (motivo: string): Medida => ({ estado: 'CUMPLE', motivo });
const noCumple = (motivo: string): Medida => ({ estado: 'NO_CUMPLE', motivo });
// Por defecto EVIDENCE: el dato llegó y no basta. La falta de parámetro
// (CONFIGURATION), la de latido o de hechos (COLLECTION) y el registro que la
// organización no mantiene (CONFIGURATION) lo dicen expresamente.
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

const GRAVEDAD: Record<Estado, number> = {
  CUMPLE: 0,
  NO_EVALUABLE: 1,
  NO_CUMPLE: 2,
};

const peor = (medidas: Medida[]): Estado =>
  medidas.reduce<Estado>(
    (actual, medida) =>
      GRAVEDAD[medida.estado] > GRAVEDAD[actual] ? medida.estado : actual,
    'CUMPLE'
  );

// --- lectura de hechos -----------------------------------------------------

// El normalizador parte un evento con `evidence_id=EV-02,EV-09` en uno por
// evidencia (`<id>#EV-02`, `<id>#EV-09`). Aquí se juzga el HECHO: una vez.
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

// `-` es el vacío del formato de los registros.
const vacio = (texto: string): boolean => texto === '' || texto === '-';

const numero = (texto: string): number | undefined => {
  if (!/^-?\d+(\.\d+)?$/.test(texto)) {
    return undefined;
  }

  const valor = Number(texto);

  return Number.isFinite(valor) ? valor : undefined;
};

const instante = (texto: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(texto)) {
    return undefined;
  }

  const valor = new Date(texto).getTime();

  return Number.isFinite(valor) ? valor : undefined;
};

const lista = (elementos: string[], maximo = 5): string =>
  elementos.length > maximo
    ? `${elementos.slice(0, maximo).join('; ')} y ${elementos.length - maximo} más`
    : elementos.join('; ');

const listaDe = (texto: string): string[] =>
  vacio(texto)
    ? []
    : texto
        .split(',')
        .map(t => t.trim())
        .filter(t => t && t !== '-');

// De menor a mayor: el orden decide la severidad de un incidente con varias
// filas.
const SEVERIDADES = ['baja', 'media', 'alta', 'critica'];

const sinTildes = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const mismoSistema = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const dias = (ms: number): string => (ms / DIA).toFixed(1);

// --- lectura de parámetros -------------------------------------------------

const parametro = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

const etiqueta = (context: ENSPolicyContext, id: string): string => {
  const p = parametro(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

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

const elementos = (context: ENSPolicyContext, id: string): string[] => {
  const valor = parametro(context, id)?.value;

  if (Array.isArray(valor)) {
    return valor.map(v => String(v).trim()).filter(Boolean);
  }

  if (typeof valor === 'string') {
    return valor
      .split(/[\n,]/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  return [];
};

const escalar = (context: ENSPolicyContext, id: string): string => {
  const valor = parametro(context, id)?.value;

  return valor === undefined || valor === null || Array.isArray(valor)
    ? ''
    : String(valor).trim();
};

// --- el latido y los registros ----------------------------------------------

type Latido = { evento: ENSNormalizedEvent; cubiertas: string[] };

const latido = (context: ENSPolicyContext, ahora: number): Latido | Medida => {
  const candidatos = hechos(context, 'collector_run')
    .map(e => ({ e, t: instante(e.timestamp) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO
    )
    .sort((a, b) => b.t - a.t);

  if (!candidatos.length) {
    return sinMedir(
      'No consta ninguna pasada del recolector del manager: op.exp.9 se mide en el manager (install-manager.sh del runbook) y sin él no hay registro leído ni alertas contrastadas.',
      'COLLECTION'
    );
  }

  const { e, t } = candidatos[0];

  if (ahora - t > FRESCURA_HORAS * HORA) {
    return sinMedir(
      `La última pasada del recolector del manager es de ${e.timestamp} (hace ${((ahora - t) / HORA).toFixed(1)} h, más de ${FRESCURA_HORAS} h): lo que dijo entonces de los registros no describe el estado de hoy.`,
      'COLLECTION'
    );
  }

  if (campo(e, 'resultado') !== 'completada') {
    return sinMedir(
      `La última pasada del recolector del manager (${e.timestamp}) declara resultado='${campo(e, 'resultado') || 'sin dato'}': no terminó correctamente.`,
      'COLLECTION'
    );
  }

  return { evento: e, cubiertas: listaDe(campo(e, 'evidencias_cubiertas')) };
};

const esMedida = (x: unknown): x is Medida =>
  typeof x === 'object' && x !== null && (x as Medida).estado !== undefined;

type Registro = {
  presente: boolean;
  legible: boolean;
  formato: string;
  validas: number;
  invalidas: number;
  fichero: string;
};

const registro = (context: ENSPolicyContext, nombre: string): Registro | undefined => {
  const leido = hechos(context, 'register_read')
    .filter(e => campo(e, 'registro') === nombre)
    .sort((a, b) => (instante(b.timestamp) || 0) - (instante(a.timestamp) || 0))[0];

  if (!leido) {
    return undefined;
  }

  return {
    presente: campo(leido, 'presente') === 'si',
    legible: campo(leido, 'legible') === 'si',
    formato: campo(leido, 'formato'),
    validas: numero(campo(leido, 'filas_validas')) || 0,
    invalidas: numero(campo(leido, 'filas_invalidas')) || 0,
    fichero: campo(leido, 'fichero'),
  };
};

// Un registro que no se pudo leer entero no se juzga sobre una parte; uno que no
// existe no tiene contra qué juzgarse. Devuelve la medida si hay que parar.
const registroUtilizable = (reg: Registro | undefined, nombre: string, fichero: string): Medida | undefined => {
  if (!reg) {
    return sinMedir(`El recolector del manager no ha informado del registro de ${nombre} (${fichero}) en su última pasada.`, 'COLLECTION');
  }

  if (!reg.presente) {
    return sinMedir(
      `No existe el registro de ${nombre} ${reg.fichero || fichero} en el manager (causa CONFIGURATION): un registro ausente no es un registro vacío, y sin él no hay contra qué juzgar. Créalo con la cabecera documentada.`,
      'CONFIGURATION'
    );
  }

  if (!reg.legible) {
    return sinMedir(`El registro de ${nombre} ${reg.fichero || fichero} existe pero el recolector no lo pudo leer.`, 'COLLECTION');
  }

  if (reg.formato !== 'ok') {
    return sinMedir(
      `El registro de ${nombre} ${reg.fichero || fichero} no empieza por la cabecera documentada (formato=${reg.formato || 'sin dato'}): no se interpreta un registro cuyas columnas no se conocen.`
    );
  }

  return undefined;
};

// --- los incidentes ---------------------------------------------------------

type Fila = {
  evento: ENSNormalizedEvent;
  fase: string;
  fecha?: number;
  fechaTexto: string;
  severidad: string;
  sistemas: string[];
  referencia: string;
  relevante: boolean;
};

type Incidente = {
  id: string;
  filas: Fila[];
  inicio: number;
  fin?: number;
  abierto: boolean;
  severidad: string;
  sistemas: string[];
  relevante: boolean;
};

const incidentes = (context: ENSPolicyContext): Incidente[] => {
  const porId = new Map<string, Fila[]>();

  hechos(context, 'incident_report_registered').forEach(e => {
    const id = campo(e, 'incidente_id');

    if (vacio(id)) {
      return;
    }

    const fila: Fila = {
      evento: e,
      fase: campo(e, 'fase'),
      fecha: instante(campo(e, 'fecha')),
      fechaTexto: campo(e, 'fecha'),
      severidad: sinTildes(campo(e, 'severidad')),
      sistemas: listaDe(campo(e, 'sistemas')),
      referencia: campo(e, 'referencia'),
      relevante: campo(e, 'relevancia_juridica') === 'si',
    };

    porId.set(id, [...(porId.get(id) || []), fila]);
  });

  return Array.from(porId.entries())
    .map(([id, lasFilas]) => {
      const fechas = lasFilas.map(f => f.fecha).filter((t): t is number => t !== undefined);
      const iniciales = lasFilas.filter(f => f.fase === 'inicial' && f.fecha !== undefined).map(f => f.fecha as number);
      const finales = lasFilas.filter(f => f.fase === 'final' && f.fecha !== undefined).map(f => f.fecha as number);

      // La severidad del incidente es la más alta registrada en cualquiera de
      // sus fases, la misma regla que op.exp.7: un incidente que llegó a
      // crítico no se juzga con el plazo de uno bajo porque se rebajara al
      // cerrarlo.
      const severidad = lasFilas
        .map(f => f.severidad)
        .filter(s => SEVERIDADES.includes(s))
        .reduce((a, b) => (SEVERIDADES.indexOf(b) > SEVERIDADES.indexOf(a) ? b : a), '-');

      return {
        id,
        filas: lasFilas,
        inicio: iniciales.length ? Math.min(...iniciales) : Math.min(...fechas),
        fin: finales.length ? Math.max(...finales) : undefined,
        abierto: !finales.length,
        severidad,
        sistemas: Array.from(new Set(lasFilas.flatMap(f => f.sistemas))),
        relevante: lasFilas.some(f => f.relevante),
      };
    })
    .filter(i => Number.isFinite(i.inicio))
    .sort((a, b) => a.inicio - b.inicio);
};

// --- el contexto común de cada evidencia ----------------------------------------

type Base = {
  ahora: number;
  cubiertas: string[];
  reg: Registro;
  lista: Incidente[];
};

// Lo que toda evidencia necesita antes de juzgar nada: latido reciente, P-01
// compatible, el registro de incidentes leído y la evidencia cubierta en la
// última pasada. Si falta algo, esa es la medida.
const base = (
  context: ENSPolicyContext,
  ahora: number,
  evidencia: string,
  exigeP01: boolean
): Base | Medida => {
  const vivo = latido(context, ahora);

  if (esMedida(vivo)) {
    return vivo;
  }

  const p01 = escalar(context, 'P-01');

  if (p01 && p01 !== REGISTRO_ENSFACIL) {
    return sinMedir(
      `${etiqueta(context, 'P-01')} declara «${p01}» como sistema de registro. ENSFácil solo lee su registro TSV del manager (/etc/ensfacil/incident-register.tsv); la integración con esa herramienta no existe, así que el registro de la gestión no se puede demostrar.`,
      'CONFIGURATION'
    );
  }

  if (!p01 && exigeP01) {
    return sinMedir(
      `${etiqueta(context, 'P-01')} está sin configurar: no está declarado dónde se registran los incidentes.`,
      'CONFIGURATION'
    );
  }

  const reg = registro(context, 'incidentes');
  const parada = registroUtilizable(reg, 'incidentes', '/etc/ensfacil/incident-register.tsv');

  if (parada) {
    return parada;
  }

  if (!vivo.cubiertas.includes(evidencia)) {
    return sinMedir(
      `La última pasada del recolector del manager (${vivo.evento.timestamp}) no declara haber leído las fuentes de ${evidencia}: ver sus avisos y degradaciones.`,
      'COLLECTION'
    );
  }

  return {
    ahora,
    cubiertas: vivo.cubiertas,
    reg: reg as Registro,
    lista: incidentes(context),
  };
};

// Un registro con filas que no se pudieron interpretar no permite afirmar
// nada de lo que falta: rebaja un CUMPLE a NO_EVALUABLE, nunca un NO_CUMPLE.
const conFilasInvalidas = (medida: Medida, reg: Registro, nombre = 'incidentes'): Medida =>
  medida.estado === 'CUMPLE' && reg.invalidas > 0
    ? sinMedir(
        `${medida.motivo} Pero ${reg.invalidas} fila(s) del registro de ${nombre} no se pudieron interpretar (ver los avisos del recolector): no se puede afirmar que no falte nada.`
      )
    : medida;

// --- el registro vacío -------------------------------------------------------

// Cero incidentes se juzga frente a las alertas ajenas a ENSFácil que el
// manager generó en los últimos 30 días, por encima del nivel de P-08. Solo
// EV-02 puede incumplir por esto: es la que pregunta si se registró lo que
// había que registrar; a las demás, un registro vacío con alertas pendientes
// no les deja ningún expediente que examinar.
const contrasteRegistroVacio = (
  context: ENSPolicyContext,
  paraEv02: boolean
): Medida => {
  const nivel = numero(escalar(context, 'P-08'));

  if (nivel === undefined) {
    return sinMedir(
      `El registro de incidentes está vacío y ${etiqueta(context, 'P-08')} no está declarado: sin un nivel de alerta contra el que contrastarlo, cero incidentes no se puede juzgar.`,
      'CONFIGURATION'
    );
  }

  const volumen = hechos(context, 'alert_volume_observed').sort(
    (a, b) => (instante(b.timestamp) || 0) - (instante(a.timestamp) || 0)
  )[0];

  if (!volumen) {
    return sinMedir(
      'El registro de incidentes está vacío y el recolector no ha informado del volumen de alertas del manager: no hay contraste.',
      'COLLECTION'
    );
  }

  const detalle = numero(campo(volumen, 'nivel_detalle'));

  if (detalle === undefined || nivel < detalle) {
    return sinMedir(
      `${etiqueta(context, 'P-08')} declara el nivel ${nivel}, y el recolector solo detalla por regla desde el nivel ${detalle ?? '?'}: no se puede contrastar por debajo.`
    );
  }

  const reglas = hechos(context, 'alert_rule_volume_observed');
  const declaradas = numero(campo(volumen, 'reglas'));

  if (declaradas === undefined || reglas.length < declaradas) {
    return sinMedir(
      `El recolector declara ${campo(volumen, 'reglas') || '?'} reglas con alertas de nivel ${detalle} o superior y solo han llegado ${reglas.length}: el contraste no se hace sobre una parte.`,
      'COLLECTION'
    );
  }

  const excluidos = elementos(context, 'P-09');
  const excluidas: string[] = [];
  const encima: { regla: string; nivel: number; alertas: number; texto: string }[] = [];

  reglas.forEach(r => {
    const n = numero(campo(r, 'nivel'));
    const alertas = numero(campo(r, 'alertas')) || 0;

    if (n === undefined || n < nivel || !alertas) {
      return;
    }

    const grupos = listaDe(campo(r, 'grupos'));
    const excluida = grupos.find(g => excluidos.includes(g));

    if (excluida) {
      excluidas.push(`${alertas} de la regla ${campo(r, 'regla')} (${excluida})`);

      return;
    }

    encima.push({
      regla: campo(r, 'regla'),
      nivel: n,
      alertas,
      texto: `${alertas} × regla ${campo(r, 'regla')} nivel ${n} «${campo(r, 'descripcion')}» en ${campo(r, 'agentes')}`,
    });
  });

  const total = encima.reduce((t, e) => t + e.alertas, 0);
  const ventana = `${campo(volumen, 'desde')} → ${campo(volumen, 'hasta')}`;
  const fuera = excluidas.length ? ` Excluidas por P-09: ${lista(excluidas)}.` : '';
  const sinArchivo = listaDe(campo(volumen, 'dias_sin_archivo'));

  if (total > 0) {
    encima.sort((a, b) => b.nivel - a.nivel || b.alertas - a.alertas);

    return paraEv02
      ? noCumple(
          `El registro de incidentes está vacío y el manager generó ${total} alertas ajenas a ENSFácil de nivel ${nivel} o superior (P-08) entre ${ventana}, sin ningún expediente: ${lista(encima.map(e => e.texto))}.${fuera} Si no eran incidentes, lo decide y lo documenta op.exp.7 (o se excluye su grupo en P-09); si lo eran, su gestión no está registrada.`
        )
      : sinMedir(
          `El registro de incidentes está vacío y hay ${total} alertas de nivel ${nivel} o superior sin expediente (lo señala EV-02): no hay ningún expediente que examinar.`
        );
  }

  if (sinArchivo.length) {
    return sinMedir(
      `El registro de incidentes está vacío, pero faltan los archivos de alertas de ${lista(sinArchivo)}: no se puede afirmar que en esos días no hubiera alertas de nivel ${nivel} o superior.${fuera}`
    );
  }

  return cumple(
    `El registro de incidentes está leído y vacío, y el manager no generó ninguna alerta ajena a ENSFácil de nivel ${nivel} o superior (P-08) entre ${ventana}: no consta nada que debiera tener expediente.${fuera}`
  );
};

// --- los hechos de ventana ---------------------------------------------------

type Ventana = {
  evento: ENSNormalizedEvent;
  conocido: boolean;
  alertas: number;
  sinArchivo: string[];
  alterados: string[];
  sinSuma: string[];
  acciones: number;
  accionesEmitidas: number;
  cambios: number;
  cambiosEmitidos: number;
  desde: string;
  hasta: string;
};

const ventanas = (context: ENSPolicyContext): Ventana[] =>
  hechos(context, 'incident_source_events_available').map(e => ({
    evento: e,
    conocido: campo(e, 'agente_conocido') === 'si',
    alertas: numero(campo(e, 'alertas')) || 0,
    sinArchivo: listaDe(campo(e, 'dias_sin_archivo')),
    alterados: listaDe(campo(e, 'dias_alterados')),
    sinSuma: listaDe(campo(e, 'dias_sin_suma')),
    acciones: numero(campo(e, 'acciones')) || 0,
    accionesEmitidas: numero(campo(e, 'acciones_emitidas')) || 0,
    cambios: numero(campo(e, 'cambios')) || 0,
    cambiosEmitidos: numero(campo(e, 'cambios_emitidos')) || 0,
    desde: campo(e, 'desde'),
    hasta: campo(e, 'hasta'),
  }));

const ventanaDe = (todas: Ventana[], incidente: string, sistema: string): Ventana | undefined =>
  todas.find(v => campo(v.evento, 'incidente_id') === incidente && mismoSistema(campo(v.evento, 'sistema'), sistema));

type Actuacion = {
  incidente: string;
  fecha?: number;
  sistema: string;
  tipo: string;
  objeto: string;
};

const actuaciones = (context: ENSPolicyContext): Actuacion[] =>
  hechos(context, 'incident_action_registered').map(e => ({
    incidente: campo(e, 'incidente_id'),
    fecha: instante(campo(e, 'fecha')),
    sistema: campo(e, 'sistema'),
    tipo: campo(e, 'tipo'),
    objeto: campo(e, 'objeto'),
  }));

const cubreSistema = (declarado: string, observado: string): boolean =>
  declarado === '*' || mismoSistema(declarado, observado);

// --- las evidencias --------------------------------------------------------

const ev01 = (context: ENSPolicyContext, ahora: number): Medida => {
  const b = base(context, ahora, 'EV-01', true);

  if (esMedida(b)) {
    return b;
  }

  if (!b.lista.length) {
    return conFilasInvalidas(
      b.reg.invalidas ? sinMedir('El registro de incidentes no tiene ninguna fila válida.') : contrasteRegistroVacio(context, false),
      b.reg
    );
  }

  const todas = ventanas(context);
  const hallazgos: string[] = [];
  const sinMedida: string[] = [];
  const bien: string[] = [];

  b.lista.forEach(inc => {
    if (!inc.sistemas.length) {
      sinMedida.push(`${inc.id}: el registro no declara ningún sistema afectado`);

      return;
    }

    inc.sistemas.forEach(sistema => {
      const v = ventanaDe(todas, inc.id, sistema);

      if (!v) {
        sinMedida.push(`${inc.id} en ${sistema}: el recolector no ha informado de su ventana`);

        return;
      }

      // Los archivos diarios son del manager, no del sistema: un día perdido
      // se dice una vez por incidente aunque afecte a todos sus sistemas.
      if (v.sinArchivo.length) {
        hallazgos.push(`${inc.id}: faltan los archivos de alertas del manager de ${lista(v.sinArchivo)} (ventana ${v.desde} → ${v.hasta})`);
      }

      if (v.alterados.length) {
        hallazgos.push(`${inc.id}: el archivo de alertas de ${lista(v.alterados)} no coincide con la suma encadenada que Wazuh selló al rotarlo`);
      }

      if (v.sinArchivo.length || v.alterados.length) {
        return;
      }

      if (!v.conocido) {
        sinMedida.push(`${inc.id}: «${sistema}» no es un agente de este manager, así que sus eventos no están en él`);

        return;
      }

      if (v.sinSuma.length) {
        sinMedida.push(`${inc.id} en ${sistema}: los archivos de ${lista(v.sinSuma)} no tienen su suma de Wazuh y su integridad no se puede acreditar`);

        return;
      }

      if (v.alertas === 0) {
        sinMedida.push(`${inc.id} en ${sistema}: ninguna alerta de ese agente entre ${v.desde} y ${v.hasta}; el origen del incidente no es observable en Wazuh`);

        return;
      }

      bien.push(`${inc.id} en ${sistema}: ${v.alertas} alertas (${v.desde} → ${v.hasta})`);
    });
  });

  if (hallazgos.length) {
    return noCumple(`No se conservan los eventos que originaron los incidentes: ${lista(Array.from(new Set(hallazgos)))}.`);
  }

  if (sinMedida.length) {
    return sinMedir(`No se puede acreditar la conservación de los eventos de origen: ${lista(sinMedida)}.${bien.length ? ` Sí consta: ${lista(bien)}.` : ''}`);
  }

  return conFilasInvalidas(
    cumple(`Los eventos de origen de los ${b.lista.length} incidentes se conservan en el manager, con los archivos diarios de su ventana presentes y su suma encadenada verificada: ${lista(bien)}.`),
    b.reg
  );
};

const ev02 = (context: ENSPolicyContext, ahora: number): Medida => {
  const b = base(context, ahora, 'EV-02', true);

  if (esMedida(b)) {
    return b;
  }

  const p02 = filas(context, 'P-02');

  if (!p02) {
    return sinMedir(`${etiqueta(context, 'P-02')} está sin configurar: no están declaradas las fases de reporte que se exigen.`, 'CONFIGURATION');
  }

  if (!b.lista.length) {
    return conFilasInvalidas(
      b.reg.invalidas ? sinMedir('El registro de incidentes no tiene ninguna fila válida.') : contrasteRegistroVacio(context, true),
      b.reg
    );
  }

  const exigidas = p02
    .map(f => ({ fase: sinTildes(f.fase), horas: numero((f.exigible_desde_horas || '').replace(',', '.')) }))
    .filter(f => ['inicial', 'intermedio', 'final'].includes(f.fase));

  if (!exigidas.length) {
    return sinMedir(`${etiqueta(context, 'P-02')} no declara ninguna fase reconocible (inicial, intermedio, final).`, 'CONFIGURATION');
  }

  const hallazgos: string[] = [];
  const bien: string[] = [];

  b.lista.forEach(inc => {
    const duracion = (inc.fin ?? ahora) - inc.inicio;
    const faltan: string[] = [];

    exigidas.forEach(({ fase, horas }) => {
      if (fase === 'final' && inc.abierto) {
        return;
      }

      if (horas !== undefined && duracion <= horas * HORA) {
        return;
      }

      if (!inc.filas.some(f => f.fase === fase)) {
        faltan.push(fase);
      }
    });

    const inicial = inc.filas.find(f => f.fase === 'inicial');
    const incompleto: string[] = [];

    if (inicial && vacio(inicial.severidad)) {
      incompleto.push('sin severidad');
    }

    if (inicial && !inicial.sistemas.length) {
      incompleto.push('sin sistemas afectados');
    }

    if (faltan.length) {
      hallazgos.push(
        `${inc.id} (${inc.abierto ? 'abierto' : 'cerrado'}, ${dias(duracion)} días) sin reporte ${faltan.join(' ni ')}`
      );
    }

    if (incompleto.length) {
      hallazgos.push(`${inc.id}: el reporte inicial está ${incompleto.join(' y ')}`);
    }

    if (!faltan.length && !incompleto.length) {
      bien.push(`${inc.id} (${inc.filas.map(f => f.fase).join(', ')})`);
    }
  });

  if (hallazgos.length) {
    return noCumple(`Incidentes sin los reportes que exige P-02: ${lista(hallazgos)}.`);
  }

  return conFilasInvalidas(
    cumple(`Los ${b.lista.length} incidentes registrados tienen las fases de reporte que exige P-02: ${lista(bien)}.`),
    b.reg
  );
};

// EV-03 y EV-04 son el mismo barrido sobre dos clases de hecho: lo que Wazuh
// registró que se hizo en la ventana del incidente, contra lo que la
// organización vinculó al expediente.
const barrido = (
  context: ENSPolicyContext,
  ahora: number,
  evidencia: 'EV-03' | 'EV-04'
): Medida => {
  const b = base(context, ahora, evidencia, true);

  if (esMedida(b)) {
    return b;
  }

  if (!b.lista.length) {
    return conFilasInvalidas(
      b.reg.invalidas ? sinMedir('El registro de incidentes no tiene ninguna fila válida.') : contrasteRegistroVacio(context, false),
      b.reg
    );
  }

  const esEv03 = evidencia === 'EV-03';
  const tipoHecho = esEv03 ? 'emergency_action_observed' : 'system_change_observed';
  const tipoRegistrado = esEv03 ? 'emergencia' : 'modificacion';
  const campoObjeto = esEv03 ? 'programa' : 'objeto';
  const que = esEv03 ? 'respuesta activa' : 'cambio';

  const regAct = registro(context, 'actuaciones');
  const todas = ventanas(context);
  const observados = hechos(context, tipoHecho);
  const registradas = actuaciones(context).filter(a => a.tipo === tipoRegistrado);

  const hallazgos: string[] = [];
  const sinMedida: string[] = [];
  let vistos = 0;

  b.lista.forEach(inc => {
    if (!inc.sistemas.length) {
      sinMedida.push(`${inc.id}: el registro no declara ningún sistema afectado que barrer`);
    }

    inc.sistemas.forEach(sistema => {
      const v = ventanaDe(todas, inc.id, sistema);

      if (!v) {
        sinMedida.push(`${inc.id} en ${sistema}: el recolector no ha informado de su ventana`);

        return;
      }

      if (!v.conocido) {
        sinMedida.push(`${inc.id}: «${sistema}» no es un agente de este manager y no se puede barrer`);

        return;
      }

      const delSistema = observados.filter(
        e => campo(e, 'incidente_id') === inc.id && mismoSistema(campo(e, 'sistema'), sistema)
      );

      vistos += delSistema.length;

      delSistema.forEach(e => {
        const objeto = campo(e, campoObjeto);

        const consta = registradas.some(
          a =>
            a.incidente === inc.id &&
            cubreSistema(a.sistema, sistema) &&
            (a.objeto === '*' || (esEv03 ? a.objeto === objeto : !vacio(a.objeto) && objeto.startsWith(a.objeto)))
        );

        if (!consta) {
          hallazgos.push(
            `${inc.id} en ${sistema}: ${que} ${esEv03 ? '' : `de ${campo(e, 'origen')} `}«${objeto}» (${campo(e, 'veces') || '1'} vez/veces, ${campo(e, 'primera')}${campo(e, 'ultima') && campo(e, 'ultima') !== campo(e, 'primera') ? ` → ${campo(e, 'ultima')}` : ''})`
          );
        }
      });

      const declarados = esEv03 ? v.acciones : v.cambios;
      const emitidos = esEv03 ? v.accionesEmitidas : v.cambiosEmitidos;

      if (emitidos < declarados || delSistema.length < emitidos) {
        sinMedida.push(
          `${inc.id} en ${sistema}: el barrido encontró ${declarados} objetos distintos y solo han llegado ${delSistema.length}`
        );
      }

      if (v.sinArchivo.length || v.alterados.length) {
        sinMedida.push(`${inc.id} en ${sistema}: faltan o están alterados los archivos de alertas de ${lista(v.sinArchivo.concat(v.alterados))}, así que el barrido no es completo`);
      }
    });
  });

  if (hallazgos.length) {
    const sinRegistro = regAct && !regAct.presente ? ' No existe /etc/ensfacil/incident-actions.tsv, así que ninguna consta.' : '';

    return noCumple(
      `${esEv03 ? 'Actuaciones de emergencia' : 'Modificaciones del sistema'} observadas por Wazuh en la ventana de un incidente que no constan en su expediente (registro de actuaciones, tipo ${tipoRegistrado}): ${lista(hallazgos)}.${sinRegistro}`
    );
  }

  if (sinMedida.length) {
    return sinMedir(`El barrido de las ventanas de incidente no es completo: ${lista(sinMedida)}.`);
  }

  const manuales = registradas.filter(a => b.lista.some(i => i.id === a.incidente)).length;

  const medida = cumple(
    vistos
      ? `Las ${vistos} ${esEv03 ? 'respuestas activas' : 'modificaciones'} observadas en las ventanas de los ${b.lista.length} incidentes constan en su expediente.`
      : `Barridas las ventanas de los ${b.lista.length} incidentes en las alertas del manager: ninguna ${esEv03 ? 'respuesta activa' : 'modificación de ficheros, paquetes, configuración ni cuentas'} en los sistemas afectados.${manuales ? ` Constan ${manuales} ${tipoRegistrado === 'emergencia' ? 'actuaciones de emergencia' : 'modificaciones'} registradas a mano.` : ''}`
  );

  return regAct && regAct.presente ? conFilasInvalidas(conFilasInvalidas(medida, b.reg), regAct, 'actuaciones') : conFilasInvalidas(medida, b.reg);
};

const HEX64 = /^[0-9a-f]{64}$/i;

type Sellada = {
  evento: ENSNormalizedEvent;
  incidente: string;
  fecha?: number;
  tipo: string;
  fichero: string;
  sha256: string;
  destino: string;
};

const selladas = (context: ENSPolicyContext): Sellada[] =>
  hechos(context, 'evidence_export_sealed').map(e => ({
    evento: e,
    incidente: campo(e, 'incidente_id'),
    fecha: instante(campo(e, 'fecha')),
    tipo: campo(e, 'tipo_evidencia'),
    fichero: campo(e, 'fichero'),
    sha256: campo(e, 'sha256'),
    destino: campo(e, 'destino'),
  }));

const ev05 = (context: ENSPolicyContext, ahora: number): Medida => {
  const b = base(context, ahora, 'EV-05', false);

  if (esMedida(b)) {
    return b;
  }

  const p03 = filas(context, 'P-03');

  if (!p03) {
    return sinMedir(
      `${etiqueta(context, 'P-03')} está sin configurar: la composición de la evidencia con valor jurisdiccional no está determinada, y el ENS exige hacerlo con asesoramiento legal especializado.`,
      'CONFIGURATION'
    );
  }

  if (!elementos(context, 'P-04').length) {
    return sinMedir(
      `${etiqueta(context, 'P-04')} está sin configurar: la marca de relevancia jurídica del registro no tiene criterios declarados contra los que haberse tomado.`,
      'CONFIGURATION'
    );
  }

  if (!b.lista.length) {
    return conFilasInvalidas(
      b.reg.invalidas ? sinMedir('El registro de incidentes no tiene ninguna fila válida.') : contrasteRegistroVacio(context, false),
      b.reg
    );
  }

  const relevantes = b.lista.filter(i => i.relevante);

  if (!relevantes.length) {
    return conFilasInvalidas(
      cumple(
        `Ninguno de los ${b.lista.length} incidentes del registro está marcado con relevancia jurídica según los criterios de P-04: no hay evidencia jurisdiccional que exigir. La marca la pone la organización en el registro.`
      ),
      b.reg
    );
  }

  const regCus = registro(context, 'custodia');
  const parada = registroUtilizable(regCus, 'custodia', '/etc/ensfacil/evidence-custody.tsv');

  if (parada) {
    return sinMedir(`Hay ${relevantes.length} incidente(s) con relevancia jurídica. ${parada.motivo}`, parada.causa);
  }

  const todas = selladas(context);
  const faltan: string[] = [];
  const bien: string[] = [];

  relevantes.forEach(inc => {
    p03.forEach(fila => {
      const tipo = fila.tipo_evidencia;

      const hecha = todas.find(
        s =>
          s.incidente === inc.id &&
          sinTildes(s.tipo) === sinTildes(tipo) &&
          HEX64.test(s.sha256) &&
          (!fila.destino || s.destino === fila.destino)
      );

      if (hecha) {
        bien.push(`${inc.id}: ${tipo} (${hecha.sha256.slice(0, 12)}…)`);

        return;
      }

      const parecida = todas.find(s => s.incidente === inc.id && sinTildes(s.tipo) === sinTildes(tipo));

      faltan.push(
        parecida
          ? `${inc.id}: ${tipo} ${HEX64.test(parecida.sha256) ? `depositada en «${parecida.destino}» y P-03 exige «${fila.destino}»` : 'sin un SHA-256 válido'}`
          : `${inc.id}: ${tipo} no se ha exportado ni sellado`
      );
    });
  });

  if (faltan.length) {
    return noCumple(`Incidentes con relevancia jurídica sin la evidencia sellada que determina P-03: ${lista(faltan)}.`);
  }

  return conFilasInvalidas(
    conFilasInvalidas(
      cumple(`Los ${relevantes.length} incidentes con relevancia jurídica tienen sellada cada evidencia de P-03: ${lista(bien)}.`),
      b.reg
    ),
    regCus as Registro,
    'custodia'
  );
};

const ev06 = (context: ENSPolicyContext, ahora: number): Medida => {
  const b = base(context, ahora, 'EV-06', false);

  if (esMedida(b)) {
    return b;
  }

  if (!elementos(context, 'P-04').length) {
    return sinMedir(`${etiqueta(context, 'P-04')} está sin configurar: sin criterios de relevancia jurídica no hay régimen de custodia que exigir.`, 'CONFIGURATION');
  }

  const p05 = filas(context, 'P-05');

  if (!p05) {
    return sinMedir(`${etiqueta(context, 'P-05')} está sin configurar: no hay repositorio de custodia declarado contra el que situar las evidencias.`, 'CONFIGURATION');
  }

  const p06 = filas(context, 'P-06');
  const plazos = (p06 || [])
    .map(f => numero((f.dias_retencion || '').replace(',', '.')))
    .filter((d): d is number => d !== undefined && d >= 0);

  if (!plazos.length) {
    return sinMedir(`${etiqueta(context, 'P-06')} no declara ningún plazo de retención en días: no se puede saber si una evidencia desaparecida se destruyó antes de tiempo.`, 'CONFIGURATION');
  }

  const retencion = Math.max(...plazos);

  if (!b.lista.length) {
    return conFilasInvalidas(
      b.reg.invalidas ? sinMedir('El registro de incidentes no tiene ninguna fila válida.') : contrasteRegistroVacio(context, false),
      b.reg
    );
  }

  const regCus = registro(context, 'custodia');
  const relevantes = b.lista.filter(i => i.relevante);

  if (!regCus) {
    return sinMedir('El recolector del manager no ha informado del registro de custodia (/etc/ensfacil/evidence-custody.tsv) en su última pasada.', 'COLLECTION');
  }

  if (!regCus.presente) {
    return relevantes.length
      ? sinMedir(`Hay ${relevantes.length} incidente(s) con relevancia jurídica y no existe el registro de custodia /etc/ensfacil/evidence-custody.tsv (causa CONFIGURATION).`, 'CONFIGURATION')
      : conFilasInvalidas(cumple('Ningún incidente del registro está marcado con relevancia jurídica y no hay evidencias en custodia: no hay cadena de custodia que acreditar.'), b.reg);
  }

  const paradaCus = registroUtilizable(regCus, 'custodia', '/etc/ensfacil/evidence-custody.tsv');

  if (paradaCus) {
    return paradaCus;
  }

  const todas = selladas(context);

  if (!todas.length) {
    return relevantes.length
      ? sinMedir(`Hay ${relevantes.length} incidente(s) con relevancia jurídica y ninguna evidencia en custodia (lo señala EV-05): no hay cadena de custodia que examinar.`)
      : conFilasInvalidas(cumple('No hay evidencias en custodia ni incidentes con relevancia jurídica: no hay cadena de custodia que acreditar.'), b.reg);
  }

  const regLog = registro(context, 'custodia_accesos');
  const paradaLog = registroUtilizable(regLog, 'cadena de custodia', '/etc/ensfacil/evidence-custody-log.tsv');

  if (paradaLog) {
    return sinMedir(`Hay ${todas.length} evidencia(s) en custodia. ${paradaLog.motivo}`, paradaLog.causa);
  }

  const destinos = p05.map(f => f.destino).filter(Boolean);
  const accesos = hechos(context, 'custody_access_recorded');
  const verificaciones = hechos(context, 'custody_integrity_checked');

  const hallazgos: string[] = [];
  const sinMedida: string[] = [];
  const bien: string[] = [];

  todas.forEach(s => {
    const nombre = `${s.incidente}: ${s.fichero}`;
    let mal = false;

    if (!destinos.includes(s.destino)) {
      hallazgos.push(`${nombre} está en «${s.destino}», que no es un repositorio de custodia de P-05`);
      mal = true;
    }

    if (!accesos.some(a => campo(a, 'fichero') === s.fichero)) {
      hallazgos.push(`${nombre} no tiene ninguna anotación en el registro de cadena de custodia`);
      mal = true;
    }

    const v = verificaciones.find(x => campo(x, 'fichero') === s.fichero && campo(x, 'incidente_id') === s.incidente);

    if (!v) {
      sinMedida.push(`${nombre}: el recolector no ha informado de su verificación`);

      return;
    }

    if (campo(v, 'verificable') === 'si') {
      if (campo(v, 'coincide') !== 'si') {
        hallazgos.push(`${nombre}: el SHA-256 actual (${campo(v, 'sha256_actual').slice(0, 12)}…) no coincide con el sellado (${s.sha256.slice(0, 12)}…): la evidencia se ha alterado`);

        return;
      }

      if (!mal) {
        bien.push(`${nombre} (SHA-256 verificado ${campo(v, 'verificado') || ''})`.trim());
      }

      return;
    }

    if (campo(v, 'motivo') === 'ausente') {
      if (s.fecha !== undefined && ahora - s.fecha < retencion * DIA) {
        hallazgos.push(`${nombre} ya no existe en el manager y se recogió el ${campo(s.evento, 'fecha')}, dentro del plazo más largo de P-06 (${retencion} días): evidencia destruida antes de plazo`);
      } else if (s.fecha === undefined) {
        sinMedida.push(`${nombre} ya no existe y su fecha de recogida no se puede leer`);
      }

      return;
    }

    sinMedida.push(`${nombre}: ${campo(v, 'motivo') === 'remoto' ? 'está fuera del manager y su integridad no se puede recalcular desde aquí' : 'el manager no la puede leer'}`);
  });

  if (hallazgos.length) {
    return noCumple(`La cadena de custodia de las evidencias no es acreditable: ${lista(hallazgos)}.`);
  }

  if (sinMedida.length) {
    return sinMedir(`No se puede acreditar la integridad de todo lo custodiado: ${lista(sinMedida)}.`);
  }

  return conFilasInvalidas(
    cumple(
      `Las ${todas.length} evidencias custodiadas están en un repositorio de P-05, tienen cadena de custodia anotada y su SHA-256 sigue coincidiendo: ${lista(bien)}. Que el registro recoja TODOS los accesos es una declaración de la organización: el manager no ve los accesos al repositorio.`
    ),
    b.reg
  );
};

const ev07 = (context: ENSPolicyContext, ahora: number): Medida => {
  const b = base(context, ahora, 'EV-07', false);

  if (esMedida(b)) {
    return b;
  }

  if (!b.lista.length) {
    return conFilasInvalidas(
      b.reg.invalidas ? sinMedir('El registro de incidentes no tiene ninguna fila válida.') : contrasteRegistroVacio(context, false),
      b.reg
    );
  }

  const protegibles = b.lista.filter(i => i.abierto || i.relevante);

  if (!protegibles.length) {
    return conFilasInvalidas(
      cumple(`Ninguno de los ${b.lista.length} incidentes está abierto ni marcado con relevancia jurídica: no hay periodo que proteger de la rotación.`),
      b.reg
    );
  }

  const todas = ventanas(context);
  const hallazgos: string[] = [];
  const presentes: string[] = [];

  protegibles.forEach(inc => {
    inc.sistemas.forEach(sistema => {
      const v = ventanaDe(todas, inc.id, sistema);

      if (!v) {
        return;
      }

      if (v.sinArchivo.length) {
        hallazgos.push(`${inc.id} (${inc.abierto ? 'abierto' : 'relevancia jurídica'}): ya no están los registros de ${lista(v.sinArchivo)}`);
      } else if (v.alterados.length) {
        hallazgos.push(`${inc.id}: los registros de ${lista(v.alterados)} no coinciden con su suma de Wazuh`);
      } else {
        presentes.push(`${inc.id} en ${sistema} (${v.desde} → ${v.hasta})`);
      }
    });
  });

  if (hallazgos.length) {
    return noCumple(`Se han perdido o alterado registros del periodo de incidentes que había que proteger: ${lista(Array.from(new Set(hallazgos)))}.`);
  }

  return sinMedir(
    `Causa CONFIGURATION. Los archivos diarios de alertas del manager del periodo de ${protegibles.length} incidente(s) abierto(s) o con relevancia jurídica siguen en disco con su suma verificada${presentes.length ? ` (${lista(presentes)})` : ''}, pero lo que op.exp.9.2 pide es que los índices wazuh-alerts-* de ese periodo estén exentos de la política ISM de rotación, y eso solo se ve consultando el wazuh-indexer. El recolector del manager no usa ninguna credencial, así que esa protección queda sin demostrar.`,
    'CONFIGURATION'
  );
};

const ev08 = (context: ENSPolicyContext, ahora: number): Medida => {
  const b = base(context, ahora, 'EV-08', false);

  if (esMedida(b)) {
    return b;
  }

  const p07 = filas(context, 'P-07');

  if (!p07) {
    return sinMedir(`${etiqueta(context, 'P-07')} está sin configurar: no está decidido qué incidentes obligan a revisar los eventos auditables ni en qué plazo.`, 'CONFIGURATION');
  }

  const plazos = new Map<string, number>();

  p07.forEach(f => {
    const d = numero((f.plazo_dias || '').replace(',', '.'));

    if (d !== undefined && d >= 0) {
      plazos.set(sinTildes(f.severidad), d);
    }
  });

  if (!plazos.size) {
    return sinMedir(`${etiqueta(context, 'P-07')} no declara ningún plazo en días utilizable.`, 'CONFIGURATION');
  }

  if (!b.lista.length) {
    return conFilasInvalidas(
      b.reg.invalidas ? sinMedir('El registro de incidentes no tiene ninguna fila válida.') : contrasteRegistroVacio(context, false),
      b.reg
    );
  }

  const revisiones = actuaciones(context).filter(a => a.tipo === 'revision_eventos');

  const cambios = hechos(context, 'auditable_events_revised')
    .map(e => ({ e, t: instante(campo(e, 'modificado')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined);

  const hallazgos: string[] = [];
  const bien: string[] = [];
  const pendientes: string[] = [];

  b.lista.forEach(inc => {
    const plazo = plazos.get(inc.severidad);

    if (plazo === undefined || inc.abierto || inc.fin === undefined) {
      return;
    }

    const vence = inc.fin + plazo * DIA;

    const registrada = revisiones.find(
      r => r.incidente === inc.id && r.fecha !== undefined && r.fecha >= inc.inicio && r.fecha <= vence
    );

    if (registrada) {
      bien.push(`${inc.id}: revisión registrada el ${new Date(registrada.fecha as number).toISOString().slice(0, 10)}`);

      return;
    }

    const cambio = cambios
      .filter(c => c.t >= inc.inicio && c.t <= vence)
      .sort((a, b2) => a.t - b2.t)[0];

    if (cambio) {
      bien.push(`${inc.id}: ${campo(cambio.e, 'fichero')} modificado el ${campo(cambio.e, 'modificado')} (por correlación temporal con el incidente)`);

      return;
    }

    if (ahora > vence) {
      hallazgos.push(
        `${inc.id} (severidad ${inc.severidad}, cerrado el ${new Date(inc.fin).toISOString().slice(0, 10)}): ni revisión registrada ni cambio de reglas, decodificadores, ossec.conf o agent.conf en los ${plazo} días de P-07`
      );
    } else {
      pendientes.push(`${inc.id} (vence el ${new Date(vence).toISOString().slice(0, 10)})`);
    }
  });

  if (hallazgos.length) {
    return noCumple(`El análisis de incidentes no ha llevado a revisar los eventos auditables dentro del plazo de P-07: ${lista(hallazgos)}.`);
  }

  const texto = bien.length
    ? `Revisión de eventos auditables acreditada: ${lista(bien)}.`
    : 'Ningún incidente cerrado de una severidad de P-07 tiene su revisión vencida.';

  return conFilasInvalidas(
    cumple(`${texto}${pendientes.length ? ` Dentro de plazo todavía: ${lista(pendientes)}.` : ''}`),
    b.reg
  );
};

const ev09 = (context: ENSPolicyContext, ahora: number): Medida => {
  const b = base(context, ahora, 'EV-09', false);

  if (esMedida(b)) {
    return b;
  }

  if (!b.lista.length) {
    return conFilasInvalidas(
      b.reg.invalidas ? sinMedir('El registro de incidentes no tiene ninguna fila válida.') : contrasteRegistroVacio(context, false),
      b.reg
    );
  }

  const sinReferencia: string[] = [];

  b.lista.forEach(inc => {
    const huerfanas = inc.filas.filter(f => vacio(f.referencia)).map(f => f.fase || '?');

    if (huerfanas.length) {
      sinReferencia.push(`${inc.id} (${huerfanas.join(', ')})`);
    }
  });

  if (sinReferencia.length) {
    return noCumple(
      `Filas del registro sin referencia al expediente, con lo que el expediente no se puede presentar entero: ${lista(sinReferencia)}.`
    );
  }

  return conFilasInvalidas(
    cumple(
      `Los ${b.lista.length} expedientes enlazan cada una de sus filas; el informe los consolida por incidente con sus alertas, actuaciones, cambios y evidencias.`
    ),
    b.reg
  );
};

// --- decisiones ------------------------------------------------------------

const REQUISITOS: Record<string, { evidencias: string[]; parametros: string[]; tipo: ENSPolicyDecision['trace']['ruleType'] }> = {
  'op.exp.9.1': { evidencias: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-09'], parametros: ['P-01', 'P-02', 'P-08', 'P-09'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.9.2': { evidencias: ['EV-05', 'EV-06', 'EV-07', 'EV-09'], parametros: ['P-03', 'P-04', 'P-05', 'P-06'], tipo: 'CONDITIONAL_REQUIRED' },
  'op.exp.9.3': { evidencias: ['EV-08', 'EV-09'], parametros: ['P-07'], tipo: 'CONDITIONAL_REQUIRED' },
};

const decide = (
  requisito: string,
  estado: Estado,
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

export const measureOpExp9Evidences = (context: ENSPolicyContext): Record<string, Medida> => {
  const ahora = (context.now || new Date()).getTime();

  return {
    'EV-01': ev01(context, ahora),
    'EV-02': ev02(context, ahora),
    'EV-03': barrido(context, ahora, 'EV-03'),
    'EV-04': barrido(context, ahora, 'EV-04'),
    'EV-05': ev05(context, ahora),
    'EV-06': ev06(context, ahora),
    'EV-07': ev07(context, ahora),
    'EV-08': ev08(context, ahora),
    'EV-09': ev09(context, ahora),
  };
};

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const medidas = measureOpExp9Evidences(context);
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
      conPartes(decide(
        requisito,
        estado,
        responsables.map(p => p.id),
        parametros,
        tipo,
        requisito,
        motivoCompuesto(propias),
        evidencias.map(id => `${id} CUMPLE`).join(' y '),
        causaComun(responsables.map(p => p.medida))
      ), partesDe(propias))
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

export const opExp9PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.exp.9.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-08', 'P-09'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.9.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04', 'P-05', 'P-06'],
      evidenceIds: ['EV-05', 'EV-06', 'EV-07', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.9.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-08', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
