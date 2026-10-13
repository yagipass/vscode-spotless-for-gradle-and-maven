import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import * as path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const cache = path.join(root, ".cache");
const fixtures = path.join(import.meta.dirname, "fixtures");
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
    ? spawnSync([command, ...args].map((arg) => `"${arg}"`).join(" "), {
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

function projects(tool, marker) {
  return readdirSync(path.join(fixtures, tool))
    .map((name) => path.join(fixtures, tool, name))
    .filter((dir) => existsSync(path.join(dir, marker)));
}

function mustRun(command, args, cwd = root) {
  if (run(command, args, cwd) !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`);
  }
}

function unusualWorkspace() {
  const dir = path.join(cache, "日本語 & 100% ^");
  rmSync(dir, { recursive: true, force: true });
  cpSync(fixtures, path.join(dir, "fixtures"), {
    recursive: true,
    filter: (source) =>
      !["target", "build", ".gradle"].includes(path.basename(source)),
  });
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

for (const project of ["formatter-config", "hang-extension"]) {
  mustRun("mvn", [
    "-q",
    "-B",
    "-f",
    path.join(fixtures, project, "pom.xml"),
    "install",
    `-Dmaven.repo.local=${path.join(cache, "m2")}`,
  ]);
}
for (const dir of projects("maven", "pom.xml")) {
  mustRun(
    "mvn",
    ["-q", "-B", "com.diffplug.spotless:spotless-maven-plugin:check"],
    dir,
  );
}
mustRun(
  wrapper("mvnw"),
  ["-q", "-B", "validate"],
  path.join(fixtures, "maven", "single"),
);
for (const dir of projects("gradle", "settings.gradle")) {
  mustRun(wrapper("gradlew"), ["-q", "spotlessCheck"], dir);
}

const status = run(
  "vscode-test",
  process.argv.slice(2),
  root,
  windows ? unusualWorkspace() : {},
);

run("mvnd", ["--stop"]);
run(wrapper("gradlew"), ["--stop"], path.join(fixtures, "gradle", "single"));
process.exit(status);
