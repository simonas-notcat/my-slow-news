import { describe, test, expect, beforeEach } from "vitest";
import {
  buildClaimsQuery,
  buildCountQuery,
  buildClaimDetailQuery,
  buildPredicatesQuery,
} from "./queries.js";
import type { FilterState } from "../types.js";

describe("queries", () => {
  describe("buildClaimsQuery", () => {
    const defaultFilters: FilterState = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "all",
    };

    test("builds basic query without filters", () => {
      const result = buildClaimsQuery(defaultFilters, 10, 0);

      expect(result.sql).toContain("SELECT");
      expect(result.sql).toContain("FROM claim");
      expect(result.sql).toContain("LIMIT $limit");
      expect(result.sql).toContain("START $offset");
      expect(result.params.limit).toBe(10);
      expect(result.params.offset).toBe(0);
    });

    test("adds days filter with cutoff param", () => {
      const filters: FilterState = { ...defaultFilters, days: 30 };
      const result = buildClaimsQuery(filters, 10, 0);

      expect(result.sql).toContain("extracted_at >= $cutoff");
      expect(result.params.cutoff).toBeDefined();
      expect(typeof result.params.cutoff).toBe("string");
    });

    test("adds predicate filter with param", () => {
      const filters: FilterState = { ...defaultFilters, predicate: "is-better-than" };
      const result = buildClaimsQuery(filters, 10, 0);

      expect(result.sql).toContain("predicate = $predicate");
      expect(result.params.predicate).toBe("is-better-than");
    });

    test("adds subject filter with param", () => {
      const filters: FilterState = { ...defaultFilters, subject: "Rust" };
      const result = buildClaimsQuery(filters, 10, 0);

      expect(result.sql).toContain("subject CONTAINS $subject");
      expect(result.params.subject).toBe("Rust");
    });

    test("adds stance filter with parameterized query (not string interpolation)", () => {
      const filters: FilterState = { ...defaultFilters, stanceFilter: "agrees" };
      const result = buildClaimsQuery(filters, 10, 0);

      // Verify parameterized query is used, not string interpolation
      expect(result.sql).toContain("$stanceFilter");
      expect(result.sql).not.toContain("'agrees'");
      expect(result.params.stanceFilter).toBe("agrees");
    });

    test("handles unrated stance filter", () => {
      const filters: FilterState = { ...defaultFilters, stanceFilter: "unrated" };
      const result = buildClaimsQuery(filters, 10, 0);

      expect(result.sql).toContain("array::len");
      expect(result.sql).toContain("user_stance != NONE");
    });

    test("handles rated stance filter", () => {
      const filters: FilterState = { ...defaultFilters, stanceFilter: "rated" };
      const result = buildClaimsQuery(filters, 10, 0);

      expect(result.sql).toContain("array::len");
      expect(result.sql).toContain("> 0");
    });

    test("combines multiple filters with AND", () => {
      const filters: FilterState = {
        predicate: "released",
        subject: "Python",
        days: 7,
        stanceFilter: "disagrees",
      };
      const result = buildClaimsQuery(filters, 10, 0);

      expect(result.sql).toContain("predicate = $predicate");
      expect(result.sql).toContain("subject CONTAINS $subject");
      expect(result.sql).toContain("extracted_at >= $cutoff");
      expect(result.sql).toContain("$stanceFilter");
      expect(result.params.predicate).toBe("released");
      expect(result.params.subject).toBe("Python");
      expect(result.params.stanceFilter).toBe("disagrees");
    });

    test("applies pagination correctly", () => {
      const result = buildClaimsQuery(defaultFilters, 20, 40);

      expect(result.params.limit).toBe(20);
      expect(result.params.offset).toBe(40);
    });
  });

  describe("buildCountQuery", () => {
    const defaultFilters: FilterState = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "all",
    };

    test("builds count query without filters", () => {
      const result = buildCountQuery(defaultFilters);

      expect(result.sql).toContain("SELECT count()");
      expect(result.sql).toContain("FROM claim");
      expect(result.sql).toContain("GROUP ALL");
    });

    test("applies same filters as claims query", () => {
      const filters: FilterState = {
        predicate: "announced",
        subject: "Go",
        days: 90,
        stanceFilter: "neutral",
      };
      const result = buildCountQuery(filters);

      expect(result.sql).toContain("predicate = $predicate");
      expect(result.sql).toContain("subject CONTAINS $subject");
      expect(result.sql).toContain("extracted_at >= $cutoff");
      expect(result.sql).toContain("$stanceFilter");
      expect(result.params.stanceFilter).toBe("neutral");
    });
  });

  describe("buildClaimDetailQuery", () => {
    test("uses parameterized claimId", () => {
      const result = buildClaimDetailQuery("claim:123abc");

      expect(result.sql).toContain("$claimId");
      expect(result.sql).not.toContain("claim:123abc");
      expect(result.params.claimId).toBe("claim:123abc");
    });

    test("returns complete claim structure", () => {
      const result = buildClaimDetailQuery("claim:test");

      expect(result.sql).toContain("subject");
      expect(result.sql).toContain("predicate");
      expect(result.sql).toContain("object");
      expect(result.sql).toContain("confidence");
      expect(result.sql).toContain("user_stance");
      expect(result.sql).toContain("user_note");
    });

    test("uses record ID for claim_stances lookup", () => {
      const result = buildClaimDetailQuery("claim:test");

      // Should use $claim.id (record ID) not $claimId (string) for claim_stances lookup
      expect(result.sql).toContain("WHERE claim = $claim.id");
    });
  });

  describe("buildPredicatesQuery", () => {
    test("returns query for predicate aggregation", () => {
      const result = buildPredicatesQuery();

      expect(result.sql).toContain("SELECT predicate");
      expect(result.sql).toContain("count()");
      expect(result.sql).toContain("GROUP BY predicate");
      expect(result.sql).toContain("ORDER BY count DESC");
    });
  });

  describe("SQL injection prevention", () => {
    test("stance filter values are parameterized, not interpolated", () => {
      const maliciousFilters: FilterState = {
        predicate: null,
        subject: null,
        days: null,
        stanceFilter: "agrees", // Even valid values should be parameterized
      };
      const result = buildClaimsQuery(maliciousFilters, 10, 0);

      // The SQL should use $stanceFilter, not the literal value
      expect(result.sql).not.toMatch(/'agrees'/);
      expect(result.sql).toContain("$stanceFilter");
      expect(result.params.stanceFilter).toBe("agrees");
    });

    test("all stance filter types use params correctly", () => {
      const stanceValues: FilterState["stanceFilter"][] = [
        "agrees",
        "disagrees",
        "neutral",
        "uncertain",
      ];

      for (const stance of stanceValues) {
        const filters: FilterState = {
          predicate: null,
          subject: null,
          days: null,
          stanceFilter: stance,
        };
        const result = buildClaimsQuery(filters, 10, 0);

        expect(result.params.stanceFilter).toBe(stance);
        expect(result.sql).not.toContain(`'${stance}'`);
      }
    });
  });
});
