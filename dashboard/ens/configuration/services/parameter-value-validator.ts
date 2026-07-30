import {
  ENSControlParameter,
  ENSParameterValueVerdict,
} from '../types';

// Criterio de validez de un VALOR de parámetro, por tipo.
//
// Por qué un módulo nuevo y no una ampliación de los dos validadores que ya
// existen en esta carpeta:
//
//   - `configuration-structure-validator.ts` responde "¿esto es un documento de
//     configuración ENS?". Se usa como guardia dura en la hidratación y en el
//     guardado (`assertENSConfigurationVersion` LANZA). Si el criterio semántico
//     viviera ahí, un `umask_minimo: 'abc'` escrito por el auditor tiraría la
//     pantalla de Configuración entera en vez de degradar un control: el modo de
//     fallo sería peor que el problema que arregla.
//   - `validation-engine.ts` responde "¿está este control configurado para este
//     nivel?". Es el consumidor natural del criterio, no su sitio: devuelve un
//     agregado por control, y el formulario necesita el motivo campo a campo.
//
// Así que el criterio vive aquí, en funciones puras sin estado, y lo consumen
// los dos. Este módulo importa solo de `../types` (regla del ciclo TDZ).
//
// Contrato: esta función juzga un valor PRESENTE. La ausencia de valor no es un
// valor inválido —es "sin configurar"— y la decide `hasValue` en el
// validation-engine. Por eso un valor vacío sale VÁLIDO de aquí.

const VALIDO: ENSParameterValueVerdict = { valid: true };

const invalido = (
  reason: string
): ENSParameterValueVerdict => ({
  valid: false,
  reason,
});

// Representación corta del valor recibido para el mensaje al auditor. Un valor
// larguísimo pegado por error no puede reventar la tarjeta ni el informe.
const describeValue = (
  value: ENSControlParameter['value']
): string => {
  const texto = Array.isArray(value)
    ? `[${value.map(item => String(item)).join(', ')}]`
    : String(value);

  return texto.length > 60
    ? `'${texto.slice(0, 57)}...'`
    : `'${texto}'`;
};

const asTrimmedString = (
  value: ENSControlParameter['value']
): string =>
  typeof value === 'string'
    ? value.trim()
    : typeof value === 'number' ||
      typeof value === 'boolean'
    ? String(value)
    : '';

// Un valor ausente o vacío no se juzga aquí (ver contrato arriba).
export const isEmptyParameterValue = (
  value: ENSControlParameter['value']
): boolean => {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return (
      value.filter(
        item => String(item).trim().length > 0
      ).length === 0
    );
  }

  return false;
};

// Partición del valor heredado en forma de cadena para los parámetros `list`.
// Es la misma que usa `list-parameter-renderer.tsx` y por el mismo motivo: se
// parte por saltos de línea y por comas, NUNCA por `|`, que en este producto
// separa los campos de un mismo elemento ('srv-dc01 | Windows'). Partir por `|`
// convertiría un elemento bien escrito en dos elementos rotos.
export const toParameterListItems = (
  value: ENSControlParameter['value']
): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return [String(value)];
  }

  return [];
};

const ENTERO_NO_NEGATIVO = /^\d+$/;
const NUMERO = /^-?\d+(?:\.\d+)?$/;

// umask: tres o cuatro dígitos octales (el cuarto es el bit setuid/setgid/sticky).
const UMASK_OCTAL = /^[0-7]{3,4}$/;

// Ruta POSIX absoluta: empieza por `/`.
const RUTA_POSIX_ABSOLUTA = /^\/\S/;

// Ruta Windows con unidad: `C:\Backups`, `C:/Backups`, `C:\`.
const RUTA_WINDOWS_ABSOLUTA = /^[A-Za-z]:[\\/]/;

// Ruta UNC: `\\nas-dr\backup`.
const RUTA_UNC = /^\\\\[^\\/\s]+\\[^\\/\s]/;

