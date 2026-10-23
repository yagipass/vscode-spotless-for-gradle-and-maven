import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findMavenExecutable, mavenArgs, runMaven, windowsCommandLine } from "../../src/maven";

let base: string;

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), "spotless-for-gradle-and-maven-maven-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function executable(relative: string, script = ""): string {
  const file = path.join(base, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `#!/bin/sh\n${script}`);
  chmodSync(file, 0o755);
  return file;
}

const files = { stdin: "/tmp/in", stdout: "/tmp/out", stderr: "/tmp/err" };

describe("mavenArgs", () => {
  it("selects only the file's module with -pl, so a large reactor does not run Spotless in every module", () => {
    const args = mavenArgs(
      { tool: "maven", root: "/repo", module: "/repo/core/api" },
      "/repo/core/api/src/A.java",
      "/ext/spotless-for-gradle-and-maven-extension.jar",
      files,
    );
    expect(args).toEqual([
      "-q",
      "-B",
      "-f",
      "pom.xml",
      "-pl",
      "core/api",
      "--define",
      "maven.ext.class.path=/ext/spotless-for-gradle-and-maven-extension.jar",
      "--define",
      "spotlessForGradleAndMaven.stdin=/tmp/in",
      "--define",
      "spotlessForGradleAndMaven.stdout=/tmp/out",
      "--define",
      "spotlessForGradleAndMaven.stderr=/tmp/err",
      "--define",
      "spotlessIdeHook=/repo/core/api/src/A.java",
      "--define",
      "spotlessIdeHookUseStdIn",
      "--define",
      "spotlessIdeHookUseStdOut",
      "com.diffplug.spotless:spotless-maven-plugin:apply",
    ]);
  });

  it("builds only the root project with -N when the file belongs to the root module, so its modules are not run", () => {
    const args = mavenArgs(
      { tool: "maven", root: "/repo", module: "/repo" },
      "/repo/src/A.java",
      "/ext.jar",
      files,
    );
    expect(args.slice(4, 6)).toEqual(["-N", "--define"]);
    expect(args).not.toContain("-pl");
  });

  it("names the POM relative to the build root, which is the working directory, because mvn.cmd expands % and ^ in a -f path a second time", () => {
    const args = mavenArgs(
      { tool: "maven", root: "C:\\100% ^", module: "C:\\100% ^" },
      "C:\\100% ^\\src\\A.java",
      "/ext.jar",
      files,
    );
    expect(args.slice(2, 4)).toEqual(["-f", "pom.xml"]);
  });

  it("never passes properties with -D, which mvnd 1.0 swallows and then runs a plain spotless:apply that rewrites the file on disk", () => {
    const args = mavenArgs(
      { tool: "maven", root: "/repo", module: "/repo" },
      "/repo/src/A.java",
      "/ext.jar",
      files,
    );
    expect(args.filter((arg) => arg.startsWith("-D"))).toEqual([]);
  });
});

describe("windowsCommandLine", () => {
  it("quotes every argument and escapes cmd.exe metacharacters, so a path with spaces, &, % or ^ reaches Maven unchanged instead of splitting the command or expanding a variable", () => {
    expect(
      windowsCommandLine("C:\\My Projects\\app\\mvnw.cmd", [
        "-q",
        "spotlessIdeHook=C:\\日本語 & 100% ^\\A.java",
      ]),
    ).toBe(
      'C:\\My^ Projects\\app\\mvnw.cmd ^"-q^" ^"spotlessIdeHook=C:\\日本語^ ^&^ 100^%^ ^^\\A.java^"',
    );
  });

  it("doubles the backslashes before a quote, so a trailing backslash does not escape the closing quote", () => {
    expect(windowsCommandLine("mvn.cmd", ["C:\\dir\\", 'a\\"b'])).toBe(
      'mvn.cmd ^"C:\\dir\\\\^" ^"a\\\\\\^"b^"',
    );
  });
});

