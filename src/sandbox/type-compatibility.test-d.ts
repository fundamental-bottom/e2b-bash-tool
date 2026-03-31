/**
 * Type compatibility tests to ensure types work correctly.
 * These tests only check types at compile time - they don't run.
 */
import type { Sandbox as E2BSandbox } from "@e2b/code-interpreter";
import type { CreateBashToolOptions, Sandbox } from "../types.js";
import type { E2BSandboxLike } from "./e2b.js";

// Test: @e2b/code-interpreter Sandbox class is assignable to our E2BSandboxLike interface
function e2bSandboxMatchesOurInterface(sandbox: E2BSandbox) {
  const compatible: E2BSandboxLike = sandbox;
  return compatible;
}

// Test: @e2b/code-interpreter instance can be passed to createBashTool
function acceptsE2BSandbox(sandbox: E2BSandbox) {
  const options: CreateBashToolOptions = { sandbox };
  return options;
}

// Test: Our Sandbox interface methods are correctly typed
function ourSandboxIsValid(sandbox: Sandbox) {
  sandbox.executeCommand("ls");
  sandbox.readFile("/file");
  sandbox.writeFiles([{ path: "/file", content: "content" }]);
}

// Suppress unused variable warnings
void e2bSandboxMatchesOurInterface;
void acceptsE2BSandbox;
void ourSandboxIsValid;
