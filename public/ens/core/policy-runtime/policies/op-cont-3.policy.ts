// op.cont.3 · Pruebas periódicas
//
// Por qué este control tiene policy propia. Un solo requisito con dos
// obligaciones encadenadas (spec 2026-10-09 §6): PROBAR el plan de continuidad
// con periodicidad y CORREGIR lo que la prueba revela. Ninguna primitiva lo
// expresa, porque casi todo es un cruce:
//
//   1. ENTRE DOS REGISTROS de la organización, que el recolector del manager
//      solo lee: el de pruebas (`continuity-test-register.tsv`) y el de
//      deficiencias (`continuity-deficiency-register.tsv`), unidos por el
//      inicio de la prueba. Una deficiencia sigue viva «en la prueba
//      siguiente» si hay una prueba posterior a la suya.
//   2. ENTRE LO DECLARADO Y LO MEDIDO: cada fila del registro dice su ventana
//      real, sus sistemas y su resultado; el manager dice qué caídas y
//      arranques vio de esos sistemas en esa ventana (alerts.json, 503/504/
//      506) y qué restauraciones de mp.info.6 (106606). Los sistemas se cruzan
//      con los agentes por ID o por nombre exacto, como P-01 de op.mon.1.
//   3. CONTRA LA PANTALLA: la periodicidad (P-01), los tipos (P-02), los
//      escenarios (P-03) y los RTO (P-07).
//
// Qué decide el requisito (spec §6.3): EV-01, EV-02, EV-04 y EV-05.
//
//   EV-01  el registro existe y se lee; consta alguna prueba; P-02 prevé un
//          tipo que ejercita los medios alternativos (parcial o simulacro) y el
//          registro tiene alguna de ese alcance.
//   EV-02  la última prueba, la última de cada tipo de P-02 (su periodicidad o
//          P-01) y la de cada escenario de P-03 (P-01) dentro de plazo.
//   EV-04  en cada prueba parcial o simulacro del periodo de P-01: la caída más
//          larga de cada sistema contra su RTO de P-07, y las restauraciones de
//          la ventana. Declarada satisfactoria y medida fuera de objetivo es la
//          discrepancia que el control persigue.
//   EV-05  ninguna deficiencia abierta fuera de plazo ni viva tras la prueba
//          siguiente, y cada prueba del periodo con todas sus deficiencias
//          declaradas en seguimiento.
//
// EV-03, EV-06, EV-07 y EV-08 alimentan EV-04 y el informe: salen NO_APLICA
// como «dato del informe», con lo medido en el motivo, para que no se pinten
// en gris.
//
// LOS PLAZOS SE JUZGAN EN EL INSTANTE DE LA LECTURA del registro (el `ts` de su
// hecho), no al evaluar: el hecho puede tener hasta 26 h, y medir contra el
// reloj convertiría una pasada perdida del recolector en un plazo vencido.
//
// Invariantes, las de `evidence/judgment.ts`:
//   - el recolector emite instantes y recuentos, no edades ni veredictos;
//   - sin hecho, sin registro o sin parámetro, NO_EVALUABLE con motivo y causa;
//     nunca un CUMPLE por ausencia. Un registro VACÍO sí se juzga: no consta
//     ninguna prueba;
//   - lo que el recolector declara que no pudo medir sale con SU causa, y lo
//     que no pudo medir de UNA prueba viaja en la fila de esa prueba
//     (`medicion`), sin tapar lo medido de las demás;
//   - la policy nunca inventa política: ningún plazo, RTO o lista tiene valor
//     por defecto.
//
// Solo se emiten decisiones si el requisito aplica al nivel, que es el de la
// Disponibilidad (`levelDimension: 'D'`, `core/control-level.ts`): con D por
// debajo de ALTO el motor lo da todo por NO_APLICA.
import type {
  ENSPolicyContext,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSNormalizedEvent } from '../../data-source/types';
// Por la ruta del fichero, nunca por el barrel (TDZ de Settings).
import {
  HORA,
  DIA,
  MISMA_PASADA,
  cumple,
  noCumple,
  sinMedir,
  causaComun,
  peor,
  combina,
  campo,
  numero,
  instante,
  momento,
  lista,
  iso,
  sinTildes,
  vacio,
  iguales,
  parametro,
  etiqueta,
  filas,
  escalar,
  faltaParametro,
  lectorDeHechos,
  decisorDe,
} from './policy-kit';
import type { ENSTipoDeRegla, Medida } from './policy-kit';

const CONTROL = 'op.cont.3';
const POLICY = 'policy.op.cont.3';
const REQUISITO = 'op.cont.3.1';

// Los hechos de op.cont.3: todos de estado, reemitidos enteros cada 6 h. La
// frescura por defecto (26 h) tolera tres pasadas perdidas.
const { validos, estadoVigente, sinHechos } = lectorDeHechos(CONTROL, {
  recolector: 'el recolector de op.cont.3 del manager',
});

const decide = decisorDe(POLICY);

// Deben coincidir con la primera opción de P-04 y P-05.
const REGISTRO_PRUEBAS = 'Registro ENSFácil (/etc/ensfacil/continuity-test-register.tsv)';
const REGISTRO_DEFICIENCIAS = 'Registro ENSFácil (/etc/ensfacil/continuity-deficiency-register.tsv)';

// El vocabulario de la columna `tipo` (spec §6.2), y los que ejercitan de
// verdad los medios alternativos.
const TIPOS = ['revision_documental', 'escritorio', 'parcial', 'simulacro'];
const EJERCITAN = ['parcial', 'simulacro'];
const RESULTADOS = ['satisfactorio', 'parcial', 'fallido'];

// P-02 admite meses o el nombre de la periodicidad.
const PERIODICIDADES: Record<string, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  cuatrimestral: 4,
  semestral: 6,
  anual: 12,
  bienal: 24,
};

const esMedida = (x: unknown): x is Medida =>
  typeof x === 'object' && x !== null && typeof (x as Medida).estado === 'string';

// --- fechas -------------------------------------------------------------------

// `t` más `meses` meses de calendario, en UTC. El 31 de marzo más un mes es el
// 30 de abril, no el 1 de mayo.
const sumaMeses = (t: number, meses: number): number => {
  const d = new Date(t);
  const objetivo = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
  );
  const ultimoDia = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)).getUTCDate();

  objetivo.setUTCDate(Math.min(d.getUTCDate(), ultimoDia));

  return objetivo.getTime();
};

// Meses de calendario enteros entre `desde` y `hasta`.
const mesesEntre = (desde: number, hasta: number): number => {
  let k = 0;

  while (sumaMeses(desde, k + 1) <= hasta) {
    k += 1;
  }

  return k;
};

const fecha = (t: number): string => iso(t).slice(0, 10);

const duracion = (ms: number): string => {
  const minutos = Math.round(ms / 60000);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;

  return h ? `${h} h ${m} min` : `${m} min`;
};

// Un plazo es una FECHA: vence al acabar ese día (UTC).
const vencimiento = (texto: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return undefined;
  }

  const t = instante(texto);

  return t === undefined ? undefined : t + DIA;
};

const normaliza = (texto: string): string => sinTildes(texto).replace(/\s+/g, ' ').trim();

const listaDe = (texto: string): string[] =>
  vacio(texto) ? [] : texto.split(',').map(x => x.trim()).filter(Boolean);

// --- los registros --------------------------------------------------------------

interface Registro {
  t: number;
  fichero: string;
  filas: ENSNormalizedEvent[];
  // Las filas válidas que el recolector dice haber emitido en esa lectura.
  declaradas?: number;
  // Las que descartó por no seguir el formato; sin el dato, `undefined`: un
  // recuento que no llega no es un cero.
  invalidas?: number;
  lineas: string[];
}

// La lectura de un registro en la última pasada, y sus filas de ESA pasada.
// Va anclada al hecho de lectura y no a la última fila: con el registro
// vaciado, la última fila es de una pasada anterior y ya no describe nada.
const leeRegistro = (
  context: ENSPolicyContext,
  ahora: number,
  evidencia: string,
  tipoLectura: string,
  tipoFila: string,
  nombre: string,
  ruta: string
): Registro | Medida => {
  const { vigentes, ultimo } = estadoVigente(context, tipoLectura, ahora);
  const leido = vigentes[vigentes.length - 1];

  if (!leido) {
    return sinHechos(context, evidencia, ahora, ultimo, `lectura del registro de ${nombre}`);
  }

  const fichero = campo(leido, 'fichero') || ruta;

  if (campo(leido, 'presente') !== 'si') {
    return sinMedir(
      `No existe el registro de ${nombre} ${fichero} en el manager: un registro ausente no es un registro vacío, y sin él no hay contra qué juzgar. Créalo con la cabecera documentada (la plantilla está junto a él, en .example).`,
      'CONFIGURATION'
    );
  }

  if (campo(leido, 'legible') !== 'si') {
    return sinMedir(`El registro de ${nombre} ${fichero} existe pero el recolector no lo pudo leer.`, 'COLLECTION');
  }

  if (campo(leido, 'cabecera') !== 'ok') {
    return sinMedir(
      `La primera línea del registro de ${nombre} ${fichero} no es la cabecera documentada: no se interpreta un registro cuyas columnas no se conocen. Corrígela con la de la plantilla.`,
      'CONFIGURATION'
    );
  }

  const t = momento(leido);

  return {
    t,
    fichero,
    filas: validos(context, tipoFila, ahora).filter(e => momento(e) >= t - MISMA_PASADA && momento(e) <= t + HORA),
    declaradas: numero(campo(leido, 'filas')),
    invalidas: numero(campo(leido, 'filas_invalidas')),
    lineas: listaDe(campo(leido, 'lineas_invalidas')),
  };
};