// URI con esquema y autoridad: `s3://bucket/x`, `nfs://nas/vol`, `https://...`.
// mp.info.6 P-09 declara `path` pero su descripción dice "Ruta, URL o punto de
// montaje", así que un repositorio offsite en forma de URI es un valor legítimo.
const URI_CON_ESQUEMA =
  /^[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+$/;

// Formas booleanas que el producto usa de verdad. Las de verdad, no las que
// serían bonitas: `toBoolean` del policy-runtime acepta true/'true'/'sí'/'si'/
// 'yes', y los ejemplos de las fichas escriben 'sí / no'. Todo lo demás cae hoy
// silenciosamente en `false`, que es justo lo que hay que dejar de tolerar.
const BOOLEANOS_CIERTOS = [
  'true',
  'sí',
  'si',
  's',
  'yes',
  '1',
];

const BOOLEANOS_FALSOS = [
  'false',
  'no',
  'n',
  '0',
];

const unidadDuracion = (
  type: ENSControlParameter['type']
): string =>
  type === 'duration_hours'
    ? 'horas'
    : 'días';

const ejemploDuracion = (
  type: ENSControlParameter['type']
): string =>
  type === 'duration_hours' ? '24' : '30';

// Rango declarado en la ficha (`minValue` / `maxValue`). Va aparte del formato
// porque se aplica igual al entero suelto y a cada umbral del contrato de P-05.
const validarRango = (
  parameter: ENSControlParameter,
  numero: number
): ENSParameterValueVerdict => {
  if (
    parameter.minValue !== undefined &&
    numero < parameter.minValue
  ) {
    return invalido(
      `el mínimo admitido es ${parameter.minValue}; se recibió ${numero}`
    );
  }

  if (
    parameter.maxValue !== undefined &&
    numero > parameter.maxValue
  ) {
    return invalido(
      `el máximo admitido es ${parameter.maxValue}; se recibió ${numero}`
    );
  }

  return VALIDO;
};

// `duration_days` / `duration_hours`: entero no negativo. Ni decimales, ni
// signo, ni sufijos, ni texto. Se tolera la cadena numérica ('30') porque es lo
// que puede haber quedado en el índice de una siembra manual y significa
// exactamente lo mismo; lo que no se tolera es que no signifique nada.
const validarDuracion = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const unidad = unidadDuracion(parameter.type);

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return invalido(
        `se esperaba un número entero de ${unidad}; se recibió ${describeValue(value)}`
      );
    }

    if (!Number.isInteger(value)) {
      return invalido(
        `se esperaba un número entero de ${unidad}, sin decimales; se recibió ${describeValue(value)}`
      );
    }

    if (value < 0) {
      return invalido(
        `se esperaba un número de ${unidad} no negativo; se recibió ${describeValue(value)}`
      );
    }

    return validarRango(parameter, value);
  }

  const texto = asTrimmedString(value);

  if (!ENTERO_NO_NEGATIVO.test(texto)) {
    return invalido(
      `se esperaba un número entero de ${unidad} no negativo (por ejemplo ${ejemploDuracion(
        parameter.type
      )}); se recibió ${describeValue(value)}`
    );
  }

  return validarRango(parameter, Number(texto));
};

const validarNumero = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return invalido(
        `se esperaba un número; se recibió ${describeValue(value)}`
      );
    }

    return validarRango(parameter, value);
  }

  const texto = asTrimmedString(value);

  if (!NUMERO.test(texto)) {
    return invalido(
      `se esperaba un número; se recibió ${describeValue(value)}`
    );
  }

  return validarRango(parameter, Number(texto));
};

const validarBooleano = (
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  if (typeof value === 'boolean') {
    return VALIDO;
  }

  const texto = asTrimmedString(value).toLowerCase();

  if (
    BOOLEANOS_CIERTOS.includes(texto) ||
    BOOLEANOS_FALSOS.includes(texto)
  ) {
    return VALIDO;
  }

  return invalido(
    `se esperaba sí o no; se recibió ${describeValue(value)}`
  );
};

// `path`: ruta ABSOLUTA, es decir, resoluble sin saber desde dónde se mira.
// Acepta POSIX, unidad Windows, UNC y URI con esquema, porque el producto
// documenta las cuatro formas (`/backup`, `C:\Backups`, `\\nas-dr\backup`, y la
// descripción de mp.info.6 P-09 admite explícitamente una URL). Rechaza las
// relativas, `~/...` y el nombre suelto: sobre esos no se puede montar FIM.
const validarRuta = (
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const texto = asTrimmedString(value);

  // Un `path` es UNA ruta. Si trae `|` o un salto de línea, lo que hay pegado es
  // el menú del ejemplo de la ficha ('/backup | C:\Backups'), no una ruta: sobre
  // eso no se puede montar FIM y nadie se enteraría.
  if (/[|\n]/.test(texto)) {
    return invalido(
      `se esperaba UNA ruta absoluta, no una lista de alternativas; se recibió ${describeValue(value)}`
    );
  }

  if (
    RUTA_POSIX_ABSOLUTA.test(texto) ||
    RUTA_WINDOWS_ABSOLUTA.test(texto) ||
    RUTA_UNC.test(texto) ||
    URI_CON_ESQUEMA.test(texto)
  ) {
    return VALIDO;
  }

  return invalido(
    `se esperaba una ruta absoluta (/backup, C:\\Backups, \\\\nas-dr\\backup o esquema://destino); se recibió ${describeValue(value)}`
  );
};

