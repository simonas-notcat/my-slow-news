import { z } from "zod";

const envSchema = z.object({
  // Required environment variables
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  SURREALDB_USERNAME: z.string().min(1, "SURREALDB_USERNAME is required"),
  SURREALDB_PASSWORD: z.string().min(1, "SURREALDB_PASSWORD is required"),

  // Optional environment variables
  // DATABASE_URL must be a valid WebSocket URL (ws:// or wss://)
  DATABASE_URL: z
    .string()
    .refine(
      (url) => url.startsWith("ws://") || url.startsWith("wss://"),
      { message: "DATABASE_URL must be a WebSocket URL (ws:// or wss://)" }
    )
    .optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables against the schema.
 * Exits the process with error code 1 if validation fails.
 *
 * @returns Validated environment variables
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Environment validation failed:");
    result.error.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    });
    console.error(
      "\nPlease ensure all required environment variables are set in your .env file.",
    );
    process.exit(1);
  }

  return result.data;
}
