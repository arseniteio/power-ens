/**
 * Los motivos de las no conformidades, partidos para leerlos (diagnóstico de
 * 17/10, §4):
 *
 *   npx --yes tsx tests/motive-parser.test.ts
 *
 *   1. Los 14 ejemplos reales del diagnóstico (con los nombres de máquina,
 *      rutas y direcciones cambiados por otros de ejemplo): prefijo de
 *      máquinas, prefijo del puente, partes por evidencia, «Además», listas,
 *      parámetros, fechas y pregunta de auditoría.
 *   2. NADA SE PIERDE: `motiveToText(parseMotive(t)) === t` en todos, y la
 *      lista y las partes son cortes del texto, no reescrituras.
 *   3. Cada plantilla de motivo de las policies (extraídas del código): sola,
 *      compuesta con otra (`compositeReason`), con el prefijo del puente y el
 *      de máquinas; las partes son las que publica la policy (`reasonPartsOf`).
 *   4. Las partes publicadas (`reasonParts`) mandan cuando existen; las
 *      policies compuestas las publican y su texto no cambia.
 *   5. Lo que la tarjeta usa: la parte culpable, el «se pedía» genérico, la
 *      acción genérica, las fechas.
 */
import { readFileSync, readdirSync } from 'fs';
import {
  describeAction,
  findList,
  guiltyPart,
  isGenericExpectation,
  motiveToText,
  parseMotive,
  splitTimestamps,
} from '../common/ens/evaluation/motive-parser';
import { withReasonParts, compositeReason, reasonPartsOf } from '../common/ens/core/policy-runtime/policies/policy-kit';

declare const process: { exit(code: number): void };
declare const __dirname: string;
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) fallos.push(n);
};

// La lista es un corte exacto del texto de la parte.
const listaExacta = (texto: string, lista?: { start: number; end: number; values: string[]; more?: number }) =>
  !lista || texto.slice(lista.start, lista.end) === lista.values.join('; ') + (lista.more !== undefined ? ` y ${lista.more} más` : '');
const sinPerdida = (t: string) => {
  const m = parseMotive(t);
  return motiveToText(m) === t && m.parts.every(p => p.summary + (p.detail ? ` ${p.detail}` : '') === p.text && listaExacta(p.text, p.list));
};

const PUENTE = (policy: string, req: string) => `Resuelta por la política del control (${policy}), que mide esta evidencia junto a ${req}: `;

