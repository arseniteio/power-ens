# Contributing

This guide explains how to propose a change to Power ENS.

## Before you start

Open an issue before a large change, so that the approach is agreed before the work. Small fixes can go straight to a pull request.

Report security vulnerabilities privately to devqs@quersystem.com, not in an issue.

## Development setup

Install Node.js and Yarn for the tests, and Docker to build the plugin zip. oscompliance-ens-wazuh must be cloned next to this repository to vendor the catalog.

## Checks

```bash
ci/run-tests.sh
```

Build the zip with `ci/build-zip.sh 2.19.6`, or 2.19.5 for Wazuh 4.14.7, when the change touches the user interface or the server routes.

## Code

- Code, identifiers, comments, commit messages and pull requests are in English.
- Follow the conventions already in the repository. Clear names, small functions and explicit error handling come before comments.
- Write a comment only for what the code cannot say: an invariant, an external constraint or a workaround with its reference.
- Tests live in their own files.
- Do not edit `common/ens/catalog/engine/` or the other vendored catalog files by hand. Change the catalog in oscompliance-ens-wazuh and run `npx tsx config/sync-catalog.ts`.
- The user interface is in Spanish. Code, identifiers and comments are in English.
- A new runtime npm package needs its license text in `config/add-license-notices.py`, or the build fails.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) with a scope, in one line of at most 72 characters, imperative and lowercase:

```text
fix(install): wait for the rules of the release on workers
```

Types: feat, fix, refactor, perf, test, docs, build, ci, chore, style and revert.

## Pull requests

- One logical change per pull request, on a branch named `feat/<topic>` or `fix/<topic>`.
- The checks above pass.
- New behaviour comes with tests, and a bug fix with a test that fails without it.
- Documentation changes go to `docs/en` and `docs/es`, and to both READMEs, with the same meaning.
- A line under `[Unreleased]` in `CHANGELOG.md`. Spanish labels of the user interface go in double quotes with a short English gloss, such as the "Excluir de este control" (exclude from this control) button.

## License

The project is licensed under AGPL-3.0-only, and Arsenite also offers it under a commercial license. To keep both possible, Arsenite needs the rights to every contribution. Before your first pull request is merged, sign the Arsenite contributor license agreement. Ask for it at devqs@quersystem.com.
