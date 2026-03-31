import path from "node:path";
import { createLocalSkillLoader } from "./skills/loader.js";
import type {
  CreateSkillToolOptions,
  Skill,
  SkillLoader,
  SkillToolkit,
} from "./skills/types.js";
import { createSkillTool } from "./tools/skill.js";

const DEFAULT_DESTINATION = "skills";

function resolveLoader(options: CreateSkillToolOptions): SkillLoader {
  const { skillsDirectory, loader } = options;

  if (skillsDirectory && loader) {
    throw new Error(
      "Cannot specify both 'skillsDirectory' and 'loader'. Use one or the other.",
    );
  }

  if (!skillsDirectory && !loader) {
    throw new Error("Must specify either 'skillsDirectory' or 'loader'.");
  }

  if (loader) {
    return loader;
  }

  return createLocalSkillLoader({ directory: skillsDirectory as string });
}

/**
 * Creates a skill toolkit for AI agents.
 *
 * Skills are modular capabilities that extend agent functionality.
 * Each skill is a directory containing a SKILL.md file with instructions
 * and optional scripts/resources.
 *
 * @example
 * ```typescript
 * import {
 *   experimental_createSkillTool as createSkillTool,
 *   createBashTool,
 * } from "@funda-ai/e2b-bash-tool";
 *
 * // From a local directory
 * const { skill, skills, files, instructions } = await createSkillTool({
 *   skillsDirectory: "./skills",
 * });
 *
 * // Or with a custom loader (S3, database, etc.)
 * const { skill, skills, files, instructions } = await createSkillTool({
 *   loader: myS3Loader,
 * });
 *
 * // Create bash tool with skill files
 * const { tools, sandbox } = await createBashTool({
 *   files,
 *   extraInstructions: instructions,
 * });
 *
 * // Use with AI SDK
 * const result = await generateText({
 *   model,
 *   tools: { skill, ...tools },
 *   prompt: "Process this data using the csv skill",
 * });
 * ```
 */
export async function experimental_createSkillTool(
  options: CreateSkillToolOptions,
): Promise<SkillToolkit> {
  const { destination = DEFAULT_DESTINATION } = options;
  const loader = resolveLoader(options);

  // Load all skills via the loader
  const loadedSkills = await loader.loadSkills();

  // Map LoadedSkill[] → Skill[] and collect files
  const skills: Skill[] = [];
  const allFiles: Record<string, string> = {};

  for (const loaded of loadedSkills) {
    const sandboxPath = `./${destination}/${loaded.slug}`;

    skills.push({
      name: loaded.name,
      description: loaded.description,
      sandboxPath,
      body: loaded.body,
      files: loaded.files,
    });

    for (const [file, content] of Object.entries(loaded.fileContents)) {
      const key = `./${path.posix.join(destination, loaded.slug, file)}`;
      allFiles[key] = content;
    }
  }

  // Create skill tool
  const skill = createSkillTool({ skills });

  // Generate instructions for bash tool
  const instructions = generateSkillInstructions(skills);

  return {
    skill,
    skills,
    files: allFiles,
    instructions,
  };
}

/**
 * Generate bash tool instructions that include skill paths.
 */
function generateSkillInstructions(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const lines = [
    "SKILL DIRECTORIES:",
    "Skills are available at the following paths:",
  ];

  for (const skill of skills) {
    lines.push(`  ${skill.sandboxPath}/ - ${skill.name}: ${skill.description}`);
  }

  lines.push("");
  lines.push("To use a skill:");
  lines.push("  1. Call skill to get the skill's instructions");
  lines.push("  2. Run scripts from the skill directory with bash");

  return lines.join("\n");
}
