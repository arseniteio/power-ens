# Manager in a container (official Wazuh Docker images)
[Español](06-wazuh-in-docker.md)

What changes compared to the [installation from scratch](01-installation-from-scratch.en.md)
when Wazuh runs on the official `wazuh/wazuh-manager` and `wazuh/wazuh-dashboard`
images (Amazon Linux 2023). The order of the steps is the same; this page only
covers what is done differently in a container. In the examples, `MGR` is the
name of the manager container (`docker ps --format '{{.Names}}'`; in the official
*single-node* deployment it is usually `single-node-wazuh.manager-1`).

> [!important]
> **What is verified and what is not.**
>
> - **Verified in the lab (VM with packages):** the whole procedure of
>   [guide 01](01-installation-from-scratch.en.md).
> - **Verified in the lab with the `wazuh/wazuh-manager:4.14.7` image**
>   (isolated container, no indexer and no agents, 2026-10-02): the missing
>   tools; installing them with `dnf`; the `install-manager.sh` of op.acc.1,
>   op.exp.7, op.exp.8 and op.exp.9 with `ENSFACIL_SYSTEMCTL` (restart and
>   `wazuh-logtest` correct); the three manager collectors launched with
>   `docker exec` and `ENS_HOST`; that the image's start script copies
>   `/wazuh-config-mount` over `/var/ossec` on every start.
> - **Guidance not tested yet:** the full deployment with `docker compose`,
>   indexer and agents; the dashboard image with ENSFácil; the host cron;
>   recreating the container with the proposed volumes; a multi-node cluster.
>   Anything still to be checked says "to be verified".

[[_TOC_]]

## 1. What the manager image lacks

