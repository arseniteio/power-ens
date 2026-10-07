// Quién hace la petición y si puede administrar ENSFácil. Con el plugin de
// seguridad, `authinfo` como el propio usuario; sin él, nadie se identifica y
// no hay a quién restringir (un dashboard sin usuarios).
import { ENSFACIL_ADMIN_ROLES } from '../../common/constants';

export interface ENSCurrentUser {
  username: string;
  roles: string[];
  administrator: boolean;
}

export const resolveCurrentUser = async (client: any, securityEnabled: boolean): Promise<ENSCurrentUser> => {
  if (!securityEnabled) {
    return { username: 'desconocido', roles: [], administrator: true };
  }

  const { body } = await client.transport.request({ method: 'GET', path: '/_plugins/_security/authinfo' });
  const roles: string[] = Array.isArray(body?.roles) ? body.roles.map(String) : [];
  const username = typeof body?.user_name === 'string' ? body.user_name.trim() : '';

  return { username, roles, administrator: roles.some(rol => ENSFACIL_ADMIN_ROLES.includes(rol)) };
};
