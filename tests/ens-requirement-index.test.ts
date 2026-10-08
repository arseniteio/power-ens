/**
 * La vista clásica de cumplimiento (`section=ens`) tiene que listar TODOS los
 * controles del catálogo, contar cada requisito con los hechos que lo citan y
 * filtrar exactamente los mismos hechos que cuenta.
 *
 * Hasta el 07/10/2026 contaba y filtraba por `data.control`, que solo envían
 * op.acc.1 y op.acc.2: los otros quince controles salían a 0. Y el catálogo de
 * requisitos que lee esa vista se quedó en tres controles porque la instalación
 * copiaba otro fichero.
 *
 *   npx --yes tsx tests/ens-requirement-index.test.ts
 */
import { ENSCatalog } from '../public/ens/catalog';
import { ensRequirementsFile } from '../public/ens-requirements';
import {
  buildENSRequirementFilter,
  buildENSRequirementQuery,
  countENSRequirements,
  ENS_REQUIREMENT_COUNT_AGGS,
  splitENSRequirementList,
} from '../public/ens/core/compliance-view/ens-requirement-index';

declare const process: { exit(code: number): void };

const fallos: string[] = [];

const comprueba = (nombre: string, condicion: boolean, detalle: unknown = ''): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle !== '' ? ` — ${String(detalle)}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

const cuenta = (lista: { key: string; doc_count: number }[], clave: string): number =>
  (lista.find(item => item.key === clave) || { doc_count: 0 }).doc_count;

bloque('el catálogo de la vista clásica es el del motor');
{
  const delCatalogo = new Set(ENSCatalog.flatMap(control => control.requirements.map(r => r.id)));
  const delFichero = new Set(Object.keys(ensRequirementsFile));
  const faltan = [...delCatalogo].filter(id => !delFichero.has(id));
  const sobran = [...delFichero].filter(id => !delCatalogo.has(id));

  comprueba('ningún requisito del catálogo falta en ens-requirements.ts', faltan.length === 0, faltan.join(', '));
  comprueba('ens-requirements.ts no trae requisitos que el catálogo no tiene', sobran.length === 0, sobran.join(', '));

  // La vista agrupa por las tres primeras partes del id: cada control tiene
  // que salir en la columna de la izquierda.
  const grupos = new Set([...delFichero].map(id => id.split('.').slice(0, 3).join('.')));
  const controles = ENSCatalog.map(control => control.id);

  comprueba(
    `los ${controles.length} controles salen en la columna de controles`,
    controles.every(id => grupos.has(id)) && grupos.size === controles.length,
    [...grupos].join(', ')
  );
  comprueba('ninguna descripción vacía', Object.values(ensRequirementsFile).every(texto => String(texto).trim().length > 0));
}

bloque('recuentos: cada hecho cuenta por su lista, sus evidencias o su control');
{
  // Cubos reales de wazuh4 (07/10/2026, últimas 24 h), más un hecho antiguo
  // de puntuación que solo trae `data.control`.
  const agregaciones = {
    ens_requisito: {
      buckets: [
        { key: 'op.acc.3.1,op.acc.3.2,op.acc.3.r1.1,op.acc.3.r1.2', doc_count: 878 },
        { key: 'op.exp.10.1', doc_count: 607 },
        { key: 'op.exp.8.1', doc_count: 498 },
        { key: 'op.exp.8.1,op.exp.8.2', doc_count: 288 },
        { key: 'op.exp.7.1,op.exp.7.2,op.exp.7.r1.1,op.exp.7.r2.1,op.exp.7.r2.2,op.exp.7.r2.3,op.exp.7.r2.4', doc_count: 192 },
        { key: 'op.acc.2.r1.2', doc_count: 294 },
        { key: ' op.exp.1.1 , op.exp.1.r4.1 ,op.exp.1.1', doc_count: 5 },
      ],
    },
    // Hechos sin lista de requisitos pero con evidencias (mp.info.6 real:
    // backup_run es EV-01; backup_access, EV-04; evidence_state de EV-05).
    ens_evidencia: {
      control: {
        buckets: [
          {
            key: 'mp.info.6',
            evidencia: {
              buckets: [
                { key: 'EV-01', doc_count: 40 },
                { key: 'EV-04', doc_count: 276 },
                { key: 'EV-01,EV-02', doc_count: 3 },
                { key: 'EV-99', doc_count: 7 },
              ],
            },
          },
          { key: 'control-que-no-existe', evidencia: { buckets: [{ key: 'EV-01', doc_count: 9 }] } },
        ],
      },
    },
    ens_control: {
      control: {
        buckets: [
          { key: 'op.acc.1.1', doc_count: 31 },
          { key: 'op.acc.1', doc_count: 93 },
          { key: 'op.acc.2.r1.2', doc_count: 24 },
        ],
      },
    },
  };
  const lista = countENSRequirements(agregaciones);

  comprueba('op.acc.3.1 por la lista de cuatro', cuenta(lista, 'op.acc.3.1') === 878);
  comprueba('op.exp.8.1 suma sus dos combinaciones (498 + 288)', cuenta(lista, 'op.exp.8.1') === 786);
  comprueba('op.exp.8.2 solo la combinación que lo cita', cuenta(lista, 'op.exp.8.2') === 288);
  comprueba('op.exp.7.r2.4 al final de la lista', cuenta(lista, 'op.exp.7.r2.4') === 192);
  comprueba('op.exp.10.1 no se confunde con op.exp.1', cuenta(lista, 'op.exp.1.1') === 5 && cuenta(lista, 'op.exp.10.1') === 607);
  comprueba('espacios y repetidos dentro de la lista no cuentan doble', cuenta(lista, 'op.exp.1.1') === 5 && cuenta(lista, 'op.exp.1.r4.1') === 5);
  comprueba('el hecho antiguo cuenta por data.control', cuenta(lista, 'op.acc.1.1') === 31);
  comprueba('lista y data.control se suman en el mismo requisito', cuenta(lista, 'op.acc.2.r1.2') === 294 + 24);
  comprueba('sin agregaciones, lista vacía', countENSRequirements(undefined).length === 0 && countENSRequirements({}).length === 0);
  // EV-01 de mp.info.6 sirve a mp.info.6.1 y mp.info.6.2.a; EV-02, a las
  // dos también; EV-04, a mp.info.6.2.d.
  comprueba('EV-01 cuenta para sus dos requisitos', cuenta(lista, 'mp.info.6.2.a') === 43);
  comprueba('EV-01,EV-02 cuenta una vez por requisito, no dos', cuenta(lista, 'mp.info.6.1') === 43);
  comprueba('EV-04 cuenta para mp.info.6.2.d', cuenta(lista, 'mp.info.6.2.d') === 276);
  comprueba('una evidencia que el catálogo no tiene no cuenta', !lista.some(item => item.doc_count === 7));
  comprueba('un control que el catálogo no tiene no cuenta', !lista.some(item => item.doc_count === 9));
  comprueba(
    'las evidencias solo cuentan en los hechos SIN data.requisito',
    JSON.stringify(ENS_REQUIREMENT_COUNT_AGGS.ens_evidencia.filter) ===
      JSON.stringify({ bool: { must: [{ exists: { field: 'data.evidence_id' } }], must_not: [{ exists: { field: 'data.requisito' } }] } })
  );
  comprueba(
    'data.control solo en los hechos sin requisito NI evidencia',
    JSON.stringify(ENS_REQUIREMENT_COUNT_AGGS.ens_control.filter) ===
      JSON.stringify({ bool: { must_not: [{ exists: { field: 'data.requisito' } }, { exists: { field: 'data.evidence_id' } }] } })
  );
  comprueba('trocear la lista', JSON.stringify(splitENSRequirementList('a, b,,a ')) === '["a","b"]');
}

bloque('filtro: los mismos hechos que el recuento');
{
  // La expresión regular de OpenSearch va anclada al valor entero; aquí se
  // reproduce con ^…$ sobre su misma sintaxis (sin operadores especiales).
  const q = buildENSRequirementQuery('op.exp.1.1') as any;
  const patron = q.bool.should[0].regexp['data.requisito'] as string;
  const re = new RegExp(`^${patron}$`);

  comprueba('casa solo', re.test('op.exp.1.1'));
  comprueba('casa al principio de la lista', re.test('op.exp.1.1,op.exp.1.r4.1'));
  comprueba('casa al final de la lista', re.test('op.exp.1.r4.1,op.exp.1.1'));
  comprueba('casa en medio y con espacios', re.test('op.exp.1.r1.1, op.exp.1.1 ,op.exp.1.r4.1'));
  comprueba('no casa op.exp.1.10', !re.test('op.exp.1.10'));
  comprueba('no casa op.exp.10.1', !re.test('op.exp.10.1'));
  comprueba('no casa op.exp.1.1 con prefijo', !re.test('xop.exp.1.1'));
  comprueba('el punto va escapado (no casa op-exp-1-1)', !re.test('op-exp-1-1'));

  const porEvidencia = q.bool.should[1].bool;
  const reEv = new RegExp(`^${porEvidencia.must[1].regexp['data.evidence_id']}$`);

  comprueba('por evidencia: solo los hechos de su control', porEvidencia.must[0].term['data.ensfacil'] === 'op.exp.1');
  comprueba('por evidencia: las del catálogo (de EV-01 a EV-07 en op.exp.1.1)', reEv.test('EV-01') && reEv.test('EV-07') && reEv.test('EV-03,EV-07'));
  comprueba('por evidencia: no casa EV-010, EV-1 ni EV-08', !reEv.test('EV-010') && !reEv.test('EV-1') && !reEv.test('EV-08'));
  comprueba('por evidencia: solo sin data.requisito', porEvidencia.must_not[0].exists.field === 'data.requisito');

  const antiguo = q.bool.should[2].bool;

  comprueba('data.control solo sin requisito ni evidencia', antiguo.must[0].match_phrase['data.control'] === 'op.exp.1.1' && antiguo.must_not.length === 2);
  comprueba('basta con una de las tres', q.bool.minimum_should_match === 1);

  const sinEvidencias = buildENSRequirementQuery('op.acc.1.1') as any;
  const inventado = buildENSRequirementQuery('op.zzz.9.9') as any;

  comprueba('un requisito fuera del catálogo: lista y control, sin evidencias', inventado.bool.should.length === 2);
  comprueba('un requisito del catálogo lleva las tres vías', sinEvidencias.bool.should.length >= 2);

  const f = buildENSRequirementFilter('op.exp.1.1', { index: 'wazuh-alerts-*', controlledBy: 'x' }) as any;

  comprueba('filtro custom con la misma consulta', f.meta.type === 'custom' && JSON.stringify(f.query) === JSON.stringify(q));
  comprueba('el filtro lleva lo que pide la pantalla', f.meta.index === 'wazuh-alerts-*' && f.meta.controlledBy === 'x');
  comprueba('el filtro se lee en la barra', f.meta.alias === 'ENS op.exp.1.1');
}

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
