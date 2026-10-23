import * as assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import * as vscode from "vscode";

export function workspacePath(...segments: string[]): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "the test workspace is not open");
  return path.join(folder.uri.fsPath, ...segments);
}

export function sourceDir(project: string, ...module: string[]): string {
  return workspacePath(project, ...module, "src/main/java/com/example");
}

export function unformatted(className: string): string {
  return `package com.example;\npublic class ${className} {\nint  x  =  1;\n}\n`;
}

export function googleFormatted(className: string): string {
  return `package com.example;\n\npublic class ${className} {\n  int x = 1;\n}\n`;
}

export function placeholder(className: string): string {
  return `package com.example;\n\npublic class ${className} {}\n`;
}

const created: string[] = [];
const restored = new Map<string, Buffer>();

export async function createFile(file: string, content: string | Uint8Array): Promise<vscode.Uri> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  created.push(file);
  return vscode.Uri.file(file);
}

export async function restoreAfterTest(file: string): Promise<vscode.Uri> {
  restored.set(file, await readFile(file));
  return vscode.Uri.file(file);
}

async function cleanUp(): Promise<void> {
  for (const document of vscode.workspace.textDocuments) {
    if (document.isDirty) {
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("workbench.action.files.revert");
    }
  }
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  for (const file of created.splice(0)) {
    await rm(file, { force: true });
  }
  for (const [file, content] of restored) {
    await writeFile(file, content);
  }
  restored.clear();
}

teardown(cleanUp);

export async function openWithUnsavedText(
  uri: vscode.Uri,
  text: string,
  encoding?: string,
): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(
    uri,
    encoding === undefined ? {} : { encoding },
  );
  const editor = await vscode.window.showTextDocument(document);
  const whole = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  assert.ok(
    await editor.edit((builder) => {
      builder.replace(whole, text);
    }),
  );
  assert.ok(document.isDirty, "the buffer must differ from the file on disk");
  return document;
}

export async function save(document: vscode.TextDocument): Promise<void> {
  assert.ok(await document.save(), `could not save ${document.fileName}`);
}

export function readDisk(uri: vscode.Uri): Promise<string> {
  return readFile(uri.fsPath, "utf8");
}

async function waitForSaveParticipants(): Promise<void> {
  const file = workspacePath("TmpReady.txt");
  await writeFile(file, "");
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const text = `attempt ${String(attempt)}`;
      await save(await openWithUnsavedText(vscode.Uri.file(file), text));
      if ((await readFile(file, "utf8")) === `${text}\n`) {
        return;
      }
      await setTimeout(100);
    }
    assert.fail("VS Code did not start running save participants");
  } finally {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await rm(file, { force: true });
  }
}

suiteSetup(waitForSaveParticipants);

function spotlessLog(): string {
  const dir = process.env["SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_LOGS"];
  assert.ok(dir, "SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_LOGS is not set");
  const file = readdirSync(dir, { recursive: true, encoding: "utf8" }).find((name) =>
    name.endsWith("Spotless for Gradle and Maven.log"),
  );
  return file === undefined ? "" : readFileSync(path.join(dir, file), "utf8");
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function expectLog(pattern: RegExp): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (pattern.test(spotlessLog())) {
      return;
    }
    await setTimeout(100);
  }
  assert.fail(`The log does not match ${String(pattern)}:\n${spotlessLog()}`);
}

export async function waitUntil(condition: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 1200; attempt++) {
    if (condition()) {
      return;
    }
    await setTimeout(100);
  }
  assert.fail(message);
}

export async function cancelSave(saving: Thenable<boolean>): Promise<void> {
  const pending = Symbol("pending");
  for (let attempt = 0; attempt < 300; attempt++) {
    await vscode.commands.executeCommand("notification.acceptPrimaryAction");
    if ((await Promise.race([saving, setTimeout(100, pending)])) !== pending) {
      return;
    }
  }
  assert.fail("VS Code did not offer to cancel the save");
}

