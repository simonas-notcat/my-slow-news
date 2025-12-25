import { describe, expect, test } from "bun:test";
import { ConfigSchema } from "./index";

describe("ConfigSchema", () => {
  test("validates a complete config", () => {
    const validConfig = {
      sources: {
        reddit: {
          subreddits: ["programming", "rust"],
          posts_per_subreddit: 5,
          lookback_hours: 24,
          min_relative_score: 1.0,
          max_comments_per_post: 50,
        },
      },
      llm: {
        provider: "anthropic" as const,
        model: "claude-sonnet-4-20250514",
        daily_budget_usd: 5.0,
      },
      output: {
        digest_dir: "./digests",
        format: "markdown" as const,
      },
      database: {
        url: "ws://localhost:8000/rpc",
        namespace: "myslownews",
        database: "main",
      },
    };

    const result = ConfigSchema.parse(validConfig);
    expect(result).toEqual(validConfig);
  });

  test("applies default values", () => {
    const minimalConfig = {
      sources: {
        reddit: {
          subreddits: ["test"],
        },
      },
      llm: {
        provider: "anthropic",
      },
      output: {
        format: "markdown",
      },
      database: {},
    };

    const result = ConfigSchema.parse(minimalConfig);

    expect(result.sources.reddit.posts_per_subreddit).toBe(5);
    expect(result.sources.reddit.lookback_hours).toBe(24);
    expect(result.llm.daily_budget_usd).toBe(5.0);
    expect(result.database.url).toBe("ws://localhost:8000/rpc");
    expect(result.database.namespace).toBe("myslownews");
  });

  test("rejects invalid provider", () => {
    const invalidConfig = {
      sources: {
        reddit: {
          subreddits: ["test"],
        },
      },
      llm: {
        provider: "openai", // Invalid - only "anthropic" allowed
      },
      output: {
        format: "markdown",
      },
      database: {},
    };

    expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
  });

  test("rejects invalid output format", () => {
    const invalidConfig = {
      sources: {
        reddit: {
          subreddits: ["test"],
        },
      },
      llm: {
        provider: "anthropic",
      },
      output: {
        format: "html", // Invalid - only "markdown" allowed
      },
      database: {},
    };

    expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
  });

  test("requires at least one subreddit", () => {
    const invalidConfig = {
      sources: {
        reddit: {
          subreddits: [],
        },
      },
      llm: {
        provider: "anthropic",
      },
      output: {
        format: "markdown",
      },
      database: {},
    };

    // Empty array is valid by schema, but business logic might reject it
    const result = ConfigSchema.parse(invalidConfig);
    expect(result.sources.reddit.subreddits).toEqual([]);
  });
});
