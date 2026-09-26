// op.exp.8 · Registro de la actividad
//
// Por qué este control tiene policy propia. Dos razones, y la primera es la que
// obliga:
//
//   1. DOS PLANOS. El registro de actividad se genera en cada SERVIDOR (su
//      auditd, su reloj, quién puede leer sus registros) y se recoge, conserva,
//      revisa, correlaciona y responde en el SISTEMA CENTRAL (el manager). Los
//      hechos del sistema central llegan con agent.id=000 y el motor evalúa
//      por agente, así que en la fila de un servidor corriente no hay forma de
//      ver la revisión de los registros ni las reglas de correlación. Esta
//      policy decide, fila a fila, con QUÉ evidencias se mide cada requisito:
//      las del servidor en un agente, las del servidor y las centrales en el
//      manager. Lo que es solo central (R1, R3, R5) no aplica en la fila de un
//      servidor que no es el sistema central: se mide en la del manager, y la
//      consolidación entre máquinas lo lleva al resultado del control.
//
//   2. JUICIOS QUE NO CABEN EN UNA PRIMITIVA: la referencia de tiempo tiene
//      cuatro ejes (sincronización, desfase, autenticación, traza de los
//      cambios); la ingesta cruza P-02 con lo recibido por agente contra un
//      plazo; los permisos comparan una lista de cuentas por registro.
//
// El tipo de fila lo dice el latido: `collector_run` con `tipo_servidor` =
// `manager` es la fila central; `linux` o `ldap`, un servidor.
//
// Lo que cabe en una primitiva se deja a la primitiva (EV-02, ANTIGUEDAD_MAXIMA
// contra P-12) y aquí solo se LEE su resultado.
//
// Invariantes, las de `evidence/judgment.ts`:
//   - el agente emite instantes, no edades: toda antigüedad se mide aquí contra
//     `context.now`;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo; nunca un CUMPLE por
//     ausencia;
//   - lo que el recolector declara que no pudo medir (evidence_state
//     NO_EVALUABLE) sale NO_EVALUABLE con SU motivo;
//   - la policy nunca inventa política: ningún plazo, umbral o lista tiene
//     valor por defecto.
//
// El nivel con el que se evalúa (`context.level`) es el de la dimensión de
// Trazabilidad, no la categoría del sistema: lo resuelve el motor
// (`core/control-level.ts`) porque el catálogo declara `levelDimension: 'T'`.
//
// Tipos y utilidades desde el fichero, nunca desde un barrel: por ahí vuelve el
// ciclo del TDZ de Settings.
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSComplianceStatus } from '../../evaluation/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSControlParameter } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';

const CONTROL = 'op.exp.8';
const POLICY = 'policy.op.exp.8';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// Frescura de un hecho de estado. Los recolectores corren cada hora y reemiten
// el estado entero en cada pasada: 26 h tolera un día de fallos sin convertir
// una foto vieja en la situación de hoy. Es tolerancia de OBSERVACIÓN, no
// política.
const FRESCURA_HORAS = 26;

// Un hecho del futuro no acredita nada (misma tolerancia de reloj que el latido).
const TOLERANCIA_FUTURO = 5 * 60 * 1000;

type Plano = 'servidor' | 'central';

type Medida = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL'>;
  motivo: string;
};

const cumple = (motivo: string): Medida => ({ estado: 'CUMPLE', motivo });
const noCumple = (motivo: string): Medida => ({ estado: 'NO_CUMPLE', motivo });
const sinMedir = (motivo: string): Medida => ({ estado: 'NO_EVALUABLE', motivo });
const noAplica = (motivo: string): Medida => ({ estado: 'NO_APLICA', motivo });

