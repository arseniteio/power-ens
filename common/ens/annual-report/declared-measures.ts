// Which records each id accepts: the engine's controls their maturity, the measures without engine a declared entry.
import { ENSCatalog } from '../catalog';
import type { ENSMaturityRecordKind } from '../maturity/types';
import { ENS_ANNEX_II_MEASURES, getAnnexMeasure } from './annex-ii-measures';

export const ENS_ANNUAL_REPORT_CONTROL = 'op.mon.2';

const catalogControl = (id: string) => ENSCatalog.find(control => control.id === id);

// 'SIN_MOTOR': not in the catalog; 'SIN_MEDICION': in the catalog in DRAFT; 'MEDIDO': ACTIVE, measured by the engine.
export type ENSMeasureEngine = 'MEDIDO' | 'SIN_MEDICION' | 'SIN_MOTOR';

export const measureEngine = (id: string): ENSMeasureEngine => {
  const control = catalogControl(id);
  return !control ? 'SIN_MOTOR' : control.status === 'ACTIVE' ? 'MEDIDO' : 'SIN_MEDICION';
};

// The Annex II measures that take a declared entry: the 39 outside the catalog and the DRAFT ones, in Annex order.
export const ENS_MEASURES_WITHOUT_ENGINE = ENS_ANNEX_II_MEASURES.filter(measure => measureEngine(measure.id) !== 'MEDIDO');

// Why `kind` cannot be recorded for `id`, or undefined.
export const maturityRecordTargetError = (id: string, kind: ENSMaturityRecordKind): string | undefined => {
  if (kind === 'declaration') {
    if (!getAnnexMeasure(id)) return `«${id}» no es una medida del Anexo II.`;
    return measureEngine(id) === 'MEDIDO'
      ? `${id} lo mide Power ENS: su implantación sale del motor y su madurez se valora en su detalle, no con una entrada declarada.`
      : undefined;
  }
  if (kind === 'resources') {
    return id === ENS_ANNUAL_REPORT_CONTROL ? undefined : `Los recursos TIC totales se registran en ${ENS_ANNUAL_REPORT_CONTROL}.`;
  }
  return catalogControl(id) ? undefined : `El control «${id}» no está en el catálogo de Power ENS.`;
};
