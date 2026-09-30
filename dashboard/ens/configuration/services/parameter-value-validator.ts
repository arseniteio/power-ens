import {
  ENSControlParameter,
  ENSParameterColumn,
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

// PARTICIÓN ÚNICA de un valor de lista en elementos. **Es la única del
// producto**: la usan el formulario (`list-parameter-renderer.tsx`), la
// validación de "configurado" y las policies del motor que leen listas (p. ej.
// `entradas` en `core/policy-runtime/policies/mp-info-6.policy.ts`). Que fuera
// una sola no era así hasta el 30/07 y el desajuste era éste:
//
//   el formulario partía por salto de línea y COMA
//   el runtime partía por salto de línea y PUNTO Y COMA
//
// Un valor heredado 'admin, guest' eran DOS elementos para el formulario y UNO
// para el runtime. La pantalla enseñaba dos usuarios autorizados y la lista
// blanca de P-07 contenía un único sujeto literal 'admin, guest' que no casaba
// con ningún actor: una no conformidad falsa, que le cuesta al auditor lo mismo
// que un CUMPLE falso.
//
// GANA LA UNIÓN, y no por comodidad, sino porque el riesgo es asimétrico:
//   · un separador que el runtime NO reconoce y el formulario sí solo puede
//     FUNDIR elementos que el operador escribió separados, y un elemento fundido
//     no casa con nada: rojo donde no lo hay;
//   · un separador que el formulario NO reconoce y el runtime sí solo puede
//     enseñar de menos, sin cambiar el veredicto.
// Además los dos separadores ya son legítimos en el producto: la coma es la que
// el formulario lleva enseñando desde siempre, y el `;` es el del contrato por
// criticidad de P-05 ('ALTA=30; MEDIA=90'), que `validarUmbralRestauracion`
// parte igual unas líneas más abajo.
//
// NUNCA por `|`: en este producto separa los campos de UN MISMO elemento
// ('srv-dc01 | Windows'). Partir por `|` convertiría un elemento bien escrito
// en dos elementos rotos.
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
      .split(/[\n,;]/)
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
// serían bonitas: la policy de mp.info.6 (P-08) acepta true/'true'/'sí'/'si'/
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

// --- `table`: filas con columnas declaradas ---------------------------------
//
// QUÉ SE GUARDA. Una tabla se guarda como `string[]`: UNA FILA POR ELEMENTO, y
// dentro de cada fila los campos separados por `|`. No es un formato nuevo: es
// EXACTAMENTE el que el producto ya usaba para los elementos con campos
// ('srv-dc01 | Windows', 'jgomez | srv01 | ops'), y por eso `toParameterListItems`
// lleva desde siempre prohibido partir por `|`. Consecuencias, todas buscadas:
//
//   · `ENSControlParameter['value']` no cambia de forma, así que no cambia el
//     validador de estructura, ni el repositorio, ni el mapeo del índice.
//   · Un parámetro que hoy es `list` con elementos de varios campos pasa a
//     `table` SIN migrar un solo dato: los mismos bytes, ahora con columnas
//     declaradas y validación por columna. Es el caso de op.acc.1 P-07.
//   · Lo que el auditor ve y lo que se exporta al `.tsv` de la máquina son la
//     misma tabla, campo a campo.
//
// La celda no puede contener `|` ni saltos de línea (son la estructura). El
// formulario los quita al escribir, y esta validación avisa si una fila trae más
// campos de los que la tabla declara —que es lo que pasa con un valor heredado
// mal separado, y perderlo en silencio sería peor que enseñarlo mal—.

export const TABLE_FIELD_SEPARATOR = ' | ';

export const getParameterColumns = (
  parameter: ENSControlParameter
): ENSParameterColumn[] =>
  (parameter.columns || []).filter(
    columna =>
      !!columna &&
      String(columna.name || '').trim().length >
        0
  );

/**
 * ¿Este parámetro se puede editar como rejilla de filas?
 *
 * Lo consume el form-engine para elegir renderer. Un `table` SIN columnas
 * declaradas se queda en el renderer de lista a propósito: en
 * `wazuh-ens-configuration` puede haber un bloque sembrado antes de que
 * existieran, y una rejilla sin columnas no dejaría editar nada.
 */
export const hasParameterColumns = (
  parameter: ENSControlParameter
): boolean =>
  parameter.type === 'table' &&
  getParameterColumns(parameter).length > 0;

/**
 * PARTICIÓN EN FILAS. Deliberadamente NO es `toParameterListItems`, y la
 * diferencia importa: aquella parte también por COMA y por PUNTO Y COMA, y en
 * una tabla la coma es un carácter legítimo DENTRO de una celda
 * ('lectura,escritura,ejecucion' en los tipos de acceso permitidos). Partir por
 * coma convertiría una fila bien escrita en dos filas rotas.
 *
 * Tampoco descarta las filas en blanco: una fila recién añadida en el formulario
 * está en blanco hasta que se teclea, y filtrarla la haría desaparecer según se
 * pulsa «Añadir fila». Quien las descarta es la validación, que no juzga lo que
 * todavía no se ha escrito.
 */
export const toParameterTableRows = (
  value: ENSControlParameter['value']
): string[] => {
  if (Array.isArray(value)) {
    return value.map(fila => String(fila));
  }

  if (typeof value === 'string') {
    return value.split('\n');
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return [String(value)];
  }

  return [];
};

export const toTableRowCells = (
  fila: string
): string[] =>
  String(fila)
    .split('|')
    .map(celda => celda.trim());

const esFilaEnBlanco = (fila: string): boolean =>
  toTableRowCells(fila).every(
    celda => celda.length === 0
  );

/**
 * Serializa una fila. Una fila con TODAS las celdas vacías se guarda como cadena
 * vacía y no como ' | | ': así `isEmptyParameterValue` la sigue viendo como
 * ausencia, el parámetro sale NO_CONFIGURADO en vez de INVÁLIDO, y una tabla en
 * la que solo se ha pulsado «Añadir fila» no se presenta como un error.
 */
export const tableRowFromCells = (
  celdas: string[]
): string => {
  const limpias = celdas.map(celda =>
    String(celda)
      .replace(/[|\n\r]/g, ' ')
      .trim()
  );

  return limpias.every(celda => !celda)
    ? ''
    : limpias.join(TABLE_FIELD_SEPARATOR);
};

// Comparación tolerante con mayúsculas y espacios sobrantes. Vale igual para las
// opciones de un `select` y para las de una columna.
const normalizarOpcion = (
  texto: string
): string => texto.trim().toLowerCase();

const matchOption = (
  opciones: string[],
  texto: string
): string | undefined => {
  const buscado = normalizarOpcion(texto);

  if (!buscado) {
    return undefined;
  }

  return opciones.find(
    opcion =>
      normalizarOpcion(opcion) === buscado
  );
};

const IDENTIFICADOR = /^[^\s|,]+$/;
const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

// Una fecha que existe de verdad. El regex solo dice que hay ocho dígitos con
// guiones: un 2026-02-31 lo pasa, y una baja declarada en un día que no existe
// no se puede restar de la fecha de deshabilitación.
const esFechaReal = (texto: string): boolean => {
  const partes = texto.match(FECHA_ISO);

  if (!partes) {
    return false;
  }

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);

  if (mes < 1 || mes > 12 || dia < 1) {
    return false;
  }

  const fecha = new Date(
    Date.UTC(anio, mes - 1, dia)
  );

  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
};