// --- 1. Los ejemplos del diagnóstico (§4), con datos de ejemplo -------------
const EJ = {
  e1: `${PUENTE('policy.op.exp.6', 'op.exp.6.1')}EV-01 NO_EVALUABLE: El parámetro P-02 (cobertura_esperada_antimalware) está sin configurar. Se han observado 1 hecho(s) ('srv-web01 | sistema'), pero sin el valor de referencia no hay contra qué contrastarlos. | EV-04 CUMPLE: Los logs de detección se han leído en las últimas 24 h. | EV-10 NO_EVALUABLE: rootcheck se ejecuta (ultima pasada 2026-10-17T06:03:34Z), pero P-09 la declara activada con alcance «grupo ens con rootkit_files.txt y rootkit_trojans.txt; sin excepciones». | EV-11 NO_CUMPLE: La respuesta que el manager configura llama a quarantine.sh; yara.sh no existe en /var/ossec/active-response/bin/ del agente.`,
  e2: `EV-01 NO_CUMPLE: «cambios de configuración» está declarada auditable y no se audita del todo: auditd no está en marcha (deshabilitado_en_kernel), así que nada registra la escritura en /etc/ssh; /etc/pam.d; /etc/security; /etc/login.defs; /etc/sudoers; /etc/sudoers.d; /etc/audit; /var/ossec/etc/ossec.conf y 13 más. | EV-03 CUMPLE: El registro central conserva 30 días. | EV-04 NO_CUMPLE: Servidores de P-02 sin latido continuo con el manager: ldap01: laguna en 4 de 4 pasadas desde 2026-10-17T11:47:14.756Z (plazo 3 h); último keepalive 2026-10-15T13:00:58Z, 49.8 h antes (disconnected). | EV-13 CUMPLE: La hora está sincronizada.`,
  e3: `No se exige doble factor donde op.acc.6.r2.1 lo pide: el canal ssh de srv-web01 escucha en 2001:db8::1; 192.0.2.10; fe80::1 y admite 1 factor.`,
  e4: `Se ha observado '/home/usuario/.ssh', que no figura en la columna 'ruta' de P-02 (rutas_almacenes_claves).`,
  e5: `No se ha podido contrastar: '/home/usuario/.ssh' no figura en la tabla del parámetro P-02 (rutas_almacenes_claves): no hay decisión declarada contra la que contrastarlo.`,
  e6: `Sin datos del recolector desde 2026-10-15 12:47 UTC: el último latido de op.exp.6 en esta máquina tiene más de 24 h y lo que envió entonces no demuestra su estado a fecha de la evaluación.`,
  e7: `EV-01 CUMPLE: wazuh-manager activo. Recibe por secure:1514/tcp; 2 de 12 agentes activos. Recolecta: El motor de análisis procesó 2558 eventos entre 2026-10-17T13:33:01.660Z y 2026-10-17T14:33:04.176Z.`,
  e8: `El requisito op.mon.2.1 no se ha podido demostrar: falta configurar lo que el responsable tiene que decidir. Sin esa decisión escrita no hay contra qué contrastar, y lo que no se demuestra no cumple.`,
  e9: `El requisito op.mon.3.1 no se ha podido demostrar: no ha llegado ningún dato para EV-01, EV-02. Es un fallo de RECOGIDA —agente sin reportar, recolector sin ejecutar o sin latido—, NO un hallazgo sobre la máquina, pero sin la prueba el requisito no se puede dar por cumplido.`,
  e10: `El requisito op.nub.1.1 no declara ninguna evidencia en el catálogo: no hay nada con lo que demostrarlo, y lo que no se demuestra no cumple.`,
  e11: `[3 máquinas: win01 (029), desk01 (033), copias01 (034)] ${PUENTE('policy.op.exp.4', 'op.exp.4.1')}EV-01 NO_EVALUABLE: No consta ningún inventario del Vulnerability Detector en los últimos 7 días.`,
  e12: `El requisito op.acc.1.2 se ha medido y no conforma.`,
  e13: `EV-04 NO_CUMPLE: 028 (ldap01, 028) estuvo 3 h 2 min sin servicio, por encima del RTO de P-03. Además: La medición de la prueba simulacro no consta en el registro.`,
  e14: `Pregunta de auditoría: ¿Puede el equipo contener automáticamente una detección con una respuesta activa desplegada?`,
};

