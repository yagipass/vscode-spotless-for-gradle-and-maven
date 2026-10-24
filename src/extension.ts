import * as vscode from "vscode";
import { type FormatEdit, SpotlessFormatter } from "./formatter";
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
  const logger = vscode.window.createOutputChannel("Spotless for Gradle and Maven", {
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
      gradle: async (request) => runGradle(request, { api: await loadGradleApi(), initScript }),
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
    logger,
    (message) => vscode.window.setStatusBarMessage(message, 5000),
  );
  stopFormatting = async () => {
    await formatter.stop();
    logger.dispose();
  };

  const computeEdit = async (
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.WorkspaceEdit | undefined> => {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (document.uri.scheme !== "file" || folder === undefined) {
      return undefined;
    }
    const formatEdit = await formatter.format(document, folder.uri.fsPath, toAbortSignal(token));
    return formatEdit === undefined ? undefined : toWorkspaceEdit(document, formatEdit);
  };

  const codeActionProvider: vscode.CodeActionProvider<SpotlessCodeAction> = {
    provideCodeActions(document, _range, { only, triggerKind }) {
      return only?.contains(codeActionKind) &&
        (triggerKind === vscode.CodeActionTriggerKind.Invoke || isEnabledOnSave(document))
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

function isEnabledOnSave(document: vscode.TextDocument): boolean {
  const setting = vscode.workspace
    .getConfiguration("editor", document)
    .get<Record<string, unknown> | string[]>("codeActionsOnSave");
  const value = Array.isArray(setting)
    ? setting.includes(codeActionKind.value)
    : setting?.[codeActionKind.value];
  return Boolean(value) && value !== "never";
}

function toWorkspaceEdit(
  document: vscode.TextDocument,
  formatEdit: FormatEdit,
): vscode.WorkspaceEdit {
  const textEdits: vscode.TextEdit[] = [];
  if (formatEdit.replacement !== undefined) {
    const range = new vscode.Range(
      document.positionAt(formatEdit.replacement.start),
      document.positionAt(formatEdit.replacement.end),
    );
    textEdits.push(vscode.TextEdit.replace(range, formatEdit.replacement.text));
  }
  if (formatEdit.lineEnding !== undefined) {
    textEdits.push(
      vscode.TextEdit.setEndOfLine(
        formatEdit.lineEnding === "\r\n" ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF,
      ),
    );
  }
  const edit = new vscode.WorkspaceEdit();
  edit.set(document.uri, textEdits);
  return edit;
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
