import { useActiveENSScopeAgents } from '../../scope/use-active-scope-agents';
import React, { useEffect, useMemo, useState } from 'react';
import { useEnsEvaluation } from '../../../evaluation/use-evaluation';
import { fetchTraceabilityPage } from '../../../evaluation/evaluation-client';
import { FactsReadErrorCallOut } from '../../../platform/facts-read-error-callout';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButtonIcon,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENSControl } from '../../types';
// Del fichero de tipos, nunca del barrel `../../core`: `import type` se borra
// entero al compilar, así que esto no añade ninguna arista al grafo de módulos
// (el ciclo transitivo del TDZ de `Settings` vive justo ahí).
import type { ENSObservationGroup } from '../../../../common/ens/core/evaluation/types';
// Cuánto se enseña de la vista general y cómo se nombran las máquinas. Es
// lógica pura y vive aparte para poder comprobarla sin `react` ni `@elastic/eui`.
import {
  describirAlcance,
  etiquetaDeMaquinas,
  etiquetaDeRequisitoQueCumple,
  resumirMotivos,
} from './general-view';
import { getActiveENSConfiguration } from '../../../../common/ens/configuration/services';
import { ControlEvolutionChart } from './evolution-chart';
import { MotiveCell } from './motive-cell';
import { NonConformityCard } from './nonconformity-card';
import type { MotivoLinea } from './motive-cell';
import type { ENSTraceabilityResult } from '../../../../common/ens/core/evaluation/types';
import type { ENSControlEvaluationResponse } from '../../../../common/ens/evaluation/types';
import { traceabilityPageSource } from '../../../evaluation/traceability-paging';
import { EvaluationLoading, EvaluationStatusLine } from '../../../evaluation/evaluation-status';

interface ControlDetailENSProps {
  control: ENSControl;
  agentId?: string;
  onBack: () => void;
}

const getBadgeColor = (status: string) => {
  if (status === 'CUMPLE') {
    return 'success';
  }
  if (status === 'PARCIAL') {
    return 'warning';
  }
  if (status === 'NO_CUMPLE') {
    return 'danger';
  }
  return 'default';
};

// Icono por estado de evidencia. La distinción que no se puede perder —medido y
// no conforme (`cross`) frente a no demostrado (`clock`)— se lee del icono sin
// leer el texto, y es la misma en la tabla de evidencias, en la lista de
// requisitos y en las tarjetas.
const getStatusIcon = (status: string) =>
  status === 'CUMPLE'
    ? 'check'
    : status === 'NO_CUMPLE'
    ? 'cross'
    : status === 'NO_EVALUABLE'
    ? 'clock'
    : 'minus';

