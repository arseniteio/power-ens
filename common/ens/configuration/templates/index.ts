import type {
  ENSAgentParameterValue,
  ENSCustomTemplate,
  ENSSystemType,
} from '../../../agent-configuration';
import { ENS_NO_TEMPLATE } from '../../../agent-configuration';
import { getENSCatalogControl } from '../../catalog';
import { getControlMeasurementPlanes } from '../../core/scope/measurement-planes';
import { ENS_PARAMETER_CLASSES, isAgentLevelParameter } from '../agents/parameter-classes';
import type { ENSPlatformSource } from './types';
import { linuxUbuntuTemplate } from './linux-ubuntu';
import { zimbraLdapTemplate } from './zimbra-ldap';
import { windowsServerTemplate } from './windows-server';
import { managerWazuhTemplate } from './manager';
import { pbsBackupTemplate } from './pbs-backup';
import { zimbraNeBackupTemplate } from './zimbra-ne-backup';

export type { ENSPlatformSource } from './types';

export const ENS_PLATFORM_SOURCES: ENSPlatformSource[] = [
  linuxUbuntuTemplate,
  zimbraLdapTemplate,
  windowsServerTemplate,
  managerWazuhTemplate,
  pbsBackupTemplate,
  zimbraNeBackupTemplate,
];

export interface ENSControlTemplate {
  id: string;
  controlId: string;
  name: string;
  description?: string;
  systemType?: ENSSystemType;
  values: Record<string, ENSAgentParameterValue>;
  builtin: boolean;
  // Built-in applied to agents of `systemType` that have no template assigned in the control.
  typeDefault: boolean;
  sources?: string[];
}

export const getPlatformSource = (id: string): ENSPlatformSource | undefined =>
  ENS_PLATFORM_SOURCES.find(source => source.id === id);

// Controls with per-system or per-platform parameters: the only ones with templates and assignment.
export const hasTemplateParameters = (controlId: string): boolean =>
  Object.keys(ENS_PARAMETER_CLASSES[controlId] || {}).some(parameterId => isAgentLevelParameter(controlId, parameterId));

const appliesToControl = (source: ENSPlatformSource, controlId: string): boolean => {
  if (source.values[controlId]) {
    return true;
  }
  if (source.kind === 'addon' || (source.onlyControls && !source.onlyControls.includes(controlId))) {
    return false;
  }
  const plane = source.systemTypes.includes('manager') ? 'manager' : 'agent';
  return getControlMeasurementPlanes(getENSCatalogControl(controlId) || {}).includes(plane);
};

const builtinsByControl = new Map<string, ENSControlTemplate[]>();

export const getBuiltinTemplates = (controlId: string): ENSControlTemplate[] => {
  if (!builtinsByControl.has(controlId)) {
    builtinsByControl.set(
      controlId,
      hasTemplateParameters(controlId)
        ? ENS_PLATFORM_SOURCES.filter(source => appliesToControl(source, controlId)).map(source => {
            const values = { ...(source.values[controlId] || {}) };
            return {
              id: source.id,
              controlId,
              name: source.label,
              description: source.description,
              systemType: source.systemTypes.length === 1 ? source.systemTypes[0] : undefined,
              values,
              builtin: true,
              typeDefault: source.kind === 'base',
              sources: source.sources,
            };
          })
        : []
    );
  }
  return builtinsByControl.get(controlId)!;
};

// What the screen says of a template; an empty built-in says why it changes nothing.
export const describeTemplate = (template: ENSControlTemplate): string =>
  template.builtin && !Object.keys(template.values).length
    ? `${template.description || ''} Sin valores de serie en este control: se aplican los ajustes comunes.`.trim()
    : template.description || '';

export const getBuiltinTemplate = (controlId: string, templateId: string): ENSControlTemplate | undefined =>
  getBuiltinTemplates(controlId).find(template => template.id === templateId);

export const getTypeDefaultTemplate = (
  controlId: string,
  type: ENSSystemType | undefined
): ENSControlTemplate | undefined =>
  type ? getBuiltinTemplates(controlId).find(template => template.typeDefault && template.systemType === type) : undefined;

const toControlTemplate = (template: ENSCustomTemplate): ENSControlTemplate => ({
  id: template.id,
  controlId: template.controlId,
  name: template.name,
  ...(template.description ? { description: template.description } : {}),
  ...(template.systemType ? { systemType: template.systemType } : {}),
  values: template.values || {},
  builtin: false,
  typeDefault: false,
});

export const getCustomTemplates = (
  configuration: { templates?: ENSCustomTemplate[] },
  controlId?: string
): ENSControlTemplate[] =>
  (Array.isArray(configuration.templates) ? configuration.templates : [])
    .filter(template => !controlId || template.controlId === controlId)
    .map(toControlTemplate);

export const getControlTemplates = (
  configuration: { templates?: ENSCustomTemplate[] },
  controlId: string
): ENSControlTemplate[] => [...getBuiltinTemplates(controlId), ...getCustomTemplates(configuration, controlId)];

export const findControlTemplate = (
  configuration: { templates?: ENSCustomTemplate[] },
  controlId: string,
  templateId: string | undefined
): ENSControlTemplate | undefined =>
  templateId ? getControlTemplates(configuration, controlId).find(template => template.id === templateId) : undefined;

// Ids a custom template cannot take: every built-in id and the explicit «no template».
export const isReservedTemplateId = (id: string): boolean =>
  id === ENS_NO_TEMPLATE || ENS_PLATFORM_SOURCES.some(source => source.id === id);

// Controls with a collector for this system type; undefined means all.
export const getCollectedControls = (type: ENSSystemType | undefined): string[] | undefined =>
  type ? ENS_PLATFORM_SOURCES.find(source => source.kind === 'base' && source.systemTypes.includes(type))?.onlyControls : undefined;
