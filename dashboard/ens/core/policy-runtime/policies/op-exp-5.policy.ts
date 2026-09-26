// op.exp.5 · Gestión de cambios
//
// Por qué este control tiene policy propia. Su pregunta central —«¿cada cambio
// REAL tenía una petición aprobada cuya ventana lo cubre?»— cruza dos
// poblaciones de hechos distintas por sistema y por intervalo de tiempo, y
// ninguna de las siete primitivas compara así:
//
//   EV-02  cada cambio real (EV-01) contra las filas del registro de peticiones
//          que lo cubren: mismo sistema, petición aprobada y ventana que lo
//          contiene. Es un solape de intervalos, no una igualdad de clave.
//   EV-03  la fila de cada petición autorizada, columna a columna, contra los
//          campos mínimos de P-02 (y en ALTO, la valoración de impacto de R1).
//   EV-04  la aprobación de un cambio de riesgo alto tiene que ser del RSI
//          (P-04) y ANTERIOR a su implantación, que es el primer cambio real
//          que la petición cubre.
//   EV-06  el documento de P-06 que la petición declara tiene que modificarse
//          DESPUÉS del cambio y dentro de su plazo.
//   EV-07  un servicio caído que empieza en las horas siguientes a un cambio.
//   EV-09  el punto de reversión tiene que ser ANTERIOR al cambio (la lógica de
//          EV-09 de op.exp.4, aplicada a todos los cambios reales).
//
// La fuente de las peticiones NO es un ITSM: es el registro que la organización
// mantiene en cada máquina (`/etc/ensfacil/change-register.tsv`) y que el
// recolector lee y emite tal cual, fila a fila, con una cabecera que dice
// cuántas filas tiene. El recolector no correlaciona nada: eso se hace aquí.
//
// Invariantes, las de `evidence/judgment.ts` y `op-exp-4.policy.ts`:
//   - el agente emite instantes, no edades ni veredictos;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo;
//   - las preguntas de este control son aserciones NEGATIVAS sobre la
//     población de cambios reales («ningún cambio sin petición», «ningún
//     cambio sin punto de reversión»). Por eso, y SOLO con el latido
//     confirmando que las cuatro fuentes de cambios se leyeron enteras (EV-01
//     en `evidencias_cubiertas`), un periodo sin cambios es CUMPLE: es lo mismo
//     que hace NINGUNO_FUERA_DE_LISTA. Sin ese latido, el silencio no acredita
//     nada. Es una diferencia deliberada con EV-09 de op.exp.4, que sale
//     NO_EVALUABLE sin cambios: allí el latido no declara esa evidencia.
//   - la policy nunca inventa política: ninguna ventana, plazo ni cuenta tiene
//     valor por defecto.
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
import type { ENSControlParameter, ENSLevel } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';
import { parseReferenceList } from '../../evidence/judgment';

const CONTROL = 'op.exp.5';
const POLICY = 'policy.op.exp.5';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// Frescura de la lectura del registro de peticiones. El recolector la reemite
// cada 20 h aunque no cambie y corre cada hora: 24 h + una pasada + margen. Es
// tolerancia de OBSERVACIÓN, no política.
const FRESCURA_HORAS = 26;

// Mismo margen de reloj que `resolveCollectorCoverage`.
const TOLERANCIA_FUTURO = 5 * 60 * 1000;

// Latido que confirma la cobertura de una evidencia, igual que en las
// primitivas.
const LATIDO_HORAS = 24;

// La ventana de observación de las ACCIONES (decisión del 17/09). Una petición
// cuya ventana acabó antes no se puede contrastar con hechos que ya no están en
// la ventana: juzgarla daría un NO_CUMPLE por falta de datos.
const PERIODO_DIAS = 30;

// Columnas del registro de peticiones, en su orden. Es el contrato del TSV.
export const COLUMNAS_REGISTRO = [
  'peticion_id',
  'fecha_registro',
  'sistema',
  'descripcion',
  'riesgo',
  'aprobado_por',
  'fecha_aprobacion',
  'ventana_inicio',
  'ventana_fin',
  'preproduccion',
  'estado',
  'documentacion',
  'impacto_seguridad',
  'referencia',
];

// Estados en los que la petición ha pasado por la autorización. Solo una
// petición aprobada autoriza un cambio; `revertida` fue aprobada e implantada.
const AUTORIZADAS = ['aprobada', 'implantada', 'revertida'];
const IMPLANTADAS = ['implantada', 'revertida'];

type Medida = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;
  motivo: string;
};

const cumple = (motivo: string): Medida => ({ estado: 'CUMPLE', motivo });
const noCumple = (motivo: string): Medida => ({ estado: 'NO_CUMPLE', motivo });
const sinMedir = (motivo: string): Medida => ({ estado: 'NO_EVALUABLE', motivo });

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

const esMedida = (x: unknown): x is Medida =>
  typeof x === 'object' && x !== null && (x as Medida).estado !== undefined && (x as Medida).motivo !== undefined;

// --- lectura de hechos -----------------------------------------------------

// El normalizador parte un evento con `evidence_id=EV-01,EV-02` en uno por
// evidencia. Aquí se juzga el HECHO, así que se cuenta una vez.
const hechos = (context: ENSPolicyContext, tipo: string): ENSNormalizedEvent[] => {
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
  const t = String(texto || '').trim().replace(',', '.');

  if (!/^-?\d+(\.\d+)?$/.test(t)) {
    return undefined;
  }

  const valor = Number(t);

  return Number.isFinite(valor) ? valor : undefined;
};

