# Building ENSFácil from source
[Español](08-building-from-source.md)

[[_TOC_]]

## 1. Objective

This guide builds the ENSFácil plugin zip from this repository, validates it
and runs the tests.

To install, the recommended method is a release
([Installing from a release](07-installing-from-a-release.en.md)): CI builds it
from a tag and publishes its SHA-256 sums. Build locally only in the following
cases:

- a version without a release (a branch or an MR);
- evaluation of another Wazuh version ([version compatibility](03-version-compatibility.en.md#5-evaluate-a-new-version));
- plugin development.

There are two ways to build:

| Method | Requirements | Section |
|---|---|---|
| With the OpenSearch Dashboards tree | Node.js 18.19.0, Yarn Classic 1.22.22 and the prepared tree | 3 |
| With the builder image, like CI | Docker | 4 |

## 2. What the build produces

The plugin is built inside the OpenSearch Dashboards `2.19.5` source code, the
version that Wazuh Dashboard 4.14.7 ships. The result is the file
`ensfacil-2.19.5.zip`, which only installs on that exact OpenSearch Dashboards
version.

CI gives it the release name, `ensfacil-<version>-osd-2.19.5.zip`. The content
is the same: `deploy-plugin.sh` recognizes the plugin by its content, not by
the file name.

> [!note]
> The Wazuh plugin source code (`wazuh-dashboard-plugins`) is not needed.
> ENSFácil neither modifies nor includes it.

## 3. Build with the OpenSearch Dashboards tree

This method uses the paths of the [installation guide](01-installation-from-scratch.en.md):
the repository in `/opt/ensfacil/repo` (section 10.2) and the logs in
`/opt/ensfacil/artifacts`:

```bash
sudo mkdir -p /opt/ensfacil/artifacts
sudo chown "$USER":root /opt/ensfacil/artifacts
```

### 3.1 Prepare Node.js and Yarn

Install Node.js `18.19.0` and Yarn Classic `1.22.22` with nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 18.19.0
nvm use 18.19.0
npm install --global yarn@1.22.22
```

Check the versions:

```bash
node --version
yarn --version
```

Expected result: `v18.19.0` and `1.22.22`. If they differ, stop the procedure.

> [!note]
> Wazuh Dashboard 4.14.7 ships its own Node.js `18.19.0` in
> `/usr/share/wazuh-dashboard/node/bin/node`. If it exists,
> `config/build-plugin.sh` uses it. Yarn must still be in the `PATH`.

### 3.2 Prepare the OpenSearch Dashboards 2.19.5 tree

The Wazuh Dashboard 4.14.7 source code is used, which is OpenSearch Dashboards
`2.19.5`:

```bash
sudo mkdir -p /opt/ensfacil/build
sudo chown "$USER":root /opt/ensfacil/build
git clone --branch v4.14.7 --depth 1 https://github.com/wazuh/wazuh-dashboard.git /opt/ensfacil/build
```

Check the version:

```bash
git -C /opt/ensfacil/build describe --tags --exact-match HEAD
python3 -c 'import json; print(json.load(open("/opt/ensfacil/build/package.json"))["version"])'
```

Expected result: `v4.14.7` and `2.19.5`.

Prepare the tree:

```bash
cd /opt/ensfacil/build
yarn osd bootstrap
```

Expected result: `bootstrap complete` at the end. The process takes several
minutes. Dependency warnings that do not stop the process are not a failure.

### 3.3 Build the plugin

`config/build-plugin.sh` copies the plugin to `/opt/ensfacil/build/plugins/ensfacil`,
installs its dependencies with the repository's `yarn.lock` and builds. It
modifies no other plugin in the tree. It runs as `root`, with `yarn` in the
`PATH`:

```bash
YARN_BIN=$(dirname "$(command -v yarn)")
P=$YARN_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

sudo env PATH="$P" bash /opt/ensfacil/repo/config/build-plugin.sh > /opt/ensfacil/artifacts/build.log 2>&1
tail -1 /opt/ensfacil/artifacts/build.log
```

Expected result: `/opt/ensfacil/build/plugins/ensfacil/build/ensfacil-2.19.5.zip`.
Before it, the log contains `succ 1 bundles compiled successfully` and
`compressing plugin into [ensfacil-2.19.5.zip]`. The build takes about one
minute.

For another tree, pass it as an argument:
`sudo env PATH="$P" bash /opt/ensfacil/repo/config/build-plugin.sh <tree>`.

> [!warning]
> Do not redirect the output of a build run as `root` to a `/tmp` file created
> by another user: with the kernel's `protected_regular` protection, `root`
> cannot write to it and the build ends immediately with exit code 1, without
> a useful message. Use `/opt/ensfacil/artifacts`.

> [!important]
> `config/build-plugin.sh` deletes `/opt/ensfacil/build/plugins/ensfacil`
> entirely before building: the previous zip is only kept if it is copied to
> another folder first.

Continue with section 5.

## 4. Build with the builder image

The `ensfacil-osd-builder:2.19.5` image is the one used by the CI `build` job.
It contains the OpenSearch Dashboards 2.19.5 tree (Wazuh Dashboard v4.14.7)
already prepared in `/osd`, with Node.js 18.19.0 and Yarn Classic 1.22.22. It
only requires Docker.

### 4.1 Build the image

From the repository root:

```bash
docker build -f ci/osd-builder.Dockerfile -t ensfacil-osd-builder:2.19.5 ci/
docker image ls ensfacil-osd-builder:2.19.5
```

Expected result: the `ensfacil-osd-builder:2.19.5` image, about 7.5 GB.

- It works with Docker's classic builder: BuildKit is not needed.
- The build takes about 11 minutes on 4 CPUs.
- It is not pushed to any registry. The CI runner uses it from its local
  Docker, so it is built on the runner's machine
  ([contributing](../../CONTRIBUTING.en.md#continuous-integration)).

If `ci/osd-builder.Dockerfile` changes, rebuild the image.

### 4.2 Build like CI

The repository is mounted read-only on `/src` and copied inside the container:
the build does not write to the working copy. The zip comes out through the
`dist/` folder, mounted on `/dist`. From the repository root:

```bash
mkdir -p dist
docker run --rm \
  -v "$PWD":/src:ro \
  -v "$PWD/dist":/dist \
  ensfacil-osd-builder:2.19.5 \
  bash -c 'cp -a /src /repo && bash /repo/config/build-plugin.sh /osd \
    && cp /osd/plugins/ensfacil/build/ensfacil-2.19.5.zip /dist/ \
    && chown "$(stat -c %u:%g /dist)" /dist/ensfacil-2.19.5.zip'
ls -l dist/
```

Expected result: in the output, `succ 1 bundles compiled successfully` and
`/osd/plugins/ensfacil/build/ensfacil-2.19.5.zip`; in `dist/`, the zip, with
the same owner as the `dist/` folder. The build takes about one minute.

Give the zip the release name, with the version in
`opensearch_dashboards.json`:

```bash
V=$(python3 -c 'import json; print(json.load(open("opensearch_dashboards.json"))["version"])')
mv dist/ensfacil-2.19.5.zip "dist/ensfacil-$V-osd-2.19.5.zip"
ls dist/
```

Expected result: `ensfacil-1.2.0-osd-2.19.5.zip`, with the repository's
version.

To obtain a folder like a release's, with the two scripts and their sums,
repeat what the `build` job does:

```bash
cp config/deploy-plugin.sh config/create-admin-role.sh dist/
(cd dist && sha256sum "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh > SHA256SUMS \
  && sha256sum -c SHA256SUMS)
```

Expected result: `OK` for the three files. That folder installs like a
release ([guide 07, section 8](07-installing-from-a-release.en.md#8-first-install)).

## 5. Validate the zip

From the repository root, with `ZIP` pointing to the built zip:

```bash
ZIP=/opt/ensfacil/build/plugins/ensfacil/build/ensfacil-2.19.5.zip   # section 3
# ZIP=dist/ensfacil-1.2.0-osd-2.19.5.zip                             # section 4

unzip -t "$ZIP" | tail -1
bash config/deploy-plugin.sh --solo-id "$ZIP"
unzip -p "$ZIP" "*/target/public/*.js" | grep -c "op.exp.10"
sha256sum "$ZIP"
```

Expected result:

| Check | Expected result |
|---|---|
| `unzip -t` | `No errors detected in compressed data of …` |
| `--solo-id` | `ensfacil` |
| `grep -c` | a number greater than `0`: the zip contains the controls' code |
| `sha256sum` | the zip hash, kept as a reference |

To check that the zip contains a specific change, replace `op.exp.10` with the
identifier of a control or a text that has changed.

> [!warning]
> If the zip does not exist or any check fails, do not install it.

## 6. Install the zip

The zip is installed with the `config/deploy-plugin.sh` of the same
repository:

- first install: [installation guide, section 13.4](01-installation-from-scratch.en.md#134-install-the-plugin-on-wazuh-dashboard),
  then the role (section 13.5);
- update: [update guide, section 7](02-updating-an-existing-environment.en.md#7-deploy-the-updated-version);
- rollback: [troubleshooting and rollback, section 4](04-troubleshooting-and-rollback.en.md#4-reinstall-the-previous-ensfácil-version).

If the zip was built on another machine, copy it to the server (for example,
to `/opt/ensfacil/artifacts/`) and check its `sha256sum` there.

In Docker, `deploy-plugin.sh` is not used: the built zip,
`ensfacil-2.19.5.zip`, is installed in the dashboard image with the version in
`opensearch_dashboards.json` as `ENSFACIL_VERSION`
([Wazuh in Docker, section 3](06-wazuh-in-docker.en.md#3-build-the-dashboard-image-with-ensfácil)).

## 7. Run the tests

The tests need Python 3 and Node.js 18 or later. The script tests also need
`bash`, `zip` and `unzip`. `tests/check-consistency.py` compares the plugin
with the runbooks: it looks for them next to the plugin folder and recognizes
them by their `origin` remote, whatever the folder name.

### 7.1 With the runbooks already cloned

With the runbooks next to the plugin (as in the
[installation guide, section 10.3](01-installation-from-scratch.en.md#103-clone-the-ens-runbooks)),
the README loop is enough, from the repository root:

```bash
python3 tests/check-consistency.py
for t in tests/*.test.ts; do timeout 180 npx --yes tsx "$t" >/dev/null 2>&1 && echo "OK   $t" || echo "FAIL $t"; done
for s in tests/*.test.sh; do bash "$s" >/dev/null 2>&1 && echo "OK   $s" || echo "FAIL $s"; done
```

Expected result: `coherencia OK` at the end of the first command and no `FAIL`
line.

Without Node.js on the machine, each TypeScript suite runs in Docker:

```bash
docker run --rm -v "$PWD":/w -w /w node:22-alpine npx --yes tsx tests/plugin-manifest.test.ts
```

Or all of them, with `ci/run-tests.sh` in the same image as CI. The folder that
holds the plugin and the runbooks is mounted read-only:

```bash
docker run --rm -v "$(dirname "$PWD")":/base:ro -w "/base/$(basename "$PWD")" node:22-bookworm \
  bash -c 'apt-get update -qq && apt-get install -y -qq --no-install-recommends zip > /dev/null && ci/run-tests.sh'
```

Expected result: `OK` for each suite and, at the end, `las <n> suites pasan`.

`tests/mp-info-6-rules.test.sh` tests the mp.info.6 rules with `wazuh-logtest`
in a `wazuh/wazuh-manager` container. Without Docker, including inside another
container, that part is skipped with a warning.

### 7.2 Like CI, in a clean folder

CI clones the runbooks with `ci/clone-runbooks.sh` and runs the tests with
`ci/run-tests.sh`:

```bash
ci/clone-runbooks.sh <folder that holds the plugin>
ci/run-tests.sh
```

- `ci/clone-runbooks.sh` takes the list of runbooks from
  `tests/check-consistency.py` and clones them with the server layout:
  `<folder>/op.acc.1`, …, `<folder>/zimbra-mta/mp.info.6`.
- It needs the `RUNBOOKS_DEPLOY_USER` and `RUNBOOKS_DEPLOY_TOKEN` variables, the
  same as CI, or `RUNBOOKS_URL=file://…` with local copies.
- `ci/run-tests.sh` runs the same as the README loop, shows the end of the
  output of each failing suite and exits with an error if any fails.

> [!warning]
> `ci/clone-runbooks.sh` deletes and clones again every destination folder.
> Use it in a folder dedicated to the tests, with a separate clone of the
> plugin, never in the folder that holds the working copies of the runbooks.
