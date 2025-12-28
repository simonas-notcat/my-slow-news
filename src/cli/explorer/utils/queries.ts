import type { FilterState } from "../types.js";

interface QueryResult {
  sql: string;
  params: Record<string, unknown>;
}

export function buildClaimsQuery(
  filters: FilterState,
  limit: number,
  offset: number
): QueryResult {
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit, offset };

  // Time filter
  if (filters.days) {
    conditions.push("extracted_at >= $cutoff");
    params.cutoff = new Date(
      Date.now() - filters.days * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  // Predicate filter
  if (filters.predicate) {
    conditions.push("predicate = $predicate");
    params.predicate = filters.predicate;
  }

  // Subject filter (partial match)
  if (filters.subject) {
    conditions.push("subject CONTAINS $subject");
    params.subject = filters.subject;
  }

  // Stance filter - handled separately in subquery
  const stanceCondition = buildStanceCondition(filters.stanceFilter);
  if (stanceCondition) {
    conditions.push(stanceCondition);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      id,
      subject,
      predicate,
      object,
      confidence,
      extracted_at,
      (SELECT user_stance FROM claim_stances WHERE claim = $parent.id LIMIT 1)[0].user_stance AS user_stance
    FROM claim
    ${whereClause}
    ORDER BY extracted_at DESC
    LIMIT $limit
    START $offset
  `;

  return { sql, params };
}

export function buildCountQuery(filters: FilterState): QueryResult {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.days) {
    conditions.push("extracted_at >= $cutoff");
    params.cutoff = new Date(
      Date.now() - filters.days * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  if (filters.predicate) {
    conditions.push("predicate = $predicate");
    params.predicate = filters.predicate;
  }

  if (filters.subject) {
    conditions.push("subject CONTAINS $subject");
    params.subject = filters.subject;
  }

  const stanceCondition = buildStanceCondition(filters.stanceFilter);
  if (stanceCondition) {
    conditions.push(stanceCondition);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `SELECT count() AS count FROM claim ${whereClause} GROUP ALL`;

  return { sql, params };
}

function buildStanceCondition(
  stanceFilter: FilterState["stanceFilter"]
): string | null {
  switch (stanceFilter) {
    case "unrated":
      return "array::len((SELECT id FROM claim_stances WHERE claim = $parent.id AND user_stance != NONE)) = 0";
    case "rated":
      return "array::len((SELECT id FROM claim_stances WHERE claim = $parent.id AND user_stance != NONE)) > 0";
    case "agrees":
    case "disagrees":
    case "neutral":
    case "uncertain":
      return `(SELECT user_stance FROM claim_stances WHERE claim = $parent.id LIMIT 1)[0].user_stance = '${stanceFilter}'`;
    default:
      return null;
  }
}

export function buildClaimDetailQuery(claimId: string): QueryResult {
  const sql = `
    LET $claim = (SELECT * FROM claim WHERE id = $claimId)[0];
    LET $pred = (SELECT description, is_builtin FROM predicate WHERE name = $claim.predicate LIMIT 1)[0];
    LET $stances = (SELECT * FROM claim_stances WHERE claim = $claimId LIMIT 1)[0];

    RETURN {
      id: $claim.id,
      subject: $claim.subject,
      predicate: $claim.predicate,
      object: $claim.object,
      confidence: $claim.confidence,
      extracted_at: $claim.extracted_at,
      predicate_description: $pred.description,
      predicate_is_builtin: $pred.is_builtin ?? false,
      content_author_stance: $stances.content_author_stance ?? 'not-stated',
      commenter_agree_pct: $stances.commenter_agree_pct ?? 0,
      commenter_disagree_pct: $stances.commenter_disagree_pct ?? 0,
      user_stance: $stances.user_stance,
      user_note: $stances.user_note
    };
  `;

  return { sql, params: { claimId } };
}

export function buildPredicatesQuery(): QueryResult {
  const sql = `
    SELECT predicate, count() AS count
    FROM claim
    GROUP BY predicate
    ORDER BY count DESC
    LIMIT 20
  `;
  return { sql, params: {} };
}