/**
 * Criterio de validez de UNA celda para SU columna.
 *
 * Recibe el parámetro además de la columna porque el rango (`minValue` /
 * `maxValue`) sigue declarándose en la ficha: una columna numérica hereda el
 * rango del parámetro en vez de declarar el suyo, que sería un segundo sitio
 * donde decir lo mismo.
 *
 * Contrato igual que el del valor: aquí se juzga una celda PRESENTE. La celda
 * vacía la decide `validarTabla` mirando si su columna es obligatoria.
 */
const validarCelda = (
  columna: ENSParameterColumn,
  parameter: ENSControlParameter,
  celda: string
): ENSParameterValueVerdict => {
  const opciones = (columna.options || [])
    .map(opcion => String(opcion).trim())
    .filter(Boolean);

  switch (columna.type) {
    case 'identifier':
      return IDENTIFICADOR.test(celda)
        ? VALIDO
        : invalido(
            `se esperaba un identificador sin espacios ni comas; se recibió ${describeValue(
              celda
            )}`
          );

    case 'path':
      return validarRuta(celda);

    case 'octal':
      return UMASK_OCTAL.test(celda)
        ? VALIDO
        : invalido(
            `se esperaban tres o cuatro dígitos octales (750, 0750, 2770); se recibió ${describeValue(
              celda
            )}`
          );

    case 'number':
      return validarNumero(parameter, celda);

    case 'date':
      return esFechaReal(celda)
        ? VALIDO
        : invalido(
            `se esperaba una fecha AAAA-MM-DD que exista (2026-03-31); se recibió ${describeValue(
              celda
            )}`
          );

    case 'select':
      if (opciones.length === 0) {
        return VALIDO;
      }

      return matchOption(opciones, celda)
        ? VALIDO
        : invalido(
            `se esperaba una de las opciones declaradas (${opciones.join(
              ', '
            )}); se recibió ${describeValue(celda)}`
          );

    case 'multiselect': {
      // La coma separa los valores DENTRO de la celda. Es el único sitio del
      // producto donde la coma es separador de una tabla, y por eso la partición
      // en filas no la usa.
      const elementos = celda
        .split(',')
        .map(elemento => elemento.trim())
        .filter(Boolean);

      if (elementos.length === 0) {
        return invalido(
          `se esperaba al menos un valor; se recibió ${describeValue(celda)}`
        );
      }

      if (opciones.length === 0) {
        return VALIDO;
      }

      const fuera = elementos.filter(
        elemento =>
          !matchOption(opciones, elemento)
      );

      return fuera.length === 0
        ? VALIDO
        : invalido(
            `se esperaban valores de la lista (${opciones.join(
              ', '
            )}); no lo son: ${fuera
              .map(elemento => `'${elemento}'`)
              .join(', ')}`
          );
    }

    case 'string':
    default:
      return celda.length > 0
        ? VALIDO
        : invalido(
            `se esperaba un texto; se recibió ${describeValue(celda)}`
          );
  }
};

