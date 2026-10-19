import type { Logger } from '../../../../src/core/server';
import {
  ENSConfigurationStoredDocument,
  persistENSConfiguration,
  readActiveENSConfiguration,
  readENSConfigurationHistory,
} from './configuration-storage';
import { resolveCurrentUser } from './current-user';
import {
  checkAgentsConfigurationKeys,
  validateAgentsConfigurationShape,
  validateCommonMatchModesShape,
  validateCustomTemplatesShape,
} from '../../common/agent-configuration';

interface Options {
  logger: Logger;
  securityEnabled: boolean;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const metadata = (doc?: ENSConfigurationStoredDocument) =>
  doc ? { createdAt: doc.createdAt, createdBy: doc.createdBy, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy } : null;

const correct = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const failure = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

const NO_ROLE = 'Hace falta el rol ensfacil_admin o all_access para cambiar la configuración ENS o ver su historial.';

export const createConfigurationHandlers = ({ logger, securityEnabled }: Options) => {
  const internal = (context: any) => context.core.opensearch.client.asInternalUser;
  const actual = (context: any) => context.core.opensearch.client.asCurrentUser;

  // Who the user is and whether they can administer; null and the error response otherwise. Each rejected attempt (403) is logged with the user and what they wanted to do: never the body or the session.
  const administrator = async (context: any, response: any, actionName: string) => {
    try {
      const userName = await resolveCurrentUser(actual(context), securityEnabled);
      if (!userName.administrator) {
        logger.warn(`ENS config: refused ${actionName} for ${userName.username || 'an unnamed user'} (lacks ensfacil_admin and all_access)`);
        return { error: failure(response, 403, NO_ROLE) };
      }
      if (!userName.username) return { error: failure(response, 401, 'No se pudo identificar al usuario.') };
      return { usuario: userName };
    } catch (error: any) {
      const status = statusOf(error);
      if (status === 403) logger.warn(`ENS config: refused ${actionName}; OpenSearch does not let the user be identified (403)`);
      if (status === 401 || status === 403) return { error: failure(response, status, error?.message || 'No autorizado') };
      logger.error(`Could not check the ENS configuration user: ${error?.message || error}`);
      return { error: failure(response, 500, 'No se pudo comprobar el usuario; el detalle está en el log del dashboard.') };
    }
  };

  const getActive = async (context: any, _request: any, response: any) => {
    try {
      const doc = await readActiveENSConfiguration(internal(context), logger);
      return correct(response, { configuration: doc?.configuration ?? null, metadata: metadata(doc) });
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

    // The per-system layer (1.2.0) is shape-validated before writing: a `null` or an object on an agent would stop the ENS environment from loading. Keys too: a profile must be an agent id (a name would never apply). What this version does not know is accepted and ignored.
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

    const access = await administrator(context, response, 'guardar la configuración');
    if (access.error) return access.error;
    const username = access.usuario!.username;

    try {
      const previous = await readActiveENSConfiguration(internal(context), logger);
      const previous2: any = previous?.configuration || {};
      const trail = Array.isArray(previous2.auditTrail) ? previous2.auditTrail : [];
      const now = new Date().toISOString();
      const initial = !previous;
      const reason =
        text(bodyText.changeReason) ||
        text(bodyText.configuration.changeReason) ||
        (initial ? 'Configuración ENS creada.' : 'Configuración ENS actualizada.');

      // A body WITHOUT the `agents` key does not delete it: the existing one is kept. Only an empty `agents: {}` removes it, so a client that does not know the key cannot lose per-system values.
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

      const configurationValue = {
        ...bodyText.configuration,
        ...keepsAgents,
        ...keptTemplates,
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

      const savedValue = await persistENSConfiguration(internal(context), logger, configurationValue, username, previousOutsideHistory);
      logger.info(`ENS configuration saved by ${username}`);

      return correct(response, { configuration: savedValue.configuration, metadata: metadata(savedValue) });
    } catch (error: any) {
      logger.error(`Could not save the ENS configuration: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo guardar la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  const history = async (context: any, _request: any, response: any) => {
    const access = await administrator(context, response, 'ver el historial');
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
