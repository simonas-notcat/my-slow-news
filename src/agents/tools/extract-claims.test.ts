import { describe, expect, test } from "bun:test";
import { ClaimSchema, extractClaimsTool } from "./extract-claims";

describe("ClaimSchema", () => {
  test("validates valid claim", () => {
    const validClaim = {
      subject: "Rust",
      predicate: "is-safer-than",
      object: "C++",
      confidence: 0.9,
      source_stance: "agrees" as const,
    };

    const result = ClaimSchema.safeParse(validClaim);
    expect(result.success).toBe(true);
  });

  test("rejects confidence outside range", () => {
    const invalidClaim = {
      subject: "Test",
      predicate: "has",
      object: "Issue",
      confidence: 1.5, // > 1
      source_stance: "neutral" as const,
    };

    const result = ClaimSchema.safeParse(invalidClaim);
    expect(result.success).toBe(false);
  });

  test("rejects negative confidence", () => {
    const invalidClaim = {
      subject: "Test",
      predicate: "has",
      object: "Issue",
      confidence: -0.1,
      source_stance: "neutral" as const,
    };

    const result = ClaimSchema.safeParse(invalidClaim);
    expect(result.success).toBe(false);
  });

  test("rejects invalid stance", () => {
    const invalidClaim = {
      subject: "Test",
      predicate: "has",
      object: "Issue",
      confidence: 0.5,
      source_stance: "maybe", // Invalid
    };

    const result = ClaimSchema.safeParse(invalidClaim);
    expect(result.success).toBe(false);
  });

  test("validates all stance types", () => {
    const stances = ["agrees", "disagrees", "neutral", "uncertain"] as const;

    for (const stance of stances) {
      const claim = {
        subject: "Test",
        predicate: "has",
        object: "Feature",
        confidence: 0.5,
        source_stance: stance,
      };

      const result = ClaimSchema.safeParse(claim);
      expect(result.success).toBe(true);
    }
  });
});

describe("extractClaimsTool", () => {
  // Helper to create execution context for testing
  const createTestContext = (claims: unknown[], post_id: string) => ({
    context: { claims, post_id },
    runtimeContext: {},
  } as any);

  test("has correct metadata", () => {
    expect(extractClaimsTool.id).toBe("format-claims");
    expect(extractClaimsTool.description).toBe(
      "Format and validate extracted claims for storage"
    );
  });

  test("filters out low-confidence claims", async () => {
    const claims = [
      {
        subject: "TypeScript",
        predicate: "is-better-than",
        object: "JavaScript",
        confidence: 0.8,
        source_stance: "agrees" as const,
      },
      {
        subject: "Python",
        predicate: "is-slower-than",
        object: "Rust",
        confidence: 0.3, // Below 0.5 threshold
        source_stance: "neutral" as const,
      },
      {
        subject: "Go",
        predicate: "has",
        object: "generics",
        confidence: 0.5, // Exactly at threshold
        source_stance: "agrees" as const,
      },
    ];

    const result = await extractClaimsTool.execute(
      createTestContext(claims, "test123")
    );

    expect(result.valid_claims).toHaveLength(2);
    expect(result.invalid_count).toBe(1);
    expect(result.post_id).toBe("test123");

    // Check filtered claims
    expect(result.valid_claims[0].subject).toBe("TypeScript");
    expect(result.valid_claims[1].subject).toBe("Go");
  });

  test("keeps all claims above threshold", async () => {
    const claims = [
      {
        subject: "Claim1",
        predicate: "has",
        object: "value",
        confidence: 0.6,
        source_stance: "neutral" as const,
      },
      {
        subject: "Claim2",
        predicate: "has",
        object: "value",
        confidence: 0.9,
        source_stance: "agrees" as const,
      },
      {
        subject: "Claim3",
        predicate: "has",
        object: "value",
        confidence: 1.0,
        source_stance: "agrees" as const,
      },
    ];

    const result = await extractClaimsTool.execute(
      createTestContext(claims, "post456")
    );

    expect(result.valid_claims).toHaveLength(3);
    expect(result.invalid_count).toBe(0);
  });

  test("handles empty claims array", async () => {
    const result = await extractClaimsTool.execute(
      createTestContext([], "empty")
    );

    expect(result.valid_claims).toHaveLength(0);
    expect(result.invalid_count).toBe(0);
  });

  test("preserves claim data in output", async () => {
    const claims = [
      {
        subject: "React",
        predicate: "uses",
        object: "virtual DOM",
        confidence: 0.95,
        source_stance: "agrees" as const,
      },
    ];

    const result = await extractClaimsTool.execute(
      createTestContext(claims, "react-post")
    );

    expect(result.valid_claims[0]).toEqual(claims[0]);
  });

  test("filters all claims if all below threshold", async () => {
    const claims = [
      {
        subject: "Low1",
        predicate: "has",
        object: "value",
        confidence: 0.1,
        source_stance: "uncertain" as const,
      },
      {
        subject: "Low2",
        predicate: "has",
        object: "value",
        confidence: 0.4,
        source_stance: "uncertain" as const,
      },
      {
        subject: "Low3",
        predicate: "has",
        object: "value",
        confidence: 0.49,
        source_stance: "uncertain" as const,
      },
    ];

    const result = await extractClaimsTool.execute(
      createTestContext(claims, "low-confidence")
    );

    expect(result.valid_claims).toHaveLength(0);
    expect(result.invalid_count).toBe(3);
  });
});
