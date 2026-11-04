# Power ENS

[English version](README.md)

Power ENS es el plugin para el dashboard de Wazuh de OSCompliance ENS, para el Esquema Nacional de Seguridad (ENS, Real Decreto 311/2022). Guarda los parámetros de política de cada control y muestra el cumplimiento por control y por máquina.

No juzga nada. Cada resultado es un veredicto del motor de OSCompliance, leído del índice `oscompliance-verdicts`, así que el plugin necesita [oscompliance-ens](https://github.com/arseniteio/oscompliance-ens) para mostrar resultados.

Funciona en Wazuh 4.14.7, 4.14.8 y 4.14.9. Las pantallas están en español.

## Documentación

- [Instalación](docs/es/install.md): compilar el zip, instalarlo, dar acceso, actualizarlo y retirarlo.
- [Uso](docs/es/usage.md): qué muestra cada pantalla y cómo se configura un control.

## Compilar y probar

Compila el zip para la versión de OpenSearch Dashboards de tu Wazuh: 2.19.5 para 4.14.7, 2.19.6 para 4.14.8 y 4.14.9.

```bash
ci/build-zip.sh 2.19.6
```

Ejecuta las pruebas.

```bash
ci/run-tests.sh
```

## Licencia

Consulta [LICENSE](LICENSE).
