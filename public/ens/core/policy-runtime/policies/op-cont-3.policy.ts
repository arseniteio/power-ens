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
  invalidas: number;
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
    invalidas: numero(campo(leido, 'filas_invalidas')) || 0,
    lineas: listaDe(campo(leido, 'lineas_invalidas')),
  };
};

// Las filas que el recolector descartó por no seguir el formato: con ellas el
// registro no se puede dar por completo. Se nombran por línea y columna.
const filasDescartadas = (reg: Registro, nombre: string): Medida | undefined =>
  reg.invalidas
    ? sinMedir(
        `El registro de ${nombre} ${reg.fichero} tiene ${reg.invalidas} fila(s) descartadas por no seguir el formato (${
          reg.lineas.length ? `línea:columna ${lista(reg.lineas, 10)}` : 'ver los avisos del recolector'
        }): una fila ilegible puede ser justo la que falta, así que no se puede dar el registro por bueno. Corrígelas.`,
        'CONFIGURATION'
      )
    : undefined;

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
}

const describe = (p: Prueba): string => `${p.tipo} del ${iso(p.inicio)}${vacio(p.escenario) ? '' : ` («${p.escenario}»)`}`;

// Las filas del registro de pruebas. El recolector ya validó el formato: una
// fila que aun así no se entiende es un fallo de RECOGIDA, y se nombra.
const pruebasDe = (reg: Registro): { pruebas: Prueba[]; malas: string[] } => {
  const pruebas: Prueba[] = [];
  const malas: string[] = [];

  reg.filas.forEach(e => {
    const inicio = instante(campo(e, 'inicio'));
    const fin = instante(campo(e, 'fin'));
    const tipo = campo(e, 'tipo');
    const linea = campo(e, 'linea') || '?';

    if (inicio === undefined || fin === undefined || fin < inicio || !TIPOS.includes(tipo)) {
      malas.push(`línea ${linea} (inicio «${campo(e, 'inicio')}», fin «${campo(e, 'fin')}», tipo «${tipo}»)`);

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
      deficiencias: numero(campo(e, 'deficiencias')),
      referencia: campo(e, 'referencia'),
      medicion: campo(e, 'medicion'),
      medidoHasta: instante(campo(e, 'medido_hasta')),
      diasSinAlertas: listaDe(campo(e, 'dias_sin_alertas')),
    });
  });

  return { pruebas: pruebas.sort((a, b) => a.inicio - b.inicio), malas };
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

  const { pruebas, malas } = pruebasDe(reg);
  const reparos = [filasDescartadas(reg, 'pruebas'), filasIlegibles(malas, 'pruebas')].filter((m): m is Medida => Boolean(m));

  return { reg, pruebas, hechas: pruebas.filter(p => p.fin <= reg.t), reparos };
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
      noCumple(
        `El registro de pruebas ${b.reg.fichero} está leído (${iso(b.reg.t)}) y no consta ninguna prueba realizada del plan de continuidad: el control queda sin cumplimiento acreditable.${pendientes(b)}`
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
      noCumple(
        `Las ${b.hechas.length} pruebas registradas son solo revisiones documentales o de escritorio (${porTipo}): ninguna ejercita realmente los medios alternativos (parcial o simulacro).`
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
    partes.push(noCumple(`No consta ninguna prueba realizada en el registro: la periodicidad de ${p01.meses} meses (P-01) no se cumple.`));

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
    partes.push(noCumple(`Pruebas fuera de periodicidad a ${fecha(t)}, cuando se leyó el registro: ${lista(fuera, 8)}.`));
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

interface Sistema {
  nombre: string;
  // Sin medida concluyente: la causa y el motivo.
  hueco?: Medida;
  // La caída más larga, cerrada o abierta hasta `hasta`.
  caidas: number;
  maxima: number;
  abierta: boolean;
  rto?: Rto;
  // true: no alcanzó el RTO (concluyente); false: lo alcanzó.
  excede?: boolean;
  texto: string;
}

interface Analisis {
  prueba: Prueba;
  sistemas: Sistema[];
  restauraciones: ENSNormalizedEvent[];
  fallidas: ENSNormalizedEvent[];
  cambios: ENSNormalizedEvent[];
  // Lo que impide medir la prueba entera (medición incompleta).
  hueco?: Medida;
}

const delMismoPaso = (context: ENSPolicyContext, ahora: number, tipo: string, t: number, prueba: Prueba): ENSNormalizedEvent[] =>
  validos(context, tipo, ahora).filter(
    e => momento(e) >= t - MISMA_PASADA && momento(e) <= t + HORA && instante(campo(e, 'prueba_inicio')) === prueba.inicio
  );

const rtoDe = (rtos: Rto[], sistema: string, hecho: ENSNormalizedEvent): Rto | undefined =>
  rtos.find(r => r.sistema !== '*' && (iguales(r.sistema, sistema) || (idDeAgente(r.sistema) && idDeAgente(r.sistema) === idDelHecho(hecho)) || iguales(r.sistema, campo(hecho, 'agente')))) ||
  rtos.find(r => r.sistema === '*');

const MEDICION: Record<string, string> = {
  parcial: 'faltan alertas de algunos días de su ventana en el manager',
  sin_alertas: 'las alertas de los días de su ventana ya no están en el manager',
  error: 'el recolector no pudo leer las alertas de su ventana',
  no_aplica: 'el recolector no la midió',
};

const analiza = (context: ENSPolicyContext, ahora: number, t: number, prueba: Prueba, rtos: Rto[] | undefined): Analisis => {
  const disponibilidad = delMismoPaso(context, ahora, 'availability_event_observed', t, prueba);
  const restauraciones = delMismoPaso(context, ahora, 'backup_restore_observed', t, prueba);
  const cambios = delMismoPaso(context, ahora, 'post_test_change_observed', t, prueba);
  const fallidas = restauraciones.filter(e => campo(e, 'resultado') !== 'ok' || campo(e, 'coincide') === 'no');
  const hasta = prueba.medidoHasta ?? prueba.fin;
  const pendiente = prueba.medicion === 'pendiente';
  const incompleta = prueba.medicion !== 'completa' && !pendiente;
  const hueco = incompleta
    ? sinMedir(
        `La medición de la prueba ${describe(prueba)} está incompleta (${prueba.medicion || 'sin dato'}: ${MEDICION[prueba.medicion] || 'estado desconocido'}${
          prueba.diasSinAlertas.length ? `; días sin alertas: ${prueba.diasSinAlertas.join(', ')}` : ''
        }).`,
        'COLLECTION'
      )
    : undefined;

  const sistemas: Sistema[] = prueba.sistemas.map(sistema => {
    const r = resuelve(sistema, disponibilidad);
    const sinMedida: Sistema = { nombre: sistema, caidas: 0, maxima: 0, abierta: false, texto: '' };

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
        hueco: sinMedir(
          `«${sistema}» no es un agente de Wazuh en el manager: su disponibilidad durante la prueba no se puede medir (decláralo por el nombre o el ID de su agente).`,
          incompleta ? 'COLLECTION' : 'EVIDENCE'
        ),
        texto: `${sistema}: sin agente, sin medida`,
      };
    }

    const e = r.hecho;
    const nombre = nombreDe(sistema, e);
    const items = cronologia(campo(e, 'eventos'));
    const total = numero(campo(e, 'eventos_total'));

    if (!items) {
      return { ...sinMedida, nombre, hueco: sinMedir(`${nombre}: el recolector emitió una cronología que no se puede leer («${campo(e, 'eventos')}»).`, 'COLLECTION'), texto: `${nombre}: cronología ilegible` };
    }

    // Las caídas que empiezan en la ventana de la prueba; las vueltas pueden
    // llegar después (hasta las 24 h siguientes).
    const tramos: [number, number | undefined][] = [];
    let desde: number | undefined;

    items.forEach(item => {
      if (CAIDAS.includes(item.tipo)) {
        if (desde === undefined && item.t >= prueba.inicio && item.t <= prueba.fin) {
          desde = item.t;
        }
      } else if (desde !== undefined) {
        tramos.push([desde, item.t]);
        desde = undefined;
      }
    });

    if (desde !== undefined) {
      tramos.push([desde, undefined]);
    }

    const cerradas = tramos.filter(([, b]) => b !== undefined).map(([a, b]) => (b as number) - a);
    const abierta = tramos.some(([, b]) => b === undefined);
    const desdeAbierta = tramos.find(([, b]) => b === undefined)?.[0];
    const maxima = Math.max(0, ...cerradas, abierta && desdeAbierta !== undefined ? hasta - desdeAbierta : 0);
    const rto = rtos ? rtoDe(rtos, sistema, e) : undefined;
    const truncada = total !== undefined && total > items.length;
    const resumen = !tramos.length
      ? `${nombre}: sin caídas observadas`
      : `${nombre}: ${tramos.length} caída(s), la más larga ${duracion(maxima)}${abierta ? `, sin restablecer a ${iso(hasta)}` : ', restablecido'}`;
    const base: Sistema = { nombre, caidas: tramos.length, maxima, abierta, rto, texto: `${resumen}${rto ? ` (${rto.texto})` : ''}` };

    if (!rtos) {
      return base;
    }

    if (!rto) {
      return {
        ...base,
        hueco: sinMedir(`${etiqueta(context, 'P-07')} no declara el RTO de «${sistema}» ni uno general (*): no hay contra qué juzgar su indisponibilidad.`, 'CONFIGURATION'),
      };
    }

    if (maxima > rto.limite) {
      return { ...base, excede: true };
    }

    // Lo que no supera el RTO todavía no es concluyente si la cronología está
    // truncada o la medición incompleta (puede faltar una caída o la vuelta),
    // o si sigue caído y aún puede volver dentro del RTO.
    if (truncada) {
      return { ...base, hueco: sinMedir(`${nombre}: la cronología llegó truncada (${items.length} de ${total} eventos): no se puede afirmar que no hubo una caída más larga.`, 'COLLECTION') };
    }

    if (abierta) {
      return {
        ...base,
        hueco: sinMedir(
          pendiente
            ? `${nombre}: sigue sin restablecerse a ${iso(hasta)} y la medición de la prueba sigue abierta: todavía no se sabe si vuelve dentro de su RTO.`
            : `${nombre}: no se observó su restablecimiento hasta ${iso(hasta)} (las 24 h siguientes a la prueba), y su ${rto.texto} es mayor: no se puede afirmar ni negar.`
        ),
      };
    }

    return { ...base, excede: false };
  });

  return { prueba, sistemas, restauraciones, fallidas, cambios, hueco };
};

