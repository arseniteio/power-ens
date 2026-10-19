/**
 * La tarjeta de una no conformidad y la celda de «Motivo», leyendo el motivo
 * por partes (diagnóstico de 17/10, §4):
 *
 *   npx --yes tsx tests/nonconformity-card.test.ts
 *
 *   1. Titular: insignia de la evidencia culpable + su estado + su primera
 *      frase, en peso normal; nunca la plantilla del puente ni otra evidencia;
 *      nada en negrita salvo el id.
 *   2. El resto: el detalle en texto normal, la lista como lista, «Además»
 *      aparte, las demás evidencias con su estado y las conformes plegadas.
 *   3. Parámetros como insignias que llevan a Configuración, con el valor que
 *      aplica; «se pedía» genérico oculto y el concreto, en peso normal.
 *   4. La celda: la parte de SU evidencia.
 *   5. Nada se pierde: el panel «Ver detalle» tiene todo el texto.
 *   6. Una lista sale una vez, como lista y después de la frase que la
 *      presenta; un titular largo se corta en un espacio y se lee entero en una
 *      tarjeta estrecha (sin recorte de CSS).
 *   7. Los colores neutros vienen del tema (siguen el modo oscuro).
 */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) fallos.push(n);
};

const h = installReactHarness();
const React = require('react');
const { NonConformityCard, readCardMotive, layoutGuiltyPart } = require('../public/ens/controls/control-detail/nonconformity-card');
const { parseMotive } = require('../common/ens/evaluation/motive-parser');
const { MotiveCell } = require('../public/ens/controls/control-detail/motive-cell');
const { classifyNonConformity } = require('../public/ens/controls/control-detail/nonconformity-class');
const { motivoCompuesto, partesDe } = require('../common/ens/core/policy-runtime/policies/policy-kit');

const PUENTE = 'Resuelta por la política del control (policy.op.exp.6), que mide esta evidencia junto a op.exp.6.1: ';
const propias = [
  { id: 'EV-01', medida: { estado: 'NO_EVALUABLE', motivo: 'El parámetro P-02 (cobertura_esperada_antimalware) está sin configurar. Se han observado 1 hecho(s), pero sin el valor de referencia no hay contra qué contrastarlos.', causa: 'CONFIGURATION' } },
  { id: 'EV-04', medida: { estado: 'CUMPLE', motivo: 'Los logs de detección se han leído en las últimas 24 h.' } },
  { id: 'EV-11', medida: { estado: 'NO_CUMPLE', motivo: 'La respuesta activa no tiene sus scripts. Faltan en /var/ossec/active-response/bin/: quarantine.sh; yara.sh; clamav.sh y 2 más. Además: El último despliegue es del 2026-10-15T13:00:58Z.' } },
];
const motivo = motivoCompuesto(propias);
const item = {
  id: 'NC-OP.EXP.6-001', requirement: 'op.exp.6.1', origin: 'MEDIDA', finding: motivo, impact: 'Impide el cumplimiento.', parameterIds: [],
  requiredAction: 'Corregir para alcanzar: EV-01 CUMPLE y EV-04 CUMPLE y EV-11 CUMPLE. Valor actual: NO_CUMPLE.',
  expected: 'EV-01 CUMPLE y EV-04 CUMPLE y EV-11 CUMPLE', actual: 'NO_CUMPLE', evidenceIds: ['EV-11'],
};
let pulsado = '';
const handlers = {
  onParameter: (id: string) => { pulsado = id; },
  parameterInfo: (id: string) => (id === 'P-02' ? { id, value: 'sin valor', origin: 'sin valor: ni propio, ni de plantilla, ni de la organización' } : undefined),
};
const tarjeta = (props: any = {}) => () => React.createElement(NonConformityCard, {
  item, clase: classifyNonConformity(item), etiquetaAlcance: 'Observado en', textoAlcance: 'srv-web01 (101)',
  lineasMotivo: [{ texto: `${PUENTE}${motivo}`, etiqueta: 'EV-11' }, { texto: motivo, etiqueta: 'Motor' }, { texto: 'Pregunta de auditoría: ¿Se contiene la detección?' }],
  evidenciasImplicadas: ['EV-11'], controlId: 'op.exp.6', handlers, ...props,
});

