// Recuentos y filtro por requisito para la vista clásica de cumplimiento de
// Wazuh (`section=ens`, la misma pantalla que PCI DSS o GDPR).
//
// POR QUÉ NO BASTA UN CAMPO.
//
// Esa vista cuenta los hechos de cada requisito con una agregación `terms` y,
// al pulsar uno, filtra los eventos con un `match_phrase` sobre el mismo campo.
// Hasta el 07/10/2026 el campo era `data.control`, que solo envían los hechos
// de puntuación antiguos de op.acc.1 y op.acc.2: quince controles salían con
// todos sus requisitos a 0 y el filtro no encontraba nada.
//
// Un hecho dice a qué requisitos sirve de una de tres maneras, y se mira la
// primera que traiga:
//
//   1. `data.requisito`, una LISTA separada por comas
//      («op.exp.7.1,op.exp.7.2,op.exp.7.r1.1»): cuenta para cada uno.
//   2. `data.evidence_id` (también lista: «EV-03,EV-05»), en los hechos del
//      modelo nuevo que no llevan requisito (casi todo mp.info.6): cuenta para
//      cada requisito que el catálogo asocia a esas evidencias de su control.
//   3. `data.control`, en los hechos antiguos que no traen ninguna de las dos.
//
// Cada hecho cuenta por UNA sola de las tres, así que no hay dobles, y el
// filtro de un requisito encuentra exactamente los hechos que cuenta.

import { ENSCatalog } from '../../catalog';

export interface ENSRequirementCount {
  key: string;
  doc_count: number;
}

const CAMPO_LISTA = 'data.requisito';
const CAMPO_EVIDENCIA = 'data.evidence_id';
const CAMPO_CONTROL_HECHO = 'data.ensfacil';
const CAMPO_ANTIGUO = 'data.control';

// Combinaciones distintas, no hechos: decenas o cientos hoy.
const MAX_LISTAS = 5000;
const MAX_CONTROLES = 100;
const MAX_EVIDENCIAS = 500;

const sinCampo = (campo: string) => ({ exists: { field: campo } });

export const ENS_REQUIREMENT_COUNT_AGGS = {
  ens_requisito: {
    terms: { field: CAMPO_LISTA, size: MAX_LISTAS },
  },
  ens_evidencia: {
    filter: {
      bool: {
        must: [sinCampo(CAMPO_EVIDENCIA)],
        must_not: [sinCampo(CAMPO_LISTA)],
      },
    },
    aggs: {
      control: {
        terms: { field: CAMPO_CONTROL_HECHO, size: MAX_CONTROLES },
        aggs: {
          evidencia: { terms: { field: CAMPO_EVIDENCIA, size: MAX_EVIDENCIAS } },
        },
      },
    },
  },
  ens_control: {
    filter: {
      bool: {
        must_not: [sinCampo(CAMPO_LISTA), sinCampo(CAMPO_EVIDENCIA)],
      },
    },
    aggs: {
      control: { terms: { field: CAMPO_ANTIGUO, size: MAX_LISTAS } },
    },
  },
};

export const splitENSRequirementList = (valor: unknown): string[] =>
  Array.from(
    new Set(
      String(valor ?? '')
        .split(',')
        .map(parte => parte.trim())
        .filter(Boolean)
    )
  );

// Del catálogo: requisitos de cada evidencia de cada control, y al revés.
const requisitosPorEvidencia = new Map<string, Map<string, string[]>>();
const evidenciasPorRequisito = new Map<string, { control: string; evidencias: string[] }>();

for (const control of ENSCatalog) {
  const porEvidencia = new Map<string, string[]>();

  for (const requisito of control.requirements) {
    const evidencias = (requisito as { evidenceIds?: string[] }).evidenceIds || [];

    evidenciasPorRequisito.set(requisito.id, { control: control.id, evidencias });

    for (const evidencia of evidencias) {
      porEvidencia.set(evidencia, [...(porEvidencia.get(evidencia) || []), requisito.id]);
    }
  }

  requisitosPorEvidencia.set(control.id, porEvidencia);
}

