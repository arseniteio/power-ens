/** Nonconformity motives split into parts for reading. */
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
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) failures.push(n);
};

const exactList = (text: string, list?: { start: number; end: number; values: string[]; more?: number }) =>
  !list || text.slice(list.start, list.end) === list.values.join('; ') + (list.more !== undefined ? ` y ${list.more} más` : '');
const withoutLoss = (t: string) => {
  const m = parseMotive(t);
  return motiveToText(m) === t && m.parts.every(p => p.summary + (p.detail ? ` ${p.detail}` : '') === p.text && exactList(p.text, p.list));
};

const BRIDGE = (policy: string, req: string) => `Resuelta por la política del control (${policy}), que mide esta evidencia junto a ${req}: `;

const EJ = {
  e1: `${BRIDGE('policy.op.exp.6', 'op.exp.6.1')}EV-01 NO_EVALUABLE: El parámetro P-02 (cobertura_esperada_antimalware) está sin configurar. Se han observado 1 hecho(s) ('srv-web01 | sistema'), pero sin el valor de referencia no hay contra qué contrastarlos. | EV-04 CUMPLE: Los logs de detección se han leído en las últimas 24 h. | EV-10 NO_EVALUABLE: rootcheck se ejecuta (ultima pasada 2026-10-17T06:03:34Z), pero P-09 la declara activada con alcance «grupo ens con rootkit_files.txt y rootkit_trojans.txt; sin excepciones». | EV-11 NO_CUMPLE: La respuesta que el manager configura llama a quarantine.sh; yara.sh no existe en /var/ossec/active-response/bin/ del agente.`,
  e2: `EV-01 NO_CUMPLE: «cambios de configuración» está declarada auditable y no se audita del todo: auditd no está en marcha (deshabilitado_en_kernel), así que nada registra la escritura en /etc/ssh; /etc/pam.d; /etc/security; /etc/login.defs; /etc/sudoers; /etc/sudoers.d; /etc/audit; /var/ossec/etc/ossec.conf y 13 más. | EV-03 CUMPLE: El registro central conserva 30 días. | EV-04 NO_CUMPLE: Servidores de P-02 sin latido continuo con el manager: ldap01: laguna en 4 de 4 pasadas desde 2026-10-17T11:47:14.756Z (plazo 3 h); último keepalive 2026-10-15T13:00:58Z, 49.8 h antes (disconnected). | EV-13 CUMPLE: La hora está sincronizada.`,
  e3: `No se exige doble factor donde op.acc.6.r2.1 lo pide: el canal ssh de srv-web01 escucha en 2001:db8::1; 192.0.2.10; fe80::1 y admite 1 factor.`,
  e4: `Se ha observado '/home/usuario/.ssh', que no figura en la columna 'ruta' de P-02 (rutas_almacenes_claves).`,
  e5: `No se ha podido contrastar: '/home/usuario/.ssh' no figura en la tabla del parámetro P-02 (rutas_almacenes_claves): no hay decisión declarada contra la que contrastarlo.`,
  e6: `Sin datos del recolector desde 2026-10-15 12:47 UTC: el último latido de op.exp.6 en esta máquina tiene más de 24 h y lo que envió entonces no demuestra su estado a fecha de la evaluación.`,
  e7: `EV-01 CUMPLE: wazuh-manager activo. Recibe por secure:1514/tcp; 2 de 12 agentes activos. Recolecta: El motor de análisis procesó 2558 eventos entre 2026-10-17T13:33:01.660Z y 2026-10-17T14:33:04.176Z.`,
  e8: `El requisito op.mon.2.1 no se ha podido demostrar: falta configurar lo que el responsable tiene que decidir. Sin esa decisión escrita no hay contra qué contrastar, y lo que no se demuestra no cumple.`,
  e9: `El requisito op.mon.3.1 no se ha podido demostrar: no ha llegado ningún dato para EV-01, EV-02. Es un fallo de RECOGIDA —agente sin reportar, recolector sin ejecutar o sin latido—, NO un hallazgo sobre la máquina, pero sin la prueba el requisito no se puede dar por cumplido.`,
  e10: `El requisito op.nub.1.1 no declara ninguna evidencia en el catálogo: no hay nada con lo que demostrarlo, y lo que no se demuestra no cumple.`,
  e11: `[3 máquinas: win01 (029), desk01 (033), copias01 (034)] ${BRIDGE('policy.op.exp.4', 'op.exp.4.1')}EV-01 NO_EVALUABLE: No consta ningún inventario del Vulnerability Detector en los últimos 7 días.`,
  e12: `El requisito op.acc.1.2 se ha medido y no conforma.`,
  e13: `EV-04 NO_CUMPLE: 028 (ldap01, 028) estuvo 3 h 2 min sin servicio, por encima del RTO de P-03. Además: La medición de la prueba simulacro no consta en el registro.`,
  e14: `Pregunta de auditoría: ¿Puede el equipo contener automáticamente una detección con una respuesta activa desplegada?`,
};

