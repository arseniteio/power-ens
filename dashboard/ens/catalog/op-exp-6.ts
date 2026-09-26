import { ENSControlDefinition } from './types';

export const opExp6CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.6',
  name: 'Protección frente a código dañino',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'Wazuh no es el antimalware: es quien acredita que el antimalware existe, funciona y está bien configurado, y quien aporta la capa EDR que exige R4 en categoría ALTA.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.6.1',
      title: 'Prevención y reacción frente a código dañino',
      description:
        'Se dispondrá de mecanismos de prevención y reacción frente a código dañino, incluyendo el correspondiente mantenimiento de acuerdo a las recomendaciones del fabricante.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-04', 'EV-10', 'EV-11'],
      parameterIds: ['P-01', 'P-02', 'P-09'],
    },
    {
      id: 'op.exp.6.2',
      title: 'Antimalware instalado en todos los equipos',
      description:
        'Se instalará software de protección frente a código dañino en todos los equipos: puestos de usuario, servidores y elementos perimetrales.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'op.exp.6.3',
      title: 'Ficheros externos analizados antes de usarlos',
      description:
        'Todo fichero procedente de fuentes externas será analizado antes de trabajar con él.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      // La ficha pone EV-08 (VirusTotal) también en op.exp.6.3, pero su hoja de
      // condiciones de incumplimiento solo juzga op.exp.6.3 con EV-12. VirusTotal
      // es una capacidad EDR (R4): dentro de op.exp.6.3 solo podría hundirlo,
      // porque no se observa desde el equipo, y una decisión de no usarlo en
      // ALTA dejaría en rojo un requisito BASE.
      evidenceIds: ['EV-12'],
      parameterIds: ['P-05', 'P-10'],
    },
    {
      id: 'op.exp.6.4',
      title: 'Bases de detección actualizadas',
      description:
        'Las bases de datos de detección de código dañino permanecerán permanentemente actualizadas.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02'],
      parameterIds: ['P-03'],
    },
    {
      id: 'op.exp.6.5',
      title: 'Configuración adecuada y protección en tiempo real',
      description:
        'El software de detección de código dañino instalado en los puestos de usuario deberá estar configurado de forma adecuada e implementará protección en tiempo real de acuerdo a las recomendaciones del fabricante.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-04'],
    },
    {
      id: 'op.exp.6.r1.1',
      title: 'Escaneo periódico de todo el sistema (R1)',
      description:
        'Todo el sistema se escaneará regularmente para detectar código dañino.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Refuerzo acumulativo: la ficha lo exige en MEDIA «+ R1 + R2» y en ALTA. En BAJO se muestra como NO_APLICA.',
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-06'],
    },
    {
      id: 'op.exp.6.r2.1',
      title: 'Funciones críticas analizadas al arranque (R2)',
      description:
        'Las funciones críticas se analizarán al arrancar el sistema en prevención de modificaciones no autorizadas.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Refuerzo acumulativo: la ficha lo exige en MEDIA «+ R1 + R2» y en ALTA. En BAJO se muestra como NO_APLICA.',
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-07'],
    },
    {
      id: 'op.exp.6.r3.1',
      title: 'Lista blanca de aplicaciones (R3)',
      description:
        'Solamente se podrán ejecutar aquellas aplicaciones previamente autorizadas. Se implementará una lista blanca para impedir la ejecución de aplicaciones no autorizadas.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Refuerzo exigible solo en ALTA («+ R1 + R2 + R3 + R4»). En BAJO y MEDIO se muestra como NO_APLICA.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-08'],
    },
    {
      id: 'op.exp.6.r4.1',
      title: 'Detección y respuesta en equipos, EDR (R4)',
      description:
        'Se emplearán herramientas de seguridad orientadas a detectar, investigar y resolver actividades sospechosas en puestos de usuario y servidores (EDR – Endpoint Detection and Response).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Refuerzo exigible solo en ALTA («+ R1 + R2 + R3 + R4»). En BAJO y MEDIO se muestra como NO_APLICA.',
      },
      evidenceIds: ['EV-08', 'EV-09', 'EV-10', 'EV-11'],
      parameterIds: ['P-09'],
    },
    {
      id: 'op.exp.6.r5.1',
      title: 'Configuración avanzada del antimalware (R5)',
      description:
        'Refuerzo R5 – Configuración de la herramienta de detección de código dañino: El software de detección de código dañino permitirá realizar configuraciones avanzadas y revisar el sistema en el arranque y cada vez que se conecte un dispositivo extraíble.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'El ENS define este refuerzo pero no lo exige en ninguna categoría: se muestra como NO_APLICA en los tres niveles.',
      },
      evidenceIds: ['EV-12'],
      parameterIds: ['P-10'],
    },
    {
      id: 'op.exp.6.r5.2',
      title: 'Protección en tiempo real en servidores (R5)',
      description:
        'El software de detección de código dañino instalado en servidores y elementos perimetrales deberá estar configurado de forma adecuada e implementará protección en tiempo real de acuerdo a las recomendaciones del fabricante.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'El ENS define este refuerzo pero no lo exige en ninguna categoría: se muestra como NO_APLICA en los tres niveles.',
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-04'],
    },
  ],
};
