import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Backends, Document, FormatEdit, Logger } from "../../src/formatter";
import { SpotlessFormatter } from "../../src/formatter";
import type { Codec } from "../../src/hook";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), "spotless-for-gradle-and-maven-formatter-"));
  writeFileSync(path.join(workspace, "pom.xml"), "");
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

class FakeDocument implements Document {
  version = 1;
  readonly encoding = "utf8";

  constructor(
    private text: string,
    readonly eol: 1 | 2 = 1,
    readonly fileName = path.join(workspace, "A.java"),
  ) {}

  getText(): string {
    return this.text;
  }

  type(text: string): void {
    this.text += text;
    this.version++;
  }
}

const utf8: Codec = {
  encode: (text) => Promise.resolve(new TextEncoder().encode(text)),
  decode: (content) => Promise.resolve(new TextDecoder().decode(content)),
};

interface Spotless {
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly log?: string;
}

function fakeMaven(
  spotless: Spotless,
  onRun: (stdin: string) => void = () => undefined,
): Backends["maven"] {
  return async ({ hookFiles }) => {
    onRun(await readFile(hookFiles.stdin, "utf8"));
    await writeFile(hookFiles.stdout, spotless.stdout ?? "");
    await writeFile(hookFiles.stderr, spotless.stderr ?? "");
    return { exitCode: spotless.exitCode ?? 0, log: spotless.log ?? "" };
  };
}

function setUp(maven: Backends["maven"]) {
  const lines: string[] = [];
  const statuses: string[] = [];
  const record = (level: string) => (message: string) => {
    lines.push(`${level}: ${message}`);
  };
  const logger: Logger = {
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
  };
  const backends: Backends = {
    gradle: () => Promise.reject(new Error("unexpected Gradle build")),
    maven,
  };
  const formatter = new SpotlessFormatter(backends, utf8, logger, (message) => {
    statuses.push(message);
  });
  const format = (document: Document, signal = new AbortController().signal) =>
    formatter.format(document, workspace, signal);
  return { formatter, format, lines, statuses };
}

function applyLikeTheEditor(original: string, eol: string, edit: FormatEdit | undefined): string {
  const replacement = edit?.replacement;
  const text =
    replacement === undefined
      ? original
      : original.slice(0, replacement.start) +
        replacement.text.replace(/\r\n|\r|\n/g, eol) +
        original.slice(replacement.end);
  return edit?.lineEnding === undefined ? text : text.replace(/\r\n|\n/g, edit.lineEnding);
}

const dirty = { stdout: "class A {}\n", stderr: "IS DIRTY\n" };

const withoutSpotless = {
  exitCode: 1,
  log: "[ERROR] Failed to execute goal com.diffplug.spotless:spotless-maven-plugin:3.10.4:apply (default-cli) on project plain: Execution default-cli of goal com.diffplug.spotless:spotless-maven-plugin:3.10.4:apply failed: Spotless plugin absent from the project: MavenProject: example:plain:1 @ pom.xml -> [Help 1]",
};