const describeRestauracion = (e: ENSNormalizedEvent): string =>
  `${campo(e, 'agente') || '-'} (${idDelHecho(e) || '-'}) ${campo(e, 'instante') || iso(momento(e))}: ${campo(e, 'resultado') || '-'}${campo(e, 'coincide') === 'no' ? ', el contenido no coincide' : ''}`;

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
        `${titulo}, y la medida la desmiente: ${excedidos.map(s => `${s.nombre} estuvo ${duracion(s.maxima)} sin servicio${s.abierta ? ' y no se restableció en la ventana medida' : ''}, por encima de su ${s.rto?.texto}`).join('; ')}.`
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

  if (a.hueco) {
    partes.push(a.hueco);
  }

  a.sistemas.filter(s => s.hueco).forEach(s => partes.push(s.hueco as Medida));

  if (partes.length) {
    return combina(partes);
  }

  return cumple(
    satisfactoria
      ? `${titulo}, y lo medido lo confirma: ${medido}.`
      : excedidos.length || a.fallidas.length
      ? `${titulo}, y lo medido es coherente con lo declarado: ${medido}${a.fallidas.length ? `; restauraciones fallidas: ${lista(a.fallidas.map(describeRestauracion))}` : ''}. Lo que la prueba reveló se juzga en EV-05.`
      : `${titulo}; lo medido no muestra ningún objetivo incumplido: ${medido}.`
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

  if (!m.analisis.length) {
    partes.push(
      m.sinSistemas.length
        ? sinMedir(
            `Las pruebas parciales o simulacros que se contrastan (${lista(m.sinSistemas.map(describe))}) no declaran ningún sistema: su resultado declarado no se puede contrastar con lo que pasó en los sistemas.`
          )
        : sinMedir('No consta ninguna prueba parcial ni simulacro realizado: no hay ningún resultado que contrastar con lo medido (lo juzga EV-01).')
    );

    return combina(partes);
  }

  m.analisis.forEach(a => partes.push(juzgaPrueba(a)));

  const aparte = m.sinSistemas.length ? ` Sin sistemas que medir: ${lista(m.sinSistemas.map(describe))}.` : '';
  const resultado = combina(partes);

  return aparte ? { ...resultado, motivo: `${resultado.motivo}${aparte}` } : resultado;
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
}

