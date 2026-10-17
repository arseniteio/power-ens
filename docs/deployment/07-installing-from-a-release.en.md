# Installing ENSFácil from a release
[Español](07-installing-from-a-release.md)

[[_TOC_]]

## 1. Objective

This guide installs or updates the ENSFácil plugin with the files of a GitLab
release. You do not need to build anything or have the source code.

This is the recommended way. If you need to build the zip yourself, follow
[Building from source](08-building-from-source.en.md).

> [!note]
> The release installs the plugin, which judges. The data it judges is
> collected by the manager rules and the runbooks on each machine, which are
> installed separately (section 14).

## 2. What a release is

Every published version of ENSFácil has a GitLab release, named
`ENSFácil X.Y.Z` and tagged `vX.Y.Z`. It carries four files:

| File | What it is |
|---|---|
| `ensfacil-X.Y.Z-osd-2.19.5.zip` | the plugin, built for OpenSearch Dashboards 2.19.5 |
| `deploy-plugin.sh` | the script that installs the zip on Wazuh Dashboard |
| `create-admin-role.sh` | the script that creates the `ensfacil_admin` role and assigns it |
| `SHA256SUMS` | the SHA-256 sum of the other three files |

The release description has the notes for that version (its entry in the
[changelog](../../CHANGELOG.en.md)), the compatibility, the quick install
commands, a link to this guide and the SHA-256 of the zip.

### 2.1 Compatibility

Each zip works with a single OpenSearch Dashboards version, the one in its name
(`-osd-2.19.5`). OpenSearch Dashboards only accepts a plugin built for its exact
version.

| ENSFácil | Wazuh | OpenSearch Dashboards | File |
|---|---|---|---|
| `1.x` | `4.14.7` | `2.19.5` | `ensfacil-1.x.y-osd-2.19.5.zip` |

Each release states its compatibility in its description. Check it against your
version before you download anything:

```bash
dpkg-query -W -f='${Package} ${Version}\n' wazuh-dashboard
sudo python3 -c 'import json; print(json.load(open("/usr/share/wazuh-dashboard/package.json"))["version"])'
```

What you should see: `wazuh-dashboard 4.14.7-1` and `2.19.5`. With another
version, stop here: see [version compatibility](03-version-compatibility.en.md).

## 3. Where the releases are

The project is private: everything below needs a GitLab account with access to
`quersystem/plugin-wazuh-ens`.

| Where | What for |
|---|---|
| *Deploy → Releases*, in the GitLab project | see the versions and their notes, and download the files in the browser |
| `https://gitlab.com/quersystem/plugin-wazuh-ens/-/releases/vX.Y.Z/downloads/<file>` | the permanent link to each file, to share it; it needs a GitLab session in the browser |
| *Deploy → Package registry → ensfacil → X.Y.Z* | the same four files, in the package registry |
| `https://gitlab.com/api/v4/projects/quersystem%2Fplugin-wazuh-ens/packages/generic/ensfacil/X.Y.Z/<file>` | the download from a server, with a deploy token (section 6) |

> [!note]
> The `/-/releases/…/downloads/…` links do not work from a server: they need
> the browser session. A server always downloads through the API URL.

## 4. Prepare the folder on the server

Each version goes in its own folder. Keep the folder of the previous version:
it is your way back.

```bash
V=1.1.0
R=/opt/ensfacil/releases/$V
sudo mkdir -p "$R"
sudo chown "$USER":root "$R"
```

Replace `1.1.0` with the version you are installing. The following sections use
`V` and `R`.

## 5. Download in the browser

1. In GitLab, open the `quersystem/plugin-wazuh-ens` project and go to
   *Deploy → Releases*.
2. Open the `ENSFácil X.Y.Z` release and download its four files, under
   *Assets*.
3. Copy them to the folder on the server:

   ```bash
   scp ensfacil-1.1.0-osd-2.19.5.zip deploy-plugin.sh create-admin-role.sh SHA256SUMS \
     <usuario>@<servidor>:/opt/ensfacil/releases/1.1.0/
   ```

Continue at section 7.

## 6. Download from the server with a deploy token

If the server can reach `gitlab.com`, it can download the release itself. For
that it needs a project deploy token that can only read packages.

### 6.1 Create the token

Someone with the Maintainer role in the project creates it:

