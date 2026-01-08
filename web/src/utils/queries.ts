import type { FilterState } from "../types";

interface QueryResult {
  sql: string;
  params: Record<string, unknown>;
}

interface StanceConditionResult {
  condition: string | null;
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
  const stanceResult = buildStanceCondition(filters.stanceFilter);
  if (stanceResult.condition) {
    conditions.push(stanceResult.condition);
    Object.assign(params, stanceResult.params);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      <string>id AS id,
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

  const stanceResult = buildStanceCondition(filters.stanceFilter);
  if (stanceResult.condition) {
    conditions.push(stanceResult.condition);
    Object.assign(params, stanceResult.params);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `SELECT count() AS count FROM claim ${whereClause} GROUP ALL`;

  return { sql, params };
}

function buildStanceCondition(
  stanceFilter: FilterState["stanceFilter"]
): StanceConditionResult {
  switch (stanceFilter) {
    case "unrated":
      return {
        condition:
          "array::len((SELECT id FROM claim_stances WHERE claim = $parent.id AND user_stance != NONE)) = 0",
        params: {},
      };
    case "rated":
      return {
        condition:
          "array::len((SELECT id FROM claim_stances WHERE claim = $parent.id AND user_stance != NONE)) > 0",
        params: {},
      };
    case "agrees":
    case "disagrees":
    case "neutral":
    case "uncertain":
      return {
        condition:
          "(SELECT user_stance FROM claim_stances WHERE claim = $parent.id LIMIT 1)[0].user_stance = $stanceFilter",
        params: { stanceFilter },
      };
    default:
      return { condition: null, params: {} };
  }
}

export function buildClaimDetailQuery(claimId: string): QueryResult {
  const sql = `
    LET $claim = (SELECT * FROM claim WHERE id = $claimId)[0];

    RETURN IF $claim THEN {
      id: <string>$claim.id,
      subject: $claim.subject,
      predicate: $claim.predicate,
      object: $claim.object,
      confidence: $claim.confidence,
      extracted_at: $claim.extracted_at,
      predicate_description: (SELECT description FROM predicate WHERE name = $claim.predicate LIMIT 1)[0].description,
      predicate_is_builtin: (SELECT is_builtin FROM predicate WHERE name = $claim.predicate LIMIT 1)[0].is_builtin ?? false,
      content_author_stance: (SELECT content_author_stance FROM claim_stances WHERE claim = $claim.id LIMIT 1)[0].content_author_stance ?? 'not-stated',
      commenter_agree_pct: (SELECT commenter_agree_pct FROM claim_stances WHERE claim = $claim.id LIMIT 1)[0].commenter_agree_pct ?? 0,
      commenter_disagree_pct: (SELECT commenter_disagree_pct FROM claim_stances WHERE claim = $claim.id LIMIT 1)[0].commenter_disagree_pct ?? 0,
      user_stance: (SELECT user_stance FROM claim_stances WHERE claim = $claim.id LIMIT 1)[0].user_stance,
      user_note: (SELECT user_note FROM claim_stances WHERE claim = $claim.id LIMIT 1)[0].user_note
    } ELSE NULL END;
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
