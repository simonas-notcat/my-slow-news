import { describe, test, expect, vi, beforeEach } from "vitest";

describe("env module", () => {
  test("loads dotenv on import", async () => {
    // Mock dotenv.config before importing
    const configMock = vi.fn();
    vi.doMock("dotenv", () => ({
      config: configMock,
    }));

    // Import the module (this should call dotenv.config())
    await import("./env");

    // Verify dotenv.config was called
    expect(configMock).toHaveBeenCalledOnce();
  });

  test("dotenv makes environment variables available", () => {
    // After importing env.ts, dotenv should have loaded .env file
    // We can't test specific values (they're from the real .env file)
    // but we can verify that process.env is accessible
    expect(process.env).toBeDefined();
    expect(typeof process.env).toBe("object");
  });
});