// Un veredicto lleva UN motivo, y una tabla puede tener muchos problemas a la
// vez. Se enumeran los tres primeros y se cuenta el resto: la lista completa
// pegada en una tarjeta o en una no conformidad no se lee, y el auditor arregla
// de arriba abajo de todos modos.
const MAX_PROBLEMAS_ENUMERADOS = 3;

const resumirProblemas = (
  problemas: string[]
): ENSParameterValueVerdict => {
  if (problemas.length === 0) {
    return VALIDO;
  }

  const enumerados = problemas
    .slice(0, MAX_PROBLEMAS_ENUMERADOS)
    .join('; ');

  return invalido(
    problemas.length > MAX_PROBLEMAS_ENUMERADOS
      ? `${enumerados}; y ${problemas.length -
          MAX_PROBLEMAS_ENUMERADOS} problema(s) más`
      : enumerados
  );
};

// `list`: al menos un elemento no vacío. Si el parámetro declara la forma de su
// elemento (`columns[0]`), además cada elemento tiene que significar algo para
// ella: la línea base de SUID es una lista de RUTAS ABSOLUTAS, y un 'sudo' a
// secas no casa con nada —los ~25 SUID legítimos de un Ubuntu limpio saldrían
// entonces como no autorizados, que es un NO_CUMPLE falso masivo—.
const validarLista = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const elementos = toParameterListItems(value);

  if (elementos.length === 0) {
    return invalido(
      `se esperaba al menos un elemento; se recibió ${describeValue(value)}`
    );
  }

  const columna =
    getParameterColumns(parameter)[0];

  if (!columna) {
    return VALIDO;
  }

  const problemas: string[] = [];

  elementos.forEach(elemento => {
    const veredicto = validarCelda(
      columna,
      parameter,
      elemento
    );

    if (!veredicto.valid) {
      problemas.push(
        `'${elemento}': ${veredicto.reason}`
      );
    }
  });

  return resumirProblemas(problemas);
};

