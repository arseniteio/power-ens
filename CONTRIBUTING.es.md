# Contribuir

Esta guía explica cómo proponer un cambio en Power ENS.

## Antes de empezar

Abre una issue antes de un cambio grande, para acordar el enfoque antes del trabajo. Las correcciones pequeñas pueden ir directamente a una pull request.

Comunica las vulnerabilidades de seguridad en privado a devqs@quersystem.com, no en una issue.

## Entorno de desarrollo

Instala Node.js y Yarn para los tests, y Docker para compilar el zip del plugin. oscompliance-ens-wazuh debe estar clonado junto a este repositorio para incluir el catálogo.

## Comprobaciones

```bash
ci/run-tests.sh
```

Compila el zip con `ci/build-zip.sh 2.19.6`, o 2.19.5 para Wazuh 4.14.7, cuando el cambio toque la interfaz o las rutas del servidor.

## Código

- El código, los identificadores, los comentarios, los mensajes de commit y las pull requests van en inglés.
- Sigue las convenciones que ya tiene el repositorio. Los nombres claros, las funciones pequeñas y el manejo explícito de errores van antes que los comentarios.
- Escribe un comentario solo para lo que el código no puede decir: un invariante, una restricción externa o un apaño con su referencia.
- Los tests van en sus propios ficheros.
- No edites a mano `common/ens/catalog/engine/` ni el resto del catálogo incluido. Cambia el catálogo en oscompliance-ens-wazuh y ejecuta `npx tsx config/sync-catalog.ts`.
- La interfaz está en español. El código, los identificadores y los comentarios, en inglés.
- Un paquete npm nuevo de tiempo de ejecución necesita su licencia en `config/add-license-notices.py`, o la compilación falla.

## Commits

Usa [Conventional Commits](https://www.conventionalcommits.org/) con ámbito, en una línea de 72 caracteres como máximo, en imperativo y en minúscula:

```text
fix(install): wait for the rules of the release on workers
```

Tipos: feat, fix, refactor, perf, test, docs, build, ci, chore, style y revert.

## Pull requests

- Un cambio lógico por pull request, en una rama `feat/<tema>` o `fix/<tema>`.
- Las comprobaciones de arriba pasan.
- El comportamiento nuevo trae tests, y una corrección trae un test que falla sin ella.
- Los cambios de documentación van a `docs/en` y `docs/es`, y a los dos README, con el mismo contenido.
- Una línea bajo `[Unreleased]` en `CHANGELOG.md`, en inglés. Las etiquetas en español de la interfaz van entre comillas dobles con una glosa breve en inglés, como el botón "Excluir de este control" (exclude from this control).

## Licencia

El proyecto se distribuye bajo AGPL-3.0-only, y Quer System Informática lo ofrece también con una licencia comercial. Para que las dos sean posibles, Quer System Informática necesita los derechos de cada contribución. Antes de que se fusione tu primera pull request, firma el acuerdo de licencia de contribuidor de Quer System Informática. Pídelo en devqs@quersystem.com.
