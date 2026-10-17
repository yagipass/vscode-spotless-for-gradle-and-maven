# Changelog

## [v1.0.1](https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/compare/v1.0.0...v1.0.1) - 2026-10-17

- build(deps-dev): bump prettier from 3.9.9 to 3.9.10 by @dependabot[bot] in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/59
- build(deps): bump nixpkgs from `151fa4e` to `6510408` by @dependabot[bot] in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/60
- build: publish to Open VSX with trusted publishing instead of a token by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/63
- build: format with oxfmt instead of prettier by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/65
- style: reformat with oxfmt defaults by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/66
- build: lint with oxlint instead of eslint by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/69
- build: format the Nix files with nix fmt and check them in CI by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/73
- build: check secrets, commit messages and whitespace in Git hooks by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/74
- build: take nixpkgs from nixpkgs-unstable and drop the unused Gradle by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/75
- build(deps-dev): bump typescript from 6.0.3 to 7.0.2 by @dependabot[bot] in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/78
- build(deps-dev): bump oxlint-tsgolint from 7.0.2003 to 7.0.2004 by @dependabot[bot] in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/79
- test: turn off snippet code actions so a save is not left unformatted by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/80
- build: lock GitHub Actions dependencies with a workflow lockfile by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/82
- build: fix the jactionlint findings in the workflows and Dependabot by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/85
- docs: credit Spotless Maven in the README acknowledgements by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/86
- build: manage the repository settings with gh infra by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/88

## [v1.0.0](https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/commits/v1.0.0) - 2026-10-13

- build: run lint, type checks and tests on every pull request by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/4
- build: open weekly dependency update pull requests with Dependabot by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/5
- build(deps): bump org.apache.maven:maven-core from 3.9.16 to 3.10.0 in /inject/maven by @dependabot[bot] in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/6
- build(deps-dev): bump vitest from 5.0.2 to 5.0.3 by @dependabot[bot] in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/8
- build(deps-dev): bump eslint from 10.11.0 to 10.12.0 by @dependabot[bot] in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/9
- feat: add keywords for java, formatter, spotless, gradle and maven by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/12
- build: keep Node and VS Code types in line with the minimum VS Code by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/15
- feat: rename the extension to Spotless for Gradle and Maven by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/18
- build(deps): bump actions/upload-artifact from 7.0.1 to 7.0.2 in the actions group by @dependabot[bot] in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/16
- build(deps-dev): bump typescript-eslint from 8.71.0 to 8.71.1 by @dependabot[bot] in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/17
- feat: add extension and command icons by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/19
- feat: run the integration tests on Windows and macOS and fix the Maven bugs they found by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/32
- build: publish releases to the Marketplace with tagpr by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/33
- feat: run the integration tests on the oldest supported VS Code by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/35
- build: tag and publish a release only after CI passes on main by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/36
- feat: show what changed in each version on the extension's Changelog tab by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/37
- feat: test formatting with the oldest supported Spotless plugins by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/38
- feat: state and test the supported JDK, Gradle, Maven and mvnd versions by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/39
- feat: state and test the oldest supported Gradle for Java by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/41
- feat: fail the integration tests when formatting uses a deprecated Gradle feature by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/42
- build: publish releases to Open VSX as well as the Marketplace by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/44
- docs: credit Spotless Gradle in a README acknowledgements section by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/45
- docs: say that no telemetry is sent and where the unsaved buffer goes by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/47
- feat: test Gradle formatting every day with the newest Gradle for Java by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/48
- docs: cut CONTRIBUTING down to what contributors run by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/49
- docs: show formatting on save and split the README by build tool by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/51
- feat: replace the extension icon with a flat water-drop design by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/53
- docs: say where to look when a saved file is not formatted by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/54
- docs: add Marketplace, Open VSX, build and license badges to README by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/56
- docs: change the README animation to VS Code with an English UI by @yagipass in https://github.com/yagipass/vscode-spotless-for-gradle-and-maven/pull/58
