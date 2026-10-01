import React, { useEffect, useMemo, useState } from 'react';
import { useRouterSearch } from '../../../common/hooks';
import { useEsSearch } from '../../../common/hooks/use-es-search';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldSearch,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENSControls } from '../data';
import { getActiveENSConfiguration } from '../configuration/services';
import {
  buildENSEvaluationTimeRangeFilter,
  getENSComplianceResultByControl,
  normalizeWazuhAlerts,
} from '../core';
// Del fichero de tipos, nunca del barrel `../core`: `import type` se borra
// entero al compilar y no añade ninguna arista al grafo de módulos (el ciclo
// transitivo del TDZ de `Settings` vive justo ahí).
import type {
  ENSGapCause,
  ENSObservationGroup,
} from '../core/evaluation/types';
import {
  buildENSScopeAgentQueryFilter,
  getActiveENSScopeAgents,
} from '../core/scope';
import {
  compareENSIds,
  filterByENSPrefix,
  listENSFamilies,
  resolveENSSectionOpenState,
} from '../control-filter/prefix';
// La misma celda plegable que la ficha del control, y por la misma razón: el
// motivo de una evidencia puede ser una línea o doscientas palabras enumerando
// desviaciones. Se pliega, no se recorta.
import { MotiveCell } from '../controls/control-detail/motive-cell';
import type { MotivoLinea } from '../controls/control-detail/motive-cell';
import {
  etiquetaDeMaquinas,
  resumirMotivos,
} from '../controls/control-detail/general-view';

// Una fila de la tabla de evidencias. Sin la columna `control`: el control lo
// dice la cabecera de la sección que la contiene, y repetirlo en cada fila
// gastaba ancho sin decir nada nuevo.
interface EvidenceRow {
  evidenceId: string;
  category: string;
  description: string;

  // Listas, no cadenas ya unidas por comas: se pintan como badges, y un badge
  // por requisito se cuenta de un vistazo donde «op.acc.1.2, op.acc.1.3,
  // op.acc.1.4» hay que leerlo entero.
  requirements: string[];
  levels: string[];
  ruleIds: string[];

  status: string;

  // DE QUIÉN ES EL HUECO cuando el estado es NO_EVALUABLE. Sin esto,
  // «NO_EVALUABLE» dice que resta pero no a quién le toca arreglarlo, que es la
  // otra mitad del veredicto: COLLECTION lo arregla quien opera Wazuh,
  // CONFIGURATION quien configura ENSFácil, CATALOG el producto y EVIDENCE
  // quien mantiene el productor de la evidencia.
  //
  // No sale de la evidencia: `ENSEvidenceResolved.gapCause` existe, pero el
  // motor no lo copia a `ENSEvidenceResult`. Sale de la no conformidad que
  // NOMBRA a esta evidencia en `evidenceIds`, que es el mismo dato y ya llega
  // aquí. Lista, no valor único: si dos no conformidades la nombran con causas
  // distintas se enseñan las dos, en vez de quedarse con la primera.
  gapCauses: ENSGapCause[];

  lastValidation: string;
  agent: string;

  // El POR QUÉ de la evidencia, que hasta ahora se quedaba en el motor: qué
  // cuenta concreta incumple, qué parámetro falta, por qué un gris es un gris
  // justificado. `gapCauses` dice DE QUIÉN es el hueco; esto dice CUÁL es. Se
  // enseña plegado porque puede ser una línea o doscientas palabras.
  observations: string[];

  // Los mismos motivos sin aplanar, con las máquinas de cada uno. Solo los
  // rellena la consolidación entre agentes; con un agente seleccionado va vacío
  // y manda `observations`.
  observationGroups: ENSObservationGroup[];

  // Se conserva para no perderla nunca: si el motivo no la trae (no debería,
  // el motor la anexa siempre), se le añade al pie.
  auditQuestion: string;
}