1. In `quersystem/plugin-wazuh-ens`, go to *Settings → Repository → Deploy
   tokens* and click *Add token*.
2. Give it a name that says what it is for (for example, `ensfacil-descarga`)
   and, if you want, an expiration date.
3. Select only the `read_package_registry` scope.
4. Click *Create deploy token*.

What you should see: the token's username and the token. GitLab shows the token
only once: save it right then. If you left the username empty, GitLab sets one
like `gitlab+deploy-token-<n>`.

> [!warning]
> The token gives access to every published version. Never put it on the
> command line (`curl -u user:token …`) or in an assignment (`T=…`): it would
> stay in the shell history and in the process list. To withdraw it, revoke it
> in the same GitLab screen.

### 6.2 Store the token for root only

For later updates, store the token in a curl configuration file that only
`root` can read: `/etc/ensfacil/gitlab-descarga.curlrc` (mode `0600`, owned by
`root:root`).

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

`read` and `printf` are bash builtins: the token never goes on any process's
command line and does not stay in the history.

What you should see: `600 root:root`. The file has a single line,
`user = "<usuario>:<token>"`.

### 6.3 Download the four files

```bash
V=1.1.0
R=/opt/ensfacil/releases/$V
API=https://gitlab.com/api/v4/projects/quersystem%2Fplugin-wazuh-ens/packages/generic/ensfacil/$V

for f in "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh SHA256SUMS; do
  sudo curl -fsS -K /etc/ensfacil/gitlab-descarga.curlrc -o "$R/$f" "$API/$f" || { echo "ERROR: $f"; break; }
done
ls -l "$R"
```

What you should see: the four files in the folder and no `ERROR` line.

| curl error | Usual cause |
|---|---|
| `401` or `403` | the token is mistyped, expired, revoked or lacks `read_package_registry` |
| `404` | that version is not published, or `V` is misspelled |

### 6.4 Without storing the token

For a one-off download, curl can read the token from its standard input. That
way it stays in no file:

```bash
read -r -p "Usuario del token: " U
read -r -s -p "Token: " T; echo
for f in "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh SHA256SUMS; do
  printf 'user = "%s:%s"\n' "$U" "$T" | curl -fsS -K - -o "$R/$f" "$API/$f" || { echo "ERROR: $f"; break; }
done
unset U T
ls -l "$R"
```

What you should see: the same as in section 6.3.

## 7. Verify the files

```bash
cd "$R"
sha256sum -c SHA256SUMS
sha256sum "ensfacil-$V-osd-2.19.5.zip"
bash deploy-plugin.sh --solo-id "ensfacil-$V-osd-2.19.5.zip"
```

What you should see:

| Check | Expected result |
|---|---|
| `sha256sum -c` | `OK` for the three files |
| `sha256sum` of the zip | the same SHA-256 as in the release description |
| `--solo-id` | `ensfacil` |

> [!warning]
> If any line says `FAILED` or the SHA-256 does not match the release, do not
> install anything: delete the folder and download again.

## 8. First install

