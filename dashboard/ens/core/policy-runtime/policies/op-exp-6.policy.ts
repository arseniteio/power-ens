// op.exp.6 · Protección frente a código dañino
//
// Por qué este control tiene policy propia. Las siete primitivas contrastan UN
// hecho contra UN parámetro, y casi todas las preguntas de op.exp.6 cruzan dos
// cosas:
//
//   EV-02  firmas al día en CADA plano con antimalware. ANTIGUEDAD_MAXIMA es
//          existencial: el correo de Zimbra al día taparía el antivirus del
//          sistema caducado. Y sin antimalware no hay firmas: eso se mide.
//   EV-04  detecciones sin remediar o repetidas, y ningún mecanismo de
//          reacción si no hay antimalware en ejecución.
//   EV-05  el último escaneo completo contra P-06, y «nunca ha escaneado» es
//          un incumplimiento cuando consta que el registro se leyó.
//   EV-06  cada ruta de P-07 (las del equipo y las de «*») cubierta por una
//          ruta que el agente vigilaba en su último arranque.
//   EV-07  dos juicios que la ficha mete en una evidencia: el mecanismo en
//          modo aplicación Y ninguna ejecución no bloqueada fuera de P-08.
//   EV-08  a EV-11, cada capacidad EDR con lo que el equipo deja ver de ella.
//   EV-12  cada vía de P-05 con lo que el equipo puede demostrar, y cada
//          dispositivo extraíble contra P-10.
//
// Lo que sí cabe en una primitiva se deja a las primitivas (EV-01 y EV-03,
// tablas por equipo/plano y plano/ajuste) y aquí solo se LEE su resultado.
//
// Invariantes, las mismas que `evidence/judgment.ts`:
//   - el agente emite instantes, no edades: toda antigüedad se mide aquí
//     contra `context.now`;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo; la ausencia de
//     hechos solo es un incumplimiento cuando lo AUSENTE es el antimalware, y
//     eso lo dice un hecho (`antimalware_status` con `producto_activo=ninguno`);
//   - un silencio (ninguna detección, ninguna ejecución, ningún dispositivo)
//     solo vale si el latido de la pasada declara que se leyó la fuente;
//   - la policy nunca inventa política: ningún plazo ni lista tiene valor por
//     defecto.
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

const CONTROL = 'op.exp.6';
const POLICY = 'policy.op.exp.6';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// Mismo margen de reloj que `resolveCollectorCoverage`: un hecho del futuro no
// acredita nada.
const TOLERANCIA_FUTURO = 5 * 60 * 1000;

// Un latido cuenta como cobertura durante 24 h, igual que en las primitivas.
const LATIDO_HORAS = 24;

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

// Varias comprobaciones de una misma evidencia: manda la peor, y el motivo
// cuenta las que la sostienen.
const combina = (medidas: Medida[]): Medida => {
  const estado = peor(medidas);

  return {
    estado,
    motivo: medidas
      .filter(m => m.estado === estado)
      .map(m => m.motivo)
      .join(' '),
  };
};

// --- lectura de hechos -----------------------------------------------------

