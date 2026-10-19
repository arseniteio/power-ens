// Borrar la configuración declarada de un control.
//
// LO QUE SE BORRA SON LOS VALORES, NO EL CONTROL. La distinción no es un
// tecnicismo: el guardado desde la UI RECHAZA un control que no esté ya en el
// índice (`updateActiveControlConfiguration` lanza si no existe), así que un
// borrado que quitara el bloque entero haría desaparecer la tarjeta de la
// pantalla y dejaría el control imposible de reconfigurar sin volver a sembrar
// desde el servidor con `inject-control.py`. Sería un botón que rompe la
// pantalla y no lo parece.
//
// Y ES DESTRUCTIVO SOBRE DATOS DEL CLIENTE. Esta casa ya se quemó con esto: el
// 30/07 una segunda siembra de `inject-control.py` sustituyó el bloque entero y
// borró la configuración de op.acc.2 —de 83 % a 17 %—. Avisaba por pantalla y
// no bastó. La lección: «cuando una operación
// destruye datos del cliente, el defecto tiene que ser el seguro». Aquí eso
// significa dos cosas:
//
//   1. este servicio NO se puede invocar por accidente: exige que quien llama
//      le pase el `controlId` que va a borrar, y comprueba que coincide;
//   2. la pantalla que lo usa pide escribir ese id a mano antes de habilitar
//      el botón.
//
// Se borran `value` y su modo de comparación. `defaultValue` se conserva: es parte de la
// DEFINICIÓN del parámetro, no de lo que el cliente declaró, y borrarlo dejaría
// el bloque distinto del que siembra `inject-control.py`.
//
// Tipos desde el fichero, nunca desde un barrel de alto nivel.
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../types';

export interface ENSConfigurationResetSummary {
  controlId: string;
  // Cuántos parámetros tenían valor antes de borrar. Es lo que la pantalla
  // enseña para que nadie borre a ciegas.
  clearedParameters: number;
  parameterIds: string[];
}

const hasValue = (
  parameter: ENSControlParameter
): boolean => {
  const value = parameter.value;

  if (value === undefined || value === null) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  // Un `false` o un `0` SON valores declarados. Tratarlos como vacíos diría
  // que no hay nada que borrar sobre una decisión que el responsable tomó.
  return true;
};

// Qué se va a borrar, sin borrar nada. La pantalla lo usa para poder decir
// «vas a borrar 6 parámetros» en vez de un «¿seguro?» que nadie lee.
export const summarizeControlConfigurationReset = (
  control: ENSControlConfiguration
): ENSConfigurationResetSummary => {
  const withValue = control.parameters.filter(hasValue);

  return {
    controlId: control.controlId,
    clearedParameters: withValue.length,
    parameterIds: withValue.map(parameter => parameter.id),
  };
};

// Devuelve el control con los valores borrados. NO persiste: quien persiste es
// `updateActiveControlConfiguration`, que es también quien valida contra el
// servidor. Separarlo permite probar esta función sin `kibana-services`, que
// solo existe en el árbol del plugin `main` de Wazuh.
export const buildClearedControlConfiguration = (
  control: ENSControlConfiguration,
  confirmedControlId: string
): ENSControlConfiguration => {
  // El guardia que hace que esto no se pueda llamar por accidente. Un borrado
  // que se dispara con el control equivocado es peor que no tener botón.
  if (confirmedControlId.trim() !== control.controlId) {
    throw new Error(
      `Borrado cancelado: se pidió confirmar «${control.controlId}» y llegó «${confirmedControlId.trim()}».`
    );
  }

  return {
    ...control,
    parameters: control.parameters.map(parameter => {
      const cleared = { ...parameter };

      delete cleared.value;
      delete cleared.matchMode;
      // `status` es derivado y el cliente HTTP ya lo quita al persistir; se
      // borra también aquí para que lo que devuelve esta función sea
      // exactamente lo que se va a guardar.
      delete cleared.status;

      return cleared;
    }),
  };
};