// Las filas que el recolector descartó por no seguir el formato: con ellas el
// registro no se puede dar por completo. Se nombran por línea y columna.
const filasDescartadas = (reg: Registro, nombre: string): Medida | undefined =>
  reg.invalidas === undefined
    ? sinMedir(
        `La lectura del registro de ${nombre} ${reg.fichero} no dice cuántas filas descartó el recolector por no seguir el formato (filas_invalidas): no se puede comprobar que no haya ninguna, y una fila descartada puede ser justo la que falta.`,
        'COLLECTION'
      )
    : reg.invalidas
    ? sinMedir(
        `El registro de ${nombre} ${reg.fichero} tiene ${reg.invalidas} fila(s) descartadas por no seguir el formato (${
          reg.lineas.length ? `línea:columna ${lista(reg.lineas, 10)}` : 'ver los avisos del recolector'
        }): una fila ilegible puede ser justo la que falta, así que no se puede dar el registro por bueno. Corrígelas.`,
        'CONFIGURATION'
      )
    : undefined;

// Cada fila una vez, por su clave (`inicio` de la prueba, `deficiencia_id`): un
// hecho repetido en la misma pasada no cuenta doble. Se queda la ÚLTIMA (la más
// reciente; a igual instante, la que llegó después): es la que describe el
// registro tal como se leyó.
const unaPorClave = (filasLeidas: ENSNormalizedEvent[], clave: (e: ENSNormalizedEvent) => string): ENSNormalizedEvent[] => {
  const ultima = new Map<string, ENSNormalizedEvent>();

  [...filasLeidas].sort((a, b) => momento(a) - momento(b)).forEach(e => ultima.set(clave(e), e));

  return Array.from(ultima.values());
};

// Las filas que la lectura anunció y no han llegado (una línea perdida por
// logcollector, una alerta que el indexer rechazó): sin ellas el registro no
// está entero.
const filasPerdidas = (reg: Registro, recibidas: number, nombre: string): Medida | undefined =>
  reg.declaradas === undefined
    ? sinMedir(
        `La lectura del registro de ${nombre} ${reg.fichero} no dice cuántas filas válidas leyó el recolector (filas): no se puede comprobar que hayan llegado todas, y una fila perdida puede ser justo la que falta.`,
        'COLLECTION'
      )
    : recibidas < reg.declaradas
    ? sinMedir(
        `El recolector leyó ${reg.declaradas} fila(s) válidas en el registro de ${nombre} ${reg.fichero} y solo han llegado ${recibidas}: faltan ${reg.declaradas - recibidas}, y una fila perdida puede ser justo la que falta.`,
        'COLLECTION'
      )
    : undefined;

// Un hallazgo que se apoya en una AUSENCIA («nunca probado», «vencido»,
// «vacío», «declara N y sigue k») no se puede afirmar si al registro le faltan
// filas: la que falta puede ser la que lo desmiente. Pasa a NO_EVALUABLE con la
// causa del hueco. Lo que se apoya en algo PRESENTE (una deficiencia abierta
// fuera de plazo, una discrepancia medida) sigue mandando.
const porAusencia = (medida: Medida, incompleto: Medida | undefined): Medida =>
  medida.estado === 'NO_CUMPLE' && incompleto
    ? sinMedir(`${medida.motivo} No se puede afirmar: ${incompleto.motivo.charAt(0).toLowerCase()}${incompleto.motivo.slice(1)}`, incompleto.causa)
    : medida;

// P-04 o P-05: dónde se registra. Solo se sabe leer el registro propio.
const declaraRegistro = (
  context: ENSPolicyContext,
  id: string,
  opcion: string,
  que: string,
  ruta: string
): Medida | undefined => {
  const valor = parametro(context, id)?.value;
  const texto = valor === undefined || valor === null || Array.isArray(valor) ? '' : String(valor).trim();

  if (!texto) {
    return faltaParametro(context, id, `dónde se registran ${que}`);
  }

  if (texto !== opcion) {
    return sinMedir(
      `${etiqueta(context, id)} declara «${texto}» como registro de ${que}. ENSFácil solo lee su registro TSV del manager (${ruta}); la integración con esa herramienta no existe, así que no se puede demostrar.`,
      'CONFIGURATION'
    );
  }

  return undefined;
};

// --- las pruebas ------------------------------------------------------------------

interface Prueba {
  evento: ENSNormalizedEvent;
  linea: string;
  inicio: number;
  fin: number;
  tipo: string;
  escenario: string;
  sistemas: string[];
  resultado: string;
  deficiencias?: number;
  referencia: string;
  medicion: string;
  medidoHasta?: number;
  diasSinAlertas: string[];
  // Cuántos hechos de disponibilidad (111705) emitió el recolector para ella.
  candidatos?: number;
  // `agents_disconnection_time` del manager, en ms: cuánto antes de una 504
  // pudo empezar la caída.
  desconexion?: number;
}

const describe = (p: Prueba): string => `${p.tipo} del ${iso(p.inicio)}${vacio(p.escenario) ? '' : ` («${p.escenario}»)`}`;

// Las filas del registro de pruebas, una por `inicio`. El recolector ya validó
// el formato: una fila que aun así no se entiende es un fallo de RECOGIDA, y se
// nombra con la columna que falla.
const pruebasDe = (reg: Registro): { pruebas: Prueba[]; malas: string[]; inicioIlegibles: number[]; recibidas: number } => {
  const pruebas: Prueba[] = [];
  const malas: string[] = [];
  const inicioIlegibles: number[] = [];
  const unicas = unaPorClave(reg.filas, e => String(instante(campo(e, 'inicio')) ?? campo(e, 'inicio')));

  unicas.forEach(e => {
    const inicio = instante(campo(e, 'inicio'));
    const fin = instante(campo(e, 'fin'));
    const tipo = campo(e, 'tipo');
    const linea = campo(e, 'linea') || '?';
    const texto = campo(e, 'deficiencias');
    const mal = [
      inicio === undefined ? `inicio «${campo(e, 'inicio')}»` : '',
      fin === undefined || (inicio !== undefined && fin < inicio) ? `fin «${campo(e, 'fin')}»` : '',
      !TIPOS.includes(tipo) ? `tipo «${tipo}»` : '',
      !RESULTADOS.includes(campo(e, 'resultado')) ? `resultado «${campo(e, 'resultado')}»` : '',
      !/^\d+$/.test(texto) ? `deficiencias «${texto}»` : '',
    ].filter(Boolean);

    if (mal.length || inicio === undefined || fin === undefined) {
      malas.push(`línea ${linea} (${mal.join(', ')})`);

      if (inicio !== undefined) {
        inicioIlegibles.push(inicio);
      }

      return;
    }

    pruebas.push({
      evento: e,
      linea,
      inicio,
      fin,
      tipo,
      escenario: campo(e, 'escenario'),
      sistemas: listaDe(campo(e, 'sistemas')),
      resultado: campo(e, 'resultado'),
      deficiencias: Number(texto),
      referencia: campo(e, 'referencia'),
      medicion: campo(e, 'medicion'),
      medidoHasta: instante(campo(e, 'medido_hasta')),
      diasSinAlertas: listaDe(campo(e, 'dias_sin_alertas')),
      candidatos: /^\d+$/.test(campo(e, 'candidatos')) ? Number(campo(e, 'candidatos')) : undefined,
      desconexion: /^\d+$/.test(campo(e, 'agents_disconnection_time')) ? Number(campo(e, 'agents_disconnection_time')) * 1000 : undefined,
    });
  });

  return { pruebas: pruebas.sort((a, b) => a.inicio - b.inicio), malas, inicioIlegibles, recibidas: unicas.length };
};

const filasIlegibles = (malas: string[], nombre: string): Medida | undefined =>
  malas.length
    ? sinMedir(`El recolector ha emitido ${malas.length} fila(s) del registro de ${nombre} que no se pueden interpretar: ${lista(malas)}.`, 'COLLECTION')
    : undefined;

// Lo común a las evidencias del registro de pruebas: P-04, el registro y sus
// filas. Si algo falta, esa es la medida.
interface BasePruebas {
  reg: Registro;
  pruebas: Prueba[];
  // Hechas en el instante de la lectura (la ventana ya terminó).
  hechas: Prueba[];
  // Lo que no impide juzgar pero impide dar el registro por bueno.
  reparos: Medida[];
  // Lo mismo, en una medida: si existe, los hallazgos por ausencia no se
  // afirman (`porAusencia`).
  incompleto?: Medida;
  // El inicio de las filas que llegaron y no se pueden interpretar, y si
  // faltan filas que el recolector leyó: una deficiencia que apunta a una de
  // ellas no tiene su prueba por un fallo de RECOGIDA, no de configuración.
  inicioIlegibles: number[];
  faltanFilas: boolean;
}

