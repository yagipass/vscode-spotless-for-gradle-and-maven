import * as assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm, symlink } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  cancelSave,
  commonSuite,
  createFile,
  escapeRegExp,
  expectFormattedOnSave,
  expectLog,
  expectNoProcess,
  googleFormatted,
  openWithUnsavedText,
  placeholder,
  readDisk,
  restoreAfterTest,
  save,
  shiftJisTest,
  sourceDir,
  unformatted,
  waitUntil,
  workspacePath,
} from "./helpers";

const expectedExecutable = process.env["SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_MAVEN"] ?? "";
const expectedFileName =
  process.platform === "win32" ? `${expectedExecutable}.cmd` : expectedExecutable;

suite(`Maven single module (${expectedExecutable})`, () => {
  commonSuite({
    sourceDir: () => sourceDir("single"),
    buildFile: () => workspacePath("single", "pom.xml"),
    withoutSpotless:
      '<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>com.example</groupId>\n  <artifactId>single</artifactId>\n  <version>1.0</version>\n</project>\n',
    uncoveredSuffix: "<!--   not a Spotless target   -->\n",
  });

  test(`runs ${expectedExecutable}, so both the daemon and the Maven that the wrapper pins are covered`, async () => {
    assert.ok(["mvnd", "mvnw"].includes(expectedExecutable));
    await expectFormattedOnSave(sourceDir("single"), "TmpExecutable");
    await expectLog(
      new RegExp(
        `TmpExecutable\\.java: dirty\\n.*${escapeRegExp(path.sep + expectedFileName)} -q -B`,
      ),
    );
  });
});

suite(`Maven multi-module build (${expectedExecutable})`, () => {
  test("formats a file in a module that only an inactive profile lists with the parent's configuration, as Maven run in that module's directory does", () =>
    expectFormattedOnSave(sourceDir("multi", "it"), "TmpProfileModule"));

  test("formats a module file with the plugin configured in the parent's pluginManagement, building only that module", async () => {
    await expectFormattedOnSave(sourceDir("multi", "app"), "TmpModule");
    await expectLog(/TmpModule\.java: dirty\n.* -pl app /);
  });
});

suite(`Maven build reached through a symbolic link (${expectedExecutable})`, () => {
  suiteSetup(() => symlink(workspacePath("single"), workspacePath("linked"), "junction"));
  suiteTeardown(() => rm(workspacePath("linked"), { force: true }));

  test("formats a file whose build root is reached through a symbolic link, so a workspace opened through one is formatted too", () =>
    expectFormattedOnSave(sourceDir("linked"), "TmpLinked"));
});

suite(`Maven configuration from a plugin dependency (${expectedExecutable})`, () => {
  test("applies the Eclipse formatter settings packaged in a jar on the plugin's classpath", async () => {
    const uri = await createFile(
      path.join(sourceDir("eclipse-config"), "TmpEclipse.java"),
      placeholder("TmpEclipse"),
    );
    const document = await openWithUnsavedText(uri, unformatted("TmpEclipse"));
    await save(document);
    assert.equal(
      document.getText(),
      "package com.example;\npublic class TmpEclipse {\n       int x = 1;\n}\n",
    );
  });
});

suite(`Maven Shift_JIS sources (${expectedExecutable})`, () => {
  shiftJisTest(() => sourceDir("sjis"));
});

suite(`Maven build with ratchetFrom (${expectedExecutable})`, () => {
  test("formats an edited file that matched the ratchet ref on the next save, as spotless:apply would, although the mvnd daemon listed the files that differ from the ratchet ref while it still matched", async () => {
    const uri = await restoreAfterTest(path.join(sourceDir("ratchet"), "Sample.java"));
    const edited = `/* (C) 2020 */\n${unformatted("Sample")}`;
    await save(await openWithUnsavedText(uri, edited));
    await save(await openWithUnsavedText(uri, `${edited}\n`));
    assert.equal(
      await readDisk(uri),
      `/* (C) 2020-${String(new Date().getFullYear())} */\n${googleFormatted("Sample")}`,
    );
  });
});

suite(`Maven cancellation (${expectedExecutable})`, () => {
  test("stops the build when the user cancels a slow save, even when it runs in the mvnd daemon, so no build is left running", async () => {
    const hanging = workspacePath("hang", "target", "hanging");
    const interrupted = workspacePath("hang", "target", "interrupted");
    await rm(hanging, { force: true });
    await rm(interrupted, { force: true });
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
    const jvm = Number((await readFile(hanging, "utf8")).split("@")[0]);
    assert.ok(Number.isInteger(jvm) && jvm > 0, `${hanging} does not start with a PID`);
    await waitUntil(
      () => existsSync(interrupted) || !isRunning(jvm),
      "the cancelled build kept running in the Maven JVM",
    );
  });
});

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
