# Instalación completa de ENSFácil desde cero

## 1. Objetivo

Esta guía describe el procedimiento para desplegar ENSFácil partiendo de una
máquina limpia, sin depender de ningún servidor ENSFácil previamente preparado.

El objetivo es que el entorno pueda reproducirse utilizando únicamente los
repositorios autorizados de GitLab, la documentación del proyecto y los
artefactos versionados necesarios para el despliegue.

## 2. Punto de partida

Esta ruta parte de una instalación de Ubuntu Server que dispone únicamente de:

- acceso administrativo mediante `sudo`;
- conectividad de red;
- acceso a Internet cuando sea necesario;
- acceso autorizado a los repositorios GitLab del proyecto.

No se presupone que estén previamente instalados o preparados Wazuh, ENSFácil,
el árbol de compilación de Wazuh Dashboard, Node.js, Yarn, las reglas ENS, el
grupo `ens` ni la configuración inicial de ENSFácil.

## 3. Resultado esperado

Al finalizar esta guía deben quedar instalados, integrados y validados Wazuh y
ENSFácil, incluyendo las reglas del manager, la integración con Wazuh Dashboard,
el plugin compilado e instalado y la configuración inicial necesaria para que
ENSFácil pueda funcionar.

## 4. Principio de reproducibilidad

Una instalación se considera reproducible cuando puede completarse desde una
máquina limpia utilizando únicamente GitLab y esta documentación.

No debe ser necesario copiar manualmente ficheros desde otro servidor ENSFácil
ni depender de una máquina previamente configurada.

## 5. Versiones y compatibilidad

ENSFácil debe desplegarse únicamente sobre combinaciones de versiones que hayan sido validadas.

La combinación utilizada durante la validación inicial de esta guía es:

- Wazuh: `4.14.7`
- OpenSearch Dashboards: `2.19.5`
- Node.js para compilación: `18.19.0`

La matriz de compatibilidad se mantiene en:

`docs/despliegue/03-COMPATIBILIDAD-DE-VERSIONES.md`

Una nueva versión de Wazuh no debe considerarse compatible automáticamente. Antes de utilizarla deben comprobarse los puntos de integración de ENSFácil, recompilar el plugin y ejecutar las validaciones definidas para el despliegue.

## 6. Flujo completo de instalación

La instalación completa de ENSFácil sigue este orden:

1. Preparar y validar la máquina base.
2. Instalar y validar Wazuh.
3. Configurar el acceso autorizado a GitLab.
4. Clonar ENSFácil y los runbooks necesarios.
5. Crear y validar el grupo `ens`.
6. Instalar y validar las reglas ENS en el manager.
7. Preparar el árbol de compilación de Wazuh Dashboard.
8. Instalar y validar las dependencias de compilación.
9. Integrar el código de ENSFácil y sus puntos de integración con Wazuh.
10. Compilar el plugin.
11. Validar el artefacto generado antes de instalarlo.
12. Instalar el plugin en Wazuh Dashboard.
13. Sembrar la configuración inicial de los controles.
14. Configurar los agentes y la política ENS.
15. Ejecutar la validación extremo a extremo.

Cada fase debe validarse antes de continuar con la siguiente.

## 7. Regla de validación

Un paso no se considera terminado únicamente porque el comando haya finalizado sin errores.

Cada fase debe incluir una comprobación objetiva que confirme que el resultado esperado existe y funciona.

Si una validación falla, el despliegue debe detenerse en ese punto. No se continuará con las fases posteriores hasta identificar y resolver la causa.

Siempre que corresponda, cada fase documentará:

- prerrequisitos;
- comandos que deben ejecutarse;
- resultado esperado;
- comprobación de validación;
- acciones recomendadas si la validación falla;
- procedimiento de vuelta atrás cuando exista riesgo de modificar un entorno operativo.

## 8. Preparar y validar la máquina base

### 8.1 Entorno utilizado para validar esta guía

La instalación inicial de esta guía se ha validado sobre el siguiente entorno de laboratorio:

- Ubuntu Server `24.04.4 LTS`;
- arquitectura `x86_64`;
- 4 CPU lógicas;
- 7,8 GiB de RAM;
- 80 GB de disco virtual;
- conectividad a Internet;
- acceso administrativo mediante `sudo`.

Estos valores describen el entorno de validación y no deben interpretarse como requisitos mínimos de ENSFácil.

La topología de red del laboratorio tampoco es un requisito del producto. La máquina utilizada durante la validación dispone de una interfaz NAT y una interfaz de red de laboratorio.

### 8.2 Comprobaciones previas

Antes de comenzar el despliegue, comprobar el sistema operativo, arquitectura, recursos disponibles, conectividad y herramientas básicas:

```bash
cat /etc/os-release
uname -m
nproc
free -h
df -h /
ip -br addr
ip route
getent hosts gitlab.com
curl -Is --max-time 10 https://gitlab.com | head -1
command -v sudo apt git curl wget python3
```

La instalación no debe continuar si no existe acceso administrativo o si la máquina no dispone de la conectividad necesaria para obtener los repositorios y paquetes del despliegue.
