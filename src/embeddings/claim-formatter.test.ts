import { describe, test, expect } from "vitest";
import {
  formatClaimForEmbedding,
  formatClaimsForEmbedding,
} from "./claim-formatter";

describe("formatClaimForEmbedding", () => {
  test("converts kebab-case predicates to spaces", () => {
    const result = formatClaimForEmbedding({
      subject: "Rust",
      predicate: "is-safer-than",
      object: "C++",
    });
    expect(result).toBe("Rust is safer than C++");
  });

  test("handles simple single-word predicates", () => {
    const result = formatClaimForEmbedding({
      subject: "TypeScript",
      predicate: "supports",
      object: "generics",
    });
    expect(result).toBe("TypeScript supports generics");
  });

  test("handles multi-word predicates with multiple hyphens", () => {
    const result = formatClaimForEmbedding({
      subject: "Go",
      predicate: "has-faster-compile-times-than",
      object: "Rust",
    });
    expect(result).toBe("Go has faster compile times than Rust");
  });

  test("preserves subject and object casing", () => {
    const result = formatClaimForEmbedding({
      subject: "OpenAI GPT-4",
      predicate: "is-better-than",
      object: "Claude 3",
    });
    expect(result).toBe("OpenAI GPT-4 is better than Claude 3");
  });

  test("handles predicates without hyphens", () => {
    const result = formatClaimForEmbedding({
      subject: "Python",
      predicate: "acquired",
      object: "significant market share",
    });
    expect(result).toBe("Python acquired significant market share");
  });

  test("handles empty predicate", () => {
    const result = formatClaimForEmbedding({
      subject: "A",
      predicate: "",
      object: "B",
    });
    expect(result).toBe("A  B");
  });
});

describe("formatClaimsForEmbedding", () => {
  test("formats multiple claims", () => {
    const claims = [
      { subject: "Rust", predicate: "is-safer-than", object: "C++" },
      { subject: "TypeScript", predicate: "supports", object: "generics" },
      { subject: "Go", predicate: "has", object: "fast compilation" },
    ];

    const results = formatClaimsForEmbedding(claims);

    expect(results).toEqual([
      "Rust is safer than C++",
      "TypeScript supports generics",
      "Go has fast compilation",
    ]);
  });

  test("returns empty array for empty input", () => {
    const results = formatClaimsForEmbedding([]);
    expect(results).toEqual([]);
  });

  test("handles single claim", () => {
    const claims = [{ subject: "A", predicate: "relates-to", object: "B" }];
    const results = formatClaimsForEmbedding(claims);
    expect(results).toEqual(["A relates to B"]);
  });
});
