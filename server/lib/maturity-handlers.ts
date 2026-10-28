// Maturity routes: append one entry to a control's record (own document, version and history) and read snapshots.
import type { Logger } from '../../../../src/core/server';
import { maturityRecordTargetError } from '../../common/ens/annual-report/declared-measures';
import {
  appendMaturityEntry,
  describeMaturityEntry,
  ENS_MATURITY_RECORD_KINDS,
  readControlMaturityRecord,
  validateMaturityEntry,
} from '../../common/ens/maturity/maturity-records';
import type { ENSMaturityRecordKind } from '../../common/ens/maturity/types';
import { resolveCurrentUser } from './current-user';
import {
  ENSMaturityConflictError,
  parseMaturityVersion,
  persistMaturityRecords,
  readMaturityDocument,
} from './maturity/maturity-storage';
import type { ENSMaturityService } from './maturity/maturity-service';
import { ENSMaturityUnavailableError } from './maturity/maturity-service';
import { ENSIncompleteDataError } from './evaluation/facts-reader';

interface Options {
  logger: Logger;
  securityEnabled: boolean;
  maturity: ENSMaturityService;
  clock?: () => Date;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const correct = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const failure = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

const NO_ROLE = 'Hace falta el rol power_ens_admin o all_access para registrar la madurez.';
const NO_VERSION = 'Falta expectedVersion: la versión de la madurez que se ha leído (null si no había ninguna).';
const HISTORY_NOT_WRITTEN = 'Guardado; no se pudo registrar el historial';
const NOT_COMPUTED = 'No se ha podido calcular el nivel acreditado del control';

// Why the accredited level could not be computed: the timeout, incomplete data, a refused read, or anything else.
const accreditedFailure = (response: any, error: any) => {
  if (error instanceof ENSMaturityUnavailableError) return failure(response, 503, error.message);
  if (error instanceof ENSIncompleteDataError) return failure(response, 503, `${NOT_COMPUTED}. ${error.message}`);
  const status = statusOf(error);
  if (status === 401 || status === 403) return failure(response, status, `${NOT_COMPUTED}: sin permiso para leer sus datos.`);
  return failure(response, 500, `${NOT_COMPUTED}; el detalle está en el log del dashboard.`);
};

export const createMaturityHandlers = ({ logger, securityEnabled, maturity, clock = () => new Date() }: Options) => {
  const internal = (context: any) => context.core.opensearch.client.asInternalUser;
  const clients = (context: any) => ({
    asCurrentUser: context.core.opensearch.client.asCurrentUser,
    asInternalUser: context.core.opensearch.client.asInternalUser,
  });

  // The user if they administer Power ENS; otherwise the error response (each refusal is logged).
  const administrator = async (context: any, response: any, logLabel: string) => {
    try {
      const user = await resolveCurrentUser(context.core.opensearch.client.asCurrentUser, securityEnabled);
      if (!user.administrator) {
        logger.warn(`ENS maturity: refused ${logLabel} for ${user.username || 'an unnamed user'} (lacks power_ens_admin and all_access)`);
        return { error: failure(response, 403, NO_ROLE) };
      }
      if (!user.username) return { error: failure(response, 401, 'No se pudo identificar al usuario.') };
      return { username: user.username };
    } catch (error: any) {
      const status = statusOf(error);
      if (status === 401 || status === 403) return { error: failure(response, status, error?.message || 'No autorizado') };
      logger.error(`Could not check the ENS maturity user: ${error?.message || error}`);
      return { error: failure(response, 500, 'No se pudo comprobar el usuario; el detalle está en el log del dashboard.') };
    }
  };

  const save = async (context: any, request: any, response: any) => {
    const body = request?.body || {};
    const controlId = text(body.controlId);
    const kind = body.kind as ENSMaturityRecordKind;
    if (!controlId) return failure(response, 400, 'El control «» no está en el catálogo de Power ENS.');
    const knownKind = ENS_MATURITY_RECORD_KINDS.includes(kind);
    // A catalog control takes its maturity; a measure without engine, its declared entry; op.mon.2, the ICT resources.
    const targetError = maturityRecordTargetError(controlId, knownKind ? kind : 'assessment');
    if (targetError) return failure(response, 400, targetError);
    if (!knownKind) return failure(response, 400, `Registro de madurez desconocido: «${String(kind)}».`);
    if (body.expectedVersion === undefined) return failure(response, 400, NO_VERSION);
    const now = clock();
    // The format first (the justification rule needs the accredited level, computed below).
    const shape = validateMaturityEntry(kind, body.entry, now, 5);
    if (shape.errors.length) return failure(response, 400, shape.errors.join(' '));

    const access = await administrator(context, response, `record the maturity of ${controlId}`);
    if (access.error) return access.error;
    const username = access.username!;

    // The level is computed now; if it cannot be, nothing is saved and the person is told to try again.
    let accredited: Awaited<ReturnType<ENSMaturityService['accreditedFor']>>;
    if (kind === 'assessment') {
      try {
        accredited = await maturity.accreditedFor(clients(context), controlId);
      } catch (error: any) {
        logger.warn(`ENS maturity: the accredited level of ${controlId} could not be computed: ${error?.message || error}`);
        return accreditedFailure(response, error);
      }
    }
    const checked = validateMaturityEntry(kind, body.entry, now, accredited?.level);
    if (checked.errors.length || !checked.entry) return failure(response, 400, checked.errors.join(' '));

    try {
      const current = await readMaturityDocument(internal(context), logger);
      const expected = parseMaturityVersion(body.expectedVersion);
      const stale = current.version
        ? !expected || expected.seqNo !== current.version.seqNo || expected.primaryTerm !== current.version.primaryTerm
        : body.expectedVersion !== null;
      if (stale) {
        logger.warn(`ENS maturity: refused a stale record by ${username}`);
        return failure(response, 409, new ENSMaturityConflictError().message);
      }
      const entry = {
        ...checked.entry,
        ...(kind === 'assessment' && accredited ? { accredited: accredited.level, accreditedGates: accredited.gates } : {}),
        recordedAt: now.toISOString(),
        recordedBy: username,
      };
      const records = appendMaturityEntry(current.records, controlId, kind, entry);
      const summary = describeMaturityEntry(controlId, kind, entry);
      const saved = await persistMaturityRecords(internal(context), logger, records, username, current.version || 'absent', { controlId, kind, entry, summary });
      logger.info(`ENS maturity of ${controlId} recorded by ${username} (${kind})`);
      if (saved.historyError) logger.error(`ENS maturity of ${controlId} recorded, but its history entry was not written: ${saved.historyError}`);
      return correct(response, {
        record: readControlMaturityRecord(records, controlId),
        version: saved.version || null,
        updatedAt: saved.updatedAt,
        ...(saved.historyError ? { warning: HISTORY_NOT_WRITTEN } : {}),
      });
    } catch (error: any) {
      if (error instanceof ENSMaturityConflictError) {
        logger.warn(`ENS maturity: refused a stale record by ${username} (the document changed while saving)`);
        return failure(response, 409, error.message);
      }
      logger.error(`Could not record the ENS maturity of ${controlId}: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo registrar la madurez; el detalle está en el log del dashboard.');
    }
  };

  // Any user: read as them, so the permissions on `wazuh-ens-snapshots` decide who sees the organisation's series.
  const snapshots = async (context: any, request: any, response: any) => {
    const query = request?.query || {};
    try {
      const list = await maturity.snapshotsBetween(clients(context), query);
      return correct(response, { from: query.from, to: query.to, controlId: query.controlId, snapshots: list });
    } catch (error: any) {
      const status = statusOf(error);
      if (status === 400) return failure(response, 400, error.message);
      if (status === 401 || status === 403) return failure(response, status, 'Sin permiso de lectura de las instantáneas de madurez (índice wazuh-ens-snapshots).');
      logger.error(`Could not read the ENS maturity snapshots: ${error?.message || error}`);
      return failure(response, 500, 'No se pudieron leer las instantáneas de madurez; el detalle está en el log del dashboard.');
    }
  };

  return { save, snapshots };
};
