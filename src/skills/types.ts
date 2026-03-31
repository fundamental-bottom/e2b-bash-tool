import type { createSkillTool } from "../tools/skill.js";

/**
 * Skill metadata parsed from SKILL.md frontmatter.
 */
export interface SkillMetadata {
  /** Unique skill name (lowercase, hyphens allowed) */
  name: string;
  /** Description of what the skill does and when to use it */
  description: string;
}

/**
 * Base skill info from discovery (without file list).
 * @deprecated Use {@link LoadedSkill} with a {@link SkillLoader} instead.
 */
export interface DiscoveredSkill extends SkillMetadata {
  /** Absolute path to the skill directory on disk */
  localPath: string;
  /** Path to the skill directory in the sandbox */
  sandboxPath: string;
}

/**
 * A skill loaded by a SkillLoader with all data resolved eagerly.
 */
export interface LoadedSkill {
  /** Unique skill name (from frontmatter) */
  name: string;
  /** Description of what the skill does (from frontmatter) */
  description: string;
  /** Short identifier used for sandbox path construction (e.g., directory name) */
  slug: string;
  /** SKILL.md body (instructions), already extracted */
  body: string;
  /** Relative file paths within this skill */
  files: string[];
  /** File contents keyed by relative path */
  fileContents: Record<string, string>;
}

/**
 * Abstraction for loading skills from any source (filesystem, S3, database, etc.).
 */
export interface SkillLoader {
  loadSkills(): Promise<LoadedSkill[]>;
}

/**
 * Full skill representation used internally and returned in SkillToolkit.
 */
export interface Skill {
  /** Unique skill name */
  name: string;
  /** Description of what the skill does */
  description: string;
  /** Path to the skill directory in the sandbox */
  sandboxPath: string;
  /** SKILL.md body (instructions) */
  body: string;
  /** List of files in the skill directory (relative paths) */
  files: string[];
}

/**
 * Options for creating a skill toolkit.
 */
export interface CreateSkillToolOptions {
  /**
   * Path to the directory containing skill subdirectories.
   * Each subdirectory should contain a SKILL.md file.
   * Shorthand for `loader: createLocalSkillLoader({ directory: skillsDirectory })`.
   * Cannot be used together with `loader`.
   * @example "./skills" or "/path/to/skills"
   */
  skillsDirectory?: string;

  /**
   * Custom skill loader for loading skills from any source.
   * Cannot be used together with `skillsDirectory`.
   */
  loader?: SkillLoader;

  /**
   * Relative path within the workspace where skills will be placed.
   * @default "skills"
   * @example "skills" -> files at ./skills/...
   */
  destination?: string;
}

/**
 * Return type from createSkillTool.
 */
export interface SkillToolkit {
  /** Tool to load a skill's instructions into context */
  skill: ReturnType<typeof createSkillTool>;
  /** Registry of discovered skills */
  skills: Skill[];
  /** Files to pass to createBashTool (path -> content) */
  files: Record<string, string>;
  /** Extra instructions to pass to createBashTool */
  instructions: string;
}