describe("SpotlessFormatter", () => {
  it("returns an edit that turns the buffer into the Spotless output", async () => {
    const { format } = setUp(fakeMaven(dirty));
    await expect(format(new FakeDocument("class  A {}\n"))).resolves.toEqual({
      replacement: { start: 6, end: 7, text: "" },
      lineEnding: undefined,
    });
  });

  it("discards the result when the user typed while Spotless ran, so the typed characters are not lost", async () => {
    const document = new FakeDocument("class  A {}\n");
    const { format, lines } = setUp(
      fakeMaven(dirty, () => {
        document.type("// typed while formatting\n");
      }),
    );
    await expect(format(document)).resolves.toBeUndefined();
    expect(lines.some((line) => line.startsWith("info: Discarded"))).toBe(true);
  });

  it("sends the buffer text, not the file on disk, to the build, because the unsaved text is what gets saved", async () => {
    let received = "";
    const { format } = setUp(
      fakeMaven(dirty, (stdin) => {
        received = stdin;
      }),
    );
    await format(new FakeDocument("unsaved text\n"));
    expect(received).toBe("unsaved text\n");
  });

  it("warns in the log and the status bar when a file matches several formats, instead of applying a wrong result", async () => {
    const { format, lines, statuses } = setUp(
      fakeMaven({ ...dirty, stderr: "IS DIRTY\nIS DIRTY\n" }),
    );
    await expect(format(new FakeDocument("x\n"))).resolves.toBeUndefined();
    expect(lines.some((line) => line.startsWith("warn: "))).toBe(true);
    expect(statuses).toHaveLength(1);
  });

  it("logs the build output of a failed run without throwing, so a syntax error only leaves a log entry", async () => {
    const { format, lines } = setUp(
      fakeMaven({
        exitCode: 1,
        log: "[ERROR] Step 'google-java-format' found problem",
      }),
    );
    await expect(format(new FakeDocument("x\n"))).resolves.toBeUndefined();
    expect(lines.some((line) => line.startsWith("error: ") && line.includes("found problem"))).toBe(
      true,
    );
  });

  it("starts no build at all for a file outside any Gradle or Maven build", async () => {
    rmSync(path.join(workspace, "pom.xml"));
    let builds = 0;
    const { format, lines } = setUp(
      fakeMaven(dirty, () => {
        builds++;
      }),
    );
    await expect(format(new FakeDocument("x\n"))).resolves.toBeUndefined();
    expect(builds).toBe(0);
    expect(lines.filter((line) => line.startsWith("error: "))).toEqual([]);
  });

  it("does not apply a result that arrives after the save was cancelled", async () => {
    const controller = new AbortController();
    const { format } = setUp(
      fakeMaven(dirty, () => {
        controller.abort();
      }),
    );
    await expect(format(new FakeDocument("x\n"), controller.signal)).resolves.toBeUndefined();
  });

  it("stops the running build and deletes the copy of the buffer before stop() resolves, so quitting VS Code leaves neither behind", async () => {
    const started = Promise.withResolvers<string>();
    let buildEnded = false;
    const { formatter, format } = setUp(({ hookFiles, signal }) => {
      started.resolve(hookFiles.stdin);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          setTimeout(() => {
            buildEnded = true;
            reject(signal.reason as Error);
          }, 50);
        });
      });
    });
    const formatting = format(new FakeDocument("unsaved secret\n"));
    const stdin = await started.promise;
    await formatter.stop();
    expect(buildEnded).toBe(true);
    expect(existsSync(stdin)).toBe(false);
    await expect(formatting).resolves.toBeUndefined();
  });

  it("starts no build for a save that arrives after stop(), so nothing is left running once VS Code has quit", async () => {
    let builds = 0;
    const { formatter, format } = setUp(
      fakeMaven(dirty, () => {
        builds++;
      }),
    );
    await formatter.stop();
    await expect(format(new FakeDocument("x\n"))).resolves.toBeUndefined();
    expect(builds).toBe(0);
  });
});