const suma = (totales: Map<string, number>, clave: string, n: unknown): void => {
  totales.set(clave, (totales.get(clave) || 0) + (Number(n) || 0));
};

export const countENSRequirements = (
  aggregations: any
): ENSRequirementCount[] => {
  const totales = new Map<string, number>();

  for (const cubo of aggregations?.ens_requisito?.buckets || []) {
    for (const requisito of splitENSRequirementList(cubo.key)) {
      suma(totales, requisito, cubo.doc_count);
    }
  }

  for (const cuboControl of aggregations?.ens_evidencia?.control?.buckets || []) {
    const porEvidencia = requisitosPorEvidencia.get(String(cuboControl.key ?? '').trim());

    if (!porEvidencia) {
      continue;
    }

    for (const cubo of cuboControl.evidencia?.buckets || []) {
      // Un hecho de «EV-01,EV-02» cuenta UNA vez para cada requisito al que
      // sirva cualquiera de las dos, aunque le sirvan ambas.
      const requisitos = new Set<string>();

      for (const evidencia of splitENSRequirementList(cubo.key)) {
        (porEvidencia.get(evidencia) || []).forEach(id => requisitos.add(id));
      }

      requisitos.forEach(id => suma(totales, id, cubo.doc_count));
    }
  }

  for (const cubo of aggregations?.ens_control?.control?.buckets || []) {
    const control = String(cubo.key ?? '').trim();

    if (control) {
      suma(totales, control, cubo.doc_count);
    }
  }

  return Array.from(totales, ([key, doc_count]) => ({ key, doc_count }));
};

// La expresión regular de OpenSearch va anclada al valor entero y trata como
// operadores, además de los habituales, `@ & < > ~ #`.
const escapaRegexp = (texto: string): string =>
  texto.replace(/[.?+*|{}[\]()"\\#@&<>~^$]/g, '\\$&');

// Un elemento de una lista separada por comas, con espacios alrededor o no.
const enLista = (alternativas: string[]): string =>
  `(.*,)? *(${alternativas.map(escapaRegexp).join('|')}) *(,.*)?`;

export const buildENSRequirementQuery = (requirementId: string) => {
  const id = String(requirementId ?? '').trim();
  const delCatalogo = evidenciasPorRequisito.get(id);
  const should: unknown[] = [{ regexp: { [CAMPO_LISTA]: enLista([id]) } }];

  if (delCatalogo && delCatalogo.evidencias.length) {
    should.push({
      bool: {
        must: [
          { term: { [CAMPO_CONTROL_HECHO]: delCatalogo.control } },
          { regexp: { [CAMPO_EVIDENCIA]: enLista(delCatalogo.evidencias) } },
        ],
        must_not: [sinCampo(CAMPO_LISTA)],
      },
    });
  }

  should.push({
    bool: {
      must: [{ match_phrase: { [CAMPO_ANTIGUO]: id } }],
      must_not: [sinCampo(CAMPO_LISTA), sinCampo(CAMPO_EVIDENCIA)],
    },
  });

  return { bool: { should, minimum_should_match: 1 } };
};

// Filtro de la barra de búsqueda para un requisito: `custom`, porque no es un
// campo igual a un valor. `meta` lleva lo que cada pantalla necesite (patrón
// de índice, quién lo controla).
export const buildENSRequirementFilter = (
  requirementId: string,
  meta: Record<string, unknown> = {}
) => {
  const query = buildENSRequirementQuery(requirementId);

  return {
    meta: {
      alias: `ENS ${String(requirementId ?? '').trim()}`,
      negate: false,
      disabled: false,
      type: 'custom',
      key: 'query',
      value: JSON.stringify(query),
      ...meta,
    },
    query,
    $state: { store: 'appState' },
  };
};