const formatTraceabilityTimestamp = (timestamp?: string) => {
  if (!timestamp) {
    return undefined;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleString('es-ES');
};

export const ControlDetailENS = ({
   control,
   agentId,
   onBack,
 }: ControlDetailENSProps) => {
  const [tracePageIndex, setTracePageIndex] = useState(0);
  const [tracePageSize, setTracePageSize] = useState(10);
  const [expandedTraceIds, setExpandedTraceIds] = useState<string[]>([]);

  const scopeAgents = useActiveENSScopeAgents();

  // EL SERVIDOR EVALÚA EL CONTROL CON TODOS SUS HECHOS DE LA VENTANA. Hasta
  // 1.1.0 esta pantalla bajaba los 10.000 más recientes y avisaba si quedaban
  // fuera (op.acc.3 tenía 17.444 en 30 días): el porcentaje podía no cubrir la
  // ventana que decía cubrir. Ya no hay corte, así que no hay aviso que dar. La
  // serie de 30 días también viene calculada (los días pasados, una vez al día).
  const evaluacion = useEnsEvaluation<ENSControlEvaluationResponse>({
    include: 'control',
    controlId: control.id,
    agentId,
    timelineDays: 30,
  });
  const { error } = evaluacion;
  const ensLevel = evaluacion.data?.meta?.level || getActiveENSConfiguration().global.ensLevel;
  const complianceResult = evaluacion.data?.result;
  const traceabilityTotal = evaluacion.data?.traceabilityTotal || 0;

  // La serie diaria DE ESTE CONTROL: su último punto es el número de arriba.
  const controlTimeline = useMemo(
    () =>
      (evaluacion.data?.timeline || []).map(point => ({
        ...point,
        date: new Date(point.date),
      })),
    [evaluacion.data],
  );

  // Otra máquina u otro control: la tabla vuelve a la primera página.
  useEffect(() => {
    setTracePageIndex(0);
  }, [control.id, agentId]);

  const newestFact = evaluacion.data?.meta?.facts?.newest;
  const latestEvaluationDate = newestFact
    ? new Date(newestFact).toLocaleDateString('es-ES')
    : 'Sin datos';

  // Sobre cuántas máquinas se ha resumido la vista general. Solo existe
  // consolidando: con un agente seleccionado, la máquina es el contexto entero
  // de la pantalla y no hay nada que contar.
  const totalMaquinas = (complianceResult?.consolidatedAgents || []).length;

  const agenteNombre = agentId
    ? (scopeAgents.find(agent => agent.id === agentId)?.name ||
       ('Agente ' + agentId))
    // Decir cuántas máquinas hay detrás es lo que convierte «6 de ellas fallan»
    // en un dato: sin el total, un recuento no se puede leer.
    : totalMaquinas > 0
    ? `Todos los agentes (vista general · ${totalMaquinas} máquina${
        totalMaquinas === 1 ? '' : 's'
      })`
    : 'Todos los agentes (vista general)';

  const motorStatus = complianceResult?.status || 'NO_EVALUABLE';

  // Desde el 04/08 todo lo que aplica trae número. El único caso sin número es
  // el control que no rige en el nivel activo (o el que no está en el catálogo
  // del motor), y ahí sigue sin pintarse un "0 %" en rojo.
  const motorScore =
    typeof complianceResult?.score === 'number'
      ? complianceResult.score
      : undefined;

  const motorScoreTexto =
    motorScore !== undefined
      ? `${motorScore}%`
      : motorStatus === 'NO_APLICA'
      ? 'no aplica'
      : 'sin datos';

  const requisitosAplicables = complianceResult?.applicableRequirements ?? 0;

  // Requisitos que CUMPLEN, que es de donde sale el porcentaje. No se deduce
  // del `score`: un requisito PARCIAL ya no existe, pero uno NO_APLICA sí, y
  // dividir mal aquí produciría justo la contradicción que esta pantalla
  // acaba de dejar de tener.
  const requisitosCumplen = (complianceResult?.requirements || []).filter(
    (requisito: any) => requisito.status === 'CUMPLE'
  ).length;
  const requisitosMedidos = complianceResult?.measuredRequirements ?? 0;

  // EL DENOMINADOR TIENE QUE SER EL MISMO CONJUNTO QUE EL NUMERADOR.
  //
  // `applicableRequirements` viene sumado POR MÁQUINA cuando se consolidan
  // varias: con dos máquinas y ocho requisitos aplicables vale 16. Pero
  // `requisitosCumplen` cuenta sobre la lista CONSOLIDADA, que tiene ocho
  // entradas —una por requisito, con el peor estado—. «4 de 16» no era una
  // fracción: eran dos conjuntos distintos puestos uno al lado del otro.
  //
  // Se cuenta sobre la lista consolidada, igual que el numerador. Cuántas
  // máquinas hay detrás se dice en la cabecera, que es donde toca.
  const requisitosConsolidados = (complianceResult?.requirements || []).filter(
    (requisito: any) => requisito.status !== 'NO_APLICA'
  ).length;

  const esVistaAgregada = !agentId && totalMaquinas > 1;

  const requisitosDelDenominador = esVistaAgregada
    ? requisitosConsolidados
    : requisitosAplicables;

  const nivelesTexto = String(ensLevel);

  const evidenceStatusItems = (complianceResult?.evidences || []).map(evidence => ({
    id: evidence.id,
    title: evidence.description,
    requirement: evidence.requirements.join(', '),
    level: evidence.levels.join(', '),
    status: evidence.status,
    ruleId: evidence.relatedRules.join(', '),
    // El motivo que resolvió el motor: qué cuenta concreta incumple, qué
    // parámetro falta, por qué la cobertura del recolector no basta. Es lo
    // primero que pregunta quien ve una evidencia en gris o en rojo.
    //
    // Con un agente seleccionado se lee tal cual. En la vista general se lee de
    // `motivos`: ahí, concatenar el de las siete máquinas llenaba la celda de
    // quince líneas que decían casi lo mismo.
    motivo: (evidence.observations || []).join(' · '),
    motivos: evidence.observationGroups || [],
    // AQUÍ HABÍA UN CAMPO `impact` Y ERA UNA TABLA DE CONVERSIÓN.
    //
    // Se calculaba SOLO a partir de `status`, así que las ocho filas en gris
    // repetían palabra por palabra «Sin evidencia: no se ha podido demostrar, y
    // lo no demostrado cuenta como incumplimiento del control» en una columna
    // ancha, al lado de la insignia que ya pone NO_EVALUABLE con su reloj. Es
    // el caso de libro de explicar en prosa lo que la etiqueta ya dice, y se
    // comía el ancho de «Motivo», que es la única columna con dato por fila.
    //
    // La regla que enunciaba no se pierde: sigue en la línea de «No
    // conformidades ENS», en el pie del bloque de no evidenciadas y, literal
    // del motor, en el «Impacto ENS» de la ficha de cada tarjeta.
  }));

  // UNA sola lista y UN solo contador. Lo que hasta el 04/08 eran tarjetas `PM-`
  // en una lista propia son ahora no conformidades con `origin` a
  // NO_EVIDENCIADA: el veredicto es el mismo, así que el número también, y lo
  // que las distingue —el motivo y la acción— vive dentro de la tarjeta.
  //
  // `evidenceIds` y `parameterIds` viajan como LISTA, no concatenados: la
  // tarjeta los pinta uno a uno y necesita poder buscar cada evidencia en
  // `complianceResult.evidences` para sacar su motivo y su criticidad.
  const nonConformityItems = (complianceResult?.nonConformities || []).map(
    nonConformity => ({
      id: nonConformity.id,
      evidence: nonConformity.evidenceId,
      evidenceIds: nonConformity.evidenceIds || [],
      requirement: nonConformity.requirementId,
      finding: nonConformity.finding,
      impact: nonConformity.impact,
      requiredAction: nonConformity.requiredAction,
      // Los dos lados de la medida. Existen en `ENSNonConformity` desde que el
      // motor publica la traza de la decisión de policy, y hasta ahora no se
      // pintaban en ninguna parte: es el dato que convierte «no conforma» en
      // «se pedía X y hay Y».
      expected: nonConformity.expected,
      actual: nonConformity.actual,
      parameterIds: nonConformity.parameterIds || [],
      origin: nonConformity.origin,
      cause: nonConformity.cause,
      documental: nonConformity.documental === true,
      // Las máquinas en las que se ha observado ESTE hallazgo. Una tarjeta
      // idéntica en seis máquinas es una tarjeta con seis máquinas; si el
      // hallazgo difiere (otra cuenta, otro motivo), el motor ya las separa.
      agents: nonConformity.agents || [],
      status: 'ABIERTA',
    }),
  );

  const openNonConformitiesCount = nonConformityItems.length;

  // El desglose del MISMO número, no otro contador: cuántas se han demostrado
  // midiendo y cuántas cuentan por no haberse podido demostrar. Son dos
  // acciones distintas y las ejecutan personas distintas.
  const medidas = nonConformityItems.filter(item => item.origin === 'MEDIDA');

  // Las demostradas sobre una DECLARACIÓN de la pantalla (un contrato, una
  // certificación o un plan vencido o ausente): cuentan igual que las medidas,
  // pero no hay nada que corregir en la máquina. Su acción es renovar o
  // completar la documentación, y no se cuentan bajo «corregir el sistema».
  const documentales = medidas.filter(item => item.documental);
  const medidasTecnicas = medidas.filter(item => !item.documental);

  const noEvidenciadas = nonConformityItems.filter(
    item => item.origin === 'NO_EVIDENCIADA',
  );

  // Dos números que no miden lo mismo y los dos hacen falta: cuántos problemas
  // DISTINTOS hay (el recuento de tarjetas) y cuánto parque tocan.
  const maquinasConNoConformidad = new Set(
    nonConformityItems.flatMap(item =>
      item.agents.map(agent => agent.agentId),
    ),
  ).size;

  // Lo que es del catálogo se cuenta aparte porque el arreglo no lo tiene el
  // cliente: «op.acc.1.5 no declara evidencia» es cierto en todas las máquinas
  // por igual y no se desbloquea configurando ni tocando un agente.
  const catalogGapsCount = noEvidenciadas.filter(
    item => item.cause === 'CATALOG',
  ).length;

  // El agente caído tiene su propio recuento: no es un hallazgo sobre ninguna
  // máquina, es que la recogida no funciona, y quien lo arregla no es quien
  // corrige el sistema auditado.
  const collectionGapsCount = noEvidenciadas.filter(
    item => item.cause === 'COLLECTION',
  ).length;

  const maquinasSinDemostrar = new Set(
    noEvidenciadas.flatMap(item => item.agents.map(agent => agent.agentId)),
  ).size;

  // QUÉ CLASE DE INCUMPLIMIENTO ES, DE QUIÉN ES EL ARREGLO Y DE QUÉ COLOR VA.
  //
  // Un solo sitio para las tres cosas, porque las tres tienen que decir lo
  // mismo: la franja de la tarjeta, la insignia y la acción salen de aquí. La
  // distinción medido / no evidenciado no se explica en prosa —restan igual—,
  // se ve en el color y en la etiqueta, y la causa del no evidenciado va como
  // etiqueta, no como frase.
  const clasificar = (item: (typeof nonConformityItems)[number]) => {
    // Demostrado, pero sobre una DECLARACIÓN (un contrato o una certificación
    // vencida o ausente): no hay nada que corregir en la máquina.
    if (item.origin === 'MEDIDA' && item.documental) {
      return {
        etiqueta: 'Declarado (documental)',
        icono: 'document',
        color: '#BD271E',
        badgeColor: 'danger' as const,
        accion: 'Renovar o completar la documentación',
        responsable: 'Organización (contratos y proveedores)',
      };
    }

    if (item.origin === 'MEDIDA') {
      return {
        etiqueta: 'Medido',
        icono: 'inspect',
        color: '#BD271E',
        badgeColor: 'danger' as const,
        accion: 'Corregir la máquina',
        responsable: 'Sistema auditado',
      };
    }

    if (item.cause === 'CATALOG') {
      return {
        etiqueta: 'No evidenciado · catálogo',
        icono: 'package',
        color: '#98A2B3',
        badgeColor: 'default' as const,
        accion: 'Declarar la evidencia',
        responsable: 'Producto ENSFácil',
      };
    }

    if (item.cause === 'CONFIGURATION') {
      return {
        etiqueta: 'No evidenciado · sin configurar',
        icono: 'gear',
        color: '#F5A700',
        badgeColor: 'warning' as const,
        accion: 'Declarar la decisión',
        responsable: 'Responsable ENS',
      };
    }

    if (item.cause === 'COLLECTION') {
      return {
        etiqueta: 'No evidenciado · sin recogida',
        icono: 'offline',
        color: '#0077CC',
        badgeColor: 'primary' as const,
        accion: 'Restablecer la recogida',
        responsable: 'Operación Wazuh',
      };
    }

    return {
      etiqueta: 'No evidenciado · evidencia insuficiente',
      icono: 'alert',
      color: '#F5A700',
      badgeColor: 'warning' as const,
      accion: 'Habilitar la prueba',
      responsable: 'Productor de la evidencia',
    };
  };

  const buscarEvidencia = (evidenceId: string) =>
    (complianceResult?.evidences || []).find(
      (item: any) => item.id === evidenceId,
    );

  // EL MOTIVO REAL, EL QUE ESCRIBIÓ EL AGENTE O EL MOTOR.
  //
  // No es un campo de la no conformidad: vive en las evidencias que la
  // sostienen (`observations` / `observationGroups`) y hasta ahora solo se veía
  // en la tabla de evidencias. En la tarjeta era donde más falta hacía, porque
  // sin él todas decían lo mismo —«el requisito X se ha medido y no conforma»—
  // y ninguna decía QUÉ pasa en la máquina.
  const motivosDeEvidencias = (evidenceIds: string[]): MotivoLinea[] => {
    const lineas: MotivoLinea[] = [];

    evidenceIds.forEach(evidenceId => {
      const evidencia = buscarEvidencia(evidenceId);

      if (!evidencia) {
        return;
      }

      const grupos = evidencia.observationGroups || [];

      if (grupos.length > 0) {
        // Vista general: un motivo por texto distinto, con las máquinas
        // delante. El corte lo decide `resumirMotivos`, igual que en la tabla.
        resumirMotivos(grupos).visibles.forEach(grupo => {
          lineas.push({
            texto: grupo.text,
            etiqueta: grupo.agents.length
              ? `${evidenceId} · ${etiquetaDeMaquinas(
                  grupo.agents,
                  totalMaquinas,
                )}`
              : evidenceId,
          });
        });

        return;
      }

      (evidencia.observations || []).forEach(texto => {
        if (texto && texto.trim()) {
          lineas.push({ texto: texto.trim(), etiqueta: evidenceId });
        }
      });
    });

    return lineas;
  };

  // La criticidad la declara el catálogo por evidencia, y de un hallazgo con
  // varias manda la mayor. Es la única severidad MEDIDA que existe en los
  // datos: el resto sería inventarla.
  const criticidadDe = (evidenceIds: string[]): string | undefined => {
    const orden: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
    const etiquetas: Record<string, string> = {
      LOW: 'baja',
      MEDIUM: 'media',
      HIGH: 'alta',
    };

    let mayor: string | undefined;

    evidenceIds.forEach(evidenceId => {
      const nivel = buscarEvidencia(evidenceId)?.criticality;

      if (!nivel || !orden[nivel]) {
        return;
      }

      if (!mayor || orden[nivel] > orden[mayor]) {
        mayor = nivel;
      }
    });

    return mayor ? etiquetas[mayor] : undefined;
  };

  // Acciones distintas para cosas distintas, aunque el veredicto sea el mismo.
  // Sin prosa: la etiqueta y la cifra.
  const accionResumen =
    openNonConformitiesCount === 0
      ? 'Sin acciones pendientes'
      : [
          medidasTecnicas.length > 0 ? `Corregir ${medidasTecnicas.length}` : '',
          documentales.length > 0
            ? `Renovar documentación ${documentales.length}`
            : '',
          noEvidenciadas.length > 0
            ? `Habilitar prueba ${noEvidenciadas.length}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ');

  // La ficha del auditor: pares etiqueta / valor, y las cifras en fracción.
  // Antes era el mismo dato en párrafos («Dos frentes: corregir 4
  // incumplimiento(s) medido(s)…»), que ocupaba cuatro veces más y se leía
  // peor.
  //
  // Activo, fuente, nivel y última evaluación NO se repiten aquí: son el
  // contexto de la pantalla y ya están en la barra de arriba. Esta ficha es lo
  // que el auditor se lleva apuntado.
  const fichaAuditor: { etiqueta: string; valor: string }[] = [
    { etiqueta: 'Score', valor: `${motorScoreTexto} · ${motorStatus}` },
    {
      // EN VISTA AGREGADA ESTA FRACCIÓN NO ES LA DE AL LADO. El motor suma
      // `applicableRequirements` POR MÁQUINA: con 8 requisitos y 4 máquinas
      // vale 32, mientras el panel de Requisitos cuenta los 8 deduplicados.
      // Dos fracciones de «requisitos» con denominadores distintos a diez
      // centímetros es justo la contradicción aparente que esta pantalla lleva
      // meses quitándose de encima, así que la unidad va en la etiqueta.
      etiqueta: esVistaAgregada
        ? 'Demostrados · requisito × máquina'
        : 'Requisitos demostrados',
      valor: `${requisitosMedidos}/${requisitosAplicables}`,
    },
    {
      etiqueta: 'No conformidades',
      valor: `${openNonConformitiesCount}${
        maquinasConNoConformidad > 0
          ? ` · ${maquinasConNoConformidad} máquina${
              maquinasConNoConformidad === 1 ? '' : 's'
            }`
          : ''
      }`,
    },
    {
      etiqueta: 'Medidas',
      valor: `${medidas.length}${
        documentales.length > 0 ? ` · ${documentales.length} documental${documentales.length === 1 ? '' : 'es'}` : ''
      }`,
    },
    {
      etiqueta: 'No evidenciadas',
      valor: `${noEvidenciadas.length}${
        maquinasSinDemostrar > 0
          ? ` · ${maquinasSinDemostrar} máquina${
              maquinasSinDemostrar === 1 ? '' : 's'
            }`
          : ''
      }`,
    },
    ...(catalogGapsCount > 0
      ? [{ etiqueta: 'Del catálogo', valor: String(catalogGapsCount) }]
      : []),
    ...(collectionGapsCount > 0
      ? [{ etiqueta: 'Fallo de recogida', valor: String(collectionGapsCount) }]
      : []),
    { etiqueta: 'Acción', valor: accionResumen },
  ];

  // El encabezado de Remediación: cifras con etiqueta. Las tres primeras suman
  // el total; las dos siguientes son un desglose DE LAS NO EVIDENCIADAS y por
  // eso van en otra línea, dicho con esas palabras.
  const remediacionTotales = [
    {
      etiqueta: 'medidas · corregir el sistema',
      valor: medidasTecnicas.length,
      color: 'danger' as const,
    },
    {
      etiqueta: 'documentales · renovar o completar la documentación',
      valor: documentales.length,
      color: 'danger' as const,
    },
    {
      etiqueta: 'no evidenciadas · habilitar la prueba',
      valor: noEvidenciadas.length,
      color: 'warning' as const,
    },
  ].filter(item => item.valor > 0);

  const remediacionDesglose = [
    {
      etiqueta: 'del catálogo · producto ENSFácil',
      valor: catalogGapsCount,
      color: 'default' as const,
    },
    {
      etiqueta: 'fallo de recogida · operación Wazuh',
      valor: collectionGapsCount,
      color: 'primary' as const,
    },
  ].filter(item => item.valor > 0);

  const toTraceItem = (item: ENSTraceabilityResult, index: number) => ({
      key: `${item.source}-${item.reference}-${index}`,
      source: item.source,
      reference: item.reference,
      controlId:
        item.controlId ||
        complianceResult?.control.id ||
        control.id,
      requirements:
        item.requirementIds && item.requirementIds.length > 0
          ? item.requirementIds.join(', ')
          : item.requirementId || '',
      evidenceId: item.evidenceId,
      status: item.status,
      eventId: item.eventId,
      eventType: item.eventType,
      ruleId: item.ruleId,
      ruleDescription: item.ruleDescription,
      agent: [item.agentId, item.agentName]
        .filter(Boolean)
        .join(' · '),
      origin: [item.eventSourceType, item.eventSource]
        .filter(Boolean)
        .join(' · '),
      timestamp: formatTraceabilityTimestamp(item.timestamp),
      auditAttributes: item.auditAttributes || {},
      auditorMeaning: item.description,
    });

  // LA TABLA SE PAGINA EN EL SERVIDOR. La ficha trae las primeras entradas;
  // más allá, cada página se pide aparte, con su estado de carga y su error
  // (nunca una página vacía muda). El servidor guarda las primeras de cada
  // control (`traceabilityAvailable`; op.acc.3 tiene decenas de miles): el
  // total se dice siempre.
  const iniciales = complianceResult?.traceability || [];
  const pageFrom = tracePageIndex * tracePageSize;
  const traceabilityAvailable = evaluacion.data?.traceabilityAvailable ?? iniciales.length;
  const [remotePage, setRemotePage] = useState<
    { key: string; items?: ENSTraceabilityResult[]; error?: Error } | undefined
  >();
  const [reintentoTraza, setReintentoTraza] = useState(0);
  // El reintento entra en la clave: al pulsar «Reintentar» el error anterior
  // deja paso a «Cargando la página…».
  const remoteKey = `${control.id}|${agentId || ''}|${pageFrom}|${tracePageSize}|${evaluacion.data?.meta?.fingerprint || ''}|${reintentoTraza}`;
  const necesitaRemota =
    Boolean(complianceResult) &&
    traceabilityPageSource({ initialCount: iniciales.length, available: traceabilityAvailable, pageFrom, pageSize: tracePageSize }) === 'remote';

  useEffect(() => {
    if (!necesitaRemota) return;
    const controller = new AbortController();
    // Solo se calla lo que cancela la pantalla al cambiar de página o salir:
    // el tiempo agotado también aborta el controlador y debe verse.
    let cancelada = false;
    fetchTraceabilityPage({ controlId: control.id, agentId, from: pageFrom, size: tracePageSize }, controller)
      .then(page => {
        if (!cancelada) setRemotePage({ key: remoteKey, items: page.items || [] });
      })
      .catch(error => {
        if (!cancelada) setRemotePage({ key: remoteKey, error });
      });
    return () => {
      cancelada = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteKey, necesitaRemota]);

  const paginaRemota = remotePage?.key === remoteKey ? remotePage : undefined;
  const trazaCargando = necesitaRemota && !paginaRemota;
  const trazaError = necesitaRemota ? paginaRemota?.error : undefined;

  const traceabilityPageItems = (necesitaRemota
    ? paginaRemota?.items || []
    : iniciales.slice(pageFrom, pageFrom + tracePageSize)
  ).map((item, index) => toTraceItem(item, pageFrom + index));

  // --- Trazabilidad: vista compacta, paginada y con detalle expandible ---
  const toggleTraceDetail = (key: string) =>
    setExpandedTraceIds(current =>
      current.includes(key)
        ? current.filter(id => id !== key)
        : [...current, key],
    );

  const renderTraceDetail = (item: (typeof traceabilityPageItems)[number]) => (
    <EuiText size='xs'>
      <p>
        <strong>Referencia:</strong> {item.reference}
      </p>

      {item.requirements && (
        <p>
          <strong>Requisito(s):</strong> {item.requirements}
        </p>
      )}

      {item.eventId && (
        <p>
          <strong>ID del evento:</strong> {item.eventId}
        </p>
      )}

      {item.ruleDescription && (
        <p>
          <strong>Descripción de la regla:</strong> {item.ruleDescription}
        </p>
      )}

      {item.agent && (
        <p>
          <strong>Agente:</strong> {item.agent}
        </p>
      )}

      {item.origin && (
        <p>
          <strong>Origen:</strong> {item.origin}
        </p>
      )}

      {Object.keys(item.auditAttributes).length > 0 && (
        <>
          <p>
            <strong>Atributos técnicos auditables:</strong>
          </p>

          <ul>
            {Object.entries(item.auditAttributes).map(
              ([attribute, value]) => (
                <li key={attribute}>
                  <strong>{attribute}:</strong> {String(value)}
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {item.auditorMeaning && (
        <p style={{ color: '#69707D' }}>{item.auditorMeaning}</p>
      )}
    </EuiText>
  );

  const traceExpandedRowMap = expandedTraceIds.reduce(
    (acc: Record<string, React.ReactNode>, key) => {
      const item = traceabilityPageItems.find(trace => trace.key === key);

      if (item) {
        acc[key] = renderTraceDetail(item);
      }

      return acc;
    },
    {},
  );

  const traceabilityColumns = [
    {
      field: 'source',
      name: 'Fuente',
      width: '110px',
      render: (value: string) => <EuiBadge color='hollow'>{value}</EuiBadge>,
    },
    {
      field: 'evidenceId',
      name: 'Evidencia',
      width: '100px',
      render: (value?: string) =>
        value ? <EuiBadge color='default'>{value}</EuiBadge> : '-',
    },
    {
      field: 'eventType',
      name: 'Evento',
      width: '160px',
      render: (value?: string) => value || '-',
    },
    {
      field: 'ruleId',
      name: 'Regla',
      width: '110px',
      render: (value?: string) => value || '-',
    },
    {
      field: 'status',
      name: 'Estado',
      width: '130px',
      render: (value?: string) =>
        value ? <EuiBadge color={getBadgeColor(value)}>{value}</EuiBadge> : '-',
    },
    {
      field: 'timestamp',
      name: 'Fecha',
      width: '160px',
      render: (value?: string) => value || '-',
    },
    {
      align: 'right' as const,
      width: '40px',
      isExpander: true,
      render: (item: (typeof traceabilityPageItems)[number]) => (
        <EuiButtonIcon
          onClick={() => toggleTraceDetail(item.key)}
          aria-label={
            expandedTraceIds.includes(item.key) ? 'Contraer' : 'Ver detalle'
          }
          iconType={
            expandedTraceIds.includes(item.key) ? 'arrowUp' : 'arrowDown'
          }
        />
      ),
    },
  ];

  const evidenceSummary = evidenceStatusItems.reduce(
    (acc, evidence) => {
      if (evidence.status === 'CUMPLE') {
        acc.cumple += 1;
      } else if (evidence.status === 'NO_EVALUABLE') {
        acc.noEvaluable += 1;
      } else if (evidence.status === 'NO_APLICA') {
        acc.noAplica += 1;
      } else if (evidence.status === 'NO_CUMPLE') {
        acc.noCumple += 1;
      }

      return acc;
    },
    { cumple: 0, noEvaluable: 0, noAplica: 0, noCumple: 0 },
  );

  // PORCENTAJE DE EVIDENCIAS CONFORMES, sobre las EVALUABLES.
  //
  // Los `NO_APLICA` salen del denominador por la misma razón que salen del
  // denominador del control: un refuerzo por encima del nivel activo no es un
  // hueco. Y se dice de qué es —«evidencias»— pegado a la cifra, porque el
  // riesgo de esta pantalla siempre ha sido tener dos porcentajes de dos
  // denominadores distintos sin etiquetar cuál es cuál.
  const evidenciasEvaluables =
    evidenceSummary.cumple + evidenceSummary.noCumple + evidenceSummary.noEvaluable;

  const evidenciasConformesTexto =
    evidenciasEvaluables > 0
      ? `${Math.round((evidenceSummary.cumple / evidenciasEvaluables) * 100)}%`
      : 'sin datos';

  const globalStatus = motorStatus;

  // Sin número no hay rosco que pintar: el anillo entero en gris dice "no se ha
  // medido", y no un 0 % en rojo.
  // EL ARCO ES EL NÚMERO, y su color es el ESTADO. Nada más.
  //
  // Antes pintaba una franja ámbar de quince puntos justo antes del final,
  // siempre, dijera lo que dijera el control: un 100 % CUMPLE salía con un
  // trozo naranja y un 20 % también. Era decoración que parecía significar algo
  // —«esta parte está a medias»— sin corresponder a ninguna medida. En un
  // gráfico de cumplimiento eso no es un adorno inocente: es una franja que un
  // auditor puede leer como un dato.
  const colorDelArco =
    motorStatus === 'CUMPLE'
      ? '#00A69B'
      : motorStatus === 'PARCIAL'
      ? '#F5A700'
      : motorStatus === 'NO_CUMPLE'
      ? '#BD271E'
      : '#98A2B3';

  const donutBackground =
    motorScore === undefined
      ? 'conic-gradient(#D3DAE6 0 100%)'
      : `conic-gradient(${colorDelArco} 0 ${motorScore}%, #EEF2F7 ${motorScore}% 100%)`;

  // El desglose de evidencias, en insignias. Cuatro cifras con su etiqueta se
  // leen de un vistazo; la misma información en una frase corrida, no.
  const resumenEvidencias = [
    {
      etiqueta: 'conforman',
      valor: evidenceSummary.cumple,
      color: 'success' as const,
    },
    {
      etiqueta: 'con hallazgo',
      valor: evidenceSummary.noCumple,
      color: 'danger' as const,
    },
    {
      etiqueta: 'sin medir',
      valor: evidenceSummary.noEvaluable,
      color: 'default' as const,
    },
    {
      etiqueta: `fuera del nivel ${nivelesTexto}`,
      valor: evidenceSummary.noAplica,
      color: 'hollow' as const,
    },
  ].filter(item => item.valor > 0);

  // Sin la evaluación de ahora, ni veredicto ni cifras: la comprobación
  // periódica vuelve a intentarlo.
  if (error) {
    return (
      <EuiPage paddingSize='m'>
        <EuiPanel>
          <EuiButtonEmpty iconType='arrowLeft' onClick={onBack}>
            Volver a controles
          </EuiButtonEmpty>
          <EuiSpacer size='s' />
          <EuiTitle size='m'>
            <h2>
              {control.id.toUpperCase()} - {control.title}
            </h2>
          </EuiTitle>
          <EuiSpacer size='m' />
          <FactsReadErrorCallOut error={error} onRetry={evaluacion.retry} />
        </EuiPanel>
      </EuiPage>
    );
  }

  // Mientras llega la evaluación de ESTE control y ESTA máquina no se pinta
  // ningún veredicto: el de la máquina anterior no es el de esta.
  if (!evaluacion.data) {
    return (
      <EuiPage paddingSize='m'>
        <EuiPanel>
          <EuiButtonEmpty iconType='arrowLeft' onClick={onBack}>
            Volver a controles
          </EuiButtonEmpty>
          <EuiSpacer size='s' />
          <EuiTitle size='m'>
            <h2>
              {control.id.toUpperCase()} - {control.title}
            </h2>
          </EuiTitle>
          <EvaluationLoading message='Evaluando el control en el servidor con todos los hechos de la ventana.' />
        </EuiPanel>
      </EuiPage>
    );
  }

  // Sin agente seleccionado no se mezclan datos de varios agentes:
  // un cumplimiento combinado no es válido para auditoría.
  return (
    <EuiPage paddingSize='m'>
      <EuiPanel>
        <EuiButtonEmpty iconType='arrowLeft' onClick={onBack}>
          Volver a controles
        </EuiButtonEmpty>

        <EuiSpacer size='s' />

        <EuiText size='s' color='subdued'>
          {/* De lo general a lo concreto: marco (`family`) y luego grupo
              (`category`), segun la convencion de catalog/. */}
          ENS / {control.family} / {control.category} / {control.id}
        </EuiText>

        <EuiTitle size='m'>
          <h2>
            {control.id.toUpperCase()} - {control.title}
          </h2>
        </EuiTitle>

        <EuiText>
          <p>
            Control ENS orientado a auditoría, evidencias, scoring y
            trazabilidad Wazuh.
          </p>
        </EuiText>

        <EuiSpacer size='s' />

        <EuiPanel paddingSize='s'>
          <EuiText size='s'>
            <p>
              <strong>Activo:</strong> {agenteNombre} &nbsp; | &nbsp;
              <strong>Fuente:</strong> Wazuh / OpenSearch &nbsp; | &nbsp;
              <strong>Nivel ENS:</strong> {nivelesTexto} &nbsp; | &nbsp;
              <strong>Último hecho:</strong> {latestEvaluationDate}
            </p>
          </EuiText>
          <EvaluationStatusLine meta={evaluacion.data?.meta} refreshing={evaluacion.isRefreshing} onRetry={evaluacion.retry} />
        </EuiPanel>

        <EuiSpacer size='l' />

        <EuiPanel>
          <EuiTitle size='s'>
            <h3>Panel ejecutivo {control.id.toUpperCase()}</h3>
          </EuiTitle>

          <EuiSpacer size='m' />

          <EuiFlexGroup>
            <EuiFlexItem grow={1}>
              <EuiPanel>
                <EuiTitle size='xs'>
                  <h4>Cumplimiento global del control</h4>
                </EuiTitle>
                <div style={{ textAlign: 'center', padding: '14px 0' }}>
                  <div
                    style={{
                      width: 176,
                      height: 176,
                      borderRadius: '50%',
                      background: donutBackground,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      margin: '0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 122,
                        height: 122,
                        borderRadius: '50%',
                        background: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 34,
                          fontWeight: 700,
                          lineHeight: 1.1,
                          color: colorDelArco,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {motorScoreTexto}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          color: '#69707D',
                          marginTop: 2,
                        }}
                      >
                        {globalStatus}
                      </span>
                    </div>
                  </div>
                </div>

                <EuiFlexGroup gutterSize='s' justifyContent='center'>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={getBadgeColor(motorStatus)}>
                      {nivelesTexto} · {motorScoreTexto} · {motorStatus}
                    </EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size='s' />

                {/* CADA NÚMERO DICE DE QUÉ ES. Estas cifras son de EVIDENCIAS y
                    el rosco es de REQUISITOS: que seis evidencias en verde
                    convivan con un 38 % es correcto —un requisito con tres
                    evidencias buenas y una mala NO cumple— y lo único que hacía
                    falta era decir de qué es cada cifra. En insignias se ve; en
                    un párrafo había que leerlo. */}
                <EuiFlexGroup
                  gutterSize='xs'
                  justifyContent='center'
                  wrap
                  responsive={false}
                >
                  {resumenEvidencias.map(item => (
                    <EuiFlexItem grow={false} key={item.etiqueta}>
                      <EuiBadge color={item.color}>
                        {item.valor} {item.etiqueta}
                      </EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              </EuiPanel>
            </EuiFlexItem>

            <EuiFlexItem grow={1}>
              {/* AQUÍ VAN LOS REQUISITOS, NO LAS EVIDENCIAS.
                  Este panel enseñaba tres barras de evidencias —«Cumplen 5 / 8»—
                  a diez centímetros de un porcentaje que sale de los REQUISITOS.
                  El usuario lo dijo tres veces: «cumple 5/8 y solo 20 %, no lo
                  entiendo». Y tenía razón: la única forma de entenderlo era
                  saber que las dos cifras no hablan de lo mismo.

                  Cada fila dice qué evidencias la bloquean, con el icono de su
                  estado: `cross` es medida y no conforme, `clock` es no
                  demostrada. Ahí se ve, sin ninguna frase, que una evidencia
                  mala tumba todos los requisitos que se apoyan en ella. */}
              <EuiPanel>
                <EuiTitle size='xs'>
                  <h4>Requisitos</h4>
                </EuiTitle>

                <EuiSpacer size='s' />

                {(complianceResult?.requirements || [])
                  .filter((requisito: any) => requisito.status !== 'NO_APLICA')
                  .map((requisito: any) => {
                    const culpables = (requisito.evidenceIds || [])
                      .map((evidenceId: string) => {
                        const evidencia = buscarEvidencia(evidenceId);

                        return evidencia &&
                          evidencia.status !== 'CUMPLE' &&
                          evidencia.status !== 'NO_APLICA'
                          ? { id: evidenceId, status: evidencia.status }
                          : undefined;
                      })
                      .filter(Boolean) as {
                      id: string;
                      status: string;
                    }[];

                    const cumple = requisito.status === 'CUMPLE';

                    return (
                      <EuiFlexGroup
                        key={requisito.id}
                        gutterSize='s'
                        alignItems='center'
                        responsive={false}
                        style={{
                          padding: '4px 0',
                          borderBottom: '1px solid #F1F4FA',
                        }}
                      >
                        <EuiFlexItem grow={false}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: cumple ? '#00A69B' : '#BD271E',
                              display: 'block',
                            }}
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false} style={{ minWidth: 96 }}>
                          <EuiText size='xs'>
                            <strong>{requisito.id}</strong>
                          </EuiText>
                        </EuiFlexItem>

                        <EuiFlexItem>
                          {/* Un cumplimiento DOCUMENTAL se dice como tal: el
                              auditor tiene que separar de un vistazo lo que se
                              midió de lo que se declaró. */}
                          {cumple ? (
                            <EuiText size='xs' color='subdued'>
                              {etiquetaDeRequisitoQueCumple(requisito)}
                            </EuiText>
                          ) : culpables.length ? (
                            <EuiFlexGroup
                              gutterSize='xs'
                              wrap
                              responsive={false}
                            >
                              {culpables.map(culpable => (
                                <EuiFlexItem grow={false} key={culpable.id}>
                                  <EuiBadge
                                    color={getBadgeColor(culpable.status)}
                                    iconType={getStatusIcon(culpable.status)}
                                  >
                                    {culpable.id}
                                  </EuiBadge>
                                </EuiFlexItem>
                              ))}
                            </EuiFlexGroup>
                          ) : (requisito.evidenceIds || []).length === 0 ? (
                            <EuiText size='xs' color='subdued'>
                              sin evidencia declarada
                            </EuiText>
                          ) : (
                            // NO ES LO MISMO «el catálogo no declara con qué
                            // demostrarlo» que «lo declara y ninguna de esas
                            // evidencias es la culpable». Lo segundo pasa de
                            // verdad: lo tumba la policy, o un parámetro
                            // obligatorio sin configurar, o una evidencia
                            // declarada que no llegó a resolverse y por eso no
                            // tiene insignia. Decir ahí «sin evidencia
                            // declarada» era acusar al catálogo de un hueco que
                            // no tiene.
                            <EuiText size='xs' color='subdued'>
                              {requisito.evidenced === false
                                ? 'no demostrado'
                                : 'no cumple'}
                            </EuiText>
                          )}
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    );
                  })}

                <EuiSpacer size='s' />

                <EuiText size='xs' color='subdued'>
                  {/* Con una máquina la fracción ES el porcentaje. Agregando
                      varias no: el numerador cuenta requisitos deduplicados y
                      el porcentaje es la media de las máquinas, así que se dice
                      con esas palabras en vez de poner un «=» que sería falso. */}
                  <strong>
                    {requisitosCumplen}/{requisitosDelDenominador} cumplen
                  </strong>{' '}
                  ·{' '}
                  {esVistaAgregada
                    ? `${motorScoreTexto} media de ${totalMaquinas} máquinas`
                    : motorScoreTexto}
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>

              <EuiFlexItem grow={1}>
                <EuiPanel>
                  <EuiTitle size='xs'>
                    <h4>Resultado del motor ENS</h4>
                  </EuiTitle>

                  <EuiSpacer size='s' />

                  {/* DOS CIFRAS, NO UNA CON HUECO DEBAJO. El panel tenía un solo
                      `EuiStat` y media columna en blanco. El hueco lo llena el
                      otro número que esta pantalla ya tenía calculado y no
                      publicaba: qué porcentaje de las evidencias desplegadas
                      conforma. Cada una dice de qué es —requisitos / evidencias—
                      porque son denominadores distintos. */}
                  <EuiStat
                    title={motorScoreTexto}
                    titleSize='m'
                    description='Score del control · requisitos'
                    titleColor={getBadgeColor(motorStatus)}
                  />

                  <EuiSpacer size='m' />

                  <EuiStat
                    title={evidenciasConformesTexto}
                    titleSize='m'
                    description={`Evidencias conformes · ${evidenceSummary.cumple}/${evidenciasEvaluables}`}
                  />

                  <EuiSpacer size='m' />

                  <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={getBadgeColor(motorStatus)}>
                        {motorStatus}
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color='hollow'>Nivel {nivelesTexto}</EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>

              <EuiFlexItem grow={1}>
                <EuiPanel>
                  <EuiTitle size='xs'>
                    <h4>Detalle auditor</h4>
                  </EuiTitle>

                  <EuiSpacer size='s' />

                  {/* Los recuentos cuentan HALLAZGOS DISTINTOS, no
                      hallazgo × máquina: el mismo problema en siete servidores
                      es un problema. Cuánto parque toca va al lado de la cifra,
                      que es la otra mitad del dato. */}
                  {fichaAuditor.map(par => (
                    <EuiFlexGroup
                      key={par.etiqueta}
                      gutterSize='s'
                      responsive={false}
                      style={{ padding: '2px 0' }}
                    >
                      <EuiFlexItem grow={false} style={{ minWidth: 128 }}>
                        <EuiText size='xs' color='subdued'>
                          {par.etiqueta}
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size='xs'>
                          <strong>{par.valor}</strong>
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  ))}
                </EuiPanel>
              </EuiFlexItem>
          </EuiFlexGroup>

          {/* AQUÍ HABÍA UNA SEGUNDA FILA DE SEIS `EuiStat` Y NO DECÍA NADA
              NUEVO. Nivel, score, estado, requisitos demostrados, no
              conformidades y no evidenciadas: las seis cifras estaban ya en los
              cuatro paneles de justo encima. Con esta fila, el score salía SEIS
              veces en la misma pantalla —rosco, insignia del rosco, `EuiStat`
              del motor, pie de Requisitos, ficha del auditor y aquí— y el nivel
              ENS, cinco.

              Repetir un número no lo refuerza: obliga a comprobar que los dos
              dicen lo mismo. Se borra la fila entera; no se pierde ni un dato,
              y el que se llevaba —«Requisitos demostrados»— se queda en la
              ficha del auditor, que es donde tiene su etiqueta. */}
        </EuiPanel>

        <EuiSpacer size='l' />

        <EuiPanel>
          <EuiTitle size='s'>
            <h3>Evolución del cumplimiento · {control.id}</h3>
          </EuiTitle>

          <EuiSpacer size='xs' />

          <EuiText size='s' color='subdued'>
            <p>
              Cumplimiento diario de este control en los últimos 30 días.
            </p>
          </EuiText>

          <EuiSpacer size='s' />

          <ControlEvolutionChart
            points={controlTimeline}
            controlId={control.id}
          />
        </EuiPanel>

        <EuiSpacer size='l' />

        <EuiTitle size='s'>
          <h3>Evidencias ENS del control</h3>
        </EuiTitle>

        {!agentId && totalMaquinas > 1 && (
          <>
            <EuiSpacer size='xs' />

            <EuiText size='xs' color='subdued'>
              Vista general de {totalMaquinas} máquinas: el mismo motivo
              observado en varias se escribe una vez, con el recuento delante.
            </EuiText>
          </>
        )}

        <EuiSpacer size='s' />

        <EuiBasicTable
          items={evidenceStatusItems}
          columns={[
            {
              field: 'id',
              name: 'Evidencia',
              width: '90px',
              render: (id: string) => <strong>{id}</strong>,
            },
            {
              field: 'title',
              name: 'Descripción',
            },
            {
              field: 'status',
              name: 'Estado',
              width: '150px',
              render: (status: string) => (
                <EuiBadge
                  color={getBadgeColor(status)}
                  iconType={getStatusIcon(status)}
                >
                  {status}
                </EuiBadge>
              ),
            },
            {
              field: 'requirement',
              name: 'Requisito ENS',
              width: '150px',
              render: (req: string) => (
                <EuiText size='xs' color='subdued'>{req}</EuiText>
              ),
            },
            {
              field: 'level',
              name: 'Nivel',
              width: '110px',
              render: (level: string) => <EuiBadge color='hollow'>{level}</EuiBadge>,
            },
            {
              field: 'motivos',
              name: 'Motivo',
              render: (
                motivos: ENSObservationGroup[],
                item: (typeof evidenceStatusItems)[number],
              ) => {
                // Vista de un agente: no hay nada que agrupar, la máquina es la
                // pantalla entera. El motivo llega como una sola cadena con los
                // tramos separados por ' · ', y se parte para poder plegarla:
                // la primera frase es la que decide y el resto suele ser la
                // enumeración de desviaciones.
                if (motivos.length === 0) {
                  return (
                    <MotiveCell
                      lineas={(item.motivo || '')
                        .split(' · ')
                        .map(texto => texto.trim())
                        .filter(Boolean)
                        .map(texto => ({ texto }))}
                      titulo={`Motivo · ${item.id}`}
                    />
                  );
                }

                const { visibles, ocultos } = resumirMotivos(motivos);

                return (
                  <MotiveCell
                    // En cuántas máquinas ocurre, delante del texto: es lo que
                    // distingue «pasa en toda la flota» de «pasa en una». Con
                    // una sola, se la nombra.
                    lineas={visibles.map(grupo => ({
                      texto: grupo.text,
                      etiqueta: etiquetaDeMaquinas(
                        grupo.agents,
                        totalMaquinas
                      ),
                    }))}
                    ocultos={ocultos}
                    titulo={`Motivo · ${item.id}`}
                  />
                );
              },
            },
          ]}
        />

        <EuiSpacer size='l' />

          <EuiPanel>
            <EuiTitle size='s'>
              <h3>Remediación del control</h3>
            </EuiTitle>

            <EuiSpacer size='s' />

            {openNonConformitiesCount === 0 ? (
              <EuiCallOut
                title='Sin no conformidades abiertas'
                color='success'
                iconType='check'
              />
            ) : (
              <>
                {/* Un encabezado con las cifras, no dos párrafos. La distinción
                    medido / no evidenciado sigue a la vista —son dos insignias
                    de dos colores— y de quién es el arreglo se dice en la propia
                    etiqueta. */}
                <EuiTitle size='xxs'>
                  <h4>{openNonConformitiesCount} no conformidades abiertas</h4>
                </EuiTitle>

                <EuiSpacer size='s' />

                <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
                  {remediacionTotales.map(item => (
                    <EuiFlexItem grow={false} key={item.etiqueta}>
                      <EuiBadge color={item.color}>
                        {item.valor} {item.etiqueta}
                      </EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>

                {remediacionDesglose.length > 0 && (
                  <>
                    <EuiSpacer size='s' />

                    <EuiFlexGroup
                      gutterSize='xs'
                      alignItems='center'
                      wrap
                      responsive={false}
                    >
                      <EuiFlexItem grow={false}>
                        <EuiText size='xs' color='subdued'>
                          De las no evidenciadas:
                        </EuiText>
                      </EuiFlexItem>

                      {remediacionDesglose.map(item => (
                        <EuiFlexItem grow={false} key={item.etiqueta}>
                          <EuiBadge color={item.color}>
                            {item.valor} {item.etiqueta}
                          </EuiBadge>
                        </EuiFlexItem>
                      ))}
                    </EuiFlexGroup>
                  </>
                )}
              </>
            )}
          </EuiPanel>

        <EuiSpacer size='l' />

        <EuiPanel>
          <EuiFlexGroup
            alignItems='center'
            justifyContent='spaceBetween'
            gutterSize='s'
          >
            <EuiFlexItem grow={false}>
              <EuiTitle size='s'>
                <h3>Trazabilidad ENS ↔ Wazuh</h3>
              </EuiTitle>
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiText size='xs' color='subdued'>
                {traceabilityTotal.toLocaleString('es-ES')} registro
                {traceabilityTotal === 1 ? '' : 's'}
                {traceabilityTotal > traceabilityAvailable
                  ? ` · se pueden recorrer los ${traceabilityAvailable.toLocaleString('es-ES')} primeros; todos los hechos están en Eventos`
                  : ''}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size='s' />

          {trazaError ? (
            <>
              <FactsReadErrorCallOut error={trazaError} onRetry={() => setReintentoTraza(n => n + 1)} />
              <EuiSpacer size='s' />
            </>
          ) : null}

          {traceabilityTotal === 0 ? (
            <EuiText size='s' color='subdued'>
              <p>
                No hay información de trazabilidad disponible para este control.
              </p>
            </EuiText>
          ) : (
            <EuiBasicTable
              items={traceabilityPageItems}
              loading={trazaCargando}
              noItemsMessage={trazaCargando ? 'Cargando la página…' : trazaError ? 'No se pudo leer esta página.' : undefined}
              itemId='key'
              itemIdToExpandedRowMap={traceExpandedRowMap}
              isExpandable={true}
              compressed={true}
              columns={traceabilityColumns}
              pagination={{
                pageIndex: tracePageIndex,
                pageSize: tracePageSize,
                totalItemCount: traceabilityAvailable,
                pageSizeOptions: [5, 10, 25, 50],
              }}
              onChange={({ page }) => {
                if (page) {
                  setTracePageIndex(page.index);
                  setTracePageSize(page.size);
                }
              }}
            />
          )}
        </EuiPanel>

        <EuiSpacer size='l' />

        <EuiTitle size='s'>
          <h3>No conformidades ENS</h3>
        </EuiTitle>

        <EuiSpacer size='xs' />

        <EuiText size='xs' color='subdued'>
          {/* La regla del producto, dicha en una línea: los dos orígenes restan
              igual y se arreglan al revés. Lo demás lo dicen las tarjetas. */}
          Una tarjeta por hallazgo, no por máquina. Medido y no evidenciado
          cuentan igual; la acción es distinta.
        </EuiText>

        <EuiSpacer size='s' />

        {nonConformityItems.length === 0 && (
          <EuiText size='s' color='subdued'>
            <p>Todo lo aplicable en este control se ha demostrado conforme.</p>
          </EuiText>
        )}

        {/* Tres bloques, un contador. El orden es el de la acción: primero lo
            que hay que corregir en el sistema, después la documentación que
            hay que renovar o completar, y por último lo que hay que poder
            demostrar. */}
        {[
          {
            clave: 'medidas',
            titulo: `Medidas · ${medidasTecnicas.length}`,
            pie: 'Corregir el sistema auditado.',
            items: medidasTecnicas,
          },
          {
            clave: 'documentales',
            titulo: `Documentales · ${documentales.length}`,
            pie: 'Cuentan igual. La acción es renovar o completar la documentación.',
            items: documentales,
          },
          {
            clave: 'no-evidenciadas',
            titulo: `No evidenciadas · ${noEvidenciadas.length}`,
            pie: 'Cuentan igual. La acción es habilitar la prueba.',
            items: noEvidenciadas,
          },
        ]
          .filter(bloque => bloque.items.length > 0)
          .map(bloque => (
            <div key={bloque.clave}>
              <EuiSpacer size='m' />

              <EuiTitle size='xxs'>
                <h4>{bloque.titulo}</h4>
              </EuiTitle>

              <EuiText size='xs' color='subdued'>
                {bloque.pie}
              </EuiText>

              <EuiSpacer size='s' />

              <EuiFlexGroup wrap>
                {bloque.items.map(nonConformity => {
                  const clase = clasificar(nonConformity);

                  // El ancla (`evidence`) solo se usa si no hay lista: en las de
                  // configuración vale 'CONFIG' y en las de catálogo 'ENS', que
                  // es información, no una evidencia inventada.
                  const evidenciasImplicadas =
                    nonConformity.evidenceIds.length > 0
                      ? nonConformity.evidenceIds
                      : nonConformity.evidence
                      ? [nonConformity.evidence]
                      : [];

                  // Primero el motivo de las evidencias —lo que de verdad pasa
                  // en la máquina— y el veredicto del motor detrás: `MotiveCell`
                  // enseña la primera línea y pliega el resto, así que la que se
                  // ve es la que informa.
                  const lineasMotivo: MotivoLinea[] = [
                    ...motivosDeEvidencias(nonConformity.evidenceIds),
                    ...(nonConformity.finding
                      ? [
                          {
                            texto: nonConformity.finding,
                            etiqueta: 'Motor',
                          },
                        ]
                      : []),
                  ];

                  const criticidad = criticidadDe(nonConformity.evidenceIds);

                  const alcance = describirAlcance(
                    nonConformity.agents,
                    totalMaquinas,
                  );

                  const etiquetaAlcance =
                    nonConformity.cause === 'CATALOG'
                      ? 'Ámbito'
                      : nonConformity.origin === 'MEDIDA'
                      ? 'Observado en'
                      : 'Sin demostrar en';

                  const textoAlcance =
                    nonConformity.cause === 'CATALOG'
                      ? 'Todas las máquinas · no depende de ninguna'
                      : alcance;

                  return (
                    <EuiFlexItem
                      key={nonConformity.id}
                      style={{ minWidth: 380 }}
                    >
                      <NonConformityCard
                        item={nonConformity}
                        clase={clase}
                        criticidad={criticidad}
                        etiquetaAlcance={etiquetaAlcance}
                        textoAlcance={textoAlcance}
                        lineasMotivo={lineasMotivo}
                        evidenciasImplicadas={evidenciasImplicadas}
                        controlId={control.id}
                      />
                    </EuiFlexItem>
                  );
                })}
              </EuiFlexGroup>
            </div>
          ))}

      </EuiPanel>
    </EuiPage>
  );
};