const basePruebas = (context: ENSPolicyContext, ahora: number, evidencia: string): BasePruebas | Medida => {
  const p04 = declaraRegistro(context, 'P-04', REGISTRO_PRUEBAS, 'las pruebas', '/etc/ensfacil/continuity-test-register.tsv');

  if (p04) {
    return p04;
  }

  const reg = leeRegistro(
    context,
    ahora,
    evidencia,
    'continuity_test_register_read',
    'continuity_test_recorded',
    'pruebas',
    '/etc/ensfacil/continuity-test-register.tsv'
  );

  if (esMedida(reg)) {
    return reg;
  }

  const { pruebas, malas, inicioIlegibles, recibidas } = pruebasDe(reg);
  const perdidas = filasPerdidas(reg, recibidas, 'pruebas');
  const reparos = [filasDescartadas(reg, 'pruebas'), perdidas, filasIlegibles(malas, 'pruebas')].filter(
    (m): m is Medida => Boolean(m)
  );

  return {
    reg,
    pruebas,
    hechas: pruebas.filter(p => p.fin <= reg.t),
    reparos,
    ...(reparos.length ? { incompleto: combina(reparos) } : {}),
    inicioIlegibles,
    faltanFilas: Boolean(perdidas),
  };
};

// Las que aún no han terminado al leer el registro: no cuentan, pero se dicen.
const pendientes = (b: BasePruebas): string => {
  const despues = b.pruebas.filter(p => p.fin > b.reg.t);

  return despues.length
    ? ` No cuentan todavía, porque su ventana no había terminado al leer el registro: ${lista(despues.map(describe))}.`
    : '';
};

// --- P-01, P-02, P-03 y P-07 ----------------------------------------------------

type Meses = { meses: number } | Medida;

const periodicidadP01 = (context: ENSPolicyContext, para: string): Meses => {
  const n = escalar(context, 'P-01');

  if (n === undefined) {
    return faltaParametro(context, 'P-01', para);
  }

  if (!Number.isInteger(n)) {
    return sinMedir(`${etiqueta(context, 'P-01')} vale ${n}: tiene que ser un número entero de meses.`, 'CONFIGURATION');
  }

  return { meses: n };
};

interface TipoPrevisto {
  tipo: string;
  meses?: number;
}

// P-02, con gramática estricta: el tipo, del vocabulario; la periodicidad,
// vacía (vale P-01), un número de meses o su nombre. Cualquier otra cosa se
// rechaza nombrando la fila, en vez de adivinarse.
const tiposP02 = (context: ENSPolicyContext, para: string): { tipos: TipoPrevisto[]; reparo?: Medida } | Medida => {
  const declaradas = filas(context, 'P-02');

  if (!declaradas) {
    return faltaParametro(context, 'P-02', para);
  }

  const tipos: TipoPrevisto[] = [];
  const mal: string[] = [];

  declaradas.forEach(f => {
    const tipo = (f.tipo || '').trim();
    const texto = (f.periodicidad_meses || '').trim();

    if (!TIPOS.includes(tipo)) {
      mal.push(`«${f.tipo}» no es un tipo (${TIPOS.join(', ')})`);

      return;
    }

    if (vacio(texto)) {
      tipos.push({ tipo });

      return;
    }

    const palabra = PERIODICIDADES[normaliza(texto)];
    const meses = /^\d+$/.test(texto) && Number(texto) > 0 ? Number(texto) : palabra;

    if (meses === undefined) {
      mal.push(`fila «${tipo}»: periodicidad «${texto}» (admite meses o ${Object.keys(PERIODICIDADES).join(', ')})`);

      return;
    }

    tipos.push({ tipo, meses });
  });

  return {
    tipos,
    ...(mal.length
      ? { reparo: sinMedir(`${etiqueta(context, 'P-02')} tiene filas que no se pueden leer: ${lista(mal)}.`, 'CONFIGURATION') }
      : {}),
  };
};

interface Rto {
  sistema: string;
  limite: number;
  texto: string;
}

// P-07: el RTO en horas (decimales con coma o punto) y la tolerancia en
// minutos (vacía, 0). `*` es el de los sistemas sin fila propia.
const rtosP07 = (context: ENSPolicyContext): { rtos: Rto[]; reparo?: Medida } | Medida => {
  const declaradas = filas(context, 'P-07');

  if (!declaradas) {
    return faltaParametro(context, 'P-07', 'la indisponibilidad medida de cada sistema en las pruebas (su RTO)');
  }

  const rtos: Rto[] = [];
  const mal: string[] = [];

  declaradas.forEach(f => {
    const rto = numero(f.rto_horas || '');
    const tol = vacio((f.tolerancia_minutos || '').trim()) ? 0 : /^\d+$/.test(f.tolerancia_minutos.trim()) ? Number(f.tolerancia_minutos.trim()) : undefined;

    if (!f.sistema || rto === undefined || rto <= 0 || tol === undefined) {
      mal.push(`fila «${f.sistema || '(sin sistema)'}»: RTO «${f.rto_horas || ''}», tolerancia «${f.tolerancia_minutos || ''}»`);

      return;
    }

    rtos.push({
      sistema: f.sistema.trim(),
      limite: rto * HORA + tol * 60000,
      texto: `RTO ${String(rto).replace('.', ',')} h${tol ? ` + ${tol} min` : ''}`,
    });
  });

  return {
    rtos,
    ...(mal.length
      ? { reparo: sinMedir(`${etiqueta(context, 'P-07')} tiene filas que no se pueden leer (RTO en horas mayor que 0, tolerancia en minutos enteros): ${lista(mal)}.`, 'CONFIGURATION') }
      : {}),
  };
};

// --- EV-01 · el histórico de pruebas -------------------------------------------

const ev01 = (context: ENSPolicyContext, ahora: number): Medida => {
  const b = basePruebas(context, ahora, 'EV-01');

  if (esMedida(b)) {
    return b;
  }

  const partes: Medida[] = [...b.reparos];

  if (!b.hechas.length) {
    partes.push(
      porAusencia(
        noCumple(
          `El registro de pruebas ${b.reg.fichero} está leído (${iso(b.reg.t)}) y no consta ninguna prueba realizada del plan de continuidad: el control queda sin cumplimiento acreditable.${pendientes(b)}`
        ),
        b.incompleto
      )
    );

    return combina(partes);
  }

  const porTipo = TIPOS.map(t => `${b.hechas.filter(p => p.tipo === t).length} ${t}`).join(', ');
  const ultima = b.hechas[b.hechas.length - 1];
  const reales = b.hechas.filter(p => EJERCITAN.includes(p.tipo));
  const previstos = tiposP02(context, 'si las modalidades previstas ejercitan los medios alternativos');

  if (esMedida(previstos)) {
    partes.push(previstos);
  } else {
    if (previstos.reparo) {
      partes.push(previstos.reparo);
    }

    if (!previstos.tipos.some(t => EJERCITAN.includes(t.tipo))) {
      partes.push(
        noCumple(
          `${etiqueta(context, 'P-02')} solo prevé ${previstos.tipos.map(t => t.tipo).join(', ') || 'nada legible'}: ninguna modalidad (parcial o simulacro) ejercita los medios alternativos, y una revisión de escritorio no demuestra que funcionen.`
        )
      );
    }

  }

  if (!reales.length) {
    partes.push(
      porAusencia(
        noCumple(
          `Las ${b.hechas.length} pruebas registradas son solo revisiones documentales o de escritorio (${porTipo}): ninguna ejercita realmente los medios alternativos (parcial o simulacro).`
        ),
        b.incompleto
      )
    );
  } else {
    partes.push(
      cumple(
        `${b.hechas.length} prueba(s) registrada(s) (${porTipo}); la última, ${describe(ultima)}, resultado declarado ${ultima.resultado || '-'}. La última que ejercita los medios alternativos: ${describe(reales[reales.length - 1])}.${pendientes(b)}`
      )
    );
  }

  return combina(partes);
};

// --- EV-02 · la periodicidad ------------------------------------------------------

const ultimaDe = (pruebas: Prueba[], filtro: (p: Prueba) => boolean): Prueba | undefined =>
  pruebas.filter(filtro).slice(-1)[0];

