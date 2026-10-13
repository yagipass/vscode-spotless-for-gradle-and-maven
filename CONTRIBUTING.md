# Contributing

## Requirements

- Node.js 24 and pnpm
- JDK 21 and Maven (`mvn`)
- For the integration tests only: the JDKs and [mvnd](https://github.com/apache/maven-mvnd) releases that `test/integration/profiles.mjs` names, in `JAVA_HOME_<major>` and `MVND_HOME_<version>` with `_` for `.`, such as `JAVA_HOME_17` and `MVND_HOME_1_0_3`

With Nix, `nix develop` (or `direnv allow`) provides all of them.

## Build

```sh
pnpm install
pnpm build
```

`pnpm build` bundles the extension and builds the Maven extension in `inject/maven`, both into `dist/`. `pnpm watch` rebuilds the TypeScript on change.

To try it in VS Code, package and install it:

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

`pnpm sync:runtime-types` checks that `@types/node` and `@types/vscode` match the oldest VS Code that `engines.vscode` allows, so that `pnpm typecheck` rejects APIs that version lacks.

`pnpm test:integration` downloads VS Code and the Gradle for Java extension, copies the projects in `test/integration/fixtures` to `.cache/fixtures/`, then formats them with Gradle, mvnd and `mvnw`. Caches and VS Code logs go to `.cache/`. On Windows, it opens a further copy in `.cache/café & 100% ^/` and uses that folder for temporary files too, so that paths with non-ASCII characters, spaces, `&`, `%` and `^` are covered.

The fixtures use the latest Spotless plugins, Gradle and Maven, and the `latest` profile in `test/integration/profiles.mjs` sets the VS Code, Gradle for Java, JDK and mvnd versions. CI also runs the `oldest` profile, which `SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_PROFILE=oldest` selects. It runs the oldest versions that the README supports: the VS Code that `engines.vscode` starts at, the oldest Gradle for Java, JDK and mvnd, and, written into the copied fixtures, the oldest Gradle, Maven and Spotless plugins, with a google-java-format that runs on that JDK.

## Changing the minimum VS Code version

Edit `engines.vscode` in `package.json`, then run:

```sh
pnpm sync:runtime-types --fix
```

It installs the matching `@types/node` and `@types/vscode` and updates the `@types/node` range that Dependabot ignores. Do not update these types by hand. The new minimum must be a version that `@types/vscode` was published for.