const validarUrl = (
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const texto = asTrimmedString(value);

  if (URI_CON_ESQUEMA.test(texto)) {
    return VALIDO;
  }

  return invalido(
    `se esperaba una URL con esquema (https://...); se recibió ${describeValue(value)}`
  );
};

// `list`: al menos un elemento no vacío.
const validarLista = (
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  if (toParameterListItems(value).length > 0) {
    return VALIDO;
  }

  return invalido(
    `se esperaba al menos un elemento; se recibió ${describeValue(value)}`
  );
};

// `select`: si la ficha declara opciones, el valor tiene que ser una de ellas.
//
// PAPEL MOJADO A DÍA DE HOY: ningún bloque `config/*-control-block.json` declara
// `options`, así que para los tres selects reales del producto (op.acc.1 P-01,
// op.acc.2 P-05, mp.info.6 P-10) esto degenera en "no está vacío" y no valida
// nada. El campo `options` existe en el tipo para que declararlo sea lo único
// que haga falta el día que se quiera cerrar; mientras no se declare, un select
// admite cualquier texto.
const validarSeleccion = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const opciones = parameter.options || [];

  if (opciones.length === 0) {
    return VALIDO;
  }

  const texto = asTrimmedString(value);

  const coincide = opciones.some(
    opcion =>
      opcion.trim().toLowerCase() ===
      texto.toLowerCase()
  );

  if (coincide) {
    return VALIDO;
  }

  return invalido(
    `se esperaba una de las opciones declaradas (${opciones.join(', ')}); se recibió ${describeValue(value)}`
  );
};

const validarCadena = (
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  if (asTrimmedString(value).length > 0) {
    return VALIDO;
  }

  return invalido(
    `se esperaba un texto; se recibió ${describeValue(value)}`
  );
};

// --- Refinamientos por parámetro -------------------------------------------
//
// Dos parámetros reales no se dejan validar solo por su `type`, y ninguno de los
// dos justifica un tipo nuevo: un tipo que solo declara un parámetro es un tipo
// que el siguiente generador desde Excel no va a emitir, y volveríamos a la
// validación de mentira. Se refinan por `name`, que ya está declarado en el
// bloque y en `data/`, es estable (lo consume el .env del agente) y no exige
// tocar el generador. La tabla es explícita a propósito: si mañana alguien
// renombra el parámetro, la entrada deja de casar y el tipo base sigue
// validando; nunca al revés (nunca se afloja por accidente).

interface RefinamientoParametro {
  controlId: string;
  name: string;
  criterio: string;
  validar: (
    parameter: ENSControlParameter,
    value: ENSControlParameter['value']
  ) => ENSParameterValueVerdict;
}

// op.acc.2 P-07 `umask_minimo` viaja como `string`.
const validarUmask = (
  _parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const texto = asTrimmedString(value);

  if (UMASK_OCTAL.test(texto)) {
    return VALIDO;
  }

  return invalido(
    `se esperaba un umask de tres o cuatro dígitos octales (022, 027, 0027); se recibió ${describeValue(value)}`
  );
};

