// EL MOTIVO DE UNA NO CONFORMIDAD, PARTIDO PARA LEERLO. Puro, en `common/`: lo
// usan la pantalla y el servidor (el titular de la cola de trabajo de la Vista
// general, `overview-fields.ts`). Sin React (lo prueba
// `tests/motive-parser.test.ts` con los ejemplos reales del diagnóstico y con
// cada plantilla de motivo de las policies).
//
// El motivo que llega a la pantalla es texto, y su gramática ya es regular:
//
//   [3 máquinas: a (024), b (028) y 1 más] ← la consolidación (vista general)
//   Resuelta por la política del control (policy.op.exp.6), que mide esta
//   evidencia junto a op.exp.6.1: ← el puente policy → evidencia
//   EV-01 NO_EVALUABLE: … | EV-11 NO_CUMPLE: … ← una parte por evidencia
//   … Además: … ← lo secundario (`combina`)
//   Pregunta de auditoría: … ← la pregunta del catálogo
//
// Dentro de cada parte: listas `a; b; c y N más` (`lista()`), parámetros
// `P-02 (nombre)` (`etiqueta()`) y fechas ISO (`iso()`).
//
// NO SE PIERDE NADA: el análisis solo CORTA el texto, nunca lo reescribe.
// `motiveToText(parseMotive(t)) === t` para cualquier `t` (lo comprueba la
// prueba sobre todos los motivos). Los campos derivados (lista, parámetros,
// fechas) son anotaciones con su posición, no sustituciones.
//
// Si la policy publicó las partes (`reasonParts`, ver `policy-kit.ts`), se usan
// esas en vez de partir el texto, pero SOLO si unidas son exactamente el texto:
// un motivo sustituido después (recolector parado, alcance, consolidación) no
// se pinta nunca con las partes de otro.

export const MOTIVE_STATUSES = ['CUMPLE', 'NO_CUMPLE', 'NO_EVALUABLE', 'NO_APLICA', 'PARCIAL'] as const;

export interface MotiveList {
  // Posición en el texto de la parte (sin «Además»): `text.slice(start, end)`
  // es exactamente `values.join('; ') + (more ? ` y ${more} más` : '')`.
  start: number;
  end: number;
  values: string[];
  more?: number;
}

export interface MotivePart {
  evidenceId?: string;
  status?: string;
  // El texto de la parte, sin `ID ESTADO: ` ni «Además: …».
  text: string;
  // La primera frase de `text` y el resto (summary + detail = text).
  summary: string;
  detail: string;
  secondary?: string;
  list?: MotiveList;
  parameters: { id: string; label?: string }[];
  timestamps: string[];
}

export interface ParsedMotive {
  raw: string;
  machines?: string;
  policy?: { policyId: string; requirementId: string };
  question?: string;
  parts: MotivePart[];
  // Las partes vienen de `reasonParts`, no del texto.
  structured: boolean;
}

// El texto que forman unas partes publicadas (como `motivoCompuesto`).
export const knownPartsText = (parts: KnownReasonParts['parts']): string =>
  parts
    .map(p => `${p.evidenceId} ${p.status}: ${p.text}${p.secondary?.length ? `${p.text ? ' ' : ''}Además: ${p.secondary.join(' ')}` : ''}`)
    .join(' | ');

export interface KnownReasonParts {
  reason: string;
  parts: { evidenceId: string; status: string; text: string; secondary?: string[] }[];
}

const MAQUINAS = /^\[((?:\d+ máquinas: )?[^\]]+)\] /;
const PUENTE = /^Resuelta por la política del control \(([^()]*)\), que mide esta evidencia junto a ([^\s:]+): /;
const PREGUNTA = 'Pregunta de auditoría: ';
const ESTADOS = MOTIVE_STATUSES.join('|');
const CABEZA = new RegExp(`^([A-Z]+-[\\w/.-]+) (${ESTADOS}): `);
// Solo se parte por ` | ` cuando lo sigue `ID ESTADO: ` (` | ` aparece también
// dentro de valores: `srv | MEDIA`).
const SEPARADOR = new RegExp(` \\| (?=[A-Z]+-[\\w/.-]+ (?:${ESTADOS}): )`, 'g');
const ADEMAS = 'Además: ';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z/g;
const PARAMETRO = /\b(P-\d{2})(?: \(([^()]+)\))?/g;
// Fin de frase: un punto tras minúscula, cifra con unidad, cierre de paréntesis
// o de comillas, seguido de espacio y mayúscula o «¿». No corta «9.0 h», IPs
// ni rutas. Sin «lookbehind» (no existe en Safari antes de 16.4).
const FIN_DE_FRASE = /[\p{Ll})»'"\d]\. (?=[\p{Lu}¿«])/u;

