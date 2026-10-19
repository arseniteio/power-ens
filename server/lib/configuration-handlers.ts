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
  validateCustomTemplatesShape,
} from '../../common/agent-configuration';

interface Opciones {
  logger: Logger;
  securityEnabled: boolean;
}

const texto = (valor: unknown): string | undefined =>
  typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;

const metadatos = (doc?: ENSConfigurationStoredDocument) =>
  doc ? { createdAt: doc.createdAt, createdBy: doc.createdBy, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy } : null;

const correcto = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const fallo = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const estadoDe = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

const SIN_ROL = 'Hace falta el rol ensfacil_admin o all_access para cambiar la configuración ENS o ver su historial.';

export const createConfigurationHandlers = ({ logger, securityEnabled }: Opciones) => {
  const interno = (context: any) => context.core.opensearch.client.asInternalUser;
  const actual = (context: any) => context.core.opensearch.client.asCurrentUser;

  // Quién es y si puede administrar; null y la respuesta de error si no. Cada
  // intento rechazado (403) queda en el log con el usuario y lo que quería
  // hacer: solo eso, nunca el cuerpo ni la sesión.
  const administrador = async (context: any, response: any, accion: string) => {
    try {
      const usuario = await resolveCurrentUser(actual(context), securityEnabled);
      if (!usuario.administrator) {
        logger.warn(`Configuración ENS: rechazado ${accion} a ${usuario.username || 'un usuario sin nombre'} (no tiene ensfacil_admin ni all_access)`);
        return { error: fallo(response, 403, SIN_ROL) };
      }
      if (!usuario.username) return { error: fallo(response, 401, 'No se pudo identificar al usuario.') };
      return { usuario };
    } catch (error: any) {
      const estado = estadoDe(error);
      if (estado === 403) logger.warn(`Configuración ENS: rechazado ${accion}; OpenSearch no deja identificar al usuario (403)`);
      if (estado === 401 || estado === 403) return { error: fallo(response, estado, error?.message || 'No autorizado') };
      logger.error(`No se pudo comprobar el usuario de la configuración ENS: ${error?.message || error}`);
      return { error: fallo(response, 500, 'No se pudo comprobar el usuario; el detalle está en el log del dashboard.') };
    }
  };

  const getActive = async (context: any, _request: any, response: any) => {
    try {
      const doc = await readActiveENSConfiguration(interno(context), logger);
      return correcto(response, { configuration: doc?.configuration ?? null, metadata: metadatos(doc) });
    } catch (error: any) {
      logger.error(`No se pudo leer la configuración ENS activa: ${error?.message || error}`);
      return fallo(response, 500, 'No se pudo leer la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  const save = async (context: any, request: any, response: any) => {
    const cuerpo = request?.body;
    if (!cuerpo || !cuerpo.configuration || typeof cuerpo.configuration !== 'object' || Array.isArray(cuerpo.configuration)) {
      return fallo(response, 400, 'Hace falta una configuración ENS válida.');
    }

    // La capa por sistema (1.2.0) se valida por su forma antes de escribir: un
    // valor `null` o un objeto en un agente impediría cargar el entorno ENS.
    // Y por sus claves: un perfil tiene que ser de un id de agente (un nombre no
    // se aplicaría nunca). Lo que esta versión no conoce se acepta y se ignora.
    const erroresAgentes = [
      ...validateAgentsConfigurationShape(cuerpo.configuration.agents),
      ...checkAgentsConfigurationKeys(cuerpo.configuration.agents).errors,
    ];
    if (erroresAgentes.length) {
      return fallo(response, 400, `configuration.agents no es válida: ${erroresAgentes.slice(0, 5).join(' ')}`);
    }

    const templateErrors = validateCustomTemplatesShape(cuerpo.configuration.templates);
    if (templateErrors.length) {
      return fallo(response, 400, `configuration.templates no es válida: ${templateErrors.slice(0, 5).join(' ')}`);
    }

    const acceso = await administrador(context, response, 'guardar la configuración');
    if (acceso.error) return acceso.error;
    const username = acceso.usuario!.username;

    try {
      const anterior = await readActiveENSConfiguration(interno(context), logger);
      const previa: any = anterior?.configuration || {};
      const rastro = Array.isArray(previa.auditTrail) ? previa.auditTrail : [];
      const ahora = new Date().toISOString();
      const inicial = !anterior;
      const motivo =
        texto(cuerpo.changeReason) ||
        texto(cuerpo.configuration.changeReason) ||
        (inicial ? 'Configuración ENS creada.' : 'Configuración ENS actualizada.');

      // Un cuerpo SIN la clave `agents` no la borra: se conserva la que hubiera.
      // Solo la quita quien la manda vacía (`agents: {}`). Así ningún cliente
      // que no la conozca puede perder los valores por sistema al guardar.
      const conservaAgentes =
        !Object.prototype.hasOwnProperty.call(cuerpo.configuration, 'agents') &&
        previa.agents && typeof previa.agents === 'object'
          ? { agents: previa.agents }
          : {};

      // Same rule for the custom templates: a client that does not know the key cannot drop them.
      const keptTemplates =
        !Object.prototype.hasOwnProperty.call(cuerpo.configuration, 'templates') && Array.isArray(previa.templates)
          ? { templates: previa.templates }
          : {};

      const configuracion = {
        ...cuerpo.configuration,
        ...conservaAgentes,
        ...keptTemplates,
        createdAt: inicial ? ahora : texto(previa.createdAt) || ahora,
        createdBy: inicial ? username : texto(previa.createdBy) || username,
        updatedAt: ahora,
        updatedBy: username,
        changeReason: motivo,
        auditTrail: [
          ...rastro,
          { action: inicial ? 'CREATED' : 'UPDATED', user: username, date: ahora, summary: motivo },
        ],
      };

      // La versión anterior, al historial si no es ya su última entrada.
      const ultima = anterior ? (await readENSConfigurationHistory(interno(context), logger, 1))[0] : undefined;
      const anteriorFueraDelHistorial =
        anterior && JSON.stringify(ultima?.configuration ?? null) !== JSON.stringify(anterior.configuration)
          ? { configuration: anterior.configuration, author: texto(previa.updatedBy) || anterior.updatedBy }
          : undefined;

      const guardado = await persistENSConfiguration(interno(context), logger, configuracion, username, anteriorFueraDelHistorial);
      logger.info(`Configuración ENS guardada por ${username}`);

      return correcto(response, { configuration: guardado.configuration, metadata: metadatos(guardado) });
    } catch (error: any) {
      logger.error(`No se pudo guardar la configuración ENS: ${error?.message || error}`);
      return fallo(response, 500, 'No se pudo guardar la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  const history = async (context: any, _request: any, response: any) => {
    const acceso = await administrador(context, response, 'ver el historial');
    if (acceso.error) return acceso.error;

    try {
      const docs = await readENSConfigurationHistory(interno(context), logger, 100);
      return correcto(response, docs.map(doc => ({ configuration: doc.configuration, metadata: metadatos(doc) })));
    } catch (error: any) {
      logger.error(`No se pudo leer el historial de la configuración ENS: ${error?.message || error}`);
      return fallo(response, 500, 'No se pudo leer el historial de la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  return { getActive, save, history };
};
