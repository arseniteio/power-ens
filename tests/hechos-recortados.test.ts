/**
 * Cuando el motor no ha visto todos los hechos, hay que decirlo.
 *
 *     npx tsx tests/hechos-recortados.test.ts
 *
 * POR QUÉ EXISTE. El 07/08/2026 el usuario dijo «no lo entiendo, no parece
 * real, tocas algo y en unos sitios funciona y en otros no». Tenía razón y la
 * causa era esta: la pantalla de detalle pedía al índice `size: 1000` y de
 * op.acc.3 había 17.444 alertas en la ventana. El motor juzgaba el 6 % de los
 * hechos —los MÁS RECIENTES, porque el orden es descendente— y presentaba el
 * resultado como «cumplimiento de los últimos 30 días».
 *
 * El efecto es que el veredicto dependía de qué mil alertas caían dentro del
 * corte, no de lo que había pasado: una acción de hace unas horas que salía del
 * corte hacía desaparecer una incompatibilidad real y el control subía a 100 %
 * él solo. Y el Panel pedía 6000 y el detalle 1000, así que las dos pantallas
 * juzgaban conjuntos distintos del mismo control.
 *
 * Un recorte SILENCIOSO es la misma mentira que un CUMPLE sin medir: presenta
 * una medida parcial como si fuera completa.
 */
declare const process: { exit(code: number): void };

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle?: unknown
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  console.log(`  FALLA ${nombre}${detalle !== undefined ? ` — ${String(detalle)}` : ''}`);
  fallos.push(nombre);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// La cuenta que hace la pantalla, aislada: cuántos hechos han quedado fuera.
const recortados = (
  total: unknown,
  traidos: number
): number => {
  const totalEnIndice =
    typeof total === 'number'
      ? total
      : typeof (total as { value?: number })?.value === 'number'
      ? (total as { value: number }).value
      : traidos;

  return Math.max(0, totalEnIndice - traidos);
};

// --- 1. el caso de producción ---------------------------------------------

bloque('1. 17.444 hechos y solo 1.000 traídos: se dice');

{
  comprueba(
    'con 17.444 en el índice y 1.000 traídos, faltan 16.444',
    recortados({ value: 17444 }, 1000) === 16444,
    recortados({ value: 17444 }, 1000)
  );

  comprueba(
    'y por tanto el aviso se pinta',
    recortados({ value: 17444 }, 1000) > 0
  );
}

// --- 2. la reversión: sin recorte NO se avisa ------------------------------

bloque('2. Cuando el motor lo ha visto todo, no se avisa de nada');

{
  // LA MITAD IMPORTANTE. Un aviso que sale siempre no lo lee nadie, y a las tres
  // veces deja de significar algo. Solo puede salir cuando de verdad falta algo.
  comprueba(
    'traído todo, no falta nada',
    recortados({ value: 340 }, 340) === 0,
    recortados({ value: 340 }, 340)
  );

  comprueba(
    'sin ningún hecho, tampoco se avisa de recorte',
    recortados({ value: 0 }, 0) === 0
  );

  // OpenSearch puede devolver `total` como número suelto en vez de objeto.
  comprueba(
    'y da igual que `total` venga como número o como objeto',
    recortados(17444, 1000) === recortados({ value: 17444 }, 1000),
    `${recortados(17444, 1000)} vs ${recortados({ value: 17444 }, 1000)}`
  );

  // Y si el total no viene, NO se inventa un recorte: se asume lo traído. Un
  // aviso falso sobre datos incompletos mina la confianza igual que su ausencia.
  comprueba(
    'sin `total`, no se inventa un recorte',
    recortados(undefined, 500) === 0,
    recortados(undefined, 500)
  );

  // Un total MENOR que lo traído (no debería pasar) tampoco produce negativos.
  comprueba(
    'un total incoherente no produce un recorte negativo',
    recortados({ value: 10 }, 500) === 0,
    recortados({ value: 10 }, 500)
  );
}

// --- salida ---------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
