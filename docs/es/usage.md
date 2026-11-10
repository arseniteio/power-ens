# Uso

Power ENS aparece en el menú del dashboard de Wazuh. Todos los resultados vienen del motor de OSCompliance, que se ejecuta cada 15 minutos: un cambio hecho aquí se ve tras su siguiente pasada.

## Configuración

Configuración guarda lo que declara la organización. Para guardar hace falta el rol `power_ens_admin` o `all_access`. Tiene tres partes.

Organización guarda el cliente, el nivel ENS (BAJO, MEDIO o ALTO), los grupos en alcance (Grupos evaluables) y los datos que comparten varios controles, como los plazos de retención. Pulsa Guardar configuración global la primera vez, porque el motor no juzga nada hasta que existe una configuración.

Plantillas guarda los valores de cada control. Abre un control y pulsa Completar configuración para rellenar lo que falta. Hay una plantilla por tipo de sistema con valores para los parámetros que dependen de la plataforma: revísalos con tus máquinas.

Agentes guarda lo que corresponde a una máquina. Abre la máquina y el control, y edita el parámetro con el lápiz.

Después del primer guardado, Plantillas y Agentes también se pueden rellenar desde un fichero JSON con `config/set-parameters.py`, que valida cada valor y muestra el plan antes de escribir. Consulta [parámetros desde un fichero](https://github.com/arseniteio/oscompliance-ens/blob/main/docs/es/configuration.md#parámetros-desde-un-fichero).

Un parámetro que nadie ha definido nunca se sustituye por una suposición: las evidencias que lo necesitan salen como no evaluables y el motivo nombra el parámetro. El significado de cada parámetro está en las [páginas de control](https://github.com/arseniteio/oscompliance-ens/tree/main/docs/es/controls).

Con Grupos por control activado, el motor crea un grupo de Wazuh por control, `ens-excluir-<control>`. Una máquina añadida a uno de esos grupos queda fuera de ese control.

## Resultados

Panel muestra el estado del despliegue: el cumplimiento por control y familia, los hallazgos por tipo y la evolución de la puntuación.

Vista general muestra una fila por máquina con su cumplimiento total. Al abrir una máquina se ven sus controles, el trabajo pendiente y los últimos 30 días.

Detalle del control muestra un control en una máquina: cada requisito, cada evidencia con su estado y su motivo, y una explicación de cómo se mide. El selector Máquina cambia de máquina. Aquí es donde se averigua por qué falla algo.

Evidencias lista las evidencias de todos los controles, con su estado por máquina.

Eventos lista los hechos que han enviado los agentes. Muestra lo que ha recibido el motor, y al abrir uno se ve su documento.

Informes genera el informe de cada control para un auditor, con sus requisitos, parámetros y resultados. Exportar PDF lo descarga.

## Cómo leer un estado

Cumple significa medido y correcto. No cumple significa medido e incorrecto, y el motivo nombra lo que falla. No evaluable significa que no se ha podido medir: falta un parámetro o no ha llegado una fuente. No aplica significa que queda fuera del nivel ENS, o que el control o la máquina están fuera de alcance.

Un requisito con una evidencia no evaluable no cumple. Lo que no se puede demostrar no cuenta como cumplido. Las reglas completas están en [Veredictos](https://github.com/arseniteio/oscompliance-ens/blob/main/docs/es/verdicts.md).
