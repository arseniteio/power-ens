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
 * LA CAPA POR SISTEMA (`configuration.agents`, 1.2.0). Su forma la comprueba
 * el mismo validador estructural (un valor `null` o un objeto en un agente
 * también impide cargar el entorno). Además se comprueba su significado: que
 * cada control y parámetro exista, que no sea de organización, que cada
 * plantilla exista y no choque con otra, y que cada valor sea válido para su
 * parámetro, y que cada perfil sea de un id de agente. Eso no impide cargar el
 * entorno, pero sale con 1: un valor que no se aplica se ignora, y una máquina
 * con un valor inválido se evalúa con una configuración inválida. Las claves
 * que esta versión no conoce son avisos y no cambian la salida. Se imprime una
 * línea por agente con su tipo, sus plantillas y sus valores propios.
 *
 * Sale con 0 si el documento es válido y con 1 si no, listando cada error.
 */
import { readFileSync } from 'fs';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import {
  summarizeAgentsConfiguration,
  validateAgentsConfiguration,
} from '../common/ens/configuration/agents/agent-configuration-validator';

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

const agents = summarizeAgentsConfiguration(configuration);

if (!agents.length) {
  console.log('valores por sistema: ninguno (todo se evalúa con el valor de la organización)');
  process.exit(0);
}

console.log(`valores por sistema (${agents.length} agente(s)):`);
agents.forEach(agent =>
  console.log(
    `  ${agent.agentId}${agent.name ? ` ${agent.name}` : ''}` +
      ` · tipo: ${agent.type || '(sin tipo)'} (${agent.typeSource})` +
      ` · plantillas: ${agent.templates.join(', ') || '(ninguna)'}` +
      ` · valores propios: ${agent.ownValues}`
  )
);

const issues = validateAgentsConfiguration(configuration);
const warnings = issues.filter(issue => issue.severity === 'warning');
const errors = issues.filter(issue => issue.severity === 'error');

// Lo que esta versión no conoce (de una versión posterior) se ignora: aviso.
if (warnings.length) {
  console.log(`avisos (${warnings.length}): claves que esta versión no conoce y que ignora:`);
  warnings.forEach(issue => console.log(`  - ${issue.message}`));
}

if (!errors.length) {
  console.log('VALORES POR SISTEMA VÁLIDOS.');
  process.exit(0);
}

console.log(`VALORES POR SISTEMA INVÁLIDOS (${errors.length}): el plugin carga el entorno; lo que «no se aplica» se ignora y se quita en la página del agente o con set-parameters.py (null), y una máquina con un valor inválido se evalúa con una configuración inválida.`);
errors.forEach(issue => console.log(`  - agente ${issue.agentId}: ${issue.message}`));
process.exit(1);
