// El filtro con el que el panel lee los hechos de TODOS los controles.
//
// Vive aparte para que lo use también el informe que recopila el de todos los
// controles (op.mon.2, el sistema de métricas): si cada pantalla escribiera su
// propio filtro, el panel y ese informe juzgarían conjuntos distintos de hechos
// sin que nada lo dijera.
//
// Admite las tres formas en que llega un hecho de ENSFácil: el campo
// `data.ensfacil` de los recolectores actuales, `data.control` y
// `data.evidence_id` de los antiguos, y los grupos de regla `ENS` y
// `ENS_<control>`.
export const buildENSAllControlsFactsFilter = (controlIds: string[]) => {
  const ensRuleGroups = controlIds.map(controlId => `ENS_${controlId}`);

  return {
    bool: {
      should: [
        { exists: { field: 'data.ensfacil' } },
        { exists: { field: 'data.control' } },
        { exists: { field: 'data.evidence_id' } },
        { match_phrase: { 'rule.groups': 'ENS' } },
        ...ensRuleGroups.map(group => ({
          match_phrase: { 'rule.groups': group },
        })),
        ...controlIds.flatMap(controlId => [
          { match_phrase: { 'data.control': controlId } },
          { match_phrase: { 'data.ensfacil': controlId } },
        ]),
      ],
      minimum_should_match: 1,
    },
  };
};

// El tope de hechos que leen el panel, el detalle y los informes: los 10.000
// MÁS RECIENTES (`index.max_result_window` por defecto de OpenSearch).
export const ENS_FACTS_QUERY_LIMIT = 10000;

// Los campos por los que un hecho dice de qué control es, en el orden en que
// los lee el normalizador (`data-source-engine.ts`): el primero que trae manda.
export const ENS_CONTROL_ID_FIELDS = ['data.ensfacil', 'data.ens', 'data.control_id', 'data.control'];

// Los hechos de UN control: los que lo nombran en cualquiera de esos campos.
// Es el filtro de la ficha del control; el servidor lee así cada control.
export const buildENSControlFactsFilter = (controlId: string) => ({
  bool: {
    should: ENS_CONTROL_ID_FIELDS.map(field => ({ match_phrase: { [field]: controlId } })),
    minimum_should_match: 1,
  },
});

// Los hechos que no nombran ningún control: el filtro de todos los controles
// los admite (por los grupos de regla o por `data.evidence_id`) y el motor los
// considera de todos (`resolveEvidenceForControl` acepta los que no traen
// control). El servidor los lee aparte y se los da a cada control.
export const buildENSFactsWithoutControlFilter = () => ({
  bool: {
    must_not: ENS_CONTROL_ID_FIELDS.map(field => ({ exists: { field } })),
  },
});