/**
 * `table`: al menos una fila, y toda fila empezada tiene que estar completa.
 *
 * QUÉ SE JUZGA Y QUÉ NO:
 *
 *   - Una fila del todo en blanco NO se juzga. Es una fila recién añadida en el
 *     formulario, no una fila mal rellena, y ponerla en rojo antes de que el
 *     auditor teclee la primera letra sería ruido. Si TODAS las filas están en
 *     blanco, el valor entero es vacío y ni siquiera se llega aquí:
 *     `isEmptyParameterValue` lo declara ausencia y el parámetro sale
 *     NO_CONFIGURADO, que es un arreglo distinto (rellenar, no corregir).
 *   - Una fila con algo escrito tiene que traer TODAS sus columnas obligatorias.
 *     Media fila no es política: 'jgomez' sin perfil no dice qué se le autoriza,
 *     y compararlo contra la máquina daría un resultado inventado.
 *   - Una fila con MÁS campos de los declarados se rechaza sin mirar sus celdas:
 *     no se sabe qué campo es cuál, y adivinarlo sería inventar la política. Es
 *     lo que le pasa a un valor heredado escrito con otra separación, y por eso
 *     el motivo dice cuántos campos trae y cuántos declara la tabla.
 */
const validarTabla = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const columnas =
    getParameterColumns(parameter);

  // Tabla sin columnas declaradas: no se sabe juzgar la forma de una fila, así
  // que no se inventa un criterio. Se degrada al de lista —al menos un
  // elemento—, que es lo mismo que hace un `select` sin `options`, y por el
  // mismo motivo: el formulario también la edita como lista, y nunca se rechaza
  // lo que el campo deja escribir.
  if (columnas.length === 0) {
    return validarLista(parameter, value);
  }

  const filas = toParameterTableRows(
    value
  ).filter(fila => !esFilaEnBlanco(fila));

  if (filas.length === 0) {
    return invalido(
      `se esperaba al menos una fila con ${columnas
        .map(columna => columna.label)
        .join(', ')}; se recibió ${describeValue(value)}`
    );
  }

  const problemas: string[] = [];

  filas.forEach((fila, indice) => {
    const numero = indice + 1;
    const celdas = toTableRowCells(fila);

    // UNA ÚLTIMA COLUMNA `variadic` ABSORBE LAS CELDAS DE MÁS.
    //
    // No todo parámetro tabular tiene aridad fija. P-03 de op.acc.3 declara
    // `función | indicador | indicador | …` y su evaluador la lee así de
    // literal: `const [fn, ...indicators] = cells`. Obligarla a dos celdas
    // rompería filas legítimas como
    // `configuracion | /usr/bin/nano | /usr/bin/vim | /usr/bin/tee`, que es
    // exactamente lo que pasó el 06/08/2026 al declararle columnas: la
    // configuración entera del control quedó inválida y el control cayó a
    // «configuración incompleta».
    //
    // La alternativa era dejar el parámetro SIN columnas, y es peor: sin
    // columnas el motor no puede repartir las celdas y las primitivas que
    // nombran una columna se quedan sin nada contra qué contrastar. Se declara
    // lo que hay —una columna fija y una repetible— en vez de no declarar nada.
    const ultima = columnas[columnas.length - 1];
    const admiteDeMas = Boolean(ultima && ultima.variadic);

    if (celdas.length > columnas.length && !admiteDeMas) {
      problemas.push(
        `la fila ${numero} trae ${celdas.length} campos y la tabla declara ${columnas.length} (${columnas
          .map(columna => columna.label)
          .join(', ')})`
      );
      return;
    }

    columnas.forEach((columna, posicion) => {
      const celda = (
        celdas[posicion] || ''
      ).trim();

      if (!celda) {
        if (columna.required) {
          problemas.push(
            `falta «${columna.label}» en la fila ${numero}`
          );
        }
        return;
      }

      const veredicto = validarCelda(
        columna,
        parameter,
        celda
      );

      if (!veredicto.valid) {
        problemas.push(
          `«${columna.label}» de la fila ${numero}: ${veredicto.reason}`
        );
      }
    });
  });

  return resumirProblemas(problemas);
};

// --- `select`: opciones declaradas ------------------------------------------
//
// El criterio de qué opciones hay y cuándo un valor es una de ellas vive aquí y
// no en el renderer, por el mismo motivo que `toParameterListItems`: el
// formulario y el validador tienen que entender las opciones EXACTAMENTE igual,
// o habría valores que el desplegable deja elegir y el motor rechaza.
//
// Los tres selects del producto (op.acc.1 P-01 `fuente_identidad`, op.acc.2 P-05
// `modelo_privilegios` y mp.info.6 P-10 `herramienta_backup`) ya declaran
// `options` en su bloque. Un select SIN opciones sigue admitiendo cualquier
// texto a propósito: en el índice `wazuh-ens-configuration` puede haber todavía
// un bloque sembrado antes de que existieran, y el formulario lo edita como
// texto libre (ver `ParameterRendererFactory`). Declarar opciones y no
// ofrecerlas en el formulario sería peor que no declararlas.

