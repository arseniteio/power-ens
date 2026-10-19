# Contribuir a ENSFácil
[English](CONTRIBUTING.en.md)

[[_TOC_]]

Esta es la guía interna para quien trabaja en este repositorio. Hoy el proyecto
es privado; está prevista una edición comunitaria.

## Flujo de trabajo

1. Crear una rama desde `main`, con un nombre que indique qué cambia (por ejemplo,
   `fix/…`, `feat/…`, `docs/…` o `ci/…`).
2. Abrir un merge request contra `main`.
3. Esperar a que el pipeline termine en verde.
4. Solicitar una revisión y resolver sus comentarios.
5. Fusionar con un merge commit.

Nada llega a `main` sin MR, pipeline en verde y revisión.

## Estilo de los commits

Mensajes cortos, en inglés, con un prefijo convencional:

| Prefijo | Para |
|---|---|
| `feat:` | una función nueva |
| `fix:` | una corrección |
| `docs:` | documentación |
| `ci:` | el pipeline y sus scripts |
| `test:` | pruebas |
| `chore:` | mantenimiento sin cambio de comportamiento |

Ejemplos del historial:

```text
fix: deploy installs only the ensfacil plugin
docs: name every plugin script and the zips the installer accepts
ci: clone the runbooks and run the README tests
```

Un commit por cambio con sentido propio. La primera línea dice qué cambia; si
hace falta explicar por qué, va en el cuerpo.

## Reglas del producto

- **Nada de código de Wazuh.** ENSFácil es un plugin independiente: no importa
  ni copia código del plugin de Wazuh. Lo vigila `tests/standalone-imports.test.ts`:
  ningún import sale del plugin, salvo al núcleo de OpenSearch Dashboards y a
  una lista cerrada de paquetes.
- **El veredicto lo decide el motor.** El cumplimiento lo decide el motor
  determinista del plugin (`common/ens/core/`): las mismas evidencias y la misma
  política dan siempre el mismo resultado. Ningún modelo decide si un control
  cumple. Los recolectores de los runbooks solo emiten hechos, y
  `tests/check-consistency.py` comprueba que ninguno emite un veredicto.
- **Documentación en español y en inglés.** Cada documento tiene su versión
  `.en.md` con el mismo contenido. Un cambio en una versión va en el mismo
  commit que en la otra.
