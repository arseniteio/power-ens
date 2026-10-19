/** The nonconformity card and the Motive cell, reading the motive by parts. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) failures.push(n);
};

const h = installReactHarness();
const React = require('react');
const { NonConformityCard, readCardMotive, layoutGuiltyPart } = require('../public/ens/controls/control-detail/nonconformity-card');
const { parseMotive } = require('../common/ens/evaluation/motive-parser');
const { MotiveCell } = require('../public/ens/controls/control-detail/motive-cell');
const { classifyNonConformity } = require('../public/ens/controls/control-detail/nonconformity-class');
const { compositeReason, reasonPartsOf } = require('../common/ens/core/policy-runtime/policies/policy-kit');

const BRIDGE = 'Resuelta por la política del control (policy.op.exp.6), que mide esta evidencia junto a op.exp.6.1: ';
const ownOnes = [
  { id: 'EV-01', medida: { estado: 'NO_EVALUABLE', motivo: 'El parámetro P-02 (cobertura_esperada_antimalware) está sin configurar. Se han observado 1 hecho(s), pero sin el valor de referencia no hay contra qué contrastarlos.', causa: 'CONFIGURATION' } },
  { id: 'EV-04', medida: { estado: 'CUMPLE', motivo: 'Los logs de detección se han leído en las últimas 24 h.' } },
  { id: 'EV-11', medida: { estado: 'NO_CUMPLE', motivo: 'La respuesta activa no tiene sus scripts. Faltan en /var/ossec/active-response/bin/: quarantine.sh; yara.sh; clamav.sh y 2 más. Además: El último despliegue es del 2026-10-15T13:00:58Z.' } },
];
const motive = compositeReason(ownOnes);
const item = {
  id: 'NC-OP.EXP.6-001', requirement: 'op.exp.6.1', origin: 'MEDIDA', finding: motive, impact: 'Impide el cumplimiento.', parameterIds: [],
  requiredAction: 'Corregir para alcanzar: EV-01 CUMPLE y EV-04 CUMPLE y EV-11 CUMPLE. Valor actual: NO_CUMPLE.',
  expected: 'EV-01 CUMPLE y EV-04 CUMPLE y EV-11 CUMPLE', actual: 'NO_CUMPLE', evidenceIds: ['EV-11'],
};
let clicked = '';
const handlers = {
  onParameter: (id: string) => { clicked = id; },
  parameterInfo: (id: string) => (id === 'P-02' ? { id, value: 'sin valor', origin: 'sin valor: ni propio, ni de plantilla, ni de la organización' } : undefined),
};
const card = (props: any = {}) => () => React.createElement(NonConformityCard, {
  item, clase: classifyNonConformity(item), etiquetaAlcance: 'Observado en', textoAlcance: 'srv-web01 (101)',
  lineasMotivo: [{ texto: `${BRIDGE}${motive}`, etiqueta: 'EV-11' }, { texto: motive, etiqueta: 'Motor' }, { texto: 'Pregunta de auditoría: ¿Se contiene la detección?' }],
  evidenciasImplicadas: ['EV-11'], controlId: 'op.exp.6', handlers, ...props,
});

(async () => {
  console.log('1. Titular');
  let p = await h.render(card());
  const texts = h.findAll('EuiText').map(n => n.texto);
  const titular = h.nodes().find(n => n.type === 'p' && n.props?.title);
  check('the headline is EV-11\'s first sentence (the culprit)', titular?.props.title === 'La respuesta activa no tiene sus scripts.', titular?.props.title);
  check('...with the EV-11 and NO_CUMPLE badges in front', /\[ EV-11 \] \[ NO_CUMPLE \] La respuesta activa no tiene sus scripts\./.test(p), p.slice(0, 400));
  check('the bridge template is not in the card (only in the panel)', !/Resuelta por la política/.test(p));
  check('nor the first evidence (EV-01) as headline', !/^El parámetro P-02/.test(titular?.props.title || ''));
  const bolds = h.nodes().filter(n => n.type === 'strong').map(n => n.texto);
  check('in bold only the evidence id (and «Además:»)', bolds.every(t => t === 'EV-11' || t === 'Además:'), bolds);

  console.log('2. The rest');
  check('the detail, in normal text', /Faltan en \/var\/ossec\/active-response\/bin\//.test(p));
  const lis = h.nodes().filter(n => n.type === 'li').length;
  check('the script list as a list (3 items) and «y 2 más»', lis === 3 && /: quarantine\.sh yara\.sh clamav\.sh y 2 más/.test(p), { lis, p: p.slice(p.indexOf('Faltan'), p.indexOf('Faltan') + 160) });
  const date = h.nodes().find(n => n.type === 'span' && n.props?.title === '2026-10-15T13:00:58Z');
  check('«Además» apart, with the date in es-ES and the ISO in the title', /Además: El último despliegue es del/.test(p) && /^15\/10/.test(date?.texto || ''), date?.texto);
  check('the other evidence that does not comply (EV-01), with its state', /\[ EV-01 \] \[ NO_EVALUABLE \] El parámetro P-02/.test(p));
  const accordion = h.find('EuiAccordion');
  check('the compliant ones, folded: «1 evidencia del requisito conforma»', accordion?.props.buttonContent === '1 evidencia del requisito conforma', accordion?.props.buttonContent);
  void texts;

  console.log('3. Parameters, «se pedía» and action');
  const readOne = readCardMotive([{ texto: `${BRIDGE}${motive}` }], ['EV-01'], motive);
  check('para una NC de EV-01, la culpable es EV-01', readOne.culpable?.evidenceId === 'EV-01');
  p = await h.render(card({ item: { ...item, evidenceIds: ['EV-01'], origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION', parameterIds: ['P-02'] }, evidenciasImplicadas: ['EV-01'] }));
  const insignia = h.findAll('EuiBadge').find(n => /^P-02/.test(n.texto));
  check('P-02 as a clickable badge, with the value that applies', Boolean(insignia?.props.onClick) && /aplica: sin valor \(sin valor: ni propio/.test(p), insignia?.texto);
  insignia!.props.onClick();
  check('clicking it leads to Configuration on P-02', clicked === 'P-02');
  check('the generic «se pedía» is not shown', !/Se pedía/.test(p));
  p = await h.render(card({ item: { ...item, expected: 'todo acceso con dos factores', actual: '1 caso(s) con un solo factor' } }));
  check('the specific one is, and not in bold', /Se pedía todo acceso con dos factores/.test(p) && /Hay 1 caso\(s\) con un solo factor/.test(p) && !h.nodes().some(n => n.type === 'strong' && /dos factores/.test(n.texto)));

  const long = `La respuesta activa ${'no tiene sus scripts '.repeat(14)}en la máquina auditada.`;
  const longOwn = [{ id: 'EV-11', medida: { estado: 'NO_CUMPLE', motivo: `${long} Detalle.` } }];
  p = await h.render(card({ item: { ...item, finding: compositeReason(longOwn) }, lineasMotivo: [{ texto: `${BRIDGE}${compositeReason(longOwn)}`, etiqueta: 'EV-11' }] }));
  const short = h.nodes().find(n => n.type === 'p' && n.props?.title === long);
  check('a headline over 200 characters is cut with «…» and what does not fit opens the cause', Boolean(short) && /…$/.test(short!.texto) && short!.texto.length <= 202 && p.includes(long.slice(200).trimStart().slice(0, 30)), short?.texto.length);
  check('the specific action, in view under the class', /Corregir EV-11 hasta que conforme\./.test(p));

  console.log('4. The cell');
  const cell = () => React.createElement(MotiveCell, { lineas: [{ texto: `${BRIDGE}${motive}` }], evidenceId: 'EV-04', titulo: 'Motivo · EV-04' });
  p = await h.render(cell);
  check('EV-04\'s row shows ITS part: «EV-04 CUMPLE» and its sentence', /\[ EV-04 CUMPLE \] Los logs de detección se han leído/.test(p) && !/Resuelta por la política/.test(p.split('Ver motivo')[0]), p.slice(0, 300));
  check('with published (reasonParts) the same', /\[ EV-04 CUMPLE \]/.test(await h.render(() => React.createElement(MotiveCell, { lineas: [{ texto: `${BRIDGE}${motive}` }], evidenceId: 'EV-04', conocidos: [{ reason: motive, parts: reasonPartsOf(ownOnes) }] }))));

  console.log('5. Nothing is lost');
  h.reset();
  await h.render(card());
  p = await h.click(/Ver detalle/);
  const plane = p.replace(/\[ | \]/g, ' ').replace(/\s+/g, ' ');
  const chunks = ['resuelta por policy.op.exp.6 (op.exp.6.1)', 'El parámetro P-02', 'Se han observado 1 hecho(s)', 'Los logs de detección', 'quarantine.sh', 'clamav.sh', 'y 2 más', 'El último despliegue', '¿Se contiene la detección?', 'Corregir EV-11 (y lo que dice «Además») hasta que conforme.', 'Del motor: Corregir para alcanzar'];
  const missing = chunks.filter(t => !plane.includes(t));
  check('the panel has everything: bridge, the three parts, the whole list, «Además», the question and the action', missing.length === 0, missing);
  const panel = plane.slice(plane.lastIndexOf('NC-OP.EXP.6-001'));
  check('the engine finding (the same motive without prefix) is not repeated in the panel', (panel.match(/Los logs de detección/g) || []).length === 1, (panel.match(/Los logs de detección/g) || []).length);

  console.log('6. A list, once and after its sentence; a long headline, readable');
  {
    h.reset();
    const times = (text: string, chunk: string) => text.split(chunk).length - 1;
    const withoutTitle = (text: string, title: string) => text.replace(title, '');
    const withList = (evMotive: string) => {
      const ownLists = [{ id: 'EV-04', medida: { estado: 'NO_CUMPLE', motivo: evMotive } }];
      const m = compositeReason(ownLists);
      return card({ item: { ...item, finding: m, evidenceIds: ['EV-04'] }, evidenciasImplicadas: ['EV-04'], lineasMotivo: [{ texto: `${BRIDGE}${m}`, etiqueta: 'EV-04' }] });
    };
    const inSentence = 'Hay servicios en ejecución que P-02 no permite en esta máquina: telnet.service; rsh.service; tftp.service; finger.service y 3 más. Revisar P-02 o pararlos.';
    const partA = parseMotive(inSentence).parts[0];
    const a = layoutGuiltyPart(partA);
    check('list in the first sentence: the headline ends right before it, without «…»', a.headline === 'Hay servicios en ejecución que P-02 no permite en esta máquina:' && !a.cutAtWord, a);
    check('...and the list opens the cause, with its values', a.rest?.list?.start === 0 && a.rest.text.startsWith('telnet.service') && a.detail?.text === 'Revisar P-02 o pararlos.' && !a.detail.list, a);
    p = withoutTitle(await h.render(withList(inSentence)), partA.summary);
    check('rendered: each value once, as a list, and after the sentence that introduces it',
      times(p, 'telnet.service') === 1 && h.nodes().filter(n => n.type === 'li').length === 4 && p.indexOf('no permite en esta máquina:') < p.indexOf('telnet.service'), p.slice(0, 600));
    const largo = `La respuesta activa ${'no tiene sus scripts de contención '.repeat(8)}en la máquina auditada.`;
    const inDetail = `${largo} Faltan en /var/ossec/active-response/bin/: quarantine.sh; yara.sh; clamav.sh y 2 más.`;
    const b = layoutGuiltyPart(parseMotive(inDetail).parts[0]);
    check('long headline: cut at a space, with «…», and what does not fit opens the cause', b.cutAtWord && b.headline.endsWith('…') && b.headline.length <= 201 && !/\S…$/.test(b.headline.replace(/…$/, ' …')) && largo.startsWith(b.headline.slice(0, -1)) && largo.endsWith(b.rest!.text), b);
    check('the rest\'s list, inside its text (not loose in front)', b.detail?.text.startsWith('Faltan en /var/ossec/active-response/bin/: ') && b.detail.list?.start === 'Faltan en /var/ossec/active-response/bin/: '.length, b.detail);
    p = withoutTitle(await h.render(withList(inDetail)), largo);
    const plane = p.replace(/\s+/g, ' ');
    check('rendered: the sentence that introduces it before the list, and each value once', plane.indexOf('Faltan en /var/ossec/active-response/bin/') < plane.indexOf('quarantine.sh') && times(plane, 'quarantine.sh') === 1 && times(plane, 'clamav.sh') === 1, plane.slice(0, 900));
    const cab = h.nodes().find(n => n.type === 'p' && n.props?.title === largo);
    check('the headline, without CSS clipping (in a narrow card it reads whole) and nothing only in the `title`', Boolean(cab) && !cab!.props.style && cab!.texto === b.headline && plane.includes(b.rest!.text.slice(-40)), cab?.props);
    const veryLong = `En la revisión de hoy, ${'la máquina auditada mantiene en ejecución servicios '.repeat(4)}que P-02 no permite: telnet.service; rsh.service; tftp.service. Revisar P-02.`;
    const c = layoutGuiltyPart(parseMotive(veryLong).parts[0]);
    check('list in a long sentence: the headline is cut earlier and the list goes in what follows, once', c.cutAtWord && !c.headline.includes('telnet') && c.rest!.list !== undefined && c.rest!.text.slice(c.rest!.list.start).startsWith('telnet.service') && c.detail?.text === 'Revisar P-02.', c);
    p = withoutTitle(await h.render(withList(veryLong)), parseMotive(veryLong).parts[0].summary);
    check('rendered: each value once', times(p, 'telnet.service') === 1 && times(p, 'tftp.service') === 1);
    const d = layoutGuiltyPart(parseMotive('Faltan: a.sh; b.sh; c.sh.').parts[0]);
    check('a sentence that is almost only the list: whole in the headline, no separate list', d.headline === 'Faltan: a.sh; b.sh; c.sh.' && !d.rest && !d.detail, d);
  }

  console.log('7. Theme colours (dark mode)');
  {
    const fs = require('fs');
    const path = require('path');
    const sources = ['public/ens/overview/index.tsx', 'public/ens/controls/control-row.tsx', 'public/ens/controls/control-detail/nonconformity-card.tsx', 'public/ens/controls/control-detail/motive-view.tsx', 'public/ens/controls/control-detail/motive-cell.tsx'];
    const withHex = sources.filter(f => /['"`]#[0-9A-Fa-f]{3,8}\b|\b(rgba?)\(/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')));
    check('the new screens do not hand-write colours (backgrounds, borders and texts come from the theme)', withHex.length === 0, withHex);
    const tema = fs.readFileSync(path.join(__dirname, '../public/ens/theme-colors.ts'), 'utf8');
    check('...but from `euiThemeVars` (`@osd/ui-shared-deps/theme`, which follows dark mode)', /import \{ euiThemeVars \} from '@osd\/ui-shared-deps\/theme';/.test(tema) && !/#[0-9A-Fa-f]{3,8}\b/.test(tema));
  }

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
