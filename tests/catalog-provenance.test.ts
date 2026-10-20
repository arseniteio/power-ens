/** Catalog against the auditor's v2.0 package: BOE literal texts, provenance labels, Annex II section and order, template source and the mp.info.6 correspondence. */
import { readFileSync } from 'fs';
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${!condition && detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`);
  if (!condition) failures.push(name);
};
const section = (title: string): void => console.log(`\n${title}`);

const h = installReactHarness();
const React = require('react');
const catalog = require('../common/ens/catalog');
const { ENSCatalog, compareENSControlIdsByAnnex, compareENSIds, getENSCatalogControl } = catalog;
const { describeRequirementTexts, describeAnnexSection, describeControlSource, ENS_TEXT_PROVENANCE_LABELS } = require('../common/ens/catalog/support/provenance');
const { getTemplateCorrespondence } = require('../common/ens/catalog/support/template-correspondence');
const { ensRequirementsFile } = require('../public/ens-requirements');
const { ENSControlsInAnnexOrder: ENSControls } = require('../public/ens/controls-in-order');
const { ENSConfigurationRegistry, getENSParametersByControl } = require('../common/ens/configuration/registry');
const { ENSEvidenceCatalog } = require('../common/ens/core/evidence/catalog');
const { listENSFamilies } = require('../public/ens/control-filter/prefix');
const { requirementTextsOf, buildRequirementsModel } = require('../public/requirements/requirements-model');
const { describeReportControlLine, reportRequirementTexts, pdfProvenanceRuns, pdfRowLabel, buildTemplateCorrespondencePdf, REPORT_CRITERION_NOTE } = require('../public/ens/reports/report-provenance');
const { RequirementTextsPanel, TemplateCorrespondencePanel } = require('../public/ens/controls/control-detail/requirement-texts');
const { getAgentControls } = require('../common/ens/configuration/agents/agent-controls');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { describeApplicableLevel, describeApplicableLevelLabel } = require('../common/ens/core/control-level');
const { describeLevelExclusions } = require('../public/ens/controls/controls-list-model');
const { IncoherentLevelsNotice, describeIncoherentLevelsLine } = require('../public/ens/configuration/components/incoherent-levels-notice');

const BOE: Record<string, string> = JSON.parse(readFileSync(`${__dirname}/fixtures/boe-requirement-texts.json`, 'utf8')).texts;
const requirements: any[] = ENSCatalog.flatMap((control: any) => control.requirements.map((requirement: any) => ({ ...requirement, controlId: control.id })));

section('1. Every requirement text is the BOE literal of the template\'s Ficha');
{
  const notLiteral = requirements.filter(r => r.description !== BOE[r.id]).map(r => r.id);
  check(`the ${requirements.length} catalog requirements carry the literal`, requirements.length === 182 && notLiteral.length === 0, notLiteral);
  check('the fixture has exactly the catalog requirements', Object.keys(BOE).length === requirements.length);
  const viewNotLiteral = requirements.filter(r => {
    const text = String((ensRequirementsFile as Record<string, string>)[r.id] || '');
    const separator = text.indexOf(' - ');
    return (separator >= 0 ? text.slice(separator + 3) : text) !== BOE[r.id];
  }).map(r => r.id);
  check('the Controls view (ens-requirements.ts) shows the same literal', viewNotLiteral.length === 0, viewNotLiteral);
  check('mp.info.6.2.b is letter b) of mp.info.6.2, not the retention', BOE['mp.info.6.2.b'] === 'Los procedimientos de respaldo establecidos indicarán: b) Requisitos de almacenamiento en el propio lugar.');
}

section('2. The interpretation lives apart, as «Criterio de aplicación»');
{
  const interpreted = requirements.filter(r => r.interpretation).map(r => r.id);
  const expected = ['mp.info.6.1', 'mp.info.6.2.a', 'mp.info.6.2.b', 'mp.info.6.2.c', 'mp.info.6.2.d', 'mp.info.6.r1.1', 'mp.info.6.r2.1',
    'op.acc.1.1', 'op.acc.1.2', 'op.acc.1.3', 'op.acc.1.4', 'op.acc.1.5', 'op.acc.1.r1.1', 'op.acc.1.r1.3'];
  check('the paraphrases moved to `interpretation` (mp.info.6 and op.acc.1)', JSON.stringify([...interpreted].sort()) === JSON.stringify([...expected].sort()), interpreted);
  check('no interpretation repeats the literal', requirements.every(r => !r.interpretation || r.interpretation !== r.description));
  check('«no se admiten cuentas genéricas» is now criterion, not norm', /cuentas genéricas/.test(getENSCatalogControl('op.acc.1').requirements[0].interpretation) && !/genéricas/.test(getENSCatalogControl('op.acc.1').requirements[0].description));
  const texts = describeRequirementTexts(getENSCatalogControl('mp.info.6').requirements[0]);
  check('two texts, norm first', texts.length === 2 && texts[0].provenance === 'BOE' && texts[1].provenance === 'CRITERION');
  check('labels «Norma ENS» and «Criterio de aplicación»', texts[0].label === 'Norma ENS' && texts[1].label === 'Criterio de aplicación' && ENS_TEXT_PROVENANCE_LABELS.BOE === 'Norma ENS');
  check('a literal requirement has only the norm', describeRequirementTexts(getENSCatalogControl('op.exp.2').requirements[0]).length === 1);
}

section('3. Annex II section and template source per control (auditor\'s index)');
{
  const expected: Record<string, string> = { 'mp.info.6': '5.7.6', 'op.nub.1': '4.5.1', 'op.cont.2': '4.6.2', 'op.cont.3': '4.6.3' };
  for (let i = 1; i <= 6; i += 1) expected[`op.acc.${i}`] = `4.2.${i}`;
  for (let i = 1; i <= 10; i += 1) expected[`op.exp.${i}`] = `4.3.${i}`;
  for (let i = 1; i <= 3; i += 1) expected[`op.mon.${i}`] = `4.7.${i}`;
  const wrong = ENSCatalog.filter((c: any) => c.annexSection !== expected[c.id]).map((c: any) => `${c.id}=${c.annexSection}`);
  check('the 23 sections', ENSCatalog.length === 23 && wrong.length === 0, wrong);
  const badSource = ENSCatalog.filter((c: any) =>
    c.source?.template !== `ENSFacil_Plantilla_${c.id}` ||
    c.source?.version !== (c.id === 'op.acc.2' ? '1.0' : '2.0') ||
    (c.id === 'op.acc.2' ? c.source?.date !== undefined : !/^\d{4}-\d{2}-\d{2}$/.test(c.source?.date))
  ).map((c: any) => c.id);
  check('source: template file, v2.0 with ISO date; op.acc.2 still v1.0, undated', badSource.length === 0, badSource);
  check('an undated template shows no invented date', describeControlSource(getENSCatalogControl('op.acc.2')) === 'Plantilla del auditor v1.0', describeControlSource(getENSCatalogControl('op.acc.2')));
  check('«Anexo II, apdo. 4.2.1»', describeAnnexSection(getENSCatalogControl('op.acc.1')) === 'Anexo II, apdo. 4.2.1');
  check('«Plantilla del auditor v2.0 (15/10/2026)»', describeControlSource(getENSCatalogControl('op.exp.10')) === 'Plantilla del auditor v2.0 (15/10/2026)');
}

section('4. Lists in Annex II order');
{
  const ANNEX = ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4', 'op.acc.5', 'op.acc.6',
    'op.exp.1', 'op.exp.2', 'op.exp.3', 'op.exp.4', 'op.exp.5', 'op.exp.6', 'op.exp.7', 'op.exp.8', 'op.exp.9', 'op.exp.10',
    'op.nub.1', 'op.cont.2', 'op.cont.3', 'op.mon.1', 'op.mon.2', 'op.mon.3', 'mp.info.6'].join(',');
  check('the engine catalog', ENSCatalog.map((c: any) => c.id).join(',') === ANNEX, ENSCatalog.map((c: any) => c.id).join(','));
  check('the screen controls', ENSControls.map((c: any) => c.id).join(',') === ANNEX);
  check('the Configuration tab', ENSConfigurationRegistry.map((c: any) => c.controlId).join(',') === ANNEX);
  check('families: op.acc, op.exp, op.nub, op.cont, op.mon, mp.info', listENSFamilies(ENSCatalog.map((c: any) => c.id)).join(',') === 'op.acc,op.exp,op.nub,op.cont,op.mon,mp.info');
  check('sections compare by number: 4.3.2 < 4.3.10 < 5.7.6', compareENSIds('4.3.2', '4.3.10') < 0 && compareENSIds('4.3.10', '5.7.6') < 0);
  check('an id outside the catalog goes after', compareENSControlIdsByAnnex('mp.info.6', 'org.1') < 0 && compareENSControlIdsByAnnex('org.1', 'op.acc.1') > 0);
  const reversed = { ...defaultENSConfigurationTemplate, controls: [...defaultENSConfigurationTemplate.controls].reverse() };
  const agentList = getAgentControls(reversed, '101', undefined, () => 'MEDIO').map((c: any) => c.controlId);
  check('a machine\'s control list follows Annex II whatever the stored order', agentList.length > 5 && agentList.join(',') === [...agentList].sort(compareENSControlIdsByAnnex).join(','), agentList.join(','));
  check('...with mp.info.6 last', agentList[agentList.length - 1] === 'mp.info.6', agentList.join(','));
  const model = buildRequirementsModel(ensRequirementsFile, [], { search: '', hideEmpty: false });
  check('the Controls view column', model.controls.map((c: any) => c.id).join(',') === ANNEX, model.controls.map((c: any) => c.id).join(','));
}

section('5. The Controls view and the report carry the provenance');
{
  const texts = requirementTextsOf('op.acc.1.4', (ensRequirementsFile as Record<string, string>)['op.acc.1.4']);
  check('Controls view: norm and criterion for op.acc.1.4', texts.map((t: any) => t.label).join('|') === 'Norma ENS|Criterio de aplicación' && texts[0].text === BOE['op.acc.1.4']);
  const unknown = requirementTextsOf('x.1', 'T - texto');
  check('Controls view: a text outside the catalog is criterion, never norm', unknown.length === 1 && unknown[0].text === 'texto' && unknown[0].provenance === 'CRITERION', unknown);
  check('report line of op.acc.3', describeReportControlLine('op.acc.3') === 'Anexo II, apdo. 4.2.3 · Se aplica por el nivel más alto de C·I·T·A · Plantilla del auditor v2.0 (15/10/2026)', describeReportControlLine('op.acc.3'));
  check('report line of op.exp.1 (by category)', describeReportControlLine('op.exp.1') === 'Anexo II, apdo. 4.3.1 · Se aplica por la categoría del sistema · Plantilla del auditor v2.0 (15/10/2026)');
  const runs = pdfProvenanceRuns(reportRequirementTexts('mp.info.6', 'mp.info.6.r2.1'));
  const plain = runs.map((run: any) => run.text).join('');
  check('PDF: label in front of each text', /Norma ENS: Al menos una de las copias/.test(plain) && /Criterio de aplicación: ENSFácil lo acredita con los destinos/.test(plain), plain);
  check('PDF: the criterion note for fields and parameters', /^Criterio de aplicación: /.test(REPORT_CRITERION_NOTE));
  check('PDF: a label per field and parameter row, like the screen', (pdfRowLabel() as any).text === 'Criterio de aplicación\n' && (pdfRowLabel('BOE') as any).text === 'Norma ENS\n');
}

section('6. mp.info.6: correspondence with the auditor\'s template');
{
  const map = getTemplateCorrespondence('mp.info.6');
  check('only mp.info.6 has one', Boolean(map) && ENSCatalog.filter((c: any) => getTemplateCorrespondence(c.id)).length === 1);
  check('the 9 template parameters P-01..P-09', map.parameters.map((r: any) => r.template).join(',') === 'P-01,P-02,P-03,P-04,P-05,P-06,P-07,P-08,P-09');
  check('the 11 template evidences EV-01..EV-11', map.evidences.map((r: any) => r.template).join(',') === Array.from({ length: 11 }, (_, i) => `EV-${String(i + 1).padStart(2, '0')}`).join(','));
  const params = getENSParametersByControl('mp.info.6').map((p: any) => p.id);
  const evidences = ENSEvidenceCatalog.filter((e: any) => e.controlId === 'mp.info.6').map((e: any) => e.id);
  const unknownParams = map.parameters.flatMap((r: any) => r.ours).filter((id: string) => !params.includes(id));
  const unknownEvidences = map.evidences.flatMap((r: any) => r.ours).filter((id: string) => !evidences.includes(id));
  check('every mapped parameter exists in the deployment', unknownParams.length === 0, unknownParams);
  check('every mapped evidence exists in the deployment', unknownEvidences.length === 0, unknownEvidences);
  const covered = new Set([...map.parameters.flatMap((r: any) => r.ours), ...map.evidences.flatMap((r: any) => r.ours), ...map.ownOnly.map((o: any) => o.id)]);
  const unaccounted = [...params, ...evidences].filter(id => !covered.has(id));
  check('every deployed parameter and evidence is mapped or declared own', unaccounted.length === 0, unaccounted);
  const reqs = getENSCatalogControl('mp.info.6').requirements.map((r: any) => r.id);
  const split = map.requirements.find((r: any) => r.template === 'mp.info.6.2');
  check('the requirement split .2.a-.2.d is documented in the map', split?.ours.join(',') === 'mp.info.6.2.a,mp.info.6.2.b,mp.info.6.2.c,mp.info.6.2.d');
  check('mp.info.6.2 is «Parcial» and says what is missing (b and d)', split?.coverage === 'PARTIAL' && /Falta: b\)/.test(split.note) && /d\)/.test(split.note), split);
  check('every mapped requirement exists', map.requirements.flatMap((r: any) => r.ours).every((id: string) => reqs.includes(id)));
  const notMeasured = [...map.parameters, ...map.evidences].filter((r: any) => r.coverage === 'NOT_MEASURED').map((r: any) => r.template);
  check('what is not measured yet is marked (P-09, EV-03, EV-07, EV-11)', notMeasured.join(',') === 'P-09,EV-03,EV-07,EV-11', notMeasured);
  check('the PDF carries it for mp.info.6 and nothing for op.acc.1', buildTemplateCorrespondencePdf('mp.info.6').length > 3 && buildTemplateCorrespondencePdf('op.acc.1').length === 0);
}

section('6b. v2.0 wording: op.exp.10 reads by auditd, op.exp.3 EV-11 declared as own');
{
  const ev = (control: string, id: string) => ENSEvidenceCatalog.find((e: any) => e.controlId === control && e.id === id);
  check('op.exp.10 EV-01 says reads are audited with auditd and FIM only sees integrity changes', /lecturas auditadas con auditd/.test(ev('op.exp.10', 'EV-01').description) && /FIM solo detecta cambios de integridad/.test(ev('op.exp.10', 'EV-01').description));
  check('op.exp.10 EV-01 says Windows reads come from a read SACL (event 4663)', /SACL de lectura en Windows \(evento 4663\)/.test(ev('op.exp.10', 'EV-01').description));
  check('op.exp.3 EV-11 is ENSFácil\'s own evidence', /Evidencia propia de ENSFácil/.test(ev('op.exp.3', 'EV-11').description));
}

(async () => {
  section('7. Control detail: texts with labels and the correspondence');
  let screen = await h.render(() => React.createElement(RequirementTextsPanel, { controlId: 'op.acc.1' }));
  check('the panel lists the 8 requirements', /Texto de los requisitos \(8\)/.test(screen));
  check('each literal with [ Norma ENS ]', (screen.match(/\[ Norma ENS \]/g) || []).length === 8, (screen.match(/\[ Norma ENS \]/g) || []).length);
  check('each interpretation with [ Criterio de aplicación ]', (screen.match(/\[ Criterio de aplicación \]/g) || []).length === 7);
  screen = await h.render(() => React.createElement(TemplateCorrespondencePanel, { controlId: 'mp.info.6' }));
  check('«Correspondencia con la plantilla del auditor» on mp.info.6', /Correspondencia con la plantilla del auditor/.test(screen) && /alcance_copias/.test(screen) && /No se mide todavía/.test(screen));
  screen = await h.render(() => React.createElement(TemplateCorrespondencePanel, { controlId: 'op.acc.1' }));
  check('nothing on a control built from its template', screen.trim() === '', screen);

  section('8. Level wording and the incoherence notice');
  check('a category control says «Nivel ENS»', describeApplicableLevel(getENSCatalogControl('op.exp.1'), 'MEDIO') === 'Nivel ENS: MEDIO');
  check('a D control says «Nivel aplicable: ALTO (Disponibilidad)»', describeApplicableLevel(getENSCatalogControl('mp.info.6'), 'ALTO') === 'Nivel aplicable: ALTO (Disponibilidad)');
  check('a C·I·T·A control names the rule', describeApplicableLevelLabel(getENSCatalogControl('op.acc.3')) === 'Nivel aplicable (el más alto de C·I·T·A)');
  const exclusions = describeLevelExclusions([{ id: 'op.cont.2', appliesAtLevel: false }, { id: 'op.exp.5', appliesAtLevel: false }], 'ALTO', (id: string) => (id === 'op.cont.2' ? 'MEDIO' : 'ALTO'));
  check('an exclusion by dimension names its own level', /^Nivel ALTO: 2 controles no aplican \(op\.cont\.2: nivel aplicable MEDIO por Disponibilidad, op\.exp\.5\)$/.test(exclusions.text), exclusions.text);
  check('coherent levels: no notice line', describeIncoherentLevelsLine({ ensLevel: 'ALTO', availabilityLevel: 'MEDIO' }) === undefined);
  const line = describeIncoherentLevelsLine({ ensLevel: 'MEDIO', availabilityLevel: 'ALTO' });
  check('incoherent: one line naming the dimension', line === 'Niveles incoherentes: Disponibilidad (D) ALTO supera el nivel ENS MEDIO.', line);
  h.setSearch('?tabView=plugins');
  screen = await h.render(() => React.createElement(IncoherentLevelsNotice, { global: { ensLevel: 'MEDIO', availabilityLevel: 'ALTO' } }));
  check('the notice is shown with a link to General', /Niveles incoherentes/.test(screen) && Boolean(h.find('EuiLink', /Corregir en Configuración > General/)), screen);
  await h.click(/Corregir en Configuración > General/, 'EuiLink');
  check('the link opens Configuración > General', /tabView=configuration/.test(h.search()) && /configView=general/.test(h.search()), h.search());
  screen = await h.render(() => React.createElement(IncoherentLevelsNotice, { global: { ensLevel: 'MEDIO' } }));
  check('nothing when the levels are coherent', screen.trim() === '', screen);

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.log(`  FAIL exception: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
