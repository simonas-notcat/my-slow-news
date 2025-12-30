import { describe, test, expect } from "vitest";
import {
  buildClaimsQuery,
  buildCountQuery,
  buildClaimDetailQuery,
  buildPredicatesQuery,
} from "./queries";

describe("buildClaimsQuery", () => {
  test("builds query with default filters", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "all" as const,
    };
    const result = buildClaimsQuery(filters, 10, 0);

    expect(result.sql).toContain("SELECT");
    expect(result.sql).toContain("FROM claim");
    expect(result.sql).toContain("LIMIT $limit");
    expect(result.sql).toContain("START $offset");
    expect(result.params.limit).toBe(10);
    expect(result.params.offset).toBe(0);
  });

  test("adds predicate filter when specified", () => {
    const filters = {
      predicate: "is-better-than",
      subject: null,
      days: null,
      stanceFilter: "all" as const,
    };
    const result = buildClaimsQuery(filters, 10, 0);

    expect(result.sql).toContain("predicate = $predicate");
    expect(result.params.predicate).toBe("is-better-than");
  });

  test("adds subject filter when specified", () => {
    const filters = {
      predicate: null,
      subject: "Rust",
      days: null,
      stanceFilter: "all" as const,
    };
    const result = buildClaimsQuery(filters, 10, 0);

    expect(result.sql).toContain("subject CONTAINS $subject");
    expect(result.params.subject).toBe("Rust");
  });

  test("adds days filter when specified", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: 30,
      stanceFilter: "all" as const,
    };
    const result = buildClaimsQuery(filters, 10, 0);

    expect(result.sql).toContain("extracted_at >= $cutoff");
    expect(result.params.cutoff).toBeDefined();
  });

  test("adds unrated stance filter", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "unrated" as const,
    };
    const result = buildClaimsQuery(filters, 10, 0);

    expect(result.sql).toContain("user_stance != NONE");
    expect(result.sql).toContain("= 0");
  });

  test("adds rated stance filter", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "rated" as const,
    };
    const result = buildClaimsQuery(filters, 10, 0);

    expect(result.sql).toContain("user_stance != NONE");
    expect(result.sql).toContain("> 0");
  });

  test("adds specific stance filter", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "agrees" as const,
    };
    const result = buildClaimsQuery(filters, 10, 0);

    expect(result.sql).toContain("user_stance = $stanceFilter");
    expect(result.params.stanceFilter).toBe("agrees");
  });

  test("calculates correct offset for pagination", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "all" as const,
    };
    const result = buildClaimsQuery(filters, 10, 20);

    expect(result.params.offset).toBe(20);
  });
});

describe("buildCountQuery", () => {
  test("builds count query", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "all" as const,
    };
    const result = buildCountQuery(filters);

    expect(result.sql).toContain("SELECT count()");
    expect(result.sql).toContain("FROM claim");
    expect(result.sql).toContain("GROUP ALL");
  });

  test("includes same filters as claims query", () => {
    const filters = {
      predicate: "uses",
      subject: "Python",
      days: 7,
      stanceFilter: "rated" as const,
    };
    const result = buildCountQuery(filters);

    expect(result.sql).toContain("predicate = $predicate");
    expect(result.sql).toContain("subject CONTAINS $subject");
    expect(result.sql).toContain("extracted_at >= $cutoff");
  });
});

describe("buildClaimDetailQuery", () => {
  test("builds detail query with claim ID", () => {
    const result = buildClaimDetailQuery("claim:123");

    expect(result.sql).toContain("$claimId");
    expect(result.sql).toContain("predicate");
    expect(result.sql).toContain("claim_stances");
    expect(result.params.claimId).toBe("claim:123");
  });

  test("includes predicate info lookup", () => {
    const result = buildClaimDetailQuery("claim:456");

    expect(result.sql).toContain("FROM predicate");
    expect(result.sql).toContain("description");
    expect(result.sql).toContain("is_builtin");
  });

  test("includes stance info lookup", () => {
    const result = buildClaimDetailQuery("claim:789");

    expect(result.sql).toContain("FROM claim_stances");
    expect(result.sql).toContain("content_author_stance");
    expect(result.sql).toContain("commenter_agree_pct");
  });
});

describe("buildPredicatesQuery", () => {
  test("builds predicates aggregation query", () => {
    const result = buildPredicatesQuery();

    expect(result.sql).toContain("SELECT predicate");
    expect(result.sql).toContain("count()");
    expect(result.sql).toContain("GROUP BY predicate");
    expect(result.sql).toContain("ORDER BY count DESC");
    expect(result.sql).toContain("LIMIT 20");
  });
});
