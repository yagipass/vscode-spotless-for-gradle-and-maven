import * as assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  cancelSave,
  commonSuite,
  createFile,
  expectFormattedOnSave,
  expectLog,
  expectNoProcess,
  openWithUnsavedText,
  placeholder,
  save,
  shiftJisTest,
  sourceDir,
  unformatted,
  waitUntil,
  workspacePath,
} from "./helpers";

const expectedExecutable =
  process.env["SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_MAVEN"] ?? "";
const expectedFileName =
  process.platform === "win32"
    ? `${expectedExecutable}.cmd`
    : expectedExecutable;

suite(`Maven single module (${expectedExecutable})`, () => {
  commonSuite({
    sourceDir: () => sourceDir("single"),
    buildFile: () => workspacePath("single", "pom.xml"),
    uncoveredSuffix: "<!--   not a Spotless target   -->\n",
  });

  test(`runs ${expectedExecutable}, so both the daemon and a pinned Maven 3.10 wrapper are covered`, async () => {
    assert.ok(["mvnd", "mvnw"].includes(expectedExecutable));
    await expectFormattedOnSave(sourceDir("single"), "TmpExecutable");
    await expectLog(
      new RegExp(
        `TmpExecutable\\.java: dirty\\n.*${RegExp.escape(path.sep + expectedFileName)} -q -B`,
      ),
    );
  });
});

suite(`Maven multi-module build (${expectedExecutable})`, () => {
  test("formats a module file with the plugin configured in the parent's pluginManagement, building only that module", async () => {
    await expectFormattedOnSave(sourceDir("multi", "app"), "TmpModule");
    await expectLog(/TmpModule\.java: dirty\n.* -pl app /);
  });
});

suite(
  `Maven configuration from a plugin dependency (${expectedExecutable})`,
  () => {
    test("applies the Eclipse formatter settings packaged in a jar on the plugin's classpath", async () => {
      const uri = await createFile(
        path.join(sourceDir("eclipse-config"), "TmpEclipse.java"),
        placeholder("TmpEclipse"),
      );
      const document = await openWithUnsavedText(
        uri,
        unformatted("TmpEclipse"),
      );
      await save(document);
      assert.equal(
        document.getText(),
        "package com.example;\npublic class TmpEclipse {\n       int x = 1;\n}\n",
      );
    });
  },
);

suite(`Maven Shift_JIS sources (${expectedExecutable})`, () => {
  shiftJisTest(() => sourceDir("sjis"));
});

suite(`Maven cancellation (${expectedExecutable})`, () => {
  test("stops the build when the user cancels a slow save, so no build process is left running", async () => {
    const hanging = workspacePath("hang", "target", "hanging");
    await rm(hanging, { force: true });
    const uri = await createFile(
      path.join(sourceDir("hang"), "TmpCancel.java"),
      placeholder("TmpCancel"),
    );
    const document = await openWithUnsavedText(uri, unformatted("TmpCancel"));
    await vscode.commands.executeCommand("notifications.clearAll");
    const saving = document.save();
    await waitUntil(() => existsSync(hanging), "the build did not start");
    await cancelSave(saving);
    assert.equal(document.getText(), unformatted("TmpCancel"));
    await expectNoProcess("TmpCancel.java");
  });
});