const deficienciasDe = (reg: Registro): { lista: Deficiencia[]; malas: string[] } => {
  const salida: Deficiencia[] = [];
  const malas: string[] = [];

  reg.filas.forEach(e => {
    const prueba = instante(campo(e, 'prueba_inicio'));
    const situacion = campo(e, 'situacion');
    const vence = vencimiento(campo(e, 'plazo'));
    const id = campo(e, 'deficiencia_id');

    if (!id || prueba === undefined || !['abierta', 'cerrada'].includes(situacion) || vence === undefined) {
      malas.push(`línea ${campo(e, 'linea') || '?'} (${id || 'sin id'})`);

      return;
    }

    salida.push({
      id,
      linea: campo(e, 'linea'),
      prueba,
      pruebaTexto: campo(e, 'prueba_inicio'),
      situacion,
      vence,
      plazo: campo(e, 'plazo'),
      cierre: campo(e, 'cierre'),
      versionPlan: campo(e, 'version_plan'),
      responsable: campo(e, 'responsable'),
    });
  });

  return { lista: salida, malas };
};

interface BaseDeficiencias {
  reg: Registro;
  deficiencias: Deficiencia[];
  reparos: Medida[];
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

  const { lista: deficiencias, malas } = deficienciasDe(reg);
  const reparos = [filasDescartadas(reg, 'deficiencias'), filasIlegibles(malas, 'deficiencias')].filter((m): m is Medida => Boolean(m));

