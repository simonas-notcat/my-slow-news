import { describe, test, expect } from "vitest";
import {
  arePredicatesOpposite,
  areObjectsNegated,
  isComparativePredicate,
  getOppositePredicates,
  PREDICATE_OPPOSITES,
  COMPARATIVE_PREDICATES,
} from "./predicate-opposites";

describe("arePredicatesOpposite", () => {
  test("identifies supports/opposes as opposites", () => {
    expect(arePredicatesOpposite("supports", "opposes")).toBe(true);
    expect(arePredicatesOpposite("opposes", "supports")).toBe(true);
  });

  test("identifies endorses/opposes as opposites", () => {
    expect(arePredicatesOpposite("endorses", "opposes")).toBe(true);
    expect(arePredicatesOpposite("opposes", "endorses")).toBe(true);
  });

  test("identifies comparative opposites", () => {
    expect(arePredicatesOpposite("is-better-than", "is-worse-than")).toBe(true);
    expect(arePredicatesOpposite("is-worse-than", "is-better-than")).toBe(true);
    expect(arePredicatesOpposite("is-faster-than", "is-slower-than")).toBe(true);
    expect(arePredicatesOpposite("is-slower-than", "is-faster-than")).toBe(true);
  });

  test("identifies has/lacks as opposites", () => {
    expect(arePredicatesOpposite("has", "lacks")).toBe(true);
    expect(arePredicatesOpposite("lacks", "has")).toBe(true);
    expect(arePredicatesOpposite("has", "missing")).toBe(true);
  });

  test("identifies adoption opposites", () => {
    expect(arePredicatesOpposite("uses", "abandoned")).toBe(true);
    expect(arePredicatesOpposite("adopted", "rejected")).toBe(true);
    expect(arePredicatesOpposite("migrated-to", "migrated-from")).toBe(true);
  });

  test("returns false for non-opposite predicates", () => {
    expect(arePredicatesOpposite("supports", "uses")).toBe(false);
    expect(arePredicatesOpposite("released", "has")).toBe(false);
    expect(arePredicatesOpposite("announced", "deprecated")).toBe(false);
  });

  test("returns false for same predicates", () => {
    expect(arePredicatesOpposite("supports", "supports")).toBe(false);
    expect(arePredicatesOpposite("has", "has")).toBe(false);
  });

  test("returns false for unknown predicates", () => {
    expect(arePredicatesOpposite("unknown-pred-1", "unknown-pred-2")).toBe(false);
    expect(arePredicatesOpposite("", "")).toBe(false);
  });
});

describe("areObjectsNegated", () => {
  test("detects has/lacks negation patterns", () => {
    expect(areObjectsNegated("has-memory-safety", "lacks-memory-safety")).toBe(
      true
    );
    expect(areObjectsNegated("has type system", "lacks type system")).toBe(true);
  });

  test("detects missing negation patterns", () => {
    expect(areObjectsNegated("has-feature", "missing-feature")).toBe(true);
  });

  test("returns false for unrelated objects", () => {
    expect(areObjectsNegated("fast-compilation", "type-safety")).toBe(false);
    expect(areObjectsNegated("memory", "performance")).toBe(false);
  });

  test("returns false for similar but non-negated objects", () => {
    expect(areObjectsNegated("has-feature-x", "has-feature-y")).toBe(false);
    expect(areObjectsNegated("performance", "fast-performance")).toBe(false);
  });

  test("handles case insensitivity", () => {
    expect(areObjectsNegated("HAS-Feature", "LACKS-Feature")).toBe(true);
  });

  test("handles special characters", () => {
    expect(areObjectsNegated("has-feature!", "lacks-feature!")).toBe(true);
  });
});

describe("isComparativePredicate", () => {
  test("identifies comparative predicates", () => {
    expect(isComparativePredicate("is-better-than")).toBe(true);
    expect(isComparativePredicate("is-worse-than")).toBe(true);
    expect(isComparativePredicate("is-faster-than")).toBe(true);
    expect(isComparativePredicate("is-slower-than")).toBe(true);
    expect(isComparativePredicate("is-safer-than")).toBe(true);
    expect(isComparativePredicate("outperforms")).toBe(true);
  });

  test("returns false for non-comparative predicates", () => {
    expect(isComparativePredicate("supports")).toBe(false);
    expect(isComparativePredicate("has")).toBe(false);
    expect(isComparativePredicate("released")).toBe(false);
    expect(isComparativePredicate("announced")).toBe(false);
  });
});

describe("getOppositePredicates", () => {
  test("returns opposites for known predicates", () => {
    const supportsOpposites = getOppositePredicates("supports");
    expect(supportsOpposites).toContain("opposes");
    expect(supportsOpposites).toContain("rejects");
    expect(supportsOpposites).toContain("criticizes");
  });

  test("returns empty array for unknown predicates", () => {
    expect(getOppositePredicates("unknown-predicate")).toEqual([]);
    expect(getOppositePredicates("")).toEqual([]);
  });
});

describe("PREDICATE_OPPOSITES constant", () => {
  test("contains expected predicate mappings", () => {
    expect(PREDICATE_OPPOSITES).toHaveProperty("supports");
    expect(PREDICATE_OPPOSITES).toHaveProperty("opposes");
    expect(PREDICATE_OPPOSITES).toHaveProperty("has");
    expect(PREDICATE_OPPOSITES).toHaveProperty("lacks");
  });
});

describe("COMPARATIVE_PREDICATES constant", () => {
  test("contains expected comparative predicates", () => {
    expect(COMPARATIVE_PREDICATES).toContain("is-better-than");
    expect(COMPARATIVE_PREDICATES).toContain("is-faster-than");
    expect(COMPARATIVE_PREDICATES).toContain("outperforms");
  });

  test("does not contain non-comparative predicates", () => {
    expect(COMPARATIVE_PREDICATES).not.toContain("supports");
    expect(COMPARATIVE_PREDICATES).not.toContain("has");
  });
});
