import type { Logger } from '../../../../src/core/server';
import {
  ENSConfigurationConflictError,
  ENSConfigurationDocumentVersion,
  ENSConfigurationStoredDocument,
  parseConfigurationVersion,
  persistENSConfiguration,
  readActiveENSConfigurationWithVersion,
  readENSConfigurationHistory,
} from './configuration-storage';
import { resolveCurrentUser } from './current-user';
import {
  checkAgentsConfigurationKeys,
  validateAgentsConfigurationShape,
  validateCommonMatchModesShape,
  validateCustomTemplatesShape,
} from '../../common/agent-configuration';
import { validateOrganizationDataShape } from '../../common/ens/configuration/organization/organization-data-shape';
import { describeOrganizationFills, normalizeOrganizationData } from '../../common/ens/configuration/organization/organization-data-migration';
import { validateMaturityTargetsShape } from '../../common/ens/maturity/maturity-records';

interface Options {
  logger: Logger;
  securityEnabled: boolean;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

// `seqNo` and `primaryTerm` travel back with the next save, which is refused if the document changed meanwhile.
const metadata = (doc?: ENSConfigurationStoredDocument, version?: ENSConfigurationDocumentVersion) =>
  doc
    ? { createdAt: doc.createdAt, createdBy: doc.createdBy, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy, ...(version || {}) }
    : null;

const correct = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const failure = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

const HISTORY_NOT_WRITTEN = 'Guardado; no se pudo registrar el historial';

const NO_ROLE = 'Hace falta el rol ensfacil_admin o all_access para cambiar la configuración ENS o ver su historial.';

export const createConfigurationHandlers = ({ logger, securityEnabled }: Options) => {
  const internal = (context: any) => context.core.opensearch.client.asInternalUser;
  const actual = (context: any) => context.core.opensearch.client.asCurrentUser;

  // Who the user is and whether they can administer; null and the error response otherwise. Each rejected
  // attempt (403) is logged with the user and what they wanted to do: never the body or the session.
  const administrator = async (context: any, response: any, logLabel: string) => {
    try {
      const user = await resolveCurrentUser(actual(context), securityEnabled);
      if (!user.administrator) {
        logger.warn(`ENS config: refused ${logLabel} for ${user.username || 'an unnamed user'} (lacks ensfacil_admin and all_access)`);
        return { error: failure(response, 403, NO_ROLE) };
      }
      if (!user.username) return { error: failure(response, 401, 'No se pudo identificar al usuario.') };
      return { usuario: user };
    } catch (error: any) {
      const status = statusOf(error);
      if (status === 403) logger.warn(`ENS config: refused ${logLabel}; OpenSearch does not let the user be identified (403)`);
      if (status === 401 || status === 403) return { error: failure(response, status, error?.message || 'No autorizado') };
      logger.error(`Could not check the ENS configuration user: ${error?.message || error}`);
      return { error: failure(response, 500, 'No se pudo comprobar el usuario; el detalle está en el log del dashboard.') };
    }
  };

  const getActive = async (context: any, _request: any, response: any) => {
    try {
      const { document: doc, version } = await readActiveENSConfigurationWithVersion(internal(context), logger);
      return correct(response, { configuration: doc?.configuration ?? null, metadata: metadata(doc, version) });
    } catch (error: any) {
      logger.error(`Could not read the active ENS configuration: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo leer la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  const save = async (context: any, request: any, response: any) => {
    const bodyText = request?.body;
    if (!bodyText || !bodyText.configuration || typeof bodyText.configuration !== 'object' || Array.isArray(bodyText.configuration)) {
      return failure(response, 400, 'Hace falta una configuración ENS válida.');
    }

    // The per-system layer (1.2.0) is shape-validated before writing: a `null` or an object on an agent would
    // stop the ENS environment from loading. Keys too: a profile must be an agent id (a name would never apply).
    // What this version does not know is accepted and ignored.
    const agentErrors = [
      ...validateAgentsConfigurationShape(bodyText.configuration.agents),
      ...checkAgentsConfigurationKeys(bodyText.configuration.agents).errors,
    ];
    if (agentErrors.length) {
      return failure(response, 400, `configuration.agents no es válida: ${agentErrors.slice(0, 5).join(' ')}`);
    }

    const templateErrors = validateCustomTemplatesShape(bodyText.configuration.templates);
    if (templateErrors.length) {
      return failure(response, 400, `configuration.templates no es válida: ${templateErrors.slice(0, 5).join(' ')}`);
    }

    const modeErrors = validateCommonMatchModesShape(bodyText.configuration.controls);
    if (modeErrors.length) {
      return failure(response, 400, `configuration.controls no es válida: ${modeErrors.slice(0, 5).join(' ')}`);
    }

    const organizationErrors = validateOrganizationDataShape(bodyText.configuration.organizationData);
    if (organizationErrors.length) {
      return failure(response, 400, `configuration.organizationData no es válida: ${organizationErrors.slice(0, 5).join(' ')}`);
    }

    const targetErrors = validateMaturityTargetsShape(bodyText.configuration.global?.maturityTargets);
    if (targetErrors.length) {
      return failure(response, 400, `configuration.global no es válida: ${targetErrors.slice(0, 5).join(' ')}`);
    }

    const access = await administrator(context, response, 'save the configuration');
    if (access.error) return access.error;
    const username = access.usuario!.username;

    try {
      const { document: previous, version } = await readActiveENSConfigurationWithVersion(internal(context), logger);
      // null: the browser loaded when there was no configuration, so one created since then is newer.
      const expectsNone = bodyText.expectedVersion === null;
      const expected = parseConfigurationVersion(bodyText.expectedVersion);
      if (
        (expectsNone && previous) ||
        (expected && (!previous || (version && (expected.seqNo !== version.seqNo || expected.primaryTerm !== version.primaryTerm))))
      ) {
        logger.warn(`ENS config: refused a stale save by ${username}`);
        return failure(response, 409, new ENSConfigurationConflictError().message);
      }
      const previous2: any = previous?.configuration || {};
      const trail = Array.isArray(previous2.auditTrail) ? previous2.auditTrail : [];
      const now = new Date().toISOString();
      const initial = !previous;
      const requestedReason =
        text(bodyText.changeReason) ||
        text(bodyText.configuration.changeReason) ||
        (initial ? 'Configuración ENS creada.' : 'Configuración ENS actualizada.');

      // A body WITHOUT the `agents` key does not delete it: the existing one is kept. Only an empty `agents: {}`
      // removes it, so a client that does not know the key cannot lose per-system values.
      const keepsAgents =
        !Object.prototype.hasOwnProperty.call(bodyText.configuration, 'agents') &&
        previous2.agents && typeof previous2.agents === 'object'
          ? { agents: previous2.agents }
          : {};

      // Same rule for the custom templates: a client that does not know the key cannot drop them.
      const keptTemplates =
        !Object.prototype.hasOwnProperty.call(bodyText.configuration, 'templates') && Array.isArray(previous2.templates)
          ? { templates: previous2.templates }
          : {};

      // And for the organisation data.
      const keptOrganizationData =
        !Object.prototype.hasOwnProperty.call(bodyText.configuration, 'organizationData') &&
        previous2.organizationData && typeof previous2.organizationData === 'object'
          ? { organizationData: previous2.organizationData }
          : {};

      // Every save writes each organisation item into its parameters, whoever sends it, and the reason says what it filled.
      const organization = normalizeOrganizationData({ ...bodyText.configuration, ...keepsAgents, ...keptTemplates, ...keptOrganizationData });
      const fills = describeOrganizationFills(organization.filled).filter(line => !requestedReason.includes(line));
      const reason = fills.length ? `${requestedReason} ${fills.join(' ')}` : requestedReason;
      const configurationValue = {
        ...organization.configuration,
        createdAt: initial ? now : text(previous2.createdAt) || now,
        createdBy: initial ? username : text(previous2.createdBy) || username,
        updatedAt: now,
        updatedBy: username,
        changeReason: reason,
        auditTrail: [
          ...trail,
          { action: initial ? 'CREATED' : 'UPDATED', user: username, date: now, summary: reason },
        ],
      };

      // The previous version goes to the history unless it is already its last entry.
      const last = previous ? (await readENSConfigurationHistory(internal(context), logger, 1))[0] : undefined;
      const previousOutsideHistory =
        previous && JSON.stringify(last?.configuration ?? null) !== JSON.stringify(previous.configuration)
          ? { configuration: previous.configuration, author: text(previous2.updatedBy) || previous.updatedBy }
          : undefined;

      const savedValue = await persistENSConfiguration(
        internal(context),
        logger,
        configurationValue,
        username,
        previousOutsideHistory,
        previous ? version : 'absent'
      );
      logger.info(`ENS configuration saved by ${username}`);
      if (savedValue.historyError) {
        logger.error(`ENS configuration saved by ${username}, but its history entry was not written: ${savedValue.historyError}`);
      }

      return correct(response, {
        configuration: savedValue.configuration,
        metadata: metadata(savedValue, savedValue.version),
        ...(savedValue.historyError ? { warning: HISTORY_NOT_WRITTEN } : {}),
      });
    } catch (error: any) {
      if (error instanceof ENSConfigurationConflictError) {
        logger.warn(`ENS config: refused a stale save by ${username} (the document changed while saving)`);
        return failure(response, 409, error.message);
      }
      logger.error(`Could not save the ENS configuration: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo guardar la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  const history = async (context: any, _request: any, response: any) => {
    const access = await administrator(context, response, 'read the history');
    if (access.error) return access.error;

    try {
      const docs = await readENSConfigurationHistory(internal(context), logger, 100);
      return correct(response, docs.map(doc => ({ configuration: doc.configuration, metadata: metadata(doc) })));
    } catch (error: any) {
      logger.error(`Could not read the ENS configuration history: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo leer el historial de la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  return { getActive, save, history };
};
