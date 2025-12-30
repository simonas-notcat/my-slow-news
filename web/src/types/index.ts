// Explorer-specific types (ported from CLI explorer)

export interface ClaimListItem {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  extracted_at: Date | string;
  user_stance?: UserStance;
}

export interface ClaimDetail {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  extracted_at: Date | string;

  // Predicate info (from predicate table)
  predicate_description?: string;
  predicate_is_builtin: boolean;

  // Stance info (from claim_stances table)
  content_author_stance?: StanceValue;
  commenter_agree_pct: number;
  commenter_disagree_pct: number;
  user_stance?: UserStance;
  user_note?: string;

  // Source info (via makes_claim graph edge)
  source_post_title?: string;
  source_subreddit?: string;
}

// User can only set these values (not 'not-stated')
export type UserStance = "agrees" | "disagrees" | "neutral" | "uncertain";

// System tracks 'not-stated' for content authors who didn't express a stance
export type StanceValue = UserStance | "not-stated";

export interface FilterState {
  predicate: string | null;
  subject: string | null;
  days: number | null;
  stanceFilter:
    | "all"
    | "unrated"
    | "rated"
    | "agrees"
    | "disagrees"
    | "neutral"
    | "uncertain";
}

export interface PredicateOption {
  predicate: string;
  count: number;
}

export type Screen = "list" | "detail";

export interface DatabaseConfig {
  url: string;
  namespace: string;
  database: string;
  username?: string;
  password?: string;
}
