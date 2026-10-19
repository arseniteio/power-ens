/** The scripts (config/ensfacil_organization.py) read organisation data exactly as the plugin does. */
import { execFileSync } from 'child_process';
import { ENSConfigurationRegistry } from '../common/ens/configuration/registry';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import {
  ENS_ORGANIZATION_DATA_ITEMS,
  describeOrganizationItem,
  organizationSingleValueIssues,
  organizationViewValue,
  sameParameterValue,
} from '../common/ens/configuration/organization';
import { organizationViewRows } from '../common/ens/configuration/organization/organization-data-views';
import { organizationDataParameter } from '../common/ens/configuration/organization/organization-data-form';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';

declare const process: { exit(code: number): void };
declare const __dirname: string;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`);
  if (!ok) failures.push(name);
};

const SAMPLES: Record<string, unknown> = {
  personal_autorizado: [
    'root | configuracion, copias',
    'ana | mantenimiento, configuracion | servidores Linux | parcheado',
    'syslog | registros | registros del sistema | escritura',
    'root | registros | todos | total',
    'rsec | autorizaciones | global',
    'arn:aws:iam::1:role/Admin | cloud | AWS producción',
    'wazuh | claves | client.keys | lectura',
  ],
  entorno_preproduccion: ['srv-app01 | pre-app01 | informe 2026-05', 'srv-db01 | pre-db01'],
  mecanismo_reversion: ['* | lvm | snapshot previo | 24'],
  herramientas_gestion: ['cambios | registro_tsv | /etc/ensfacil/change-register.tsv | RFC-', 'incidentes | GLPI | https://glpi | RSEG'],
  algoritmos_autorizados: ['protocolo | TLS1.3', 'cifrado | AES-GCM | 128'],
  retencion: ['cuentas, accesos |  | 365', 'registros | autenticación | 365', 'copias |  | 30', 'evidencias | disciplinaria | 1095'],
  zonas_controladas: ['10.0.0.0/8 red interna', '::1/128 la propia máquina'],
  canales_acceso_remoto: ['ssh | si | Responsable de Seguridad | si'],
  productos_certificados: ['AWS | ENS ALTO | 123 | 2027-01-01'],
  registro_pruebas: 'Otra herramienta',
  formacion_personal: ['Ana | ENS básico | 2026-01-10 | 2027-01-10'],
  grupos_privilegiados: ['sudo', 'Domain Admins | AD'],
  declaracion_aplicabilidad: ['op.acc.1 | sí | MEDIO | R1', 'op.acc.5 | no |  |  | Sin usuarios externos | DA | https://intranet/da.pdf | 2026-09-01 | RSEG'],
};

const typeOf = (controlId: string, parameterId: string): string =>
  ENSConfigurationRegistry.find(control => control.controlId === controlId)!.parameters.find(parameter => parameter.id === parameterId)!.type;

// Each view with the whole sample and with its first row only, so some views read nothing.
const cases = ENS_ORGANIZATION_DATA_ITEMS.flatMap(item =>
  item.views.flatMap(view =>
    [SAMPLES[item.id], Array.isArray(SAMPLES[item.id]) ? (SAMPLES[item.id] as string[]).slice(0, 1) : undefined].map(value => ({
      item: item.id,
      view,
      type: typeOf(view.controlId, view.parameterId),
      value,
    }))
  )
);

// Stored values written as text (a table with newlines, a list with commas) are read the same way.
const TEXT_CASES = [
  { item: 'entorno_preproduccion', view: { controlId: 'op.exp.4', parameterId: 'P-06' }, type: 'table', value: 'srv-a | pre-a\nsrv-b | pre-b | informe' },
  { item: 'grupos_privilegiados', view: { controlId: 'op.acc.1', parameterId: 'P-11' }, type: 'list', value: 'sudo, wheel' },
  { item: 'retencion', view: { controlId: 'op.acc.1', parameterId: 'P-06', where: { uso: 'cuentas' }, columns: ['dias'] }, type: 'duration_days', value: 'cuentas |  | 365\ncopias |  | 30' },
  { item: 'registro_pruebas', view: { controlId: 'op.cont.3', parameterId: 'P-04' }, type: 'select', value: 'Otra herramienta' },
];
const allCases = [...cases, ...TEXT_CASES];

// Parameter values compared as the engine does: rows in any order, trailing empty cells, duplicates.
const SAME_PAIRS: { type: string; left: unknown; right: unknown }[] = [
  { type: 'table', left: ['a | b', 'c | d'], right: ['c | d | ', 'a | b'] },
  { type: 'table', left: 'a | b\nc | d', right: ['a | b', 'c | d', 'a | b'] },
  { type: 'table', left: ['a | b'], right: ['a |  | b'] },
  { type: 'table', left: ['Ana | x'], right: ['ana | x'] },
  { type: 'list', left: 'sudo, wheel', right: ['wheel', 'sudo'] },
  { type: 'list', left: ['sudo'], right: [] },
  { type: 'duration_days', left: 365, right: '365' },
  { type: 'duration_days', left: 365, right: 30 },
  { type: 'select', left: undefined, right: '' },
];

// Documents built from each view's reading of the sample: the migration moves the same value in both.
const documents = ENS_ORGANIZATION_DATA_ITEMS.filter(item => item.views.length).flatMap(item => {
  const consistent: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
  delete consistent.organizationData;
  item.views.forEach(view => {
    const parameter = consistent.controls.find((control: any) => control.controlId === view.controlId).parameters.find((candidate: any) => candidate.id === view.parameterId);
    const value = organizationViewValue(item, view, parameter, SAMPLES[item.id] as any);
    if (value === undefined) delete parameter.value;
    else parameter.value = value;
  });
  // The first view alone with a value, and the second changed: adopted, and a conflict.
  const alone: any = JSON.parse(JSON.stringify(consistent));
  item.views.slice(1).forEach(view => delete alone.controls.find((control: any) => control.controlId === view.controlId).parameters.find((candidate: any) => candidate.id === view.parameterId).value);
  const changed: any = JSON.parse(JSON.stringify(consistent));
  if (item.views.length > 1 && !item.views[1].where) {
    const second = changed.controls.find((control: any) => control.controlId === item.views[1].controlId).parameters.find((candidate: any) => candidate.id === item.views[1].parameterId);
    second.value = second.type === 'list' ? ['otro'] : ['otro | valor'];
  }
  return [consistent, alone, changed].map(configuration => ({ item: item.id, configuration }));
});

const SINGLE_VALUE = ['accesos | VPN | 365', 'accesos | web | 90', 'cuentas |  | 365'];

// Whether a value is valid for a parameter: the scripts only complete a parameter with a value the screen accepts.
const CRAFTED: unknown[] = [['a b'], ['x | y | z | w | v | u | t'], 'treinta', -5, 30.5, 365, '365', ['ssh'], ['ssh | si | RSEG | si'],
  ['ssh | quizá | RSEG | si'], ['2026-02-31'], ['Ana | ENS | 2026-01-10 | 2027-01-10'], ['srv-a | pre a'], ['root | configuracion'], ['root | nada'], 'Otra herramienta', 'otra'];
const parametersToCheck = [
  ...ENS_ORGANIZATION_DATA_ITEMS.flatMap(item => item.views.map(view =>
    ENSConfigurationRegistry.find(control => control.controlId === view.controlId)!.parameters.find(parameter => parameter.id === view.parameterId)!)),
  ...ENS_ORGANIZATION_DATA_ITEMS.filter(item => item.views.length).map(item => organizationDataParameter(item)),
];
const validity = parametersToCheck.flatMap(parameter => {
  const item = ENS_ORGANIZATION_DATA_ITEMS.find(candidate => candidate.views.some(view => view.controlId === parameter.controlId && view.parameterId === parameter.id));
  const view = item?.views.find(candidate => candidate.controlId === parameter.controlId && candidate.parameterId === parameter.id);
  const projected = item && view ? [organizationViewValue(item, view, parameter, SAMPLES[item.id] as any)] : [SAMPLES[parameter.name]];
  return [...projected, ...CRAFTED].filter(value => value !== undefined).map(value => ({ parameter, value }));
});

const PYTHON = `
import json, sys
sys.path.insert(0, sys.argv[1])
import ensfacil_organization as o
items = o.load_items()
data = json.load(sys.stdin)
out = {"items": items, "views": [], "assign": [], "rows": [], "same": [], "adopted": [], "single": []}
for case in data["cases"]:
    item = o.get_item(items, case["item"])
    seen = o.view_value(item, case["view"], case["type"], case.get("value"))
    out["views"].append(seen)
    out["rows"].append(o.view_rows(item, case["view"], case["type"], seen))
    # Setting the view to what it reads must leave the item reading the same.
    after = o.assign_view(item, case.get("value"), case["view"], case["type"], seen)
    out["assign"].append(o.view_value(item, case["view"], case["type"], after))
