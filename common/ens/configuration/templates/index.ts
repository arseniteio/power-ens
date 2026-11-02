import type {
  ENSAgentParameterValue,
  ENSCustomTemplate,
  ENSMatchMode,
  ENSSystemType,
} from '../../../agent-configuration';
import { ENS_NO_TEMPLATE } from '../../../agent-configuration';
import { ENS_PARAMETER_CLASSES, isAgentLevelParameter } from '../agents/parameter-classes';
import type { ENSPlatformSource } from './types';
import linuxUbuntu from '../../catalog/templates/linux-ubuntu.json';
import managerWazuh from '../../catalog/templates/manager-wazuh.json';
import windowsServer from '../../catalog/templates/windows-server.json';

const fromCatalog = (template: any): ENSPlatformSource => ({
  id: template.id,
  label: template.name,
  description: template.description,
  kind: template.kind,
  systemTypes: [template.system_type],
  onlyControls: Object.keys(template.values),
  values: template.values,
});

const ENS_PLATFORM_SOURCES: ENSPlatformSource[] = [linuxUbuntu, windowsServer, managerWazuh].map(fromCatalog);

export interface ENSControlTemplate {
  id: string;
  controlId: string;
  name: string;
  description?: string;
  systemType?: ENSSystemType;
  values: Record<string, ENSAgentParameterValue>;
  matchModes?: Record<string, ENSMatchMode>;
  builtin: boolean;
  typeDefault: boolean;
}

export const getPlatformSource = (id: string): ENSPlatformSource | undefined =>
  ENS_PLATFORM_SOURCES.find(source => source.id === id);

export const hasTemplateParameters = (controlId: string): boolean =>
  Object.keys(ENS_PARAMETER_CLASSES[controlId] || {}).some(parameterId => isAgentLevelParameter(controlId, parameterId));

const appliesToControl = (source: ENSPlatformSource, controlId: string): boolean => source.onlyControls.includes(controlId);

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
            };
          })
        : []
    );
  }
  return builtinsByControl.get(controlId)!;
};

export const describeTemplate = (template: ENSControlTemplate): string =>
  template.builtin && !Object.keys(template.values).length
    ? `${template.description || ''} Sin valores de serie en este control: se aplican los ajustes comunes.`.trim()
    : template.description || '';

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
  ...(template.matchModes ? { matchModes: template.matchModes } : {}),
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

export const isReservedTemplateId = (id: string): boolean =>
  id === ENS_NO_TEMPLATE || ENS_PLATFORM_SOURCES.some(source => source.id === id);

export const getCollectedControls = (type: ENSSystemType | undefined): string[] | undefined =>
  type ? ENS_PLATFORM_SOURCES.find(source => source.kind === 'base' && source.systemTypes.includes(type))?.onlyControls : undefined;