const primeraFrase = (texto: string): { summary: string; detail: string } => {
  const m = FIN_DE_FRASE.exec(texto);
  if (!m) return { summary: texto, detail: '' };
  const corte = m.index + 2;
  return { summary: texto.slice(0, corte), detail: texto.slice(corte + 1) };
};

// Una lista de `lista()` (`a; b; c y N más`) dentro del texto. Empieza tras
// «: » o « en » (lo que precede a `lista()` en las policies) o al principio; el
// último valor acaba en « y N más», en fin de frase, en «, », en « (» o en
// « y ». Solo se reconoce con tres valores o más, o con «y N más», y con
// valores cortos (rutas, cuentas, direcciones): dos frases separadas por «; »
// no son una lista.
const MAX_VALOR = 160;

export const findList = (texto: string): MotiveList | undefined => {
  const primero = texto.indexOf('; ');
  if (primero < 0) return undefined;
  const antes = texto.slice(0, primero);
  const candidatos = [antes.lastIndexOf(': ') + 2, antes.lastIndexOf(' en ') + 4].filter(i => i > 1);
  const start = candidatos.length ? Math.max(...candidatos) : 0;
  const trozos = texto.slice(start).split('; ');
  const ultimo = trozos[trozos.length - 1];
  const conMas = /^(.*?) y (\d+) más/.exec(ultimo);
  let ultimoValor: string;
  let more: number | undefined;
  if (conMas && conMas[1].length <= MAX_VALOR && !/\. |, /.test(conMas[1])) {
    ultimoValor = conMas[1];
    more = Number(conMas[2]);
  } else {
    const fin = /\. |, | \(| y |\.$/.exec(ultimo);
    ultimoValor = fin ? ultimo.slice(0, fin.index) : ultimo;
  }
  const values = [...trozos.slice(0, -1), ultimoValor];
  if (values.length < 3 && more === undefined) return undefined;
  if (values.some(v => !v.trim() || v.length > MAX_VALOR || /\. [\p{Lu}]/u.test(v))) return undefined;
  const cuerpo = values.join('; ') + (more !== undefined ? ` y ${more} más` : '');
  return { start, end: start + cuerpo.length, values, ...(more !== undefined ? { more } : {}) };
};

const anota = (texto: string) => ({
  parameters: Array.from(
    new Map(Array.from(texto.matchAll(PARAMETRO)).map(m => [m[1], { id: m[1], ...(m[2] ? { label: m[2] } : {}) }])).values()
  ).reduce<{ id: string; label?: string }[]>((acc, p) => {
    const previo = acc.find(x => x.id === p.id);
    if (!previo) acc.push(p);
    else if (!previo.label && p.label) previo.label = p.label;
    return acc;
  }, []),
  timestamps: Array.from(new Set(texto.match(ISO) || [])),
});

const parte = (texto: string, cabeza?: { evidenceId: string; status: string }, secundario?: string): MotivePart => {
  const { summary, detail } = primeraFrase(texto);
  const list = findList(texto);
  const notas = anota(`${texto}${secundario ? ` ${secundario}` : ''}`);
  return {
    ...(cabeza ? { evidenceId: cabeza.evidenceId, status: cabeza.status } : {}),
    text: texto,
    summary,
    detail,
    ...(secundario !== undefined ? { secondary: secundario } : {}),
    ...(list ? { list } : {}),
    ...notas,
  };
};

// «Además:» al principio, o tras un espacio y algo antes (desde la posición 1:
// con el espacio al principio no se parte, o el espacio se perdería).
const partirAdemas = (texto: string): { principal: string; secundario?: string } => {
  if (texto.startsWith(ADEMAS)) return { principal: '', secundario: texto.slice(ADEMAS.length) };
  const i = texto.indexOf(` ${ADEMAS}`, 1);
  return i < 0 ? { principal: texto } : { principal: texto.slice(0, i), secundario: texto.slice(i + 1 + ADEMAS.length) };
};

const partirSegmento = (segmento: string): MotivePart => {
  const m = CABEZA.exec(segmento);
  const cuerpo = m ? segmento.slice(m[0].length) : segmento;
  const { principal, secundario } = partirAdemas(cuerpo);
  return parte(principal, m ? { evidenceId: m[1], status: m[2] } : undefined, secundario);
};

export const parseMotive = (raw: string, known: KnownReasonParts[] = []): ParsedMotive => {
  let resto = raw;
  let machines: string | undefined;
  let policy: ParsedMotive['policy'];
  let question: string | undefined;

  const mq = MAQUINAS.exec(resto);
  if (mq) {
    machines = mq[1];
    resto = resto.slice(mq[0].length);
  }
  const pu = PUENTE.exec(resto);
  if (pu) {
    policy = { policyId: pu[1], requirementId: pu[2] };
    resto = resto.slice(pu[0].length);
  }
  if (resto.startsWith(PREGUNTA)) {
    question = resto.slice(PREGUNTA.length);
    return { raw, ...(machines ? { machines } : {}), ...(policy ? { policy } : {}), question, parts: [], structured: false };
  }

  const conocido = known.find(k => k.reason === resto && k.parts.length > 0 && knownPartsText(k.parts) === k.reason);
  if (conocido) {
    return {
      raw,
      ...(machines ? { machines } : {}),
      ...(policy ? { policy } : {}),
      structured: true,
      parts: conocido.parts.map(p => parte(p.text, { evidenceId: p.evidenceId, status: p.status }, p.secondary?.length ? p.secondary.join(' ') : undefined)),
    };
  }

  const segmentos = resto.split(SEPARADOR);
  return {
    raw,
    ...(machines ? { machines } : {}),
    ...(policy ? { policy } : {}),
    structured: false,
    parts: segmentos.map(partirSegmento),
  };
};

// El texto de vuelta, igual al original (la prueba de que no se pierde nada).
export const partToText = (p: Pick<MotivePart, 'evidenceId' | 'status' | 'text' | 'secondary'>): string =>
  `${p.evidenceId ? `${p.evidenceId} ${p.status}: ` : ''}${p.text}${
    p.secondary !== undefined ? `${p.text ? ' ' : ''}${ADEMAS}${p.secondary}` : ''
  }`;

export const motiveToText = (m: ParsedMotive): string =>
  `${m.machines ? `[${m.machines}] ` : ''}${m.policy ? `Resuelta por la política del control (${m.policy.policyId}), que mide esta evidencia junto a ${m.policy.requirementId}: ` : ''}${
    m.question !== undefined ? `${PREGUNTA}${m.question}` : m.parts.map(partToText).join(' | ')
  }`;

// La parte que hay que leer primero para una no conformidad: la de una de sus
// evidencias que NO cumple; si no, la primera que no conforma; si no, la
// primera.
export const guiltyPart = (parts: MotivePart[], evidenceIds: string[] = []): MotivePart | undefined =>
  parts.find(p => p.evidenceId && evidenceIds.includes(p.evidenceId) && p.status === 'NO_CUMPLE') ||
  parts.find(p => p.evidenceId && evidenceIds.includes(p.evidenceId) && p.status !== 'CUMPLE' && p.status !== 'NO_APLICA') ||
  parts.find(p => p.status === 'NO_CUMPLE') ||
  parts.find(p => p.status && p.status !== 'CUMPLE' && p.status !== 'NO_APLICA') ||
  parts[0];

// «Se pedía EV-01 CUMPLE y EV-04 CUMPLE / Hay NO_CUMPLE» no dice nada: es el
// genérico de los motivos compuestos. Se oculta y se enseñan las insignias.
export const isGenericExpectation = (expected?: string, actual?: string): boolean =>
  Boolean(expected) &&
  new RegExp(`^[A-Z]+-[\\w/.-]+ CUMPLE( y [A-Z]+-[\\w/.-]+ CUMPLE)*$`).test(expected as string) &&
  (!actual || new RegExp(`^(${ESTADOS})$`).test(actual));

// «Corregir para alcanzar: EV-01 CUMPLE y EV-03 CUMPLE. Valor actual: NO_CUMPLE.»
// tampoco: se dice qué evidencia corregir.
export const describeAction = (requiredAction: string, guilty?: MotivePart): string => {
  if (!/^Corregir para alcanzar: [A-Z]+-[\w/.-]+ CUMPLE( y [A-Z]+-[\w/.-]+ CUMPLE)*\. Valor actual: [A-Z_]+\.$/.test(requiredAction)) {
    return requiredAction;
  }
  if (!guilty?.evidenceId) return requiredAction;
  return `Corregir ${guilty.evidenceId}${guilty.secondary ? ' (y lo que dice «Además»)' : ''} hasta que conforme.`;
};

// El texto partido en trozos de texto y de fecha (para pintar la fecha en
// es-ES con la ISO en el `title`). Unidos, son el texto.
export const splitTimestamps = (texto: string): { text: string; iso?: string }[] => {
  const trozos: { text: string; iso?: string }[] = [];
  let desde = 0;
  for (const m of texto.matchAll(ISO)) {
    if (m.index! > desde) trozos.push({ text: texto.slice(desde, m.index) });
    trozos.push({ text: m[0], iso: m[0] });
    desde = m.index! + m[0].length;
  }
  if (desde < texto.length) trozos.push({ text: texto.slice(desde) });
  return trozos;
};

export const formatTimestamp = (iso: string): string => {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime())
    ? iso
    : fecha.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
