import { type Build, detectBuild, type GradleBuild, type MavenBuild } from "./build";
import {
  type BuildRequest,
  type BuildResult,
  type Codec,
  type HookOutput,
  type HookResult,
  interpretHookOutput,
  runWithHookFiles,
} from "./hook";
import { minimalEdit, type TextReplacement } from "./minimalEdit";
import { SerialQueue } from "./serialQueue";

type Backend<B extends Build> = (request: BuildRequest<B>) => Promise<BuildResult>;

export interface Backends {
  readonly gradle: Backend<GradleBuild>;
  readonly maven: Backend<MavenBuild>;
}

export type LineEnding = "\n" | "\r\n";

export interface Document {
  readonly fileName: string;
  readonly version: number;
  readonly encoding: string;
  readonly eol: 1 | 2;
  getText(): string;
}

export interface FormatEdit {
  readonly replacement: TextReplacement | undefined;
  readonly lineEnding: LineEnding | undefined;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class SpotlessFormatter {
  private readonly queue = new SerialQueue();
  private readonly stopping = new AbortController();
  private readonly projectsWithoutSpotless = new Set<string>();

  constructor(
    private readonly backends: Backends,
    private readonly codec: Codec,
    private readonly logger: Logger,
    private readonly showStatus: (message: string) => void,
  ) {}

  async format(
    document: Document,
    workspaceFolder: string,
    signal: AbortSignal,
  ): Promise<FormatEdit | undefined> {
    const file = document.fileName;
    const build = detectBuild(file, workspaceFolder);
    if (build === undefined) {
      this.logger.debug(`No Gradle or Maven build found for ${file}`);
      return undefined;
    }
    const version = document.version;
    const text = document.getText();
    const output = await this.run(
      build,
      file,
      text,
      document.encoding,
      AbortSignal.any([signal, this.stopping.signal]),
    );
    if (output === undefined) {
      return undefined;
    }
    const result = interpretHookOutput(output);
    this.report(file, result, output);
    if (result.kind !== "dirty") {
      return undefined;
    }
    if (document.version !== version) {
      this.logger.info(
        `Discarded the Spotless result for ${file} because it changed while formatting`,
      );
      return undefined;
    }
    return toFormatEdit(text, document.eol === 2 ? "\r\n" : "\n", result.formatted);
  }

  async stop(): Promise<void> {
    this.stopping.abort();
    await this.queue.idle();
  }

  buildFileChanged(): void {
    this.projectsWithoutSpotless.clear();
  }

  private async run(
    build: Build,
    file: string,
    text: string,
    encoding: string,
    signal: AbortSignal,
  ): Promise<HookOutput | undefined> {
    const project = build.tool === "maven" ? build.module : build.root;
    try {
      const output = await this.queue.run(build.root, signal, async () => {
        if (this.projectsWithoutSpotless.has(project)) {
          this.logger.debug(`Ran no build for ${file} because ${project} has no Spotless`);
          return undefined;
        }
        const started = Date.now();
        const output = await runWithHookFiles(text, encoding, this.codec, (hookFiles) =>
          build.tool === "gradle"
            ? this.backends.gradle({ build, file, hookFiles, signal })
            : this.backends.maven({ build, file, hookFiles, signal }),
        );
        this.logger.debug(
          `Spotless (${build.tool}) ran in ${String(Date.now() - started)} ms for ${file}`,
        );
        if (interpretHookOutput(output).kind === "noSpotless") {
          this.projectsWithoutSpotless.add(project);
          this.logger.info(
            `Found no Spotless in ${project}, so saves there run no build until a build file changes`,
          );
        }
        return output;
      });
      signal.throwIfAborted();
      return output;
    } catch (error) {
      if (signal.aborted) {
        this.logger.debug(`Cancelled Spotless for ${file}`);
      } else {
        this.logger.error(`Could not run Spotless for ${file}: ${String(error)}`);
      }
      return undefined;
    }
  }

  private report(file: string, result: HookResult, output: HookOutput): void {
    switch (result.kind) {
      case "failed":
        this.logger.error(
          `Spotless failed for ${file} (exit code ${String(output.exitCode)})\n${output.log}`,
        );
        return;
      case "multipleFormats":
        this.logger.warn(
          `${file} is a target of more than one Spotless format; it was not formatted.`,
        );
        this.showStatus("$(warning) Spotless: multiple formats match this file");
        return;
      case "didNotConverge":
        this.logger.warn(`Spotless did not converge for ${file}`);
        return;
      default:
        this.logger.debug(`${file}: ${result.kind}\n${output.log}`);
    }
  }
}

function toFormatEdit(
  original: string,
  lineEnding: LineEnding,
  formatted: string,
): FormatEdit | undefined {
  const formattedLineEnding = formatted.includes("\r\n")
    ? "\r\n"
    : formatted.includes("\n")
      ? "\n"
      : lineEnding;
  const replacement = minimalEdit(original, formatted.replace(/\r?\n/g, lineEnding));
  const changedLineEnding = formattedLineEnding === lineEnding ? undefined : formattedLineEnding;
  return replacement === undefined && changedLineEnding === undefined
    ? undefined
    : { replacement, lineEnding: changedLineEnding };
}