const GRAVEDAD: Record<Medida['estado'], number> = {
  NO_APLICA: -1,
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

// Varios ejes de una evidencia en una medida: el estado del peor, y en el
// motivo lo que lo explica (lo que falla o falta; si todo cumple, lo medido).
const combina = (partes: Medida[]): Medida => {
  const estado = peor(partes);

  if (estado === 'CUMPLE') {
    return cumple(partes.map(p => p.motivo).join(' '));
  }

  const causa = partes.filter(p => p.estado === estado).map(p => p.motivo);
  const ademas = partes
    .filter(p => p.estado !== estado && p.estado !== 'CUMPLE')
    .map(p => p.motivo);

  return {
    estado,
    motivo: [...causa, ...(ademas.length ? [`Además: ${ademas.join(' ')}`] : [])].join(' '),
  };
};

// --- lectura de hechos -----------------------------------------------------

// El normalizador parte un evento con `evidence_id=A,B` en uno por evidencia
// (`<id>#A`, `<id>#B`). Aquí se juzga el HECHO, así que se cuenta una vez.
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

const numero = (texto: string): number | undefined => {
  const limpio = String(texto).trim().replace(',', '.');

  if (!/^[+-]?\d+(\.\d+)?$/.test(limpio)) {
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

const momento = (event: ENSNormalizedEvent): number => {
  const t = Date.parse(event.timestamp);

  return Number.isNaN(t) ? 0 : t;
};

const lista = (elementos: string[], maximo = 5): string =>
  elementos.length > maximo
    ? `${elementos.slice(0, maximo).join('; ')} y ${elementos.length - maximo} más`
    : elementos.join('; ');

const horas = (ms: number): string => (ms / HORA).toFixed(1);

// Los hechos de estado de la ÚLTIMA pasada que los emitió (el motor ya ha
// descartado los de pasadas anteriores, ver `state-facts.ts`), sin los del
// futuro. Si la última es más vieja que FRESCURA_HORAS, no describen hoy.
const estadoVigente = (
  context: ENSPolicyContext,
  tipo: string,
  ahora: number
): { vigentes: ENSNormalizedEvent[]; ultimo?: number } => {
  const validos = hechos(context, tipo).filter(e => momento(e) <= ahora + TOLERANCIA_FUTURO);

  if (!validos.length) {
    return { vigentes: [] };
  }

  const ultimo = Math.max(...validos.map(momento));

  if (ahora - ultimo > FRESCURA_HORAS * HORA) {
    return { vigentes: [], ultimo };
  }

  // La última pasada: lo emitido en la hora anterior al último hecho.
  return {
    vigentes: validos.filter(e => ultimo - momento(e) < HORA),
    ultimo,
  };
};

// Lo que el recolector declaró que no pudo medir de una evidencia, si es más
// reciente que su último hecho.
const degradacion = (
  context: ENSPolicyContext,
  evidencia: string,
  despuesDe = 0
): string | undefined => {
  const ultima = hechos(context, 'evidence_state')
    .filter(
      e =>
        campo(e, 'evidence_id').split(',').map(x => x.trim()).includes(evidencia) &&
        String(e.status || campo(e, 'estado')).toUpperCase() === 'NO_EVALUABLE' &&
        momento(e) >= despuesDe
    )
    .sort((a, b) => momento(b) - momento(a))[0];

  if (!ultima) {
    return undefined;
  }

  const causa = campo(ultima, 'causa');

  return `El recolector no ha podido medirlo${causa ? ` (${causa})` : ''}: ${campo(ultima, 'motivo') || 'sin motivo declarado'}.`;
};

const sinHechos = (
  context: ENSPolicyContext,
  evidencia: string,
  ultimo: number | undefined,
  queFalta: string
): Medida =>
  sinMedir(
    degradacion(context, evidencia) ||
      (ultimo
        ? `El último ${queFalta} es de ${new Date(ultimo).toISOString()}, hace más de ${FRESCURA_HORAS} h: el recolector de op.exp.8 no está informando.`
        : `No consta ningún ${queFalta}: el recolector de op.exp.8 no está desplegado en esta máquina o no informa.`)
  );

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
        fila[columna.name] = (celdas[i] || '').trim();
      });

      return fila;
    });

  return resultado.length ? resultado : undefined;
};

const escalar = (context: ENSPolicyContext, id: string): number | undefined => {
  const valor = parametro(context, id)?.value;

  if (valor === undefined || valor === null || Array.isArray(valor)) {
    return undefined;
  }

  return numero(String(valor));
};

const faltaParametro = (context: ENSPolicyContext, id: string, para: string): Medida =>
  sinMedir(`${etiqueta(context, id)} está sin configurar: no hay contra qué juzgar ${para}.`);

const iguales = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// --- el plano de la fila ---------------------------------------------------

const planoDeLaFila = (context: ENSPolicyContext): Plano =>
  hechos(context, 'collector_run').some(e => campo(e, 'tipo_servidor') === 'manager')
    ? 'central'
    : 'servidor';

// --- las evidencias --------------------------------------------------------

// EV-01 · el registro de actividad está activo y se conserva.
//
// Plano sistema: auditd activo con reglas cargadas (sin reglas, auditd solo
// registra lo que el propio sistema le manda y no es un registro de auditoría
// de la actividad) y el registro del sistema conservado en disco (journald
// persistente o rsyslog). Plano directorio (LDAP): slapd registra sus
// operaciones solo con el nivel `stats` (256): sin él no queda quién hizo qué
// en el directorio.
const slapdRegistraOperaciones = (niveles: string): boolean =>
  niveles
    .split(/[\s,]+/)
    .filter(Boolean)
    .some(n => {
      const v = n.toLowerCase();

      if (v === 'stats' || v === 'any') {
        return true;
      }

      const num = /^0x[0-9a-f]+$/i.test(v) ? parseInt(v, 16) : numero(v);

      return num !== undefined && (num === -1 || (num & 256) !== 0);
    });