Before you start, Wazuh 4.14.7 must be installed and validated
([installation guide, section 9](01-installation-from-scratch.en.md#9-install-and-validate-wazuh-4147)).
`deploy-plugin.sh` uses `python3`, `unzip` and `curl`.

```bash
cd "$R"
sudo -u wazuh-dashboard test -r "ensfacil-$V-osd-2.19.5.zip" && echo "ZIP_ACCESIBLE=OK"
sudo bash deploy-plugin.sh "ensfacil-$V-osd-2.19.5.zip"
```

The script keeps the installed `ensfacil`, if there is one, in
`/var/backups/ensfacil/`. Then it stops the dashboard, removes the previous
`ensfacil` version, installs the zip, bumps the dashboard `build.number` and
starts it. It only touches `ensfacil`: the Wazuh plugin stays as it is.

What you should see: `ZIP_ACCESIBLE=OK` and, at the end of the deployment,
`dashboard: active` and, under `plugins:`, `ensfacil` next to `wazuh`,
`wazuhCore` and `wazuhCheckUpdates`.

If it fails, the script says how to go back to how things were and exits with an
error code. The codes and the backups are in
[troubleshooting, section 4.1](04-troubleshooting-and-rollback.en.md#41-if-deploy-pluginsh-fails-halfway).

> [!note]
> Does Wazuh Dashboard run in a container? `deploy-plugin.sh` assumes systemd
> and a package installation. Use the release zip as in
> [Wazuh in Docker, section 3](06-wazuh-in-docker.en.md#3-build-the-dashboard-image-with-ensfácil).

On a new installation, continue with the ENS configuration (the role in
section 9 is optional): the first save and the seeding of the controls
([installation guide, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration)).
The seeding uses the tools in the repository's `config/`, which the release
does not carry.

## 9. Create the ensfacil_admin role

> [!note]
> Optional for now. The Wazuh `admin` user, who has `all_access`, can already
> save the configuration without this role. It is only needed if another user,
> without `all_access`, has to save it or see its history.

Only users with the `ensfacil_admin` or `all_access` role can save the ENS
configuration and see its history. The others see it, but get a 403 error when
they save.

The role grants no permission by itself. Each user also needs their usual Wazuh
role, with read access to `wazuh-alerts-*` and `wazuh-monitoring-*`.

First in test mode, which changes nothing. Replace `<usuario>` with the
dashboard user who will administer ENSFácil:

```bash
cd "$R"
sudo bash create-admin-role.sh --dry-run --mapear <usuario>
```

What you should see: the line `== modo prueba: no se envía ningún cambio` and the
requests that would be sent (`PUT …/roles/ensfacil_admin` and, if the user does
not have it, `PUT` or `PATCH …/rolesmapping/ensfacil_admin`).

Then, for real:

```bash
sudo bash create-admin-role.sh --mapear <usuario>
```

What you should see: `-> 200` or `-> 201` after each request and, at the end,
`usuarios con el rol ensfacil_admin: <usuario>`.

| Option | What it does |
|---|---|
| `--dry-run` | shows the requests that would change something and does not send them |
| `--mapear <usuario>` | assigns the role to that user; repeat it for several users |
| without `--mapear` | only creates the role |

The script uses the indexer administrator certificate, with no password, and
verifies the indexer's certificate against its CA. It talks to
`https://127.0.0.1:9200`, the name Wazuh issues that certificate for. For
another indexer, use the `OS_URL`, `OS_CERT`, `OS_KEY` and `OS_CA` variables.
The details are in the
[installation guide, section 13.5](01-installation-from-scratch.en.md#135-create-the-ensfacil_admin-role).

It can be repeated: the role is written the same way and only the missing users
are added. When you update, there is no need: the role stays.

## 10. Check that it works

```bash
sudo systemctl is-active wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin list
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/api/ensfacil/configuration
```

What you should see:

| Check | Expected result |
|---|---|
| service | `active` |
| plugins | `ensfacil@X.Y.Z`, the version you just installed, and `wazuh@4.14.7-01`, among others |
| `/api/ensfacil/configuration` | `401`: the plugin route exists and asks for a session. A `404` means the plugin did not load |

In the browser, log in to Wazuh Dashboard. In the menu, under «Security
operations», «ENSFácil» must appear, and it opens on the Panel tab.

If something does not look like this, follow the [troubleshooting guide](04-troubleshooting-and-rollback.en.md#3-basic-diagnosis).

### 10.1 The data is still there

Installing, updating or removing the plugin does not touch the indices: the ENS
configuration, its history and the runbooks' facts stay where they were. To
check it, with the indexer's admin certificate:

```bash
C=/etc/wazuh-indexer/certs
ix() { sudo curl -s --cacert $C/root-ca.pem --cert $C/admin.pem --key $C/admin-key.pem "https://127.0.0.1:9200/$1"; echo; }
ix 'wazuh-ens-configuration/_doc/active?_source_includes=updatedAt'
ix 'wazuh-ens-configuration/_count'
ix 'wazuh-alerts-*/_count?q=_exists_:data.ensfacil'
```

What you should see: `"found":true` with the `updatedAt` of the last time the
configuration was saved, the number of configuration documents and the number of
ENSFácil facts. Write the three down before changing version: afterwards the
configuration must be the same (same `updatedAt`, same documents) and the facts
the same or more, because the runbooks keep sending.

## 11. Update to a newer release

1. Read the notes of the new release. Check its compatibility and whether it
   brings new controls.
2. Keep a copy of the ENS configuration document:

   ```bash
   sudo mkdir -p /opt/ensfacil/artifacts
   sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://127.0.0.1:9200/wazuh-ens-configuration/_doc/active \
     | sudo tee "/opt/ensfacil/artifacts/active-$(date +%Y%m%d-%H%M%S).json" >/dev/null
   ```

3. Download the new version into its own folder and verify it: sections 4, 6.3
   (or 5) and 7, with the new version in `V`. With the token stored, section
   6.3 is enough.
4. Deploy it as in section 8. `deploy-plugin.sh` replaces only `ensfacil` and
   first keeps the installed version in `/var/backups/ensfacil/`.
5. Check as in section 10. The plugin list must show the new version.
6. If the version brings new controls or parameters, seed their configuration
   **after** deploying
   ([update guide, section 8](02-updating-an-existing-environment.en.md#8-seed-and-validate-the-configuration)).

> [!important]
> The order matters: first the new plugin, then the seeding. The installed
> plugin validates the configuration document with its own rules: seeding
> first can leave the whole dashboard unable to load.

Keep the previous version's folder until the new one is validated. The full
procedure, with the manager rules and the agents, is in the
[update guide](02-updating-an-existing-environment.en.md).

## 12. Coming from the integrated version

If the environment still has the integrated version (the modified Wazuh plugin,
with the «ENS» app in the menu), follow the
[transition from the integrated version](02-updating-an-existing-environment.en.md#10-transition-from-the-integrated-version).
Use the release zip and the `deploy-plugin.sh` in its folder. The configuration
is not migrated: both versions use the same index.

## 13. Go back to a previous version

To go back, deploy the release of the previous version. If you no longer have
its folder, download it again (section 6.3 with that version in `V`). Replace
`X.Y.Z` with the version you are going back to:

```bash
V=X.Y.Z
R=/opt/ensfacil/releases/$V
cd "$R" && sha256sum -c SHA256SUMS \
  && sudo bash deploy-plugin.sh "ensfacil-$V-osd-2.19.5.zip"
```

What you should see: `OK` for the three files and, at the end,
`dashboard: active`. Then check as in section 10: the plugin list must show the
previous version.

If the withdrawn version had seeded controls that the previous one does not
know, also restore the configuration copy. The full procedure is in
[troubleshooting and rollback, section 4](04-troubleshooting-and-rollback.en.md#4-reinstall-the-previous-ensfácil-version).

## 14. What the release does not install

The plugin judges: it checks the facts against the policy declared on screen. It
collects nothing. The facts come from the manager rules and the runbooks on each
machine, and they are installed separately:

- the rules on the manager, with each runbook's `install-manager.sh`
  ([installation guide, sections 10 to 12](01-installation-from-scratch.en.md#10-configure-authorized-access-to-gitlab));
- the collectors on each machine, with each runbook's `01-installation` guide
  ([runbooks and registers](05-runbooks-and-registers.en.md#runbooks-per-control));
- the ENS configuration, with the tools in the repository's `config/`
  ([installation guide, section 14](01-installation-from-scratch.en.md#14-initialize-and-seed-the-ens-configuration)).

Without the rules and the runbooks, the dashboard has no facts to judge.

## 15. Change version or uninstall

| You have | You want | What to do |
|---|---|---|
| the integrated version (the modified Wazuh plugin, with the «ENS» app) | ENSFácil from a release | the [transition from the integrated version](02-updating-an-existing-environment.en.md#10-transition-from-the-integrated-version): install the release next to the integrated one, compare, and reinstall the official `wazuh-dashboard` 4.14.7 package |
| an ENSFácil release | a newer one | section 11 |
| an ENSFácil release | the previous one | section 13 |
| ENSFácil, after the transition | the integrated version again | [go back to the integrated version](04-troubleshooting-and-rollback.en.md#6-go-back-to-the-integrated-version), while the transition folder is kept |
| ENSFácil | remove it | see below |

In every case the data stays where it is: check it before and after as in
section 10.1.

Uninstalling ENSFácil does not touch the Wazuh plugin or the data:

```bash
sudo systemctl stop wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove ensfacil
sudo rm -rf /usr/share/wazuh-dashboard/plugins/ensfacil
sudo systemctl start wazuh-dashboard
```

What you should see, and how to also remove the role and the configuration if
ENSFácil is not going to be used again: [remove ENSFácil](04-troubleshooting-and-rollback.en.md#5-remove-ensfácil).
