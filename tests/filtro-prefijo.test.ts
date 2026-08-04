/**
 * El filtro por prefijo de las pestañas Evidencias e Informes.
 *
 *     ~/.bun/bin/bun run tests/filtro-prefijo.test.ts
 *
 * Mismo montaje que `evidence-judgment.test.ts` y `hueco-de-medida.test.ts`:
 * TypeScript suelto con su propio comprobador, sin `package.json` ni `tsconfig`.
 * Hace falta un runtime que ejecute TypeScript resolviendo imports sin extensión
 * (`bun`, probado con 1.3.14).
 *
 * QUÉ SE PRUEBA Y POR QUÉ EXISTE ESTE FICHERO. Con los tres controles de hoy,
 * un filtro por prefijo escrito con `String.startsWith` y uno escrito por
 * segmentos dan EXACTAMENTE el mismo resultado en todos los casos. El error no
 * aparece hasta que una familia pasa de nueve controles —y `op.exp` del ENS
 * llega a `op.exp.11`—, momento en el que «op.exp.1» empieza a arrastrar a
 * `op.exp.10` y `op.exp.11`. La petición era literalmente «que sirva con 3 y con
 * 30», así que el catálogo de pruebas incluye una familia de dos cifras aunque
 * hoy no esté implementada.
 *
 * Cada bloque mueve UN SOLO eje respecto de su hermano. Todas las afirmaciones
 * son sobre la ESTRUCTURA (qué identificadores pasan, cuántos quedan fuera,
 * cuánto suma el total), nunca sobre el texto de un mensaje.
 *
 * Imports desde el FICHERO, nunca desde un barrel de alto nivel.
 */
import {
  compareENSIds,
  ensFamilyOf,
  filterByENSPrefix,
  isENSSectionOpenByDefault,
  listENSFamilies,
  normalizeENSPrefixQuery,
  resolveENSSectionOpenState,
  splitENSId,
} from '../dashboard/ens/control-filter/prefix';

// El repo no tiene @types/node y no va a tenerlos.
declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle: string = ''
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

// Un control tal y como lo pasan las dos pestañas al filtro: su identificador y
// los de sus requisitos, que viven en el mismo espacio jerárquico.
interface ControlFixture {
  controlId: string;
  requirementIds: string[];
}

// Los tres controles DESPLEGADOS, con sus requisitos reales
// (`dashboard/ens/data/`), más los dos que el producto tiene en camino
// (op.acc.3 y op.acc.4) y una familia de dos cifras. `op.exp` («Explotación»)
// es una familia real del RD 311/2022 que llega a `op.exp.11`: no es un caso
// inventado para que la prueba salga bien, es el catálogo que viene.
const CATALOGO: ControlFixture[] = [
  {
    controlId: 'mp.info.6',
    requirementIds: [
      'mp.info.6.1',
      'mp.info.6.2.a',
      'mp.info.6.2.b',
      'mp.info.6.2.c',
      'mp.info.6.2.d',
      'mp.info.6.r1.1',
      'mp.info.6.r2.1',
    ],
  },
  {
    controlId: 'op.acc.1',
    requirementIds: [
      'op.acc.1.1',
      'op.acc.1.2',
      'op.acc.1.3',
      'op.acc.1.4',
      'op.acc.1.5',
      'op.acc.1.r1.1',
      'op.acc.1.r1.2',
      'op.acc.1.r1.3',
    ],
  },
  {
    controlId: 'op.acc.2',
    requirementIds: [
      'op.acc.2.1',
      'op.acc.2.2',
      'op.acc.2.3',
      'op.acc.2.r1.1',
      'op.acc.2.r1.2',
    ],
  },
  { controlId: 'op.acc.3', requirementIds: ['op.acc.3.1', 'op.acc.3.2'] },
  { controlId: 'op.acc.4', requirementIds: ['op.acc.4.1'] },
  { controlId: 'op.exp.1', requirementIds: ['op.exp.1.1'] },
  { controlId: 'op.exp.2', requirementIds: ['op.exp.2.1'] },
  { controlId: 'op.exp.10', requirementIds: ['op.exp.10.1'] },
  { controlId: 'op.exp.11', requirementIds: ['op.exp.11.1'] },
];

