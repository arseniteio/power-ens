/**
 * Borrar la configuración declarada de un control.
 *
 *     ~/.bun/bin/bun run tests/borrar-configuracion.test.ts
 *
 * POR QUÉ EXISTE ESTE FICHERO. Un borrado destruye datos del cliente, y esta
 * casa ya se quemó con eso: el 30/07 una segunda siembra de
 * `inject-control.py` sustituyó el bloque entero y borró la configuración de
 * op.acc.2 —de 83 % a 17 %—. Avisaba por pantalla y no bastó. La lección quedó
 * en CLAUDE.md: «cuando una operación destruye datos del cliente, el defecto
 * tiene que ser el seguro».
 *
 * Así que aquí se prueban las dos mitades:
 *
 *   - que BORRE lo que tiene que borrar (los valores), y
 *   - que NO borre lo que no (el control, sus parámetros, sus definiciones),
 *     porque el guardado desde la UI rechaza un control que no esté ya en el
 *     índice: un borrado que quitara el bloque haría desaparecer la tarjeta y
 *     dejaría el control imposible de reconfigurar sin volver al servidor.
 *
 * Cada afirmación lleva su reversión al lado.
 */
import {
  buildClearedControlConfiguration,
  summarizeControlConfigurationReset,
} from '../dashboard/ens/configuration/services/configuration-reset-service';
import { opAcc1Configuration } from '../dashboard/ens/configuration/data/op-acc-1-parameters';
import type {
  ENSControlConfiguration,
} from '../dashboard/ens/configuration/types';

// El repo no tiene @types/node y no va a tenerlos.
declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle: string = ''
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

// Se parte de la configuración REAL de op.acc.1 y se le ponen valores, como
// haría un auditor. Una fixture inventada probaría un control que no existe.
const configurada = (): ENSControlConfiguration => ({
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map((parameter, index) => {
    if (index === 0) {
      return { ...parameter, value: 'unix' };
    }

    if (index === 1) {
      return { ...parameter, value: ['admin', 'guest'] };
    }

    if (index === 2) {
      return { ...parameter, value: 90 };
    }

    // Los demás se quedan SIN valor: una configuración real está a medias casi
    // siempre, y el resumen tiene que contar solo lo que hay.
    const sinValor = { ...parameter };
    delete sinValor.value;

    return sinValor;
  }),
});

// --- 1. el resumen cuenta lo que hay ---------------------------------------

bloque('1. El resumen dice qué se va a borrar, sin borrar nada');

{
  const control = configurada();
  const resumen = summarizeControlConfigurationReset(control);

  comprueba(
    'cuenta exactamente los parámetros CON valor',
    resumen.clearedParameters === 3,
    String(resumen.clearedParameters)
  );

  comprueba(
    'y los nombra, para que nadie borre a ciegas',
    resumen.parameterIds.length === 3,
    resumen.parameterIds.join(',')
  );

  // La reversión: mirar el resumen NO puede haber tocado nada.
  comprueba(
    'el resumen no modifica el control',
    control.parameters[0].value === 'unix',
    String(control.parameters[0].value)
  );

  // Y sobre un control sin configurar, no hay nada que borrar.
  const virgen = summarizeControlConfigurationReset(opAcc1Configuration);

  comprueba(
    'sobre un control sin configurar, no hay nada que borrar',
    virgen.clearedParameters === 0,
    String(virgen.clearedParameters)
  );
}

bloque('2. Un `false` y un `0` SON valores declarados');

{
  // Es la trampa fácil: tratar los valores falsy como vacíos diría que no hay
  // nada que borrar sobre una decisión que el responsable tomó.
  const control: ENSControlConfiguration = {
    ...opAcc1Configuration,
    parameters: [
      { ...opAcc1Configuration.parameters[0], value: false },
      { ...opAcc1Configuration.parameters[1], value: 0 },
    ],
  } as ENSControlConfiguration;

  comprueba(
    'un false y un 0 cuentan como configurados',
    summarizeControlConfigurationReset(control).clearedParameters === 2,
    String(summarizeControlConfigurationReset(control).clearedParameters)
  );

  // La reversión: una cadena vacía y una lista vacía NO son valores.
  const vacios: ENSControlConfiguration = {
    ...opAcc1Configuration,
    parameters: [
      { ...opAcc1Configuration.parameters[0], value: '   ' },
      { ...opAcc1Configuration.parameters[1], value: [] },
    ],
  } as ENSControlConfiguration;

  comprueba(
    'pero una cadena en blanco y una lista vacía no',
    summarizeControlConfigurationReset(vacios).clearedParameters === 0,
    String(summarizeControlConfigurationReset(vacios).clearedParameters)
  );
}

