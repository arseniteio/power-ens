// The 73 measures of Annex II (RD 311/2022): axis and requirement per level, from the owner's table of 20/10/2026.
import type { ENSLevelDimension } from '../catalog/types';
import type { ENSGlobalConfiguration, ENSLevel } from '../configuration/types';
import { resolveControlLevel } from '../core/control-level';

// 'CATEGORIA': applied by the system category; otherwise by the highest level of the listed dimensions.
export type ENSAnnexAxis = 'CATEGORIA' | ENSLevelDimension[];

export interface ENSAnnexMeasure {
  id: string;
  annexSection: string;
  name: string;
  axis: ENSAnnexAxis;
  // What the Annex requires at each level: 'aplica', the reinforcements ('+R1', '+[R1 o R2]+R5') or 'n.a.'.
  requirement: Record<ENSLevel, string>;
}

type Row = [string, string, string, ENSAnnexAxis, string, string, string];

const ROWS: Row[] = [
  ['org.1', '3.1', 'Política de seguridad', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['org.2', '3.2', 'Normativa de seguridad', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['org.3', '3.3', 'Procedimientos de seguridad', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['org.4', '3.4', 'Proceso de autorización', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['op.pl.1', '4.1.1', 'Análisis de riesgos', 'CATEGORIA', 'aplica', '+R1', '+R2'],
  ['op.pl.2', '4.1.2', 'Arquitectura de seguridad', 'CATEGORIA', 'aplica', '+R1', '+R1+R2+R3'],
  ['op.pl.3', '4.1.3', 'Adquisición de nuevos componentes', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['op.pl.4', '4.1.4', 'Dimensionamiento/gestión de la capacidad', ['D'], 'aplica', '+R1', '+R1'],
  ['op.pl.5', '4.1.5', 'Componentes certificados', 'CATEGORIA', 'n.a.', 'aplica', 'aplica'],
  ['op.acc.1', '4.2.1', 'Identificación', ['T', 'A'], 'aplica', '+R1', '+R1'],
  ['op.acc.2', '4.2.2', 'Requisitos de acceso', ['C', 'I', 'T', 'A'], 'aplica', 'aplica', '+R1'],
  ['op.acc.3', '4.2.3', 'Segregación de funciones y tareas', ['C', 'I', 'T', 'A'], 'n.a.', 'aplica', '+R1'],
  ['op.acc.4', '4.2.4', 'Proceso de gestión de derechos de acceso', ['C', 'I', 'T', 'A'], 'aplica', 'aplica', 'aplica'],
  ['op.acc.5', '4.2.5', 'Mecanismo de autenticación (usuarios externos)', ['C', 'I', 'T', 'A'], '+[R1 o R2 o R3 o R4]', '+[R2 o R3 o R4]+R5', '+[R2 o R3 o R4]+R5'],
  ['op.acc.6', '4.2.6', 'Mecanismo de autenticación (usuarios de la organización)', ['C', 'I', 'T', 'A'], '+[R1 o R2 o R3 o R4]+R8+R9', '+[R1 o R2 o R3 o R4]+R5+R8+R9', '+[R1 o R2 o R3 o R4]+R5+R6+R7+R8+R9'],
  ['op.exp.1', '4.3.1', 'Inventario de activos', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['op.exp.2', '4.3.2', 'Configuración de seguridad', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['op.exp.3', '4.3.3', 'Gestión de la configuración de seguridad', 'CATEGORIA', 'aplica', '+R1', '+R1+R2+R3'],
  ['op.exp.4', '4.3.4', 'Mantenimiento y actualizaciones de seguridad', 'CATEGORIA', 'aplica', '+R1', '+R1+R2'],
  ['op.exp.5', '4.3.5', 'Gestión de cambios', 'CATEGORIA', 'n.a.', 'aplica', '+R1'],
  ['op.exp.6', '4.3.6', 'Protección frente a código dañino', 'CATEGORIA', 'aplica', '+R1+R2', '+R1+R2+R3+R4'],
  ['op.exp.7', '4.3.7', 'Gestión de incidentes', 'CATEGORIA', 'aplica', '+R1+R2', '+R1+R2+R3'],
  ['op.exp.8', '4.3.8', 'Registro de la actividad', ['T'], 'aplica', '+R1+R2+R3+R4', '+R1+R2+R3+R4+R5'],
  ['op.exp.9', '4.3.9', 'Registro de la gestión de incidentes', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['op.exp.10', '4.3.10', 'Protección de claves criptográficas', 'CATEGORIA', 'aplica', '+R1', '+R1'],
  ['op.ext.1', '4.4.1', 'Contratación y acuerdos de nivel de servicio', 'CATEGORIA', 'n.a.', 'aplica', 'aplica'],
  ['op.ext.2', '4.4.2', 'Gestión diaria', 'CATEGORIA', 'n.a.', 'aplica', 'aplica'],
  ['op.ext.3', '4.4.3', 'Protección de la cadena de suministro', 'CATEGORIA', 'n.a.', 'n.a.', 'aplica'],
  ['op.ext.4', '4.4.4', 'Interconexión de sistemas', 'CATEGORIA', 'n.a.', 'aplica', '+R1'],
  ['op.nub.1', '4.5.1', 'Protección de servicios en la nube', 'CATEGORIA', 'aplica', '+R1', '+R1+R2'],
  ['op.cont.1', '4.6.1', 'Análisis de impacto', ['D'], 'n.a.', 'aplica', 'aplica'],
  ['op.cont.2', '4.6.2', 'Plan de continuidad', ['D'], 'n.a.', 'n.a.', 'aplica'],
  ['op.cont.3', '4.6.3', 'Pruebas periódicas', ['D'], 'n.a.', 'n.a.', 'aplica'],
  ['op.cont.4', '4.6.4', 'Medios alternativos', ['D'], 'n.a.', 'n.a.', 'aplica'],
  ['op.mon.1', '4.7.1', 'Detección de intrusión', 'CATEGORIA', 'aplica', '+R1', '+R1+R2'],
  ['op.mon.2', '4.7.2', 'Sistema de métricas', 'CATEGORIA', 'aplica', '+R1+R2', '+R1+R2'],
  ['op.mon.3', '4.7.3', 'Vigilancia', 'CATEGORIA', 'aplica', '+R1+R2', '+R1+R2+R3+R4+R5+R6'],
  ['mp.if.1', '5.1.1', 'Áreas separadas y con control de acceso', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.if.2', '5.1.2', 'Identificación de las personas', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.if.3', '5.1.3', 'Acondicionamiento de los locales', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.if.4', '5.1.4', 'Energía eléctrica', ['D'], 'aplica', '+R1', '+R1'],
  ['mp.if.5', '5.1.5', 'Protección frente a incendios', ['D'], 'aplica', 'aplica', 'aplica'],
  ['mp.if.6', '5.1.6', 'Protección frente a inundaciones', ['D'], 'n.a.', 'aplica', 'aplica'],
  ['mp.if.7', '5.1.7', 'Registro de entrada y salida de equipamiento', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.per.1', '5.2.1', 'Caracterización del puesto de trabajo', 'CATEGORIA', 'n.a.', 'aplica', 'aplica'],
  ['mp.per.2', '5.2.2', 'Deberes y obligaciones', 'CATEGORIA', 'aplica', '+R1', '+R1'],
  ['mp.per.3', '5.2.3', 'Concienciación', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.per.4', '5.2.4', 'Formación', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.eq.1', '5.3.1', 'Puesto de trabajo despejado', 'CATEGORIA', 'aplica', '+R1', '+R1'],
  ['mp.eq.2', '5.3.2', 'Bloqueo de puesto de trabajo', ['A'], 'n.a.', 'aplica', '+R1'],
  ['mp.eq.3', '5.3.3', 'Protección de dispositivos portátiles', 'CATEGORIA', 'aplica', 'aplica', '+R1+R2'],
  ['mp.eq.4', '5.3.4', 'Otros dispositivos conectados a la red', ['C'], 'aplica', '+R1', '+R1'],
  ['mp.com.1', '5.4.1', 'Perímetro seguro', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.com.2', '5.4.2', 'Protección de la confidencialidad', ['C'], 'aplica', '+R1', '+R1+R2+R3'],
  ['mp.com.3', '5.4.3', 'Protección de la integridad y de la autenticidad', ['I', 'A'], 'aplica', '+R1+R2', '+R1+R2+R3+R4'],
  ['mp.com.4', '5.4.4', 'Separación de flujos de información en la red', 'CATEGORIA', 'n.a.', '+[R1 o R2 o R3]', '+[R2 o R3]+R4'],
  ['mp.si.1', '5.5.1', 'Marcado de soportes', ['C'], 'n.a.', 'aplica', 'aplica'],
  ['mp.si.2', '5.5.2', 'Criptografía', ['C', 'I'], 'n.a.', 'aplica', '+R1+R2'],
  ['mp.si.3', '5.5.3', 'Custodia', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.si.4', '5.5.4', 'Transporte', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.si.5', '5.5.5', 'Borrado y destrucción', ['C'], 'aplica', '+R1', '+R1'],
  ['mp.sw.1', '5.6.1', 'Desarrollo de aplicaciones', 'CATEGORIA', 'n.a.', '+R1+R2+R3+R4', '+R1+R2+R3+R4'],
  ['mp.sw.2', '5.6.2', 'Aceptación y puesta en servicio', 'CATEGORIA', 'aplica', '+R1', '+R1'],
  ['mp.info.1', '5.7.1', 'Datos personales', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.info.2', '5.7.2', 'Calificación de la información', ['C'], 'n.a.', 'aplica', 'aplica'],
  ['mp.info.3', '5.7.3', 'Firma electrónica', ['I', 'A'], 'aplica', '+R1+R2+R3', '+R1+R2+R3+R4'],
  ['mp.info.4', '5.7.4', 'Sellos de tiempo', ['T'], 'n.a.', 'n.a.', 'aplica'],
  ['mp.info.5', '5.7.5', 'Limpieza de documentos', ['C'], 'aplica', 'aplica', 'aplica'],
  ['mp.info.6', '5.7.6', 'Copias de seguridad', ['D'], 'aplica', '+R1', '+R1+R2'],
  ['mp.s.1', '5.8.1', 'Protección del correo electrónico', 'CATEGORIA', 'aplica', 'aplica', 'aplica'],
  ['mp.s.2', '5.8.2', 'Protección de servicios y aplicaciones web', 'CATEGORIA', '+[R1 o R2]', '+[R1 o R2]', '+R2+R3'],
  ['mp.s.3', '5.8.3', 'Protección de la navegación web', 'CATEGORIA', 'aplica', 'aplica', '+R1'],
  ['mp.s.4', '5.8.4', 'Protección frente a la denegación de servicio', ['D'], 'n.a.', 'aplica', '+R1'],];

export const ENS_ANNEX_II_MEASURES: ENSAnnexMeasure[] = ROWS.map(([id, annexSection, name, axis, BAJO, MEDIO, ALTO]) => ({
  id,
  annexSection,
  name,
  axis,
  requirement: { BAJO, MEDIO, ALTO },
}));

export const ENS_NOT_APPLICABLE_REQUIREMENT = 'n.a.';

const BY_ID = new Map(ENS_ANNEX_II_MEASURES.map(measure => [measure.id, measure]));

export const getAnnexMeasure = (id: string): ENSAnnexMeasure | undefined => BY_ID.get(String(id || '').trim().toLowerCase());

export const isAnnexMeasureId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);

// The framework of a measure: org (organisational), op (operational) or mp (protection measures).
export const annexFramework = (id: string): 'org' | 'op' | 'mp' => (id.startsWith('org.') ? 'org' : id.startsWith('op.') ? 'op' : 'mp');

export const ENS_FRAMEWORK_NAMES: Record<'org' | 'op' | 'mp', string> = {
  org: 'Marco organizativo',
  op: 'Marco operacional',
  mp: 'Medidas de protección',
};

// Level the measure is applied with: the category, or the highest of its dimensions (same rule as the engine).
export const resolveAnnexMeasureLevel = (measure: ENSAnnexMeasure, global: Partial<ENSGlobalConfiguration> & { ensLevel: ENSLevel }): ENSLevel =>
  measure.axis === 'CATEGORIA' ? global.ensLevel : resolveControlLevel({ levelDimension: measure.axis }, global.ensLevel, global);

export const describeAnnexAxis = (axis: ENSAnnexAxis): string => (axis === 'CATEGORIA' ? 'Categoría' : axis.join(' '));
