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
 * Sale con 0 si el documento es válido y con 1 si no, listando cada error.
 */
import { readFileSync } from 'fs';
import { validateENSConfigurationStructure } from '../public/ens/configuration/services/configuration-structure-validator';

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

if (result.valid) {
  console.log('ESTRUCTURA VÁLIDA: el plugin cargará esta configuración.');
  process.exit(0);
}

console.log(`ESTRUCTURA INVÁLIDA (${result.errors.length} error(es)): el plugin NO cargará el entorno ENS.`);
result.errors.forEach(error => console.log(`  - ${error}`));
process.exit(1);
