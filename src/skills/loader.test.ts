import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalSkillLoader } from "./loader.js";

describe("createLocalSkillLoader", () => {
  const testDir = "/tmp/claude/test-skill-loader";

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("loads skills from a directory", async () => {
    const skillDir = path.join(testDir, "pdf-skill");
    await fs.mkdir(skillDir);
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: pdf
description: Process PDF files
---

# PDF Processing

Use this skill to process PDFs.`,
    );
    await fs.writeFile(path.join(skillDir, "process.py"), 'print("pdf")');

    const loader = createLocalSkillLoader({ directory: testDir });
    const skills = await loader.loadSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("pdf");
    expect(skills[0].description).toBe("Process PDF files");
    expect(skills[0].slug).toBe("pdf-skill");
    expect(skills[0].body).toContain("# PDF Processing");
    expect(skills[0].files).toContain("SKILL.md");
    expect(skills[0].files).toContain("process.py");
    expect(skills[0].fileContents["SKILL.md"]).toContain("pdf");
    expect(skills[0].fileContents["process.py"]).toBe('print("pdf")');
  });

  it("discovers multiple skills", async () => {
    for (const name of ["alpha", "beta"]) {
      const dir = path.join(testDir, name);
      await fs.mkdir(dir);
      await fs.writeFile(
        path.join(dir, "SKILL.md"),
        `---
name: ${name}
description: ${name} skill
---`,
      );
    }

    const loader = createLocalSkillLoader({ directory: testDir });
    const skills = await loader.loadSkills();

    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["alpha", "beta"]);
  });

  it("sets slug to directory basename", async () => {
    const skillDir = path.join(testDir, "my-custom-dir");
    await fs.mkdir(skillDir);
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: tool
description: A tool
---`,
    );

    const loader = createLocalSkillLoader({ directory: testDir });
    const skills = await loader.loadSkills();

    expect(skills[0].slug).toBe("my-custom-dir");
  });

  it("skips directories without SKILL.md", async () => {
    const noSkill = path.join(testDir, "no-skill");
    await fs.mkdir(noSkill);
    await fs.writeFile(path.join(noSkill, "readme.md"), "not a skill");

    const withSkill = path.join(testDir, "with-skill");
    await fs.mkdir(withSkill);
    await fs.writeFile(
      path.join(withSkill, "SKILL.md"),
      `---
name: real
description: A real skill
---`,
    );

    const loader = createLocalSkillLoader({ directory: testDir });
    const skills = await loader.loadSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("real");
  });

  it("skips files in the skills directory (only reads subdirectories)", async () => {
    await fs.writeFile(path.join(testDir, "stray-file.txt"), "not a skill");

    const loader = createLocalSkillLoader({ directory: testDir });
    const skills = await loader.loadSkills();

    expect(skills).toHaveLength(0);
  });

  it("returns empty for empty directory", async () => {
    const loader = createLocalSkillLoader({ directory: testDir });
    const skills = await loader.loadSkills();

    expect(skills).toHaveLength(0);
  });

  it("throws for non-existent directory", async () => {
    const loader = createLocalSkillLoader({
      directory: "/tmp/claude/nonexistent",
    });

    await expect(loader.loadSkills()).rejects.toThrow(
      "Failed to read skills directory",
    );
  });

  it("skips SKILL.md with invalid frontmatter", async () => {
    const skillDir = path.join(testDir, "bad-skill");
    await fs.mkdir(skillDir);
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "no frontmatter here");

    const loader = createLocalSkillLoader({ directory: testDir });
    const skills = await loader.loadSkills();

    expect(skills).toHaveLength(0);
  });

  it("handles nested files in skill directories", async () => {
    const skillDir = path.join(testDir, "nested-skill");
    await fs.mkdir(skillDir);
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: nested
description: Has nested files
---`,
    );
    await fs.mkdir(path.join(skillDir, "scripts"));
    await fs.writeFile(path.join(skillDir, "scripts", "run.sh"), "echo hello");

    const loader = createLocalSkillLoader({ directory: testDir });
    const skills = await loader.loadSkills();

    expect(skills[0].files).toContain("scripts/run.sh");
    expect(skills[0].fileContents["scripts/run.sh"]).toBe("echo hello");
  });
});