const ev02 = (context: ENSPolicyContext, ahora: number): Medida => {
  const b = basePruebas(context, ahora, 'EV-02');

  if (esMedida(b)) {
    return b;
  }

  const partes: Medida[] = [...b.reparos];
  const p01 = periodicidadP01(context, 'cada cuánto hay que probar el plan');
  const t = b.reg.t;

  if (esMedida(p01)) {
    partes.push(p01);

    return combina(partes);
  }

  if (!b.hechas.length) {
    partes.push(porAusencia(noCumple(`No consta ninguna prueba realizada en el registro: la periodicidad de ${p01.meses} meses (P-01) no se cumple.`), b.incompleto));

    return combina(partes);
  }

  const fuera: string[] = [];
  const bien: string[] = [];
  const vencimientos: number[] = [];

  // `que`: lo que se mide; `p`: su última prueba; `meses`: su periodicidad.
  const mira = (que: string, p: Prueba | undefined, meses: number, deDonde: string): void => {
    if (!p) {
      fuera.push(`${que}: nunca se ha probado`);

      return;
    }

    const vence = sumaMeses(p.inicio, meses);

    if (t > vence) {
      fuera.push(`${que}: la última es del ${fecha(p.inicio)}, hace ${mesesEntre(p.inicio, t)} meses (${deDonde} = ${meses})`);
    } else {
      bien.push(`${que} ${fecha(p.inicio)}`);
      vencimientos.push(vence);
    }
  };

  mira('el plan', b.hechas[b.hechas.length - 1], p01.meses, 'P-01');

  const previstos = tiposP02(context, 'la periodicidad de cada tipo de prueba');

  if (esMedida(previstos)) {
    partes.push(previstos);
  } else {
    if (previstos.reparo) {
      partes.push(previstos.reparo);
    }

    previstos.tipos.forEach(tp =>
      mira(`tipo ${tp.tipo}`, ultimaDe(b.hechas, p => p.tipo === tp.tipo), tp.meses ?? p01.meses, tp.meses ? 'P-02' : 'P-01')
    );
  }

  const escenarios = filas(context, 'P-03');

  if (!escenarios) {
    partes.push(faltaParametro(context, 'P-03', 'qué escenarios de interrupción hay que probar'));
  } else {
    escenarios.forEach(f =>
      mira(`escenario «${f.escenario}»`, ultimaDe(b.hechas, p => normaliza(p.escenario) === normaliza(f.escenario)), p01.meses, 'P-01')
    );
  }

  if (fuera.length) {
    // «Nunca» y «vencido» son ausencias: una fila perdida puede ser la prueba
    // que falta.
    partes.push(porAusencia(noCumple(`Pruebas fuera de periodicidad a ${fecha(t)}, cuando se leyó el registro: ${lista(fuera, 8)}.`), b.incompleto));
  } else {
    const proximo = Math.min(...vencimientos);

    partes.push(
      cumple(
        `A ${fecha(t)}, cuando se leyó el registro, todo está dentro de periodicidad: ${lista(bien, 8)}. El próximo vencimiento es el ${fecha(proximo)}.`
      )
    );
  }

  return combina(partes);
};

// --- EV-03, EV-04 y EV-08 · lo medido en cada prueba ---------------------------

const idDeAgente = (texto: string): string | undefined =>
  /^\d+$/.test(texto.trim()) ? texto.trim().padStart(3, '0') : undefined;

// El ID del agente de un hecho, normalizado igual que el del registro: un
// recolector que emita «24» en vez de «024» no deja al sistema sin agente.
const idDelHecho = (e: ENSNormalizedEvent): string => idDeAgente(campo(e, 'agente_id')) || campo(e, 'agente_id');

type Resolucion =
  | { tipo: 'unico'; hecho: ENSNormalizedEvent }
  | { tipo: 'ninguno' }
  | { tipo: 'ambiguo'; ids: string[] };

// Un sistema del registro es el NOMBRE o el ID de su agente: primero por ID
// (24 es el agente 024), después por nombre EXACTO sin distinguir mayúsculas.
// Nunca por parecido. Si el nombre casa con dos agentes, no se elige.
const resuelve = (sistema: string, deAgentes: ENSNormalizedEvent[]): Resolucion => {
  const id = idDeAgente(sistema);

  if (id) {
    const porId = deAgentes.find(e => idDelHecho(e) === id);

    if (porId) {
      return { tipo: 'unico', hecho: porId };
    }
  }

  const porNombre = deAgentes.filter(e => iguales(campo(e, 'agente'), sistema));
  const ids = Array.from(new Set(porNombre.map(idDelHecho)));

  if (ids.length === 1) {
    return { tipo: 'unico', hecho: porNombre[0] };
  }

  return ids.length > 1 ? { tipo: 'ambiguo', ids } : { tipo: 'ninguno' };
};

const nombreDe = (sistema: string, e: ENSNormalizedEvent): string => {
  const id = idDelHecho(e);
  const agente = campo(e, 'agente');

  return iguales(agente, sistema) ? `${sistema} (${id})` : `${sistema} (${agente}, ${id})`;
};

const CAIDAS = ['parada', 'desconexion'];
const VUELTAS = ['arranque', 'actividad'];

type Item = { tipo: string; t: number };

// La cronología `tipo@instante,...` de un hecho. `undefined` si no se entiende.
const cronologia = (texto: string): Item[] | undefined => {
  const items: Item[] = [];

  for (const parte of listaDe(texto)) {
    const m = /^([a-z]+)@(.+)$/.exec(parte);
    const t = m ? instante(m[2]) : undefined;

    if (!m || t === undefined || ![...CAIDAS, ...VUELTAS].includes(m[1])) {
      return undefined;
    }

    items.push({ tipo: m[1], t });
  }

  return items.sort((a, b) => a.t - b.t);
};

// Una caída, como INTERVALO: lo que se sabe de cuándo empezó y de cuándo
// volvió el sistema.
//
//   - Una parada (506) la fecha exacta. Una desconexión (504) la emite el
//     manager `agents_disconnection_time` después del último keepalive: la
//     caída empezó entre ese instante menos ese tiempo y el de la 504. Sin el
//     tiempo, el principio más temprano no se sabe.
//   - Un arranque (503) fecha exacta la vuelta. La primera alerta propia del
//     agente (`actividad`) solo dice que ya había vuelto: es una cota superior,
//     y la vuelta pudo ser en cualquier momento desde la caída.
//   - Sin vuelta observada hasta el final de lo medido, la caída queda abierta:
//     el agente pudo volver sin decir nada (un servidor tranquilo no alerta).
interface Tramo {
  desdeMin?: number;
  desdeMax: number;
  hastaMin: number;
  hastaMax?: number;
  cierre: 'arranque' | 'actividad' | 'abierta';
  inicial: string;
}

const minimaDe = (x: Tramo): number => Math.max(0, x.hastaMin - x.desdeMax);

const maximaDe = (x: Tramo): number | undefined =>
  x.desdeMin === undefined || x.hastaMax === undefined ? undefined : x.hastaMax - x.desdeMin;

const CIERRE: Record<Tramo['cierre'], string> = {
  arranque: 'restablecido (arranque)',
  actividad: 'de vuelta antes de su primera alerta propia',
  abierta: 'sin vuelta observada',
};

const describeTramo = (x: Tramo): string => {
  const min = minimaDe(x);
  const max = maximaDe(x);
  const cuanto = max === undefined ? `al menos ${duracion(min)}` : min === max ? duracion(min) : `entre ${duracion(min)} y ${duracion(max)}`;

  return `${x.inicial} ${iso(x.desdeMax)}: ${cuanto}, ${CIERRE[x.cierre]}`;
};

interface Sistema {
  nombre: string;
  // Con agente y cronología legible: hay medida, concluyente o no.
  medido: boolean;
  // No es un agente de Wazuh: se dice, y solo bloquea si ningún sistema de la
  // prueba está medido.
  noAgente?: boolean;
  // Sin medida concluyente: la causa y el motivo.
  hueco?: Medida;
  tramos: Tramo[];
  rto?: Rto;
  // true: la cota INFERIOR de una caída cerrada por un arranque supera el RTO;
  // false: la cota SUPERIOR de todas cabe en él. Sin valor: no se sabe.
  excede?: boolean;
  // La caída que lo prueba, si excede.
  culpable?: Tramo;
  texto: string;
}

interface Analisis {
  prueba: Prueba;
  sistemas: Sistema[];
  restauraciones: ENSNormalizedEvent[];
  fallidas: ENSNormalizedEvent[];
  cambios: ENSNormalizedEvent[];
  // Lo que impide concluir sobre la prueba entera: la medición incompleta o
  // pendiente, o hechos de disponibilidad perdidos por el camino.
  huecos: Medida[];
}

// Lo medido de UNA prueba en la misma pasada que su fila: por su inicio Y su
// fin, para que una fila editada no herede la medida de la ventana anterior.
const delMismoPaso = (context: ENSPolicyContext, ahora: number, tipo: string, t: number, prueba: Prueba): ENSNormalizedEvent[] =>
  validos(context, tipo, ahora).filter(
    e =>
      momento(e) >= t - MISMA_PASADA &&
      momento(e) <= t + HORA &&
      instante(campo(e, 'prueba_inicio')) === prueba.inicio &&
      instante(campo(e, 'prueba_fin')) === prueba.fin
  );

const rtoDe = (rtos: Rto[], sistema: string, hecho: ENSNormalizedEvent): Rto | undefined =>
  rtos.find(r => r.sistema !== '*' && (iguales(r.sistema, sistema) || (idDeAgente(r.sistema) && idDeAgente(r.sistema) === idDelHecho(hecho)) || iguales(r.sistema, campo(hecho, 'agente')))) ||
  rtos.find(r => r.sistema === '*');

const MEDICION: Record<string, string> = {
  parcial: 'faltan alertas de algunos días de su rango en el manager',
  sin_alertas: 'las alertas de los días de su rango ya no están en el manager',
  error: 'el recolector no pudo leer las alertas de su rango',
  no_aplica: 'el recolector no la midió',
};

// ¿Es de alguno de los sistemas de la prueba? Por ID o por nombre exacto.
const deLaPrueba = (e: ENSNormalizedEvent, prueba: Prueba): boolean =>
  prueba.sistemas.some(s => (idDeAgente(s) !== undefined && idDeAgente(s) === idDelHecho(e)) || iguales(s, campo(e, 'agente')));

