/** The controls the engine judges have one definition: the oscompliance-ens catalog. */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ENGINE_JUDGED_CONTROLS } from '../common/ens/core/engine-judged';
import { ENGINE_CATALOG, controlBlockOf } from '../common/ens/catalog/engine-catalog';
import { ENSCatalog } from '../common/ens/catalog';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';

declare const __dirname: string;
declare const process: { env: Record<string, string | undefined>; exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`);
  if (!c) failures.push(n);
};

const plugin = join(__dirname, '..');
const vendored = join(plugin, 'common', 'ens', 'catalog', 'engine');
const files = readdirSync(vendored).filter(file => file.endsWith('.json'));

check('one catalog file per engine-judged control', JSON.stringify(ENGINE_CATALOG.map(entry => entry.control)) === JSON.stringify(ENGINE_JUDGED_CONTROLS), ENGINE_CATALOG.map(entry => entry.control));

const core = join(process.env.CORE_SRC || join(plugin, '..', 'oscompliance-ens'), 'catalog', 'controls', 'ens');
if (existsSync(core)) {
  const drifted = files.filter(file => readFileSync(join(vendored, file), 'utf8') !== readFileSync(join(core, file), 'utf8'));
  check('the copy is byte for byte the oscompliance-ens catalog (config/sync-catalog.ts)', drifted.length === 0, drifted);
  const texts = join(plugin, 'common', 'ens', 'catalog', 'messages', 'es.json');
  check('so are the Spanish texts of its reasons', readFileSync(texts, 'utf8') === readFileSync(join(core, '..', '..', 'messages', 'es.json'), 'utf8'));
} else {
  console.log(`  skip the oscompliance-ens catalog is not at ${core}`);
}

const stale = ENGINE_CATALOG.filter(entry => {
  const block = readFileSync(join(plugin, 'config', `${entry.control.replace(/\./g, '-')}-control-block.json`), 'utf8');
  return block !== JSON.stringify(controlBlockOf(entry), null, 2) + '\n';
}).map(entry => entry.control);
check('every seed block is generated from the catalog', stale.length === 0, stale);

check('the plugin catalog is the engine catalog', ENGINE_CATALOG.every(entry => {
  const control = ENSCatalog.find(item => item.id === entry.control);
  return control && JSON.stringify(control.requirements.map(r => r.id)) === JSON.stringify(entry.requirements.map((r: any) => r.id));
}));
check('so are its evidences', ENGINE_CATALOG.every(entry =>
  JSON.stringify(getEvidenceDefinitions(entry.control).map(e => e.id)) === JSON.stringify(entry.evidences.map((e: any) => e.id))));

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nAll checks pass.');
process.exit(failures.length ? 1 : 0);
