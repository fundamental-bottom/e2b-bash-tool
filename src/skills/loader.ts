import fs from "node:fs/promises";
import path from "node:path";
import { extractBody, listSkillFiles, parseFrontmatter } from "./parser.js";
import type { LoadedSkill, SkillLoader } from "./types.js";

interface CreateLocalSkillLoaderOptions {
  /** Path to the directory containing skill subdirectories */
  directory: string;
}

/**
 * Creates a skill loader that reads skills from a local directory.
 *
 * Each subdirectory should contain a SKILL.md file with frontmatter.
 *
 * @example
 * ```typescript
 * const loader = createLocalSkillLoader({ directory: "./skills" });
 * const skills = await loader.loadSkills();
 * ```
 */
export function createLocalSkillLoader(
  options: CreateLocalSkillLoaderOptions,
): SkillLoader {
  const { directory } = options;

  return {
    async loadSkills(): Promise<LoadedSkill[]> {
      const absoluteDir = path.resolve(directory);
      const skills: LoadedSkill[] = [];

      let entries: string[];
      try {
        entries = await fs.readdir(absoluteDir);
      } catch (error) {
        throw new Error(
          `Failed to read skills directory: ${absoluteDir}. ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      for (const entryName of entries) {
        const skillDir = path.join(absoluteDir, entryName);

        // Check if it's a directory
        try {
          const stat = await fs.stat(skillDir);
          if (!stat.isDirectory()) continue;
        } catch {
          continue;
        }

        const skillMdPath = path.join(skillDir, "SKILL.md");

        let skillMdContent: string;
        try {
          skillMdContent = await fs.readFile(skillMdPath, "utf-8");
        } catch {
          continue;
        }

        const metadata = parseFrontmatter(skillMdContent);
        if (!metadata) continue;

        const body = extractBody(skillMdContent);
        const fileList = await listSkillFiles(skillDir);

        // Read all file contents
        const fileContents: Record<string, string> = {};
        for (const file of fileList) {
          const localFilePath = path.join(skillDir, file);
          try {
            const content = await fs.readFile(localFilePath, "utf-8");
            fileContents[file] = content;
          } catch {
            // Skip files that can't be read as text
          }
        }

        skills.push({
          ...metadata,
          slug: entryName,
          body,
          files: fileList,
          fileContents,
        });
      }

      return skills;
    },
  };
}
