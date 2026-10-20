# Installing ENSFácil from a release
[Español](07-installing-from-a-release.md)

[[_TOC_]]

## 1. Objective

Installs or updates ENSFácil with the files of a GitLab release, without building.

It is the recommended method. To build the zip, see
[Building from source](08-building-from-source.en.md).

> [!note]
> The installation in sections 8 to 15 applies to the package installation
> (systemd). For Wazuh in Docker, downloading and verifying the release
> (sections 2 to 7) are the same, and the rest of the procedure is in
> [Wazuh in Docker](06-wazuh-in-docker.en.md).

> [!note]
> The release installs only the plugin. The manager rules and the runbooks on each machine are installed separately (section 14).

## 2. What a release is

Each published ENSFácil version has a GitLab release, named `ENSFácil X.Y.Z`
with the tag `vX.Y.Z`. It contains four files:

| File | Content |
|---|---|
| `ensfacil-X.Y.Z-osd-2.19.5.zip` | the plugin, built for OpenSearch Dashboards 2.19.5 |
| `deploy-plugin.sh` | the script that installs the zip on Wazuh Dashboard |
| `create-admin-role.sh` | the script that creates the `ensfacil_admin` role and assigns it |
| `SHA256SUMS` | the SHA-256 sum of the other three files |

The release description contains the notes of that version (its
[changelog](../../CHANGELOG.en.md) entry), the compatibility, the quick
installation commands, a link to this guide and the SHA-256 of the zip.

### 2.1 Compatibility

Each zip works for a single OpenSearch Dashboards version, the one in its name (`-osd-2.19.5`).

| ENSFácil | Wazuh | OpenSearch Dashboards | File |
|---|---|---|---|
| `1.0.0` | `4.14.7` | `2.19.5` | `ensfacil-1.0.0-osd-2.19.5.zip` |
| `1.1.0` | `4.14.7` | `2.19.5` | `ensfacil-1.1.0-osd-2.19.5.zip` |
| `1.2.0` | `4.14.7` | `2.19.5` | `ensfacil-1.2.0-osd-2.19.5.zip` |