// Los tramos de caída de una cronología, y las vueltas sin caída previa
// observada (desde el inicio de la prueba).
const tramosDe = (items: Item[], prueba: Prueba, hasta: number): { tramos: Tramo[]; huerfanas: Item[] } => {
  const tramos: Tramo[] = [];
  const huerfanas: Item[] = [];
  let abierto: { desdeMin?: number; desdeMax: number; t: number; tipo: string } | undefined;

  items.forEach(item => {
    if (CAIDAS.includes(item.tipo)) {
      if (!abierto) {
        abierto = {
          desdeMin: item.tipo === 'parada' ? item.t : prueba.desconexion === undefined ? undefined : item.t - prueba.desconexion,
          desdeMax: item.t,
          t: item.t,
          tipo: item.tipo,
        };
      }
    } else if (abierto) {
      tramos.push({
        desdeMin: abierto.desdeMin,
        desdeMax: abierto.desdeMax,
        hastaMin: item.tipo === 'arranque' ? item.t : abierto.t,
        hastaMax: item.t,
        cierre: item.tipo as Tramo['cierre'],
        inicial: abierto.tipo,
      });
      abierto = undefined;
    } else if (item.t >= prueba.inicio && item.t <= hasta) {
      huerfanas.push(item);
    }
  });

  if (abierto) {
    tramos.push({ desdeMin: abierto.desdeMin, desdeMax: abierto.desdeMax, hastaMin: Math.max(hasta, abierto.t), cierre: 'abierta', inicial: abierto.tipo });
  }

  return { tramos, huerfanas };
};

const analiza = (context: ENSPolicyContext, ahora: number, t: number, prueba: Prueba, rtos: Rto[] | undefined): Analisis => {
  const disponibilidad = unaPorClave(delMismoPaso(context, ahora, 'availability_event_observed', t, prueba), idDelHecho);
  const restauraciones = delMismoPaso(context, ahora, 'backup_restore_observed', t, prueba);
  const cambios = delMismoPaso(context, ahora, 'post_test_change_observed', t, prueba);
  // Solo un fallo EXPLÍCITO, y solo si es de la prueba: en su ventana, o de uno
  // de sus sistemas.
  const fallidas = restauraciones.filter(e => {
    const cuando = instante(campo(e, 'instante')) ?? momento(e);

    return (
      (campo(e, 'resultado') === 'error' || campo(e, 'coincide') === 'no') &&
      ((cuando >= prueba.inicio && cuando <= prueba.fin) || deLaPrueba(e, prueba))
    );
  });
  const hasta = prueba.medidoHasta ?? prueba.fin;
  const completa = prueba.medicion === 'completa';
  // Leídos todos los días de lo medido hasta ahora (completa o aún abierta).
  const todosLosDias = (completa || prueba.medicion === 'pendiente') && !prueba.diasSinAlertas.length;
  const huecos: Medida[] = [];

  if (prueba.medicion === 'pendiente') {
    huecos.push(sinMedir(`La medición de la prueba ${describe(prueba)} sigue abierta hasta las 24 h siguientes a su fin (leída hasta ${iso(hasta)}): todavía no es concluyente.`));
  } else if (completa && prueba.diasSinAlertas.length) {
    // Contradictoria: «completa», pero con días sin alertas leídas. Una caída
    // de esos días no se habría visto, así que no puede salir CUMPLE.
    huecos.push(
      sinMedir(
        `La medición de la prueba ${describe(prueba)} se declara completa, pero hay días sin alertas leídas (${prueba.diasSinAlertas.join(', ')}): una caída de esos días no se habría visto.`,
        'COLLECTION'
      )
    );
  } else if (!completa) {
    huecos.push(
      sinMedir(
        `La medición de la prueba ${describe(prueba)} está incompleta (${prueba.medicion || 'sin dato'}: ${MEDICION[prueba.medicion] || 'estado desconocido'}${
          prueba.diasSinAlertas.length ? `; días sin alertas: ${prueba.diasSinAlertas.join(', ')}` : ''
        }).`,
        'COLLECTION'
      )
    );
  }

  // Un sistema sin hecho es «no es un agente» solo si llegaron todos los
  // candidatos que el recolector dice haber emitido.
  const perdidos = prueba.candidatos === undefined ? undefined : Math.max(0, prueba.candidatos - disponibilidad.length);

  if (perdidos === undefined) {
    huecos.push(sinMedir(`La fila de la prueba ${describe(prueba)} no dice cuántos agentes candidatos midió el recolector (candidatos): no se distingue un hecho perdido de un sistema que no es agente.`, 'COLLECTION'));
  } else if (perdidos > 0) {
    huecos.push(
      sinMedir(
        `De los ${prueba.candidatos} hechos de disponibilidad que el recolector emitió para la prueba ${describe(prueba)} solo han llegado ${disponibilidad.length}: faltan ${perdidos}.`,
        'COLLECTION'
      )
    );
  }

  const sistemas: Sistema[] = prueba.sistemas.map(sistema => {
    const r = resuelve(sistema, disponibilidad);
    const sinMedida: Sistema = { nombre: sistema, medido: false, tramos: [], texto: '' };

    if (r.tipo === 'ambiguo') {
      return {
        ...sinMedida,
        hueco: sinMedir(`«${sistema}» casa con ${r.ids.length} agentes (${r.ids.join(', ')}): no se elige uno. Decláralo por su ID en el registro.`, 'CONFIGURATION'),
        texto: `${sistema}: ambiguo`,
      };
    }

    if (r.tipo === 'ninguno') {
      return {
        ...sinMedida,
        noAgente: true,
        hueco: sinMedir(`«${sistema}» no es un agente de Wazuh en el manager: su disponibilidad durante la prueba no se puede medir.`),
        texto: `${sistema}: no es un agente de Wazuh, sin medida`,
      };
    }

    const e = r.hecho;
    const nombre = nombreDe(sistema, e);
    const items = cronologia(campo(e, 'eventos'));
    const total = numero(campo(e, 'eventos_total'));
    const propias = numero(campo(e, 'alertas_propias'));

    if (!items) {
      return { ...sinMedida, nombre, hueco: sinMedir(`${nombre}: el recolector emitió una cronología que no se puede leer («${campo(e, 'eventos')}»).`, 'COLLECTION'), texto: `${nombre}: cronología ilegible` };
    }

    const { tramos: todos, huerfanas } = tramosDe(items, prueba, hasta);
    // Seguro de la prueba: empezó a más tardar en su fin y seguía caído en su
    // inicio. Posible: pudo empezar en su ventana o seguir caído en ella.
    const seguros = todos.filter(x => x.desdeMax <= prueba.fin && x.hastaMin >= prueba.inicio);
    const posibles = todos.filter(x => (x.desdeMin ?? -Infinity) <= prueba.fin && (x.hastaMax ?? Infinity) >= prueba.inicio);
    const rto = rtos ? rtoDe(rtos, sistema, e) : undefined;
    // Sin `eventos_total` no se sabe si la cronología llegó entera: no se da
    // por entera.
    const sinTotal = total === undefined;
    const truncada = sinTotal || (total as number) > items.length;
    const texto = `${nombre}: ${
      posibles.length ? `${posibles.length} caída(s): ${posibles.map(describeTramo).join('; ')}` : `sin caídas observadas${propias !== undefined ? ` (${propias} alertas propias en el rango)` : ''}`
    }${rto ? ` (${rto.texto})` : ''}`;
    const base: Sistema = { nombre, medido: true, tramos: posibles, rto, texto };

    if (!rtos) {
      return base;
    }

    if (!rto) {
      return { ...base, hueco: sinMedir(`${etiqueta(context, 'P-07')} no declara el RTO de «${sistema}» ni uno general (*): no hay contra qué juzgar su indisponibilidad.`, 'CONFIGURATION') };
    }

    // NO_CUMPLE solo con la cota INFERIOR de una caída cerrada por un
    // arranque, con todos los días leídos y la cronología entera: un día que
    // falta podría partir una caída larga en dos cortas.
    const culpable = seguros
      .filter(x => x.cierre === 'arranque' && minimaDe(x) > rto.limite)
      .sort((a, b) => minimaDe(b) - minimaDe(a))[0];

    if (culpable && todosLosDias && !truncada) {
      return { ...base, excede: true, culpable };
    }

    if (huerfanas.length) {
      return {
        ...base,
        hueco: sinMedir(
          `${nombre}: volvió (${huerfanas.map(x => `${x.tipo} ${iso(x.t)}`).join(', ')}) sin ninguna caída observada antes: no se sabe cuándo empezó a no estar disponible.`
        ),
      };
    }

    if (truncada) {
      return {
        ...base,
        hueco: sinMedir(
          sinTotal
            ? `${nombre}: la fila no dice cuántos eventos tiene su cronología (eventos_total): no se puede afirmar que llegó entera ni que no hubo una caída más larga.`
            : `${nombre}: la cronología llegó truncada (${items.length} de ${total} eventos): no se puede afirmar que no hubo una caída más larga.`,
          'COLLECTION'
        ),
      };
    }

    if (!completa) {
      // Lo dice el hueco de la prueba.
      return base;
    }

    if (!posibles.length) {
      if (propias === undefined) {
        return { ...base, hueco: sinMedir(`${nombre}: el recolector no dice cuántas alertas propias envió en el rango (alertas_propias).`, 'COLLECTION') };
      }

      if (propias === 0) {
        return {
          ...base,
          hueco: sinMedir(`${nombre}: sin caídas observadas, pero tampoco envió ninguna alerta propia en todo el rango medido: no se puede afirmar que estuviera en marcha.`),
        };
      }

      return { ...base, excede: false };
    }

    const maximas = posibles.map(maximaDe);

    if (maximas.some(x => x === undefined)) {
      const abierta = posibles.find(x => x.cierre === 'abierta');

      return {
        ...base,
        hueco: abierta
          ? sinMedir(`${nombre}: no se observó su vuelta (ni un arranque ni ninguna alerta propia) hasta ${iso(hasta)}: no se puede afirmar ni negar que se restableciera dentro de su ${rto.texto}.`)
          : sinMedir(
              `${nombre}: la fila de la prueba no trae agents_disconnection_time del manager, así que no se sabe cuánto antes de la desconexión (504) empezó la caída.`,
              'COLLECTION'
            ),
      };
    }

    const peorCaso = Math.max(...(maximas as number[]));

    if (peorCaso <= rto.limite) {
      return { ...base, excede: false };
    }

    return {
      ...base,
      hueco: sinMedir(`${nombre}: su caída más larga duró entre ${duracion(Math.max(...posibles.map(minimaDe)))} y ${duracion(peorCaso)}, y su ${rto.texto} cae dentro: no se puede afirmar ni negar.`),
    };
  });

  return { prueba, sistemas, restauraciones, fallidas, cambios, huecos };
};