console.log('1. Los ejemplos del diagnóstico');
{
  const p1 = parseMotive(EJ.e1);
  comprueba('1: el puente es el prefijo (policy y requisito), no el titular', p1.policy?.policyId === 'policy.op.exp.6' && p1.policy.requirementId === 'op.exp.6.1');
  comprueba('1: cuatro partes, una por evidencia, con su estado', JSON.stringify(p1.parts.map(p => [p.evidenceId, p.status])) === JSON.stringify([['EV-01', 'NO_EVALUABLE'], ['EV-04', 'CUMPLE'], ['EV-10', 'NO_EVALUABLE'], ['EV-11', 'NO_CUMPLE']]), p1.parts.map(p => p.evidenceId));
  comprueba("1: ' | ' dentro de un valor ('srv-web01 | sistema') no parte", p1.parts[0].text.includes("('srv-web01 | sistema')"));
  comprueba('1: la culpable de EV-11 es EV-11, no la primera', guiltyPart(p1.parts, ['EV-11'])?.evidenceId === 'EV-11');
  comprueba('1: sin evidencia dada, la culpable es la NO_CUMPLE', guiltyPart(p1.parts)?.evidenceId === 'EV-11');
  comprueba('1: titular de EV-01 = su primera frase; el resto, detalle', p1.parts[0].summary === 'El parámetro P-02 (cobertura_esperada_antimalware) está sin configurar.' && /^Se han observado/.test(p1.parts[0].detail));
  comprueba('1: parámetros P-02 (con nombre) y P-09', JSON.stringify(p1.parts[0].parameters) === JSON.stringify([{ id: 'P-02', label: 'cobertura_esperada_antimalware' }]) && p1.parts[2].parameters.some(p => p.id === 'P-09'));
  comprueba('1: la fecha de EV-10', JSON.stringify(p1.parts[2].timestamps) === JSON.stringify(['2026-10-17T06:03:34Z']));
  const p2 = parseMotive(EJ.e2);
  comprueba('2: cuatro partes', p2.parts.length === 4 && p2.parts.map(p => p.evidenceId).join() === 'EV-01,EV-03,EV-04,EV-13');
  comprueba('2: la lista de rutas con «y 13 más»', p2.parts[0].list?.values.length === 8 && p2.parts[0].list?.more === 13 && p2.parts[0].list?.values[0] === '/etc/ssh' && p2.parts[0].list?.values[7] === '/var/ossec/etc/ossec.conf', p2.parts[0].list);
  comprueba('2: «49.8 h» no corta la frase; dos fechas en EV-04', !p2.parts[2].summary.endsWith('49.') && p2.parts[2].timestamps.length === 2, p2.parts[2].summary);
  const p3 = parseMotive(EJ.e3);
  comprueba('3: una parte, sin evidencia; la lista de direcciones (IPv6 con «:»)', p3.parts.length === 1 && !p3.parts[0].evidenceId && JSON.stringify(p3.parts[0].list?.values) === JSON.stringify(['2001:db8::1', '192.0.2.10', 'fe80::1']), p3.parts[0].list);
  comprueba('4: el parámetro con su nombre', JSON.stringify(parseMotive(EJ.e4).parts[0].parameters) === JSON.stringify([{ id: 'P-02', label: 'rutas_almacenes_claves' }]));
  comprueba('5: una frase', parseMotive(EJ.e5).parts[0].detail === '');
  comprueba('6: sin ISO (fecha UTC legible), sin fechas que formatear', parseMotive(EJ.e6).parts[0].timestamps.length === 0);
  const p7 = parseMotive(EJ.e7);
  comprueba('7: «activo.» corta la primera frase; dos fechas con milisegundos', p7.parts[0].summary === 'wazuh-manager activo.' && p7.parts[0].timestamps.length === 2);
  comprueba('8: hallazgo de configuración, primera frase', /falta configurar lo que el responsable tiene que decidir\.$/.test(parseMotive(EJ.e8).parts[0].summary));
  comprueba('9: «—» y RECOGIDA, una parte', parseMotive(EJ.e9).parts.length === 1);
  comprueba('10: catálogo, una parte', parseMotive(EJ.e10).parts.length === 1);
  const p11 = parseMotive(EJ.e11);
  comprueba('11: prefijo de máquinas aparte, puente aparte, una parte', p11.machines === '3 máquinas: win01 (029), desk01 (033), copias01 (034)' && p11.policy?.policyId === 'policy.op.exp.4' && p11.parts.length === 1 && p11.parts[0].evidenceId === 'EV-01');
  comprueba('12: el genérico, una parte', parseMotive(EJ.e12).parts[0].summary === EJ.e12);
  const p13 = parseMotive(EJ.e13);
  comprueba('13: «Además» aparte', p13.parts[0].secondary === 'La medición de la prueba simulacro no consta en el registro.' && /RTO de P-03\.$/.test(p13.parts[0].text), p13.parts[0]);
  const p14 = parseMotive(EJ.e14);
  comprueba('14: pregunta de auditoría, sin partes', p14.question?.startsWith('¿Puede el equipo') && p14.parts.length === 0);
}

console.log('2. Nada se pierde');
{
  const todos = Object.entries(EJ);
  const malos = todos.filter(([, t]) => !sinPerdida(t)).map(([k]) => k);
  comprueba(`los ${todos.length} ejemplos vuelven a su texto exacto`, malos.length === 0, malos);
  comprueba('con el prefijo de una sola máquina también', sinPerdida(`[srv-web01 (101)] ${EJ.e2}`) && parseMotive(`[srv-web01 (101)] ${EJ.e2}`).machines === 'srv-web01 (101)');
  comprueba('un texto vacío', sinPerdida('') && parseMotive('').parts.length === 1);
  comprueba('dos frases separadas por «; » no son una lista', findList('Falta el plan; se pidió en marzo. Sin él no hay prueba.') === undefined);
}