async function commandLines(): Promise<string[]> {
  const { stdout } =
    process.platform === "win32"
      ? await promisify(execFile)("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "(Get-CimInstance Win32_Process).CommandLine",
        ])
      : await promisify(execFile)("ps", ["-A", "-ww", "-o", "args="]);
  return stdout.split(/\r?\n/);
}

export async function expectNoProcess(marker: string): Promise<void> {
  let running: string[] = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    running = (await commandLines()).filter((line) => line.includes(marker));
    if (running.length === 0) {
      return;
    }
    await setTimeout(100);
  }
  assert.fail(
    `Processes with ${marker} in their command line are still running:\n${running.join("\n")}`,
  );
}

export async function expectFormattedOnSave(
  dir: string,
  className: string,
  decorate: (text: string) => string = (text) => text,
): Promise<void> {
  const uri = await createFile(path.join(dir, `${className}.java`), placeholder(className));
  const document = await openWithUnsavedText(uri, decorate(unformatted(className)));
  await save(document);
  assert.equal(document.getText(), decorate(googleFormatted(className)));
  assert.equal(await readDisk(uri), decorate(googleFormatted(className)));
}

async function writeSeenByWatchers(file: string, content: string): Promise<void> {
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(path.dirname(file), path.basename(file)),
  );
  try {
    const seen = new Promise<boolean>((resolve) => {
      watcher.onDidCreate(() => {
        resolve(true);
      });
      watcher.onDidChange(() => {
        resolve(true);
      });
    });
    await writeFile(file, content);
    assert.ok(
      await Promise.race([seen, setTimeout(10000, false)]),
      `VS Code did not report the change to ${file}`,
    );
  } finally {
    watcher.dispose();
  }
}

