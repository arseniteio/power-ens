/**
 * Valida el documento `active` de `wazuh-ens-configuration` ENTERO con el mismo
 * validador que usa el plugin al cargar el entorno ENS.
 *
 *     npx --yes tsx config/validate-configuration.ts active.json
 *
 * `active.json` es la respuesta de
 * `GET wazuh-ens-configuration/_doc/active` tal cual (con `_source`), o solo su
 * `_source`, o solo `_source.configuration`.
 *
 * POR QUÉ EXISTE. Un parámetro inválido no degrada su control: impide cargar el
 * entorno ENS completo, y el panel entero muestra «No se pudo cargar el entorno
 * ENS». Pasa con un `value: null` (un parámetro vacío es la clave `value`
 * AUSENTE), con una tabla con menos columnas de las declaradas, con comas en
 * una columna `identifier` o con un `traceabilityLevel` o un `availabilityLevel`
 * que no es BAJO, MEDIO o ALTO. `inject-control.py` y `set-parameters.py`
 * escriben lo que se les da; esta comprobación es la que dice si el plugin lo
 * va a aceptar. Revisar a ojo falló dos veces seguidas sobre el mismo
 * parámetro.
 *
 * A 1.2.0 document is checked as the plugin loads it: converted first.
 *
 * Sale con 0 si el documento es válido y con 1 si no, listando cada error.
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

declare const process: {
  argv: string[];
  exit(code: number): never;
};

const file = process.argv[2];

if (!file) {
  console.error('uso: npx --yes tsx config/validate-configuration.ts <active.json>');
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

console.log(`controles (${controls.length}): ${controls.join(' ')}`);

if (configuration && configuration.global) {
  console.log(
    `nivel global: ${configuration.global.ensLevel || '(sin declarar)'}` +
      ` · nivel de Trazabilidad: ${configuration.global.traceabilityLevel || '(sin declarar: se usa el global)'}` +
      ` · nivel de Disponibilidad: ${configuration.global.availabilityLevel || '(sin declarar: se usa el global)'}`
  );
}

if (!result.valid) {
  console.log(`ESTRUCTURA INVÁLIDA (${result.errors.length} error(es)): el plugin NO cargará el entorno ENS.`);
  result.errors.forEach(error => console.log(`  - ${error}`));
  process.exit(1);
}

console.log('ESTRUCTURA VÁLIDA: el plugin cargará esta configuración.');

const conversion = planTemplateMigration(configuration);
const model = conversion.configuration;

if (conversion.changed) {
  console.log(`documento de la 1.2.0: ${summarizeTemplateMigration(conversion)} El plugin lo convierte al cargar y lo escribe con el próximo guardado; los valores de cada agente no cambian.`);
}

const templates = getCustomTemplates(model);
console.log(`plantillas propias: ${templates.length ? templates.map(template => `${template.controlId} «${template.name}» (${template.id})`).join(', ') : 'ninguna'}`);

const templateIssues = validateCustomTemplates(model);
const agents = summarizeAgentsConfiguration(model);

if (agents.length) {
  console.log(`agentes con ajustes (${agents.length}):`);
  agents.forEach(agent =>
    console.log(
      `  ${agent.agentId}${agent.name ? ` ${agent.name}` : ''}` +
        ` · tipo: ${agent.type || '(sin tipo: valores comunes)'} (${agent.typeSource})` +
        ` · plantillas asignadas: ${Object.entries(agent.assignments).map(([controlId, templateId]) => `${controlId}=${templateId}`).join(', ') || '(ninguna: la de serie de su tipo)'}` +
        ` · ajustes propios: ${agent.ownValues}`
    )
  );
} else {
  console.log('agentes con ajustes: ninguno (todo se evalúa con el valor común de cada control)');
}

const issues = validateAgentsConfiguration(model);
const warnings = [...issues.filter(issue => issue.severity === 'warning').map(issue => issue.message), ...templateIssues.filter(issue => issue.severity === 'warning').map(issue => issue.message)];
const errors = [
  ...issues.filter(issue => issue.severity === 'error').map(issue => `agente ${issue.agentId}: ${issue.message}`),
  ...templateIssues.filter(issue => issue.severity === 'error').map(issue => `plantilla ${issue.templateId}: ${issue.message}`),
];

if (warnings.length) {
  console.log(`avisos (${warnings.length}):`);
  warnings.forEach(message => console.log(`  - ${message}`));
}

if (!errors.length) {
  console.log('AJUSTES DE AGENTES Y PLANTILLAS VÁLIDOS.');
  process.exit(0);
}

console.log(`AJUSTES DE AGENTES O PLANTILLAS INVÁLIDOS (${errors.length}): el plugin carga el entorno; lo que «no se aplica» se ignora y se quita en la página del agente o con set-parameters.py, y un agente con un valor inválido se evalúa con una configuración inválida.`);
errors.forEach(message => console.log(`  - ${message}`));
process.exit(1);
