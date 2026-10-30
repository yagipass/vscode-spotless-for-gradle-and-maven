# Contributing

## Setup

Run `nix develop` (or `direnv allow`). It provides every tool and installs the git hooks.

Without Nix, install Node.js 24, pnpm, JDK 21 and Maven; `pnpm test:integration` names any further JDK or mvnd it needs. The git hooks are then not installed.

Then, with or without Nix, run `pnpm install`.

## Build and test

| Command                                                                | Purpose                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm package`                                                         | build the extension into `vscode-spotless-for-gradle-and-maven-<version>.vsix`                                                   |
| `code --install-extension vscode-spotless-for-gradle-and-maven-*.vsix` | install the package in VS Code to try it                                                                                         |
| `pnpm lint`                                                            | lint with oxlint and check the formatting with oxfmt                                                                             |
| `pnpm typecheck`                                                       | type-check the extension and the integration tests                                                                               |
| `pnpm sync:runtime-types`                                              | check that `@types/vscode`, `@types/node` and the Dependabot rule for `@types/node` match `engines.vscode`; `--fix` updates them |
| `pnpm test:unit`                                                       | unit tests                                                                                                                       |
| `pnpm test:integration`                                                | build the extension and run it in VS Code on Gradle and Maven builds                                                             |
| `nix fmt`                                                              | format Nix                                                                                                                       |
| `nix flake check`                                                      | run the git hooks over every tracked file, as CI does                                                                            |

CI runs the integration tests on Linux, macOS and Windows, and on Linux also with the oldest supported versions.

### Integration tests

`pnpm test:integration` writes VS Code logs to `.cache/logs/`. It takes:

- `--label gradle` to run only the Gradle tests
- `SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_PROFILE=oldest` to use the oldest supported versions in `test/integration/profiles.mjs`
- `SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_GRADLE_FOR_JAVA=<version>` to use another Gradle for Java; `node scripts/newest-gradle-for-java.mjs stable` or `pre-release` prints the newest

## Rules

- `pnpm lint` fails on any oxlint warning and on files that oxfmt would change. `pnpm exec oxfmt` formats them.
- `nix flake check` fails on Markdown that markdownlint or typos rejects. It skips `CHANGELOG.md`, which tagpr writes.
- CI fails on a secret that gitleaks finds in any commit, with the exceptions in `.gitleaks.toml`.
- Commit messages follow Conventional Commits, checked by the `commit-msg` hook.
- Name branches `<type>/<slug>` after the Conventional Commits type. `.github/labeler.yml` labels the pull request by it, `feat/` as `enhancement`, `fix/` as `bug`, and `docs/` as `documentation`, and `.github/release.yml` groups the changelog by these labels and Dependabot's `dependencies`.

## Proposing a change

Open an issue before you start on a new feature or a change in behavior, with the build (Gradle or Maven, and the Spotless plugin version) and what you expect on save. A small fix, such as a typo, can go straight to a pull request.

A pull request:

- references its issue (`Closes #N`), if it has one.
- adds tests in `test/unit` or `test/integration` when it changes behavior. A bug fix adds a test that reproduces the bug.
- passes `pnpm lint`, `pnpm typecheck`, `pnpm sync:runtime-types`, `pnpm test:unit`, `pnpm test:integration` and `nix flake check`.
- has a Conventional Commits title. Pull requests are squash-merged, so the title becomes the commit on `main`.

## Release

Before merging a pull request, label it by hand if it comes from a fork, which the labeler skips.

Merge the release pull request that [tagpr](https://github.com/Songmu/tagpr) keeps open. It is a minor release if a merged pull request is labeled `enhancement`, and a patch release otherwise. Label it `tagpr:major` for a major release. `build.yml` runs tagpr on `main` after the checks and integration tests pass. It then tags `vX.Y.Z`, packages the `.vsix`, attaches it to the GitHub release, publishes it to the VS Marketplace and Open VSX, and publishes the release.

tagpr writes `CHANGELOG.md` and the version in `package.json`, so do not edit them by hand.

This needs the "Allow GitHub Actions to create and approve pull requests" setting, which `.github/infra.yml` turns on, and an environment `marketplace` with the secrets `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` of the Microsoft Entra identity that publishes to the VS Marketplace. Open VSX is published with trusted publishing, without a token.

## Repository settings

The repository settings, labels, rulesets, and Actions permissions are managed with [gh-infra](https://github.com/babarot/gh-infra) in `.github/infra.yml`. To change them, edit the file, review the difference with `gh infra plan .github/infra.yml`, and apply it with `gh infra apply .github/infra.yml`. Applying needs admin access to the repository.

Environments, secrets, code scanning, and secret scanning are not managed by gh-infra. Change them in the repository settings on GitHub.
