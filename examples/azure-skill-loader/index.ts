/**
 * Example: Loading skills from Azure Blob Storage
 *
 * This example demonstrates how to use the SkillLoader interface
 * to load skills from an Azure Blob Storage container instead of
 * a local directory.
 *
 * Container layout:
 *   skills/
 *     csv/
 *       SKILL.md
 *       scripts/analyze.sh
 *       scripts/filter.sh
 *     text/
 *       SKILL.md
 *       scripts/stats.sh
 *
 * Environment variables:
 *   AZURE_STORAGE_CONNECTION_STRING - Azure Storage connection string
 *   AZURE_STORAGE_CONTAINER        - Container name (default: "skills")
 *   AZURE_STORAGE_PREFIX            - Blob prefix (default: "skills/")
 *
 * Run with: npx tsx examples/azure-skill-loader/index.ts
 */

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { ToolLoopAgent } from "ai";
import {
  createBashTool,
  experimental_createSkillTool as createSkillTool,
  type LoadedSkill,
  type SkillLoader,
} from "../../src/index.js";
import { extractBody, parseFrontmatter } from "../../src/skills/parser.js";

// ---------------------------------------------------------------------------
// Azure Blob Storage Skill Loader
// ---------------------------------------------------------------------------

interface AzureSkillLoaderOptions {
  /** Azure Blob Storage container client */
  containerClient: ContainerClient;
  /**
   * Blob prefix where skills are stored.
   * Each skill is a "subdirectory" under this prefix containing a SKILL.md.
   * @default "skills/"
   */
  prefix?: string;
}

/**
 * Creates a SkillLoader that reads skills from Azure Blob Storage.
 *
 * Expected blob layout under prefix:
 *   <prefix>/<skill-slug>/SKILL.md
 *   <prefix>/<skill-slug>/scripts/run.sh
 *   ...
 */
function createAzureSkillLoader(options: AzureSkillLoaderOptions): SkillLoader {
  const { containerClient, prefix = "skills/" } = options;

  // Normalize prefix to always end with /
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

  return {
    async loadSkills(): Promise<LoadedSkill[]> {
      // 1. Discover skill slugs by listing blobs with the prefix
      //    and finding unique "directories" that contain SKILL.md
      const blobsBySkill = new Map<string, string[]>();

      for await (const blob of containerClient.listBlobsFlat({
        prefix: normalizedPrefix,
      })) {
        // blob.name is e.g. "skills/csv/SKILL.md" or "skills/csv/scripts/analyze.sh"
        const relative = blob.name.slice(normalizedPrefix.length);
        const slashIdx = relative.indexOf("/");
        if (slashIdx === -1) continue; // skip files directly under prefix

        const slug = relative.slice(0, slashIdx);
        const filePath = relative.slice(slashIdx + 1);

        const existing = blobsBySkill.get(slug);
        if (existing) {
          existing.push(filePath);
        } else {
          blobsBySkill.set(slug, [filePath]);
        }
      }

      // 2. For each skill slug, download files and parse SKILL.md
      const skills: LoadedSkill[] = [];

      for (const [slug, files] of blobsBySkill) {
        if (!files.includes("SKILL.md")) continue;

        // Download all files
        const fileContents: Record<string, string> = {};
        for (const file of files) {
          const blobName = `${normalizedPrefix}${slug}/${file}`;
          const blobClient = containerClient.getBlobClient(blobName);
          const response = await blobClient.download();
          if (response.readableStreamBody) {
            fileContents[file] = await streamToString(
              response.readableStreamBody,
            );
          }
        }

        // Parse SKILL.md
        const skillMdContent = fileContents["SKILL.md"];
        if (!skillMdContent) continue;

        const metadata = parseFrontmatter(skillMdContent);
        if (!metadata) continue;

        const body = extractBody(skillMdContent);

        skills.push({
          ...metadata,
          slug,
          body,
          files,
          fileContents,
        });
      }

      return skills;
    },
  };
}

async function streamToString(
  readable: NodeJS.ReadableStream,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Connect to Azure Blob Storage
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    console.error("Set AZURE_STORAGE_CONNECTION_STRING environment variable.");
    process.exit(1);
  }

  const containerName = process.env.AZURE_STORAGE_CONTAINER ?? "skills";
  const prefix = process.env.AZURE_STORAGE_PREFIX ?? "skills/";

  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);

  // Create Azure loader
  const loader = createAzureSkillLoader({ containerClient, prefix });

  // Create skill toolkit using the loader
  const { skill, skills, files, instructions } = await createSkillTool({
    loader,
  });

  console.log("Skills loaded from Azure Blob Storage:");
  for (const s of skills) {
    console.log(`  - ${s.name}: ${s.description}`);
    console.log(`    sandbox path: ${s.sandboxPath}`);
  }
  console.log("");

  if (skills.length === 0) {
    console.log("No skills found. Upload skills to your container first.");
    console.log(`  Container: ${containerName}`);
    console.log(`  Prefix: ${prefix}`);
    console.log("  Expected layout: <prefix>/<skill-name>/SKILL.md");
    process.exit(0);
  }

  // Create bash tool with the files from Azure
  const { tools } = await createBashTool({
    files,
    extraInstructions: instructions,
  });

  // Create an agent
  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? "us-east-1",
    apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
  });

  const agent = new ToolLoopAgent({
    model: bedrock("us.anthropic.claude-3-5-haiku-20241022-v1:0"),
    tools: { skill, bash: tools.bash },
    instructions: `You are a data processing assistant with access to skills.
Use the skill tool to discover how to use a skill, then use bash to run its scripts.`,
    onStepFinish: ({ toolCalls }) => {
      if (toolCalls) {
        for (const call of toolCalls) {
          console.log(`Tool: ${call.toolName}`);
          if (call.toolName === "skill" && "input" in call) {
            const input = call.input as { skillName: string };
            console.log(`  Loading skill: ${input.skillName}`);
          } else if (call.toolName === "bash" && "input" in call) {
            const input = call.input as { command: string };
            console.log(`  Command: ${input.command}`);
          }
        }
      }
    },
  });

  const result = await agent.generate({
    prompt: "List all available skills, then analyze the sample CSV data.",
  });

  console.log("\n=== Response ===\n");
  console.log(result.text);
}

main().catch(console.error);
