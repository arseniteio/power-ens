import { ENSComplianceState } from '../../compliance-state/types';
import { scoreByStatus } from '../../evaluation/utils/score';
import { FamilyComplianceModel } from '../models/family-compliance.model';

const familyNames: Record<string, string> = {
  'OP.ACC': 'Control de acceso',
  'OP.EXP': 'Explotación',
  'OP.MON': 'Monitorización del sistema',
  'MP.INFO': 'Protección de la información',
  'MP.S': 'Protección de los servicios',
  'MP.COM': 'Protección de las comunicaciones',
  'MP.SW': 'Protección de las aplicaciones',
  'MP.EQ': 'Protección del equipo',
};

export const buildFamilyComplianceModel = (
  complianceState: ENSComplianceState
): FamilyComplianceModel => {
  const grouped = complianceState.results.reduce<Record<string, {
    total: number;
    cumple: number;
    parcial: number;
    noCumple: number;
    noEvaluable: number;
    noAplica: number;
    scoreSum: number;
  }>>((acc, result) => {
    const family =
      String(result.control.id || '')
        .split('.')
        .slice(0, 2)
        .join('.')
        .toUpperCase() || 'ENS';

    acc[family] = acc[family] || {
      total: 0,
      cumple: 0,
      parcial: 0,
      noCumple: 0,
      noEvaluable: 0,
      noAplica: 0,
      scoreSum: 0,
    };

    acc[family].total += 1;

    if (result.status === 'CUMPLE') {
      acc[family].cumple += 1;
    }

    if (result.status === 'PARCIAL') {
      acc[family].parcial += 1;
    }

    if (result.status === 'NO_CUMPLE') {
      acc[family].noCumple += 1;
    }

    if (result.status === 'NO_EVALUABLE') {
      acc[family].noEvaluable += 1;
    }

    if (result.status === 'NO_APLICA') {
      acc[family].noAplica += 1;
    }
   
    if (result.status !== 'NO_APLICA') {
      acc[family].scoreSum += scoreByStatus(result.status);
    }

    return acc;
  }, {});

  const rows = Object.entries(grouped).map(([family, data]) => {
    const evaluable = Math.max(data.total - data.noAplica, 0);

    return {
      family,
      label: familyNames[family] || 'Familia ENS',
      total: data.total,
      evaluable,
      cumple: data.cumple,
      parcial: data.parcial,
      noCumple: data.noCumple,
      noEvaluable: data.noEvaluable,
      noAplica: data.noAplica,
      percent: evaluable ? Math.round(data.scoreSum / evaluable) : 0,
    };
  }).sort((a, b) => a.percent - b.percent);

  return {
    title: 'CUMPLIMIENTO POR FAMILIA DE CONTROLES ENS',
    rows,
  };
};