export const getParameterOptions = (
  parameter: ENSControlParameter
): string[] =>
  (parameter.options || [])
    .map(opcion => String(opcion).trim())
    .filter(Boolean);

/**
 * ¿Este parámetro se puede editar como desplegable?
 *
 * Lo consume el form-engine para elegir renderer.
 */
export const hasParameterOptions = (
  parameter: ENSControlParameter
): boolean =>
  parameter.type === 'select' &&
  getParameterOptions(parameter).length > 0;

/**
 * Opción declarada que corresponde al valor recibido, en su forma canónica, o
 * `undefined` si el valor no es ninguna de ellas.
 *
 * La coincidencia es tolerante con mayúsculas y espacios sobrantes ('local' y
 * 'Local' designan la misma fuente de identidad): rechazar esa diferencia
 * convertiría en no conformidad un valor que el auditor escribió bien. La misma
 * tolerancia se aplica a las opciones de una columna, y por eso el criterio vive
 * en `matchOption`, una sola vez para los dos.
 */
export const matchParameterOption = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): string | undefined =>
  matchOption(
    getParameterOptions(parameter),
    asTrimmedString(value)
  );

const validarSeleccion = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const opciones =
    getParameterOptions(parameter);

  if (opciones.length === 0) {
    return VALIDO;
  }

  if (matchParameterOption(parameter, value)) {
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
// 'ALTA=30; MEDIA=90' y `plazoDeRestauracion` (policy de mp.info.6) lo
// implementa así, con la criticidad que P-04 declara para cada máquina.
// Exigirle un entero pelado marcaría como mal configurado un despliegue
// correcto —una no conformidad falsa, que le cuesta al auditor el mismo tiempo
// que un CUMPLE falso—. Se admiten las dos formas y se valida cada
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

  // Forma contrato: entradas separadas igual que en cualquier otra lista del
  // producto, con la misma función que usan el formulario y el runtime. Antes
  // partía aquí mismo por `[;\n]+`: al unificar la partición, un
  // 'ALTA=30, MEDIA=90' habría sido válido para el motor e inválido para esta
  // validación, que es la incoherencia que se está cerrando, no otra nueva.
  const entradas = toParameterListItems(
    Array.isArray(value) ? value : texto
  );

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
      return validarLista(parameter, value);

    case 'table':
      return validarTabla(parameter, value);

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

// Texto con el que se ENSEÑA un valor heredado que no es una cadena. Es solo
// para pintarlo: no se publica al formulario mientras el auditor no toque el
// campo, así que ver un array como texto no reescribe nada en el índice.
const asDisplayText = (
  value: ENSControlParameter['value']
): string => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean)
      .join(', ');
  }

  return asTrimmedString(value);
};

export interface ENSSelectOption {
  value: string;
  label: string;
  // Valor que ya estaba en el índice y no es ninguna de las opciones
  // declaradas. Se ofrece igualmente, marcado, para no hacerlo desaparecer.
  legacy: boolean;
}

export interface ENSSelectFieldModel {
  options: ENSSelectOption[];
  selected: string;
  legacyValue?: string;
}

/**
 * Opciones y selección con las que el formulario pinta un `select`.
 *
 * QUÉ PASA CON EL VALOR HEREDADO. En `wazuh-ens-configuration` puede haber ya un
 * valor escrito a mano —'Veeam Backup & Replication 12', 'local_linux'— que no
 * es ninguna de las opciones declaradas. Aquí NO se borra ni se sustituye por la
 * opción más parecida:
 *
 *   - se ofrece como una opción más, marcada como valor actual fuera de lista, y
 *     sale seleccionada, de modo que el auditor VE lo que había;
 *   - el campo sale en rojo con el motivo del validador, y el guardado lo
 *     rechaza mientras siga puesto (`validateControlParameterValues`), así que
 *     no puede persistirse otra vez;
 *   - hasta que el auditor elija, el valor sigue en el índice tal cual.
 *
 * Adivinar la opción "que quiso decir" sería inventar un dato de cumplimiento, y
 * blanquear el campo perdería la única pista de qué había configurado. La única
 * salida es que alguien decida, que es justo lo que se pide.
 *
 * La coincidencia sí tolera mayúsculas y espacios ('local' -> 'Local'): eso no
 * cambia lo que el valor significa y lo acepta también el validador.
 */
