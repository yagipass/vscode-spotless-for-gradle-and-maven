import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import type { GradleBuild } from "./build";
import { type BuildRequest, type BuildResult, type HookFiles, hookProperties } from "./hook";

interface GradleOutput {
  getOutputBytes_asU8(): Uint8Array;
}

export interface GradleApi {
  runBuild(options: {
    projectFolder: string;
    args: readonly string[];
    input: string;
    onOutput: (output: GradleOutput) => void;
    showOutputColors: boolean;
    cancellationKey: string;
  }): Promise<void>;
  cancelRunBuild(options: { cancellationKey: string }): Promise<void>;
}

export interface GradleOptions {
  readonly api: GradleApi;
  readonly initScript: string;
}

export async function gradleArgs(
  file: string,
  hookFiles: HookFiles,
  initScript: string,
): Promise<string[]> {
  const realFile = await realpath(file);
  if (realFile.includes(",")) {
    throw new Error(
      "The Spotless Gradle plugin cannot format a file whose path contains a comma, because it reads the comma as a separator between files",
    );
  }
  const properties = hookProperties(realFile, hookFiles);
  return [
    "spotlessApply",
    "--quiet",
    "--no-parallel",
    "--init-script",
    initScript,
    ...properties.map((property) => `-P${property}`),
  ];
}

export async function runGradle(
  request: BuildRequest<GradleBuild>,
  options: GradleOptions,
): Promise<BuildResult> {
  const args = await gradleArgs(request.file, request.hookFiles, options.initScript);
  request.signal.throwIfAborted();
  const cancellationKey = `spotlessForGradleAndMaven-${randomUUID()}`;
  const chunks: Uint8Array[] = [];
  const running = options.api.runBuild({
    projectFolder: request.build.root,
    args,
    input: "",
    onOutput: (output) => {
      chunks.push(output.getOutputBytes_asU8());
    },
    showOutputColors: false,
    cancellationKey,
  });
  const log = () => Buffer.concat(chunks).toString("utf8");
  try {
    await settleOrAbort(running, request.signal, () => {
      void options.api.cancelRunBuild({ cancellationKey });
    });
    return { exitCode: 0, log: log() };
  } catch (error) {
    request.signal.throwIfAborted();
    return { exitCode: 1, log: `${log()}\n${String(error)}` };
  }
}

function settleOrAbort(
  promise: Promise<void>,
  signal: AbortSignal,
  onAbort: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(signal.reason as Error);
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}