| Missing | Who uses it | What happens without it | Fix |
|---|---|---|---|
| `systemctl` | the `install-manager.sh` scripts, to restart the manager | the installer fails on restart and rolls back its change | `ENSFACIL_SYSTEMCTL` (section 4) |
| `flock` | the common emitter of every collector | **no fact is written at all** (the emitter exits with an error) | package `util-linux-core` |
| `jq` | the `install-manager.sh` of op.exp.7, op.exp.8 and op.exp.9, and the emitter | the installer stops (op.exp.7's tries `apt-get`, which does not exist) | package `jq` |
| `hostname` | the emitter (`host` field of each fact) | `host` is empty | package `hostname`, or `ENS_HOST` (section 5) |
| `cron` | the manager collectors (op.exp.7, op.exp.8, op.exp.9) | they never run | host cron with `docker exec` (section 6) |
| `git` | cloning the runbooks; building the plugin | — | clone on the host and copy; build elsewhere (section 7) |

`python3` is present in the image.

## 2. Manager image with the tools

Whatever is installed with `dnf` inside a container is lost when it is
recreated. Pin it in your own image, with the same version as the official one:

```dockerfile
FROM wazuh/wazuh-manager:4.14.7
RUN dnf install -y jq util-linux-core hostname && dnf clean all
```

In `docker-compose.yml`, the manager service then uses that image. To get going
without rebuilding (lost when the container is recreated):

```bash
docker exec MGR dnf install -y jq util-linux-core hostname
docker exec MGR sh -c 'command -v jq flock hostname'
```

## 3. What persists and what is lost when the container is recreated

The official deployment mounts volumes on `/var/ossec/etc`, `/var/ossec/logs`,
`/var/ossec/queue`, `/var/ossec/api/configuration`, `/var/ossec/var/multigroups`,
`/var/ossec/integrations`, `/var/ossec/active-response/bin`,
`/var/ossec/agentless`, `/var/ossec/wodles`, `/etc/filebeat` and
`/var/lib/filebeat`.

| Path | Contents | Persists? |
|---|---|---|
| `/var/ossec/etc/rules/ensfacil_*.xml` | rules of the 17 controls | yes (`/var/ossec/etc` volume) |
| `/var/ossec/etc/shared/ens/agent.conf`, `…/ens-copias/agent.conf` | agents' `<localfile>` | yes |
| `/var/ossec/etc/ossec.conf` | manager `<localfile>` (op.exp.7, op.exp.8, op.exp.9) | **no, if `wazuh_manager.conf` is mounted** (see warning) |
| `/etc/ensfacil/` | the organization's registers and `.env` files | **no**: mount a volume |
| `/var/lib/ensfacil/` | collector state | **no**: mount a volume |
| `/var/log/ensfacil/` | fact files read by logcollector | **no**: mount a volume |
| `/opt/ensfacil/`, `/usr/local/bin/ens_opexp*` | libraries, templates and collectors | no: re-run the `install-manager.sh` of op.exp.7, op.exp.8 and op.exp.9 after recreating (they do not overwrite `.env` files or registers) |
| `/var/ossec/backup/` | copies the installers make before touching anything | no (optional: volume) |

```yaml
# docker-compose.yml, manager service (add to its volumes)
      - ensfacil_etc:/etc/ensfacil
      - ensfacil_state:/var/lib/ensfacil
      - ensfacil_log:/var/log/ensfacil
# and declare ensfacil_etc, ensfacil_state and ensfacil_log in the volumes: section
```

> [!warning]
> The official deployment mounts `config/wazuh_cluster/wazuh_manager.conf` on
> `/wazuh-config-mount/etc/ossec.conf`, and the image **copies it over
> `/var/ossec/etc/ossec.conf` on every start**. The `<localfile>` blocks added
> by the `install-manager.sh` of op.exp.7, op.exp.8 and op.exp.9 disappear on
> the next container restart and those three controls stop receiving data.
> Add this block, at the end, **to the mounted file on the host**:
>
> ```xml
> <!-- ENSFácil: facts from the manager collectors -->
> <ossec_config>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_exp_7.json</location>
>   </localfile>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_exp_8.json</location>
>   </localfile>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_exp_9.json</location>
>   </localfile>
> </ossec_config>
> ```

## 4. Rules on the manager: `install-manager.sh` without systemd

The `install-manager.sh` scripts read `SYSTEMCTL="${ENSFACIL_SYSTEMCTL:-systemctl}"`
and use it for one thing only: `"$SYSTEMCTL" restart wazuh-manager` (also in their
rollback). `wazuh-control restart wazuh-manager` ignores the second argument,
restarts every daemon and returns an error if the configuration is invalid or a
daemon fails to start, so the installers' rollback keeps working. **Do not edit
the scripts**: passing the variable is enough.

Clone the runbooks on the host (or on a workstation with GitLab access), as in
section 10.3 of guide 01, and copy them into the container:

```bash
# on the host, with the 17 Linux runbooks in ./ensfacil/<control> and runbooks.txt
docker cp ./ensfacil/. MGR:/opt/ensfacil-runbooks/
docker exec MGR /var/ossec/bin/agent_groups -a -g ens -q
docker exec MGR /var/ossec/bin/agent_groups -a -g ens-copias -q

while read -r r; do
  echo "===== $r ====="
  docker exec -e ENSFACIL_SYSTEMCTL=/var/ossec/bin/wazuh-control MGR \
    bash "/opt/ensfacil-runbooks/$r/install-manager.sh" || { echo "ERROR: $r"; break; }
done < runbooks.txt
```

Check (equivalent to section 12.1 of guide 01):

```bash
docker exec MGR /var/ossec/bin/wazuh-control status | grep -E 'analysisd|logcollector|remoted'
docker exec MGR /var/ossec/bin/wazuh-analysisd -t && echo "CONFIG_MANAGER=OK"
```

Where guide 01 says `sudo systemctl restart wazuh-manager`, in the container it is
`docker exec MGR /var/ossec/bin/wazuh-control restart`. Do not use
`docker restart` for this: it copies `wazuh_manager.conf` again (warning in
section 3).

## 5. The host name without the `hostname` command

The common emitter (`/opt/ensfacil/ensfacil-emit.sh`) takes the `host` field from
`ENS_HOST` and, if unset, from `$(hostname)`. Two options:

- with the image of section 2 (`hostname` installed), it is the container's
  name: pin it with `hostname:` in `docker-compose.yml` (the official one uses
  `wazuh.manager`) so it does not change on recreation;
- or pass `-e ENS_HOST=<name>` in every `docker exec` (section 6).

The manager collectors have no other call to `hostname`. The only thing
`ENS_HOST` does not cover: op.exp.9 recognizes the manager itself in the
`sistemas` column of the incident register by the container name (Python's
`socket.gethostname()`, no command needed); with a fixed `hostname:` there are no
surprises.

## 6. Scheduling the manager collectors from the host

The image has no cron, and the `install-manager.sh` scripts leave their files in
the container's `/etc/cron.d/`, where nothing reads them (they do no harm).
Schedule them in the host's cron with the same cadences as the runbooks:

```bash
# /etc/cron.d/ensfacil-manager on the HOST (replace MGR and the name)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
23 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp7_collect.sh >/dev/null 2>&1
47 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp8_manager_collect.sh >/dev/null 2>&1
23 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp9_manager_collect.sh >/dev/null 2>&1
```

The first pass, by hand (op.exp.7's seeds 30 days of alerts and takes a few
minutes):

```bash
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp7_collect.sh
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp8_manager_collect.sh
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp9_manager_collect.sh
docker exec MGR sh -c 'wc -l /var/log/ensfacil/op_exp_*.json'
```

If the optional op.exp.4 bridge is enabled (`--con-puente-vd`), its line is
`40 * * * * root docker exec MGR /opt/ensfacil/ens_opexp4_vd_bridge.py >>/var/log/ensfacil/opexp4-vd-bridge.log 2>&1`
(to be verified in a container).

## 7. The plugin in the dashboard container

ENSFácil is a plugin of its own (`ensfacil`) installed **next to** the Wazuh
plugin, without touching it. In a container this is done with a custom image
based on the official one.

**Building** needs `git` and the OpenSearch Dashboards source code: it is done
**outside production**, on a build machine with exactly the same versions
(section 13 of guide 01; result `ensfacil-2.19.5.zip`), or Quersystem is asked
for the zip built for Wazuh `4.14.7` (OpenSearch Dashboards `2.19.5`). A zip for
another version does not install.

**Installing.** `config/deploy-plugin.sh` assumes systemd and a package-based
installation. In a container, the same is done in a custom image, with the zip
next to the `Dockerfile`:

```dockerfile
FROM wazuh/wazuh-dashboard:4.14.7
USER root
COPY ensfacil-2.19.5.zip /tmp/ensfacil-2.19.5.zip
RUN /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin install file:///tmp/ensfacil-2.19.5.zip --allow-root \
 && rm /tmp/ensfacil-2.19.5.zip \
 && chown -R wazuh-dashboard:wazuh-dashboard /usr/share/wazuh-dashboard/plugins/ensfacil \
 && python3 -c "import json; f='/usr/share/wazuh-dashboard/package.json'; p=json.load(open(f)); p['build']['number']=str(int(p['build']['number'])+1); json.dump(p, open(f,'w'), indent=2)"
USER wazuh-dashboard
```

```bash
docker build -t wazuh-dashboard-ensfacil:4.14.7 .
docker run --rm --entrypoint /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin \
  wazuh-dashboard-ensfacil:4.14.7 list
# in docker-compose.yml, the dashboard service: image: wazuh-dashboard-ensfacil:4.14.7
docker compose up -d
```

What you should see in the list: `ensfacil@1.0.0` next to `wazuh`, `wazuhCore`
and `wazuhCheckUpdates`. The Wazuh plugin is the one from the official image: it
is neither removed nor replaced.

Without bumping `build.number`, the browser keeps using the files of the
previous ENSFácil version when it is updated (the bundle URL depends on that
number). Each new ENSFácil version is a new image with the new zip.

Then create the `ensfacil_admin` role (section 13.5 of guide 01) with the
indexer administrator certificate of the deployment (section 8).
`create-admin-role.sh` verifies the indexer certificate against its root CA, so
the URL must carry the name that certificate was issued for. In the official
deployment (`config/certs.yml` of `wazuh-docker`) it is `wazuh.indexer`, not
`127.0.0.1`: with `https://127.0.0.1:9200`, curl refuses («no alternative
certificate subject name matches»). The name is in the certificate itself:

```bash
C=/path/to/the/deployment/config/wazuh_indexer_ssl_certs
openssl x509 -in $C/wazuh.indexer.pem -noout -ext subjectAltName
```

That name only resolves inside the deployment's Docker network. From the host,
where `docker-compose.yml` publishes the indexer port `9200`, an `/etc/hosts`
entry pointing it to the machine itself is enough; `OS_CA` is the deployment's
root CA (`root-ca.pem`), the one that signed the indexer certificate:

```bash
grep -q '[[:space:]]wazuh\.indexer$' /etc/hosts || echo '127.0.0.1 wazuh.indexer' | sudo tee -a /etc/hosts
sudo env OS_CERT=$C/admin.pem OS_KEY=$C/admin-key.pem OS_CA=$C/root-ca.pem OS_URL=https://wazuh.indexer:9200 \
  bash /opt/ensfacil/repo/config/create-admin-role.sh --mapear <usuario>
```

The entry can be removed afterwards (`sudo sed -i '/[[:space:]]wazuh\.indexer$/d' /etc/hosts`).
If the indexer is not published on the host, do the same from a machine that
reaches it, with the entry pointing to its address. In a multi-node cluster, the
name is the one of the node you talk to (`wazuh1.indexer` in the official
multi-node deployment): always use the one shown in the certificate.

Checked on the `wazuh/wazuh-dashboard:4.14.7` image: it ships `python3` and the
line that bumps `build.number` works. To be verified (not tested yet on a Docker
deployment): installing the ENSFácil zip in the image, starting it in the
customer's environment and creating the role with the indexer certificate's
name.

## 8. Seeding and validating the configuration

`inject-control.py`, `set-parameters.py` and downloading the `active` document
talk to the indexer with its **admin certificate**. In the official Docker
deployment the certificates are generated on the host, in
`config/wazuh_indexer_ssl_certs/` (`admin.pem`, `admin-key.pem`). Run them from
the host (Python 3 and the plugin repository cloned there), pointing at the
indexer published by `docker-compose.yml` (port `9200`):

```bash
C=/path/to/deployment/config/wazuh_indexer_ssl_certs
CERT="OS_CERT=$C/admin.pem OS_KEY=$C/admin-key.pem ENS_OS_URL=https://127.0.0.1:9200"
cd /opt/ensfacil/repo/config
sudo env $CERT python3 inject-control.py op.exp.7            # plan
sudo env $CERT python3 inject-control.py op.exp.7 --apply    # write
```

The rest is as in section 14 of guide 01 (first save from the screen, backup
copy, seeding the 17, `set-parameters.py`). Validating the whole document
(`validate-configuration.ts`) does not need the indexer: download the document
with the same certificate and validate it on any machine with Node.js 18 or
later (or with the `node:22-alpine` image, section 14.4). If the indexer is not
published on the host, run them from a machine that reaches it with that
certificate (to be verified per deployment).

## 9. What is not yet measured the same way in a container

- **op.exp.8 EV-13** (logging system services): the collector asks systemd about
  `wazuh-manager`, `wazuh-indexer` and `wazuh-dashboard`. In the container there
  is no systemd, so it emits `activo=desconocido`, which the panel judges
  `NO_CUMPLE`. No variable covers it; the collector still has to be adapted. Do
  not fake `systemctl`: that would be false evidence.
- **op.exp.8 on the manager row** also measures the server itself (auditd,
  journald, time). Inside the container there is no auditd and it reports "not
  installed"; what should be measured on the host running Docker is to be
  verified.
- **Multi-node cluster**: to be verified (rules and `agent.conf` are synced from
  the master; the manager collectors and their `<localfile>` would go on the
  master).