const instante = (texto: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(texto)) {
    return undefined;
  }

  // Una fecha sin hora es UTC: el registro se escribe en UTC.
  const valor = new Date(texto.length === 10 ? `${texto}T00:00:00Z` : texto).getTime();

  return Number.isFinite(valor) ? valor : undefined;
};

// El FIN de una ventana escrita solo con fecha es el final de ese día: «hasta el
// 20» incluye el 20.
const finDe = (texto: string): number | undefined => {
  const t = instante(texto);

  return t !== undefined && texto.length === 10 ? t + DIA - 1 : t;
};

const iso = (t: number): string => new Date(t).toISOString().replace('.000Z', 'Z');

const sinTildes = (texto: string): string =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const vacia = (celda: string | undefined): boolean => {
  const t = String(celda || '').trim();

  return t === '' || t === '-';
};

const lista = (elementos: string[], maximo = 5): string =>
  elementos.length > maximo
    ? `${elementos.slice(0, maximo).join('; ')} y ${elementos.length - maximo} más`
    : elementos.join('; ');

// La degradación más reciente que el recolector declaró para una evidencia.
const degradacion = (context: ENSPolicyContext, evidencia: string): string | undefined => {
  const d = context.events
    .filter(
      e =>
        e.controlId === CONTROL &&
        e.eventType === 'evidence_state' &&
        e.evidenceId === evidencia
    )
    .sort((a, b) => (instante(b.timestamp) || 0) - (instante(a.timestamp) || 0))[0];

  return d ? `${campo(d, 'motivo')} (${campo(d, 'causa') || 'COLLECTION'})` : undefined;
};