const describeRestauracion = (e: ENSNormalizedEvent): string =>
  `${campo(e, 'agente') || '-'} (${idDelHecho(e) || '-'}) ${campo(e, 'instante') || iso(momento(e))}: ${campo(e, 'resultado') || '-'}${campo(e, 'coincide') === 'no' ? ', el contenido no coincide' : ''}`;

// Lo que la prueba reveló según la medida: un RTO superado o una restauración
// fallida. EV-05 exige que conste como deficiencia.
const revelo = (a: Analisis): string[] => [
  ...a.sistemas.filter(s => s.excede === true).map(s => `${s.nombre} por encima de su ${s.rto?.texto}`),
  ...a.fallidas.map(e => `restauración fallida en ${describeRestauracion(e)}`),
];

// El juicio de UNA prueba: lo declarado frente a lo medido.
const juzgaPrueba = (a: Analisis): Medida => {
  const p = a.prueba;
  const titulo = `Prueba ${describe(p)}, declarada ${p.resultado || '-'}`;
  const excedidos = a.sistemas.filter(s => s.excede === true);
  const satisfactoria = p.resultado === 'satisfactorio';
  const medido = a.sistemas.map(s => s.texto).join('; ');
  const partes: Medida[] = [];

  if (satisfactoria && excedidos.length) {
    partes.push(
      noCumple(
        `${titulo}, y la medida la desmiente: ${excedidos
          .map(s => {
            const x = s.culpable as Tramo;
            const exacta = maximaDe(x) === minimaDe(x);

            return `${s.nombre} estuvo ${exacta ? '' : 'al menos '}${duracion(minimaDe(x))} sin servicio (${x.inicial} ${iso(x.desdeMax)} → arranque ${iso(x.hastaMin)}), por encima de su ${s.rto?.texto}`;
          })
          .join('; ')}.`
      )
    );
  }

  if (satisfactoria && a.fallidas.length) {
    partes.push(noCumple(`${titulo}, y en su ventana falló la restauración de copias: ${lista(a.fallidas.map(describeRestauracion))}.`));
  }

  if (partes.length) {
    // Una discrepancia medida manda sobre lo que no se pudo medir.
    return combina(partes);
  }

  partes.push(...a.huecos);

  // Los sistemas que no son agentes se dicen; solo bloquean si ninguno de la
  // prueba está medido.
  const medidos = a.sistemas.filter(s => s.medido);
  const noAgentes = a.sistemas.filter(s => s.noAgente);

  a.sistemas.filter(s => s.hueco && !s.noAgente).forEach(s => partes.push(s.hueco as Medida));

  if (!medidos.length && noAgentes.length) {
    partes.push(sinMedir(`${titulo}: ninguno de sus sistemas (${lista(noAgentes.map(s => s.nombre))}) es un agente de Wazuh, así que su resultado no se puede contrastar con lo medido.`));
  }

  if (partes.length) {
    return combina(partes);
  }

  const aparte = noAgentes.length && medidos.length ? ` Sin medida, porque no son agentes de Wazuh: ${lista(noAgentes.map(s => s.nombre))}.` : '';

  return cumple(
    `${
      satisfactoria
        ? `${titulo}, y lo medido lo confirma: ${medido}.`
        : excedidos.length || a.fallidas.length
        ? `${titulo}, y lo medido es coherente con lo declarado: ${medido}${a.fallidas.length ? `; restauraciones fallidas: ${lista(a.fallidas.map(describeRestauracion))}` : ''}. Lo que la prueba reveló se juzga en EV-05.`
        : `${titulo}; lo medido no muestra ningún objetivo incumplido: ${medido}.`
    }${aparte}`
  );
};

// Las pruebas cuyo resultado se contrasta: las parciales y simulacros que
// terminaron en el periodo de P-01 antes de la lectura; sin ninguna en el
// periodo, la última (la periodicidad la juzga EV-02). Sin P-01, la última.
const delPeriodo = (b: BasePruebas, meses: number | undefined): Prueba[] => {
  const reales = b.hechas.filter(p => EJERCITAN.includes(p.tipo));

  if (meses !== undefined) {
    const desde = sumaMeses(b.reg.t, -meses);
    const enPeriodo = reales.filter(p => p.inicio >= desde);

    if (enPeriodo.length) {
      return enPeriodo;
    }
  }

  return reales.slice(-1);
};

interface Medidas {
  base: BasePruebas | Medida;
  analisis: Analisis[];
  sinSistemas: Prueba[];
  rtos?: Rto[];
  reparoRto?: Medida;
  faltaRto?: Medida;
}

const medidas = (context: ENSPolicyContext, ahora: number, evidencia: string): Medidas => {
  const base = basePruebas(context, ahora, evidencia);

  if (esMedida(base)) {
    return { base, analisis: [], sinSistemas: [] };
  }

  const p01 = escalar(context, 'P-01');
  const juzgadas = delPeriodo(base, p01 !== undefined && Number.isInteger(p01) ? p01 : undefined);
  const p07 = rtosP07(context);
  const rtos = esMedida(p07) ? undefined : p07.rtos;

  return {
    base,
    analisis: juzgadas.filter(p => p.sistemas.length).map(p => analiza(context, ahora, base.reg.t, p, rtos)),
    sinSistemas: juzgadas.filter(p => !p.sistemas.length),
    rtos,
    reparoRto: esMedida(p07) ? undefined : p07.reparo,
    faltaRto: esMedida(p07) ? p07 : undefined,
  };
};

const ev04 = (context: ENSPolicyContext, ahora: number, m: Medidas): Medida => {
  if (esMedida(m.base)) {
    return m.base;
  }

  const partes: Medida[] = [...m.base.reparos];

  if (m.faltaRto) {
    partes.push(m.faltaRto);
  }

  if (m.reparoRto) {
    partes.push(m.reparoRto);
  }

  if (!m.analisis.length && !m.sinSistemas.length) {
    partes.push(sinMedir('No consta ninguna prueba parcial ni simulacro realizado: no hay ningún resultado que contrastar con lo medido (lo juzga EV-01).'));

    return combina(partes);
  }

  m.analisis.forEach(a => partes.push(juzgaPrueba(a)));

  // Una prueba que ejercita los medios alternativos sin declarar sistemas no
  // se escapa del contraste: no se puede demostrar su resultado.
  m.sinSistemas.forEach(p =>
    partes.push(sinMedir(`La prueba ${describe(p)}, declarada ${p.resultado || '-'}, no declara ningún sistema: su resultado no se puede contrastar con lo que pasó en los sistemas.`))
  );

  return combina(partes);
};

// --- EV-05 · las deficiencias y su corrección ------------------------------------

interface Deficiencia {
  id: string;
  linea: string;
  prueba: number;
  pruebaTexto: string;
  situacion: string;
  vence?: number;
  plazo: string;
  cierre: string;
  versionPlan: string;
  responsable: string;
  // Declarada cerrada sin un cierre válido y ya ocurrido: se juzga abierta.
  nota: string;
}

