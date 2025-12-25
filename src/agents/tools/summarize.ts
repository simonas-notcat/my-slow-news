import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export const saveDigestTool = createTool({
  id: "save-digest",
  description: "Save the generated digest to a markdown file",
  inputSchema: z.object({
    file_path: z.string().describe("Path to save the digest file"),
    content: z.string().describe("The markdown content to save"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
  }),
  execute: async ({ context }) => {
    const { file_path, content } = context;

    // Ensure directory exists
    mkdirSync(dirname(file_path), { recursive: true });

    // Write the file
    writeFileSync(file_path, content, "utf-8");

    return {
      success: true,
      path: file_path,
    };
  },
});
