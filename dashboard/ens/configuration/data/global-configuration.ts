import { ENSGlobalConfiguration } from '../types';

export const defaultENSGlobalConfiguration: ENSGlobalConfiguration = {
  clientName: '',
  organization: '',
  ensLevel: 'MEDIO',
  ensVersion: 'RD 311/2022',
  scope: '',
  evaluationPeriod: 'Últimos 30 días',
  timezone: 'Europe/Madrid',
  reportLanguage: 'es',
  activePolicy: 'Política ENS principal',
};

export const ENSGlobalConfigurationFields = [
  {
    key: 'clientName',
    label: 'Cliente',
    description: 'Nombre del cliente u organización evaluada.',
    required: true,
  },
  {
    key: 'organization',
    label: 'Organización',
    description: 'Unidad, entidad o departamento incluido en el alcance.',
    required: true,
  },
  {
    key: 'ensLevel',
    label: 'Nivel ENS',
    description: 'Nivel ENS aplicable al sistema evaluado.',
    required: true,
  },
  {
    key: 'ensVersion',
    label: 'Versión ENS',
    description: 'Marco normativo usado para la evaluación.',
    required: true,
  },
  {
    key: 'scope',
    label: 'Alcance',
    description: 'Sistemas, servicios o activos incluidos en la evaluación.',
    required: true,
  },
  {
    key: 'evaluationPeriod',
    label: 'Periodo de evaluación',
    description: 'Ventana temporal usada para calcular cumplimiento y evidencias.',
    required: true,
  },
  {
    key: 'timezone',
    label: 'Zona horaria',
    description: 'Zona horaria usada para interpretar eventos y reportes.',
    required: true,
  },
  {
    key: 'reportLanguage',
    label: 'Idioma de informes',
    description: 'Idioma usado para generar informes ENSFácil.',
    required: true,
  },
  {
    key: 'activePolicy',
    label: 'Política aplicada',
    description: 'Política ENS o política interna que gobierna la evaluación.',
    required: true,
  },
];