// El normalizador parte un evento con `evidence_id=EV-02,EV-10` en uno por
// evidencia (`<id>#EV-02`, `<id>#EV-10`). Aquí se juzga el HECHO, así que se
// cuenta una vez.
const hechos = (
  context: ENSPolicyContext,
  tipo: string,
  evidencia?: string
): ENSNormalizedEvent[] => {
  const vistos = new Set<string>();

  return context.events.filter(event => {
    if (event.controlId !== CONTROL || event.eventType !== tipo) {
      return false;
    }

    if (evidencia && event.evidenceId && event.evidenceId !== evidencia) {
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

const instante = (texto: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(texto)) {
    return undefined;
  }

  const valor = new Date(texto).getTime();

  return Number.isFinite(valor) ? valor : undefined;
};

const momento = (event: ENSNormalizedEvent): number => {
  const t = Date.parse(event.timestamp);

  return Number.isFinite(t) ? t : 0;
};

// Lo más reciente primero, sin nada fechado por delante del reloj.
const recientes = (
  eventos: ENSNormalizedEvent[],
  ahora: number
): ENSNormalizedEvent[] =>
  eventos
    .filter(e => momento(e) <= ahora + TOLERANCIA_FUTURO)
    .sort((a, b) => momento(b) - momento(a));

const lista = (elementos: string[], maximo = 5): string =>
  elementos.length > maximo
    ? `${elementos.slice(0, maximo).join('; ')} y ${elementos.length - maximo} más`
    : elementos.join('; ');

const horas = (ms: number): string => (ms / HORA).toFixed(1);

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

// Un número positivo (horas o días). Vacío o ilegible es «sin configurar».
const numero = (context: ENSPolicyContext, id: string): number | undefined => {
  const valor = parametro(context, id)?.value;
  const texto = Array.isArray(valor) ? String(valor[0] ?? '') : String(valor ?? '');

  if (!/^\d+(\.\d+)?$/.test(texto.trim())) {
    return undefined;
  }

  const n = Number(texto.trim());

  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const seleccion = (context: ENSPolicyContext, id: string): string => {
  const valor = parametro(context, id)?.value;

  return (Array.isArray(valor) ? String(valor[0] ?? '') : String(valor ?? '')).trim();
};

// --- el latido y las degradaciones del recolector -------------------------

// ¿Declara el último latido (de las últimas 24 h) que leyó la fuente de esta
// evidencia? Es lo único que convierte un silencio en una medida.
const cubierta = (
  context: ENSPolicyContext,
  evidencia: string,
  ahora: number
): boolean => {
  const latido = recientes(hechos(context, 'collector_run'), ahora).find(
    e => ahora - momento(e) <= LATIDO_HORAS * HORA
  );

  if (!latido || campo(latido, 'resultado') !== 'completada') {
    return false;
  }

  return campo(latido, 'evidencias_cubiertas')
    .split(',')
    .map(s => s.trim())
    .includes(evidencia);
};

// El motivo con el que el recolector declaró que no pudo medir esta evidencia.
const degradacion = (
  context: ENSPolicyContext,
  evidencia: string,
  ahora: number
): string | undefined => {
  const e = recientes(
    context.events.filter(
      ev =>
        ev.controlId === CONTROL &&
        ev.eventType === 'evidence_state' &&
        ev.evidenceId === evidencia
    ),
    ahora
  )[0];

  return e
    ? `El recolector declara que no pudo medirla (${campo(e, 'causa') || 'sin causa'}): ${campo(e, 'motivo')}.`
    : undefined;
};

// --- el antimalware de cada plano (EV-01) ----------------------------------

type Plano = {
  plano: string;
  equipo: string;
  producto: string;
  productoActivo: string;
  instalado: string;
};

// El último `antimalware_status` de cada plano. Es un hecho de ESTADO: la
// fase de `state-facts.ts` ya ha dejado solo la última emisión.
const planos = (
  context: ENSPolicyContext,
  ahora: number
): Map<string, Plano> => {
  const resultado = new Map<string, Plano>();

  recientes(hechos(context, 'antimalware_status', 'EV-01'), ahora).forEach(e => {
    const plano = campo(e, 'plano') || 'sistema';

    if (resultado.has(plano)) {
      return;
    }

    resultado.set(plano, {
      plano,
      equipo: campo(e, 'equipo'),
      producto: campo(e, 'producto') || 'ninguno',
      productoActivo: campo(e, 'producto_activo') || 'ninguno',
      instalado: campo(e, 'instalado'),
    });
  });

  return resultado;
};

const activo = (p: Plano | undefined): boolean =>
  !!p && p.productoActivo !== '' && p.productoActivo !== 'ninguno';

const equipoDe = (
  context: ENSPolicyContext,
  estados: Map<string, Plano>
): string =>
  Array.from(estados.values()).find(p => p.equipo)?.equipo ||
  context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName ||
  '';

// Planos en los que tiene que haber antimalware: los que P-02 declara para este
// equipo, más los que tienen uno en ejecución. Sin fila en P-02, el plano
// sistema: todo equipo tiene uno.
const planosExigidos = (
  context: ENSPolicyContext,
  estados: Map<string, Plano>
): string[] => {
  const equipo = equipoDe(context, estados);
  const declarados = (filas(context, 'P-02') || [])
    .filter(f => equipo && f.equipo === equipo)
    .map(f => f.plano)
    .filter(Boolean);

  const conProducto = Array.from(estados.values())
    .filter(activo)
    .map(p => p.plano);

  const todos = Array.from(new Set([...declarados, ...conProducto]));

  return todos.length ? todos : ['sistema'];
};

const describePlano = (p: Plano | undefined, plano: string): string =>
  !p
    ? `el plano ${plano} no consta en ninguna observación del agente`
    : p.instalado === 'si'
      ? `en el plano ${plano} ${p.producto} está instalado y su servicio no está en ejecución`
      : `en el plano ${plano} no hay ningún antimalware instalado`;

// Sin antimalware en un plano exigido no hay nada que tenga firmas, detecte ni
// escanee. Se devuelve la medida de esa ausencia, o undefined si todos corren.
const sinAntimalware = (
  context: ENSPolicyContext,
  estados: Map<string, Plano>,
  consecuencia: string,
  soloPlano?: string
): Medida | undefined => {
  const exigidos = soloPlano ? [soloPlano] : planosExigidos(context, estados);
  const faltan = exigidos.filter(plano => !activo(estados.get(plano)));

  if (!faltan.length) {
    return undefined;
  }

  return noCumple(
    `${lista(faltan.map(plano => describePlano(estados.get(plano), plano)))}: ${consecuencia}`
  );
};

const sinEstado = (): Medida =>
  sinMedir(
    'No consta qué antimalware tiene este equipo: el agente no ha emitido `antimalware_status` (EV-01) en la ventana.'
  );

// --- las evidencias --------------------------------------------------------

const ev02 = (context: ENSPolicyContext, ahora: number): Medida => {
  const estados = planos(context, ahora);

  if (!estados.size) {
    return sinEstado();
  }

  const exigidos = planosExigidos(context, estados);
  const medidas: Medida[] = [];

  const ausencia = sinAntimalware(
    context,
    estados,
    'no hay bases de detección que mantener actualizadas.'
  );

  if (ausencia) {
    medidas.push(ausencia);
  }

  const limite = numero(context, 'P-03');
  const firmas = recientes(hechos(context, 'antimalware_signatures_updated', 'EV-02'), ahora);

  exigidos
    .filter(plano => activo(estados.get(plano)))
    .forEach(plano => {
      const fechas = firmas
        .filter(e => (campo(e, 'plano') || 'sistema') === plano)
        .map(e => ({ e, t: instante(campo(e, 'fecha')) }))
        .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
          x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO
        )
        .sort((a, b) => b.t - a.t);

      const producto = estados.get(plano)!.productoActivo;

      if (!fechas.length) {
        const motivo = degradacion(context, 'EV-02', ahora);

        medidas.push(
          motivo
            ? sinMedir(`Plano ${plano} (${producto}): ${motivo}`)
            : noCumple(`En el plano ${plano} ${producto} está en ejecución y no se observa ninguna base de firmas.`)
        );

        return;
      }

      if (limite === undefined) {
        medidas.push(
          sinMedir(
            `${etiqueta(context, 'P-03')} está sin configurar: las firmas de ${producto} (plano ${plano}) son del ${campo(fechas[0].e, 'fecha')} y no hay umbral contra el que juzgarlas.`
          )
        );

        return;
      }

      const edad = ahora - fechas[0].t;
      const texto = `las firmas de ${producto} en el plano ${plano} se publicaron el ${campo(fechas[0].e, 'fecha')} (versión ${campo(fechas[0].e, 'version') || '?'}, hace ${horas(edad)} h)`;

      medidas.push(
        edad > limite * HORA
          ? noCumple(`${texto}, más que las ${limite} h de ${etiqueta(context, 'P-03')}.`)
          : cumple(`${texto}, dentro de las ${limite} h de ${etiqueta(context, 'P-03')}.`)
      );
    });

  return combina(medidas.length ? medidas : [sinEstado()]);
};

const ev04 = (context: ENSPolicyContext, ahora: number): Medida => {
  const estados = planos(context, ahora);
  const detecciones = recientes(hechos(context, 'malware_detected', 'EV-04'), ahora);
  const medidas: Medida[] = [];

  // Una detección sin remediar incumple aunque hoy ya no haya antimalware.
  const sinRemediar = detecciones.filter(e =>
    ['sin_accion', 'fallida'].includes(campo(e, 'accion'))
  );

  if (sinRemediar.length) {
    medidas.push(
      noCumple(
        `Detecciones sin remediar: ${lista(sinRemediar.map(e => `${campo(e, 'amenaza')} en ${campo(e, 'fichero')} (${campo(e, 'accion')}, ${campo(e, 'fecha')})`))}.`
      )
    );
  }

  // La misma amenaza en el mismo fichero más de una vez: la ficha lo llama
  // infección persistente, y es una condición de incumplimiento propia.
  const veces = new Map<string, number>();

  detecciones.forEach(e => {
    const clave = `${campo(e, 'amenaza')} en ${campo(e, 'fichero')}`;
    veces.set(clave, (veces.get(clave) || 0) + 1);
  });

  const repetidas = Array.from(veces.entries()).filter(([, n]) => n > 1);

  if (repetidas.length) {
    medidas.push(
      noCumple(
        `Detecciones repetidas sobre el mismo fichero, indicio de infección persistente: ${lista(repetidas.map(([k, n]) => `${k} (${n} veces)`))}.`
      )
    );
  }

  if (!estados.size) {
    medidas.push(sinEstado());

    return combina(medidas);
  }

  const ausencia = sinAntimalware(
    context,
    estados,
    'no hay ningún mecanismo que detecte ni reaccione ante código dañino.'
  );

  if (ausencia) {
    medidas.push(ausencia);
  }

  if (medidas.length) {
    return combina(medidas);
  }

  if (!cubierta(context, 'EV-04', ahora)) {
    return sinMedir(
      degradacion(context, 'EV-04', ahora) ||
        'El último latido del recolector no declara haber leído los logs de detección: no se puede afirmar que no haya detecciones sin resolver.'
    );
  }

  return cumple(
    detecciones.length
      ? `Las ${detecciones.length} detecciones de la ventana están remediadas y ninguna se repite.`
      : 'Los logs de detección se han leído y no registran ninguna detección en la ventana.'
  );
};

const ev05 = (context: ENSPolicyContext, ahora: number): Medida => {
  const estados = planos(context, ahora);
  const plazo = numero(context, 'P-06');
  const escaneos = recientes(hechos(context, 'full_scan_completed', 'EV-05'), ahora)
    .map(e => ({ e, t: instante(campo(e, 'fecha')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO
    )
    .sort((a, b) => b.t - a.t);

  if (escaneos.length) {
    if (plazo === undefined) {
      return sinMedir(
        `${etiqueta(context, 'P-06')} está sin configurar: el último escaneo completo terminó el ${campo(escaneos[0].e, 'fecha')} y no hay periodicidad contra la que juzgarlo.`
      );
    }

    const edad = ahora - escaneos[0].t;
    const texto = `El último escaneo completo terminó el ${campo(escaneos[0].e, 'fecha')} (${campo(escaneos[0].e, 'ficheros_escaneados') || '?'} ficheros, hace ${(edad / DIA).toFixed(1)} días)`;

    return edad > plazo * DIA
      ? noCumple(`${texto}, más que los ${plazo} días de ${etiqueta(context, 'P-06')}.`)
      : cumple(`${texto}, dentro de los ${plazo} días de ${etiqueta(context, 'P-06')}.`);
  }

  if (!estados.size) {
    return sinEstado();
  }

  // Un escaneo de TODO el sistema lo hace el antimalware del sistema: el del
  // correo solo analiza el correo.
  const ausencia = sinAntimalware(
    context,
    estados,
    'no hay nada que escanee el sistema.',
    'sistema'
  );

  if (ausencia) {
    return ausencia;
  }

  if (cubierta(context, 'EV-05', ahora)) {
    return noCumple(
      'El registro de escaneos completos se ha leído y no consta ningún escaneo de todo el sistema terminado: el equipo nunca ha completado uno, o no en la ventana.'
    );
  }

  return sinMedir(
    degradacion(context, 'EV-05', ahora) ||
      'El último latido del recolector no declara haber leído el registro de escaneos completos.'
  );
};

const cubre = (vigilada: string, critica: string): boolean => {
  const v = vigilada.replace(/\/+$/, '') || '/';
  const c = critica.replace(/\/+$/, '') || '/';

  return v === '/' || c === v || c.startsWith(`${v}/`);
};

const ev06 = (context: ENSPolicyContext, ahora: number): Medida => {
  const arranques = hechos(context, 'boot_integrity_check', 'EV-06')
    .map(e => ({ e, t: instante(campo(e, 'arranque_agente')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO
    )
    .sort((a, b) => b.t - a.t);

  if (!arranques.length) {
    return sinMedir(
      degradacion(context, 'EV-06', ahora) ||
        'No consta ningún arranque del agente con su análisis: el recolector no ha emitido `boot_integrity_check` en la ventana.'
    );
  }

  const ultimo = arranques[0].e;
  const cuando = campo(ultimo, 'arranque_agente');
  const medidas: Medida[] = [];

  if (campo(ultimo, 'fim_inicio') === 'no') {
    medidas.push(
      noCumple(`En su último arranque (${cuando}) el agente no lanzó el análisis de integridad al arrancar (scan_on_start desactivado o FIM parado).`)
    );
  } else if (campo(ultimo, 'fim_fin') === 'no') {
    medidas.push(
      noCumple(`En su último arranque (${cuando}) el agente empezó el análisis de integridad y no consta que lo terminara.`)
    );
  }

  const equipo =
    campo(ultimo, 'equipo') ||
    context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName ||
    '';

  const criticas = (filas(context, 'P-07') || [])
    .filter(f => f.equipo === '*' || (equipo && f.equipo === equipo))
    .map(f => f.ruta)
    .filter(Boolean);

  if (!criticas.length) {
    medidas.push(
      sinMedir(
        `${etiqueta(context, 'P-07')} no declara ninguna ruta crítica para este equipo ni para «*»: se sabe qué analizó el agente al arrancar (${campo(ultimo, 'rutas')}), pero no qué es crítico.`
      )
    );

    return combina(medidas);
  }

  const vigiladas = campo(ultimo, 'rutas')
    .split(',')
    .map(s => s.trim())
    .filter(s => s && s !== 'ninguna');

  const fuera = criticas.filter(c => !vigiladas.some(v => cubre(v, c)));

  medidas.push(
    fuera.length
      ? noCumple(
          `En su último arranque (${cuando}) el agente no analizaba ${fuera.length} ruta(s) crítica(s) de ${etiqueta(context, 'P-07')}: ${lista(fuera)}. Vigilaba: ${vigiladas.join(', ') || 'ninguna'}.`
        )
      : cumple(
          `En su último arranque (${cuando}) el agente analizó las ${criticas.length} rutas críticas declaradas (${lista(criticas)}) y terminó el análisis el ${campo(ultimo, 'fim_fin')}.`
        )
  );

  return combina(medidas);
};

const ev07 = (context: ENSPolicyContext, ahora: number): Medida => {
  const estado = recientes(hechos(context, 'execution_control_status', 'EV-07'), ahora)[0];

  if (!estado) {
    return sinMedir(
      degradacion(context, 'EV-07', ahora) ||
        'No consta el estado de ningún mecanismo de lista blanca: el agente no ha emitido `execution_control_status` en la ventana.'
    );
  }

  const mecanismo = campo(estado, 'mecanismo');
  const medidas: Medida[] = [];

  if (!mecanismo || mecanismo === 'ninguno') {
    medidas.push(
      noCumple(
        `No hay ningún mecanismo de lista blanca de ejecución en el equipo${campo(estado, 'confinamiento_apparmor') === 'si' ? ' (AppArmor está activo, pero confina programas concretos: no impide ejecutar lo que no está autorizado)' : ''}.`
      )
    );
  } else if (campo(estado, 'activo') !== 'si') {
    medidas.push(noCumple(`${mecanismo} está instalado y no está en ejecución: no impide nada.`));
  } else if (campo(estado, 'modo') !== 'aplicacion') {
    medidas.push(
      noCumple(`${mecanismo} está en modo ${campo(estado, 'modo') || 'desconocido'}: registra las ejecuciones no autorizadas pero no las impide.`)
    );
  }

  // Ejecuciones que el mecanismo dejó pasar, contra la ruta de P-08.
  const permitidas = recientes(hechos(context, 'execution_observed', 'EV-07'), ahora).filter(
    e => campo(e, 'decision') === 'permitida'
  );

  if (permitidas.length) {
    const autorizadas = (filas(context, 'P-08') || []).map(f => f.ruta).filter(Boolean);

    if (!autorizadas.length) {
      medidas.push(
        sinMedir(
          `${permitidas.length} ejecución(es) fuera de la lista del mecanismo no se bloquearon, y ${etiqueta(context, 'P-08')} está vacío: no se puede decir si estaban autorizadas.`
        )
      );
    } else {
      const fuera = permitidas.filter(e => !autorizadas.includes(campo(e, 'ruta')));

      if (fuera.length) {
        medidas.push(
          noCumple(
            `Ejecuciones no bloqueadas de binarios que no figuran en ${etiqueta(context, 'P-08')}: ${lista(fuera.map(e => `${campo(e, 'ruta')} (${campo(e, 'fecha')})`))}.`
          )
        );
      }
    }
  }

  if (medidas.length) {
    return combina(medidas);
  }

  if (!cubierta(context, 'EV-07', ahora)) {
    return sinMedir(
      degradacion(context, 'EV-07', ahora) ||
        `${mecanismo} está en modo aplicación, pero el último latido no declara haber leído sus decisiones.`
    );
  }

  return cumple(
    `${mecanismo} está activo y en modo aplicación, y no ha dejado pasar ninguna ejecución fuera de la lista autorizada.`
  );
};

// La fila de P-09 de una capacidad, si la hay.
const filaEdr = (
  context: ENSPolicyContext,
  capacidad: string
): Record<string, string> | undefined =>
  (filas(context, 'P-09') || []).find(f => f.capacidad === capacidad);

const capacidadObservada = (
  context: ENSPolicyContext,
  evidencia: string,
  ahora: number
): ENSNormalizedEvent | undefined =>
  recientes(hechos(context, 'edr_capability_observed', evidencia), ahora)[0];

const declarada = (fila: Record<string, string> | undefined, capacidad: string): string =>
  fila
    ? ` P-09 la declara ${fila.activada === 'si' ? 'activada' : 'no activada'}${fila.alcance ? ` con alcance «${fila.alcance}»` : ''}.`
    : ` P-09 no tiene fila para «${capacidad}».`;

const ev08 = (context: ENSPolicyContext, ahora: number): Medida => {
  const fila = filaEdr(context, 'virustotal');

  if (!fila) {
    return sinMedir(
      `${etiqueta(context, 'P-09')} no declara si la consulta reputacional a VirusTotal está activada, y el equipo no puede verlo: la hace el manager.`
    );
  }

  if (fila.activada !== 'si') {
    return noCumple(
      `${etiqueta(context, 'P-09')} declara la consulta reputacional a VirusTotal como no activada: falta esa capacidad de detección.`
    );
  }

  return sinMedir(
    `${etiqueta(context, 'P-09')} declara VirusTotal activado${fila.alcance ? ` (${fila.alcance})` : ''}, pero la consulta la hace el manager y su resultado no llega al equipo: no se puede demostrar desde aquí. ${degradacion(context, 'EV-08', ahora) || ''}`.trim()
  );
};

const ev09 = (context: ENSPolicyContext, ahora: number): Medida => {
  const fila = filaEdr(context, 'yara');
  const obs = capacidadObservada(context, 'EV-09', ahora);

  if (!obs) {
    return sinMedir(
      degradacion(context, 'EV-09', ahora) ||
        'No consta ninguna observación de la capacidad YARA en el equipo.'
    );
  }

  const coincidencias = hechos(context, 'content_rule_match', 'EV-09').length;

  if (campo(obs, 'desplegada') !== 'si') {
    return noCumple(`El análisis de contenido con YARA no está desplegado en el equipo: ${campo(obs, 'detalle')}.${declarada(fila, 'yara')}`);
  }

  return cumple(
    `El análisis de contenido con YARA está desplegado en el equipo (${campo(obs, 'detalle')}), con ${coincidencias} coincidencia(s) en la ventana.${declarada(fila, 'yara')}`
  );
};

const ev10 = (context: ENSPolicyContext, ahora: number): Medida => {
  const fila = filaEdr(context, 'rootcheck');
  const obs = capacidadObservada(context, 'EV-10', ahora);

  if (!obs) {
    return sinMedir(
      degradacion(context, 'EV-10', ahora) ||
        'No consta ninguna observación de rootcheck en el equipo.'
    );
  }

  if (campo(obs, 'desplegada') !== 'si') {
    return noCumple(`rootcheck no se está ejecutando en el equipo: ${campo(obs, 'detalle')}.${declarada(fila, 'rootcheck')}`);
  }

  const bases = campo(obs, 'bases');

  if (bases && bases !== 'ninguno') {
    return noCumple(
      `rootcheck se ejecuta (${campo(obs, 'detalle')}) sin sus bases de firmas (${bases.replace(/sin_/g, 'falta ')}): las comprobaciones de ficheros de rootkits y de binarios troyanizados no se pueden hacer.${declarada(fila, 'rootcheck')}`
    );
  }

  return sinMedir(
    `rootcheck se ejecuta con sus bases (${campo(obs, 'detalle')}), pero sus hallazgos se envían al manager y no quedan en el equipo: no se puede afirmar desde aquí que no haya actividad sospechosa sin detectar.${declarada(fila, 'rootcheck')}`
  );
};

const ev11 = (context: ENSPolicyContext, ahora: number): Medida => {
  const fila = filaEdr(context, 'active_response');
  const obs = capacidadObservada(context, 'EV-11', ahora);

  if (!obs) {
    return sinMedir(
      degradacion(context, 'EV-11', ahora) ||
        'No consta ninguna observación de la respuesta activa en el equipo.'
    );
  }

  const ejecutadas = hechos(context, 'active_response_executed', 'EV-11');

  if (campo(obs, 'desplegada') !== 'si') {
    return noCumple(`No hay contención automática desplegada en el equipo: ${campo(obs, 'detalle')}.${declarada(fila, 'active_response')}`);
  }

  return cumple(
    `Hay contención automática desplegada en el equipo: ${campo(obs, 'detalle')}. ${ejecutadas.length} ejecución(es) en la ventana.${declarada(fila, 'active_response')}`
  );
};

const ev12 = (context: ENSPolicyContext, ahora: number): Medida => {
  const medidas: Medida[] = [];
  const vias = (filas(context, 'P-05') || []).map(f => f.via).filter(Boolean);
  const politica = seleccion(context, 'P-10');
  const conexiones = recientes(hechos(context, 'removable_device_connected', 'EV-12'), ahora);
  const leidos = cubierta(context, 'EV-12', ahora);

  if (conexiones.length) {
    const texto = lista(conexiones.map(e => `${campo(e, 'dispositivo')} (${campo(e, 'fecha')})`));

    if (!politica) {
      medidas.push(
        sinMedir(`Se han conectado dispositivos extraíbles (${texto}) y ${etiqueta(context, 'P-10')} está sin configurar.`)
      );
    } else if (politica === 'bloqueados') {
      medidas.push(
        noCumple(`${etiqueta(context, 'P-10')} los declara bloqueados y el kernel ha montado dispositivos extraíbles: ${texto}.`)
      );
    } else if (politica === 'permitidos_con_analisis') {
      const rt = recientes(hechos(context, 'antimalware_setting', 'EV-03'), ahora).find(
        e => (campo(e, 'plano') || 'sistema') === 'sistema' && campo(e, 'ajuste') === 'proteccion_tiempo_real'
      );

      medidas.push(
        rt && campo(rt, 'valor') === 'si'
          ? cumple(`Los dispositivos extraíbles conectados (${texto}) los analiza la protección en tiempo real del sistema.`)
          : noCumple(`Se han conectado dispositivos extraíbles (${texto}) y no hay protección en tiempo real que los analice al montarlos.`)
      );
    } else {
      medidas.push(
        sinMedir(`Se han conectado dispositivos extraíbles (${texto}); que se montaran solo en lectura no se observa desde el agente.`)
      );
    }
  }

  if (!vias.length) {
    medidas.push(
      sinMedir(`${etiqueta(context, 'P-05')} no declara ninguna vía de entrada de ficheros externos.`)
    );

    return combina(medidas);
  }

  const correo = recientes(hechos(context, 'external_file_scanned', 'EV-12'), ahora).filter(
    e => campo(e, 'via') === 'correo'
  );

  const pendientes: string[] = [];

  vias.forEach(via => {
    if (via === 'correo') {
      if (correo.length) {
        // El agente cuenta los mensajes por pasada (`analizados`): un hecho por
        // mensaje sería ruido en un servidor de correo.
        const mensajes = correo.reduce((total, e) => {
          const n = Number(campo(e, 'analizados'));

          return total + (Number.isFinite(n) && n > 0 ? n : 1);
        }, 0);

        medidas.push(cumple(`La pasarela de correo de este equipo ha analizado ${mensajes} mensaje(s) en la ventana (${correo.length} pasada(s) del recolector).`));
      } else {
        pendientes.push('correo (este equipo no analiza correo, o no en la ventana)');
      }

      return;
    }

    if (via === 'dispositivos_extraibles') {
      if (!leidos) {
        pendientes.push('dispositivos_extraibles (el último latido no declara haber leído el registro del kernel)');
      } else if (!conexiones.length) {
        medidas.push(cumple('El registro del kernel se ha leído y no se ha conectado ningún dispositivo extraíble en la ventana.'));
      }

      return;
    }

    pendientes.push(`${via} (se analiza fuera de este equipo)`);
  });

  if (pendientes.length) {
    medidas.push(
      sinMedir(`Vías de ${etiqueta(context, 'P-05')} que este equipo no puede demostrar: ${lista(pendientes)}.`)
    );
  }

  return combina(medidas);
};

// --- decisiones ------------------------------------------------------------

type Evidencias = Record<string, Medida>;

// La medida de una evidencia juzgada por primitiva, tal como la dejó su
// primitiva. Aquí no se re-juzga.
const deLaPrimitiva = (context: ENSPolicyContext, id: string): Medida => {
  const evidencia = context.evidences.find(e => e.id === id);
  const estado = evidencia?.status;
  const motivo = evidencia?.observations?.filter(o => !o.startsWith('Pregunta de auditoría')).slice(1).join(' ') || '';

  if (estado === 'CUMPLE') return cumple(motivo);
  if (estado === 'NO_CUMPLE' || estado === 'PARCIAL') return noCumple(motivo);

  return sinMedir(motivo || `${id} no se ha podido medir.`);
};

const PRIMITIVAS = ['EV-01', 'EV-03'];

// Los requisitos que rigen en algún nivel. R5 no rige en ninguno: el motor lo
// saca como NO_APLICA antes de mirar la policy.
const REQUISITOS: Record<string, { evidencias: string[]; parametros: string[]; tipo: ENSPolicyDecision['trace']['ruleType'] }> = {
  'op.exp.6.1': { evidencias: ['EV-01', 'EV-04', 'EV-10', 'EV-11'], parametros: ['P-01', 'P-02', 'P-09'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.2': { evidencias: ['EV-01'], parametros: ['P-01', 'P-02'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.3': { evidencias: ['EV-08', 'EV-12'], parametros: ['P-05', 'P-09', 'P-10'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.4': { evidencias: ['EV-02'], parametros: ['P-03'], tipo: 'MAX_AGE' },
  'op.exp.6.5': { evidencias: ['EV-03'], parametros: ['P-04'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.r1.1': { evidencias: ['EV-05'], parametros: ['P-06'], tipo: 'MAX_AGE' },
  'op.exp.6.r2.1': { evidencias: ['EV-06'], parametros: ['P-07'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.r3.1': { evidencias: ['EV-07'], parametros: ['P-08'], tipo: 'WHITELIST' },
  'op.exp.6.r4.1': { evidencias: ['EV-08', 'EV-09', 'EV-10', 'EV-11'], parametros: ['P-09'], tipo: 'COVERAGE_REQUIRED' },
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

  const medidas: Evidencias = {
    'EV-01': deLaPrimitiva(context, 'EV-01'),
    'EV-02': ev02(context, ahora),
    'EV-03': deLaPrimitiva(context, 'EV-03'),
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

    // Y una por evidencia medida aquí, con SU estado, para que la tabla de
    // evidencias diga lo que se midió de cada una y no el agregado. Las de
    // primitiva ya tienen su veredicto y no se repiten.
    propias
      .filter(p => !PRIMITIVAS.includes(p.id))
      .forEach(p =>
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

export const opExp6PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.exp.6.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-09'],
      evidenceIds: ['EV-01', 'EV-04', 'EV-10', 'EV-11'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05', 'P-09', 'P-10'],
      evidenceIds: ['EV-08', 'EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-02'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.6.5',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      // Refuerzos acumulativos: MEDIA «+ R1 + R2», ALTA «+ R1 + R2 + R3 + R4».
      requirementId: 'op.exp.6.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.6.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-07'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.6.r4.1',
      levels: ['ALTO'],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-08', 'EV-09', 'EV-10', 'EV-11'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    // R5 lo define el ENS pero no lo exige en ninguna categoría: sin niveles,
    // el motor lo evalúa NO_APLICA.
    {
      requirementId: 'op.exp.6.r5.1',
      levels: [],
      parameterIds: ['P-10'],
      evidenceIds: ['EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.r5.2',
      levels: [],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