console.log('1. The diagnosis examples');
{
  const p1 = parseMotive(EJ.e1);
  check('1: the bridge is the prefix (policy and requirement), not the headline', p1.policy?.policyId === 'policy.op.exp.6' && p1.policy.requirementId === 'op.exp.6.1');
  check('1: four parts, one per evidence, with its state', JSON.stringify(p1.parts.map(p => [p.evidenceId, p.status])) === JSON.stringify([['EV-01', 'NO_EVALUABLE'], ['EV-04', 'CUMPLE'], ['EV-10', 'NO_EVALUABLE'], ['EV-11', 'NO_CUMPLE']]), p1.parts.map(p => p.evidenceId));
  check("1: ' | ' inside a value ('srv-web01 | sistema') does not split", p1.parts[0].text.includes("('srv-web01 | sistema')"));
  check('1: EV-11\'s culprit is EV-11, not the first', guiltyPart(p1.parts, ['EV-11'])?.evidenceId === 'EV-11');
  check('1: with no evidence given, the culprit is the NO_CUMPLE', guiltyPart(p1.parts)?.evidenceId === 'EV-11');
  check('1: EV-01 headline = its first sentence; the rest, detail', p1.parts[0].summary === 'El parámetro P-02 (cobertura_esperada_antimalware) está sin configurar.' && /^Se han observado/.test(p1.parts[0].detail));
  check('1: parameters P-02 (named) and P-09', JSON.stringify(p1.parts[0].parameters) === JSON.stringify([{ id: 'P-02', label: 'cobertura_esperada_antimalware' }]) && p1.parts[2].parameters.some(p => p.id === 'P-09'));
  check('1: EV-10\'s date', JSON.stringify(p1.parts[2].timestamps) === JSON.stringify(['2026-10-17T06:03:34Z']));
  const p2 = parseMotive(EJ.e2);
  check('2: four parts', p2.parts.length === 4 && p2.parts.map(p => p.evidenceId).join() === 'EV-01,EV-03,EV-04,EV-13');
  check('2: the list of paths with «y 13 más»', p2.parts[0].list?.values.length === 8 && p2.parts[0].list?.more === 13 && p2.parts[0].list?.values[0] === '/etc/ssh' && p2.parts[0].list?.values[7] === '/var/ossec/etc/ossec.conf', p2.parts[0].list);
  check('2: «49.8 h» does not cut the sentence; two dates in EV-04', !p2.parts[2].summary.endsWith('49.') && p2.parts[2].timestamps.length === 2, p2.parts[2].summary);
  const p3 = parseMotive(EJ.e3);
  check('3: one part, no evidence; the address list (IPv6 with «:»)', p3.parts.length === 1 && !p3.parts[0].evidenceId && JSON.stringify(p3.parts[0].list?.values) === JSON.stringify(['2001:db8::1', '192.0.2.10', 'fe80::1']), p3.parts[0].list);
  check('4: the parameter with its name', JSON.stringify(parseMotive(EJ.e4).parts[0].parameters) === JSON.stringify([{ id: 'P-02', label: 'rutas_almacenes_claves' }]));
  check('5: una frase', parseMotive(EJ.e5).parts[0].detail === '');
  check('6: without ISO (readable UTC date), no dates to format', parseMotive(EJ.e6).parts[0].timestamps.length === 0);
  const p7 = parseMotive(EJ.e7);
  check('7: «activo.» cuts the first sentence; two dates with milliseconds', p7.parts[0].summary === 'wazuh-manager activo.' && p7.parts[0].timestamps.length === 2);
  check('8: configuration finding, first sentence', /falta configurar lo que el responsable tiene que decidir\.$/.test(parseMotive(EJ.e8).parts[0].summary));
  check('9: «—» and RECOGIDA, one part', parseMotive(EJ.e9).parts.length === 1);
  check('10: catalog, one part', parseMotive(EJ.e10).parts.length === 1);
  const p11 = parseMotive(EJ.e11);
  check('11: machine prefix apart, bridge apart, one part', p11.machines === '3 máquinas: win01 (029), desk01 (033), copias01 (034)' && p11.policy?.policyId === 'policy.op.exp.4' && p11.parts.length === 1 && p11.parts[0].evidenceId === 'EV-01');
  check('12: the generic one, one part', parseMotive(EJ.e12).parts[0].summary === EJ.e12);
  const p13 = parseMotive(EJ.e13);
  check('13: «Además» apart', p13.parts[0].secondary === 'La medición de la prueba simulacro no consta en el registro.' && /RTO de P-03\.$/.test(p13.parts[0].text), p13.parts[0]);
  const p14 = parseMotive(EJ.e14);
  check('14: audit question, no parts', p14.question?.startsWith('¿Puede el equipo') && p14.parts.length === 0);
}

