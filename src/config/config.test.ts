import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { getEnvVar } from "./index";

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
});