- **Nada del laboratorio ni de los clientes.** Nunca nombres de máquinas o de
  laboratorios, direcciones IP, datos de clientes ni secretos en el repositorio:
  tampoco en pruebas, ejemplos ni mensajes de commit. Para ejemplos, se usan
  dominios `.invalido` o `example.com` y las redes de documentación
  (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`).

## Documentación

Las guías de `docs/deployment/` siguen el mismo estilo:

- registro impersonal o infinitivo («Comprobar la versión instalada:», «Se
  conserva la carpeta…», «Detener el procedimiento»), sin formas de «tú», sin
  preguntas retóricas ni incisos dirigidos al lector; en inglés, imperativo sin
  sujeto («Check…», «Stop the procedure»), sin *you* ni *your*;
- después de cada orden, **Resultado esperado:** (*Expected result:*, en
  inglés), también en las tablas;
- los avisos, con `> [!note]`, `> [!important]` o `> [!warning]`;
- cada enlace relativo y cada ancla tienen que existir. GitLab forma el ancla
  con el título en minúsculas, los espacios cambiados por `-` y sin signos de
  puntuación; los acentos se quedan.

## Pruebas

Las pruebas necesitan Python 3 y Node.js 18 o superior; las de los scripts,
además, `bash`, `zip` y `unzip`. Desde la raíz del repositorio, con los runbooks
clonados junto al plugin. La primera orden instala en `node_modules/` las
dependencias de `package.json`, que el motor importa (`re2js`):

```bash
npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive
python3 tests/check-consistency.py
for p in config/test_*.py; do python3 "$p" >/dev/null 2>&1 && echo "OK   $p" || echo "FAIL $p"; done
for t in tests/*.test.ts; do timeout 180 npx --yes tsx "$t" >/dev/null 2>&1 && echo "OK   $t" || echo "FAIL $t"; done
for s in tests/*.test.sh; do bash "$s" >/dev/null 2>&1 && echo "OK   $s" || echo "FAIL $s"; done
```

Resultado esperado: `coherencia OK` y ninguna línea `FAIL`.

Sin Node.js, en Docker, o en una carpeta limpia como CI: ver
[Compilar desde el código fuente, apartado 7](docs/deployment/08-building-from-source.md#7-pasar-las-pruebas).

Las pruebas se pasan antes de abrir el MR. Un cambio de comportamiento lleva su
prueba.

## Integración continua

El pipeline está en `.gitlab-ci.yml` y sus scripts, en `ci/`. Con un MR abierto
corre solo el pipeline del MR, no además el de la rama.

| Etapa | Qué hace | Cuándo |
|---|---|---|
| `test` | en `node:22-bookworm`, clona los runbooks (`ci/clone-runbooks.sh`) y pasa las pruebas (`ci/run-tests.sh`) | en cada pipeline |
| `build` | en `ensfacil-osd-builder:2.19.5`, compila con `config/build-plugin.sh` y deja en `dist/` el zip `ensfacil-<versión>-osd-2.19.5.zip`, `deploy-plugin.sh`, `create-admin-role.sh` y `SHA256SUMS` (artefacto de 30 días) | en cada pipeline |
| `release` | sube los cuatro ficheros al registro de paquetes y crea la release `ENSFácil X.Y.Z` | solo en las etiquetas `v*` |

### El runner

Todos los trabajos corren en un runner propio del proyecto, con la etiqueta
`ensfacil-build`. Necesita:

- el ejecutor Docker, con la política de descarga `if-not-present`;
- la imagen `ensfacil-osd-builder:2.19.5` en el Docker de esa máquina. No está
  en ningún registro: se construye allí con `ci/osd-builder.Dockerfile`
  ([Compilar desde el código fuente, apartado 4.1](docs/deployment/08-building-from-source.md#41-construir-la-imagen)),
  y se vuelve a construir cuando cambia ese fichero;
- salida a Internet: el trabajo `test` descarga `node:22-bookworm`, paquetes de
  apt y `tsx`, y clona los runbooks.

### Las variables de CI/CD

El trabajo `test` clona los runbooks de `quersystem/ens-controls-runbook` con un
token de despliegue de ese grupo, con el permiso `read_repository`. Se guarda en
este proyecto, en *Settings → CI/CD → Variables*:

| Variable | Valor | Opciones |
|---|---|---|
| `RUNBOOKS_DEPLOY_USER` | el usuario del token | enmascarada, sin proteger |
| `RUNBOOKS_DEPLOY_TOKEN` | el token | enmascarada, sin proteger |

Van sin proteger porque las ramas de trabajo y los MR no son protegidos: una
variable protegida no llegaría a sus pipelines. Sin ellas, `ci/clone-runbooks.sh` se para
y dice cómo crearlas.

El trabajo `release` no necesita más variables: usa el token del propio trabajo.

## Publicar una versión

ENSFácil sigue el [versionado semántico](https://semver.org/lang/es/): `X.Y.Z`,
donde `X` sube con un cambio incompatible, `Y` con una función nueva compatible y
`Z` con una corrección. La serie 1.x se compila para OpenSearch Dashboards 2.19.5
(Wazuh 4.14.7).

1. En una rama, subir la versión en `opensearch_dashboards.json` y en
   `package.json`. Las dos tienen que ser la misma.
2. Añadir la entrada de la versión en `CHANGELOG.md` y en `CHANGELOG.en.md`, con
   el título `## [X.Y.Z] - AAAA-MM-DD` y las secciones que hagan falta
   (Añadido, Cambiado, Corregido, Retirado).
3. Abrir el MR, con pipeline en verde y revisión, y fusionarlo en `main`.
4. Crear la etiqueta `vX.Y.Z` sobre `main` y subirla:

   ```bash
   git fetch origin
   git tag -a vX.Y.Z -m "ENSFácil X.Y.Z" origin/main
   git push origin vX.Y.Z
   ```

   Las etiquetas `v*` están protegidas: solo las crean los Maintainers.
5. El pipeline de la etiqueta pasa las pruebas, compila y publica. Comprobar en
   *Deploy → Releases* que está `ENSFácil X.Y.Z` con sus cuatro ficheros.

El trabajo `release` se niega a publicar si:

- la etiqueta no es `v` más la versión de `opensearch_dashboards.json` y de
  `package.json`;
- `CHANGELOG.md` no tiene la entrada `## [X.Y.Z]` de esa versión, o está vacía.
  Esa entrada son las notas de la release;
- ya existe una release para esa etiqueta.

> [!important]
> Una versión publicada no se vuelve a etiquetar ni se sustituye: el trabajo
> `release` se niega. Si una release sale mal, se publica una versión de
> parche nueva con la corrección.

La descripción de la release enlaza con
`docs/deployment/07-installing-from-a-release.md` en esa etiqueta: esa guía no se cambia
de sitio.
