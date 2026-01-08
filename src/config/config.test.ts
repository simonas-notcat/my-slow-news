import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { getEnvVar, loadConfig } from "./index";
import { existsSync, readFileSync } from "fs";

describe("config", () => {
  describe("getEnvVar", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      // Clear test env vars
      delete process.env.TEST_VAR;
      delete process.env.TEST_REQUIRED;
    });

    afterEach(() => {
      // Restore original env
      process.env = { ...originalEnv };
    });

    test("returns value when env var exists", () => {
      process.env.TEST_VAR = "test_value";

      const result = getEnvVar("TEST_VAR");
      expect(result).toBe("test_value");
    });

    test("throws when required env var is missing", () => {
      expect(() => getEnvVar("TEST_REQUIRED")).toThrow(
        "Environment variable TEST_REQUIRED is required but not set"
      );
    });

    test("returns empty string when optional env var is missing", () => {
      const result = getEnvVar("TEST_VAR", false);
      expect(result).toBe("");
    });

    test("returns value for optional env var when set", () => {
      process.env.TEST_VAR = "optional_value";

      const result = getEnvVar("TEST_VAR", false);
      expect(result).toBe("optional_value");
    });

    test("handles empty string value", () => {
      process.env.TEST_VAR = "";

      // Empty string is falsy, so required check fails
      expect(() => getEnvVar("TEST_VAR")).toThrow();
    });
  });

  describe("loadConfig with DATABASE_URL override", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      // Clear DATABASE_URL
      delete process.env.DATABASE_URL;
    });

    afterEach(() => {
      // Restore original env
      process.env = { ...originalEnv };
    });

    test("uses config.yaml database URL when DATABASE_URL not set", () => {
      const config = loadConfig();

      // Should use the value from config.yaml
      expect(config.database.url).toBe("ws://localhost:8666/rpc");
    });

    test("overrides config.yaml with DATABASE_URL environment variable", () => {
      const customUrl = "wss://custom.surreal.cloud/rpc";
      process.env.DATABASE_URL = customUrl;

      const config = loadConfig();

      // Should use the environment variable override
      expect(config.database.url).toBe(customUrl);
    });

    test("preserves other database config when overriding URL", () => {
      process.env.DATABASE_URL = "wss://override.surreal.cloud/rpc";

      const config = loadConfig();

      // URL should be overridden
      expect(config.database.url).toBe("wss://override.surreal.cloud/rpc");
      // But other fields should remain from config.yaml
      expect(config.database.namespace).toBe("myslownews");
      expect(config.database.database).toBe("main");
    });
  });
});
