// Who makes the request and whether they can administer Power ENS. `authinfo` is always queried first; only if
// OpenSearch has no such endpoint (no security plugin) AND the configuration says there is no security is there
// nobody to restrict. Any other doubt closes access.
import { POWER_ENS_ADMIN_ROLES } from '../../common/constants';

export interface ENSCurrentUser {
  username: string;
  roles: string[];
  administrator: boolean;
}

export class CurrentUserError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 0;

// OpenSearch without the security plugin answers 400/404 "no handler found for uri".
const isNoEndpoint = (error: any): boolean => {
  const status = statusOf(error);
  if (status !== 400 && status !== 404) return false;
  const text = [
    error?.message,
    JSON.stringify(error?.body ?? ''),
    JSON.stringify(error?.meta?.body ?? ''),
  ].join(' ');
  return /no handler found|unknown endpoint|no endpoint/i.test(text);
};

export const resolveCurrentUser = async (client: any, securityEnabled: boolean): Promise<ENSCurrentUser> => {
  let body: any;
  try {
    ({ body } = await client.transport.request({ method: 'GET', path: '/_plugins/_security/authinfo' }));
  } catch (error: any) {
    const status = statusOf(error);
    if (status === 401 || status === 403) throw new CurrentUserError(error?.message || 'No autorizado', status);
    if (isNoEndpoint(error) && !securityEnabled) {
      return { username: 'desconocido', roles: [], administrator: true };
    }
    throw new CurrentUserError(error?.message || String(error), 500);
  }

  const roles: string[] = Array.isArray(body?.roles) ? body.roles.map(String) : [];
  const username = typeof body?.user_name === 'string' ? body.user_name.trim() : '';

  return { username, roles, administrator: roles.some(role => POWER_ENS_ADMIN_ROLES.includes(role)) };
};
