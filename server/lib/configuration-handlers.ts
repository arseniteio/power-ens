import type { Logger } from '../../../../src/core/server';
import {
  ENSConfigurationStoredDocument,
  persistENSConfiguration,
  readActiveENSConfiguration,
  readENSConfigurationHistory,
} from './configuration-storage';
import { resolveCurrentUser } from './current-user';

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

  // Quién es y si puede administrar; null y la respuesta de error si no.
  const administrador = async (context: any, response: any) => {
    try {
      const usuario = await resolveCurrentUser(actual(context), securityEnabled);
      if (!usuario.administrator) return { error: fallo(response, 403, SIN_ROL) };
      if (!usuario.username) return { error: fallo(response, 401, 'No se pudo identificar al usuario.') };
      return { usuario };
    } catch (error: any) {
      const estado = estadoDe(error);
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

    const acceso = await administrador(context, response);
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

      const configuracion = {
        ...cuerpo.configuration,
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

      const guardado = await persistENSConfiguration(interno(context), logger, configuracion, username);
      logger.info(`Configuración ENS guardada por ${username}`);

      return correcto(response, { configuration: guardado.configuration, metadata: metadatos(guardado) });
    } catch (error: any) {
      logger.error(`No se pudo guardar la configuración ENS: ${error?.message || error}`);
      return fallo(response, 500, 'No se pudo guardar la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  const history = async (context: any, _request: any, response: any) => {
    const acceso = await administrador(context, response);
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