// --- 3. el borrado quita los valores y NADA más ----------------------------

bloque('3. Se borran los valores, no el control');

{
  const control = configurada();
  const limpio = buildClearedControlConfiguration(control, 'op.acc.1');

  comprueba(
    'ningún parámetro conserva valor',
    limpio.parameters.every(
      parameter => parameter.value === undefined
    ),
    limpio.parameters
      .filter(p => p.value !== undefined)
      .map(p => p.id)
      .join(',')
  );

  // LO QUE NO SE BORRA, que es la mitad que importa: el control sigue siendo
  // un control con todos sus parámetros. Si el bloque desapareciera, la
  // tarjeta se iría de la pantalla y no habría forma de reconfigurar desde la
  // UI: `updateActiveControlConfiguration` rechaza un control que no esté ya
  // en el índice.
  comprueba(
    'el control conserva su identidad',
    limpio.controlId === 'op.acc.1' &&
      limpio.controlName === opAcc1Configuration.controlName,
    limpio.controlId
  );

  comprueba(
    'y conserva TODOS sus parámetros, con su definición',
    limpio.parameters.length === opAcc1Configuration.parameters.length,
    `${limpio.parameters.length} vs ${opAcc1Configuration.parameters.length}`
  );

  comprueba(
    'incluidos nombre, tipo y obligatoriedad de cada uno',
    limpio.parameters.every((parameter, index) => {
      const original = opAcc1Configuration.parameters[index];

      return (
        parameter.id === original.id &&
        parameter.name === original.name &&
        parameter.type === original.type &&
        parameter.required === original.required
      );
    })
  );

  // `defaultValue` es parte de la DEFINICIÓN, no de lo que declaró el cliente.
  // Borrarlo dejaría el bloque distinto del que siembra `inject-control.py`.
  comprueba(
    'y el defaultValue, que es de la definición y no del cliente',
    limpio.parameters.every((parameter, index) =>
      parameter.defaultValue ===
        opAcc1Configuration.parameters[index].defaultValue
    )
  );

  // La reversión de todo lo anterior: el original NO se ha tocado. Si esta
  // función mutara, el «cancelar» de la pantalla no podría deshacer nada.
  comprueba(
    'y el control original queda intacto (no muta)',
    control.parameters[0].value === 'unix',
    String(control.parameters[0].value)
  );
}

// --- 4. el guardia contra el borrado accidental ----------------------------

bloque('4. No se puede borrar el control equivocado');

{
  const control = configurada();

  let lanzó = false;

  try {
    buildClearedControlConfiguration(control, 'op.acc.2');
  } catch (error) {
    lanzó = true;
  }

  comprueba(
    'confirmar OTRO control no borra: lanza',
    lanzó,
    'un borrado que se dispara con el control equivocado es peor que no tener botón'
  );

  let lanzóVacio = false;

  try {
    buildClearedControlConfiguration(control, '');
  } catch (error) {
    lanzóVacio = true;
  }

  comprueba(
    'confirmar con la cadena vacía tampoco',
    lanzóVacio
  );

  // La reversión: con el id correcto sí borra. Sin esto, un guardia que
  // lanzara SIEMPRE pasaría las dos comprobaciones de arriba.
  comprueba(
    'y con el id correcto sí borra',
    buildClearedControlConfiguration(control, 'op.acc.1')
      .parameters.every(parameter => parameter.value === undefined)
  );

  // Los espacios alrededor no cuentan: quien teclea el id en la pantalla puede
  // dejarse un espacio, y rechazarlo por eso sería una crueldad sin ganancia.
  comprueba(
    'los espacios alrededor del id no impiden el borrado',
    buildClearedControlConfiguration(control, '  op.acc.1  ')
      .parameters.every(parameter => parameter.value === undefined)
  );
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(fallo => console.log(`  - ${fallo}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