for pair in data["same"]:
    out["same"].append(o.same_value(pair["type"], pair.get("left"), pair.get("right")))
for document in data["documents"]:
    out["adopted"].append(o.adopted_value(document["configuration"], o.get_item(items, document["item"]))[0])
retention = o.get_item(items, "retencion")
out["single"] = o.single_value_problems(data["single"]["configuration"], retention, data["single"]["value"])
out["valid"] = [o.value_problem(case["parameter"], case["value"]) is None for case in data["validity"]]
json.dump(out, sys.stdout)
`;

const single = { configuration: defaultENSConfigurationTemplate, value: SINGLE_VALUE };
const python = JSON.parse(
  execFileSync('python3', ['-I', '-c', PYTHON, `${__dirname}/../config`], {
    input: JSON.stringify({ cases: allCases, same: SAME_PAIRS, documents, single, validity }),
    encoding: 'utf8',
  })
);

const itemOf = (id: string) => ENS_ORGANIZATION_DATA_ITEMS.find(candidate => candidate.id === id)!;

check('the scripts read the same items as the plugin', JSON.stringify(python.items) === JSON.stringify(ENS_ORGANIZATION_DATA_ITEMS));
const differences = allCases
  .map((entry, index) => {
    const plugin = organizationViewValue(itemOf(entry.item), entry.view, { type: entry.type as any }, entry.value as any);
    return JSON.stringify(plugin) === JSON.stringify(python.views[index] ?? undefined) ? undefined : { view: `${entry.view.controlId} ${entry.view.parameterId}`, plugin, script: python.views[index] };
  })
  .filter(Boolean);
check(`every view (${allCases.length}, ${TEXT_CASES.length} of them stored as text) reads the same value in the plugin and in the scripts`, differences.length === 0, differences);
check('some views read nothing in the samples, so the comparison covers empty values too', python.views.some((value: unknown) => value === null));
const rowDifferences = allCases
  .map((entry, index) => {
    const plugin = organizationViewRows(itemOf(entry.item), entry.view, { type: entry.type as any }, (python.views[index] ?? undefined) as any);
    return JSON.stringify(plugin) === JSON.stringify(python.rows[index]) ? undefined : { view: `${entry.view.controlId} ${entry.view.parameterId}`, plugin, script: python.rows[index] };
  })
  .filter(Boolean);
check('a parameter value becomes the same item rows in both', rowDifferences.length === 0, rowDifferences);
const roundTrip = allCases
  .map((entry, index) =>
    sameParameterValue({ type: entry.type as any }, python.assign[index] ?? undefined, python.views[index] ?? undefined)
      ? undefined
      : `${entry.view.controlId} ${entry.view.parameterId}`
  )
  .filter(Boolean);
check('setting a parameter through the scripts keeps what it reads (P-xx form)', roundTrip.length === 0, roundTrip);
const sameDifferences = SAME_PAIRS.filter((pair, index) => sameParameterValue({ type: pair.type as any }, pair.left as any, pair.right as any) !== python.same[index]);
check(`values compare the same way (${SAME_PAIRS.length} pairs, both outcomes)`, sameDifferences.length === 0 && python.same.includes(true) && python.same.includes(false), sameDifferences);
const adoptedDifferences = documents
  .map((document, index) => {
    const state = describeOrganizationItem(document.configuration, itemOf(document.item));
    const plugin = state.status === 'value' && !state.stored ? state.value : undefined;
    return JSON.stringify(plugin) === JSON.stringify(python.adopted[index] ?? undefined) ? undefined : { item: document.item, case: index % 3, plugin, script: python.adopted[index] };
  })
  .filter(Boolean);
check(`the value moved to an item is the same in both (${documents.length} documents, adopted and in conflict)`, adoptedDifferences.length === 0 && python.adopted.includes(null), adoptedDifferences);
check('two rows for a one-value parameter are refused with the same message',
  JSON.stringify(organizationSingleValueIssues(defaultENSConfigurationTemplate, itemOf('retencion'), SINGLE_VALUE).map(issue => `${issue.source} ${issue.reason}`)) === JSON.stringify(python.single), python.single);

const validityDifferences = validity
  .map((entry, index) => (validateParameterValue(entry.parameter, entry.value as any).valid === python.valid[index]
    ? undefined
    : { parameter: `${entry.parameter.controlId} ${entry.parameter.id}`, value: entry.value, plugin: validateParameterValue(entry.parameter, entry.value as any), script: python.valid[index] }))
  .filter(Boolean);
check(`a value is valid or not for a parameter the same way in both (${validity.length} cases, both outcomes)`,
  validityDifferences.length === 0 && python.valid.includes(true) && python.valid.includes(false), validityDifferences.slice(0, 5));

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