The validated combinations are kept in
[Version compatibility](03-version-compatibility.en.md#2-validated-version).
Each release states its compatibility in its description. Before downloading,
check the installed version:

```bash
dpkg-query -W -f='${Package} ${Version}\n' wazuh-dashboard
sudo python3 -c 'import json; print(json.load(open("/usr/share/wazuh-dashboard/package.json"))["version"])'
```

Expected result: `wazuh-dashboard 4.14.7-1` and `2.19.5`. If the version
differs, stop the procedure and refer to
[Version compatibility](03-version-compatibility.en.md). In Docker, the
pre-installation check is in
[Wazuh in Docker, section 2.1](06-wazuh-in-docker.en.md#21-the-official-wazuh-deployment).

## 3. Where the releases are

Requires a GitLab account with access to `quersystem/plugin-wazuh-ens`.

| Location | Use |
|---|---|
| *Deploy → Releases*, in the GitLab project | view the versions and their notes, and download the files in the browser |
| `https://gitlab.com/quersystem/plugin-wazuh-ens/-/releases/vX.Y.Z/downloads/<file>` | the permanent link of each file, for sharing; requires a GitLab session in the browser |
| *Deploy → Package registry → ensfacil → X.Y.Z* | the same four files, in the package registry |
| `https://gitlab.com/api/v4/projects/quersystem%2Fplugin-wazuh-ens/packages/generic/ensfacil/X.Y.Z/<file>` | the download from a server, with a deploy token (section 6) |

> [!note]
> The `/-/releases/…/downloads/…` links do not work from a server: they
> require the browser session. A server always downloads through the API URL.

## 4. Prepare the folder on the server

Each version in its own folder. Retain the previous version's folder (rollback).

```bash
V=1.2.0
R=/opt/ensfacil/releases/$V
sudo mkdir -p "$R"
sudo chown "$USER":root "$R"
```

Replace `1.2.0` with the version being installed. The following sections use
`V` and `R`.

## 5. Download in the browser

1. In GitLab, open the `quersystem/plugin-wazuh-ens` project and go to
   *Deploy → Releases*.
2. Open the `ENSFácil X.Y.Z` release and download its four files, under
   *Assets*.
3. Copy the files to the server folder:

   ```bash
   scp ensfacil-1.2.0-osd-2.19.5.zip deploy-plugin.sh create-admin-role.sh SHA256SUMS \
     <user>@<server>:/opt/ensfacil/releases/1.2.0/
   ```

Continue with section 7.

## 6. Download from the server with a deploy token

With access to `gitlab.com`, the server downloads the release with a project deploy token that can only read packages.

### 6.1 Create the token

A user with the Maintainer role in the project creates it:

1. In `quersystem/plugin-wazuh-ens`, go to *Settings → Repository → Deploy
   tokens* and click *Add token*.
2. Give it a name that states its purpose (for example, `ensfacil-descarga`)
   and, optionally, an expiry date.
3. Select only the `read_package_registry` scope.
4. Click *Create deploy token*.

Expected result: the token user and the token. GitLab shows the token only
once: store it at that moment. If the username field is left empty, GitLab
assigns one in the form `gitlab+deploy-token-<n>`.

> [!warning]
> The token gives access to every published version. Never put it on the command line (`curl -u user:token …`) or in an assignment (`T=…`): it remains in the history and in the process list. Revoke it on the same GitLab page.

### 6.2 Store the token for root only

For later updates, store the token in a curl configuration file readable only by `root`: `/etc/ensfacil/gitlab-descarga.curlrc` (`0600`, `root:root`).

```bash
read -r -p "Usuario del token: " U
read -r -s -p "Token: " T; echo
sudo mkdir -p /etc/ensfacil
printf 'user = "%s:%s"\n' "$U" "$T" \
  | sudo sh -c 'umask 077 && cat > /etc/ensfacil/gitlab-descarga.curlrc'
unset U T
sudo chown root:root /etc/ensfacil/gitlab-descarga.curlrc
sudo chmod 0600 /etc/ensfacil/gitlab-descarga.curlrc
sudo stat -c '%a %U:%G' /etc/ensfacil/gitlab-descarga.curlrc
```

`read` and `printf` are bash builtins: the token does not remain in the history or in the process list.

Expected result: `600 root:root`. The file has a single line,
`user = "<user>:<token>"`.

### 6.3 Download the four files

```bash
V=1.2.0
R=/opt/ensfacil/releases/$V
API=https://gitlab.com/api/v4/projects/quersystem%2Fplugin-wazuh-ens/packages/generic/ensfacil/$V

for f in "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh SHA256SUMS; do
  sudo curl -fsS -K /etc/ensfacil/gitlab-descarga.curlrc -o "$R/$f" "$API/$f" || { echo "ERROR: $f"; break; }
done
ls -l "$R"
```

Expected result: the four files in the folder and no `ERROR` line.

| curl error | Usual cause |
|---|---|
| `401` or `403` | the token is mistyped, expired, revoked or lacks `read_package_registry` |
| `404` | that version is not published, or `V` is misspelled |

### 6.4 Without storing the token

One-off download: curl reads the token from its standard input and it is not stored in any file:

```bash
read -r -p "Usuario del token: " U
read -r -s -p "Token: " T; echo
for f in "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh SHA256SUMS; do
  printf 'user = "%s:%s"\n' "$U" "$T" | curl -fsS -K - -o "$R/$f" "$API/$f" || { echo "ERROR: $f"; break; }
done
unset U T
ls -l "$R"
```

Expected result: the same as in section 6.3.

## 7. Verify the files

```bash
cd "$R"
sha256sum -c SHA256SUMS
sha256sum "ensfacil-$V-osd-2.19.5.zip"
bash deploy-plugin.sh --solo-id "ensfacil-$V-osd-2.19.5.zip"
```

Expected result:

| Check | Expected result |
|---|---|
| `sha256sum -c` | `OK` for the three files |
| `sha256sum` of the zip | the same SHA-256 as stated in the release description |
| `--solo-id` | `ensfacil` |

> [!warning]
> If any line reports `FAILED` or the SHA-256 does not match the release, do
> not install anything: delete the folder and download again.

## 8. First install

Before starting, Wazuh 4.14.7 must be installed and validated
([installation guide, section 9](01-installation-from-scratch.en.md#9-install-and-validate-wazuh-4147)).
`deploy-plugin.sh` uses `python3`, `unzip`, `curl`, `tar`, `systemctl` and
`sudo`.

```bash
cd "$R"
sudo -u wazuh-dashboard test -r "ensfacil-$V-osd-2.19.5.zip" && echo "ZIP_ACCESIBLE=OK"
sudo bash deploy-plugin.sh "ensfacil-$V-osd-2.19.5.zip"
```

The script saves the installed `ensfacil` in `/var/backups/ensfacil/`, stops the dashboard, replaces `ensfacil`, bumps `build.number` and starts the dashboard. The Wazuh plugin does not change.

Expected result: `ZIP_ACCESIBLE=OK` and, at the end of the deployment,
`dashboard: active` and, under `plugins:`, `ensfacil` next to `wazuh`,
`wazuhCore` and `wazuhCheckUpdates`.

If it fails, the script states how to return to the previous state and exits
with an error code. The codes and the backups are in
[Troubleshooting, section 4.1](04-troubleshooting-and-rollback.en.md#41-if-deploy-pluginsh-fails-halfway).

> [!note]
> In Docker `deploy-plugin.sh` is not used (it assumes systemd and packages): [Wazuh in Docker, section 3](06-wazuh-in-docker.en.md#3-build-the-dashboard-image-with-ensfácil).

In a new installation, continue with the ENS configuration (the role of section 9 is optional): first save and seeding of the controls ([installation guide, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration)).
Seeding uses the tools in the repository's `config/`, which the release does not include. GitLab access and clone: [installation guide, sections 10.1 and 10.2](01-installation-from-scratch.en.md#101-validate-access-to-the-main-repository).

## 9. Create the ensfacil_admin role

> [!note]
> Required only if a user without `all_access` must save the configuration or view its history. The Wazuh `admin` user has `all_access`.

Without `ensfacil_admin` or `all_access`, saving returns a 403 error. The role also grants read on `wazuh-ens-snapshots` (the maturity series, [Maturity assessment, section 10.2](10-maturity-assessment.en.md#102-who-reads-it)) and no other permission: each user also needs their Wazuh role with read access to `wazuh-alerts-*` and `wazuh-monitoring-*`.

First in test mode, which sends no change. Replace `<user>` with the dashboard
user who will administer ENSFácil:

```bash
cd "$R"
sudo bash create-admin-role.sh --dry-run --mapear <user>
```

Expected result: the line `== dry-run mode: no change is sent` and the
requests that would be sent (`PUT …/roles/ensfacil_admin` and, if the user
does not have the role, `PUT` or `PATCH …/rolesmapping/ensfacil_admin`).

Then the real run:

```bash
sudo bash create-admin-role.sh --mapear <user>
```

Expected result: `-> 200` or `-> 201` after each request and, at the end,
`users with the role ensfacil_admin: <user>`.

| Option | Effect |
|---|---|
| `--dry-run` | shows the requests that would change something and does not send them |
| `--mapear <user>` | assigns the role to that user; it can be repeated for several users |
| without `--mapear` | only creates the role |

The script uses the indexer admin certificate, without a password, and verifies it against its CA. Default connection: `https://127.0.0.1:9200`. Another indexer: `OS_URL`, `OS_CERT`, `OS_KEY` and `OS_CA` variables ([installation guide, section 13.5](01-installation-from-scratch.en.md#135-create-the-ensfacil_admin-role)).
In Docker, the certificate is issued for `wazuh.indexer` and the script runs
from a container:
[Wazuh in Docker, section 5](06-wazuh-in-docker.en.md#5-create-the-ensfacil_admin-role).

Repeatable: only the missing users are added. An update does not require it: the role is kept.

## 10. Check that it works

```bash
sudo systemctl is-active wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin list
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/api/ensfacil/configuration
```

Expected result:

| Check | Expected result |
|---|---|
| service | `active` |
| plugins | `ensfacil@X.Y.Z`, the installed version, and `wazuh@4.14.7-01`, among others |
| `/api/ensfacil/configuration` | `401`: the plugin route exists and requires a session. A `404` means that the plugin has not loaded |

In the browser, log in to Wazuh Dashboard. In the menu, under "Security
operations", "ENSFácil" must appear, opening on the Panel tab. From 1.2.0,
the OpenSearch Dashboards home page (`/app/home`) also shows the "ENSFácil"
card; the Wazuh home page does not accept other plugins' cards.

If any result differs, follow
[Troubleshooting](04-troubleshooting-and-rollback.en.md#3-basic-diagnosis). In
Docker, the equivalent checks are in
[Wazuh in Docker, section 4](06-wazuh-in-docker.en.md#4-change-the-compose-file-and-start).

### 10.1 The data is still there

Installing, updating or removing the plugin does not modify the indices. Check, with the indexer admin certificate of the all-in-one installation:

```bash
C=/etc/wazuh-indexer/certs
ix() { sudo curl -s --cacert $C/root-ca.pem --cert $C/admin.pem --key $C/admin-key.pem "https://127.0.0.1:9200/$1"; echo; }
ix 'wazuh-ens-configuration/_doc/active?_source_includes=updatedAt'
ix 'wazuh-ens-configuration/_count'
ix 'wazuh-alerts-*/_count?q=_exists_:data.ensfacil'
```

Expected result: `"found":true` with the `updatedAt` of the last save, the number of configuration documents and the number of ENSFácil facts. Record the three values before changing version; afterwards, the configuration must be the same (same `updatedAt`, same documents) and the facts the same or more.

In Docker, the same three queries are made with the `ix` function of
[Wazuh in Docker, section 2.4](06-wazuh-in-docker.en.md#24-indexer-query-function).

## 11. Update to a newer release

1. Read the notes of the new release: its compatibility and whether it brings
   new controls.
2. Save a copy of the ENS configuration document:

   ```bash
   sudo mkdir -p /opt/ensfacil/artifacts
   sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://127.0.0.1:9200/wazuh-ens-configuration/_doc/active \
     | sudo tee "/opt/ensfacil/artifacts/active-$(date +%Y%m%d-%H%M%S).json" >/dev/null
   sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://127.0.0.1:9200/wazuh-ens-configuration/_doc/maturity \
     | sudo tee "/opt/ensfacil/artifacts/maturity-$(date +%Y%m%d-%H%M%S).json" >/dev/null
   ```

   Expected result: the `active-<date>.json` file in `/opt/ensfacil/artifacts`,
   with `"found":true`, and `maturity-<date>.json` (maturity recorded from
   1.4.0; `"found":false` if there is none).

3. Download the new version in its own folder and verify it: sections 4, 6.3
   (or 5) and 7, with the new version in `V`. With the stored token, section
   6.3 is enough.
4. Deploy the new version as in section 8. `deploy-plugin.sh` replaces only
   `ensfacil` and first saves the installed version in
   `/var/backups/ensfacil/`.
5. Check as in section 10. The plugin list must show the new version.
6. Run the `create-admin-role.sh` in the new version's folder again, without
   `--mapear` (existing mappings are kept), so the `ensfacil_admin` role gets
   the permissions the version needs; since 1.4.0, the read on
   `wazuh-ens-snapshots` that maturity uses
   ([Maturity assessment, section 10.2](10-maturity-assessment.en.md#102-who-reads-it)):

   ```bash
   sudo bash create-admin-role.sh
   ```

   Expected result: the script ends without error and
   `GET _plugins/_security/api/roles/ensfacil_admin` shows
   `wazuh-ens-snapshots` under `index_permissions` with `read`.
7. If the version brings new controls or parameters, seed their configuration
   **after** the deployment
   ([update guide, section 8](02-updating-an-existing-environment.en.md#8-seed-and-validate-the-configuration)).
8. Review the dimension levels (C, I, T, A and D) on the
   Configuración screen and, in General, «Datos de la organización»: the items
   pending a choice and those without a common value
   ([installation guide, section 14.5](01-installation-from-scratch.en.md#145-declare-the-policy)).

> [!important]
> The order is mandatory: first the new plugin, then the seeding. A seeding before the deployment can prevent the dashboard from loading.

Keep the previous version's folder until the new one is validated. Full procedure, with manager rules and agents: [update guide](02-updating-an-existing-environment.en.md). In Docker: [Wazuh in Docker, section 12.1](06-wazuh-in-docker.en.md#121-update-to-a-new-version).

## 12. Coming from the integrated version

With the integrated version installed (modified Wazuh plugin, "ENS" app), follow the [transition from the integrated version](02-updating-an-existing-environment.en.md#10-transition-from-the-integrated-version). Use the release zip and the `deploy-plugin.sh` in its folder.

With Wazuh in Docker, ENSFácil is installed on the official image:
[Wazuh in Docker, section 3](06-wazuh-in-docker.en.md#3-build-the-dashboard-image-with-ensfácil).

## 13. Go back to a previous version

To go back, deploy the release of the previous version. If its folder no
longer exists, download it again (section 6.3, with that version in `V`).
Replace `X.Y.Z` with the target version:

```bash
V=X.Y.Z
R=/opt/ensfacil/releases/$V
cd "$R" && sha256sum -c SHA256SUMS \
  && sudo bash deploy-plugin.sh "ensfacil-$V-osd-2.19.5.zip"
```

Expected result: `OK` for the three files and, at the end, `dashboard: active`.
Then check as in section 10: the plugin list must show the previous version.

If the removed version had seeded controls that the previous one does not
know, also restore the copy of the configuration. To go back from 1.3.0 to
1.2.0 with its templates, or to 1.1.0 after «Repartir por agentes», restore the
earlier version of the document
([Configuration by controls and templates, section 12](09-configuration-by-system.en.md#12-compatibility-and-rollback)). The full procedure is in
[Troubleshooting and rollback, section 4](04-troubleshooting-and-rollback.en.md#4-reinstall-the-previous-ensfácil-version).
In Docker:
[Wazuh in Docker, section 12.2](06-wazuh-in-docker.en.md#122-go-back-to-the-previous-version).

## 14. What the release does not install

The facts are produced by the manager rules and by the runbooks on each machine, which are installed separately:

- the rules on the manager, with the `install-manager.sh` of each runbook
  ([installation guide, sections 10 to 12](01-installation-from-scratch.en.md#10-configure-authorized-access-to-gitlab);
  in Docker, [Wazuh in Docker, section 13](06-wazuh-in-docker.en.md#13-manager-side));
- the collectors on each machine, with each runbook's `01-installation` guide
  ([runbooks and registers](05-runbooks-and-registers.en.md#runbooks-per-control));
- the ENS configuration, with the tools in the repository's `config/`
  ([installation guide, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration)).

## 15. Change version or uninstall

| Starting point | Goal | Procedure |
|---|---|---|
| the integrated version (the modified Wazuh plugin, with the "ENS" app) | ENSFácil from a release | the [transition from the integrated version](02-updating-an-existing-environment.en.md#10-transition-from-the-integrated-version): install the release next to the integrated version, compare, and reinstall the official `wazuh-dashboard` 4.14.7 package |
| an ENSFácil release | a newer one | section 11 |
| an ENSFácil release | the previous one | section 13 |
| ENSFácil, after the transition | the integrated version again | [go back to the integrated version](04-troubleshooting-and-rollback.en.md#6-go-back-to-the-integrated-version), while the transition folder is kept |
| ENSFácil | remove it | the block below |

In every case the data is kept; check it before and after as in section 10.1.

Uninstalling ENSFácil modifies neither the Wazuh plugin nor the data:

```bash
sudo systemctl stop wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove ensfacil
sudo rm -rf /usr/share/wazuh-dashboard/plugins/ensfacil
sudo systemctl start wazuh-dashboard
```

Expected result: the dashboard starts again without `ensfacil`. The checks,
and the removal of the role and the configuration if ENSFácil will not be used
again, are in
[Remove ENSFácil](04-troubleshooting-and-rollback.en.md#5-remove-ensfácil). In
Docker:
[Wazuh in Docker, section 12.3](06-wazuh-in-docker.en.md#123-remove-ensfácil).
