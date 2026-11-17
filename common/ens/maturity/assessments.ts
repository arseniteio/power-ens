import type { ENSConfigurationVersion } from '../configuration/types';
import { ENS_MATURITY_MAX, ENSMaturityAssessment } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isLevel = (value: unknown): boolean =>
  value === undefined || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= ENS_MATURITY_MAX);

const MEASURE = /^[a-z]+(\.[a-z]+)?\.[0-9]+$/;

export const validateMaturityShape = (value: unknown, path: string = 'configuration.maturity'): string[] => {
  if (value === undefined) return [];
  if (!isRecord(value) || !Array.isArray(value.assessments)) return [`${path} must be an object with an assessments array.`];
  const errors: string[] = [];
  const seen = new Set<string>();
  value.assessments.forEach((entry, index) => {
    const at = `${path}.assessments[${index}]`;
    if (!isRecord(entry) || typeof entry.measureId !== 'string' || !MEASURE.test(entry.measureId)) {
      errors.push(`${at}.measureId must be an ENS measure such as op.acc.1 or org.2.`);
      return;
    }
    if (seen.has(entry.measureId)) errors.push(`${at}: ${entry.measureId} is assessed twice.`);
    seen.add(entry.measureId);
    if (!isLevel(entry.level)) errors.push(`${at}.level must be an integer from 0 to ${ENS_MATURITY_MAX}.`);
    if (!isLevel(entry.target)) errors.push(`${at}.target must be an integer from 0 to ${ENS_MATURITY_MAX}.`);
    ['references', 'note', 'assessedBy', 'assessedAt'].forEach(key => {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') errors.push(`${at}.${key} must be a string.`);
    });
  });
  return errors;
};

export const assessmentsOf = (configuration: Pick<ENSConfigurationVersion, 'maturity'>): ENSMaturityAssessment[] =>
  configuration.maturity?.assessments || [];

export const assessmentOf = (
  configuration: Pick<ENSConfigurationVersion, 'maturity'>,
  measureId: string
): ENSMaturityAssessment | undefined => assessmentsOf(configuration).find(entry => entry.measureId === measureId);

const emptyAssessment = (entry: ENSMaturityAssessment): boolean =>
  entry.level === undefined && entry.target === undefined && !entry.references?.trim() && !entry.note?.trim();

export const setAssessment = (
  configuration: ENSConfigurationVersion,
  next: ENSMaturityAssessment
): ENSConfigurationVersion => {
  const others = assessmentsOf(configuration).filter(entry => entry.measureId !== next.measureId);
  const assessments = emptyAssessment(next) ? others : [...others, next].sort((a, b) => a.measureId.localeCompare(b.measureId));
  return { ...configuration, maturity: { assessments } };
};

const sameContent = (a: ENSMaturityAssessment, b?: ENSMaturityAssessment): boolean =>
  !!b && a.level === b.level && a.target === b.target && (a.references || '') === (b.references || '') && (a.note || '') === (b.note || '');

// The server signs every assessment whose content changed: a browser cannot claim another author.
export const stampAssessments = (
  next: ENSMaturityAssessment[],
  previous: ENSMaturityAssessment[],
  user: string,
  now: string
): ENSMaturityAssessment[] =>
  next.map(entry => {
    const before = previous.find(item => item.measureId === entry.measureId);
    return sameContent(entry, before)
      ? { ...entry, assessedBy: before!.assessedBy, assessedAt: before!.assessedAt }
      : { ...entry, assessedBy: user, assessedAt: now };
  });