const ev01 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'audit_log_status', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-01', ultimo, 'estado del registro de actividad de este servidor');
  }

  const partes: Medida[] = [];
  const deFuente = (fuente: string) => vigentes.filter(e => campo(e, 'fuente') === fuente);

  const auditd = deFuente('auditd')[0];

  if (!auditd) {
    partes.push(sinMedir('El recolector no ha informado del estado de auditd.'));
  } else if (campo(auditd, 'activo') !== 'si') {
    partes.push(
      noCumple(
        `auditd no está activo (${campo(auditd, 'activo') || 'desconocido'}): el servidor no genera registro de auditoría. ${campo(auditd, 'detalle')}`.trim()
      )
    );
  } else if ((numero(campo(auditd, 'reglas_cargadas')) || 0) <= 0) {
    partes.push(noCumple('auditd está activo pero sin ninguna regla cargada: no registra la actividad de los usuarios.'));
  } else {
    partes.push(cumple(`auditd activo con ${campo(auditd, 'reglas_cargadas')} reglas cargadas.`));
  }

  const journald = deFuente('journald')[0];
  const rsyslog = deFuente('rsyslog')[0];
  const journaldConserva =
    journald && campo(journald, 'activo') === 'si' && campo(journald, 'almacenamiento') === 'persistente';
  const rsyslogConserva = rsyslog && campo(rsyslog, 'activo') === 'si';

  if (!journald && !rsyslog) {
    partes.push(sinMedir('El recolector no ha informado del registro del sistema (journald, rsyslog).'));
  } else if (journaldConserva || rsyslogConserva) {
    partes.push(
      cumple(
        `Registro del sistema conservado en disco (${[journaldConserva ? 'journald persistente' : '', rsyslogConserva ? 'rsyslog' : ''].filter(Boolean).join(' y ')}).`
      )
    );
  } else {
    partes.push(noCumple('El registro del sistema no se conserva en disco: journald no es persistente y rsyslog no está activo.'));
  }

  deFuente('slapd').forEach(slapd => {
    const niveles = campo(slapd, 'niveles_log');

    if (campo(slapd, 'activo') !== 'si') {
      partes.push(noCumple(`slapd no está en ejecución (${campo(slapd, 'activo') || 'desconocido'}): el directorio no registra su actividad.`));
    } else if (!slapdRegistraOperaciones(niveles)) {
      partes.push(
        noCumple(
          `slapd no registra sus operaciones: olcLogLevel=${niveles || '(sin declarar)'} no incluye stats, así que no queda quién se autentica, qué consulta ni qué modifica en el directorio.`
        )
      );
    } else {
      partes.push(cumple(`slapd registra sus operaciones (olcLogLevel=${niveles}).`));
    }
  });

  if (!filas(context, 'P-01')) {
    partes.push(faltaParametro(context, 'P-01', 'si el registro cubre los eventos de seguridad que la política exige'));
  }

  return combina(partes);
};

// EV-03 · los cinco campos de op.exp.8.1 en una muestra real.
const CAMPOS: [string, string][] = [
  ['con_usuario', 'usuario o entidad'],
  ['con_fecha_hora', 'fecha y hora'],
  ['con_objeto', 'objeto'],
  ['con_tipo_evento', 'tipo de evento'],
  ['con_resultado', 'resultado'],
];

const ev03 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'audit_record_fields', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-03', ultimo, 'muestreo de los campos del registro de auditoría');
  }

  return combina(
    vigentes.map(e => {
      const fuente = `${campo(e, 'fuente')}${campo(e, 'plano') ? ` (${campo(e, 'plano')})` : ''}`;
      const muestra = numero(campo(e, 'muestra')) || 0;

      if (muestra <= 0) {
        return sinMedir(`${fuente}: la muestra está vacía.`);
      }

      const ausentes = CAMPOS.filter(([c]) => (numero(campo(e, c)) || 0) <= 0).map(([, n]) => n);

      return ausentes.length
        ? noCumple(`${fuente}: en los ${muestra} registros más recientes no aparece nunca ${ausentes.join(', ')}.`)
        : cumple(`${fuente}: los cinco campos presentes en la muestra de ${muestra} registros.`);
    })
  );
};

