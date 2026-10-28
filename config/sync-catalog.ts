// Copies the engine catalog of the controls it judges, and the Spanish texts of its reasons, and writes their
// seed blocks from it.
//
//   CORE_SRC=../oscompliance-ens npx tsx config/sync-catalog.ts
//
// CORE_SRC defaults to the oscompliance-ens folder next to the plugin.
import { copyFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };

const plugin = join(__dirname, '..');
const vendored = join(plugin, 'common', 'ens', 'catalog', 'engine');
const source = join(process.env.CORE_SRC || join(plugin, '..', 'oscompliance-ens'), 'catalog', 'controls', 'ens');

for (const name of readdirSync(vendored).filter(file => file.endsWith('.json'))) {
  copyFileSync(join(source, name), join(vendored, name));
}
copyFileSync(join(source, '..', '..', 'messages', 'es.json'), join(plugin, 'common', 'ens', 'catalog', 'messages', 'es.json'));

// Imported after the copy so the blocks come from the files just copied.
const { ENGINE_CATALOG, controlBlockOf } = require('../common/ens/catalog/engine-catalog');
declare const require: any;
for (const entry of ENGINE_CATALOG) {
  const file = join(plugin, 'config', `${entry.control.replace(/\./g, '-')}-control-block.json`);
  writeFileSync(file, JSON.stringify(controlBlockOf(entry), null, 2) + '\n');
}
