// Serie diaria de cumplimiento, calculada por EL MOTOR.
//
// Hasta el 05/08 el gráfico dibujaba otra cosa: promediaba por SEMANA los
// `score_snapshot` que emite el agente. Eran dos números distintos en la misma
// pantalla —el agente puntúa sobre su propio denominador y no lee los
// parámetros que el auditor declara— y nada avisaba de que el panel y la línea
// no hablaban de lo mismo. Con op.acc.2 en 0 % arriba, la línea decía otra cosa.
//
// Aquí cada punto se calcula igual que el panel: mismo motor, mismos eventos,
// mismos parámetros de la pantalla. Entre dos puntos solo cambia el INSTANTE al
// que se evalúa, y por eso el último punto es literalmente el número del panel.
//
// El reparto por días, el acumulado y el origen de la serie están en
// `timeline-cuts.ts`, que no importa el motor y por eso se puede probar.
import { ENSLevel } from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { getENSComplianceState } from '../ens-engine';
import { ENSAgentScope } from '../scope/types';
import {
  buildENSTimelineCuts,
  ENSTimelineCutsOptions,
} from './timeline-cuts';

export interface ENSComplianceTimelinePoint {
  // El instante al que se evaluó este punto.
  date: Date;
  label: string;
  score: number;
  // El último punto es el presente: mismos eventos y mismo instante que el
  // panel, así que su número es el del panel.
  isCurrent: boolean;
  // Cuántos eventos conocía el motor en ese corte. Es el diagnóstico que
  // separa «bajó porque la máquina empeoró» de «bajó porque dejó de reportar».
  events: number;
}

export interface ENSComplianceTimelineOptions
  extends ENSTimelineCutsOptions {
  agentId?: string;
  scopeAgents?: ENSAgentScope[];
}

export const buildENSComplianceTimeline = (
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  options: ENSComplianceTimelineOptions = {}
): ENSComplianceTimelinePoint[] =>
  buildENSTimelineCuts(events, options).map(cut => {
    const state = getENSComplianceState(
      level,
      cut.events,
      options.agentId,
      options.scopeAgents,
      cut.cutoff
    );

    return {
      date: cut.cutoff,
      label: cut.label,
      score: state.controlSummary.scoreAverage,
      isCurrent: cut.isCurrent,
      events: cut.events.length,
    };
  });