// EV-04 · cada servidor declarado entrega, sin lagunas mayores que P-12.
const ev04 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'log_ingestion_status', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-04', ultimo, 'estado de la ingesta medido en el manager');
  }

  const servidores = filas(context, 'P-02');
  const plazo = escalar(context, 'P-12');

  if (!servidores) {
    return faltaParametro(context, 'P-02', `qué servidores tienen que estar entregando (el manager recibe hoy de ${vigentes.length} agentes)`);
  }

  if (plazo === undefined || plazo <= 0) {
    return faltaParametro(context, 'P-12', 'cuánto silencio de un servidor es una laguna');
  }

  const fallos: string[] = [];
  const bien: string[] = [];

  servidores.forEach(fila => {
    const nombre = fila.servidor;
    const hecho = vigentes.find(e => iguales(campo(e, 'agente'), nombre) || iguales(campo(e, 'agente_id'), nombre));

    if (!hecho) {
      fallos.push(`${nombre}: el manager no ha recibido ningún evento suyo desde que se observa`);

      return;
    }

    const ult = instante(campo(hecho, 'ultimo_evento'));
    const laguna = numero(campo(hecho, 'mayor_laguna_horas')) || 0;

    if (ult === undefined) {
      fallos.push(`${nombre}: último evento ilegible (${campo(hecho, 'ultimo_evento')})`);
    } else if (ahora - ult > plazo * HORA) {
      fallos.push(`${nombre}: último evento el ${campo(hecho, 'ultimo_evento')}, hace ${horas(ahora - ult)} h (plazo ${plazo} h)`);
    } else if (laguna > plazo) {
      fallos.push(`${nombre}: laguna de ${laguna} h seguidas sin eventos en las últimas ${campo(hecho, 'ventana_observada_horas')} h (plazo ${plazo} h)`);
    } else {
      bien.push(`${nombre} (${campo(hecho, 'eventos_24h')} eventos en 24 h, laguna máxima ${laguna} h)`);
    }
  });

  if (fallos.length) {
    return noCumple(`Servidores de P-02 sin registro continuo en el manager: ${lista(fallos)}.`);
  }

  return cumple(`Los ${bien.length} servidores de P-02 entregan su registro sin lagunas mayores de ${plazo} h: ${lista(bien)}.`);
};

// EV-05 · la revisión más reciente, contra P-04.
const ev05 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'log_review_recorded', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-05', ultimo, 'estado del registro de revisiones');
  }

  const e = vigentes.sort((a, b) => momento(b) - momento(a))[0];
  const deg = degradacion(context, 'EV-05', momento(e) + 1);

  if (deg) {
    return sinMedir(deg);
  }

  if ((numero(campo(e, 'revisiones')) || 0) === 0) {
    return noCumple(`El registro de revisiones (${campo(e, 'registro')}) no tiene ninguna revisión anotada: no consta que los registros se revisen.`);
  }

  const plazo = escalar(context, 'P-04');

  if (plazo === undefined || plazo <= 0) {
    return faltaParametro(context, 'P-04', `la periodicidad de las revisiones (la última anotada es del ${campo(e, 'ultima_revision')})`);
  }

  const fecha = instante(campo(e, 'ultima_revision'));

  if (fecha === undefined) {
    return sinMedir(`La revisión más reciente no tiene una fecha legible (${campo(e, 'ultima_revision')}).`);
  }

  const detalle = `revisión del ${campo(e, 'ultima_revision')} por ${campo(e, 'revisor')} (alcance: ${campo(e, 'alcance')}; hallazgos: ${campo(e, 'hallazgos')}; ${campo(e, 'referencia')})`;

  return ahora - fecha > plazo * DIA
    ? noCumple(`La última ${detalle} tiene ${Math.floor((ahora - fecha) / DIA)} días, más que la periodicidad de ${plazo} días de P-04.`)
    : cumple(`Última ${detalle}, dentro de la periodicidad de ${plazo} días. ${campo(e, 'revisiones')} revisiones anotadas.`);
};

