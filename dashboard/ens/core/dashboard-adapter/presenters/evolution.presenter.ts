import { ENSComplianceState } from '../../compliance-state/types';
import { ENSNormalizedEvent } from '../../data-source/types';
import {
  EvolutionModel,
  EvolutionRowModel,
} from '../models/evolution.model';

interface EvolutionSnapshot {
  eventKey: string;
  agentKey: string;
  weekKey: string;
  date: Date;
  label: string;
  score: number;
}

const normalizeLevel = (
  value: unknown
): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized =
    value.trim().toUpperCase();

  return normalized || undefined;
};

const getWeekKey = (
  date: Date
): string => {
  const weekStart = new Date(date);
  const day = weekStart.getDay() || 7;

  weekStart.setDate(
    weekStart.getDate() - day + 1
  );

  weekStart.setHours(0, 0, 0, 0);

  return weekStart
    .toISOString()
    .slice(0, 10);
};

const getCanonicalEventId = (
  event: ENSNormalizedEvent
): string => {
  const separatorIndex =
    event.id.indexOf('#');

  return separatorIndex >= 0
    ? event.id.slice(0, separatorIndex)
    : event.id;
};

const buildSnapshot = (
  event: ENSNormalizedEvent,
  activeLevel?: string
): EvolutionSnapshot | null => {
  if (
    event.eventType !== 'score_snapshot' ||
    event.isSynthetic
  ) {
    return null;
  }

  const requiredLevel =
    normalizeLevel(activeLevel);

  const snapshotLevel =
    normalizeLevel(
      event.attributes?.nivel ??
        event.attributes?.level
    );

  if (
    requiredLevel &&
    snapshotLevel !== requiredLevel
  ) {
    return null;
  }

  const rawScore =
    event.score ?? event.compliance;

  if (
    rawScore === undefined ||
    rawScore === null
  ) {
    return null;
  }

  const score = Number(rawScore);

  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    return null;
  }

  const date =
    new Date(event.timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const weekKey =
    getWeekKey(date);

  return {
    eventKey:
      `${getCanonicalEventId(event)}|` +
      event.timestamp,

    agentKey:
      event.agentId ||
      event.agentName ||
      '__GLOBAL__',

    weekKey,
    date,

    label:
      new Date(weekKey)
        .toLocaleDateString(
          'es-ES',
          {
            day: '2-digit',
            month: '2-digit',
          }
        ),

    score,
  };
};

export const buildEvolutionModel = (
  complianceState: ENSComplianceState,
  events: ENSNormalizedEvent[] = [],
  activeLevel?: string
): EvolutionModel => {
  const uniqueSnapshots =
    new Map<
      string,
      EvolutionSnapshot
    >();

  events.forEach(event => {
    const snapshot =
      buildSnapshot(
        event,
        activeLevel
      );

    if (!snapshot) {
      return;
    }

    uniqueSnapshots.set(
      snapshot.eventKey,
      snapshot
    );
  });

  const latestByAgentAndWeek =
    new Map<
      string,
      EvolutionSnapshot
    >();

  uniqueSnapshots.forEach(
    snapshot => {
      const key =
        `${snapshot.weekKey}|` +
        snapshot.agentKey;

      const previous =
        latestByAgentAndWeek.get(key);

      if (
        !previous ||
        snapshot.date.getTime() >
          previous.date.getTime()
      ) {
        latestByAgentAndWeek.set(
          key,
          snapshot
        );
      }
    }
  );

  const byWeek =
    Array.from(
      latestByAgentAndWeek.values()
    ).reduce<
      Record<
        string,
        EvolutionSnapshot[]
      >
    >((acc, snapshot) => {
      acc[snapshot.weekKey] =
        acc[snapshot.weekKey] || [];

      acc[snapshot.weekKey].push(
        snapshot
      );

      return acc;
    }, {});

  const rows: EvolutionRowModel[] =
    Object.entries(byWeek)
      .map(([weekKey, snapshots]) => {
        const agentSnapshots =
          snapshots.filter(
            snapshot =>
              snapshot.agentKey !==
              '__GLOBAL__'
          );

        const selected =
          agentSnapshots.length
            ? agentSnapshots
            : snapshots;

        const total =
          selected.reduce(
            (sum, snapshot) =>
              sum + snapshot.score,
            0
          );

        return {
          label: selected[0].label,
          score:
            Math.round(
              total / selected.length
            ),
          date: new Date(weekKey),
        };
      })
      .sort(
        (a, b) =>
          (a.date?.getTime() || 0) -
          (b.date?.getTime() || 0)
      )
      .slice(-6);

  const hasEvaluableControls =
    (
      complianceState
        .controlSummary.cumple +
      complianceState
        .controlSummary.noCumple +
      complianceState
        .controlSummary.parcial
    ) > 0;

  const fallbackRows:
    EvolutionRowModel[] =
      hasEvaluableControls
        ? [
            {
              label: 'Actual',
              score:
                complianceState
                  .controlSummary
                  .scoreAverage,
            },
          ]
        : [];

  const description =
    rows.length > 0
      ? 'Evolución semanal basada en el último snapshot ENS válido por agente para el nivel activo.'
      : hasEvaluableControls
      ? 'No existe histórico válido para el nivel activo. Se muestra el cumplimiento global consolidado actual.'
      : 'No existe histórico válido ni controles evaluables para el nivel activo.';

  return {
    title:
      'EVOLUCIÓN DEL CUMPLIMIENTO GLOBAL',

    rows:
      rows.length
        ? rows
        : fallbackRows,

    description,
  };
};
