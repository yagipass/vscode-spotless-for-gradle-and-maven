import * as vscode from "vscode";
import { SpotlessFormatter } from "./formatter";
import { type GradleApi, runGradle } from "./gradle";
import { runMaven } from "./maven";

const codeActionKind = vscode.CodeActionKind.SourceFixAll.append("spotlessForGradleAndMaven");
const gradleExtensionId = "vscjava.vscode-gradle";

let stopFormatting: (() => Promise<void>) | undefined;

class SpotlessCodeAction extends vscode.CodeAction {
  constructor(readonly document: vscode.TextDocument) {
    super("Format with Spotless", codeActionKind);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("Spotless for Gradle and Maven", {
    log: true,
  });
  const extensionJar = context.asAbsolutePath("dist/spotless-for-gradle-and-maven-extension.jar");
  const initScript = context.asAbsolutePath("dist/spotless-for-gradle-and-maven.gradle");
  let missingGradleReported = false;
  const loadGradleApi = async (): Promise<GradleApi> => {
    const extension = vscode.extensions.getExtension<GradleApi>(gradleExtensionId);
    if (extension === undefined) {
      if (!missingGradleReported) {
        missingGradleReported = true;
        void vscode.window.showInformationMessage(
          `Spotless for Gradle and Maven needs the "Gradle for Java" extension (${gradleExtensionId}) to format files in Gradle builds.`,
        );
      }
      throw new Error(`${gradleExtensionId} is not installed`);
    }
    return extension.activate();
  };
  const formatter = new SpotlessFormatter(
    {
      gradle: async (request) => runGradle(request, await loadGradleApi(), initScript),
      maven: (request) =>
        runMaven(request, {
          extensionJar,
          configuredExecutable: vscode.workspace
            .getConfiguration("spotlessForGradleAndMaven")
            .get("maven.executable", ""),
        }),
    },
    {
      encode: (text, encoding) => vscode.workspace.encode(text, { encoding }),
      decode: (content, encoding) => vscode.workspace.decode(content, { encoding }),
    },
    log,
    (message) => vscode.window.setStatusBarMessage(message, 5000),
  );
  stopFormatting = async () => {
    await formatter.stop();
    log.dispose();
  };

  const computeEdit = async (
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.WorkspaceEdit | undefined> => {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (document.uri.scheme !== "file" || folder === undefined) {
      return undefined;
    }
    const edit = await formatter.format(document, folder.uri.fsPath, toAbortSignal(token));
    if (edit === undefined) {
      return undefined;
    }
    const edits: vscode.TextEdit[] = [];
    if (edit.replacement !== undefined) {
      const range = new vscode.Range(
        document.positionAt(edit.replacement.start),
        document.positionAt(edit.replacement.end),
      );
      edits.push(vscode.TextEdit.replace(range, edit.replacement.text));
    }
    if (edit.lineEnding !== undefined) {
      edits.push(
        vscode.TextEdit.setEndOfLine(
          edit.lineEnding === "\r\n" ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF,
        ),
      );
    }
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    return workspaceEdit;
  };

  const codeActionProvider: vscode.CodeActionProvider<SpotlessCodeAction> = {
    provideCodeActions(document, _range, { only, triggerKind }) {
      return only?.contains(codeActionKind) &&
        (triggerKind === vscode.CodeActionTriggerKind.Invoke || enabledOnSave(document))
        ? [new SpotlessCodeAction(document)]
        : [];
    },
    async resolveCodeAction(action, token) {
      action.edit = await computeEdit(action.document, token);
      return action;
    },
  };

  const formatDocument = async () => {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
      return;
    }
    const edit = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Spotless: formatting",
        cancellable: true,
      },
      (_progress, token) => computeEdit(document, token),
    );
    if (edit !== undefined) {
      await vscode.workspace.applyEdit(edit);
    }
  };

  const buildFiles = vscode.workspace.createFileSystemWatcher("**/{pom.xml,*.gradle,*.gradle.kts}");
  const buildFileChanged = () => {
    formatter.buildFileChanged();
  };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ scheme: "file" }, codeActionProvider, {
      providedCodeActionKinds: [codeActionKind],
    }),
    vscode.commands.registerCommand("spotlessForGradleAndMaven.formatDocument", formatDocument),
    buildFiles,
    buildFiles.onDidCreate(buildFileChanged),
    buildFiles.onDidChange(buildFileChanged),
    buildFiles.onDidDelete(buildFileChanged),
  );
}

export async function deactivate(): Promise<void> {
  await stopFormatting?.();
}

function enabledOnSave(document: vscode.TextDocument): boolean {
  const setting = vscode.workspace
    .getConfiguration("editor", document)
    .get<Record<string, unknown> | string[]>("codeActionsOnSave");
  const value = Array.isArray(setting)
    ? setting.includes(codeActionKind.value)
    : setting?.[codeActionKind.value];
  return Boolean(value) && value !== "never";
}

function toAbortSignal(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  if (token.isCancellationRequested) {
    controller.abort();
  }
  token.onCancellationRequested(() => {
    controller.abort();
  });
  return controller.signal;
}
