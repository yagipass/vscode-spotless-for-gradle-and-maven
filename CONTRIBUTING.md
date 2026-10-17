# Contributing

## Setup

`nix develop` (or `direnv allow`) provides every tool. Without Nix, install Node.js 24, pnpm, JDK 21 and Maven; `pnpm test:integration` names any further JDK or mvnd it needs. Then run `pnpm install`.

## Try it in VS Code

```sh
pnpm package
code --install-extension vscode-spotless-for-gradle-and-maven-*.vsix
```

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm sync:runtime-types
pnpm test:unit
pnpm test:integration
```

`pnpm test:integration` writes VS Code logs to `.cache/logs/`. It takes:

- `--label gradle` to run only the Gradle tests
- `SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_PROFILE=oldest` to use the oldest supported versions in `test/integration/profiles.mjs`
- `SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_GRADLE_FOR_JAVA=<version>` to use another Gradle for Java; `node scripts/newest-gradle-for-java.mjs stable` or `pre-release` prints the newest

## Repository settings

Maintainers apply them with [gh-infra](https://github.com/babarot/gh-infra): `gh infra apply .github/infra.yml`. The `marketplace` environment and its secrets, code scanning and secret scanning are set on GitHub instead.