describe("SpotlessFormatter in a build without Spotless", () => {
  it("runs a build only for the first save and logs that once instead of an error, so a user-wide setting does not slow down every save in projects without Spotless", async () => {
    let builds = 0;
    const { format, lines } = setUp(
      fakeMaven(withoutSpotless, () => {
        builds++;
      }),
    );
    await expect(format(new FakeDocument("x\n"))).resolves.toBeUndefined();
    await expect(format(new FakeDocument("x\n"))).resolves.toBeUndefined();
    expect(builds).toBe(1);
    expect(lines.filter((line) => line.startsWith("info: "))).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith("error: "))).toEqual([]);
  });

  it("runs one build for saves that queued up behind the first, as Save All does", async () => {
    let builds = 0;
    const { format } = setUp(
      fakeMaven(withoutSpotless, () => {
        builds++;
      }),
    );
    await Promise.all([format(new FakeDocument("x\n")), format(new FakeDocument("y\n"))]);
    expect(builds).toBe(1);
  });

  it("formats again once a build file changes, so adding Spotless takes effect without reloading the window", async () => {
    let spotless: Spotless = withoutSpotless;
    const { formatter, format } = setUp((request) => fakeMaven(spotless)(request));
    await format(new FakeDocument("class  A {}\n"));
    spotless = dirty;
    await expect(format(new FakeDocument("class  A {}\n"))).resolves.toBeUndefined();
    formatter.buildFileChanged();
    await expect(format(new FakeDocument("class  A {}\n"))).resolves.toEqual({
      replacement: { start: 6, end: 7, text: "" },
      lineEnding: undefined,
    });
  });

  it("keeps formatting the other modules of the build, because a parent can keep Spotless from one module with <inherited>false</inherited>", async () => {
    mkdirSync(path.join(workspace, "app"));
    writeFileSync(path.join(workspace, "app", "pom.xml"), "");
    const modules: string[] = [];
    const { format } = setUp((request) => {
      modules.push(request.build.module);
      return fakeMaven(request.build.module === workspace ? dirty : withoutSpotless)(request);
    });
    const inApp = path.join(workspace, "app", "A.java");
    await format(new FakeDocument("class  A {}\n", 1, inApp));
    await format(new FakeDocument("class  A {}\n", 1, inApp));
    await expect(format(new FakeDocument("class  A {}\n"))).resolves.toBeDefined();
    expect(modules).toEqual([path.join(workspace, "app"), workspace]);
  });

  it("keeps running a build on every save after an ordinary failure, so fixing a syntax error formats the next save", async () => {
    let builds = 0;
    const { format } = setUp(
      fakeMaven({ exitCode: 1, log: "[ERROR] Step 'google-java-format' found problem" }, () => {
        builds++;
      }),
    );
    await format(new FakeDocument("x\n"));
    await format(new FakeDocument("x\n"));
    expect(builds).toBe(2);
  });
});

describe("SpotlessFormatter line endings", () => {
  it("switches an LF buffer to the CRLF that Spotless produced without leaving a stray CR that the editor would turn into a blank line", async () => {
    const original = "class A {\nint  x;\n}\n";
    const formatted = "class A {\r\n  int x;\r\n}\r\n";
    const { format } = setUp(fakeMaven({ stdout: formatted, stderr: "IS DIRTY\n" }));
    const edit = await format(new FakeDocument(original, 1));
    expect(edit?.lineEnding).toBe("\r\n");
    expect(edit?.replacement?.text).not.toContain("\r");
    expect(applyLikeTheEditor(original, "\n", edit)).toBe(formatted);
  });

  it("switches a CRLF buffer to the LF that Spotless produced with a small edit instead of replacing the whole document", async () => {
    const original = "class A {\r\nint  x;\r\n}\r\n";
    const formatted = "class A {\n  int x;\n}\n";
    const { format } = setUp(fakeMaven({ stdout: formatted, stderr: "IS DIRTY\n" }));
    const edit = await format(new FakeDocument(original, 2));
    expect(edit?.lineEnding).toBe("\n");
    const replaced = (edit?.replacement?.end ?? 0) - (edit?.replacement?.start ?? 0);
    expect(replaced).toBeLessThan(8);
    expect(applyLikeTheEditor(original, "\r\n", edit)).toBe(formatted);
  });

  it("changes only the line endings when that is all Spotless changed, so the text itself is left untouched", async () => {
    const { format } = setUp(fakeMaven({ stdout: "a\nb\n", stderr: "IS DIRTY\n" }));
    await expect(format(new FakeDocument("a\r\nb\r\n", 2))).resolves.toEqual({
      replacement: undefined,
      lineEnding: "\n",
    });
  });
});
