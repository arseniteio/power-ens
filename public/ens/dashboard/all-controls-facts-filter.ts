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
