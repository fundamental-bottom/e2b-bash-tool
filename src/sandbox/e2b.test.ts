import { describe, expect, it, vi } from "vitest";
import { type E2BSandboxLike, isE2BSandbox, wrapE2BSandbox } from "./e2b.js";

describe("isE2BSandbox", () => {
  it("returns false for null/undefined", () => {
    expect(isE2BSandbox(null)).toBe(false);
    expect(isE2BSandbox(undefined)).toBe(false);
  });

  it("returns false for plain objects", () => {
    expect(isE2BSandbox({})).toBe(false);
    expect(isE2BSandbox({ foo: "bar" })).toBe(false);
  });

  it("returns false for objects missing required properties", () => {
    expect(isE2BSandbox({ sandboxId: "123" })).toBe(false);
    expect(isE2BSandbox({ sandboxId: "123", commands: {} })).toBe(false);
  });

  it("returns true for objects matching @e2b/code-interpreter shape", () => {
    const mockE2BSandbox = {
      sandboxId: "sbx-123",
      commands: {
        run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      },
      files: {
        read: async () => "",
        write: async () => {},
      },
      kill: async () => {},
    };
    expect(isE2BSandbox(mockE2BSandbox)).toBe(true);
  });
});

describe("wrapE2BSandbox", () => {
  it("wraps executeCommand using commands.run", async () => {
    const mockRun = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "output",
      stderr: "",
    });

    const mockE2BSandbox: E2BSandboxLike = {
      sandboxId: "sbx-123",
      commands: { run: mockRun },
      files: { read: vi.fn(), write: vi.fn() },
      kill: vi.fn(),
    };

    const sandbox = wrapE2BSandbox(mockE2BSandbox);
    const result = await sandbox.executeCommand("ls -la");

    expect(mockRun).toHaveBeenCalledWith("ls -la");
    expect(result).toEqual({ stdout: "output", stderr: "", exitCode: 0 });
  });

  it("wraps readFile and returns string directly", async () => {
    const mockRead = vi.fn().mockResolvedValue("file content");

    const mockE2BSandbox: E2BSandboxLike = {
      sandboxId: "sbx-123",
      commands: { run: vi.fn() },
      files: { read: mockRead, write: vi.fn() },
      kill: vi.fn(),
    };

    const sandbox = wrapE2BSandbox(mockE2BSandbox);
    const content = await sandbox.readFile("/test.txt");

    expect(mockRead).toHaveBeenCalledWith("/test.txt");
    expect(content).toBe("file content");
  });

  it("throws on readFile when file not found", async () => {
    const mockRead = vi.fn().mockRejectedValue(new Error("not found"));

    const mockE2BSandbox: E2BSandboxLike = {
      sandboxId: "sbx-123",
      commands: { run: vi.fn() },
      files: { read: mockRead, write: vi.fn() },
      kill: vi.fn(),
    };

    const sandbox = wrapE2BSandbox(mockE2BSandbox);
    await expect(sandbox.readFile("/missing.txt")).rejects.toThrow(
      "File not found",
    );
  });

  it("wraps writeFiles with string content", async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);

    const mockE2BSandbox: E2BSandboxLike = {
      sandboxId: "sbx-123",
      commands: { run: vi.fn() },
      files: { read: vi.fn(), write: mockWrite },
      kill: vi.fn(),
    };

    const sandbox = wrapE2BSandbox(mockE2BSandbox);
    await sandbox.writeFiles([
      { path: "/test.txt", content: "content" },
      { path: "/other.txt", content: "other" },
    ]);

    expect(mockWrite).toHaveBeenCalledWith([
      { path: "/test.txt", data: "content" },
      { path: "/other.txt", data: "other" },
    ]);
  });

  it("converts Buffer content to string for writes", async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);

    const mockE2BSandbox: E2BSandboxLike = {
      sandboxId: "sbx-123",
      commands: { run: vi.fn() },
      files: { read: vi.fn(), write: mockWrite },
      kill: vi.fn(),
    };

    const binaryContent = Buffer.from("binary data");
    const sandbox = wrapE2BSandbox(mockE2BSandbox);
    await sandbox.writeFiles([
      { path: "/binary.bin", content: binaryContent },
      { path: "/text.txt", content: "string" },
    ]);

    expect(mockWrite).toHaveBeenCalledWith([
      { path: "/binary.bin", data: "binary data" },
      { path: "/text.txt", data: "string" },
    ]);
  });
});
