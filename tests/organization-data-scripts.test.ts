/** The scripts (config/ensfacil_organization.py) read organisation data exactly as the plugin does. */
import { execFileSync } from 'child_process';
import { ENSConfigurationRegistry } from '../common/ens/configuration/registry';
import {
  ENS_ORGANIZATION_DATA_ITEMS,
  organizationViewValue,
  sameParameterValue,
} from '../common/ens/configuration/organization';

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

const PYTHON = `
import json, sys
sys.path.insert(0, sys.argv[1])
import ensfacil_organization as o
items = o.load_items()
cases = json.load(sys.stdin)
out = {"items": items, "views": [], "assign": []}
for case in cases:
    item = o.get_item(items, case["item"])
    seen = o.view_value(item, case["view"], case["type"], case.get("value"))
    out["views"].append(seen)
    # Setting the view to what it reads must leave the item reading the same.
    after = o.assign_view(item, case.get("value"), case["view"], case["type"], seen)
    out["assign"].append(o.view_value(item, case["view"], case["type"], after))
json.dump(out, sys.stdout)
`;

const python = JSON.parse(
  execFileSync('python3', ['-I', '-c', PYTHON, `${__dirname}/../config`], { input: JSON.stringify(cases), encoding: 'utf8' })
);

check('the scripts read the same items as the plugin', JSON.stringify(python.items) === JSON.stringify(ENS_ORGANIZATION_DATA_ITEMS));
const differences = cases
  .map((entry, index) => {
    const item = ENS_ORGANIZATION_DATA_ITEMS.find(candidate => candidate.id === entry.item)!;
    const plugin = organizationViewValue(item, entry.view, { type: entry.type as any }, entry.value as any);
    return JSON.stringify(plugin) === JSON.stringify(python.views[index] ?? undefined) ? undefined : { view: `${entry.view.controlId} ${entry.view.parameterId}`, plugin, script: python.views[index] };
  })
  .filter(Boolean);
check(`every view (${cases.length}) reads the same value in the plugin and in the scripts`, differences.length === 0, differences);
check('some views read nothing in the samples, so the comparison covers empty values too', python.views.some((value: unknown) => value === null));
const roundTrip = cases
  .map((entry, index) =>
    sameParameterValue({ type: entry.type as any }, python.assign[index] ?? undefined, python.views[index] ?? undefined)
      ? undefined
      : `${entry.view.controlId} ${entry.view.parameterId}`
  )
  .filter(Boolean);
check('setting a parameter through the scripts keeps what it reads (P-xx form)', roundTrip.length === 0, roundTrip);

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
