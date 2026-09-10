# ENSFácil version compatibility
[Español](03-version-compatibility.md)

[[_TOC_]]

## 1. Objective

This guide defines ENSFácil's known compatibility scope and the procedure
that must be followed before using a different version of Wazuh Dashboard.

> [!important]
> Compatibility must never be assumed solely because Wazuh can be installed or started successfully. ENSFácil modifies and adds components inside the official Wazuh Dashboard plugin, and those integration points can change between versions.

## 2. Currently recognized versions

The current integration package recognizes the following Wazuh Dashboard
versions:

| Recognized version |
|---|
| Wazuh 4.14.5. |
| Wazuh 4.14.7. |

The check is implemented in
`integration/wazuh-dashboard/check-integration.sh`.

Any other version must be considered unvalidated until a new compatibility
cycle is completed.

## 3. Mandatory check before integrating ENSFácil

Define the Wazuh plugin tree to be evaluated:

```bash
REPO=/opt/ensfacil/repo
TARGET=/opt/ensfacil/build/plugins/main
PKG=$REPO/integration/wazuh-dashboard

( cd "$PKG" && sha256sum -c SHA256SUMS )
"$PKG/check-integration.sh" "$TARGET"
```

The script identifies the plugin version and analyzes the state of the
patches and files that make up the ENSFácil integration.

Only continue when the run finishes with:

```text
RESULTADO=COMPATIBLE
```

> [!warning]
> If it returns `RESULTADO=NO_COMPATIBLE`, conflicts appear, or it reports an unvalidated version, `apply-integration.sh` must not be run on that tree.

## 4. Evaluate a new Wazuh version

A Wazuh version other than the currently recognized ones must first be
evaluated in an independent lab environment.

> [!warning]
> Do not modify a production environment directly to perform this validation.

The compatibility procedure must include:

1. Obtain the official code corresponding to the new version of Wazuh
   Dashboard and its plugins.
2. Prepare a clean build tree for that version.
3. Compare the points modified by ENSFácil with the files of the new
   version.
4. Run the integration checks before applying changes.
5. Adapt the patches only if the new version has changed the integration
   points.
6. Apply ENSFácil on the clean tree and check that there are no conflicts
   or `.rej` files.
7. Build using the OpenSearch Dashboards version corresponding to that
   Wazuh version.
8. Install the artifact in a test environment and validate that ENSFácil
   and the Dashboard work correctly.

> [!note]
> `2.19.5` must not be automatically reused for a future version. The OpenSearch Dashboards version must be checked for the specific Wazuh version being evaluated.

## 5. Criteria for declaring a version compatible

A new version must only be added to the supported list once it has been
demonstrated that:

- [ ] the integration package applies without conflicts;
- [ ] no `.rej` files are generated;
- [ ] ENSFácil's additional files are installed correctly;
- [ ] the plugin builds correctly;
- [ ] Wazuh Dashboard starts with the updated plugin;
- [ ] ENSFácil remains accessible and its main functions continue to work;
- [ ] a tested rollback procedure exists to return to the previous state.

Only after completing these checks should the list of versions supported
by `check-integration.sh` be updated and the new version combination
documented.

## 6. Unvalidated versions

If a version is not among those recognized by the integration package, it
must be treated as unvalidated.

This does not necessarily mean that ENSFácil is incompatible with it, only
that there is not yet sufficient evidence to authorize its deployment.

> [!important]
> When facing an unvalidated version, stop the procedure and first carry out the compatibility cycle described in this guide.
