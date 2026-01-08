import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnv } from "./env";

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a fresh copy of process.env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  test("returns validated env when all required variables are set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test123";
    process.env.SURREALDB_USERNAME = "admin";
    process.env.SURREALDB_PASSWORD = "password123";
    delete process.env.DATABASE_URL;
    delete process.env.OPENAI_API_KEY;

    const result = validateEnv();

    expect(result.ANTHROPIC_API_KEY).toBe("sk-ant-test123");
    expect(result.SURREALDB_USERNAME).toBe("admin");
    expect(result.SURREALDB_PASSWORD).toBe("password123");
    expect(result.DATABASE_URL).toBeUndefined();
    expect(result.OPENAI_API_KEY).toBeUndefined();
  });

  test("includes optional DATABASE_URL when set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test123";
    process.env.SURREALDB_USERNAME = "admin";
    process.env.SURREALDB_PASSWORD = "password123";
    process.env.DATABASE_URL = "ws://localhost:8666/rpc";

    const result = validateEnv();

    expect(result.DATABASE_URL).toBe("ws://localhost:8666/rpc");
  });

  test("includes optional OPENAI_API_KEY when set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test123";
    process.env.SURREALDB_USERNAME = "admin";
    process.env.SURREALDB_PASSWORD = "password123";
    process.env.OPENAI_API_KEY = "sk-proj-test456";

    const result = validateEnv();

    expect(result.OPENAI_API_KEY).toBe("sk-proj-test456");
  });

  test("exits with error code 1 when ANTHROPIC_API_KEY is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.SURREALDB_USERNAME = "admin";
    process.env.SURREALDB_PASSWORD = "password123";

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    expect(() => validateEnv()).toThrow("process.exit called");
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Environment validation failed"),
    );

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test("exits with error code 1 when SURREALDB_USERNAME is missing", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test123";
    delete process.env.SURREALDB_USERNAME;
    process.env.SURREALDB_PASSWORD = "password123";

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    expect(() => validateEnv()).toThrow("process.exit called");
    expect(processExitSpy).toHaveBeenCalledWith(1);

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test("exits with error code 1 when SURREALDB_PASSWORD is missing", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test123";
    process.env.SURREALDB_USERNAME = "admin";
    delete process.env.SURREALDB_PASSWORD;

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    expect(() => validateEnv()).toThrow("process.exit called");
    expect(processExitSpy).toHaveBeenCalledWith(1);

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test("exits with error when DATABASE_URL is invalid", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test123";
    process.env.SURREALDB_USERNAME = "admin";
    process.env.SURREALDB_PASSWORD = "password123";
    process.env.DATABASE_URL = "not-a-valid-url";

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    expect(() => validateEnv()).toThrow("process.exit called");
    expect(processExitSpy).toHaveBeenCalledWith(1);

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test("accepts valid DATABASE_URL formats", () => {
    const validUrls = [
      "ws://localhost:8666/rpc",
      "wss://my-instance.surreal.cloud/rpc",
      "http://localhost:8666/rpc",
      "https://my-instance.surreal.cloud/rpc",
    ];

    process.env.ANTHROPIC_API_KEY = "sk-ant-test123";
    process.env.SURREALDB_USERNAME = "admin";
    process.env.SURREALDB_PASSWORD = "password123";

    for (const url of validUrls) {
      process.env.DATABASE_URL = url;
      const result = validateEnv();
      expect(result.DATABASE_URL).toBe(url);
    }
  });

  test("displays helpful error messages for missing variables", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.SURREALDB_USERNAME;
    delete process.env.SURREALDB_PASSWORD;

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    expect(() => validateEnv()).toThrow();

    // Check that error messages are helpful
    const errorCalls = consoleErrorSpy.mock.calls.flat().join("\n");
    expect(errorCalls).toContain("ANTHROPIC_API_KEY");
    expect(errorCalls).toContain("SURREALDB_USERNAME");
    expect(errorCalls).toContain("SURREALDB_PASSWORD");
    expect(errorCalls).toContain(".env file");

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
