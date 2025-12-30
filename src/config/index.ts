import { parse } from "yaml";
import { readFileSync, existsSync } from "fs";
import { ConfigSchema, type Config } from "../types";

const CONFIG_PATHS = ["./config.yaml", "./config.yml", "/app/config.yaml"];

export function loadConfig(): Config {
  let configPath: string | undefined;

  for (const path of CONFIG_PATHS) {
    if (existsSync(path)) {
      configPath = path;
      break;
    }
  }

  if (!configPath) {
    throw new Error(
      `Configuration file not found. Looked in: ${CONFIG_PATHS.join(", ")}`
    );
  }

  const content = readFileSync(configPath, "utf-8");
  const parsed = parse(content);
  const config = ConfigSchema.parse(parsed);

  // Allow DATABASE_URL environment variable to override config.yaml
  if (process.env.DATABASE_URL) {
    config.database.url = process.env.DATABASE_URL;
  }

  return config;
}

export function getEnvVar(name: string, required = true): string {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value ?? "";
}

export function getAnthropicApiKey(): string {
  return getEnvVar("ANTHROPIC_API_KEY");
}
