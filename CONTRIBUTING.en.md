# Contributing to ENSFácil
[Español](CONTRIBUTING.md)

[[_TOC_]]

This is the internal guide for whoever works on this repository. Today the
project is private; a community edition is planned.

## Workflow

1. Create a branch from `main`, with a name that says what changes (for
   example, `fix/…`, `feat/…`, `docs/…` or `ci/…`).
2. Open a merge request against `main`.
3. Wait for the pipeline to go green.
4. Ask for a review and resolve its comments.
5. Merge with a merge commit.

Nothing reaches `main` without an MR, a green pipeline and a review.

## Commit style

Short messages, in English, with a conventional prefix:

| Prefix | For |
|---|---|
| `feat:` | a new feature |
| `fix:` | a fix |
| `docs:` | documentation |
| `ci:` | the pipeline and its scripts |
| `test:` | tests |
| `chore:` | maintenance with no change in behaviour |

Examples from the history:

```text
fix: deploy installs only the ensfacil plugin
docs: name every plugin script and the zips the installer accepts
ci: clone the runbooks and run the README tests
```

One commit per change that makes sense on its own. The first line says what
changes; if the reason needs explaining, it goes in the body.

## Product rules

- **No Wazuh code.** ENSFácil is a standalone plugin: it neither imports nor
  copies code from the Wazuh plugin. `tests/standalone-imports.test.ts` guards
  it: no import leaves the plugin, except to the OpenSearch Dashboards core and
  a closed list of packages.
- **The engine decides the verdict.** Compliance is decided by the plugin's
  deterministic engine (`common/ens/core/`): the same evidence and the same
  policy always give the same result. No model decides whether a control
  complies. The runbook collectors only emit facts, and
  `tests/check-consistency.py` checks that none of them emits a verdict.
- **Documentation in Spanish and English.** Every document has its `.en.md`
  version with the same content. A change in one version goes in the same
  commit as in the other.
- **Nothing from the lab or the customers.** Never machine or lab names, IP
  addresses, customer data or secrets in the repository: not in tests,
  examples or commit messages either. For examples, use `.invalido` or
  `example.com` domains and the documentation networks (`192.0.2.0/24`,
  `198.51.100.0/24`, `203.0.113.0/24`).

## Documentation

The guides in `docs/deployment/` follow the same style:

- impersonal or infinitive register in Spanish («Comprobar la versión
  instalada:», «Se conserva la carpeta…», «Detener el procedimiento»), without
  «tú» forms, rhetorical questions or asides to the reader; in English, bare
  imperative («Check…», «Stop the procedure»), without *you* or *your*;
- after each command, **Expected result:** (**Resultado esperado:**, in
  Spanish), also in tables;
- notices with `> [!note]`, `> [!important]` or `> [!warning]`;
- every relative link and every anchor must exist. GitLab builds the anchor
  from the heading in lowercase, with spaces turned into `-` and punctuation
  removed; accents stay.

## Tests

The tests need Python 3 and Node.js 18 or later; the script tests also need
`bash`, `zip` and `unzip`. From the repository root, with the runbooks cloned
next to the plugin. The first command installs into `node_modules/` the
`package.json` dependencies the engine imports (`re2js`):

```bash
npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive
python3 tests/check-consistency.py
for p in config/test_*.py; do python3 "$p" >/dev/null 2>&1 && echo "OK   $p" || echo "FAIL $p"; done
for t in tests/*.test.ts; do timeout 180 npx --yes tsx "$t" >/dev/null 2>&1 && echo "OK   $t" || echo "FAIL $t"; done
for s in tests/*.test.sh; do bash "$s" >/dev/null 2>&1 && echo "OK   $s" || echo "FAIL $s"; done
```

Expected result: `coherencia OK` and no `FAIL` line.