// EV-06 · la referencia de tiempo: sincronización, fuente declarada, desfase,
// autenticación y traza de los cambios de hora.
const ev06 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'time_sync_status', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-06', ultimo, 'estado de la sincronización del reloj');
  }

  const e = vigentes.sort((a, b) => momento(b) - momento(a))[0];
  const servicio = campo(e, 'servicio');
  const fuentes = campo(e, 'fuentes')
    .split(',')
    .map(f => f.trim())
    .filter(f => f && f !== '-');
  const partes: Medida[] = [];

  if (servicio === 'ninguno' || campo(e, 'sincronizado') !== 'si') {
    partes.push(noCumple(`El reloj no está sincronizado (servicio: ${servicio || 'desconocido'}): no hay referencia de tiempo fiable para el registro.`));
  } else {
    partes.push(cumple(`Reloj sincronizado con ${servicio} (${fuentes.join(', ') || 'fuente no identificada'}).`));
  }

  const autenticacion = campo(e, 'autenticacion');

  if (fuentes.length && (autenticacion === 'ninguna' || !autenticacion)) {
    partes.push(
      noCumple(
        `La sincronización con ${fuentes.join(', ')} no usa autenticación ni integridad${servicio === 'systemd-timesyncd' ? ' (systemd-timesyncd no las admite)' : ''}, que R2 exige al sincronizar con otros dispositivos.`
      )
    );
  } else if (fuentes.length) {
    partes.push(cumple(`Sincronización autenticada (${autenticacion}).`));
  }

  const declaradas = filas(context, 'P-05');

  if (!declaradas) {
    partes.push(faltaParametro(context, 'P-05', 'si las fuentes de tiempo en uso son las previstas'));
  } else {
    const ajenas = fuentes.filter(f => !declaradas.some(d => iguales(d.fuente_tiempo, f)));

    partes.push(
      ajenas.length
        ? noCumple(`Fuentes de tiempo en uso que P-05 no declara: ${ajenas.join(', ')}.`)
        : cumple('Las fuentes en uso son las declaradas en P-05.')
    );
  }

  const maximo = escalar(context, 'P-06');
  const desfase = numero(campo(e, 'desfase_segundos'));

  if (maximo === undefined || maximo < 0) {
    partes.push(faltaParametro(context, 'P-06', `la desviación del reloj (medida: ${campo(e, 'desfase_segundos')} s)`));
  } else if (desfase === undefined) {
    partes.push(sinMedir(`El servicio de sincronización no ha informado del desfase (${campo(e, 'desfase_segundos') || 'vacío'}).`));
  } else if (Math.abs(desfase) > maximo) {
    partes.push(noCumple(`Desfase del reloj de ${desfase} s, mayor que los ${maximo} s de P-06.`));
  } else {
    partes.push(cumple(`Desfase de ${desfase} s, dentro de los ${maximo} s de P-06.`));
  }

  // La traza de los cambios de hora: sin una regla que los registre, un cambio
  // no deja rastro y no se puede afirmar que solo los haga la administración.
  const cambios = hechos(context, 'clock_change_observed').map(
    c => `${campo(c, 'actor')} con ${campo(c, 'proceso')} (${campo(c, 'syscall')}, ${campo(c, 'veces')} veces, la última el ${campo(c, 'ultima')})`
  );

  if (campo(e, 'vigilancia_cambio_hora') !== 'si') {
    partes.push(
      sinMedir(
        'auditd no registra los cambios de la hora del sistema (adjtimex, settimeofday, clock_settime): un cambio de hora no dejaría traza. Carga las reglas del runbook (augenrules --load).'
      )
    );
  } else {
    partes.push(
      cumple(
        cambios.length
          ? `Cambios de hora registrados en la ventana: ${lista(cambios)}.`
          : 'Los cambios de hora quedan registrados por auditd; ninguno en la ventana.'
      )
    );
  }

  return combina(partes);
};

// EV-07 · la retención: en disco se ve; la de los índices, no.
const ev07 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes } = estadoVigente(context, 'log_retention_observed', ahora);
  const alertas = vigentes.find(e => campo(e, 'almacen') === 'alertas_disco');
  const p07 = filas(context, 'P-07');
  const maximo = p07
    ? Math.max(...p07.map(f => numero(f.dias_retencion) || 0))
    : undefined;

  const disco = alertas
    ? ` En disco, el manager conserva alertas desde el ${campo(alertas, 'mas_antiguo')} (${campo(alertas, 'dias_conservados')} días)${maximo ? `; P-07 declara hasta ${maximo} días` : ''}.`
    : '';

  const deg =
    degradacion(context, 'EV-07') ||
    'La retención de los índices del Wazuh Indexer (políticas ISM) solo se ve consultando el indexer, y el recolector del manager no usa credenciales.';

  return sinMedir(`${deg}${disco}${p07 ? '' : ` ${etiqueta(context, 'P-07')} está sin configurar.`}`);
};

// EV-08 · quién puede leer los registros, contra P-08.
const ev08 = (context: ENSPolicyContext, ahora: number, plano: Plano): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'log_access_permissions', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-08', ultimo, 'estado del acceso a los registros');
  }

  const autorizadas = filas(context, 'P-08')?.map(f => f.cuenta).filter(Boolean);
  const abiertos: string[] = [];
  const ajenos: string[] = [];

  vigentes.forEach(e => {
    const cuentas = campo(e, 'cuentas')
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);

    if (cuentas.includes('*')) {
      abiertos.push(campo(e, 'ruta'));
    }

    // Comparación LITERAL: en Linux 'Admin' y 'admin' son dos cuentas.
    const fuera = autorizadas
      ? cuentas.filter(c => c !== '*' && !autorizadas.includes(c))
      : [];

    if (fuera.length) {
      ajenos.push(`${campo(e, 'ruta')} (${fuera.join(', ')})`);
    }
  });

  const partes: Medida[] = [];

  if (abiertos.length) {
    partes.push(noCumple(`Registros legibles por cualquier cuenta de la máquina: ${lista(abiertos)}.`));
  }

  if (!autorizadas) {
    partes.push(faltaParametro(context, 'P-08', 'qué cuentas pueden leer los registros'));
  } else if (ajenos.length) {
    partes.push(noCumple(`Registros legibles por cuentas que P-08 no autoriza: ${lista(ajenos)}.`));
  } else if (!abiertos.length) {
    partes.push(cumple(`Los ${vigentes.length} registros observados solo los pueden leer cuentas autorizadas en P-08.`));
  }

  if (plano === 'central') {
    partes.push(
      sinMedir(
        degradacion(context, 'EV-08') ||
          'Los accesos efectivos a los índices (audit log del plugin de seguridad del indexer) no se ven sin credenciales.'
      )
    );
  }

  return combina(partes);
};