(async () => {
  console.log('1. Titular');
  let p = await h.render(tarjeta());
  const textos = h.findAll('EuiText').map(n => n.texto);
  const titular = h.nodes().find(n => n.type === 'p' && n.props?.title);
  comprueba('el titular es la primera frase de EV-11 (la culpable)', titular?.props.title === 'La respuesta activa no tiene sus scripts.', titular?.props.title);
  comprueba('…con las insignias EV-11 y NO_CUMPLE delante', /\[ EV-11 \] \[ NO_CUMPLE \] La respuesta activa no tiene sus scripts\./.test(p), p.slice(0, 400));
  comprueba('la plantilla del puente no está en la tarjeta (solo en el panel)', !/Resuelta por la política/.test(p));
  comprueba('ni la primera evidencia (EV-01) de titular', !/^El parámetro P-02/.test(titular?.props.title || ''));
  const negritas = h.nodes().filter(n => n.type === 'strong').map(n => n.texto);
  comprueba('en negrita solo el id de la evidencia (y «Además:»)', negritas.every(t => t === 'EV-11' || t === 'Además:'), negritas);

  console.log('2. El resto');
  comprueba('el detalle, en texto normal', /Faltan en \/var\/ossec\/active-response\/bin\//.test(p));
  const lis = h.nodes().filter(n => n.type === 'li').length;
  comprueba('la lista de scripts como lista (3 elementos) y «y 2 más»', lis === 3 && /: quarantine\.sh yara\.sh clamav\.sh y 2 más/.test(p), { lis, p: p.slice(p.indexOf('Faltan'), p.indexOf('Faltan') + 160) });
  const fecha = h.nodes().find(n => n.type === 'span' && n.props?.title === '2026-10-15T13:00:58Z');
  comprueba('«Además» aparte, con la fecha en es-ES y la ISO en el title', /Además: El último despliegue es del/.test(p) && /^15\/10/.test(fecha?.texto || ''), fecha?.texto);
  comprueba('la otra evidencia que no conforma (EV-01), con su estado', /\[ EV-01 \] \[ NO_EVALUABLE \] El parámetro P-02/.test(p));
  const acordeon = h.find('EuiAccordion');
  comprueba('las conformes, plegadas: «1 evidencia del requisito conforma»', acordeon?.props.buttonContent === '1 evidencia del requisito conforma', acordeon?.props.buttonContent);
  void textos;

  console.log('3. Parámetros, «se pedía» y acción');
  const leido = readCardMotive([{ texto: `${PUENTE}${motivo}` }], ['EV-01'], motivo);
  comprueba('para una NC de EV-01, la culpable es EV-01', leido.culpable?.evidenceId === 'EV-01');
  p = await h.render(tarjeta({ item: { ...item, evidenceIds: ['EV-01'], origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION', parameterIds: ['P-02'] }, evidenciasImplicadas: ['EV-01'] }));
  const insignia = h.findAll('EuiBadge').find(n => /^P-02/.test(n.texto));
  comprueba('P-02 como insignia pulsable, con el valor que aplica', Boolean(insignia?.props.onClick) && /aplica: sin valor \(sin valor: ni propio/.test(p), insignia?.texto);
  insignia!.props.onClick();
  comprueba('pulsarla lleva a Configuración en P-02', pulsado === 'P-02');
  comprueba('el «se pedía» genérico no se enseña', !/Se pedía/.test(p));
  p = await h.render(tarjeta({ item: { ...item, expected: 'todo acceso con dos factores', actual: '1 caso(s) con un solo factor' } }));
  comprueba('el concreto sí, y sin negrita', /Se pedía todo acceso con dos factores/.test(p) && /Hay 1 caso\(s\) con un solo factor/.test(p) && !h.nodes().some(n => n.type === 'strong' && /dos factores/.test(n.texto)));

  const larga = `La respuesta activa ${'no tiene sus scripts '.repeat(14)}en la máquina auditada.`;
  const propiasLargas = [{ id: 'EV-11', medida: { estado: 'NO_CUMPLE', motivo: `${larga} Detalle.` } }];
  p = await h.render(tarjeta({ item: { ...item, finding: motivoCompuesto(propiasLargas) }, lineasMotivo: [{ texto: `${PUENTE}${motivoCompuesto(propiasLargas)}`, etiqueta: 'EV-11' }] }));
  const corto = h.nodes().find(n => n.type === 'p' && n.props?.title === larga);
  comprueba('un titular de más de 200 caracteres se corta con «…» y lo que no cabe abre la causa', Boolean(corto) && /…$/.test(corto!.texto) && corto!.texto.length <= 202 && p.includes(larga.slice(200).trimStart().slice(0, 30)), corto?.texto.length);
  comprueba('la acción concreta, a la vista bajo la clase', /Corregir EV-11 hasta que conforme\./.test(p));

  console.log('4. La celda');
  const celda = () => React.createElement(MotiveCell, { lineas: [{ texto: `${PUENTE}${motivo}` }], evidenceId: 'EV-04', titulo: 'Motivo · EV-04' });
  p = await h.render(celda);
  comprueba('la fila de EV-04 enseña SU parte: «EV-04 CUMPLE» y su frase', /\[ EV-04 CUMPLE \] Los logs de detección se han leído/.test(p) && !/Resuelta por la política/.test(p.split('Ver motivo')[0]), p.slice(0, 300));
  comprueba('con publicado (reasonParts) igual', /\[ EV-04 CUMPLE \]/.test(await h.render(() => React.createElement(MotiveCell, { lineas: [{ texto: `${PUENTE}${motivo}` }], evidenceId: 'EV-04', conocidos: [{ reason: motivo, parts: partesDe(propias) }] }))));

  console.log('5. Nada se pierde');
  h.reset();
  await h.render(tarjeta());
  p = await h.click(/Ver detalle/);
  const plano = p.replace(/\[ | \]/g, ' ').replace(/\s+/g, ' ');
  const trozos = ['resuelta por policy.op.exp.6 (op.exp.6.1)', 'El parámetro P-02', 'Se han observado 1 hecho(s)', 'Los logs de detección', 'quarantine.sh', 'clamav.sh', 'y 2 más', 'El último despliegue', '¿Se contiene la detección?', 'Corregir EV-11 (y lo que dice «Además») hasta que conforme.', 'Del motor: Corregir para alcanzar'];
  const faltan = trozos.filter(t => !plano.includes(t));
  comprueba('el panel tiene todo: puente, las tres partes, la lista entera, «Además», la pregunta y la acción', faltan.length === 0, faltan);
  const panel = plano.slice(plano.lastIndexOf('NC-OP.EXP.6-001'));
  comprueba('el hallazgo del motor (el mismo motivo sin prefijo) no se repite en el panel', (panel.match(/Los logs de detección/g) || []).length === 1, (panel.match(/Los logs de detección/g) || []).length);

  console.log('6. Una lista, una vez y después de su frase; un titular largo, legible');
  {
    // La tarjeta sola (el panel «Ver detalle» de la sección 5, cerrado).
    h.reset();
    const veces = (texto: string, trozo: string) => texto.split(trozo).length - 1;
    // Lo pintado sin el `title` del titular (el arnés lo vuelca en el texto;
    // el navegador solo lo enseña al pasar el ratón).
    const sinTitulo = (texto: string, titulo: string) => texto.replace(titulo, '');
    const conLista = (motivoEv: string) => {
      const propiasL = [{ id: 'EV-04', medida: { estado: 'NO_CUMPLE', motivo: motivoEv } }];
      const m = motivoCompuesto(propiasL);
      return tarjeta({ item: { ...item, finding: m, evidenceIds: ['EV-04'] }, evidenciasImplicadas: ['EV-04'], lineasMotivo: [{ texto: `${PUENTE}${m}`, etiqueta: 'EV-04' }] });
    };
    // (a) La lista en la primera frase (corta).
    const enFrase = 'Hay servicios en ejecución que P-02 no permite en esta máquina: telnet.service; rsh.service; tftp.service; finger.service y 3 más. Revisar P-02 o pararlos.';
    const partA = parseMotive(enFrase).parts[0];
    const a = layoutGuiltyPart(partA);
    comprueba('lista en la primera frase: el titular acaba justo antes de ella, sin «…»', a.headline === 'Hay servicios en ejecución que P-02 no permite en esta máquina:' && !a.cutAtWord, a);
    comprueba('…y la lista abre la causa, con sus valores', a.rest?.list?.start === 0 && a.rest.text.startsWith('telnet.service') && a.detail?.text === 'Revisar P-02 o pararlos.' && !a.detail.list, a);
    p = sinTitulo(await h.render(conLista(enFrase)), partA.summary);
    comprueba('pintada: cada valor una sola vez, como lista, y después de la frase que la presenta',
      veces(p, 'telnet.service') === 1 && h.nodes().filter(n => n.type === 'li').length === 4 && p.indexOf('no permite en esta máquina:') < p.indexOf('telnet.service'), p.slice(0, 600));
    // (b) Titular largo y la lista en el resto de la parte.
    const largo = `La respuesta activa ${'no tiene sus scripts de contención '.repeat(8)}en la máquina auditada.`;
    const enDetalle = `${largo} Faltan en /var/ossec/active-response/bin/: quarantine.sh; yara.sh; clamav.sh y 2 más.`;
    const b = layoutGuiltyPart(parseMotive(enDetalle).parts[0]);
    comprueba('titular largo: cortado en un espacio, con «…», y lo que no cabe abre la causa', b.cutAtWord && b.headline.endsWith('…') && b.headline.length <= 201 && !/\S…$/.test(b.headline.replace(/…$/, ' …')) && largo.startsWith(b.headline.slice(0, -1)) && largo.endsWith(b.rest!.text), b);
    comprueba('la lista del resto, dentro de su texto (no suelta delante)', b.detail?.text.startsWith('Faltan en /var/ossec/active-response/bin/: ') && b.detail.list?.start === 'Faltan en /var/ossec/active-response/bin/: '.length, b.detail);
    p = sinTitulo(await h.render(conLista(enDetalle)), largo);
    const plano = p.replace(/\s+/g, ' ');
    comprueba('pintada: la frase que la presenta antes que la lista, y cada valor una vez', plano.indexOf('Faltan en /var/ossec/active-response/bin/') < plano.indexOf('quarantine.sh') && veces(plano, 'quarantine.sh') === 1 && veces(plano, 'clamav.sh') === 1, plano.slice(0, 900));
    const cab = h.nodes().find(n => n.type === 'p' && n.props?.title === largo);
    comprueba('el titular, sin recorte de CSS (en una tarjeta estrecha se lee entero) y nada solo en el `title`', Boolean(cab) && !cab!.props.style && cab!.texto === b.headline && plano.includes(b.rest!.text.slice(-40)), cab?.props);
    // (c) La lista dentro de una primera frase de más de 200 caracteres.
    const muyLarga = `En la revisión de hoy, ${'la máquina auditada mantiene en ejecución servicios '.repeat(4)}que P-02 no permite: telnet.service; rsh.service; tftp.service. Revisar P-02.`;
    const c = layoutGuiltyPart(parseMotive(muyLarga).parts[0]);
    comprueba('lista en una frase larga: el titular se corta antes y la lista va en lo que sigue, una vez', c.cutAtWord && !c.headline.includes('telnet') && c.rest!.list !== undefined && c.rest!.text.slice(c.rest!.list.start).startsWith('telnet.service') && c.detail?.text === 'Revisar P-02.', c);
    p = sinTitulo(await h.render(conLista(muyLarga)), parseMotive(muyLarga).parts[0].summary);
    comprueba('pintada: cada valor una vez', veces(p, 'telnet.service') === 1 && veces(p, 'tftp.service') === 1);
    // (d) Una frase que empieza casi con la lista: no se parte ahí.
    const d = layoutGuiltyPart(parseMotive('Faltan: a.sh; b.sh; c.sh.').parts[0]);
    comprueba('una frase que es casi solo la lista: entera en el titular, sin lista aparte', d.headline === 'Faltan: a.sh; b.sh; c.sh.' && !d.rest && !d.detail, d);
  }

  console.log('7. Colores del tema (modo oscuro)');
  {
    const fs = require('fs');
    const path = require('path');
    const fuentes = ['public/ens/overview/index.tsx', 'public/ens/controls/control-row.tsx', 'public/ens/controls/control-detail/nonconformity-card.tsx', 'public/ens/controls/control-detail/motive-view.tsx', 'public/ens/controls/control-detail/motive-cell.tsx'];
    const conHex = fuentes.filter(f => /['"`]#[0-9A-Fa-f]{3,8}\b|\b(rgba?)\(/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')));
    comprueba('las pantallas nuevas no escriben colores a mano (fondos, bordes y textos vienen del tema)', conHex.length === 0, conHex);
    const tema = fs.readFileSync(path.join(__dirname, '../public/ens/theme-colors.ts'), 'utf8');
    comprueba('…sino de `euiThemeVars` (`@osd/ui-shared-deps/theme`, que sigue el modo oscuro)', /import \{ euiThemeVars \} from '@osd\/ui-shared-deps\/theme';/.test(tema) && !/#[0-9A-Fa-f]{3,8}\b/.test(tema));
  }

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