// Los tres controles de HOY, para comprobar que el filtro también se comporta
// con el catálogo real y pequeño y no solo con el grande.
const CATALOGO_HOY: ControlFixture[] = CATALOGO.slice(0, 3);

const identificadoresDe = (control: ControlFixture): string[] => [
  control.controlId,
  ...control.requirementIds,
];

const filtra = (
  catalogo: ControlFixture[],
  consulta: string
): { pasan: string[]; fuera: string[]; total: number; activo: boolean } => {
  const resultado = filterByENSPrefix(catalogo, consulta, identificadoresDe);

  return {
    pasan: resultado.matched.map(control => control.controlId),
    fuera: resultado.hidden.map(control => control.controlId),
    total: resultado.total,
    activo: resultado.isActive,
  };
};

const iguales = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

// --- 1. estado inicial: sin filtro se ve todo -------------------------------

bloque('1. Sin filtro');

{
  const sinFiltro = filtra(CATALOGO, '');

  comprueba(
    'sin filtro · el filtro no consta como activo',
    sinFiltro.activo === false
  );

  comprueba(
    'sin filtro · pasan los nueve controles',
    sinFiltro.pasan.length === CATALOGO.length,
    `pasan ${sinFiltro.pasan.length} de ${CATALOGO.length}`
  );

  comprueba(
    'sin filtro · no queda nada oculto',
    sinFiltro.fuera.length === 0,
    `ocultos: ${sinFiltro.fuera.join(', ')}`
  );

  comprueba(
    'sin filtro · el total es el catálogo entero',
    sinFiltro.total === CATALOGO.length
  );

  const soloEspacios = filtra(CATALOGO, '   ');

  comprueba(
    'sin filtro · una consulta de solo espacios es no tener filtro',
    soloEspacios.activo === false && soloEspacios.fuera.length === 0
  );
}

// --- 2. familia -------------------------------------------------------------

bloque('2. Un prefijo de familia deja la familia entera');