const latidoConfirma = (context: ENSPolicyContext, evidencia: string, ahora: number): boolean => {
  const latido = hechos(context, 'collector_run')
    .map(e => ({ e, t: instante(e.timestamp) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO && ahora - x.t <= LATIDO_HORAS * HORA
    )
    .sort((a, b) => b.t - a.t)[0];

  return Boolean(
    latido &&
      campo(latido.e, 'resultado') === 'completada' &&
      campo(latido.e, 'evidencias_cubiertas').split(',').map(s => s.trim()).includes(evidencia)
  );
};

const nombreDelAgente = (context: ENSPolicyContext): string | undefined =>
  context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName;

// --- lectura de parámetros -------------------------------------------------

const parametro = (context: ENSPolicyContext, id: string): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

const etiqueta = (context: ENSPolicyContext, id: string): string => {
  const p = parametro(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

// Filas de una tabla repartidas en sus columnas declaradas. Sin columnas no se
// adivina la posición: el parámetro se trata como no configurado.
const filas = (context: ENSPolicyContext, id: string): Record<string, string>[] | undefined => {
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

const valores = (context: ENSPolicyContext, id: string): string[] =>
  parseReferenceList(parametro(context, id)?.value);

const filaDelSistema = (
  tabla: Record<string, string>[],
  columna: string,
  nombres: string[]
): Record<string, string> | undefined =>
  tabla.find(f => nombres.some(n => n && f[columna].toLowerCase() === n.toLowerCase())) ||
  tabla.find(f => f[columna] === '*');

// --- el registro de peticiones de cambio -----------------------------------

type Peticion = Record<string, string>;

type Registro = {
  cabecera: ENSNormalizedEvent;
  leido: string;
  peticiones: Peticion[];
  ilegibles: number;
  host: string;
};

// P-01: dónde vive el registro. Sin integración con un ITSM, lo único que el
// motor sabe contrastar es el registro TSV que lee el recolector: si P-01 dice
// que las peticiones viven en otro sitio, el registro de la máquina no es la
// fuente de verdad y juzgarlo sería juzgar una copia que nadie mantiene.
const sistemaDeCambios = (context: ENSPolicyContext): Medida | undefined => {
  const tabla = filas(context, 'P-01');

  if (!tabla) {
    return sinMedir(
      `${etiqueta(context, 'P-01')} está sin configurar: no se ha declarado dónde se registran las peticiones de cambio, así que no hay registro contra el que contrastar los cambios reales.`
    );
  }

  if (!tabla.some(f => sinTildes(f.herramienta) === 'registro_tsv')) {
    return sinMedir(
      `${etiqueta(context, 'P-01')} declara que las peticiones viven en «${tabla.map(f => f.herramienta).join(', ')}», y no hay integración con ese sistema: el recolector solo lee el registro TSV de la máquina. El contraste no se puede hacer sin simular una integración que no existe.`
    );
  }

  return undefined;
};

const registro = (context: ENSPolicyContext, ahora: number): Registro | Medida => {
  const deP01 = sistemaDeCambios(context);

  if (deP01) {
    return deP01;
  }

  const cabeceras = hechos(context, 'change_register_read')
    .map(e => ({ e, t: instante(campo(e, 'leido')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO
    )
    .sort((a, b) => b.t - a.t);

  if (!cabeceras.length) {
    const motivo = degradacion(context, 'EV-02');

    return sinMedir(
      motivo
        ? `No se ha podido leer el registro de peticiones de cambio: ${motivo}.`
        : 'No consta ninguna lectura del registro de peticiones de cambio de esta máquina: el recolector de op.exp.5 no está desplegado o no informa.'
    );
  }

  const { e: cabecera, t } = cabeceras[0];

  if (ahora - t > FRESCURA_HORAS * HORA) {
    return sinMedir(
      `La lectura más reciente del registro de peticiones es de ${campo(cabecera, 'leido')}, hace más de ${FRESCURA_HORAS} h: no describe el registro de hoy.`
    );
  }

  const firma = campo(cabecera, 'firma');
  const porLinea = new Map<string, Peticion>();

  hechos(context, 'change_request_registered')
    .filter(e => campo(e, 'registro_firma') === firma)
    .forEach(e => {
      const fila: Peticion = {};

      COLUMNAS_REGISTRO.forEach(c => {
        fila[c] = campo(e, c);
      });

      porLinea.set(campo(e, 'linea') || campo(e, 'peticion_id'), fila);
    });

  const declaradas = numero(campo(cabecera, 'filas'));

  if (declaradas === undefined || porLinea.size < declaradas) {
    return sinMedir(
      `La lectura del registro de ${campo(cabecera, 'leido')} declara ${campo(cabecera, 'filas') || '?'} peticiones y solo han llegado ${porLinea.size}: está incompleta y no se juzga sobre una parte.`
    );
  }

  return {
    cabecera,
    leido: campo(cabecera, 'leido'),
    peticiones: Array.from(porLinea.values()),
    ilegibles: numero(campo(cabecera, 'filas_ilegibles')) || 0,
    host: campo(cabecera, 'sistema_local'),
  };
};

// ¿Habla esta petición de esta máquina? `sistema` son nombres separados por
// comas (el del agente o el del host) o «*».
const esDeEstaMaquina = (p: Peticion, nombres: string[]): boolean =>
  p.sistema
    .split(/[,;]/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .some(s => s === '*' || nombres.some(n => n && n.toLowerCase() === s));

const nombresDe = (context: ENSPolicyContext, reg?: Registro): string[] =>
  [nombreDelAgente(context) || '', reg?.host || ''].filter(Boolean);

// --- los cambios reales (EV-01) --------------------------------------------

type Cambio = {
  tipo: 'configuración' | 'software' | 'puerto' | 'hardware';
  desde: number;
  hasta: number;
  // Un cambio EXACTO tiene instante (auditd, dpkg). Uno detectado entre dos
  // pasadas (puertos, hardware) solo se sabe que ocurrió en ese intervalo.
  exacto: boolean;
  texto: string;
};

// Una escritura de configuración hecha por el propio gestor de paquetes es
// parte de la transacción de software, no un cambio aparte.
const DEL_GESTOR_DE_PAQUETES = /(^|\/)(dpkg|apt|apt-get|unattended-upgr[a-z-]*|packagekitd)$/;

const cambiosReales = (context: ENSPolicyContext, ahora: number): { cambios: Cambio[]; plegados: number } => {
  const cambios: Cambio[] = [];
  let plegados = 0;
  const valido = (t: number | undefined): t is number => t !== undefined && t <= ahora + TOLERANCIA_FUTURO;

  hechos(context, 'config_file_modified').forEach(e => {
    if (DEL_GESTOR_DE_PAQUETES.test(campo(e, 'proceso'))) {
      plegados += 1;

      return;
    }

    const desde = instante(campo(e, 'primera'));
    const hasta = instante(campo(e, 'ultima')) ?? desde;

    if (!valido(desde) || !valido(hasta)) {
      return;
    }

    cambios.push({
      tipo: 'configuración',
      desde,
      hasta,
      exacto: true,
      texto: `${campo(e, 'recurso')} (${campo(e, 'operacion')} por ${campo(e, 'actor') || '?'}, ${campo(e, 'primera')})`,
    });
  });

  hechos(context, 'package_changed').forEach(e => {
    const desde = instante(campo(e, 'inicio'));
    const hasta = instante(campo(e, 'fin')) ?? desde;

    if (!valido(desde) || !valido(hasta)) {
      return;
    }

    cambios.push({
      tipo: 'software',
      desde,
      hasta,
      exacto: true,
      texto: `software ${campo(e, 'inicio')} por ${campo(e, 'actor') || '?'} (${campo(e, 'mecanismo') || '?'}: ${(campo(e, 'paquetes') || '').slice(0, 80)})`,
    });
  });

  const entrePasadas = (tipo: 'puerto' | 'hardware', evento: string, describe: (e: ENSNormalizedEvent) => string) =>
    hechos(context, evento).forEach(e => {
      const hasta = instante(campo(e, 'detectado'));
      const desde = instante(campo(e, 'desde')) ?? hasta;

      if (!valido(desde) || !valido(hasta)) {
        return;
      }

      cambios.push({ tipo, desde, hasta, exacto: false, texto: describe(e) });
    });

  entrePasadas('puerto', 'listening_port_changed', e =>
    `puerto ${campo(e, 'protocolo')}/${campo(e, 'puerto')} ${campo(e, 'cambio')} (${campo(e, 'proceso') || '?'}, entre ${campo(e, 'desde')} y ${campo(e, 'detectado')})`
  );
  entrePasadas('hardware', 'hardware_changed', e =>
    `${campo(e, 'componente')} ${campo(e, 'cambio')}: ${campo(e, 'elemento')} (entre ${campo(e, 'desde')} y ${campo(e, 'detectado')})`
  );

  cambios.sort((a, b) => a.desde - b.desde);

  return { cambios, plegados };
};

// ¿Cubre esta petición este cambio? Aprobada, de esta máquina, con ventana
// legible, y con el cambio DENTRO de la ventana si su instante es exacto o
// SOLAPANDO con ella si solo se sabe el intervalo entre dos pasadas.
const cubre = (p: Peticion, c: Cambio, nombres: string[]): boolean => {
  if (!AUTORIZADAS.includes(sinTildes(p.estado)) || vacia(p.aprobado_por)) {
    return false;
  }

  if (!esDeEstaMaquina(p, nombres)) {
    return false;
  }

  const vi = instante(p.ventana_inicio);
  const vf = finDe(p.ventana_fin);

  if (vi === undefined || vf === undefined) {
    return false;
  }

  // Un cambio PLANIFICADO se aprueba antes de hacerse. Una petición aprobada
  // después del cambio es una ratificación a posteriori y no lo cubre: sin
  // esto, anotar hoy una fila con la ventana de ayer taparía cualquier cambio.
  const aprobada = instante(p.fecha_aprobacion);

  if (aprobada === undefined || aprobada > c.hasta) {
    return false;
  }

  return c.exacto ? c.desde >= vi && c.hasta <= vf : c.desde <= vf && c.hasta >= vi;
};

// --- las evidencias --------------------------------------------------------

const resumenCambios = (cambios: Cambio[]): string => {
  const cuenta = (tipo: Cambio['tipo']) => cambios.filter(c => c.tipo === tipo).length;

  return `${cambios.length} cambio(s) real(es): ${cuenta('configuración')} de configuración, ${cuenta('software')} de software, ${cuenta('puerto')} de puertos en escucha y ${cuenta('hardware')} de hardware`;
};

const ev01 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { cambios, plegados } = cambiosReales(context, ahora);

  if (!latidoConfirma(context, 'EV-01', ahora)) {
    const motivo = degradacion(context, 'EV-01');

    return sinMedir(
      `La detección de cambios no está completa${motivo ? `: ${motivo}` : ': no consta un latido reciente del recolector que declare leídas las cuatro fuentes (auditd sobre todas las rutas de configuración, historial de apt y dpkg, puertos en escucha e inventario de hardware)'}. Se han observado ${resumenCambios(cambios)}, pero lo que no se vigila no aparece.`
    );
  }

  return cumple(
    `Detección de cambios operativa en las cuatro fuentes. En la ventana: ${resumenCambios(cambios)}${plegados ? ` (y ${plegados} escritura(s) de configuración hechas por el gestor de paquetes, que cuentan dentro de su transacción)` : ''}.`
  );
};

const ev02 = (context: ENSPolicyContext, ahora: number): Medida => {
  const reg = registro(context, ahora);

  if (esMedida(reg)) {
    return reg;
  }

  const nombres = nombresDe(context, reg);
  const { cambios } = cambiosReales(context, ahora);
  const sinPeticion: string[] = [];
  const trazados = new Map<string, number>();

  cambios.forEach(c => {
    const p = reg.peticiones.find(pp => cubre(pp, c, nombres));

    if (!p) {
      sinPeticion.push(c.texto);

      return;
    }

    trazados.set(p.peticion_id, (trazados.get(p.peticion_id) || 0) + 1);
  });

  const trazas = Array.from(trazados.entries()).map(([id, n]) => `${id} (${n})`);

  if (sinPeticion.length) {
    return noCumple(
      `${sinPeticion.length} de ${cambios.length} cambios reales no tienen ninguna petición aprobada en el registro (${reg.leido}) cuya ventana los cubra: ${lista(sinPeticion)}.${trazas.length ? ` Trazados: ${lista(trazas)}.` : ''} Fuente de las peticiones: registro TSV de la máquina, mantenido a mano.`
    );
  }

  if (!latidoConfirma(context, 'EV-01', ahora)) {
    return sinMedir(
      `Los ${cambios.length} cambios observados tienen petición aprobada, pero la detección de cambios no está completa (ver EV-01): un cambio que no se vigila no puede salir sin petición.`
    );
  }

  return cumple(
    cambios.length
      ? `Los ${cambios.length} cambios reales de la ventana tienen petición aprobada cuya ventana los cubre: ${lista(trazas)}. Fuente: registro TSV de la máquina (${reg.peticiones.length} peticiones, leído ${reg.leido}).`
      : `Ningún cambio real en la ventana evaluada, con la detección de cambios confirmada por el latido. Registro de peticiones leído ${reg.leido} (${reg.peticiones.length} peticiones).`
  );
};

// Campos que P-02 exige, traducidos a columnas del registro.
const camposExigidos = (context: ENSPolicyContext): { campos: string[]; desconocidos: string[] } => {
  const campos: string[] = [];
  const desconocidos: string[] = [];

  valores(context, 'P-02').forEach(v => {
    const c = sinTildes(v).replace(/[\s-]+/g, '_');

    if (COLUMNAS_REGISTRO.includes(c)) {
      campos.push(c);
    } else {
      desconocidos.push(v);
    }
  });

  return { campos: Array.from(new Set(campos)), desconocidos };
};

const ev03 = (context: ENSPolicyContext, ahora: number, nivel: ENSLevel): Medida => {
  const { campos, desconocidos } = camposExigidos(context);

  if (!campos.length && !desconocidos.length) {
    return sinMedir(`${etiqueta(context, 'P-02')} está sin configurar: no se ha decidido qué información mínima tiene que traer una petición.`);
  }

  if (desconocidos.length) {
    return sinMedir(
      `${etiqueta(context, 'P-02')} nombra campos que el registro no tiene (${desconocidos.join(', ')}). Los campos válidos son las columnas del registro: ${COLUMNAS_REGISTRO.join(', ')}.`
    );
  }

  const reg = registro(context, ahora);

  if (esMedida(reg)) {
    return reg;
  }

  // R1 (ALTO) exige además la valoración del impacto en la seguridad de TODO
  // cambio documentado (op.exp.5.r1.3).
  const exigidos = nivel === 'ALTO' ? Array.from(new Set([...campos, 'impacto_seguridad'])) : campos;
  const prefijo = (filas(context, 'P-01') || []).find(f => sinTildes(f.herramienta) === 'registro_tsv')?.prefijo_referencia || '';
  const nombres = nombresDe(context, reg);

  const autorizadas = reg.peticiones.filter(
    p => AUTORIZADAS.includes(sinTildes(p.estado)) && esDeEstaMaquina(p, nombres)
  );

  const incompletas: string[] = [];

  autorizadas.forEach(p => {
    const faltan = exigidos.filter(c => vacia(p[c]));
    const malNumerada = prefijo && !p.peticion_id.startsWith(prefijo);

    if (faltan.length || malNumerada) {
      incompletas.push(
        `${p.peticion_id || '(sin número)'}: ${[
          faltan.length ? `sin ${faltan.join(', ')}` : '',
          malNumerada ? `número fuera del formato «${prefijo}…» de P-01` : '',
        ].filter(Boolean).join('; ')}`
      );
    }
  });

  const r1 = nivel === 'ALTO' ? ' (en ALTO se exige además impacto_seguridad, por op.exp.5.r1.3)' : '';

  if (reg.ilegibles > 0 || incompletas.length) {
    return noCumple(
      `Peticiones autorizadas sin la información mínima de P-02${r1}: ${[
        reg.ilegibles ? `${reg.ilegibles} fila(s) del registro que no tienen las ${COLUMNAS_REGISTRO.length} columnas y no se pueden leer` : '',
        incompletas.length ? lista(incompletas) : '',
      ].filter(Boolean).join('; ')}.`
    );
  }

  return cumple(
    autorizadas.length
      ? `Las ${autorizadas.length} peticiones autorizadas de esta máquina traen ${exigidos.join(', ')}${r1}.`
      : `El registro (leído ${reg.leido}) no contiene ninguna petición autorizada para esta máquina: no hay ninguna con información insuficiente.`
  );
};

const ev04 = (context: ENSPolicyContext, ahora: number): Medida => {
  if (!valores(context, 'P-03').length) {
    return sinMedir(
      `${etiqueta(context, 'P-03')} está sin configurar: no hay criterios escritos que digan cuándo un cambio es de riesgo alto, así que la columna «riesgo» del registro no se apoya en ningún análisis declarado.`
    );
  }

  const rsi = (filas(context, 'P-04') || []).map(f => f.cuenta).filter(c => !vacia(c));

  if (!rsi.length) {
    return sinMedir(`${etiqueta(context, 'P-04')} está sin configurar: no se puede verificar que la aprobación de un cambio de riesgo alto venga del Responsable de la Seguridad.`);
  }

  const reg = registro(context, ahora);

  if (esMedida(reg)) {
    return reg;
  }

  const nombres = nombresDe(context, reg);
  const { cambios } = cambiosReales(context, ahora);
  const desde = ahora - PERIODO_DIAS * DIA;

  const altas = reg.peticiones.filter(p => sinTildes(p.riesgo) === 'alto' && esDeEstaMaquina(p, nombres));
  const hallazgos: string[] = [];
  const revisadas: string[] = [];

  altas.forEach(p => {
    const suyos = cambios.filter(c => cubre(p, c, nombres));
    const implantada = IMPLANTADAS.includes(sinTildes(p.estado)) || suyos.length > 0;
    const vf = finDe(p.ventana_fin);

    if (!implantada || (vf !== undefined && vf < desde && !suyos.length)) {
      return;
    }

    // La implantación es el primer cambio REAL que la petición cubre; si no se
    // ha observado ninguno, el inicio de la ventana declarada.
    const implantacion = suyos.length ? suyos[0].desde : instante(p.ventana_inicio);
    const aprobada = instante(p.fecha_aprobacion);
    const problemas: string[] = [];

    if (vacia(p.aprobado_por)) {
      problemas.push('sin aprobador');
    } else if (!rsi.includes(p.aprobado_por)) {
      problemas.push(`aprobada por «${p.aprobado_por}», que no es el RSI de P-04`);
    }

    if (aprobada === undefined) {
      problemas.push('sin fecha de aprobación legible');
    } else if (implantacion !== undefined && aprobada > implantacion) {
      problemas.push(`aprobada el ${p.fecha_aprobacion}, DESPUÉS de su implantación (${iso(implantacion)}${suyos.length ? ', primer cambio real observado' : ', inicio de su ventana'})`);
    }

    if (problemas.length) {
      hallazgos.push(`${p.peticion_id}: ${problemas.join('; ')}`);
    } else {
      revisadas.push(p.peticion_id);
    }
  });

  if (hallazgos.length) {
    return noCumple(`Cambios de riesgo alto sin aprobación previa y expresa del RSI: ${lista(hallazgos)}.`);
  }

  const sinPeticion = cambios.filter(c => !reg.peticiones.some(p => cubre(p, c, nombres)));

  if (sinPeticion.length) {
    return sinMedir(
      `${sinPeticion.length} cambio(s) real(es) no tienen petición (ver EV-02): su riesgo no se ha analizado y no se puede afirmar que ninguno fuera de riesgo alto.${revisadas.length ? ` Las de riesgo alto registradas (${revisadas.join(', ')}) tienen aprobación previa del RSI.` : ''}`
    );
  }

  if (!revisadas.length && !latidoConfirma(context, 'EV-01', ahora)) {
    return sinMedir('No consta ningún cambio de riesgo alto implantado, pero la detección de cambios no está completa (ver EV-01): el silencio no acredita nada.');
  }

  return cumple(
    revisadas.length
      ? `Los cambios de riesgo alto implantados (${revisadas.join(', ')}) fueron aprobados por el RSI antes de su implantación.`
      : `Ningún cambio de riesgo alto implantado en los últimos ${PERIODO_DIAS} días: todos los cambios reales están cubiertos por peticiones de otro riesgo.`
  );
};

const ev05 = (context: ENSPolicyContext): Medida => {
  if (!filas(context, 'P-05')) {
    return sinMedir(`${etiqueta(context, 'P-05')} está sin configurar: no hay ningún entorno de preproducción declarado para esta máquina.`);
  }

  return sinMedir(
    'P-05 declara la preproducción, pero demostrar que cada cambio pasó ANTES por ella exige cruzar los cambios reales de las dos máquinas, y el motor evalúa cada máquina por separado. La columna «preproduccion» del registro es una declaración de la organización, no una observación: no la sustituye. op.exp.5.3 queda sin demostrar hasta que la consolidación entre máquinas lo soporte.'
  );
};

const ev06 = (context: ENSPolicyContext, ahora: number): Medida => {
  const tabla = filas(context, 'P-06');

  if (!tabla) {
    return sinMedir(`${etiqueta(context, 'P-06')} está sin configurar: no se ha declarado qué documentación de configuración hay que actualizar tras un cambio ni dónde vive.`);
  }

  const reg = registro(context, ahora);

  if (esMedida(reg)) {
    return reg;
  }

  const nombres = nombresDe(context, reg);
  const desde = ahora - PERIODO_DIAS * DIA;

  const modificaciones = new Map<string, number[]>();

  hechos(context, 'config_doc_modified').forEach(e => {
    const t = instante(campo(e, 'modificado'));
    const ruta = campo(e, 'ruta');

    if (t === undefined || !ruta) {
      return;
    }

    modificaciones.set(ruta, [...(modificaciones.get(ruta) || []), t]);
  });

  const exigibles = reg.peticiones.filter(p => {
    const vi = instante(p.ventana_inicio);

    return (
      sinTildes(p.estado) === 'implantada' &&
      esDeEstaMaquina(p, nombres) &&
      !vacia(p.documentacion) &&
      vi !== undefined &&
      vi >= desde
    );
  });

  const fuera: string[] = [];
  const sinDecidir: string[] = [];
  const pendientes: string[] = [];
  const hechas: string[] = [];

  exigibles.forEach(p => {
    const vi = instante(p.ventana_inicio) as number;
    const vf = finDe(p.ventana_fin) ?? vi;

    p.documentacion
      .split(/[,;]/)
      .map(d => d.trim())
      .filter(Boolean)
      .forEach(nombre => {
        const fila = tabla.find(f => sinTildes(f.documento) === sinTildes(nombre));

        if (!fila) {
          sinDecidir.push(`${p.peticion_id}: el documento «${nombre}» no figura en P-06`);

          return;
        }

        const plazo = numero(fila.plazo_dias);

        if (plazo === undefined || plazo < 0) {
          sinDecidir.push(`${p.peticion_id}: P-06 no da un plazo en días legible para «${fila.documento}»`);

          return;
        }

        const vistas = modificaciones.get(fila.ubicacion);

        if (!vistas) {
          sinDecidir.push(`${p.peticion_id}: «${fila.documento}» (${fila.ubicacion}) no lo vigila el recolector de esta máquina`);

          return;
        }

        const limite = vf + plazo * DIA;

        if (vistas.some(t => t >= vi && t <= limite)) {
          hechas.push(`${p.peticion_id} → ${fila.documento}`);
        } else if (ahora < limite) {
          pendientes.push(`${p.peticion_id} → ${fila.documento} (plazo hasta ${iso(limite)})`);
        } else {
          fuera.push(`${p.peticion_id}: «${fila.documento}» no se modificó entre ${p.ventana_inicio} y ${iso(limite)}`);
        }
      });
  });

  if (fuera.length) {
    return noCumple(`Cambios implantados sin actualizar su documentación de configuración en plazo: ${lista(fuera)}.`);
  }

  if (sinDecidir.length) {
    return sinMedir(`No se puede comprobar toda la documentación exigida: ${lista(sinDecidir)}.`);
  }

  return cumple(
    exigibles.length
      ? `Documentación actualizada tras el cambio: ${lista(hechas)}.${pendientes.length ? ` Dentro de plazo todavía: ${lista(pendientes)}.` : ''}`
      : `Ninguna petición implantada en los últimos ${PERIODO_DIAS} días declara documentación de configuración que actualizar (columna «documentacion» del registro).`
  );
};

const horasP09 = (context: ENSPolicyContext): number | undefined => {
  const v = parametro(context, 'P-09')?.value;
  const n = numero(Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));

  return n !== undefined && n > 0 ? n : undefined;
};

const ev07 = (context: ENSPolicyContext, ahora: number): Medida => {
  const horas = horasP09(context);

  if (horas === undefined) {
    return sinMedir(`${etiqueta(context, 'P-09')} está sin configurar: no se ha decidido durante cuántas horas tras un cambio un servicio caído se atribuye a ese cambio.`);
  }

  if (!latidoConfirma(context, 'EV-07', ahora)) {
    const motivo = degradacion(context, 'EV-07');

    return sinMedir(`No consta una lectura reciente del estado de los servicios${motivo ? `: ${motivo}` : ''}: sin ella no se sabe si algún cambio dejó un servicio caído.`);
  }

  const { cambios } = cambiosReales(context, ahora);
  const reg = registro(context, ahora);
  const peticiones = esMedida(reg) ? [] : reg.peticiones;
  const nombres = nombresDe(context, esMedida(reg) ? undefined : reg);

  // Los hechos de estado ya llegan cortados a la última pasada (ver
  // `evidence/state-facts.ts`): son los servicios que siguen caídos AHORA.
  const caidos = hechos(context, 'service_failed');
  const adversos: string[] = [];
  const revertidos: string[] = [];
  const ajenos: string[] = [];

  caidos.forEach(e => {
    const inicio = instante(campo(e, 'desde'));
    const unidad = campo(e, 'unidad');

    const causa = inicio === undefined
      ? undefined
      : cambios.filter(c => c.hasta <= inicio && inicio - c.hasta <= horas * HORA).pop();

    if (!causa) {
      ajenos.push(unidad);

      return;
    }

    const revertida = peticiones.find(p => sinTildes(p.estado) === 'revertida' && cubre(p, causa, nombres));

    if (revertida) {
      revertidos.push(`${unidad} tras ${causa.texto}, revertido en ${revertida.peticion_id}`);
    } else {
      adversos.push(`${unidad} caído desde ${campo(e, 'desde')}, ${((inicio as number - causa.hasta) / HORA).toFixed(1)} h después de ${causa.texto}`);
    }
  });

  if (adversos.length) {
    return noCumple(
      `Efectos adversos sostenidos tras un cambio, sin reversión registrada: ${lista(adversos)}. Siguen caídos en la última pasada.`
    );
  }

  if (!cambios.length && !latidoConfirma(context, 'EV-01', ahora)) {
    return sinMedir('No consta ningún cambio real, pero la detección de cambios no está completa (ver EV-01).');
  }

  return cumple(
    `Ningún servicio sigue caído por un cambio de las ${horas} h previas (${cambios.length} cambios en la ventana).${revertidos.length ? ` Revertidos: ${lista(revertidos)}.` : ''}${ajenos.length ? ` Caídos sin cambio previo en ${horas} h (cuentan para EV-08, no aquí): ${lista(ajenos)}.` : ''}`
  );
};

const CANALES = ['cola_itsm', 'buzon', 'integracion_wazuh'];

const ev08 = (context: ENSPolicyContext): Medida => {
  const tabla = filas(context, 'P-07');

  if (!tabla) {
    return sinMedir(`${etiqueta(context, 'P-07')} está sin configurar: no se ha declarado por qué canal se comunican los fallos al responsable de seguridad.`);
  }

  const caidos = hechos(context, 'service_failed').map(e => campo(e, 'unidad'));
  const fallos = caidos.length ? `Fallos detectados ahora: ${lista(caidos)}.` : 'No hay ningún servicio caído en la última pasada.';
  const canales = tabla.map(f => sinTildes(f.canal)).filter(c => CANALES.includes(c));

  return sinMedir(
    `${fallos} La comunicación por ${canales.length ? canales.join(', ') : 'el canal declarado'} (${tabla.map(f => f.destino).filter(Boolean).join(', ') || 'sin destino'}) no deja ningún hecho observable en esta máquina: no hay integración que registre el envío, y un buzón o una cola humana no se ven desde Wazuh. op.exp.5.r1.2 se detecta a medias y no se demuestra.`
  );
};

const MECANISMOS_LOCALES = ['lvm', 'zfs', 'btrfs'];

// La lógica de EV-09 de op.exp.4, aplicada a todos los cambios EXACTOS (de
// configuración y de software): un puerto o un disco que cambian entre dos
// pasadas no tienen un «antes» preciso contra el que medir el punto de
// reversión.
const ev09 = (context: ENSPolicyContext, ahora: number): Medida => {
  const tabla = filas(context, 'P-08');

  if (!tabla) {
    return sinMedir(`${etiqueta(context, 'P-08')} está sin configurar: no se ha previsto ningún mecanismo de reversión.`);
  }

  const reg = registro(context, ahora);
  const fila = filaDelSistema(tabla, 'sistema', nombresDe(context, esMedida(reg) ? undefined : reg));

  if (!fila) {
    return sinMedir(`P-08 no tiene fila para ${nombreDelAgente(context) || 'esta máquina'} ni una fila «*».`);
  }

  const mecanismo = fila.mecanismo.toLowerCase();

  if (!MECANISMOS_LOCALES.includes(mecanismo)) {
    return sinMedir(
      `El mecanismo declarado en P-08 («${fila.mecanismo}») no deja huella en la máquina: un snapshot de hipervisor o una copia externa no los observa este control, y no se simulan.`
    );
  }

  const ventana = numero(fila.ventana_horas || '');

  if (ventana === undefined || ventana <= 0) {
    return sinMedir(`La ventana previa de P-08 («${fila.ventana_horas}») no es un número de horas utilizable.`);
  }

  const cambios = cambiosReales(context, ahora).cambios.filter(c => c.exacto);

  if (!cambios.length) {
    return latidoConfirma(context, 'EV-01', ahora)
      ? cumple('Ningún cambio de configuración ni de software en la ventana evaluada, con la detección de cambios confirmada: no había punto de reversión que exigir.')
      : sinMedir('No consta ningún cambio, pero la detección de cambios no está completa (ver EV-01): el silencio no acredita nada.');
  }

  const puntos = hechos(context, 'reversion_point_created')
    .filter(e => campo(e, 'mecanismo').toLowerCase() === mecanismo)
    .map(e => instante(campo(e, 'creado')))
    .filter((t): t is number => t !== undefined);

  const degradado = degradacion(context, 'EV-09');

  if (!puntos.length && degradado) {
    return sinMedir(`El recolector no ha podido observar puntos de reversión: ${degradado}. Hay ${cambios.length} cambio(s) sin punto de reversión demostrable.`);
  }

  const sinPunto = cambios
    .filter(c => !puntos.some(t => t <= c.desde && c.desde - t <= ventana * HORA))
    .map(c => c.texto);

  if (sinPunto.length) {
    return noCumple(`Cambios sin punto de reversión ${fila.mecanismo} en las ${ventana} h previas: ${lista(sinPunto)}.`);
  }

  return cumple(`Los ${cambios.length} cambios tenían un punto de reversión ${fila.mecanismo} en las ${ventana} h previas.`);
};

// --- decisiones ------------------------------------------------------------

type Requisito = {
  evidencias: string[];
  parametros: string[];
  tipo: ENSPolicyDecision['trace']['ruleType'];
  niveles: ENSLevel[];
};

const REQUISITOS: Record<string, Requisito> = {
  'op.exp.5.1': { evidencias: ['EV-01', 'EV-02'], parametros: ['P-01'], tipo: 'WHITELIST', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.2': { evidencias: ['EV-03'], parametros: ['P-01', 'P-02'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.3': { evidencias: ['EV-05'], parametros: ['P-05'], tipo: 'COVERAGE_REQUIRED', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.4': { evidencias: ['EV-04'], parametros: ['P-01', 'P-03', 'P-04'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.5': { evidencias: ['EV-06', 'EV-07'], parametros: ['P-06', 'P-09'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.r1.1': { evidencias: ['EV-07', 'EV-09'], parametros: ['P-08', 'P-09'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['ALTO'] },
  'op.exp.5.r1.2': { evidencias: ['EV-08'], parametros: ['P-07'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['ALTO'] },
  'op.exp.5.r1.3': { evidencias: ['EV-03'], parametros: ['P-01', 'P-02'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['ALTO'] },
};

const decide = (
  requisito: string,
  estado: Medida['estado'],
  evidencias: string[],
  parametros: string[],
  tipo: ENSPolicyDecision['trace']['ruleType'],
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
  const nivel = context.level;

  // Solo los requisitos que rigen en el nivel evaluado. En BAJO no rige
  // ninguno —op.exp.5 no aplica a la categoría BÁSICA— y sin decisiones el
  // motor los deja NO_APLICA. Además evita que el juicio de R1 (EV-03 con la
  // valoración de impacto) pinte la evidencia en un nivel en el que R1 no
  // rige: el puente lleva a la evidencia la peor decisión que la nombra.
  const vigentes = Object.entries(REQUISITOS).filter(([, r]) => r.niveles.includes(nivel));

  if (!vigentes.length) {
    return { decisions: [], runtimeVariables: [] };
  }

  const medidas: Record<string, Medida> = {
    'EV-01': ev01(context, ahora),
    'EV-02': ev02(context, ahora),
    'EV-03': ev03(context, ahora, nivel),
    'EV-04': ev04(context, ahora),
    'EV-05': ev05(context),
    'EV-06': ev06(context, ahora),
    'EV-07': ev07(context, ahora),
    'EV-08': ev08(context),
    'EV-09': ev09(context, ahora),
  };

  const decisions: ENSPolicyDecision[] = [];

  vigentes.forEach(([requisito, { evidencias, parametros, tipo }]) => {
    const propias = evidencias.map(id => ({ id, medida: medidas[id] }));
    const estado = peor(propias.map(p => p.medida));

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`
    // (`find` devuelve la primera). Nombra solo las evidencias que la
    // sostienen, para que el puente no pinte una evidencia sana con el color de
    // otra.
    const responsables = propias.filter(p => p.medida.estado === estado);

    decisions.push(
      decide(
        requisito,
        estado,
        responsables.map(p => p.id),
        parametros,
        tipo,
        requisito,
        propias.map(p => `${p.id} ${p.medida.estado}: ${p.medida.motivo}`).join(' | '),
        evidencias.map(id => `${id} CUMPLE`).join(' y ')
      )
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
          `${p.id} CUMPLE`
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

export const opExp5PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.exp.5.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.5.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-03'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.3',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.4',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03', 'P-04'],
      evidenceIds: ['EV-04'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.5',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06', 'P-09'],
      evidenceIds: ['EV-06', 'EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-07', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.r1.2',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-08'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.r1.3',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-03'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
