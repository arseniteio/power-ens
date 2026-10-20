/**
 * Validates the WHOLE `active` document of `wazuh-ens-configuration` with the same validator the
 * plugin uses when loading the ENS environment.
 *
 *     npx --yes tsx config/validate-configuration.ts active.json
 *
 * `active.json` is the response of `GET wazuh-ens-configuration/_doc/active` as is (with `_source`),
 * or just its `_source`, or just `_source.configuration`.
 *
 * An invalid parameter does not degrade its control: it prevents loading the whole ENS environment
 * («No se pudo cargar el entorno ENS»). It happens with `value: null` (an empty parameter is the ABSENT
 * `value` key), a table with fewer columns than declared, commas in an `identifier` column, or a
 * dimension level (`confidentialityLevel`, `integrityLevel`, `traceabilityLevel`, `authenticityLevel`,
 * `availabilityLevel`) that is not BAJO, MEDIO or ALTO. A dimension above `ensLevel` loads but is incoherent
 * (the category is the highest dimension): it is reported and exits 1. `inject-control.py` and
 * `set-parameters.py` write what they are given; this check says whether the plugin will accept it.
 *
 * A 1.2.0 document is checked as the plugin loads it: converted first. The organisation data
 * (`organizationData`, 1.4.0) too: what the plugin moves on load, the items with a value, and the items
 * whose controls hold different values (a choice pending in Configuración > General, not an error).
 *
 * Exits 0 if the document is valid and 1 if not, listing each error.
 */
import { readFileSync } from 'fs';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import {
  summarizeAgentsConfiguration,
  validateAgentsConfiguration,
  validateCustomTemplates,
} from '../common/ens/configuration/agents/agent-configuration-validator';
import {
  planTemplateMigration,
  summarizeTemplateMigration,
} from '../common/ens/configuration/agents/template-migration';
import { getCustomTemplates } from '../common/ens/configuration/templates';
import { validateControlParameterValues } from '../common/ens/configuration/services/validation-engine';
import type { ENSControlConfiguration } from '../common/ens/configuration/types';
import {
  ENS_DIMENSION_LEVEL_KEYS,
  ENS_DIMENSIONS,
  findDimensionsAboveENSLevel,
} from '../common/ens/core/control-level';
import {
  checkOrganizationDataKeys,
  describeOrganizationData,
  describeOrganizationFills,
  normalizeOrganizationData,
  organizationSingleValueIssues,
  summarizeOrganizationMigration,
} from '../common/ens/configuration/organization';

declare const process: {
  argv: string[];
  exit(code: number): never;
};

const file = process.argv[2];

if (!file) {
  console.error('usage: npx --yes tsx config/validate-configuration.ts <active.json>');
  process.exit(2);
}

const document = JSON.parse(readFileSync(file, 'utf8'));
const source = document && document._source ? document._source : document;
const configuration =
  source && source.configuration ? source.configuration : source;

const result = validateENSConfigurationStructure(configuration);
const controls = Array.isArray(configuration && configuration.controls)
  ? configuration.controls.map((control: { controlId?: string }) => control.controlId)
  : [];

console.log(`controls (${controls.length}): ${controls.join(' ')}`);

if (configuration && configuration.global) {
  console.log(
    `global level: ${configuration.global.ensLevel || '(not declared)'}` +
      ENS_DIMENSIONS.map(
        dimension => ` · ${dimension}: ${configuration.global[ENS_DIMENSION_LEVEL_KEYS[dimension]] || '(not declared: the global one)'}`
      ).join('')
  );
}

const dimensionErrors: string[] = findDimensionsAboveENSLevel(configuration && configuration.global).map(
  dimension => `${ENS_DIMENSION_LEVEL_KEYS[dimension]} ${configuration.global[ENS_DIMENSION_LEVEL_KEYS[dimension]]} is above ensLevel ${configuration.global.ensLevel}`
);

if (!result.valid) {
  console.log(`INVALID STRUCTURE (${result.errors.length} error(s)): the plugin will NOT load the ENS environment.`);
  result.errors.forEach(error => console.log(`  - ${error}`));
  process.exit(1);
}

console.log('VALID STRUCTURE: the plugin will load this configuration.');

if (dimensionErrors.length) {
  console.log(`INCOHERENT LEVELS (${dimensionErrors.length}): the plugin loads the environment, but the category (ensLevel) must be the highest dimension level and the General tab will not save this.`);
  dimensionErrors.forEach(message => console.log(`  - ${message}`));
}

const conversion = planTemplateMigration(configuration);

if (conversion.changed) {
  console.log(`1.2.0 document: ${summarizeTemplateMigration(conversion)} The plugin converts it on load and writes it with the next save; each agent's values do not change.`);
}