console.log('2. Nothing is lost');
{
  const all = Object.entries(EJ);
  const bad = all.filter(([, t]) => !withoutLoss(t)).map(([k]) => k);
  check(`the ${all.length} examples return to their exact text`, bad.length === 0, bad);
  check('with a single machine\'s prefix too', withoutLoss(`[srv-web01 (101)] ${EJ.e2}`) && parseMotive(`[srv-web01 (101)] ${EJ.e2}`).machines === 'srv-web01 (101)');
  check('an empty text', withoutLoss('') && parseMotive('').parts.length === 1);
  check('two sentences separated by «; » are not a list', findList('Falta el plan; se pidió en marzo. Sin él no hay prueba.') === undefined);
}

console.log('3. Each policy motive template');
{
  const DIR = `${__dirname}/../common/ens/core/policy-runtime/policies`;
  const templates: { fichero: string; texto: string }[] = [];
  const literal = (s: string, i: number): { texto: string; fin: number } | undefined => {
    const q = s[i];
    if (q === "'" || q === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== q) j += s[j] === '\\' ? 2 : 1;
      return { texto: s.slice(i + 1, j), fin: j + 1 };
    }
    if (q !== '`') return undefined;
    let j = i + 1;
    let output = '';
    while (j < s.length && s[j] !== '`') {
      if (s[j] === '\\') { output += s[j + 1]; j += 2; continue; }
      if (s[j] === '$' && s[j + 1] === '{') {
        let prof = 1;
        let k = j + 2;
        while (k < s.length && prof > 0) {
          if (s[k] === '`') { const inside = literal(s, k); k = inside ? inside.fin : k + 1; continue; }
          if (s[k] === '{') prof += 1;
          if (s[k] === '}') prof -= 1;
          k += 1;
        }
        const expr = s.slice(j + 2, k - 1);
        output += /lista\(|formatList\(/.test(expr) ? 'srv-a; srv-b; srv-c y 2 más'
          : /etiqueta\(|parameterDisplayName\(/.test(expr) ? 'P-02 (nombre_del_parametro)'
          : /iso\(/.test(expr) ? '2026-10-17T06:03:34Z'
          : /horas\(|formatHours\(|toFixed/.test(expr) ? '9.0'
          : /\.length|dias\(|wholeDays\(|Math\./.test(expr) ? '3'
          : 'valor';
        j = k;
        continue;
      }
      output += s[j];
      j += 1;
    }
    return { texto: output, fin: j + 1 };
  };
  readdirSync(DIR).filter(f => f.endsWith('.ts')).forEach(f => {
    const s = readFileSync(`${DIR}/${f}`, 'utf8');
    for (const m of s.matchAll(/\b(?:cumple|noCumple|sinMedir|noAplica|compliant|nonCompliant|notMeasured|notApplicable)\(\s*|motivo: (?=[`'"])/g)) {
      const l = literal(s, m.index! + m[0].length);
      if (l && l.texto.trim()) templates.push({ fichero: f, texto: l.texto });
    }
  });
  check(`templates extracted from the policies (${templates.length})`, templates.length > 300, templates.length);
  const lost = templates.filter(p => !withoutLoss(p.texto));
  check('each template alone returns to its exact text', lost.length === 0, lost.slice(0, 3));
  let badOnes = 0;
  let example: unknown;
  templates.forEach((p, i) => {
    const other = templates[(i * 7 + 3) % templates.length].texto;
    const ownOnes = [
      { id: 'EV-01', medida: { estado: 'NO_EVALUABLE' as const, motivo: p.texto, causa: 'CONFIGURATION' as const } },
      { id: 'EV-11', medida: { estado: 'NO_CUMPLE' as const, motivo: `${other} Además: ${p.texto}` } },
    ];
    const text = `[2 máquinas: srv-a (101), srv-b (102)] ${BRIDGE('policy.x', 'op.x.1')}${compositeReason(ownOnes)}`;
    const m = parseMotive(text);
    const parts = reasonPartsOf(ownOnes);
    const equal =
      m.parts.length === 2 &&
      m.parts.every((q, k) => q.evidenceId === parts[k].evidenceId && q.status === parts[k].status && q.text === parts[k].text && (q.secondary ?? undefined) === (parts[k].secondary?.[0] ?? undefined));
    if (!equal || motiveToText(m) !== text) {
      badOnes += 1;
      example = example || { texto: text.slice(0, 300), partes: m.parts.map(q => [q.evidenceId, q.text.slice(0, 60)]) };
    }
  });
  check('each template, composed with another and with both prefixes: the text\'s parts = those the policy publishes', badOnes === 0, { malas: badOnes, ejemplo: example });
}

console.log('4. The published parts');
{
  const ownOnes = [
    { id: 'EV-01', medida: { estado: 'CUMPLE' as const, motivo: 'Bien.' } },
    { id: 'EV-02', medida: { estado: 'NO_CUMPLE' as const, motivo: 'Valor «x | EV-09 CUMPLE: y» raro. Además: otra.' } },
  ];
  const motive = compositeReason(ownOnes);
  check('the composed text does not change', motive === 'EV-01 CUMPLE: Bien. | EV-02 NO_CUMPLE: Valor «x | EV-09 CUMPLE: y» raro. Además: otra.');
  const parts = reasonPartsOf(ownOnes);
  check('the parts separate «Además»', parts[1].text === 'Valor «x | EV-09 CUMPLE: y» raro.' && parts[1].secondary?.[0] === 'otra.');
  const guessed = parseMotive(motive);
  check('without parts, the text is split wrongly where a value imitates a header (3 parts)', guessed.parts.length === 3);
  const published = parseMotive(`${BRIDGE('p', 'op.x.1')}${motive}`, [{ reason: motive, parts: parts }]);
  check('with the published parts: 2 exact parts, marked as structured', published.structured && published.parts.length === 2 && published.parts[1].text === parts[1].text && motiveToText(published) === `${BRIDGE('p', 'op.x.1')}${motive}`);
  const d = withReasonParts({ reason: motive } as any, parts);
  check('withReasonParts keeps the decision and adds reasonParts', d.reason === motive && d.reasonParts === parts);
  const DIR = `${__dirname}/../common/ens/core/policy-runtime/policies`;
  const withoutParts = readdirSync(DIR).filter(f => f.endsWith('.policy.ts')).filter(f => {
    const s = readFileSync(`${DIR}/${f}`, 'utf8');
    return /\.map\(p => `\$\{p\.id\} \$\{p\.medida\.estado\}: \$\{p\.medida\.motivo\}`\)\.join\(' \| '\)/.test(s) && !/op-mon-3/.test(f);
  });
  check('policies with a composite motive do it with compositeReason + reasonPartsOf (except op.mon.3, which prepends a part without evidence and covers the parser)', withoutParts.length === 0, withoutParts);
}

console.log('5. What the card uses');
{
  check('«EV-01 CUMPLE y EV-03 CUMPLE» / NO_CUMPLE is the generic one', isGenericExpectation('EV-01 CUMPLE y EV-03 CUMPLE', 'NO_CUMPLE'));
  check('«todo acceso con dos factores» is not', !isGenericExpectation('todo acceso con dos factores y ningún canal que admita uno solo', '1 caso(s) con un solo factor'));
  const culpable = parseMotive(EJ.e13).parts[0];
  check('the generic action says which evidence to fix', describeAction('Corregir para alcanzar: EV-01 CUMPLE y EV-04 CUMPLE. Valor actual: NO_CUMPLE.', culpable) === 'Corregir EV-04 (y lo que dice «Además») hasta que conforme.');
  check('a specific action is not touched', describeAction('Configurar P-02 (x) en la pestaña Configuración.', culpable) === 'Configurar P-02 (x) en la pestaña Configuración.');
  const chunks = splitTimestamps('desde 2026-10-17T11:47:14.756Z (plazo 3 h); último 2026-10-15T13:00:58Z.');
  check('dates, in chunks that joined are the text', chunks.map(t => t.text).join('') === 'desde 2026-10-17T11:47:14.756Z (plazo 3 h); último 2026-10-15T13:00:58Z.' && chunks.filter(t => t.iso).length === 2);
}

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