// EV-09 · las copias de los registros: sin credenciales del indexer no se ven.
const ev09 = (context: ENSPolicyContext): Medida =>
  sinMedir(
    degradacion(context, 'EV-09') ||
      'Las copias de los registros (snapshots del Wazuh Indexer) solo se ven consultando el indexer, y el recolector del manager no usa credenciales.'
  );

// EV-10 · los conjuntos de reglas declarados en P-10, cargados.
const ev10 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'correlation_rules_inventory', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-10', ultimo, 'inventario de reglas del manager');
  }

  const total = vigentes.reduce((t, e) => t + (numero(campo(e, 'reglas')) || 0), 0);
  const resumen = vigentes
    .map(e => `${campo(e, 'conjunto')}: ${campo(e, 'reglas')} reglas, ${campo(e, 'reglas_con_mitre')} con MITRE ATT&CK`)
    .join('; ');

  if (total === 0) {
    return noCumple('El manager no carga ninguna regla de análisis: no hay herramienta que analice la actividad.');
  }

  const declarados = filas(context, 'P-10');

  if (!declarados) {
    return faltaParametro(context, 'P-10', `qué conjuntos de reglas tienen que estar desplegados (cargados hoy: ${resumen})`);
  }

  const faltan = declarados
    .map(f => f.conjunto_reglas)
    .filter(c => !vigentes.some(e => iguales(campo(e, 'conjunto'), c) && (numero(campo(e, 'reglas')) || 0) > 0));

  return faltan.length
    ? noCumple(`Conjuntos de reglas de P-10 que el manager no carga: ${faltan.join(', ')}. Cargados: ${resumen}.`)
    : cumple(`Cargados todos los conjuntos de reglas de P-10 (${resumen}).`);
};

// EV-11 · respuestas automáticas configuradas, y las de P-11.
const SIN_REVERSION = ['', '-', 'no', 'ninguna', 'sin reversion', 'sin reversión'];

const ev11 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'active_response_configured', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-11', ultimo, 'inventario de respuestas activas del manager');
  }

  const habilitadas = vigentes.filter(
    e => campo(e, 'comando') !== '-' && campo(e, 'deshabilitada') !== 'si' && campo(e, 'comando_definido') === 'si'
  );

  if (!habilitadas.length) {
    return noCumple('El manager no tiene ninguna respuesta automática configurada y habilitada: el sistema recolecta y correlaciona, pero no responde.');
  }

  const resumen = habilitadas
    .map(e => `${campo(e, 'comando')} sobre ${campo(e, 'reglas_id') !== '-' ? `reglas ${campo(e, 'reglas_id')}` : `grupos ${campo(e, 'grupos')}`}${campo(e, 'timeout') !== '-' ? `, reversión ${campo(e, 'timeout')} s` : ''}`)
    .join('; ');

  const previstas = filas(context, 'P-11');

  if (!previstas) {
    return faltaParametro(context, 'P-11', `qué respuestas automáticas están previstas (configuradas hoy: ${resumen})`);
  }

  const fallos: string[] = [];

  previstas.forEach(f => {
    const suyas = habilitadas.filter(e => iguales(campo(e, 'comando'), f.accion));

    if (!suyas.length) {
      fallos.push(`${f.accion}: prevista en P-11 y no configurada o deshabilitada`);
    } else if (
      !SIN_REVERSION.includes((f.reversion || '').trim().toLowerCase()) &&
      suyas.every(e => campo(e, 'timeout') === '-')
    ) {
      fallos.push(`${f.accion}: P-11 declara reversión (${f.reversion}) y la respuesta configurada no tiene timeout`);
    }
  });

  return fallos.length
    ? noCumple(`Respuestas automáticas de P-11 que no están como se declaran: ${lista(fallos)}. Configuradas: ${resumen}.`)
    : cumple(`Configuradas y habilitadas las respuestas de P-11 (${resumen}).`);
};

