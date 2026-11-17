# Uso

Power ENS aparece en el menú del dashboard de Wazuh. Todos los resultados vienen del motor de OSCompliance, que se ejecuta cada 15 minutos: un cambio hecho aquí se ve tras su siguiente pasada.

## Configuración

Configuración guarda lo que declara la organización. Cualquiera con acceso al dashboard puede verla; para guardar hace falta el rol `power_ens_admin` o `all_access`. Tiene seis pestañas.

Estado resume el despliegue: cuántas máquinas ha descrito el motor, cuántas no reciben ningún perfil, cuántas tienen evidencias sin evaluar por la configuración y qué parámetros sin valor lo causan. También muestra las máquinas por función, distribución y perfil, y los últimos cambios.

Máquinas lista cada máquina que el motor describe en `oscompliance-host-profile`, página a página, con filtros por perfil, función, distribución, servicio y grupo de Wazuh, y una búsqueda por nombre, hostname o número de agente. La lista se lee del indexer de página en página, así que funciona igual con 15.000 máquinas. Al abrir una máquina se ve lo que el motor ha deducido (distribución, función, servicios y la señal del inventario que lo justifica), los perfiles que recibe y el valor de cada parámetro por máquina con su origen. Dar valores propios edita los valores de esa máquina sola.

Perfiles es donde los valores se fijan una vez por tipo de máquina. Cada perfil tiene una capa (distribución, función, servicio o sitio), condiciones sobre lo que deduce el motor y valores para los parámetros por máquina. Mientras se edita, Vista previa cuenta las máquinas que cumplen las condiciones y nombra algunas. Nuevo perfil empieza en blanco, desde una copia de otro o desde un fichero. Importar lee ficheros YAML o JSON con uno o varios perfiles y muestra, por perfil, si es nuevo, si cambia o si queda igual, y sus errores, antes de aplicar nada. Exportar escribe los perfiles guardados en YAML, un documento por perfil. Los perfiles incluidos vienen del catálogo de OSCompliance; guardar una copia modificada sustituye al incluido y borrar esa copia lo recupera.

Los cambios en perfiles se acumulan en la barra inferior de la página. Revisar los lista, Descartar los quita y Guardar los escribe todos. El motor los aplica en su siguiente pasada.

Pendiente lista lo que necesita una decisión: las máquinas que no cumplen ningún perfil y los parámetros sin valor que dejan evidencias sin evaluar, según los últimos veredictos. Cada parámetro enlaza con donde se fija: un perfil para los parámetros por máquina y Organización para el resto.

Organización guarda, una sola vez, los datos que comparten varios controles: personal autorizado, entorno de preproducción, herramientas de cambios e incidentes, algoritmos autorizados por el CCN, plazos de retención, zonas controladas, canales de acceso remoto, productos certificados, formación del personal, actividades de concienciación, grupos con privilegio y declaración de aplicabilidad. Cada control lee las filas de su uso. Guarda también los valores de cada control que valen para toda la organización. Abre un control y pulsa Completar configuración para rellenar lo que falta. Desde un control también se puede asignar una plantilla a algunas máquinas.

General guarda el cliente, el nivel ENS (BAJO, MEDIO o ALTO), los grupos en alcance (Grupos evaluables) y Grupos por control. Hasta que se pulsa Guardar configuración global por primera vez, el motor y el plugin usan la configuración por defecto del catálogo, `common/ens/catalog/default-configuration.json`: nivel MEDIO y el grupo `ens` en alcance. Guarda para cambiarlos.

El valor de una máquina sale del primero de: su valor propio, la plantilla asignada en el control, sus perfiles, la plantilla de serie de su tipo de sistema y el valor de la organización. Las listas se suman entre perfiles; el resto de valores salen de la capa más específica. El orden se describe en [política ENS](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/es/configuration.md#política-ens).

Para automatizar, `oscompliance-policy` lee y escribe los mismos perfiles desde ficheros YAML en el manager, y `config/set-parameters.py` rellena valores de la organización y de máquinas desde un fichero JSON después del primer guardado. Consulta [perfiles](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/es/configuration.md#perfiles) y [parámetros desde un fichero](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/es/configuration.md#parámetros-desde-un-fichero).

Un parámetro que nadie ha definido nunca se sustituye por una suposición: las evidencias que lo necesitan salen como no evaluables y el motivo nombra el parámetro. El significado de cada parámetro está en las [páginas de control](https://github.com/arseniteio/oscompliance-ens-wazuh/tree/main/docs/es/controls).

Con Grupos por control activado, el motor crea un grupo de Wazuh por control, `ens-excluir-<control>`. Una máquina añadida a uno de esos grupos queda fuera de ese control. En Detalle del control, un usuario con `power_ens_admin` o `all_access` pulsa Excluir de este control para mover la máquina a ese grupo, y debe escribir un motivo. Power ENS registra la máquina, el control, el motivo, el usuario y la fecha en el índice `wazuh-ens-exclusions`. Volver a incluir lo revierte, también con motivo. El manager no pertenece a ningún grupo y no se puede excluir.

## Resultados

Panel muestra el estado del despliegue: la madurez de la organización, el cumplimiento por control y familia, los hallazgos por tipo y la evolución de la puntuación.

Madurez de la organización es la valoración del ENS (Anexo II, apdo. 6): niveles CMM L0 a L5 por medida, acreditados por la evidencia y valorados por las personas, con un nivel global de cada uno y las medidas sin medición, sin valorar y por debajo de su objetivo. La evidencia acredita hasta L2. L3 a L5 exigen un proceso escrito, medido y mejorado: abre el control y pulsa Valorar para registrar el nivel, el objetivo y los documentos que lo acreditan. Las medidas que citan los controles sin motor, como org.2 o mp.per.3, se valoran en Configuración, Organización, Medidas sin motor. El semáforo y el porcentaje son indicadores operativos, no la valoración del ENS. Exportar métricas (CSV) descarga, por medida, el estado operativo, el cumplimiento, la madurez acreditada, valorada y objetivo, y si cada cifra se midió o se declaró: los datos que recoge op.mon.2 para el informe anual del artículo 32.

Vista general muestra una fila por máquina con su cumplimiento total. Al abrir una máquina se ven sus controles, el trabajo pendiente y los últimos 30 días.

Detalle del control muestra un control en una máquina: cada requisito, cada evidencia con su estado y su motivo, y una explicación de cómo se mide. El selector Máquina cambia de máquina. Aquí es donde se averigua por qué falla algo.

Evidencias lista las evidencias de todos los controles, con su estado por máquina.

Eventos lista los hechos que han enviado los agentes. Muestra lo que ha recibido el motor, y al abrir uno se ve su documento.

Informes genera el informe de cada control para un auditor, con sus requisitos, parámetros, resultados y nivel de madurez. Exportar PDF lo descarga.

## Cómo leer un estado

Cumple significa medido y correcto. No cumple significa medido e incorrecto, y el motivo nombra lo que falla. No evaluable significa que no se ha podido medir: falta un parámetro o no ha llegado una fuente. No aplica significa que queda fuera del nivel ENS, o que el control o la máquina están fuera de alcance.

Un requisito con una evidencia no evaluable no cumple. Lo que no se puede demostrar no cuenta como cumplido. Las reglas completas están en [Veredictos](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/es/verdicts.md).
