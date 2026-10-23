import * as assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  commonSuite,
  expectFormattedOnSave,
  expectLog,
  googleFormatted,
  openWithUnsavedText,
  readDisk,
  restoreAfterTest,
  save,
  shiftJisTest,
  sourceDir,
  unformatted,
  workspacePath,
} from "./helpers";

suite("Gradle single project", () => {
  commonSuite({
    sourceDir: () => sourceDir("single"),
    buildFile: () => workspacePath("single", "build.gradle"),
    uncoveredSuffix: "\n//   not a Spotless target   \n",
  });
});

suite("Gradle multi-project build", () => {
  test("formats a subproject file with the configuration the subproject applies, keeping non-ASCII text intact even when the daemon's file.encoding is not UTF-8", () =>
    expectFormattedOnSave(sourceDir("multi", "app"), "TmpApp", (text) =>
      text.replace("\npublic", "\n// 日本語のコメント\npublic"),
    ));
});

suite("Gradle Shift_JIS sources", () => {
  shiftJisTest(() => sourceDir("sjis"));
});

suite("Gradle build with ratchetFrom", () => {
  test("formats the first save after an edit as spotlessApply would after that save, license header year included, although the file on disk still matches the ratchet ref", async () => {
    const uri = await restoreAfterTest(path.join(sourceDir("ratchet"), "Sample.java"));
    const document = await openWithUnsavedText(uri, `/* (C) 2020 */\n${unformatted("Sample")}`);
    await save(document);
    assert.equal(
      await readDisk(uri),
      `/* (C) 2020-${String(new Date().getFullYear())} */\n${googleFormatted("Sample")}`,
    );
  });

  test("leaves an unedited file that matches the ratchet ref as it is, as spotlessApply does, so opening and saving an old file does not reformat it", async () => {
    const uri = vscode.Uri.file(path.join(sourceDir("ratchet"), "Legacy.java"));
    const original = await readDisk(uri);
    const editor = await vscode.window.showTextDocument(uri);
    await vscode.commands.executeCommand("spotlessForGradleAndMaven.formatDocument");
    assert.equal(editor.document.getText(), original);
    await expectLog(/Legacy\.java: clean/);
  });
});