// mp.info.6 P-05 `periodo_max_sin_prueba_dias` está declarado `duration_days`,
// pero su valor legítimo NO es solo un entero: la ficha lo ejemplifica como
// 'ALTA=30; MEDIA=90' y `parseRestoreThresholdContract` (policy-runtime) lo
// implementa así. Exigirle un entero pelado marcaría como mal configurado un
// despliegue correcto —una no conformidad falsa, que le cuesta al auditor el
// mismo tiempo que un CUMPLE falso—. Se admiten las dos formas y se valida cada
// umbral del contrato.
const validarUmbralRestauracion = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const texto = asTrimmedString(value);

  // Forma simple: un entero para todos los sistemas.
  if (
    typeof value === 'number' ||
    ENTERO_NO_NEGATIVO.test(texto)
  ) {
    return validarDuracion(parameter, value);
  }

  // Forma contrato: entradas separadas por `;` o salto de línea, igual que las
  // parte `normalizeStringList` en el policy-runtime.
  const entradas = (
    Array.isArray(value)
      ? value.map(item => String(item))
      : texto.split(/[;\n]+/)
  )
    .map(entrada => entrada.trim())
    .filter(Boolean);

  if (entradas.length === 0) {
    return invalido(
      `se esperaba un número entero de días o un contrato por criticidad (ALTA=30; MEDIA=90); se recibió ${describeValue(value)}`
    );
  }

  const invalidas: string[] = [];

  entradas.forEach(entrada => {
    const pareja = entrada.match(
      /^(ALTA|MEDIA|BAJA)\s*=\s*(\d+)$/i
    );

    if (!pareja) {
      invalidas.push(entrada);
      return;
    }

    const rango = validarRango(
      parameter,
      Number(pareja[2])
    );

    if (!rango.valid) {
      invalidas.push(entrada);
    }
  });

  if (invalidas.length > 0) {
    return invalido(
      `se esperaba un número entero de días o un contrato por criticidad (ALTA=30; MEDIA=90); no se entienden estas entradas: ${invalidas
        .map(entrada => `'${entrada}'`)
        .join(', ')}`
    );
  }

  return VALIDO;
};

export const PARAMETER_REFINEMENTS: RefinamientoParametro[] = [
  {
    controlId: 'op.acc.2',
    name: 'umask_minimo',
    criterio:
      'tres o cuatro dígitos octales',
    validar: validarUmask,
  },
  {
    controlId: 'mp.info.6',
    name: 'periodo_max_sin_prueba_dias',
    criterio:
      'entero de días o contrato por criticidad (ALTA=30; MEDIA=90)',
    validar: validarUmbralRestauracion,
  },
];

const buscarRefinamiento = (
  parameter: ENSControlParameter
): RefinamientoParametro | undefined =>
  PARAMETER_REFINEMENTS.find(
    refinamiento =>
      refinamiento.name === parameter.name &&
      refinamiento.controlId ===
        parameter.controlId
  );

const validarPorTipo = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  switch (parameter.type) {
    case 'duration_days':
    case 'duration_hours':
      return validarDuracion(parameter, value);

    case 'number':
      return validarNumero(parameter, value);

    case 'boolean':
      return validarBooleano(value);

    case 'path':
      return validarRuta(value);

    case 'url':
      return validarUrl(value);

    case 'list':
      return validarLista(value);

    case 'select':
      return validarSeleccion(parameter, value);

    case 'string':
      return validarCadena(value);

    default:
      // Tipo no contemplado: no se inventa un veredicto. Si algún día aparece un
      // tipo nuevo en el union, entra por aquí y NO se declara inválido —lo que
      // no se sabe juzgar no se juzga—, pero tampoco se declara válido a ciegas
      // más allá de "tiene algo escrito".
      return validarCadena(value);
  }
};

/**
 * ¿Este parámetro admite SOLO un número, o su valor legítimo puede ser
 * compuesto?
 *
 * Lo consume el form-engine para elegir renderer. mp.info.6 P-05 está declarado
 * `duration_days` pero su valor documentado es 'ALTA=30; MEDIA=90': en un campo
 * numérico eso no se puede ni teclear, y el valor que ya hubiera en el índice se
 * enseñaría vacío y se perdería al guardar.
 */
export const isPlainNumericParameter = (
  parameter: ENSControlParameter
): boolean =>
  (parameter.type === 'number' ||
    parameter.type === 'duration_hours' ||
    parameter.type === 'duration_days') &&
  !buscarRefinamiento(parameter);

/**
 * Juzga si un valor concreto es válido para su parámetro.
 *
 * Un valor vacío se considera VÁLIDO aquí: la ausencia es "sin configurar", no
 * "mal configurado", y son dos arreglos distintos para el auditor.
 */
export const validateParameterValue = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  if (isEmptyParameterValue(value)) {
    return VALIDO;
  }

  const refinamiento =
    buscarRefinamiento(parameter);

  if (refinamiento) {
    return refinamiento.validar(
      parameter,
      value
    );
  }

  return validarPorTipo(parameter, value);
};
