import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";
import process from "node:process";
import { profile } from "./profiles.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const cache = path.join(root, ".cache");
const fixtures = path.join(import.meta.dirname, "fixtures");
const prepared = path.join(cache, "fixtures");
const windows = process.platform === "win32";
const env = {
  ...process.env,
  GRADLE_USER_HOME: path.join(cache, "gradle"),
  MAVEN_USER_HOME: path.join(cache, "maven-user-home"),
  MVND_DAEMON_STORAGE: path.join(cache, "mvnd"),
};

function run(command, args, cwd = root, extraEnv = {}) {
  const options = { cwd, env: { ...env, ...extraEnv }, stdio: "inherit" };
  const { status, error } = windows
    ? spawnSync([command, ...args.map((arg) => `"${arg}"`)].join(" "), {
        ...options,
        shell: true,
      })
    : spawnSync(command, args, options);
  if (error !== undefined) {
    process.stderr.write(`${String(error)}\n`);
  }
  return status ?? 1;
}

function wrapper(name) {
  return windows ? name : `./${name}`;
}

function projects(base, tool, marker) {
  return readdirSync(path.join(base, tool))
    .map((name) => path.join(base, tool, name))
    .filter((dir) => existsSync(path.join(dir, marker)));
}

function filesNamed(dir, name) {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => path.basename(file) === name)
    .map((file) => path.join(dir, file));
}

function rewrite(files, pattern, value) {
  let replaced = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    writeFileSync(
      file,
      text.replace(pattern, () => {
        replaced++;
        return value;
      }),
    );
  }
  if (replaced === 0) {
    throw new Error(`Nothing in ${files.join(", ")} matches ${pattern}`);
  }
}

function copyFixtures(from, to) {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, {
    recursive: true,
    filter: (source) =>
      !["target", "build", ".gradle"].includes(path.basename(source)),
  });
  for (const dir of projects(to, "maven", "pom.xml")) {
    rewrite(
      [path.join(dir, ".mvn", "maven.config")],
      /(?<=^-Dmaven\.repo\.local=).*$/m,
      path.relative(dir, path.join(cache, "m2")),
    );
  }
}

function applyProfile(dir) {
  if (profile.spotlessGradle !== undefined) {
    rewrite(
      filesNamed(path.join(dir, "gradle"), "build.gradle"),
      /(?<=id 'com\.diffplug\.spotless' version ')[^']+/g,
      profile.spotlessGradle,
    );
  }
  if (profile.spotlessMaven !== undefined) {
    rewrite(
      filesNamed(path.join(dir, "maven"), "pom.xml"),
      /(?<=<artifactId>spotless-maven-plugin<\/artifactId>\s*<version>)[^<]+/g,
      profile.spotlessMaven,
    );
  }
}

function mustRun(command, args, cwd = root) {
  if (run(command, args, cwd) !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`);
  }
}

function unusualWorkspace() {
  const dir = path.join(cache, "café & 100% ^");
  rmSync(dir, { recursive: true, force: true });
  copyFixtures(prepared, path.join(dir, "fixtures"));
  mkdirSync(path.join(dir, "tmp"));
  return {
    SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_FIXTURES: path.join(dir, "fixtures"),
    TEMP: path.join(dir, "tmp"),
    TMP: path.join(dir, "tmp"),
  };
}

rmSync(path.join(cache, "logs"), { recursive: true, force: true });
for (const file of readdirSync(fixtures, {
  recursive: true,
  encoding: "utf8",
})) {
  if (/^Tmp.*\.java$/.test(path.basename(file))) {
    rmSync(path.join(fixtures, file));
  }
}
copyFixtures(fixtures, prepared);
applyProfile(prepared);

for (const project of ["formatter-config", "hang-extension"]) {
  mustRun("mvn", [
    "-q",
    "-B",
    "-f",
    path.join(prepared, project, "pom.xml"),
    "install",
    `-Dmaven.repo.local=${path.join(cache, "m2")}`,
  ]);
}
for (const dir of projects(prepared, "maven", "pom.xml")) {
  mustRun(
    "mvn",
    ["-q", "-B", "com.diffplug.spotless:spotless-maven-plugin:check"],
    dir,
  );
}
mustRun(
  wrapper("mvnw"),
  ["-q", "-B", "validate"],
  path.join(prepared, "maven", "single"),
);
for (const dir of projects(prepared, "gradle", "settings.gradle")) {
  mustRun(wrapper("gradlew"), ["-q", "spotlessCheck"], dir);
}

const status = run(
  "vscode-test",
  process.argv.slice(2),
  root,
  windows
    ? unusualWorkspace()
    : { SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_FIXTURES: prepared },
);

run("mvnd", ["--stop"]);
run(wrapper("gradlew"), ["--stop"], path.join(prepared, "gradle", "single"));
process.exit(status);
