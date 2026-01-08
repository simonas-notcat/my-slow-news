import { describe, test, expect } from "vitest";
import {
  ClaimListItemSchema,
  ClaimDetailSchema,
  CountResultSchema,
  PredicateOptionSchema,
  UserStanceSchema,
  StanceValueSchema,
} from "./schemas";

describe("UserStanceSchema", () => {
  test("accepts valid user stances", () => {
    expect(UserStanceSchema.parse("agrees")).toBe("agrees");
    expect(UserStanceSchema.parse("disagrees")).toBe("disagrees");
    expect(UserStanceSchema.parse("neutral")).toBe("neutral");
    expect(UserStanceSchema.parse("uncertain")).toBe("uncertain");
  });

  test("rejects invalid stances", () => {
    expect(() => UserStanceSchema.parse("invalid")).toThrow();
    expect(() => UserStanceSchema.parse("not-stated")).toThrow();
  });
});

describe("StanceValueSchema", () => {
  test("accepts user stances and not-stated", () => {
    expect(StanceValueSchema.parse("agrees")).toBe("agrees");
    expect(StanceValueSchema.parse("not-stated")).toBe("not-stated");
  });
});

describe("ClaimListItemSchema", () => {
  test("parses valid claim list item", () => {
    const item = {
      id: "claim:123",
      subject: "Rust",
      predicate: "is-faster-than",
      object: "Python",
      confidence: 0.85,
      extracted_at: "2025-01-15T10:00:00Z",
    };

    const result = ClaimListItemSchema.parse(item);
    expect(result.id).toBe("claim:123");
    expect(result.subject).toBe("Rust");
    expect(result.confidence).toBe(0.85);
  });

  test("parses claim with user_stance", () => {
    const item = {
      id: "claim:123",
      subject: "Rust",
      predicate: "is-faster-than",
      object: "Python",
      confidence: 0.85,
      extracted_at: "2025-01-15T10:00:00Z",
      user_stance: "agrees",
    };

    const result = ClaimListItemSchema.parse(item);
    expect(result.user_stance).toBe("agrees");
  });

  test("accepts Date object for extracted_at", () => {
    const item = {
      id: "claim:123",
      subject: "Rust",
      predicate: "is-faster-than",
      object: "Python",
      confidence: 0.85,
      extracted_at: new Date(),
    };

    expect(() => ClaimListItemSchema.parse(item)).not.toThrow();
  });

  test("rejects invalid claim item", () => {
    const item = {
      id: "claim:123",
      // missing required fields
    };

    expect(() => ClaimListItemSchema.parse(item)).toThrow();
  });

  test("transforms record ID object to string", () => {
    const item = {
      id: { tb: "claim", id: "123" }, // SurrealDB record ID object
      subject: "Rust",
      predicate: "is-faster-than",
      object: "Python",
      confidence: 0.85,
      extracted_at: "2025-01-15T10:00:00Z",
    };

    const result = ClaimListItemSchema.parse(item);
    expect(typeof result.id).toBe("string");
    expect(result.id).toBe('claim:"123"');
  });

  test("handles string IDs without transformation", () => {
    const item = {
      id: "claim:abc123",
      subject: "Rust",
      predicate: "is-faster-than",
      object: "Python",
      confidence: 0.85,
      extracted_at: "2025-01-15T10:00:00Z",
    };

    const result = ClaimListItemSchema.parse(item);
    expect(result.id).toBe("claim:abc123");
  });
});

describe("ClaimDetailSchema", () => {
  test("parses valid claim detail", () => {
    const detail = {
      id: "claim:123",
      subject: "TypeScript",
      predicate: "is-better-than",
      object: "JavaScript",
      confidence: 0.9,
      extracted_at: "2025-01-15T10:00:00Z",
      predicate_is_builtin: true,
      commenter_agree_pct: 75,
      commenter_disagree_pct: 15,
    };

    const result = ClaimDetailSchema.parse(detail);
    expect(result.id).toBe("claim:123");
    expect(result.predicate_is_builtin).toBe(true);
    expect(result.commenter_agree_pct).toBe(75);
  });

  test("provides defaults for optional fields", () => {
    const detail = {
      id: "claim:123",
      subject: "TypeScript",
      predicate: "is-better-than",
      object: "JavaScript",
      confidence: 0.9,
      extracted_at: "2025-01-15T10:00:00Z",
    };

    const result = ClaimDetailSchema.parse(detail);
    expect(result.predicate_is_builtin).toBe(false);
    expect(result.commenter_agree_pct).toBe(0);
    expect(result.commenter_disagree_pct).toBe(0);
  });

  test("parses claim with all optional fields", () => {
    const detail = {
      id: "claim:123",
      subject: "Svelte",
      predicate: "uses",
      object: "virtual DOM",
      confidence: 0.6,
      extracted_at: "2025-01-15T10:00:00Z",
      predicate_description: "Indicates usage of a technology",
      predicate_is_builtin: false,
      content_author_stance: "disagrees",
      commenter_agree_pct: 20,
      commenter_disagree_pct: 60,
      user_stance: "agrees",
      user_note: "Actually, Svelte doesn't use virtual DOM",
      source_post_title: "Svelte vs React",
      source_subreddit: "programming",
    };

    const result = ClaimDetailSchema.parse(detail);
    expect(result.predicate_description).toBe("Indicates usage of a technology");
    expect(result.content_author_stance).toBe("disagrees");
    expect(result.user_stance).toBe("agrees");
    expect(result.user_note).toBe("Actually, Svelte doesn't use virtual DOM");
  });

  test("transforms record ID object to string in detail", () => {
    const detail = {
      id: { tb: "claim", id: "456" }, // SurrealDB record ID object
      subject: "TypeScript",
      predicate: "is-better-than",
      object: "JavaScript",
      confidence: 0.9,
      extracted_at: "2025-01-15T10:00:00Z",
    };

    const result = ClaimDetailSchema.parse(detail);
    expect(typeof result.id).toBe("string");
    expect(result.id).toBe('claim:"456"');
  });

  test("handles complex SurrealDB record IDs", () => {
    const detail = {
      id: { tb: "claim", id: { String: "uuid-here" } },
      subject: "TypeScript",
      predicate: "is-better-than",
      object: "JavaScript",
      confidence: 0.9,
      extracted_at: "2025-01-15T10:00:00Z",
    };

    const result = ClaimDetailSchema.parse(detail);
    expect(typeof result.id).toBe("string");
    expect(result.id).toBe('claim:{"String":"uuid-here"}');
  });
});

describe("CountResultSchema", () => {
  test("parses count result", () => {
    const result = CountResultSchema.parse({ count: 42 });
    expect(result.count).toBe(42);
  });

  test("requires count to be a number", () => {
    expect(() => CountResultSchema.parse({ count: "42" })).toThrow();
  });
});

describe("PredicateOptionSchema", () => {
  test("parses predicate option", () => {
    const option = {
      predicate: "is-faster-than",
      count: 15,
    };

    const result = PredicateOptionSchema.parse(option);
    expect(result.predicate).toBe("is-faster-than");
    expect(result.count).toBe(15);
  });
});