// Las filas del registro de deficiencias, una por `deficiencia_id`. Una
// `cerrada` sin fecha de cierre, o con un cierre posterior a la lectura, no
// está cerrada: se juzga como abierta y se dice.
const deficienciasDe = (reg: Registro): { lista: Deficiencia[]; malas: string[]; recibidas: number } => {
  const salida: Deficiencia[] = [];
  const malas: string[] = [];
  const unicas = unaPorClave(reg.filas, e => campo(e, 'deficiencia_id'));

  unicas.forEach(e => {
    const prueba = instante(campo(e, 'prueba_inicio'));
    const declarada = campo(e, 'situacion');
    const vence = vencimiento(campo(e, 'plazo'));
    const id = campo(e, 'deficiencia_id');
    const cierre = vencimiento(campo(e, 'cierre'));

    if (!id || prueba === undefined || !['abierta', 'cerrada'].includes(declarada) || vence === undefined) {
      malas.push(`línea ${campo(e, 'linea') || '?'} (${id || 'sin id'})`);

      return;
    }

    // `vencimiento` da el FINAL del día: el cierre ocurrió al empezar ese día.
    const cerradaDeVerdad = declarada === 'cerrada' && cierre !== undefined && cierre - DIA <= reg.t;
    const situacion = declarada === 'cerrada' && !cerradaDeVerdad ? 'abierta' : declarada;

    salida.push({
      id,
      linea: campo(e, 'linea'),
      prueba,
      pruebaTexto: campo(e, 'prueba_inicio'),
      situacion,
      nota:
        declarada !== situacion
          ? ` (declarada cerrada ${cierre === undefined ? 'sin fecha de cierre' : `con cierre el ${campo(e, 'cierre')}, posterior a la lectura`}: se juzga abierta)`
          : '',
      vence,
      plazo: campo(e, 'plazo'),
      cierre: campo(e, 'cierre'),
      versionPlan: campo(e, 'version_plan'),
      responsable: campo(e, 'responsable'),
    });
  });

  return { lista: salida, malas, recibidas: unicas.length };
};

interface BaseDeficiencias {
  reg: Registro;
  deficiencias: Deficiencia[];
  reparos: Medida[];
  incompleto?: Medida;
}

const baseDeficiencias = (context: ENSPolicyContext, ahora: number, evidencia: string): BaseDeficiencias | Medida => {
  const p05 = declaraRegistro(context, 'P-05', REGISTRO_DEFICIENCIAS, 'las deficiencias', '/etc/ensfacil/continuity-deficiency-register.tsv');

  if (p05) {
    return p05;
  }

  const reg = leeRegistro(
    context,
    ahora,
    evidencia,
    'continuity_deficiency_register_read',
    'continuity_deficiency_recorded',
    'deficiencias',
    '/etc/ensfacil/continuity-deficiency-register.tsv'
  );

  if (esMedida(reg)) {
    return reg;
  }

  const { lista: deficiencias, malas, recibidas } = deficienciasDe(reg);
  const reparos = [
    filasDescartadas(reg, 'deficiencias'),
    filasPerdidas(reg, recibidas, 'deficiencias'),
    filasIlegibles(malas, 'deficiencias'),
  ].filter((m): m is Medida => Boolean(m));

  return { reg, deficiencias, reparos, ...(reparos.length ? { incompleto: combina(reparos) } : {}) };
};

const ev05 = (context: ENSPolicyContext, ahora: number, m: Medidas): Medida => {
  const d = baseDeficiencias(context, ahora, 'EV-05');

  if (esMedida(d)) {
    return d;
  }

  const t = d.reg.t;
  const partes: Medida[] = [...d.reparos];
  const abiertas = d.deficiencias.filter(x => x.situacion === 'abierta');
  const cerradas = d.deficiencias.filter(x => x.situacion === 'cerrada');

  // Fuera de plazo, en el instante en que se leyó el registro.
  const vencidas = abiertas.filter(x => (x.vence as number) <= t);

  if (vencidas.length) {
    partes.push(
      noCumple(
        `Deficiencias abiertas fuera de plazo a ${fecha(t)}: ${lista(vencidas.map(x => `${x.id} (prueba del ${fecha(x.prueba)}, plazo ${x.plazo}, ${x.responsable || 'sin responsable'})${x.nota}`))}. Probar sin corregir no cumple.`
      )
    );
  }

  // Lo que necesita el registro de pruebas: la prueba siguiente y lo que cada
  // prueba declara. Sin él, esa parte queda sin medir con SU causa.
  const b = basePruebas(context, ahora, 'EV-05');

  if (esMedida(b)) {
    partes.push(b);
  } else {
    // Lo que impide dar por bueno el registro de pruebas también impide dar por
    // buena la corrección: la prueba siguiente o lo que declara cada prueba
    // pueden estar en la fila que falta.
    partes.push(...b.reparos);

    const hechas = b.hechas;
    // «La prueba siguiente» es la siguiente del MISMO escenario (o del mismo
    // tipo, si la de origen no tiene escenario): una prueba posterior de otra
    // cosa no tenía por qué corregirla. Para lo demás está su plazo.
    const siguienteDe = (x: Deficiencia): Prueba | undefined => {
      const origen = b.pruebas.find(p => p.inicio === x.prueba);

      return origen
        ? hechas.find(
            p =>
              p.inicio > origen.inicio &&
              p.fin <= t &&
              (vacio(origen.escenario) ? p.tipo === origen.tipo : normaliza(p.escenario) === normaliza(origen.escenario))
          )
        : undefined;
    };
    const vivas = abiertas.map(x => ({ x, siguiente: siguienteDe(x) })).filter(v => v.siguiente);

    if (vivas.length) {
      partes.push(
        noCumple(
          `Deficiencias que siguen abiertas después de la prueba siguiente: ${lista(vivas.map(v => `${v.x.id} (de la prueba del ${fecha(v.x.prueba)}; la siguiente fue ${describe(v.siguiente as Prueba)})`))}. Es la señal de que el ciclo de mejora no se cierra.`
        )
      );
    }

    const huerfanas = d.deficiencias.filter(x => !b.pruebas.some(p => p.inicio === x.prueba));
    const describeHuerfana = (x: Deficiencia): string => `${x.id} (${x.pruebaTexto}, línea ${x.linea || '?'})`;
    // Su prueba llegó, pero en una fila que no se puede interpretar: RECOGIDA.
    const enFilaIlegible = huerfanas.filter(x => b.inicioIlegibles.includes(x.prueba));
    const sinPrueba = huerfanas.filter(x => !b.inicioIlegibles.includes(x.prueba));

    if (enFilaIlegible.length) {
      partes.push(
        sinMedir(
          `Deficiencias cuya prueba está en una fila del registro de pruebas que no se puede interpretar: ${lista(enFilaIlegible.map(describeHuerfana))}. Sin su prueba no se sabe cuál es la siguiente.`,
          'COLLECTION'
        )
      );
    }

    if (sinPrueba.length) {
      // Por qué puede faltar su prueba sin que sea un error de quien escribe
      // el registro: no se sabe cuántas filas leyó o descartó el recolector, o
      // faltan filas que leyó.
      const porRecogida =
        b.reg.declaradas === undefined
          ? 'La lectura del registro de pruebas no dice cuántas filas leyó el recolector, así que no se puede comprobar que hayan llegado todas, y su prueba puede ser una de las que faltan.'
          : b.faltanFilas
          ? 'Al registro de pruebas le faltan filas que el recolector leyó, y su prueba puede ser una de ellas.'
          : b.reg.invalidas === undefined
          ? 'La lectura del registro de pruebas no dice cuántas filas descartó el recolector, y su prueba puede estar en una de ellas.'
          : undefined;

      partes.push(
        porRecogida
          ? sinMedir(
              `Deficiencias cuyo prueba_inicio no es el inicio de ninguna prueba recibida: ${lista(sinPrueba.map(describeHuerfana))}. ${porRecogida}`,
              'COLLECTION'
            )
          : sinMedir(
              `Deficiencias cuyo prueba_inicio no es el inicio de ninguna prueba del registro: ${lista(sinPrueba.map(describeHuerfana))}. Copia en prueba_inicio el inicio exacto de su prueba${
                b.reg.invalidas ? ', o corrige su fila si es una de las descartadas del registro de pruebas' : ''
              }.`,
              'CONFIGURATION'
            )
      );
    }

    const p01 = escalar(context, 'P-01');
    const meses = p01 !== undefined && Number.isInteger(p01) ? p01 : undefined;
    const desde = meses !== undefined ? sumaMeses(t, -meses) : -Infinity;
    const sinSeguir = hechas
      .filter(p => p.inicio >= desde && (p.deficiencias || 0) > 0)
      .map(p => ({ p, seguidas: d.deficiencias.filter(x => x.prueba === p.inicio).length }))
      .filter(v => v.seguidas < (v.p.deficiencias as number));

    // Una ausencia en el registro de deficiencias: con filas perdidas o
    // descartadas no se afirma.
    if (sinSeguir.length) {
      partes.push(
        porAusencia(
          noCumple(
            `Pruebas${meses !== undefined ? ` del periodo de P-01 (${meses} meses)` : ''} que declaran más deficiencias de las que el registro sigue: ${lista(sinSeguir.map(v => `${describe(v.p)}: declara ${v.p.deficiencias}, en seguimiento ${v.seguidas}`))}. Una deficiencia localizada y no registrada no se corrige.`
          ),
          d.incompleto
        )
      );
    }

    // La obligación de corregir no se esquiva declarando cero: una prueba del
    // periodo que se declara parcial o fallida, o cuya medida superó un RTO o
    // tuvo una restauración fallida, y no tiene ninguna deficiencia ni
    // declarada ni en seguimiento, no ha corregido lo que reveló.
    const reveladas = hechas
      .filter(p => p.inicio >= desde && (p.deficiencias || 0) === 0 && !d.deficiencias.some(x => x.prueba === p.inicio))
      .map(p => {
        const a = m.analisis.find(x => x.prueba.inicio === p.inicio);
        const que = [...(p.resultado !== 'satisfactorio' ? [`declarada ${p.resultado}`] : []), ...(a ? revelo(a) : [])];

        return { p, que };
      })
      .filter(v => v.que.length);

    if (reveladas.length) {
      partes.push(
        porAusencia(
          noCumple(
            `Pruebas que revelaron algo que corregir y no tienen ninguna deficiencia, ni declarada ni en seguimiento: ${lista(reveladas.map(v => `${describe(v.p)} (${v.que.join('; ')})`))}. Localizar sin corregir no cumple.`
          ),
          d.incompleto
        )
      );
    }
  }

  if (!partes.some(x => x.estado !== 'CUMPLE')) {
    const tarde = cerradas.filter(x => {
      const c = vencimiento(x.cierre);

      return c !== undefined && x.vence !== undefined && c > x.vence;
    });

    partes.push(
      cumple(
        d.deficiencias.length
          ? `${d.deficiencias.length} deficiencia(s) en seguimiento a ${fecha(t)}: ${cerradas.length} cerrada(s)${tarde.length ? ` (${tarde.length} fuera de su plazo: ${lista(tarde.map(x => x.id))})` : ''} y ${abiertas.length} abierta(s) dentro de plazo${abiertas.length ? ` (${lista(abiertas.map(x => `${x.id} hasta ${x.plazo}`))})` : ''}.`
          : `El registro de deficiencias está leído (${fecha(t)}) y vacío, y ninguna prueba del periodo declara deficiencias: no hay nada que corregir.`
      )
    );
  }

  return combina(partes);
};