// EV-12 · respuestas automáticas ejecutadas en la ventana.
const ev12 = (context: ENSPolicyContext): Medida => {
  const todas = hechos(context, 'active_response_executed');
  const automaticas = todas.filter(e => campo(e, 'regla_origen') && campo(e, 'regla_origen') !== '-');
  const describe = (e: ENSNormalizedEvent) =>
    `${campo(e, 'programa')} ${campo(e, 'accion')} en ${campo(e, 'agente')}${campo(e, 'regla_origen') !== '-' ? ` por la regla ${campo(e, 'regla_origen')}` : ''} (${campo(e, 'veces')} veces, la última el ${campo(e, 'ultima')})`;

  if (automaticas.length) {
    return cumple(`Respuestas automáticas ejecutadas en la ventana: ${lista(automaticas.map(describe))}.`);
  }

  return sinMedir(
    `No consta en la ventana ninguna respuesta automática disparada por una alerta: la capacidad está configurada o no, pero no hay prueba de que opere.${todas.length ? ` Ejecuciones sin alerta que las dispare (no son respuesta automática): ${lista(todas.map(describe))}.` : ''}`
  );
};

// EV-13 · los servicios del sistema de registro.
const ev13 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'logging_service_status', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-13', ultimo, 'estado de los servicios de Wazuh');
  }

  const caidos = vigentes.filter(e => campo(e, 'activo') !== 'si');

  return caidos.length
    ? noCumple(`Servicios del sistema de registro que no están activos: ${caidos.map(e => `${campo(e, 'servicio')} (${campo(e, 'activo')})`).join(', ')}.`)
    : cumple(`Servicios del sistema de registro activos: ${vigentes.map(e => `${campo(e, 'servicio')} desde ${campo(e, 'activo_desde')}`).join(', ')}.`);
};

// La medida de una evidencia juzgada por primitiva, tal como la dejó su
// primitiva. Aquí no se re-juzga.
const deLaPrimitiva = (context: ENSPolicyContext, id: string): Medida => {
  const evidencia = context.evidences.find(e => e.id === id);
  const estado = evidencia?.status;
  const motivo =
    evidencia?.observations?.filter(o => !o.startsWith('Pregunta de auditoría')).join(' ') || '';

  if (estado === 'CUMPLE') return cumple(motivo);
  if (estado === 'NO_CUMPLE' || estado === 'PARCIAL') return noCumple(motivo);

  return sinMedir(motivo || `${id} no se ha podido medir.`);
};

// --- decisiones ------------------------------------------------------------

type Tipo = ENSPolicyDecision['trace']['ruleType'];