  return { reg, deficiencias, reparos };
};

const ev05 = (context: ENSPolicyContext, ahora: number): Medida => {
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
        `Deficiencias abiertas fuera de plazo a ${fecha(t)}: ${lista(vencidas.map(x => `${x.id} (prueba del ${fecha(x.prueba)}, plazo ${x.plazo}, ${x.responsable || 'sin responsable'})`))}. Probar sin corregir no cumple.`
      )
    );
  }

  // Lo que necesita el registro de pruebas: la prueba siguiente y lo que cada
  // prueba declara. Sin él, esa parte queda sin medir con SU causa.
  const b = basePruebas(context, ahora, 'EV-05');

  if (esMedida(b)) {
    partes.push(b);
  } else {
    const hechas = b.hechas;
    const vivas = abiertas
      .map(x => ({ x, siguiente: hechas.find(p => p.inicio > x.prueba && p.fin <= t) }))
      .filter(v => v.siguiente);

    if (vivas.length) {
      partes.push(
        noCumple(
          `Deficiencias que siguen abiertas después de la prueba siguiente: ${lista(vivas.map(v => `${v.x.id} (de la prueba del ${fecha(v.x.prueba)}; la siguiente fue ${describe(v.siguiente as Prueba)})`))}. Es la señal de que el ciclo de mejora no se cierra.`
        )
      );
    }

    const huerfanas = d.deficiencias.filter(x => !b.pruebas.some(p => p.inicio === x.prueba));

    if (huerfanas.length) {
      partes.push(
        sinMedir(
          `Deficiencias cuyo prueba_inicio no es el inicio de ninguna prueba del registro: ${lista(huerfanas.map(x => `${x.id} (${x.pruebaTexto}, línea ${x.linea || '?'})`))}. Copia en prueba_inicio el inicio exacto de su prueba.`,
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

    if (sinSeguir.length) {
      partes.push(
        noCumple(
          `Pruebas${meses !== undefined ? ` del periodo de P-01 (${meses} meses)` : ''} que declaran más deficiencias de las que el registro sigue: ${lista(sinSeguir.map(v => `${describe(v.p)}: declara ${v.p.deficiencias}, en seguimiento ${v.seguidas}`))}. Una deficiencia localizada y no registrada no se corrige.`
        )
      );
    }
  }

  if (!partes.some(m => m.estado !== 'CUMPLE')) {
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
    { id: 'EV-05', medida: ev05(context, ahora) },
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
