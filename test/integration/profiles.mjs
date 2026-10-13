import { readFileSync } from "node:fs";
import * as path from "node:path";
import process from "node:process";

const pkg = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "..", "..", "package.json"),
    "utf8",
  ),
);
const minimumVSCode = /^\^(\d+\.\d+\.\d+)$/.exec(pkg.engines.vscode)?.[1];
if (minimumVSCode === undefined) {
  throw new Error(
    `engines.vscode must look like ^1.100.0, not ${pkg.engines.vscode}`,
  );
}

const latest = {
  vscode: "1.140.0",
  gradleForJava: "3.18.0",
  jdk: 25,
  mvnd: "1.0.6",
};

const profiles = {
  latest,
  oldest: {
    ...latest,
    vscode: minimumVSCode,
    gradleForJava: "3.12.6",
    jdk: 17,
    mvnd: "1.0.3",
    gradle: "8.1",
    maven: "3.6.3",
    googleJavaFormat: "1.28.0",
    spotlessGradle: "8.7.0",
    spotlessMaven: "2.40.0",
  },
};

const name = process.env.SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_PROFILE ?? "latest";
if (!Object.hasOwn(profiles, name)) {
  throw new Error(
    `SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_PROFILE must be ${Object.keys(profiles).join(" or ")}, not ${name}`,
  );
}

export const profile = {
  ...profiles[name],
  gradleForJava:
    process.env.SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_GRADLE_FOR_JAVA ??
    profiles[name].gradleForJava,
};
