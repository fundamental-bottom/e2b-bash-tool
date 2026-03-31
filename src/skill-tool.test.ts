import fs from "node:fs/promises";
import path from "node:path";
import type { ToolExecutionOptions } from "ai";
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import { experimental_createSkillTool as createSkillTool } from "./skill-tool.js";
import type { SkillLoader } from "./skills/types.js";
import { createBashTool } from "./tool.js";

// AI SDK tool execute requires (args, options) - we provide test options
const opts: ToolExecutionOptions = { toolCallId: "test", messages: [] };

// Helper types for test assertions
interface SkillResult {
  success: boolean;
  error?: string;
  skill?: { name: string; description: string; path: string };
  instructions?: string;
  files?: string[];
}

describe("createSkillTool", () => {
  const testDir = "/tmp/claude/test-skill-tool";

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("discovers skills and returns files", async () => {
    const skillDir = path.join(testDir, "pdf-skill");
    await fs.mkdir(skillDir);
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: pdf
description: Process PDF files
---

# PDF Processing`,
    );

    const { skill, skills, files, instructions } = await createSkillTool({
      skillsDirectory: testDir,
    });

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("pdf");
    expect(skills[0].files).toContain("SKILL.md");
    expect(skill).toBeDefined();
    expect(files["./skills/pdf-skill/SKILL.md"]).toContain("pdf");
    expect(instructions).toContain("./skills/pdf-skill");
  });

  it("collects all skill files", async () => {
    const skillDir = path.join(testDir, "my-skill");
    await fs.mkdir(skillDir);
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: my-skill
description: Test skill
---`,
    );
    await fs.writeFile(path.join(skillDir, "script.py"), 'print("hello")');

    const { files } = await createSkillTool({ skillsDirectory: testDir });

    expect(files["./skills/my-skill/SKILL.md"]).toContain("my-skill");
    expect(files["./skills/my-skill/script.py"]).toBe('print("hello")');
  });

  it("skill returns skill instructions", async () => {
    const skillDir = path.join(testDir, "test-skill");
    await fs.mkdir(skillDir);
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: test
description: Test skill
---

# Instructions

These are the instructions.`,
    );

    const { skill } = await createSkillTool({
      skillsDirectory: testDir,
    });

    assert(skill.execute, "skill.execute should be defined");
    const result = (await skill.execute(
      { skillName: "test" },
      opts,
    )) as SkillResult;

    expect(result.success).toBe(true);
    expect(result.instructions).toContain("# Instructions");
  });

  it("skill returns error for unknown skill", async () => {
    const { skill } = await createSkillTool({
      skillsDirectory: testDir,
    });

    assert(skill.execute, "skill.execute should be defined");
    const result = (await skill.execute(
      { skillName: "nonexistent" },
      opts,
    )) as SkillResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("works with empty skills directory", async () => {
    const { skill, skills, files, instructions } = await createSkillTool({
      skillsDirectory: testDir,
    });

    expect(skills).toHaveLength(0);
    expect(skill).toBeDefined();
    expect(Object.keys(files)).toHaveLength(0);
    expect(instructions).toBe("");
  });

  it("works standalone without createBashTool for instruction-only skills", async () => {
    // Create a skill that only has instructions, no scripts
    const skillDir = path.join(testDir, "knowledge-skill");
    await fs.mkdir(skillDir);
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: json-format
description: Guidelines for formatting JSON responses
---

# JSON Formatting Guidelines

When the user asks for JSON output:

1. Use 2-space indentation
2. Always include a root object
3. Use camelCase for property names
4. Wrap arrays in an object with a descriptive key

## Example

\`\`\`json
{
  "users": [
    { "id": 1, "name": "Alice" }
  ]
}
\`\`\``,
    );

    // Use skill tool standalone - no bash needed
    const { skill, skills, files } = await createSkillTool({
      skillsDirectory: testDir,
    });

    // Skill is discovered
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("json-format");

    // Only SKILL.md in files (no scripts)
    expect(Object.keys(files)).toHaveLength(1);
    expect(files["./skills/knowledge-skill/SKILL.md"]).toContain(
      "JSON Formatting",
    );

    // Can load the skill and get instructions
    assert(skill.execute, "skill.execute should be defined");
    const result = (await skill.execute(
      { skillName: "json-format" },
      opts,
    )) as SkillResult;

    expect(result.success).toBe(true);
    expect(result.instructions).toContain("JSON Formatting Guidelines");
    expect(result.instructions).toContain("camelCase");
    expect(result.files).toHaveLength(0); // No script files
  });

  it("integrates with createBashTool", async () => {
    const skillDir = path.join(testDir, "echo-skill");
    await fs.mkdir(skillDir);
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: echo
description: Echo utility
---`,
    );
    await fs.writeFile(
      path.join(skillDir, "test.sh"),
      'echo "hello from skill"',
    );

    // Get skill files
    const { files, instructions } = await createSkillTool({
      skillsDirectory: testDir,
    });

    // Create bash tool with skill files
    const { tools } = await createBashTool({
      files,
      extraInstructions: instructions,
    });

    assert(tools.bash.execute, "bash.execute should be defined");
    const result = (await tools.bash.execute(
      { command: "cat ./skills/echo-skill/test.sh" },
      opts,
    )) as { stdout: string; stderr: string; exitCode: number };

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from skill");
  });
});

describe("createSkillTool with custom loader", () => {
  it("works with a custom SkillLoader", async () => {
    const loader: SkillLoader = {
      async loadSkills() {
        return [
          {
            name: "custom",
            description: "A custom skill",
            slug: "custom-skill",
            body: "# Custom Instructions\n\nDo custom things.",
            files: ["SKILL.md", "run.sh"],
            fileContents: {
              "SKILL.md":
                "---\nname: custom\ndescription: A custom skill\n---\n\n# Custom Instructions\n\nDo custom things.",
              "run.sh": 'echo "custom"',
            },
          },
        ];
      },
    };

    const { skill, skills, files, instructions } = await createSkillTool({
      loader,
    });

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("custom");
    expect(skills[0].sandboxPath).toBe("./skills/custom-skill");
    expect(skills[0].body).toContain("Custom Instructions");
    expect(files["./skills/custom-skill/SKILL.md"]).toContain("custom");
    expect(files["./skills/custom-skill/run.sh"]).toBe('echo "custom"');
    expect(instructions).toContain("custom-skill");

    // Execute the skill tool
    assert(skill.execute, "skill.execute should be defined");
    const result = (await skill.execute(
      { skillName: "custom" },
      opts,
    )) as SkillResult;

    expect(result.success).toBe(true);
    expect(result.instructions).toContain("Custom Instructions");
    expect(result.files).toEqual(["run.sh"]);
  });

  it("works with an empty loader", async () => {
    const loader: SkillLoader = {
      async loadSkills() {
        return [];
      },
    };

    const { skills, files, instructions } = await createSkillTool({ loader });

    expect(skills).toHaveLength(0);
    expect(Object.keys(files)).toHaveLength(0);
    expect(instructions).toBe("");
  });

  it("throws when both skillsDirectory and loader are provided", async () => {
    const loader: SkillLoader = {
      async loadSkills() {
        return [];
      },
    };

    await expect(
      createSkillTool({
        skillsDirectory: "/tmp",
        loader,
      }),
    ).rejects.toThrow("Cannot specify both");
  });

  it("throws when neither skillsDirectory nor loader is provided", async () => {
    await expect(createSkillTool({})).rejects.toThrow("Must specify either");
  });

  it("respects custom destination with loader", async () => {
    const loader: SkillLoader = {
      async loadSkills() {
        return [
          {
            name: "test",
            description: "Test",
            slug: "test-slug",
            body: "instructions",
            files: ["SKILL.md"],
            fileContents: { "SKILL.md": "content" },
          },
        ];
      },
    };

    const { skills, files } = await createSkillTool({
      loader,
      destination: "my-skills",
    });

    expect(skills[0].sandboxPath).toBe("./my-skills/test-slug");
    expect(files["./my-skills/test-slug/SKILL.md"]).toBe("content");
  });
});
