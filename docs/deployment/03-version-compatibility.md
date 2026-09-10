# Compatibilidad de versiones de ENSFácil
[English](03-version-compatibility.en.md)

[[_TOC_]]

## 1. Objetivo

Esta guía define el alcance de compatibilidad conocido de ENSFácil y el procedimiento que debe seguirse antes de utilizar una versión distinta de Wazuh Dashboard.

> [!important]
> La compatibilidad nunca debe asumirse únicamente porque Wazuh pueda instalarse o arrancar correctamente. ENSFácil modifica e incorpora componentes dentro del plugin oficial de Wazuh Dashboard y esos puntos de integración pueden cambiar entre versiones.

## 2. Versiones reconocidas actualmente

El paquete de integración actual reconoce las siguientes versiones de Wazuh Dashboard:

| Versión reconocida |
|---|
| Wazuh 4.14.5. |
| Wazuh 4.14.7. |

La comprobación está implementada en `integration/wazuh-dashboard/check-integration.sh`.

Cualquier versión distinta debe considerarse no validada hasta completar un nuevo ciclo de compatibilidad.

## 3. Comprobación obligatoria antes de integrar ENSFácil

Definir el árbol del plugin Wazuh que se quiere evaluar:

```bash
REPO=/opt/ensfacil/repo
TARGET=/opt/ensfacil/build/plugins/main
PKG=$REPO/integration/wazuh-dashboard

( cd "$PKG" && sha256sum -c SHA256SUMS )
"$PKG/check-integration.sh" "$TARGET"
```

El script identifica la versión del plugin y analiza el estado de los parches y ficheros que forman la integración ENSFácil.

Solo debe continuarse cuando la ejecución finalice con:

```text
RESULTADO=COMPATIBLE
```

> [!warning]
> Si devuelve `RESULTADO=NO_COMPATIBLE`, aparecen conflictos o informa de una versión no validada, no debe ejecutarse `apply-integration.sh` sobre ese árbol.

## 4. Evaluar una versión nueva de Wazuh

Una versión de Wazuh distinta de las reconocidas actualmente debe evaluarse primero en un entorno de laboratorio independiente.

> [!warning]
> No modificar directamente un entorno de producción para realizar esta validación.

El procedimiento de compatibilidad debe incluir:

1. Obtener el código oficial correspondiente a la nueva versión de Wazuh Dashboard y de sus plugins.
2. Preparar un árbol de compilación limpio para esa versión.
3. Comparar los puntos modificados por ENSFácil con los ficheros de la nueva versión.
4. Ejecutar las comprobaciones de integración antes de aplicar cambios.
5. Adaptar los parches únicamente si la nueva versión ha cambiado los puntos de integración.
6. Aplicar ENSFácil sobre el árbol limpio y comprobar que no existen conflictos ni ficheros `.rej`.
7. Compilar utilizando la versión de OpenSearch Dashboards correspondiente a esa versión de Wazuh.
8. Instalar el artefacto en un entorno de prueba y validar el funcionamiento de ENSFácil y del Dashboard.

> [!note]
> No debe reutilizarse automáticamente `2.19.5` para una versión futura. La versión de OpenSearch Dashboards debe comprobarse para la versión concreta de Wazuh que se esté evaluando.

## 5. Criterios para declarar una versión compatible

Una nueva versión solo debe incorporarse a la lista admitida cuando se haya demostrado que:

- [ ] el paquete de integración se aplica sin conflictos;
- [ ] no se generan ficheros `.rej`;
- [ ] los ficheros adicionales de ENSFácil quedan instalados correctamente;
- [ ] el plugin compila correctamente;
- [ ] Wazuh Dashboard arranca con el plugin actualizado;
- [ ] ENSFácil permanece accesible y sus funciones principales continúan operativas;
- [ ] existe un procedimiento de rollback probado para volver al estado anterior.

Solo después de completar estas comprobaciones debe actualizarse la lista de versiones admitidas por `check-integration.sh` y documentarse la nueva combinación de versiones.

## 6. Versiones no validadas

Si una versión no figura entre las reconocidas por el paquete de integración, debe tratarse como no validada.

Esto no significa necesariamente que ENSFácil sea incompatible con ella, sino que todavía no existe evidencia suficiente para autorizar su despliegue.

> [!important]
> Ante una versión no validada, detener el procedimiento y realizar primero el ciclo de compatibilidad descrito en esta guía.