// Las evidencias de UN control, con lo que hace falta para pintar su cabecera
// sin abrirla.
interface ControlEvidenceGroup {
  controlId: string;
  title: string;

  // Identificadores por los que esta sección responde al filtro: el del control
  // y los de sus requisitos, que viven en el mismo espacio jerárquico
  // (`op.acc.1` y `op.acc.1.2`). Así «op.acc.1.2» encuentra el control que
  // declara ese requisito en vez de no encontrar nada.
  filterableIds: string[];

  rows: EvidenceRow[];

  // Si el motor ha llegado a pronunciarse. Un control sin resultado NO se
  // esconde: sale con su cabecera y lo dice, porque desaparecer de la lista se
  // lee igual que no tener nada que declarar.
  hasResult: boolean;

  // Los recuentos viajan SEPARADOS y no se suman nunca en un solo número de
  // "hallazgos". `failing` y `partial` son incumplimientos demostrados;
  // `unmeasured` es lo que no se ha podido medir, que no es un incumplimiento.
  // Es la misma distinción que la pestaña Controles hace entre el número en
  // rojo y «sin medir», y fundirlas aquí la desharía.
  passing: number;
  failing: number;
  partial: number;
  unmeasured: number;
  notApplicable: number;
}

// El color de una evidencia es su ESTADO, con el mismo criterio que la pestaña
// Controles: si el mismo veredicto se pinta distinto en dos pantallas, el
// auditor deja de fiarse de las dos.
const colorDeEstado = (estado: string): string => {
  if (estado === 'CUMPLE') {
    return 'success';
  }

  if (estado === 'PARCIAL') {
    return 'warning';
  }

  if (estado === 'NO_CUMPLE') {
    return 'danger';
  }

  if (estado === 'NO_APLICA') {
    return 'hollow';
  }

  return 'default';
};

// NO_EVALUABLE lleva icono y NO_APLICA no, porque los dos son grises y no son
// lo mismo: uno resta y el otro es la única salida del denominador. Con el
// color solo, se confunden.
const iconoDeEstado = (estado: string): string | undefined =>
  estado === 'NO_EVALUABLE' ? 'questionInCircle' : undefined;

const EstadoBadge = ({ estado }: { estado: string }) => (
  <EuiBadge color={colorDeEstado(estado)} iconType={iconoDeEstado(estado)}>
    {estado}
  </EuiBadge>
);

// La leyenda sustituye al párrafo que explicaba en prosa por qué un gris resta
// igual que un rojo. Mismo dato, en badges: lo que importa es que se siga
// VIENDO que NO_CUMPLE y NO_EVALUABLE puntúan igual y se arreglan al revés.
const LEYENDA_ESTADOS: { estado: string; glosa: string }[] = [
  { estado: 'CUMPLE', glosa: 'demostrado' },
  { estado: 'NO_CUMPLE', glosa: 'medido · resta · se corrige la máquina' },
  { estado: 'PARCIAL', glosa: 'conforma en parte · resta' },
  {
    estado: 'NO_EVALUABLE',
    glosa: 'no demostrado · resta igual · se habilita la prueba',
  },
  { estado: 'NO_APLICA', glosa: 'fuera del nivel activo · no resta' },
];

