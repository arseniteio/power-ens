import type {
  ENSAgentParameterValue,
  ENSSystemType,
} from '../../agent-configuration-1.2.0';

// Una plantilla es CÓDIGO: va versionada con el plugin, se revisa en un MR y
// la evaluación es reproducible (el documento guarda qué plantillas tiene cada
// agente, no una copia de sus valores; la versión del plugin dice cuáles eran).
//
// Reglas, que comprueba `tests/agent-configuration-model.test.ts`:
//   - solo fija parámetros «por plataforma» y siembra «por sistema»; nunca toca
//     uno de organización;
//   - cada valor sale de un ejemplo del bloque semilla, de un `.env.example` o
//     plantilla de configuración de un runbook, o de un valor real de un
//     laboratorio quitando lo que es de otra plataforma o de esa instalación.
//     Lo que no se puede fundamentar se queda SIN VALOR: lo hereda la máquina
//     de la organización o lo declara el responsable en el agente;
//   - cada valor es válido para su parámetro (el mismo validador que el
//     formulario).
export interface ENSConfigurationTemplate {
  id: string;
  label: string;
  description: string;
  // `base`: la plataforma de la máquina (se aplica una). `addon`: un añadido que
  // se suma a la base (copias PBS, Zimbra NE).
  kind: 'base' | 'addon';
  // Los tipos de sistema a los que se propone.
  systemTypes: ENSSystemType[];
  // Plantillas que no se pueden aplicar a la vez que esta.
  incompatibleWith?: string[];
  // Si la plataforma solo tiene recolector para algunos controles, cuáles. El
  // resto no se mide en esa plataforma («sin recolector»), que no es NO_CUMPLE.
  onlyControls?: string[];
  // De dónde sale cada valor, para el auditor.
  sources: string[];
  values: Record<string, Record<string, ENSAgentParameterValue>>;
}