export const resolveSelectFieldModel = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSSelectFieldModel => {
  const options: ENSSelectOption[] =
    getParameterOptions(parameter).map(
      opcion => ({
        value: opcion,
        label: opcion,
        legacy: false,
      })
    );

  if (isEmptyParameterValue(value)) {
    return { options, selected: '' };
  }

  const canonica = matchParameterOption(
    parameter,
    value
  );

  if (canonica) {
    return { options, selected: canonica };
  }

  const heredado = asDisplayText(value);

  if (!heredado) {
    return { options, selected: '' };
  }

  return {
    options: [
      ...options,
      {
        value: heredado,
        label: `${heredado} (valor actual, fuera de la lista)`,
        legacy: true,
      },
    ],
    selected: heredado,
    legacyValue: heredado,
  };
};

// --- modelo del formulario para `table` -------------------------------------
//
// Igual que `resolveSelectFieldModel`, esto vive aquí y no en el renderer: el
// formulario tiene que entender las filas EXACTAMENTE igual que el validador
// —dónde acaba una celda, qué cuenta como fila vacía, qué se hace con una fila
// heredada que trae campos de más—, o habría tablas que la pantalla acepta y el
// motor rechaza. El renderer es una carcasa de EUI sobre estas funciones.

export interface ENSTableCellModel {
  column: ENSParameterColumn;
  value: string;
  // Motivo por el que ESTA celda no vale, para pintarla en rojo sin repetir el
  // criterio en el renderer. Vacío si la celda vale o si está sin rellenar.
  reason?: string;
  // Solo para columnas `select` / `multiselect`.
  options: ENSSelectOption[];
  // Solo para `multiselect`: la celda partida en sus valores.
  items: string[];
  // Sugerencia de qué va en esta celda, sacada del `example` del parámetro. Es
  // placeholder, nunca valor: no se guarda si el auditor no lo teclea.
  placeholder?: string;
}

export interface ENSTableRowModel {
  cells: ENSTableCellModel[];
  // Campos que la fila trae de más y la tabla no declara. Se conservan y se
  // enseñan pegados a la última celda: perderlos en silencio al abrir la
  // pantalla borraría política que alguien escribió.
  overflow: number;
}

export interface ENSTableFieldModel {
  columns: ENSParameterColumn[];
  rows: ENSTableRowModel[];
}

// Placeholder por columna: la celda correspondiente del `example` del parámetro,
// que el bloque ya obliga a que sea UNA fila válida entera.
const placeholdersDeEjemplo = (
  parameter: ENSControlParameter,
  columnas: ENSParameterColumn[]
): string[] => {
  const celdas = parameter.example
    ? toTableRowCells(parameter.example)
    : [];

  return columnas.map(
    (_columna, posicion) =>
      celdas[posicion] || ''
  );
};

const opcionesDeCelda = (
  columna: ENSParameterColumn,
  celda: string
): ENSSelectOption[] => {
  const declaradas = (columna.options || [])
    .map(opcion => String(opcion).trim())
    .filter(Boolean);

  const options: ENSSelectOption[] =
    declaradas.map(opcion => ({
      value: opcion,
      label: opcion,
      legacy: false,
    }));

  // Mismo trato que en `resolveSelectFieldModel`: un valor que ya estaba y no es
  // ninguna de las opciones NO se borra ni se sustituye por el más parecido. Se
  // ofrece marcado, sale elegido, y el campo queda en rojo hasta que alguien
  // decida. Adivinar sería inventar un dato de cumplimiento.
  if (
    columna.type === 'select' &&
    declaradas.length > 0 &&
    celda &&
    !matchOption(declaradas, celda)
  ) {
    options.push({
      value: celda,
      label: `${celda} (valor actual, fuera de la lista)`,
      legacy: true,
    });
  }

  return options;
};