const LeyendaEstados = () => (
  <EuiFlexGroup gutterSize='m' alignItems='center' wrap responsive={false}>
    {LEYENDA_ESTADOS.map(({ estado, glosa }) => (
      <EuiFlexItem grow={false} key={estado}>
        <EuiFlexGroup gutterSize='xs' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            <EstadoBadge estado={estado} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              {glosa}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

// La causa del NO_EVALUABLE, con QUIÉN la arregla. El código va visible y la
// glosa dice el destinatario, que es para lo que sirve la causa: COLLECTION no
// es un hallazgo sobre la máquina auditada, es que la recogida no funciona.
const CAUSAS: ENSGapCause[] = [
  'COLLECTION',
  'CONFIGURATION',
  'CATALOG',
  'EVIDENCE',
];

const GLOSA_CAUSA: Record<ENSGapCause, string> = {
  COLLECTION: 'no llegó nada · agente o recolector',
  CONFIGURATION: 'falta parámetro · pestaña Configuración',
  CATALOG: 'no declarado · producto',
  EVIDENCE: 'llegó incompleta · productor de la evidencia',
};

const CausaBadge = ({ causa }: { causa: ENSGapCause }) => (
  <EuiBadge color='hollow' title={GLOSA_CAUSA[causa]}>
    {causa}
  </EuiBadge>
);

// Solo se pinta si hay algún NO_EVALUABLE en pantalla: enseñar el vocabulario
// de un estado que no sale es la clase de texto que sobra.
const LeyendaCausas = () => (
  <EuiFlexGroup gutterSize='m' alignItems='center' wrap responsive={false}>
    <EuiFlexItem grow={false}>
      <EuiText size='xs' color='subdued'>
        Causa del NO_EVALUABLE
      </EuiText>
    </EuiFlexItem>
    {CAUSAS.map(causa => (
      <EuiFlexItem grow={false} key={causa}>
        <EuiFlexGroup gutterSize='xs' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            <CausaBadge causa={causa} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              {GLOSA_CAUSA[causa]}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

// Una lista de identificadores como badges. Vacía se dice con un guion, no
// desapareciendo: una celda en blanco se lee como un fallo de pintado.
const ListaBadges = ({
  valores,
  color = 'hollow',
}: {
  valores: string[];
  color?: string;
}) => {
  if (!valores || valores.length === 0) {
    return (
      <EuiText size='xs' color='subdued'>
        —
      </EuiText>
    );
  }

  return (
    <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
      {valores.map(valor => (
        <EuiFlexItem grow={false} key={valor}>
          <EuiBadge color={color}>{valor}</EuiBadge>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

// La marca de tiempo, a minutos y en UTC. El ISO entero ocupa una columna que
// no cabe y los milisegundos no le dicen nada a nadie.
const fechaCorta = (iso: string): string => {
  if (!iso || iso === '-') {
    return '—';
  }

  const fecha = new Date(iso);

  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }

  return `${fecha.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

const PREFIJO_PREGUNTA = 'Pregunta de auditoría:';

// Las líneas del motivo, con la máquina delante cuando hay varias. Es lo mismo
// que hace la ficha del control, y por eso usa sus funciones: dos formatos
// distintos del mismo motivo en dos pantallas es la forma más barata de que
// parezcan dos datos.
const lineasDeMotivo = (
  row: EvidenceRow,
  totalMaquinas: number,
): { visibles: MotivoLinea[]; ocultos: number } => {
  let lineas: MotivoLinea[];
  let ocultos = 0;

  if (row.observationGroups.length > 0) {
    // Consolidando varios agentes: cada motivo dice en qué máquinas se observó.
    //
    // La pregunta de auditoría se saca ANTES del reparto. El motor la anexa al
    // motivo de todas las máquinas, así que sale agrupada con la flota entera y
    // `resumirMotivos` —que ordena por número de máquinas— la colocaba siempre
    // la primera: se comía uno de los tres huecos visibles y empujaba un motivo
    // de verdad al «y N más». Va al pie, que es donde `MotiveCell` la pone.
    const pregunta = row.observationGroups.find(grupo =>
      grupo.text.startsWith(PREFIJO_PREGUNTA),
    );

    const resumen = resumirMotivos(
      row.observationGroups.filter(
        grupo => !grupo.text.startsWith(PREFIJO_PREGUNTA),
      ),
    );

    ocultos = resumen.ocultos;
    lineas = resumen.visibles.map(grupo => ({
      texto: grupo.text,
      etiqueta: etiquetaDeMaquinas(grupo.agents, totalMaquinas),
    }));

    if (pregunta) {
      lineas.push({ texto: pregunta.text });
    }
  } else {
    // Un solo agente: el motivo ya viene sin prefijo de máquina.
    lineas = row.observations.map(texto => ({ texto }));
  }

  // La pregunta de auditoría no se pierde nunca. El motor la anexa al motivo en
  // todos los caminos, pero si algún día dejara de hacerlo, aquí se repone.
  const traePregunta = lineas.some(linea =>
    linea.texto.startsWith(PREFIJO_PREGUNTA),
  );

  return {
    visibles:
      traePregunta || !row.auditQuestion
        ? lineas
        : [...lineas, { texto: `${PREFIJO_PREGUNTA} ${row.auditQuestion}` }],
    ocultos,
  };
};

// `totalMaquinas` entra por parámetro porque la etiqueta «(todas)» del motivo
// depende de cuántas hay en el scope, y eso solo se sabe en tiempo de render.
const buildColumns = (totalMaquinas: number) => [
  {
    field: 'evidenceId',
    name: 'ID',
    render: (value: string) => <EuiBadge color='primary'>{value}</EuiBadge>,
  },
  // El veredicto, pegado al identificador: es lo que se viene a mirar, y al
  // final de nueve columnas obligaba a barrer la fila entera para encontrarlo.
  {
    field: 'status',
    name: 'Estado',
    render: (value: string, item: EvidenceRow) => (
      <EuiFlexGroup
        gutterSize='xs'
        direction='column'
        alignItems='flexStart'
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          <EstadoBadge estado={value} />
        </EuiFlexItem>
        {/* Debajo del veredicto y no en otra columna: la causa no se lee sin
            él —solo significa algo sobre un NO_EVALUABLE— y separarlas obliga
            a cruzar la fila para saber a quién le toca el arreglo. */}
        {item.gapCauses.map(causa => (
          <EuiFlexItem grow={false} key={causa}>
            <CausaBadge causa={causa} />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    ),
  },
  // DIEZ COLUMNAS NO CABÍAN. Con Nivel, Categoría, Última validación y Agente
  // como columnas propias, la tabla se salía de la pantalla y la última —el
  // Motivo, que es la que dice POR QUÉ la evidencia está como está— quedaba
  // recortada a media palabra. Eran cuatro datos de ficha, no de comparación:
  // nadie recorre la tabla en vertical buscando la categoría.
  //
  // Ahora acompañan a la descripción en una línea gris debajo, y «Agente»
  // desaparece: en la vista consolidada valía «—» en todas las filas.
  {
    field: 'description',
    name: 'Descripción',
    render: (value: string, item: EvidenceRow) => (
      <>
        <EuiText size='xs'>{value}</EuiText>
        <EuiText size='xs' color='subdued'>
          {[
            item.category,
            item.levels.join(' · '),
            item.agent && item.agent !== '—' ? item.agent : '',
            fechaCorta(item.lastValidation),
          ]
            .filter(Boolean)
            .join(' · ')}
        </EuiText>
      </>
    ),
  },
  {
    field: 'requirements',
    name: 'Requisitos ENS',
    render: (value: string[]) => <ListaBadges valores={value} />,
  },
  // Trazabilidad: de aquí sale el salto al evento crudo. Como badges siguen
  // siendo los mismos ids, y se distinguen cuando son varios.
  {
    field: 'ruleIds',
    name: 'Rule ID',
    render: (value: string[]) => <ListaBadges valores={value} />,
  },
  // Sustituye a la columna «Pregunta auditoría», que era la misma frase en
  // todas las filas de la misma evidencia. La pregunta no se ha ido: sale al
  // pie de esta celda, en gris, que es donde el auditor la busca. Lo que se
  // gana es el motivo, que antes no llegaba a esta pantalla.
  {
    field: 'observations',
    name: 'Motivo',
    render: (_value: string[], item: EvidenceRow) => {
      const { visibles, ocultos } = lineasDeMotivo(item, totalMaquinas);

      return (
          <MotiveCell
            lineas={visibles}
            ocultos={ocultos}
            titulo={`Motivo · ${item.evidenceId}`}
          />
        );
    },
  },
];

// Un recuento de la cabecera. Solo sale si es mayor que cero: un cero por cada
// estado en cada control es ruido que tapa los que no lo son.
const Recuento = ({
  valor,
  color,
  etiqueta,
  icono,
}: {
  valor: number;
  color: string;
  etiqueta: string;
  icono?: string;
}) =>
  valor > 0 ? (
    <EuiFlexItem grow={false}>
      <EuiBadge color={color} iconType={icono}>
        {valor} {etiqueta}
      </EuiBadge>
    </EuiFlexItem>
  ) : null;

// Cabecera plegable de un control: lo que se ve sin abrir la sección.
const ControlGroupHeader = ({ group }: { group: ControlEvidenceGroup }) => (
  <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false} wrap>
    <EuiFlexItem grow={false}>
      <EuiText size='s'>
        <strong>{group.controlId}</strong> — {group.title}
      </EuiText>
    </EuiFlexItem>

    <EuiFlexItem grow={false}>
      <EuiBadge color='hollow'>{group.rows.length} ev.</EuiBadge>
    </EuiFlexItem>

    <Recuento valor={group.passing} color='success' etiqueta='CUMPLE' />
    <Recuento valor={group.failing} color='danger' etiqueta='NO_CUMPLE' />
    <Recuento valor={group.partial} color='warning' etiqueta='PARCIAL' />
    {/* El mismo nombre que la leyenda, no «sin medir»: dos palabras para el
        mismo estado en la misma pantalla es como se pierde la confianza en
        que sean el mismo dato. */}
    <Recuento
      valor={group.unmeasured}
      color='default'
      etiqueta='NO_EVALUABLE'
      icono='questionInCircle'
    />
    <Recuento
      valor={group.notApplicable}
      color='hollow'
      etiqueta='NO_APLICA'
    />

    {!group.hasResult && (
      <EuiFlexItem grow={false}>
        <EuiBadge color='default' iconType='clock'>
          Sin datos en el periodo
        </EuiBadge>
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
);

export const EvidencesENS = () => {
  const { agentId } = useRouterSearch();
  const [refreshKey, setRefreshKey] = useState(0);

  // Filtro por prefijo del identificador ENS. Vacío = sin filtro = se ve todo.
  const [prefix, setPrefix] = useState<string>('');

  // Secciones que el operador ha abierto o cerrado a mano. Lo que no está aquí
  // usa el criterio por defecto (ver `isOpen`).
  const [openControlIds, setOpenControlIds] = useState<
    Record<string, boolean | undefined>
  >({});

  // Cambiar el filtro devuelve las secciones a su estado por defecto: si no, al
  // filtrar hasta un solo control seguiría cerrado el que se acaba de buscar
  // porque se cerró a mano tres búsquedas antes.
  const applyPrefix = (value: string) => {
    setPrefix(value);
    setOpenControlIds({});
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshKey(current => current + 1);
    }, 15000);

    return () => window.clearInterval(interval);
  }, []);

  const activeConfiguration = getActiveENSConfiguration();
  const ensLevel = activeConfiguration.global.ensLevel;
  const evaluationTimeFilter = buildENSEvaluationTimeRangeFilter(
    activeConfiguration.global.evaluationPeriod,
  );

  const scopeAgents = getActiveENSScopeAgents();

  const scopeAgentQueryFilter = buildENSScopeAgentQueryFilter(
    scopeAgents,
    agentId,
  );

  // La query trae eventos de todos los controles del scope activo.
  const allControlIds = useMemo(
    () => ENSControls.map(control => control.id),
    [],
  );

  const families = useMemo(
    () => listENSFamilies(allControlIds),
    [allControlIds],
  );

  const columns = useMemo(
    () => buildColumns(scopeAgents.length),
    [scopeAgents.length],
  );

  const { esResults } = useEsSearch({
    preAppliedFilters: [
      evaluationTimeFilter,
      scopeAgentQueryFilter,
      {
        bool: {
          should: allControlIds.flatMap(controlId => [
            { match_phrase: { 'data.ensfacil': controlId } },
            { match_phrase: { 'data.control': controlId } },
            { match_phrase: { 'rule.groups': `ENS_${controlId}` } },
          ]),
          minimum_should_match: 1,
        },
      },
    ],
    // Mismo tope y mismo orden que el panel y el detalle: los 10.000 hechos
    // MÁS RECIENTES. Sin orden, el índice devuelve primero los más antiguos.
    size: 10000,
    sorting: [{ timestamp: { order: 'desc' } }],
    refreshKey,
  });

  const hits = esResults?.hits?.hits || [];

  // Se evalúan SIEMPRE todos los controles, también los que el filtro deja
  // fuera. Es lo que permite decir «8 de 24 evidencias» y avisar de lo que se
  // está escondiendo: si solo se evaluara lo filtrado, el denominador sería el
  // propio filtro y la pantalla no podría contradecirse a sí misma.
  const groups: ControlEvidenceGroup[] = useMemo(() => {
    const normalizedEvents = normalizeWazuhAlerts(hits);

    return ENSControls.map(control => {
      const complianceResult = getENSComplianceResultByControl(
        control.id,
        ensLevel,
        normalizedEvents,
        agentId,
        scopeAgents,
      );

      const evidences = complianceResult?.evidences || [];

      const countByStatus = (status: string) =>
        evidences.filter(evidence => evidence.status === status).length;

      // La causa del hueco, por evidencia. Cada no conformidad NO_EVIDENCIADA
      // nombra en `evidenceIds` exactamente las evidencias por las que su
      // requisito no se ha podido demostrar, así que atribuirles su `cause` es
      // repetir lo que la propia tarjeta afirma, no deducirlo.
      const causasPorEvidencia = new Map<string, ENSGapCause[]>();

      (complianceResult?.nonConformities || []).forEach(nonConformity => {
        const causa = nonConformity.cause;

        if (nonConformity.origin !== 'NO_EVIDENCIADA' || !causa) {
          return;
        }

        (nonConformity.evidenceIds || []).forEach(evidenceId => {
          const acumuladas = causasPorEvidencia.get(evidenceId) || [];

          if (!acumuladas.includes(causa)) {
            causasPorEvidencia.set(evidenceId, [...acumuladas, causa]);
          }
        });
      });

      return {
        controlId: control.id,
        title: control.title,
        filterableIds: [
          control.id,
          ...control.requirements.map(requirement => requirement.id),
        ],
        rows: evidences.map(evidence => ({
          evidenceId: evidence.id,
          category: evidence.category,
          description: evidence.description,
          requirements: evidence.requirements || [],
          levels: evidence.levels || [],
          ruleIds: evidence.relatedRules || [],
          status: evidence.status,
          // Solo sobre un NO_EVALUABLE: en cualquier otro estado no hay hueco
          // del que hablar, y colgarle una causa al de al lado sería señalar a
          // la evidencia equivocada.
          gapCauses:
            evidence.status === 'NO_EVALUABLE'
              ? causasPorEvidencia.get(evidence.id) || []
              : [],
          lastValidation: evidence.lastSeen || '-',
          agent: evidence.agentName || evidence.agentId || '—',
          observations: evidence.observations || [],
          observationGroups: evidence.observationGroups || [],
          auditQuestion: evidence.auditQuestion,
        })),
        hasResult: !!complianceResult,
        passing: countByStatus('CUMPLE'),
        failing: countByStatus('NO_CUMPLE'),
        partial: countByStatus('PARCIAL'),
        unmeasured: countByStatus('NO_EVALUABLE'),
        notApplicable: countByStatus('NO_APLICA'),
      };
    }).sort((a, b) => compareENSIds(a.controlId, b.controlId));
  }, [hits, ensLevel, agentId, scopeAgents]);

  const filtered = useMemo(
    () => filterByENSPrefix(groups, prefix, group => group.filterableIds),
    [groups, prefix],
  );

  const countEvidences = (list: ControlEvidenceGroup[]) =>
    list.reduce((total, group) => total + group.rows.length, 0);

  const shownEvidences = countEvidences(filtered.matched);
  const totalEvidences = countEvidences(groups);

  // Lo que el filtro esconde, contado por tipo y NUNCA sumado en uno solo.
  const hiddenFailing = filtered.hidden.reduce(
    (total, group) => total + group.failing + group.partial,
    0,
  );

  const hiddenUnmeasured = filtered.hidden.reduce(
    (total, group) => total + group.unmeasured,
    0,
  );

  // El vocabulario de las causas solo se enseña si hay algún NO_EVALUABLE que
  // lo use: una leyenda de códigos que no salen en la tabla es texto de más.
  const hayNoEvaluables = groups.some(group => group.unmeasured > 0);

  const isOpen = (controlId: string): boolean =>
    resolveENSSectionOpenState(
      openControlIds,
      controlId,
      filtered.matched.length,
    );

  const toggleControl = (controlId: string, nextIsOpen: boolean) =>
    setOpenControlIds(current => ({
      ...current,
      [controlId]: nextIsOpen,
    }));

  return (
    <EuiPanel paddingSize='l'>
      <EuiTitle size='s'>
        <h2>Repositorio de Evidencias ENS</h2>
      </EuiTitle>

      {/* Sin subtítulo: «evidencias resueltas por el motor desde eventos de
          Wazuh, agrupadas por control» es lo que ya dicen el título, los
          acordeones y las columnas Rule ID y Última validación. */}
      <EuiSpacer size='s' />

      {/* EL VOCABULARIO, PLEGADO. Ocupaba dos renglones de insignias encima de
          todo, se leía una vez y estorbaba siempre. Sigue estando —un auditor
          que no conoce el producto lo necesita— pero a un clic. */}
      <EuiAccordion
        id='leyenda-evidencias'
        buttonContent={
          <EuiText size='xs' color='subdued'>
            Qué significa cada estado
          </EuiText>
        }
        paddingSize='s'
      >
        <LeyendaEstados />

        {hayNoEvaluables && (
          <>
            <EuiSpacer size='xs' />
            <LeyendaCausas />
          </>
        )}
      </EuiAccordion>

      <EuiSpacer size='m' />

      <EuiFlexGroup gutterSize='m' alignItems='center' wrap>
        <EuiFlexItem grow={false}>
          <EuiFilterGroup>
            <EuiFilterButton
              hasActiveFilters={!filtered.isActive}
              onClick={() => applyPrefix('')}
            >
              Todos
            </EuiFilterButton>
            {/* Atajos por familia, no por control: las familias crecen mucho
                más despacio que los controles y la barra sigue cabiendo. */}
            {families.map(family => (
              <EuiFilterButton
                key={family}
                hasActiveFilters={filtered.query === family}
                onClick={() => applyPrefix(family)}
              >
                {family}
              </EuiFilterButton>
            ))}
          </EuiFilterGroup>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiFieldSearch
            fullWidth
            incremental
            isClearable
            placeholder='Filtrar por prefijo: op.acc, op.acc.1, op.acc.1.2…'
            aria-label='Filtrar controles por prefijo del identificador ENS'
            value={prefix}
            onChange={(event: { target: { value: string } }) =>
              applyPrefix(event.target.value)
            }
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size='s' />

      <EuiFlexGroup gutterSize='s' alignItems='center' wrap responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiBadge color='hollow'>
            {filtered.isActive
              ? `${filtered.matched.length} de ${groups.length} controles`
              : `${groups.length} controles`}
          </EuiBadge>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiBadge color='hollow'>
            {filtered.isActive
              ? `${shownEvidences} de ${totalEvidences} evidencias`
              : `${totalEvidences} evidencias`}
          </EuiBadge>
        </EuiFlexItem>

        {filtered.isActive && (
          <EuiFlexItem grow={false}>
            <EuiBadge color='accent'>Filtro: {filtered.query}</EuiBadge>
          </EuiFlexItem>
        )}

        {filtered.isActive && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size='xs'
              iconType='cross'
              onClick={() => applyPrefix('')}
            >
              Quitar filtro
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {/* Un filtro que esconde un incumplimiento sin decirlo es como se pierde
          una no conformidad: el panel se ve corto y se lee como «no hay nada».
          Los dos recuentos van por separado y NUNCA sumados: restan igual, pero
          uno se corrige en la máquina y el otro habilitando la prueba. */}
      {filtered.isActive && (hiddenFailing > 0 || hiddenUnmeasured > 0) && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut
            size='s'
            color={hiddenFailing > 0 ? 'danger' : 'primary'}
            iconType={hiddenFailing > 0 ? 'alert' : 'iInCircle'}
            title={`Fuera del filtro «${filtered.query}»`}
          >
            <EuiFlexGroup
              gutterSize='s'
              alignItems='center'
              wrap
              responsive={false}
            >
              <Recuento
                valor={hiddenFailing}
                color='danger'
                etiqueta='NO_CUMPLE o PARCIAL'
              />
              <Recuento
                valor={hiddenUnmeasured}
                color='default'
                etiqueta='NO_EVALUABLE'
                icono='questionInCircle'
              />
            </EuiFlexGroup>
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size='m' />

      {filtered.matched.length === 0 ? (
        <EuiCallOut
          size='s'
          color='warning'
          iconType='search'
          title={`Ningún control coincide con «${filtered.query}»`}
        >
          <EuiText size='xs'>
            <p>
              Sin filtro: {groups.length} controles, {totalEvidences}{' '}
              evidencias.
            </p>
          </EuiText>
          <EuiButtonEmpty
            size='s'
            iconType='cross'
            onClick={() => applyPrefix('')}
          >
            Quitar filtro
          </EuiButtonEmpty>
        </EuiCallOut>
      ) : (
        filtered.matched.map(group => (
          <React.Fragment key={group.controlId}>
            <EuiAccordion
              id={`ens-evidencias-${group.controlId.replace(/\./g, '-')}`}
              buttonContent={<ControlGroupHeader group={group} />}
              forceState={isOpen(group.controlId) ? 'open' : 'closed'}
              onToggle={(nextIsOpen: boolean) =>
                toggleControl(group.controlId, nextIsOpen)
              }
              paddingSize='s'
            >
              {group.rows.length > 0 ? (
                <EuiBasicTable items={group.rows} columns={columns} />
              ) : (
                // Aquí decía «No es un incumplimiento: no ha llegado el dato»,
                // y desde el 04/08 eso es FALSO: lo no demostrado no cumple, y
                // la falta de dato cuenta en contra igual. Contradecía a la
                // leyenda de esta misma pantalla —NO_EVALUABLE «resta igual»—
                // justo en el sitio donde el auditor busca la excusa. El badge
                // dice lo que se sabe; el porqué está en el motivo de cada
                // evidencia, y aquí no hay ninguna.
                <EuiBadge color='default' iconType='clock'>
                  Sin evidencias resueltas en el periodo
                </EuiBadge>
              )}
            </EuiAccordion>
            <EuiSpacer size='s' />
          </React.Fragment>
        ))
      )}
    </EuiPanel>
  );
};