// Con qué evidencias se mide cada requisito en cada plano. Un requisito sin
// evidencias en un plano NO APLICA en esa fila: se mide en la otra.
const REQUISITOS: Record<string, { servidor: string[]; central: string[]; parametros: string[]; tipo: Tipo }> = {
  'op.exp.8.1': { servidor: ['EV-01', 'EV-03'], central: ['EV-01', 'EV-03', 'EV-04', 'EV-13'], parametros: ['P-01', 'P-03'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.8.2': { servidor: ['EV-02'], central: ['EV-04', 'EV-13'], parametros: ['P-02', 'P-12'], tipo: 'MAX_AGE' },
  'op.exp.8.r1.1': { servidor: [], central: ['EV-05'], parametros: ['P-04'], tipo: 'MAX_AGE' },
  'op.exp.8.r2.1': { servidor: ['EV-06'], central: ['EV-06'], parametros: ['P-05', 'P-06'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.8.r3.1': { servidor: [], central: ['EV-07'], parametros: ['P-01', 'P-07'], tipo: 'MIN_RETENTION' },
  'op.exp.8.r4.1': { servidor: ['EV-08'], central: ['EV-08', 'EV-09', 'EV-13'], parametros: ['P-08', 'P-09'], tipo: 'WHITELIST' },
  'op.exp.8.r5.1': { servidor: [], central: ['EV-10'], parametros: ['P-10'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.8.r5.2': { servidor: [], central: ['EV-11', 'EV-12'], parametros: ['P-11'], tipo: 'COVERAGE_REQUIRED' },
};

const PRIMITIVAS = ['EV-02'];

const decide = (
  requisito: string,
  estado: Medida['estado'],
  evidencias: string[],
  parametros: string[],
  tipo: Tipo,
  ruleId: string,
  motivo: string,
  esperado: string
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
});

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();
  const plano = planoDeLaFila(context);

  const medir: Record<string, () => Medida> = {
    'EV-01': () => ev01(context, ahora),
    'EV-02': () => deLaPrimitiva(context, 'EV-02'),
    'EV-03': () => ev03(context, ahora),
    'EV-04': () => ev04(context, ahora),
    'EV-05': () => ev05(context, ahora),
    'EV-06': () => ev06(context, ahora),
    'EV-07': () => ev07(context, ahora),
    'EV-08': () => ev08(context, ahora, plano),
    'EV-09': () => ev09(context),
    'EV-10': () => ev10(context, ahora),
    'EV-11': () => ev11(context, ahora),
    'EV-12': () => ev12(context),
    'EV-13': () => ev13(context, ahora),
  };

  const delPlano = new Set(Object.values(REQUISITOS).flatMap(r => r[plano]));
  const medidas: Record<string, Medida> = {};

  delPlano.forEach(id => {
    medidas[id] = medir[id]();
  });

  const requisitoDecisions: ENSPolicyDecision[] = [];
  const evidenciaDecisions: ENSPolicyDecision[] = [];

  Object.entries(REQUISITOS).forEach(([requisito, definicion]) => {
    const evidencias = definicion[plano];

    if (!evidencias.length) {
      requisitoDecisions.push(
        decide(
          requisito,
          'NO_APLICA',
          [],
          definicion.parametros,
          definicion.tipo,
          requisito,
          'Este requisito se mide en el sistema central de registro (el manager de Wazuh, agente 000): esta máquina no conserva, revisa ni correlaciona el registro de las demás. Su resultado sale en la fila del manager y en el del control.',
          'se mide en el manager'
        )
      );

      return;
    }

    const propias = evidencias.map(id => ({ id, medida: medidas[id] }));
    const estado = peor(propias.map(p => p.medida));
    const responsables = propias.filter(p => p.medida.estado === estado);

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`.
    requisitoDecisions.push(
      decide(
        requisito,
        estado,
        responsables.map(p => p.id),
        definicion.parametros,
        definicion.tipo,
        requisito,
        propias.map(p => `${p.id} ${p.medida.estado}: ${p.medida.motivo}`).join(' | '),
        evidencias.map(id => `${id} CUMPLE`).join(' y ')
      )
    );

    // Y una por evidencia medida aquí, con SU estado. Las de primitiva ya
    // tienen su veredicto y no se repiten.
    propias
      .filter(p => !PRIMITIVAS.includes(p.id))
      .forEach(p =>
        evidenciaDecisions.push(
          decide(requisito, p.medida.estado, [p.id], definicion.parametros, definicion.tipo, `${requisito}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`)
        )
      );
  });

  // Las evidencias del OTRO plano no se han medido en esta fila porque aquí no
  // tienen sujeto: NO_APLICA con el motivo, para que la tabla no las pinte como
  // «no ha llegado nada».
  const otroPlano = context.control.requirements
    .flatMap(r => r.evidenceIds.map(id => ({ id, requisito: r.id })))
    .filter(({ id }) => !delPlano.has(id));
  const vistas = new Set<string>();

  otroPlano.forEach(({ id, requisito }) => {
    if (vistas.has(id)) {
      return;
    }

    vistas.add(id);
    evidenciaDecisions.push(
      decide(
        requisito,
        'NO_APLICA',
        [id],
        [],
        REQUISITOS[requisito]?.tipo || 'COVERAGE_REQUIRED',
        `${requisito}/${id}`,
        plano === 'servidor'
          ? `${id} es del sistema central de registro y se mide en el manager (agente 000), no en esta máquina.`
          : `${id} es del agente de cada servidor; el manager no tiene agente propio que entregue su registro.`,
        'se mide en el otro plano'
      )
    );
  });

  const variables: ENSRuntimeVariable[] = [
    {
      name: 'plano_de_la_fila',
      value: plano,
      parameterIds: [],
      evidenceIds: [],
      eventIds: [],
      description:
        plano === 'central'
          ? 'Fila del sistema central de registro (manager): se miden las evidencias del servidor y las centrales.'
          : 'Fila de un servidor: se miden sus evidencias; las centrales se miden en el manager.',
    },
    ...Object.entries(medidas).map(([id, medida]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: medida.estado,
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: medida.motivo,
    })),
  ];

  return { decisions: [...requisitoDecisions, ...evidenciaDecisions], runtimeVariables: variables };
};

export const opExp8PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // Refuerzos acumulativos POR NIVEL DE TRAZABILIDAD: base en los tres, R1-R4
  // desde MEDIO, R5 solo en ALTO.
  requirements: [
    {
      requirementId: 'op.exp.8.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-13'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.8.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-12'],
      evidenceIds: ['EV-02', 'EV-04'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.8.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.8.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05', 'P-06'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.8.r3.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'MIN_RETENTION',
    },
    {
      requirementId: 'op.exp.8.r4.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-08', 'EV-09', 'EV-13'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.8.r5.1',
      levels: ['ALTO'],
      parameterIds: ['P-10'],
      evidenceIds: ['EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.8.r5.2',
      levels: ['ALTO'],
      parameterIds: ['P-11'],
      evidenceIds: ['EV-11', 'EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