/**
 * Filas y celdas con las que el formulario pinta un `table`.
 *
 * Una fila con MENOS campos de los declarados se rellena con celdas vacías: así
 * el valor heredado de op.acc.1 P-07 ('jgomez' a secas, que era lo que había en
 * el fichero de autorizados) se sigue viendo en su columna, y solo hay que
 * completar lo que falte.
 */
export const resolveTableFieldModel = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSTableFieldModel => {
  const columns =
    getParameterColumns(parameter);

  if (columns.length === 0) {
    return { columns, rows: [] };
  }

  const placeholders = placeholdersDeEjemplo(
    parameter,
    columns
  );

  const rows = toParameterTableRows(value).map(
    fila => {
      const celdas = toTableRowCells(fila);
      const sobran = Math.max(
        0,
        celdas.length - columns.length
      );

      const cells = columns.map(
        (column, posicion) => {
          // Los campos de más se pegan a la última celda: se ven, se pueden
          // corregir a mano, y no desaparecen al guardar.
          const bruto =
            sobran > 0 &&
            posicion === columns.length - 1
              ? celdas
                  .slice(posicion)
                  .join(TABLE_FIELD_SEPARATOR)
              : celdas[posicion] || '';

          const celda = bruto.trim();

          const veredicto = celda
            ? validarCelda(
                column,
                parameter,
                celda
              )
            : VALIDO;

          return {
            column,
            value: celda,
            reason: veredicto.valid
              ? undefined
              : veredicto.reason,
            options: opcionesDeCelda(
              column,
              celda
            ),
            items: celda
              .split(',')
              .map(item => item.trim())
              .filter(Boolean),
            placeholder:
              placeholders[posicion] ||
              undefined,
          };
        }
      );

      return { cells, overflow: sobran };
    }
  );

  return { columns, rows };
};

// Las tres operaciones del formulario, puras: reciben el valor guardado y
// devuelven el siguiente. `undefined` significa "sin configurar", que es lo que
// tiene que quedar cuando se borra la última fila: una tabla vacía no es una
// tabla con una fila en blanco.
const filasComoValor = (
  filas: string[]
): string[] | undefined =>
  filas.length === 0 ? undefined : filas;

export const setTableCell = (
  value: ENSControlParameter['value'],
  parameter: ENSControlParameter,
  rowIndex: number,
  cellIndex: number,
  cellValue: string
): string[] | undefined => {
  const columns =
    getParameterColumns(parameter);
  const filas = toParameterTableRows(value);

  // La guarda es sobre el ÍNDICE, no sobre el contenido de la fila. Una fila en
  // blanco se guarda como cadena vacía, que es FALSA: con un `if (!filas[i])`
  // aquí, la primera celda que se teclea en una fila recién añadida no se
  // publicaba nunca y la rejilla se quedaba muda. Lo caza
  // `config/test_control_blocks.py`, caso «escribir en una celda».
  if (
    rowIndex < 0 ||
    rowIndex >= filas.length
  ) {
    return filasComoValor(filas);
  }

  const celdas = toTableRowCells(filas[rowIndex]);

  const proximas = columns.map(
    (_columna, posicion) =>
      posicion === cellIndex
        ? cellValue
        : celdas[posicion] || ''
  );

  // Los campos de más de una fila heredada viven pegados a la última celda (ver
  // `resolveTableFieldModel`). Si se edita otra celda hay que conservarlos, o
  // corregir la primera columna borraría lo que sobraba en la última.
  if (
    celdas.length > columns.length &&
    cellIndex !== columns.length - 1
  ) {
    proximas[columns.length - 1] = celdas
      .slice(columns.length - 1)
      .join(TABLE_FIELD_SEPARATOR);
  }

  const siguientes = [...filas];
  siguientes[rowIndex] =
    tableRowFromCells(proximas);

  return filasComoValor(siguientes);
};

export const addTableRow = (
  value: ENSControlParameter['value']
): string[] => [
  ...toParameterTableRows(value),
  '',
];

export const removeTableRow = (
  value: ENSControlParameter['value'],
  rowIndex: number
): string[] | undefined =>
  filasComoValor(
    toParameterTableRows(value).filter(
      (_fila, indice) => indice !== rowIndex
    )
  );

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