export function commonSuite(options: {
  readonly sourceDir: () => string;
  readonly buildFile: () => string;
  readonly withoutSpotless: string;
  readonly uncoveredSuffix: string;
}): void {
  test("formats the unsaved buffer on save", () =>
    expectFormattedOnSave(options.sourceDir(), "TmpSave"));

  test("formats the buffer without touching the file on disk, so nothing is written before the user saves", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpCommand.java"),
      placeholder("TmpCommand"),
    );
    const document = await openWithUnsavedText(uri, unformatted("TmpCommand"));
    await vscode.commands.executeCommand("spotlessForGradleAndMaven.formatDocument");
    assert.equal(document.getText(), googleFormatted("TmpCommand"));
    assert.ok(document.isDirty);
    assert.equal(await readDisk(uri), placeholder("TmpCommand"));
  });

  test("leaves already formatted code exactly as it is", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpClean.java"),
      placeholder("TmpClean"),
    );
    const document = await openWithUnsavedText(uri, googleFormatted("TmpClean"));
    await save(document);
    assert.equal(document.getText(), googleFormatted("TmpClean"));
    await expectLog(/TmpClean\.java: clean/);
  });

  test("runs no build on later saves in a build without Spotless, and formats again once a build file adds Spotless, so a user-wide setting does not slow down other projects", async () => {
    const buildFile = await restoreAfterTest(options.buildFile());
    const withSpotless = await readDisk(buildFile);
    const project = escapeRegExp(path.dirname(buildFile.fsPath));
    await writeSeenByWatchers(buildFile.fsPath, options.withoutSpotless);
    const first = await createFile(
      path.join(options.sourceDir(), "TmpNoSpotless.java"),
      placeholder("TmpNoSpotless"),
    );
    await save(await openWithUnsavedText(first, unformatted("TmpNoSpotless")));
    await expectLog(new RegExp(`Found no Spotless in ${project}, `));
    const later = await createFile(
      path.join(options.sourceDir(), "TmpNoSpotlessLater.java"),
      placeholder("TmpNoSpotlessLater"),
    );
    const document = await openWithUnsavedText(later, unformatted("TmpNoSpotlessLater"));
    await save(document);
    assert.equal(document.getText(), unformatted("TmpNoSpotlessLater"));
    await expectLog(
      new RegExp(`Ran no build for .*TmpNoSpotlessLater\\.java because ${project} has no Spotless`),
    );
    assert.doesNotMatch(spotlessLog(), /Spotless failed for .*TmpNoSpotless/);
    await writeSeenByWatchers(buildFile.fsPath, withSpotless);
    await expectFormattedOnSave(options.sourceDir(), "TmpSpotlessAdded");
  });

  test("leaves a file that no Spotless format covers unchanged", async () => {
    const uri = await restoreAfterTest(options.buildFile());
    const original = await readDisk(uri);
    const edited = original + options.uncoveredSuffix;
    const document = await openWithUnsavedText(uri, edited);
    await save(document);
    assert.equal(document.getText(), edited);
    await expectLog(new RegExp(`${escapeRegExp(path.basename(uri.fsPath))}: notCovered`));
  });

  test("does not run a build just to list code actions, so the lightbulb and the Source Action menu stay cheap", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpMenu.java"),
      placeholder("TmpMenu"),
    );
    const document = await openWithUnsavedText(uri, unformatted("TmpMenu"));
    const range = new vscode.Range(0, 0, 0, 0);
    const listed = async (kind?: string) =>
      (
        await vscode.commands.executeCommand<vscode.CodeAction[]>(
          "vscode.executeCodeActionProvider",
          uri,
          range,
          kind,
        )
      ).filter((action) => action.kind?.value === "source.fixAll.spotlessForGradleAndMaven");
    assert.equal((await listed()).length, 0);
    const menu = await listed("source");
    assert.equal(menu.length, 1);
    assert.equal(menu[0]?.edit, undefined);
    const later = await createFile(
      path.join(options.sourceDir(), "TmpAfterMenu.java"),
      placeholder("TmpAfterMenu"),
    );
    await save(await openWithUnsavedText(later, googleFormatted("TmpAfterMenu")));
    await expectLog(/TmpAfterMenu\.java: clean/);
    assert.doesNotMatch(spotlessLog(), /TmpMenu\.java/);
    assert.equal(document.getText(), unformatted("TmpMenu"));
  });

  test("runs no build when a generic source.fixAll set for other tools saves a file in a language Spotless is not enabled for, but still formats Java where it is", async () => {
    const editor = vscode.workspace.getConfiguration("editor");
    const java = vscode.workspace.getConfiguration("editor", { languageId: "java" });
    const original = editor.inspect("codeActionsOnSave")?.workspaceValue;
    const target = vscode.ConfigurationTarget.Workspace;
    await editor.update("codeActionsOnSave", { "source.fixAll": "explicit" }, target);
    await java.update(
      "codeActionsOnSave",
      { "source.fixAll.spotlessForGradleAndMaven": "explicit" },
      target,
      true,
    );
    try {
      const notes = await createFile(path.join(options.sourceDir(), "TmpNotes.md"), "");
      await save(await openWithUnsavedText(notes, "# Notes\n"));
      await expectFormattedOnSave(options.sourceDir(), "TmpGeneric");
      await expectLog(/TmpGeneric\.java: dirty/);
      assert.doesNotMatch(spotlessLog(), /TmpNotes\.md/);
    } finally {
      await java.update("codeActionsOnSave", undefined, target, true);
      await editor.update("codeActionsOnSave", original, target);
    }
  });

  test("converts the line endings to the ones Spotless writes, so the saved file passes spotlessCheck", async () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpCrlf.java"),
      crlf(placeholder("TmpCrlf")),
    );
    const document = await openWithUnsavedText(uri, crlf(unformatted("TmpCrlf")));
    assert.equal(document.eol, vscode.EndOfLine.CRLF);
    await save(document);
    assert.equal(document.eol, vscode.EndOfLine.LF);
    assert.equal(await readDisk(uri), googleFormatted("TmpCrlf"));
  });

  test("does not format a file that two formats cover, and warns in the log", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "twoformats", "TmpTwoFormats.java"),
      placeholder("TmpTwoFormats"),
    );
    const document = await openWithUnsavedText(uri, unformatted("TmpTwoFormats"));
    await save(document);
    assert.equal(document.getText(), unformatted("TmpTwoFormats"));
    await expectLog(
      /\[warning\].*TmpTwoFormats\.java is a target of more than one Spotless format/,
    );
  });

  test("keeps a buffer with a syntax error as it is and only logs the failure", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpBroken.java"),
      placeholder("TmpBroken"),
    );
    const broken = "package com.example;\npublic class TmpBroken {\nint x = ;\n";
    const document = await openWithUnsavedText(uri, broken);
    await save(document);
    assert.equal(document.getText(), broken);
    assert.equal(await readDisk(uri), broken);
    await expectLog(/Spotless failed for .*TmpBroken\.java/);
  });

  test("formats after organize imports when the code actions on save are an array that ends with Spotless, as the README says, so the saved file passes spotlessCheck", async () => {
    const settings = workspacePath(".vscode", "settings.json");
    const original = await readFile(settings, "utf8");
    const usesArray = () =>
      Array.isArray(vscode.workspace.getConfiguration("editor").get("codeActionsOnSave"));
    const organizeImports = vscode.languages.registerCodeActionsProvider(
      { pattern: new vscode.RelativePattern(options.sourceDir(), "TmpImports.java") },
      {
        provideCodeActions(document) {
          const action = new vscode.CodeAction(
            "Organize Imports",
            vscode.CodeActionKind.SourceOrganizeImports,
          );
          action.edit = new vscode.WorkspaceEdit();
          action.edit.insert(
            document.uri,
            new vscode.Position(1, 0),
            "\nimport java.util.List;\n\nimport org.w3c.dom.Node;\n",
          );
          return [action];
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.SourceOrganizeImports] },
    );
    try {
      await writeFile(
        settings,
        JSON.stringify({
          ...(JSON.parse(original) as Record<string, unknown>),
          "editor.codeActionsOnSave": [
            "source.organizeImports",
            "source.fixAll.spotlessForGradleAndMaven",
          ],
        }),
      );
      await waitUntil(usesArray, "VS Code did not load the changed settings.json");
      const uri = await createFile(
        path.join(options.sourceDir(), "TmpImports.java"),
        placeholder("TmpImports"),
      );
      const document = await openWithUnsavedText(
        uri,
        "package com.example;\npublic class TmpImports {\nList<Node>  nodes;\n}\n",
      );
      await save(document);
      assert.equal(
        await readDisk(uri),
        "package com.example;\n\nimport java.util.List;\nimport org.w3c.dom.Node;\n\npublic class TmpImports {\n  List<Node> nodes;\n}\n",
      );
    } finally {
      await writeFile(settings, original);
      await waitUntil(() => !usesArray(), "VS Code did not load the restored settings.json");
      organizeImports.dispose();
    }
  });
}

export function shiftJisTest(sourceDir: () => string): void {
  test("round-trips Japanese text in a Shift_JIS file without mojibake", async () => {
    const encode = (text: string) => vscode.workspace.encode(text, { encoding: "shiftjis" });
    const uri = await createFile(
      path.join(sourceDir(), "TmpSjis.java"),
      await encode(placeholder("TmpSjis")),
    );
    const dirty =
      "package com.example;\n\n// 日本語のコメント\npublic class TmpSjis {\nint  x  =  1;\n}\n";
    const formatted =
      "package com.example;\n\n// 日本語のコメント\npublic class TmpSjis {\n  int x = 1;\n}\n";
    const document = await openWithUnsavedText(uri, dirty, "shiftjis");
    await save(document);
    assert.equal(document.getText(), formatted);
    assert.deepEqual(await readFile(uri.fsPath), Buffer.from(await encode(formatted)));
  });
}
