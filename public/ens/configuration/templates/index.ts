import type { ENSSystemType } from '../../../../common/agent-configuration';
import type { ENSConfigurationTemplate } from './types';
import { linuxUbuntuTemplate } from './linux-ubuntu';
import { zimbraLdapTemplate } from './zimbra-ldap';
import { windowsServerTemplate } from './windows-server';
import { managerWazuhTemplate } from './manager';
import { pbsBackupTemplate } from './pbs-backup';
import { zimbraNeBackupTemplate } from './zimbra-ne-backup';

export type { ENSConfigurationTemplate } from './types';

// En el orden en que se ofrecen: las cuatro plataformas y los dos añadidos.
export const ENS_CONFIGURATION_TEMPLATES: ENSConfigurationTemplate[] = [
  linuxUbuntuTemplate,
  zimbraLdapTemplate,
  windowsServerTemplate,
  managerWazuhTemplate,
  pbsBackupTemplate,
  zimbraNeBackupTemplate,
];

export const getConfigurationTemplate = (id: string): ENSConfigurationTemplate | undefined =>
  ENS_CONFIGURATION_TEMPLATES.find(template => template.id === id);

// La plantilla base que se propone para un tipo de sistema.
export const getBaseTemplateForSystemType = (
  systemType: ENSSystemType | undefined
): ENSConfigurationTemplate | undefined =>
  systemType
    ? ENS_CONFIGURATION_TEMPLATES.find(
        template => template.kind === 'base' && template.systemTypes.includes(systemType)
      )
    : undefined;

// ¿Se puede añadir `templateId` a una máquina que ya tiene `applied`? Devuelve
// el motivo si no.
export const templateConflict = (
  templateId: string,
  applied: string[]
): string | undefined => {
  const template = getConfigurationTemplate(templateId);

  if (!template) {
    return `la plantilla ${templateId} no existe en esta versión del plugin`;
  }

  const clash = applied.find(
    other =>
      other !== templateId &&
      (template.incompatibleWith?.includes(other) ||
        getConfigurationTemplate(other)?.incompatibleWith?.includes(templateId))
  );

  if (clash) {
    return `${template.label} no se combina con ${getConfigurationTemplate(clash)?.label || clash}`;
  }

  const otherBase =
    template.kind === 'base'
      ? applied.find(other => other !== templateId && getConfigurationTemplate(other)?.kind === 'base')
      : undefined;

  if (otherBase) {
    return `la máquina ya tiene la plantilla de plataforma ${getConfigurationTemplate(otherBase)?.label || otherBase}; se quita antes de aplicar otra`;
  }

  return undefined;
};