console.log('3. Cada plantilla de motivo de las policies');
{
  const DIR = `${__dirname}/../common/ens/core/policy-runtime/policies`;
  const plantillas: { fichero: string; texto: string }[] = [];
  // Lee el literal (con comillas o plantilla) que empieza en `i`.
  const literal = (s: string, i: number): { texto: string; fin: number } | undefined => {
    const q = s[i];
    if (q === "'" || q === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== q) j += s[j] === '\\' ? 2 : 1;
      return { texto: s.slice(i + 1, j), fin: j + 1 };
    }
    if (q !== '`') return undefined;
    let j = i + 1;
    let salida = '';
    while (j < s.length && s[j] !== '`') {
      if (s[j] === '\\') { salida += s[j + 1]; j += 2; continue; }
      if (s[j] === '$' && s[j + 1] === '{') {
        let prof = 1;
        let k = j + 2;
        while (k < s.length && prof > 0) {
          if (s[k] === '`') { const dentro = literal(s, k); k = dentro ? dentro.fin : k + 1; continue; }
          if (s[k] === '{') prof += 1;
          if (s[k] === '}') prof -= 1;
          k += 1;
        }
        const expr = s.slice(j + 2, k - 1);
        salida += /lista\(|formatList\(/.test(expr) ? 'srv-a; srv-b; srv-c y 2 más'
          : /etiqueta\(|parameterDisplayName\(/.test(expr) ? 'P-02 (nombre_del_parametro)'
          : /iso\(/.test(expr) ? '2026-10-17T06:03:34Z'
          : /horas\(|formatHours\(|toFixed/.test(expr) ? '9.0'
          : /\.length|dias\(|wholeDays\(|Math\./.test(expr) ? '3'
          : 'valor';
        j = k;
        continue;
      }
      salida += s[j];
      j += 1;
    }
    return { texto: salida, fin: j + 1 };
  };
  readdirSync(DIR).filter(f => f.endsWith('.ts')).forEach(f => {
    const s = readFileSync(`${DIR}/${f}`, 'utf8');
    for (const m of s.matchAll(/\b(?:cumple|noCumple|sinMedir|noAplica|compliant|nonCompliant|notMeasured|notApplicable)\(\s*|motivo: (?=[`'"])/g)) {
      const l = literal(s, m.index! + m[0].length);
      if (l && l.texto.trim()) plantillas.push({ fichero: f, texto: l.texto });
    }
  });
  comprueba(`plantillas extraídas de las policies (${plantillas.length})`, plantillas.length > 300, plantillas.length);
  const perdidas = plantillas.filter(p => !sinPerdida(p.texto));
  comprueba('cada plantilla sola vuelve a su texto exacto', perdidas.length === 0, perdidas.slice(0, 3));
  // Compuesta: la que se parte bien es la de la policy.
  let malas = 0;
  let ejemplo: unknown;
  plantillas.forEach((p, i) => {
    const otra = plantillas[(i * 7 + 3) % plantillas.length].texto;
    const propias = [
      { id: 'EV-01', medida: { estado: 'NO_EVALUABLE' as const, motivo: p.texto, causa: 'CONFIGURATION' as const } },
      { id: 'EV-11', medida: { estado: 'NO_CUMPLE' as const, motivo: `${otra} Además: ${p.texto}` } },
    ];
    const texto = `[2 máquinas: srv-a (101), srv-b (102)] ${PUENTE('policy.x', 'op.x.1')}${compositeReason(propias)}`;
    const m = parseMotive(texto);
    const partes = reasonPartsOf(propias);
    const iguales =
      m.parts.length === 2 &&
      m.parts.every((q, k) => q.evidenceId === partes[k].evidenceId && q.status === partes[k].status && q.text === partes[k].text && (q.secondary ?? undefined) === (partes[k].secondary?.[0] ?? undefined));
    if (!iguales || motiveToText(m) !== texto) {
      malas += 1;
      ejemplo = ejemplo || { texto: texto.slice(0, 300), partes: m.parts.map(q => [q.evidenceId, q.text.slice(0, 60)]) };
    }
  });
  comprueba('cada plantilla, compuesta con otra y con los dos prefijos: las partes del texto = las que publica la policy', malas === 0, { malas, ejemplo });
}

console.log('4. Las partes publicadas');
{
  const propias = [
    { id: 'EV-01', medida: { estado: 'CUMPLE' as const, motivo: 'Bien.' } },
    { id: 'EV-02', medida: { estado: 'NO_CUMPLE' as const, motivo: 'Valor «x | EV-09 CUMPLE: y» raro. Además: otra.' } },
  ];
  const motivo = compositeReason(propias);
  comprueba('el texto compuesto no cambia', motivo === 'EV-01 CUMPLE: Bien. | EV-02 NO_CUMPLE: Valor «x | EV-09 CUMPLE: y» raro. Además: otra.');
  const partes = reasonPartsOf(propias);
  comprueba('las partes separan «Además»', partes[1].text === 'Valor «x | EV-09 CUMPLE: y» raro.' && partes[1].secondary?.[0] === 'otra.');
  const adivinado = parseMotive(motivo);
  comprueba('sin partes, el texto se parte mal donde un valor imita una cabecera (3 partes)', adivinado.parts.length === 3);
  const publicado = parseMotive(`${PUENTE('p', 'op.x.1')}${motivo}`, [{ reason: motivo, parts: partes }]);
  comprueba('con las partes publicadas: 2 partes exactas, marcadas como estructuradas', publicado.structured && publicado.parts.length === 2 && publicado.parts[1].text === partes[1].text && motiveToText(publicado) === `${PUENTE('p', 'op.x.1')}${motivo}`);
  const d = withReasonParts({ reason: motivo } as any, partes);
  comprueba('withReasonParts conserva la decisión y añade reasonParts', d.reason === motivo && d.reasonParts === partes);
  const DIR = `${__dirname}/../common/ens/core/policy-runtime/policies`;
  const sinPartes = readdirSync(DIR).filter(f => f.endsWith('.policy.ts')).filter(f => {
    const s = readFileSync(`${DIR}/${f}`, 'utf8');
    return /\.map\(p => `\$\{p\.id\} \$\{p\.medida\.estado\}: \$\{p\.medida\.motivo\}`\)\.join\(' \| '\)/.test(s) && !/op-mon-3/.test(f);
  });
  comprueba('las policies con motivo compuesto lo hacen con compositeReason + reasonPartsOf (salvo op.mon.3, que antepone una parte sin evidencia y cubre el analizador)', sinPartes.length === 0, sinPartes);
}

console.log('5. Lo que usa la tarjeta');
{
  comprueba('«EV-01 CUMPLE y EV-03 CUMPLE» / NO_CUMPLE es el genérico', isGenericExpectation('EV-01 CUMPLE y EV-03 CUMPLE', 'NO_CUMPLE'));
  comprueba('«todo acceso con dos factores» no lo es', !isGenericExpectation('todo acceso con dos factores y ningún canal que admita uno solo', '1 caso(s) con un solo factor'));
  const culpable = parseMotive(EJ.e13).parts[0];
  comprueba('la acción genérica dice qué evidencia corregir', describeAction('Corregir para alcanzar: EV-01 CUMPLE y EV-04 CUMPLE. Valor actual: NO_CUMPLE.', culpable) === 'Corregir EV-04 (y lo que dice «Además») hasta que conforme.');
  comprueba('una acción concreta no se toca', describeAction('Configurar P-02 (x) en la pestaña Configuración.', culpable) === 'Configurar P-02 (x) en la pestaña Configuración.');
  const trozos = splitTimestamps('desde 2026-10-17T11:47:14.756Z (plazo 3 h); último 2026-10-15T13:00:58Z.');
  comprueba('las fechas, en trozos que unidos son el texto', trozos.map(t => t.text).join('') === 'desde 2026-10-17T11:47:14.756Z (plazo 3 h); último 2026-10-15T13:00:58Z.' && trozos.filter(t => t.iso).length === 2);
}

console.log(fallos.length ? `\n${fallos.length} FAILURES` : '\nALL OK');
process.exit(fallos.length ? 1 : 0);
