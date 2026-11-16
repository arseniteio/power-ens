import type { Logger } from '../../../../src/core/server';
import { listProfiles } from '../../common/ens/profiles/builtin';
import { toProfileShape } from '../../common/ens/profiles/diff';
import { planProfileImport } from '../../common/ens/profiles/import-plan';
import type { ENSProfileVersion } from '../../common/ens/profiles/types';
import { validateProfile } from '../../common/ens/profiles/validate';
import { resolveCurrentUser } from './current-user';
import { ENSProfileFileError, parseProfileFile, profilesToYaml } from './profiles/profile-files';
import {
  ENSExpectedProfileVersion,
  ENSProfileDeletion,
  ENSProfileUpsert,
  MAX_STORED_PROFILES,
  readStoredProfiles,
  writeProfiles,
} from './profiles/profile-storage';

interface Options {
  logger: Logger;
  securityEnabled: boolean;
}

const NO_ROLE = 'Hace falta el rol power_ens_admin o all_access para cambiar los perfiles.';
const CONFLICT = 'Otra persona ha cambiado estos perfiles desde que los abriste. Recarga la página para ver los cambios';

// The import screen reads the whole file in the browser; this keeps a mistaken upload from filling the dashboard's memory.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const correct = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const failure = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

const expectedOf = (value: any): ENSExpectedProfileVersion => {
  if (value === null) return null;
  if (value && Number.isInteger(value.seqNo) && Number.isInteger(value.primaryTerm)) {
    return { seqNo: value.seqNo, primaryTerm: value.primaryTerm } as ENSProfileVersion;
  }
  return undefined;
};