Without Node.js, in Docker, or in a clean folder like CI: see
[Building from source, section 7](docs/deployment/08-building-from-source.en.md#7-run-the-tests).

Run the tests before opening the MR. A change in behaviour comes with its
test.

## Continuous integration

The pipeline is in `.gitlab-ci.yml` and its scripts in `ci/`. With an MR open,
only the MR pipeline runs, not the branch one as well.

| Stage | What it does | When |
|---|---|---|
| `test` | in `node:22-bookworm`, clones the runbooks (`ci/clone-runbooks.sh`) and runs the tests (`ci/run-tests.sh`) | on every pipeline |
| `build` | in `ensfacil-osd-builder:2.19.5`, builds with `config/build-plugin.sh` and leaves in `dist/` the `ensfacil-<version>-osd-2.19.5.zip` zip, `deploy-plugin.sh`, `create-admin-role.sh` and `SHA256SUMS` (30-day artifact) | on every pipeline |
| `release` | uploads the four files to the package registry and creates the `ENSFácil X.Y.Z` release | only on `v*` tags |

### The runner

Every job runs on a project runner of our own, with the `ensfacil-build` tag.
It needs:

- the Docker executor, with the `if-not-present` pull policy;
- the `ensfacil-osd-builder:2.19.5` image in that machine's Docker. It is in no
  registry: it is built there with `ci/osd-builder.Dockerfile`
  ([Building from source, section 4.1](docs/deployment/08-building-from-source.en.md#41-build-the-image)),
  and built again when that file changes;
- Internet access: the `test` job downloads `node:22-bookworm`, apt packages and
  `tsx`, and clones the runbooks.

### The CI/CD variables

The `test` job clones the runbooks of `quersystem/ens-controls-runbook` with a
deploy token of that group, with the `read_repository` scope. It is stored in
this project, under *Settings → CI/CD → Variables*:

| Variable | Value | Options |
|---|---|---|
| `RUNBOOKS_DEPLOY_USER` | the token's username | masked, not protected |
| `RUNBOOKS_DEPLOY_TOKEN` | the token | masked, not protected |

They are not protected because working branches and MRs are not protected: a
protected variable would not reach their pipelines. Without them,
`ci/clone-runbooks.sh` stops and says how to create them.

The `release` job needs no other variable: it uses the job's own token.

## Releasing a version

ENSFácil follows [semantic versioning](https://semver.org/): `X.Y.Z`, where `X`
goes up with an incompatible change, `Y` with a compatible new feature and `Z`
with a fix. The 1.x series is built for OpenSearch Dashboards 2.19.5 (Wazuh
4.14.7).

1. In a branch, bump the version in `opensearch_dashboards.json` and in
   `package.json`. Both must be the same.
2. Add the version's entry to `CHANGELOG.md` and `CHANGELOG.en.md`, with the
   heading `## [X.Y.Z] - YYYY-MM-DD` and the sections it needs (Added, Changed,
   Fixed, Removed; in Spanish, Añadido, Cambiado, Corregido, Retirado).
3. Open the MR, with a green pipeline and a review, and merge it into `main`.
4. Create the `vX.Y.Z` tag on `main` and push it:

   ```bash
   git fetch origin
   git tag -a vX.Y.Z -m "ENSFácil X.Y.Z" origin/main
   git push origin vX.Y.Z
   ```

   The `v*` tags are protected: only Maintainers create them.
5. The tag pipeline runs the tests, builds and publishes. Check in
   *Deploy → Releases* that `ENSFácil X.Y.Z` is there with its four files.

The `release` job refuses to publish if:

- the tag is not `v` plus the version in `opensearch_dashboards.json` and
  `package.json`;
- `CHANGELOG.md`, the Spanish file, has no `## [X.Y.Z]` entry for that
  version, or it is empty. That entry is the release notes;
- a release already exists for that tag.

> [!important]
> A published version is never tagged again or replaced: the `release` job
> refuses. If a release goes wrong, publish a new patch version with the fix.

The release description links to
`docs/deployment/07-installing-from-a-release.md` at that tag: do not move that
guide.
