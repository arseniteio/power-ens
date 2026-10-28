import { ENSControlDefinition } from './types';

export const mpInfo6CatalogDefinition: ENSControlDefinition = {
  id: 'mp.info.6',
  name: 'Copias de seguridad',
  family: 'Medidas de protección',
  category: 'Protección de la información',
  dimension: 'Disponibilidad',
  // Annex II applies mp.info.6 by the Availability LEVEL, not the system category.
  levelDimension: 'D',
  description:
    'Control ENS orientado a garantizar la existencia, conservación, protección y recuperación de copias de seguridad.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  // Backups are measured only on the machines the organisation declares in P-04: not every ENS scope machine makes or keeps backups.
  scopeParameter: 'P-04',
  annexSection: '5.7.6',
  source: { template: 'PowerENS_Plantilla_mp.info.6', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.info.6.1',
      title: 'Realización de copias de seguridad',
      description:
        'Se realizarán copias de seguridad que permitan recuperar datos perdidos, accidental o intencionadamente. La periodicidad y los plazos de retención de estas copias de seguridad se determinarán en la normativa interna de la organización relativa a copias de seguridad.',
      interpretation:
        'Power ENS acredita que cada copia declarada terminó bien en la última pasada del recolector (EV-01), que la última correcta no supera la frecuencia de P-01 más el margen de P-02 (EV-02) y que el recolector informa (EV-07). La periodicidad y la retención que remite a la normativa interna se declaran en P-01 y P-03.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-07'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-10'],
    },
    {
      id: 'mp.info.6.2.a',
      title: 'Frecuencia de las copias',
      description:
        'Los procedimientos de respaldo establecidos indicarán: a) Frecuencia de las copias.',
      interpretation:
        'Power ENS comprueba la planificación real de cada copia (cron o zmschedulebackup) frente a P-01 y la antigüedad de la última copia correcta frente a P-01 más el margen de P-02 (EV-01, EV-02).',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'mp.info.6.2.b',
      title: 'Almacenamiento en el propio lugar',
      description:
        'Los procedimientos de respaldo establecidos indicarán: b) Requisitos de almacenamiento en el propio lugar.',
      interpretation:
        'Power ENS lo acredita con la retención configurada de cada copia en su repositorio frente a P-03, con la copia más antigua que se conserva (EV-03), y con el latido del recolector (EV-07). No mide el soporte ni el cifrado del almacenamiento local.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03', 'EV-07'],
      parameterIds: ['P-03'],
    },
    {
      id: 'mp.info.6.2.c',
      title: 'Almacenamiento en otros lugares',
      description:
        'Los procedimientos de respaldo establecidos indicarán: c) Requisitos de almacenamiento en otros lugares.',
      interpretation:
        'Power ENS lo acredita con el recolector de copias (EV-07) y con los destinos de cada copia (EV-06); la copia físicamente separada solo se exige en nivel ALTO, donde también la acredita R2.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06', 'EV-07'],
      parameterIds: ['P-03'],
    },
    {
      id: 'mp.info.6.2.d',
      title: 'Acceso autorizado a las copias',
      description:
        'Los procedimientos de respaldo establecidos indicarán: d) Controles para el acceso autorizado a las copias de respaldo.',
      interpretation:
        'Power ENS comprueba quién puede leer el repositorio de cada copia frente a P-07 y que la clave de cifrado de las copias solo la puede leer su dueño (EV-04), junto con la retención configurada (EV-03). No observa los accesos uno a uno.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03', 'EV-04'],
      parameterIds: ['P-07'],
    },
    {
      id: 'mp.info.6.r1.1',
      title: 'Pruebas de recuperación',
      description:
        'Los procedimientos de copia de seguridad y restauración deben probarse regularmente. Su frecuencia dependerá de la criticidad de los datos y del impacto que cause la falta de disponibilidad.',
      interpretation:
        'Power ENS exige una restauración periódica de un testigo con su contenido comprobado dentro del plazo de P-05 (EV-05): en el PBS, un fichero comparado con su SHA-256; en Zimbra, la cuenta testigo y una entrada testigo del directorio. El plazo es único para todas las copias, no graduado por criticidad.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-04', 'P-05', 'P-10'],
    },
    {
      id: 'mp.info.6.r2.1',
      title: 'Protección de las copias de seguridad',
      description:
        'Al menos una de las copias de seguridad se almacenará de forma separada en lugar diferente, de tal manera que un incidente no pueda afectar tanto al repositorio original como a la copia simultáneamente.',
      interpretation:
        'Power ENS lo acredita con los destinos de cada copia (EV-06): al menos uno fuera de la máquina y activo. Solo se exige en nivel ALTO de Disponibilidad.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Este requisito solo aplica con nivel ALTO de Disponibilidad. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-08', 'P-09'],
    },
  ],
};
