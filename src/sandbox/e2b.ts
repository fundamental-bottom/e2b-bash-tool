import type { CommandResult, Sandbox } from "../types.js";

/**
 * Minimal interface for the @e2b/code-interpreter methods we actually use.
 * This allows proper typing without requiring the full class.
 */
export interface E2BSandboxLike {
  sandboxId: string;
  commands: {
    run: (
      cmd: string,
      opts?: {
        cwd?: string;
        envs?: Record<string, string>;
        timeout?: number;
      },
    ) => Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>;
  };
  files: {
    read(path: string, opts?: Record<string, unknown>): Promise<string>;
    write(
      path: string,
      data: string | ArrayBuffer | Blob | ReadableStream,
      opts?: Record<string, unknown>,
    ): Promise<unknown>;
    write(
      files: Array<{
        path: string;
        data: string | ArrayBuffer | Blob | ReadableStream;
      }>,
      opts?: Record<string, unknown>,
    ): Promise<unknown>;
  };
  kill: () => Promise<void>;
}

/**
 * Check if an object is an @e2b/code-interpreter Sandbox instance using duck-typing.
 */
export function isE2BSandbox(obj: unknown): obj is E2BSandboxLike {
  if (!obj || typeof obj !== "object") return false;
  const candidate = obj as Record<string, unknown>;
  // @e2b/code-interpreter Sandbox class has these characteristic properties
  return (
    typeof candidate.sandboxId === "string" &&
    candidate.commands != null &&
    typeof (candidate.commands as Record<string, unknown>).run === "function" &&
    candidate.files != null &&
    typeof (candidate.files as Record<string, unknown>).read === "function" &&
    typeof candidate.kill === "function"
  );
}

/**
 * Wraps an @e2b/code-interpreter Sandbox instance to conform to our Sandbox interface.
 */
export function wrapE2BSandbox(e2bSandbox: E2BSandboxLike): Sandbox {
  return {
    async executeCommand(command: string): Promise<CommandResult> {
      const result = await e2bSandbox.commands.run(command);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    },

    async readFile(filePath: string): Promise<string> {
      try {
        return await e2bSandbox.files.read(filePath);
      } catch {
        throw new Error(`File not found: ${filePath}`);
      }
    },

    async writeFiles(
      files: Array<{ path: string; content: string | Buffer }>,
    ): Promise<void> {
      await e2bSandbox.files.write(
        files.map((f) => ({
          path: f.path,
          data:
            typeof f.content === "string"
              ? f.content
              : f.content.toString("utf-8"),
        })),
      );
    },
  };
}