export const createProfileHandlers = ({ logger, securityEnabled }: Options) => {
  const internal = (context: any) => context.core.opensearch.client.asInternalUser;
  const actual = (context: any) => context.core.opensearch.client.asCurrentUser;

  const userOf = async (context: any): Promise<{ username?: string; canChange: boolean; error?: { status: number; message: string } }> => {
    try {
      const user = await resolveCurrentUser(actual(context), securityEnabled);
      return { username: user.username, canChange: user.administrator && Boolean(user.username) };
    } catch (error: any) {
      const status = statusOf(error);
      return { canChange: false, error: { status: status === 401 || status === 403 ? status : 500, message: error?.message || 'No se pudo comprobar el usuario.' } };
    }
  };

  const listed = async (context: any) => listProfiles(await readStoredProfiles(internal(context), logger));

  const list = async (context: any, _request: any, response: any) => {
    try {
      const [profiles, user] = await Promise.all([listed(context), userOf(context)]);
      return correct(response, { profiles, canChange: user.canChange });
    } catch (error: any) {
      logger.error(`Could not read the ENS profiles: ${error?.message || error}`);
      return failure(response, 500, 'No se pudieron leer los perfiles; el detalle está en el log del dashboard.');
    }
  };

  const parseUpsert = (entry: any): { upsert?: ENSProfileUpsert; error?: string } => {
    const { profile, errors: shapeErrors } = toProfileShape(entry?.profile);
    const problems = [...shapeErrors, ...validateProfile(profile)];
    return problems.length
      ? { error: `${profile.id || 'perfil sin identificador'}: ${problems.join('; ')}` }
      : { upsert: { profile, expectedVersion: expectedOf(entry.expectedVersion) } };
  };

  const save = async (context: any, response: any, upserts: ENSProfileUpsert[], deletions: ENSProfileDeletion[]) => {
    if (!upserts.length && !deletions.length) return failure(response, 400, 'No hay cambios que guardar.');
    const ids = [...upserts.map(u => u.profile.id), ...deletions.map(d => d.id)];
    if (new Set(ids).size !== ids.length) return failure(response, 400, 'Un mismo perfil aparece dos veces en el cambio.');

    const user = await userOf(context);
    if (user.error) return failure(response, user.error.status, user.error.message);
    if (!user.canChange) {
      logger.warn(`ENS profiles: refused a save for ${user.username || 'an unnamed user'} (lacks power_ens_admin and all_access)`);
      return failure(response, 403, NO_ROLE);
    }

    try {
      const current = await readStoredProfiles(internal(context), logger);
      const creates = upserts.filter(u => !current.some(s => s.profile.id === u.profile.id)).length;
      if (current.length + creates - deletions.length > MAX_STORED_PROFILES) {
        return failure(response, 400, `No se guarda: el motor lee como mucho ${MAX_STORED_PROFILES} perfiles guardados.`);
      }
      const result = await writeProfiles(internal(context), logger, upserts, deletions, user.username!);
      logger.info(
        `ENS profiles saved by ${user.username}: ${result.written.length} written, ${result.deleted.length} deleted, ${result.conflicts.length} conflicts, ${result.failures.length} failures`
      );
      if (result.conflicts.length) {
        return failure(response, 409, `${CONFLICT}. Sin guardar: ${result.conflicts.join(', ')}.`);
      }
      if (result.failures.length) {
        logger.error(`ENS profiles not written: ${JSON.stringify(result.failures)}`);
        return failure(response, 500, `No se guardaron ${result.failures.map(f => f.id).join(', ')}; el detalle está en el log del dashboard.`);
      }
      return correct(response, { written: result.written, deleted: result.deleted, profiles: await listed(context) });
    } catch (error: any) {
      logger.error(`Could not save the ENS profiles: ${error?.message || error}`);
      return failure(response, 500, 'No se pudieron guardar los perfiles; el detalle está en el log del dashboard.');
    }
  };

  const apply = async (context: any, request: any, response: any) => {
    const body = request?.body || {};
    const parsed = (Array.isArray(body.upserts) ? body.upserts : []).map(parseUpsert);
    const errors = parsed.filter((p: any) => p.error).map((p: any) => p.error);
    if (errors.length) return failure(response, 400, `No se guarda nada: ${errors.slice(0, 5).join(' · ')}`);
    const deletions: ENSProfileDeletion[] = (Array.isArray(body.deletions) ? body.deletions : [])
      .filter((entry: any) => typeof entry?.id === 'string' && entry.id)
      .map((entry: any) => ({ id: entry.id, expectedVersion: expectedOf(entry.expectedVersion) }));
    return save(context, response, parsed.map((p: any) => p.upsert), deletions);
  };

  const get = async (context: any, request: any, response: any) => {
    try {
      const entry = (await listed(context)).find(e => e.profile.id === request.params.id);
      return entry ? correct(response, entry) : failure(response, 404, `No hay ningún perfil ${request.params.id}.`);
    } catch (error: any) {
      logger.error(`Could not read the ENS profile ${request.params.id}: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo leer el perfil; el detalle está en el log del dashboard.');
    }
  };

  const put = async (context: any, request: any, response: any) => {
    const { upsert, error } = parseUpsert(request?.body);
    if (error) return failure(response, 400, `No se guarda: ${error}`);
    if (upsert!.profile.id !== request.params.id) return failure(response, 400, 'El identificador del perfil no coincide con el de la ruta.');
    return save(context, response, [upsert!], []);
  };

  const remove = async (context: any, request: any, response: any) => {
    const seqNo = Number(request?.query?.seqNo);
    const primaryTerm = Number(request?.query?.primaryTerm);
    const expectedVersion = Number.isInteger(seqNo) && Number.isInteger(primaryTerm) ? { seqNo, primaryTerm } : undefined;
    return save(context, response, [], [{ id: request.params.id, expectedVersion }]);
  };

  const importPlan = async (context: any, request: any, response: any) => {
    const text = request?.body?.text;
    if (typeof text !== 'string' || !text.trim()) return failure(response, 400, 'El fichero está vacío.');
    if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) return failure(response, 400, 'El fichero ocupa más de 5 MB.');

    let raw: unknown[];
    try {
      raw = parseProfileFile(text);
    } catch (error: any) {
      if (error instanceof ENSProfileFileError) return failure(response, 400, `No se puede leer el fichero: ${error.message}.`);
      return failure(response, 400, `No se puede leer el fichero como YAML ni como JSON: ${String(error?.message || error).split('\n')[0]}`);
    }

    try {
      return correct(response, { items: planProfileImport(raw, await listed(context)) });
    } catch (error: any) {
      logger.error(`Could not plan the ENS profile import: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo comparar el fichero con los perfiles guardados; el detalle está en el log del dashboard.');
    }
  };

  const exportYaml = async (context: any, request: any, response: any) => {
    const ids = String(request?.query?.ids || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    try {
      const all = (await listed(context)).filter(entry => entry.errors.length === 0);
      const chosen = ids.length ? all.filter(entry => ids.includes(entry.profile.id)) : all;
      const missing = ids.filter(id => !all.some(entry => entry.profile.id === id));
      if (missing.length) return failure(response, 404, `No hay ningún perfil ${missing.join(', ')}.`);
      const profiles = chosen.map(entry => entry.profile).sort((a, b) => a.id.localeCompare(b.id));
      return response.ok({
        body: profilesToYaml(profiles),
        headers: {
          'content-type': 'application/yaml; charset=utf-8',
          'content-disposition': `attachment; filename="${ids.length === 1 ? ids[0] : 'perfiles-ens'}.yaml"`,
        },
      });
    } catch (error: any) {
      logger.error(`Could not export the ENS profiles: ${error?.message || error}`);
      return failure(response, 500, 'No se pudieron exportar los perfiles; el detalle está en el log del dashboard.');
    }
  };

  return { list, get, put, remove, apply, importPlan, exportYaml };
};