describe("findMavenExecutable", () => {
  it("uses the configured executable as is, so users can pick mvn when mvnd misbehaves", () => {
    executable("bin/mvnd");
    expect(
      findMavenExecutable(path.join(base, "root"), "/opt/maven/bin/mvn", path.join(base, "bin")),
    ).toBe("/opt/maven/bin/mvn");
  });

  it("prefers mvnd on the PATH because a resident daemon is several times faster", () => {
    const mvnd = executable("bin/mvnd");
    executable("bin/mvn");
    executable("root/mvnw");
    expect(findMavenExecutable(path.join(base, "root"), "", path.join(base, "bin"))).toBe(mvnd);
  });

  it("uses the build's own mvnw over a global mvn, so the project's pinned Maven version runs", () => {
    executable("bin/mvn");
    const mvnw = executable("root/mvnw");
    expect(findMavenExecutable(path.join(base, "root"), "", path.join(base, "bin"))).toBe(mvnw);
  });

  it("falls back to mvn on the PATH, so a plain Maven installation still works", () => {
    executable("other/tool");
    const mvn = executable("bin/mvn");
    const searchPath = [path.join(base, "other"), path.join(base, "bin")].join(path.delimiter);
    expect(findMavenExecutable(path.join(base, "root"), "", searchPath)).toBe(mvn);
  });

  it("ignores files that are not executable, so a stray file named mvnd does not break every save", () => {
    writeFileSync(path.join(base, "mvnd"), "");
    const mvn = executable("bin/mvn");
    const searchPath = [base, path.join(base, "bin")].join(path.delimiter);
    expect(findMavenExecutable(path.join(base, "root"), "", searchPath)).toBe(mvn);
  });

  it("reports that nothing was found, so the caller can log why nothing ran", () => {
    expect(
      findMavenExecutable(path.join(base, "root"), "", path.join(base, "bin")),
    ).toBeUndefined();
  });
});

describe("runMaven", () => {
  it("refuses to run without the bundled extension jar, because Spotless would then read Maven's own stdin and mvnd would hang", async () => {
    await expect(
      runMaven(
        {
          build: { tool: "maven", root: base, module: base },
          file: path.join(base, "A.java"),
          hookFiles: files,
          signal: new AbortController().signal,
        },
        {
          extensionJar: path.join(base, "missing.jar"),
          configuredExecutable: executable("bin/mvn"),
        },
      ),
    ).rejects.toThrow("missing.jar does not exist");
  });

  function runFakeMaven(script: string) {
    const jar = path.join(base, "ext.jar");
    writeFileSync(jar, "");
    return runMaven(
      {
        build: { tool: "maven", root: base, module: path.join(base, "it") },
        file: path.join(base, "it", "A.java"),
        hookFiles: files,
        signal: new AbortController().signal,
      },
      { extensionJar: jar, configuredExecutable: executable("bin/mvn", script) },
    );
  }

  it("builds the module on its own in its directory when the topmost pom does not include it, so a module listed only in a profile or a standalone project is still formatted", async () => {
    mkdirSync(path.join(base, "it"));
    const result = await runFakeMaven(
      'case " $* " in\n' +
        '  *" -pl it "*) echo "[ERROR] Could not find the selected project in the reactor: it @ "; exit 1 ;;\n' +
        '  *" -N "*) echo "built $(pwd -P) alone" ;;\n' +
        "esac\n",
    );
    expect(result.exitCode).toBe(0);
    expect(result.log).toContain(`built ${realpathSync(path.join(base, "it"))} alone`);
  });

  it("runs only one build when the module fails for another reason, so a buffer with a syntax error does not cost a second build", async () => {
    const result = await runFakeMaven('echo "build ran"\nexit 1\n');
    expect(result.exitCode).toBe(1);
    expect(result.log.match(/^build ran$/gm)).toHaveLength(1);
  });
});