{
  const familia = filtra(CATALOGO, 'op.acc');

  comprueba(
    'familia · «op.acc» deja los cuatro op.acc y ninguno más',
    iguales(familia.pasan, ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4']),
    `pasan: ${familia.pasan.join(', ')}`
  );

  comprueba(
    'familia · el filtro consta como activo',
    familia.activo === true
  );

  comprueba(
    'familia · mp.info.6 queda FUERA, no desaparecido',
    familia.fuera.includes('mp.info.6'),
    `ocultos: ${familia.fuera.join(', ')}`
  );

  comprueba(
    'familia · lo que pasa más lo que se oculta es el total',
    familia.pasan.length + familia.fuera.length === familia.total &&
      familia.total === CATALOGO.length
  );

  const familiaHoy = filtra(CATALOGO_HOY, 'op.acc');

  comprueba(
    'familia · con los tres controles de hoy deja op.acc.1 y op.acc.2',
    iguales(familiaHoy.pasan, ['op.acc.1', 'op.acc.2']),
    `pasan: ${familiaHoy.pasan.join(', ')}`
  );
}

// --- 3. un control concreto: el eje que solo se ve con dos cifras -----------

bloque('3. Un prefijo de control deja SOLO ese control');

{
  const unControl = filtra(CATALOGO, 'op.acc.1');

  comprueba(
    'control · «op.acc.1» deja solo op.acc.1',
    iguales(unControl.pasan, ['op.acc.1']),
    `pasan: ${unControl.pasan.join(', ')}`
  );

  // Aquí es donde `String.startsWith` se rompe: 'op.exp.10'.startsWith('op.exp.1')
  // es cierto. Con tres controles esta comprobación no existiría porque no
  // habría con qué escribirla.
  const dosCifras = filtra(CATALOGO, 'op.exp.1');

  comprueba(
    'control · «op.exp.1» NO arrastra a op.exp.10 ni a op.exp.11',
    iguales(dosCifras.pasan, ['op.exp.1']),
    `pasan: ${dosCifras.pasan.join(', ')}`
  );

  comprueba(
    'control · y op.exp.10 y op.exp.11 constan como ocultos',
    dosCifras.fuera.includes('op.exp.10') &&
      dosCifras.fuera.includes('op.exp.11')
  );

  const onceExacto = filtra(CATALOGO, 'op.exp.11');

  comprueba(
    'control · «op.exp.11» deja solo op.exp.11',
    iguales(onceExacto.pasan, ['op.exp.11']),
    `pasan: ${onceExacto.pasan.join(', ')}`
  );

  // El mismo caso sobre una lista PELADA de identificadores, sin los requisitos.
  //
  // No es una repetición: mientras cada control aporte además sus requisitos
  // —siempre más largos que él—, la consulta nunca tiene tantos segmentos como
  // el identificador más largo, y el tramo del filtro que decide qué pasa
  // cuando la consulta mide EXACTAMENTE lo mismo que el identificador no llega
  // a ejecutarse nunca. Aquí sí: `op.exp.1` mide lo mismo que `op.exp.1`, y no
  // hay nada más hondo detrás.
  const pelados = filterByENSPrefix(
    CATALOGO.map(control => control.controlId),
    'op.exp.1',
    id => [id]
  );

  comprueba(
    'control · sobre identificadores sueltos, «op.exp.1» sigue siendo solo uno',
    iguales(pelados.matched, ['op.exp.1']),
    `pasan: ${pelados.matched.join(', ')}`
  );

  comprueba(
    'control · y los otros ocho constan como ocultos',
    pelados.hidden.length === CATALOGO.length - 1,
    `ocultos: ${pelados.hidden.length}`
  );
}

// --- 4. mientras se teclea --------------------------------------------------

bloque('4. Un segmento a medias sigue encontrando');

{
  const tecleando = filtra(CATALOGO, 'op.a');

  comprueba(
    'tecleando · «op.a» encuentra la familia op.acc',
    iguales(tecleando.pasan, ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4']),
    `pasan: ${tecleando.pasan.join(', ')}`
  );

  const puntoFinal = filtra(CATALOGO, 'op.acc.');

  comprueba(
    'tecleando · «op.acc.» (punto suelto al final) es la familia entera',
    iguales(puntoFinal.pasan, ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4']),
    `pasan: ${puntoFinal.pasan.join(', ')}`
  );

  // El respaldo parcial solo entra cuando NADIE casa por segmentos completos.
  // Este par es el que fija la precedencia: con `mp.info.6` en el catálogo,
  // «mp.i» encuentra (parcial) pero «mp.info.6» sigue siendo exacto.
  const parcialCorto = filtra(CATALOGO, 'mp.i');

  comprueba(
    'tecleando · «mp.i» encuentra mp.info.6 por el respaldo parcial',
    iguales(parcialCorto.pasan, ['mp.info.6']),
    `pasan: ${parcialCorto.pasan.join(', ')}`
  );
}

// --- 5. requisitos: el prefijo baja un nivel más ----------------------------

bloque('5. Un prefijo de requisito encuentra su control');

{
  const requisito = filtra(CATALOGO, 'op.acc.1.2');

  comprueba(
    'requisito · «op.acc.1.2» encuentra el control que lo declara',
    iguales(requisito.pasan, ['op.acc.1']),
    `pasan: ${requisito.pasan.join(', ')}`
  );

  const bloqueDeRequisitos = filtra(CATALOGO, 'mp.info.6.2');

  comprueba(
    'requisito · «mp.info.6.2» encuentra mp.info.6 por mp.info.6.2.a…d',
    iguales(bloqueDeRequisitos.pasan, ['mp.info.6']),
    `pasan: ${bloqueDeRequisitos.pasan.join(', ')}`
  );

  const refuerzo = filtra(CATALOGO, 'op.acc.1.r1.3');

  comprueba(
    'requisito · un refuerzo (op.acc.1.r1.3) también encuentra su control',
    iguales(refuerzo.pasan, ['op.acc.1']),
    `pasan: ${refuerzo.pasan.join(', ')}`
  );

  // Más segmentos que cualquier identificador del catálogo: no hay nada más
  // hondo a lo que bajar, y el filtro no puede inventarse una coincidencia.
  const demasiadoHondo = filtra(CATALOGO, 'op.acc.1.2.3.4.5');

  comprueba(
    'requisito · un prefijo más largo que cualquier identificador no casa',
    demasiadoHondo.pasan.length === 0,
    `pasan: ${demasiadoHondo.pasan.join(', ')}`
  );

  // Y el caso de UN SOLO segmento de más sobre un requisito que sí existe
  // (`op.acc.1.2` + `.3`), que es el que de verdad ejercita la guarda de
  // longitud: con un segmento de más el respaldo parcial iría a mirar un
  // segmento que no existe. Con dos o más de más ni siquiera llega ahí, así que
  // el caso de arriba no basta.
  let rompeElFiltro = false;
  let pasanConUnSegmentoDeMas: string[] = [];

  try {
    pasanConUnSegmentoDeMas = filtra(CATALOGO, 'op.acc.1.2.3').pasan;
  } catch {
    rompeElFiltro = true;
  }

  comprueba(
    'requisito · un segmento de más sobre un requisito real ni casa ni revienta',
    !rompeElFiltro && pasanConUnSegmentoDeMas.length === 0,
    rompeElFiltro
      ? 'el filtro ha lanzado una excepción'
      : `pasan: ${pasanConUnSegmentoDeMas.join(', ')}`
  );
}

// --- 6. normalización -------------------------------------------------------

bloque('6. Mayúsculas y espacios');

{
  const crudo = filtra(CATALOGO, '  OP.ACC.1  ');

  comprueba(
    'normalización · «  OP.ACC.1  » es «op.acc.1»',
    iguales(crudo.pasan, ['op.acc.1']),
    `pasan: ${crudo.pasan.join(', ')}`
  );

  comprueba(
    'normalización · la consulta se publica ya normalizada',
    normalizeENSPrefixQuery('  OP.ACC  ') === 'op.acc'
  );

  comprueba(
    'normalización · un identificador se parte en minúsculas',
    iguales(splitENSId('OP.ACC.1'), ['op', 'acc', '1'])
  );
}

// --- 7. cero resultados: el panel vacío tiene que poder explicarse ----------

bloque('7. Cuando no casa nada');

{
  const nada = filtra(CATALOGO, 'zz.yy');

  comprueba(
    'cero · no pasa ningún control',
    nada.pasan.length === 0,
    `pasan: ${nada.pasan.join(', ')}`
  );

  comprueba(
    'cero · TODOS los controles constan como ocultos por el filtro',
    nada.fuera.length === CATALOGO.length,
    `ocultos: ${nada.fuera.length} de ${CATALOGO.length}`
  );

  comprueba(
    'cero · el total sigue siendo el del catálogo, para poder decir «0 de 9»',
    nada.total === CATALOGO.length
  );

  const puntosDeMas = filtra(CATALOGO, 'op..acc');

  comprueba(
    'cero · un punto de más no se corrige solo ni inventa coincidencias',
    puntosDeMas.pasan.length === 0,
    `pasan: ${puntosDeMas.pasan.join(', ')}`
  );
}

// --- 8. familias y orden ----------------------------------------------------

bloque('8. Familias y orden');

{
  const familias = listENSFamilies(
    CATALOGO.map(control => control.controlId)
  );

  comprueba(
    'familias · tres familias, sin repetir y en orden',
    iguales(familias, ['mp.info', 'op.acc', 'op.exp']),
    `familias: ${familias.join(', ')}`
  );

  comprueba(
    'familias · nueve controles dan tres familias: los botones no se desbordan',
    familias.length < CATALOGO.length
  );

  comprueba(
    'familias · la familia de op.acc.1 es op.acc',
    ensFamilyOf('op.acc.1') === 'op.acc'
  );

  comprueba(
    'familias · un identificador de un solo segmento ya es su familia',
    ensFamilyOf('org') === 'org'
  );

  const ordenados = [
    'op.exp.10',
    'op.acc.2',
    'op.exp.2',
    'mp.info.6',
    'op.exp.11',
    'op.acc.1',
  ].sort(compareENSIds);

  comprueba(
    'orden · op.exp.2 va antes que op.exp.10 (números como números)',
    iguales(ordenados, [
      'mp.info.6',
      'op.acc.1',
      'op.acc.2',
      'op.exp.2',
      'op.exp.10',
      'op.exp.11',
    ]),
    `orden: ${ordenados.join(', ')}`
  );

  const conRefuerzo = ['mp.info.6.r1.1', 'mp.info.6.2.a', 'mp.info.6.1'].sort(
    compareENSIds
  );

  comprueba(
    'orden · el requisito numérico va antes que el refuerzo r1',
    iguales(conRefuerzo, [
      'mp.info.6.1',
      'mp.info.6.2.a',
      'mp.info.6.r1.1',
    ]),
    `orden: ${conRefuerzo.join(', ')}`
  );

  comprueba(
    'orden · el más corto va antes que el que lo extiende',
    compareENSIds('op.acc.1', 'op.acc.1.2') < 0
  );
}

// --- 9. lo que el filtro esconde se puede contar por tipo -------------------

bloque('9. Lo oculto es contable');

{
  // La pantalla necesita poder decir «1 incumplimiento y 3 sin medir fuera del
  // filtro» sin sumarlos: por eso `hidden` devuelve los elementos enteros y no
  // un número. Se comprueba con el mismo catálogo, marcando dos controles.
  interface ConHallazgos extends ControlFixture {
    incumplen: number;
    sinMedir: number;
  }

  const conHallazgos: ConHallazgos[] = [
    { ...CATALOGO[0], incumplen: 2, sinMedir: 1 },
    { ...CATALOGO[1], incumplen: 0, sinMedir: 4 },
    { ...CATALOGO[2], incumplen: 1, sinMedir: 0 },
  ];

  const resultado = filterByENSPrefix(
    conHallazgos,
    'op.acc.1',
    identificadoresDe
  );

  const incumplenOcultos = resultado.hidden.reduce(
    (total, control) => total + control.incumplen,
    0
  );

  const sinMedirOcultos = resultado.hidden.reduce(
    (total, control) => total + control.sinMedir,
    0
  );

  comprueba(
    'oculto · el filtro deja fuera 3 incumplimientos demostrados',
    incumplenOcultos === 3,
    `incumplimientos ocultos: ${incumplenOcultos}`
  );

  comprueba(
    'oculto · y 1 pendiente de medición, contado APARTE',
    sinMedirOcultos === 1,
    `sin medir ocultos: ${sinMedirOcultos}`
  );

  comprueba(
    'oculto · los dos recuentos no se suman en uno solo',
    incumplenOcultos !== sinMedirOcultos
  );
}

// --- 10. cuándo se despliega una sección ------------------------------------

bloque('10. El despliegue de las secciones');

{
  const sinTocar: Record<string, boolean | undefined> = {};

  comprueba(
    'despliegue · un único resultado se abre solo',
    isENSSectionOpenByDefault(1) === true
  );

  comprueba(
    'despliegue · con dos resultados las secciones siguen cerradas',
    isENSSectionOpenByDefault(2) === false
  );

  comprueba(
    'despliegue · sin filtro y con los nueve controles, todas cerradas',
    isENSSectionOpenByDefault(CATALOGO.length) === false
  );

  comprueba(
    'despliegue · sin resultados no hay nada que abrir',
    isENSSectionOpenByDefault(0) === false
  );

  const unico = filtra(CATALOGO, 'op.acc.1');

  comprueba(
    'despliegue · filtrar hasta un control lo deja abierto sin tocar nada',
    resolveENSSectionOpenState(sinTocar, 'op.acc.1', unico.pasan.length) ===
      true
  );

  const familia = filtra(CATALOGO, 'op.acc');

  comprueba(
    'despliegue · filtrar por familia deja las cuatro cerradas',
    resolveENSSectionOpenState(sinTocar, 'op.acc.1', familia.pasan.length) ===
      false
  );

  // Lo que el operador decide a mano manda sobre el criterio por defecto, en
  // los dos sentidos.
  comprueba(
    'despliegue · cerrar a mano gana sobre el auto-abrir del único resultado',
    resolveENSSectionOpenState(
      { 'op.acc.1': false },
      'op.acc.1',
      unico.pasan.length
    ) === false
  );

  comprueba(
    'despliegue · abrir a mano gana sobre el cerrado por defecto',
    resolveENSSectionOpenState(
      { 'op.acc.1': true },
      'op.acc.1',
      familia.pasan.length
    ) === true
  );

  comprueba(
    'despliegue · tocar una sección no cambia el estado de las demás',
    resolveENSSectionOpenState(
      { 'op.acc.1': true },
      'op.acc.2',
      familia.pasan.length
    ) === false
  );
}

// --- resultado --------------------------------------------------------------

console.log('');

if (fallos.length > 0) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(fallo => console.log(`  · ${fallo}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
