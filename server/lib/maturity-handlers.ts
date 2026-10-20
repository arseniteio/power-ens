// Maturity routes: append one entry to a control's record (attestation, review, assessment, indicators or
// feedback) and read the daily snapshots. Same role check as saving the configuration, same optimistic
// concurrency (409 on a newer document) and the same history: the previous document goes to the history and the
// audit trail gains a line. Nothing already recorded is replaced or removed.
import type { Logger } from '../../../../src/core/server';
import { ENSCatalog } from '../../common/ens/catalog';
import {
  appendMaturityEntry,
  describeMaturityEntry,
  ENS_MATURITY_RECORD_KINDS,
  readControlMaturityRecord,
  validateMaturityEntry,
} from '../../common/ens/maturity/maturity-records';
import type { ENSMaturityLevel, ENSMaturityRecordKind } from '../../common/ens/maturity/types';
import {
  ENSConfigurationConflictError,
  parseConfigurationVersion,
  persistENSConfiguration,
  readActiveENSConfigurationWithVersion,
  readENSConfigurationHistory,
} from './configuration-storage';
import { resolveCurrentUser } from './current-user';
import type { ENSMaturityService } from './maturity/maturity-service';

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

const NO_ROLE = 'Hace falta el rol ensfacil_admin o all_access para registrar o consultar la madurez.';
const NO_CONFIGURATION = 'Todavía no hay configuración ENS guardada: guárdala antes de registrar la madurez.';
const HISTORY_NOT_WRITTEN = 'Guardado; no se pudo registrar el historial';

export const createMaturityHandlers = ({ logger, securityEnabled, maturity, clock = () => new Date() }: Options) => {
  const internal = (context: any) => context.core.opensearch.client.asInternalUser;
  const clients = (context: any) => ({
    asCurrentUser: context.core.opensearch.client.asCurrentUser,
    asInternalUser: context.core.opensearch.client.asInternalUser,
  });

  // The user if they administer ENSFácil; otherwise the error response (each refusal is logged).
  const administrator = async (context: any, response: any, logLabel: string) => {
    try {
      const user = await resolveCurrentUser(context.core.opensearch.client.asCurrentUser, securityEnabled);
      if (!user.administrator) {
        logger.warn(`ENS maturity: refused ${logLabel} for ${user.username || 'an unnamed user'} (lacks ensfacil_admin and all_access)`);
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
    if (!controlId || !ENSCatalog.some(control => control.id === controlId)) {
      return failure(response, 400, `El control «${controlId || ''}» no está en el catálogo de ENSFácil.`);
    }
    if (!ENS_MATURITY_RECORD_KINDS.includes(kind)) {
      return failure(response, 400, `Registro de madurez desconocido: «${String(kind)}».`);
    }
    const now = clock();
    // The format first (the justification rule needs the accredited level, computed below).
    const shape = validateMaturityEntry(kind, body.entry, now, 5);
    if (shape.errors.length) return failure(response, 400, shape.errors.join(' '));

    const access = await administrator(context, response, `record the maturity of ${controlId}`);
    if (access.error) return access.error;
    const username = access.username!;

    let accredited: ENSMaturityLevel | undefined;
    if (kind === 'assessment') {
      try {
        accredited = await maturity.accreditedFor(clients(context), controlId);
      } catch (error: any) {
        logger.warn(`ENS maturity: the accredited level of ${controlId} could not be computed: ${error?.message || error}`);
      }
    }
    const checked = validateMaturityEntry(kind, body.entry, now, accredited);
    if (checked.errors.length || !checked.entry) return failure(response, 400, checked.errors.join(' '));

    try {
      const { document: previous, version } = await readActiveENSConfigurationWithVersion(internal(context), logger);
      if (!previous?.configuration) return failure(response, 409, NO_CONFIGURATION);
      const expected = parseConfigurationVersion(body.expectedVersion);
      if (
        body.expectedVersion === null ||
        (expected && version && (expected.seqNo !== version.seqNo || expected.primaryTerm !== version.primaryTerm))
      ) {
        logger.warn(`ENS maturity: refused a stale record by ${username}`);
        return failure(response, 409, new ENSConfigurationConflictError().message);
      }

      const stamp = new Date(now).toISOString();
      const entry = {
        ...checked.entry,
        ...(kind === 'assessment' && accredited !== undefined ? { accredited } : {}),
        recordedAt: stamp,
        recordedBy: username,
      };
      const reason = describeMaturityEntry(controlId, kind, entry);
      const stored: any = previous.configuration;
      const trail = Array.isArray(stored.auditTrail) ? stored.auditTrail : [];
      const configurationValue = {
        ...appendMaturityEntry(stored, controlId, kind, entry),
        updatedAt: stamp,
        updatedBy: username,
        changeReason: reason,
        auditTrail: [...trail, { action: 'UPDATED', user: username, date: stamp, summary: reason }],
      };

      // The previous version goes to the history unless it is already its last entry.
      const last = (await readENSConfigurationHistory(internal(context), logger, 1))[0];
      const previousOutsideHistory =
        JSON.stringify(last?.configuration ?? null) !== JSON.stringify(previous.configuration)
          ? { configuration: previous.configuration, author: text(stored.updatedBy) || previous.updatedBy }
          : undefined;

      const saved = await persistENSConfiguration(internal(context), logger, configurationValue, username, previousOutsideHistory, version);
      logger.info(`ENS maturity of ${controlId} recorded by ${username} (${kind})`);
      if (saved.historyError) logger.error(`ENS maturity of ${controlId} recorded, but its history entry was not written: ${saved.historyError}`);

      return correct(response, {
        configuration: saved.configuration,
        metadata: { updatedAt: saved.updatedAt, updatedBy: saved.updatedBy, ...(saved.version || {}) },
        record: readControlMaturityRecord(saved.configuration as any, controlId),
        ...(saved.historyError ? { warning: HISTORY_NOT_WRITTEN } : {}),
      });
    } catch (error: any) {
      if (error instanceof ENSConfigurationConflictError) {
        logger.warn(`ENS maturity: refused a stale record by ${username} (the document changed while saving)`);
        return failure(response, 409, error.message);
      }
      logger.error(`Could not record the ENS maturity of ${controlId}: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo registrar la madurez; el detalle está en el log del dashboard.');
    }
  };

  const snapshots = async (context: any, request: any, response: any) => {
    const access = await administrator(context, response, 'read the maturity snapshots');
    if (access.error) return access.error;
    const query = request?.query || {};
    try {
      const list = await maturity.snapshotsBetween(clients(context), query);
      return correct(response, { from: query.from, to: query.to, controlId: query.controlId, snapshots: list });
    } catch (error: any) {
      const status = statusOf(error);
      if (status === 400) return failure(response, 400, error.message);
      logger.error(`Could not read the ENS maturity snapshots: ${error?.message || error}`);
      return failure(response, 500, 'No se pudieron leer las instantáneas de madurez; el detalle está en el log del dashboard.');
    }
  };

  return { save, snapshots };
};