const organization = normalizeOrganizationData(conversion.configuration);
const model = organization.configuration;
const organizationStates = describeOrganizationData(model);
const withValue = organizationStates.filter(state => state.status === 'value').map(state => state.item.id);

if (organization.moved.length || organization.written.length) {
  console.log(`${summarizeOrganizationMigration({ ...organization, conflicts: [], incomplete: [] })} The plugin does it on load and writes it with the next save.`);
  describeOrganizationFills(organization.filled).forEach(line => console.log(`  ${line}`));
}
console.log(`organisation data: ${withValue.length ? withValue.join(', ') : 'no item with value'}`);
organizationStates
  .filter(state => state.status === 'conflict')
  .forEach(state =>
    console.log(
      `  PENDING CHOICE «${state.item.label}» (${state.item.id}): ${state.candidates
        .map(candidate => `${candidate.from} keeps ${candidate.keeps.join(', ') || 'none'}`)
        .join(' | ')}. Each control keeps its value until it is chosen in Configuración > General.${state.reasons.length ? ` ${state.reasons.join('; ')}` : ''}`
    )
  );
// Not a choice: the item stays empty (or a parameter without value) because the value does not fit; the reason says why.
organizationStates
  .filter(state => state.notice)
  .forEach(state =>
    console.log(`  ${state.status === 'incomplete' ? 'NO COMMON VALUE' : 'NOT COMPLETED'} «${state.item.label}» (${state.item.id}): ${state.notice}`)
  );
checkOrganizationDataKeys(configuration.organizationData).forEach(message => console.log(`  warning: ${message}`));
// A parameter that reads one value and finds several rows: which one applies would depend on their order.
const organizationErrors: string[] = organizationStates
  .filter(state => state.value !== undefined)
  .flatMap(state => organizationSingleValueIssues(model, state.item, state.value).map(issue => `«${state.item.label}» ${issue.source}: ${issue.reason}`));
if (organizationErrors.length) {
  console.log(`INVALID ORGANISATION DATA (${organizationErrors.length}): fix the item in Configuración > General or with set-parameters.py.`);
  organizationErrors.forEach(message => console.log(`  - ${message}`));
}

const templates = getCustomTemplates(model);
console.log(`custom templates: ${templates.length ? templates.map(template => `${template.controlId} «${template.name}» (${template.id})`).join(', ') : 'none'}`);

const templateIssues = validateCustomTemplates(model);
const agents = summarizeAgentsConfiguration(model);

if (agents.length) {
  console.log(`agents with settings (${agents.length}):`);
  agents.forEach(agent =>
    console.log(
      `  ${agent.agentId}${agent.name ? ` ${agent.name}` : ''}` +
        ` · type: ${agent.type || '(no type: common values)'} (${agent.typeSource})` +
        ` · assigned templates: ${Object.entries(agent.assignments).map(([controlId, templateId]) => `${controlId}=${templateId}`).join(', ') || '(none: the built-in of its type)'}` +
        ` · own settings: ${agent.ownValues}`
    )
  );
} else {
  console.log('agents with settings: none (everything is evaluated with each control\'s common value)');
}

const issues = validateAgentsConfiguration(model);
const warnings = [...issues.filter(issue => issue.severity === 'warning').map(issue => issue.message), ...templateIssues.filter(issue => issue.severity === 'warning').map(issue => issue.message)];
const errors = [
  ...issues.filter(issue => issue.severity === 'error').map(issue => `agent ${issue.agentId}: ${issue.message}`),
  ...templateIssues.filter(issue => issue.severity === 'error').map(issue => `template ${issue.templateId}: ${issue.message}`),
];

if (warnings.length) {
  console.log(`warnings (${warnings.length}):`);
  warnings.forEach(message => console.log(`  - ${message}`));
}

// The same check as «Ajustes comunes»: a regex written by set-parameters.py is only compiled here.
const commonErrors: string[] = model.controls.flatMap((control: ENSControlConfiguration) =>
  validateControlParameterValues(control, {}).map(issue => `${control.controlId} «${issue.label}»: ${issue.reason}`)
);

if (commonErrors.length) {
  console.log(`INVALID COMMON VALUES (${commonErrors.length}): the plugin loads the environment; the control becomes «Inválido» and whatever depends on that value, NO_EVALUABLE.`);
  commonErrors.forEach(message => console.log(`  - ${message}`));
}

if (!errors.length) {
  console.log('VALID AGENT AND TEMPLATE SETTINGS.');
  process.exit(commonErrors.length || dimensionErrors.length || organizationErrors.length ? 1 : 0);
}

console.log(`INVALID AGENT OR TEMPLATE SETTINGS (${errors.length}): the plugin loads the environment; what «does not apply» is ignored and removed on the agent page or with set-parameters.py, and an agent with an invalid value is evaluated with an invalid configuration.`);
errors.forEach(message => console.log(`  - ${message}`));
process.exit(1);