// --- los datos del informe ----------------------------------------------------------

const DATO = 'Dato del informe, sin veredicto propio';

const informe = (motivo: string): string => `${DATO}: ${motivo}`;

const ev03Informe = (m: Medidas): string => {
  if (esMedida(m.base)) {
    return informe(`no hay medida, porque ${m.base.motivo.charAt(0).toLowerCase()}${m.base.motivo.slice(1)}`);
  }

  if (!m.analisis.length) {
    return informe('ninguna prueba parcial ni simulacro del periodo declara sistemas que medir.');
  }

  return informe(
    `alimenta EV-04. ${m.analisis
      .map(a => `${describe(a.prueba)} (medición ${a.prueba.medicion || 'sin dato'}): ${a.sistemas.map(s => s.texto).join('; ') || 'sin sistemas'}`)
      .join(' | ')}. La ventana es la real de cada fila del registro, no la prevista en P-06.`
  );
};

const ev08Informe = (m: Medidas): string => {
  if (esMedida(m.base)) {
    return informe(`no hay medida, porque ${m.base.motivo.charAt(0).toLowerCase()}${m.base.motivo.slice(1)}`);
  }

  if (!m.analisis.length) {
    return informe('ninguna prueba parcial ni simulacro del periodo con sistemas.');
  }

  const con = m.analisis.filter(a => a.restauraciones.length);
  const sin = m.analisis.filter(a => !a.restauraciones.length);

  return informe(
    `alimenta EV-04. ${con.length ? `Restauraciones de mp.info.6 en la ventana: ${con.map(a => `${describe(a.prueba)}: ${lista(a.restauraciones.map(describeRestauracion))}`).join(' | ')}.` : 'Ninguna prueba del periodo incluyó una restauración de copias de mp.info.6.'}${
      con.length && sin.length ? ` Sin restauración: ${lista(sin.map(a => describe(a.prueba)))}.` : ''
    }`
  );
};

const ev06Informe = (context: ENSPolicyContext, ahora: number, m: Medidas): string => {
  if (esMedida(m.base)) {
    return informe(`no hay medida, porque ${m.base.motivo.charAt(0).toLowerCase()}${m.base.motivo.slice(1)}`);
  }

  const con = m.analisis.filter(a => a.cambios.length);

  if (!con.length) {
    return informe(
      m.analisis.length
        ? `sin cambios de FIM en los sistemas de ${lista(m.analisis.map(a => describe(a.prueba)))} en las 24 h siguientes a su ventana.`
        : 'ninguna prueba parcial ni simulacro del periodo con sistemas.'
    );
  }

  const d = baseDeficiencias(context, ahora, 'EV-06');
  const registradas = (p: Prueba): string =>
    esMedida(d) ? '' : ` (${d.deficiencias.filter(x => x.prueba === p.inicio).length} deficiencia(s) registradas de esa prueba)`;

  return informe(
    `cambios de FIM en las 24 h siguientes a la ventana, que deberían constar como deficiencia si la prueba los dejó: ${con
      .map(
        a =>
          `${describe(a.prueba)}${registradas(a.prueba)}: ${a.cambios
            .map(e => `${campo(e, 'agente')} (${idDelHecho(e)}) ${campo(e, 'cambios')} cambio(s) entre ${campo(e, 'primera')} y ${campo(e, 'ultima')}${vacio(campo(e, 'rutas')) ? '' : `, ${campo(e, 'rutas')}`}`)
            .join('; ')}`
      )
      .join(' | ')}.`
  );
};

const ev07Informe = (context: ENSPolicyContext, ahora: number): string => {
  const d = baseDeficiencias(context, ahora, 'EV-07');

  if (esMedida(d)) {
    return informe(`no hay medida, porque ${d.motivo.charAt(0).toLowerCase()}${d.motivo.slice(1)}`);
  }

  const cerradas = d.deficiencias.filter(x => x.situacion === 'cerrada');
  const conVersion = cerradas.filter(x => !vacio(x.versionPlan));
  const nominales = cerradas.filter(x => vacio(x.versionPlan));

  if (!cerradas.length) {
    return informe('ninguna deficiencia cerrada todavía.');
  }

  return informe(
    `${conVersion.length ? `cerradas con el plan actualizado: ${lista(conVersion.map(x => `${x.id} → versión ${x.versionPlan}`))}.` : ''}${
      nominales.length
        ? ` Cerradas sin versión del plan, corrección posiblemente nominal: ${lista(nominales.map(x => x.id))}. No toda corrección cambia el plan; la versión vigente es la de op.cont.2.`
        : ''
    }`.trim()
  );
};

// --- decisiones -------------------------------------------------------------------

const TIPO: ENSTipoDeRegla = 'MAX_AGE';
const PARAMETROS = ['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07'];
const JUZGAN = ['EV-01', 'EV-02', 'EV-04', 'EV-05'];

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();
  const aplica = Boolean(
    context.control.requirements.find(r => r.id === REQUISITO)?.applicability.levels.includes(context.level)
  );

  if (!aplica) {
    return { decisions: [], runtimeVariables: [] };
  }

  const m = medidas(context, ahora, 'EV-04');
  const propias: { id: string; medida: Medida }[] = [
    { id: 'EV-01', medida: ev01(context, ahora) },
    { id: 'EV-02', medida: ev02(context, ahora) },
    { id: 'EV-04', medida: ev04(context, ahora, m) },
    { id: 'EV-05', medida: ev05(context, ahora, m) },
  ];
  const estado = peor(propias.map(p => p.medida));
  const responsables = propias.filter(p => p.medida.estado === estado);

  // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`.
  const decisiones = [
    decide(
      REQUISITO,
      estado,
      responsables.map(p => p.id),
      PARAMETROS,
      TIPO,
      REQUISITO,
      propias.map(p => `${p.id} ${p.medida.estado}: ${p.medida.motivo}`).join(' | '),
      JUZGAN.map(id => `${id} CUMPLE`).join(' y '),
      causaComun(responsables.map(p => p.medida))
    ),
    // Una por evidencia, con SU estado.
    ...propias.map(p =>
      decide(REQUISITO, p.medida.estado, [p.id], PARAMETROS, TIPO, `${REQUISITO}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`, p.medida.causa)
    ),
  ];

  const informativas: [string, string][] = [
    ['EV-03', ev03Informe(m)],
    ['EV-06', ev06Informe(context, ahora, m)],
    ['EV-07', ev07Informe(context, ahora)],
    ['EV-08', ev08Informe(m)],
  ];

  informativas.forEach(([id, motivo]) =>
    decisiones.push(decide(REQUISITO, 'NO_APLICA', [id], PARAMETROS, TIPO, `${REQUISITO}/${id}`, motivo, 'dato del informe'))
  );

  const variables: ENSRuntimeVariable[] = [
    ...propias.map(p => ({
      name: `medida_${p.id.replace('-', '')}`,
      value: p.medida.estado,
      parameterIds: [],
      evidenceIds: [p.id],
      eventIds: [],
      description: p.medida.motivo,
    })),
    ...informativas.map(([id, motivo]) => ({
      name: `informe_${id.replace('-', '')}`,
      value: 'NO_APLICA',
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: motivo,
    })),
  ];

  return { decisions: decisiones, runtimeVariables: variables };
};

export const opCont3PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // Por el nivel de la Disponibilidad: solo con D en ALTO.
  requirements: [
    {
      requirementId: REQUISITO,
      levels: ['ALTO'],
      parameterIds: PARAMETROS,
      evidenceIds: JUZGAN,
      ruleType: TIPO,
    },
  ],
};
