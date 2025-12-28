export const SCHEMA = `
-- Raw content storage
DEFINE TABLE post SCHEMAFULL;
DEFINE FIELD reddit_id ON post TYPE string;
DEFINE FIELD subreddit ON post TYPE string;
DEFINE FIELD title ON post TYPE string;
DEFINE FIELD content ON post TYPE string;
DEFINE FIELD author ON post TYPE string;
DEFINE FIELD url ON post TYPE string;
DEFINE FIELD score ON post TYPE int;
DEFINE FIELD created_at ON post TYPE datetime;
DEFINE FIELD fetched_at ON post TYPE datetime;
DEFINE INDEX idx_post_reddit_id ON post FIELDS reddit_id UNIQUE;
DEFINE INDEX idx_post_subreddit ON post FIELDS subreddit;
DEFINE INDEX idx_post_created_at ON post FIELDS created_at;

DEFINE TABLE comment SCHEMAFULL;
DEFINE FIELD reddit_id ON comment TYPE string;
DEFINE FIELD post ON comment TYPE record<post>;
DEFINE FIELD author ON comment TYPE string;
DEFINE FIELD content ON comment TYPE string;
DEFINE FIELD score ON comment TYPE int;
DEFINE FIELD parent_id ON comment TYPE string;
DEFINE FIELD created_at ON comment TYPE datetime;
DEFINE INDEX idx_comment_reddit_id ON comment FIELDS reddit_id UNIQUE;
DEFINE INDEX idx_comment_post ON comment FIELDS post;

-- Knowledge graph
DEFINE TABLE claim SCHEMAFULL;
DEFINE FIELD subject ON claim TYPE string;
DEFINE FIELD predicate ON claim TYPE string;
DEFINE FIELD object ON claim TYPE string;
DEFINE FIELD confidence ON claim TYPE float;
DEFINE FIELD extracted_at ON claim TYPE datetime;
DEFINE INDEX idx_claim_subject ON claim FIELDS subject;
DEFINE INDEX idx_claim_predicate ON claim FIELDS predicate;
DEFINE INDEX idx_claim_triple ON claim FIELDS subject, predicate, object UNIQUE;

-- Graph edges: which content made which claims
DEFINE TABLE makes_claim TYPE RELATION FROM post|comment TO claim SCHEMAFULL;
DEFINE FIELD stance ON makes_claim TYPE string;
DEFINE FIELD extracted_at ON makes_claim TYPE datetime;

-- Stance aggregations per claim
DEFINE TABLE claim_stances SCHEMAFULL;
DEFINE FIELD claim ON claim_stances TYPE record<claim>;
DEFINE FIELD content_author_stance ON claim_stances TYPE string;
DEFINE FIELD commenter_agree_pct ON claim_stances TYPE float;
DEFINE FIELD commenter_disagree_pct ON claim_stances TYPE float;
DEFINE FIELD commenter_camps ON claim_stances TYPE option<object>;
DEFINE FIELD user_stance ON claim_stances TYPE option<string>;
DEFINE FIELD user_note ON claim_stances TYPE option<string>;
DEFINE INDEX idx_claim_stances_claim ON claim_stances FIELDS claim UNIQUE;

-- Digest tracking
DEFINE TABLE digest SCHEMAFULL;
DEFINE FIELD date ON digest TYPE datetime;
DEFINE FIELD file_path ON digest TYPE string;
DEFINE FIELD posts_included ON digest TYPE array<record<post>>;
DEFINE FIELD claims_extracted ON digest TYPE array<record<claim>>;
DEFINE INDEX idx_digest_date ON digest FIELDS date UNIQUE;

-- Predicate registry for hybrid ontology
DEFINE TABLE predicate SCHEMAFULL;
DEFINE FIELD name ON predicate TYPE string;
DEFINE FIELD description ON predicate TYPE option<string>;
DEFINE FIELD is_builtin ON predicate TYPE bool DEFAULT false;
DEFINE FIELD first_seen ON predicate TYPE datetime;
DEFINE FIELD usage_count ON predicate TYPE int DEFAULT 0;
DEFINE INDEX idx_predicate_name ON predicate FIELDS name UNIQUE;
`;

export const SEED_PREDICATES = `
-- Seed built-in predicates
INSERT INTO predicate (name, description, is_builtin, first_seen, usage_count) VALUES
  ('announced', 'Entity made an announcement about something', true, time::now(), 0),
  ('released', 'Entity released a product, version, or artifact', true, time::now(), 0),
  ('is-better-than', 'Comparative claim of superiority', true, time::now(), 0),
  ('is-faster-than', 'Performance comparison', true, time::now(), 0),
  ('is-safer-than', 'Safety/security comparison', true, time::now(), 0),
  ('acquired', 'Entity acquired another entity', true, time::now(), 0),
  ('deprecated', 'Entity deprecated a feature or product', true, time::now(), 0),
  ('supports', 'Entity expresses support for something', true, time::now(), 0),
  ('opposes', 'Entity expresses opposition to something', true, time::now(), 0),
  ('claims', 'Entity makes a general claim', true, time::now(), 0),
  ('uses', 'Entity uses a technology or approach', true, time::now(), 0),
  ('migrated-to', 'Entity migrated from one thing to another', true, time::now(), 0),
  ('has', 'Entity has a feature or property', true, time::now(), 0),
  ('lacks', 'Entity lacks a feature or property', true, time::now(), 0)
ON DUPLICATE KEY UPDATE usage_count = usage_count;
`;

/**
 * Vector schema additions for semantic features.
 * Adds embedding fields to claims and relations for similarity tracking.
 */
export const VECTOR_SCHEMA = `
-- Add embedding fields to claim table
DEFINE FIELD embedding ON claim TYPE option<array<float>>;
DEFINE FIELD embedding_model ON claim TYPE option<string>;
DEFINE FIELD embedded_at ON claim TYPE option<datetime>;

-- Canonical claim tracking (for deduplication)
-- If set, this claim is a duplicate of the canonical claim
DEFINE FIELD canonical_claim ON claim TYPE option<record<claim>>;
-- False if this claim has been marked as duplicate of another
DEFINE FIELD is_canonical ON claim TYPE bool DEFAULT true;

-- Claim similarity relations
DEFINE TABLE claim_similarity TYPE RELATION
  FROM claim TO claim SCHEMAFULL;
DEFINE FIELD similarity ON claim_similarity TYPE float;
-- Values: 'duplicate', 'related', 'contradicts'
DEFINE FIELD relationship ON claim_similarity TYPE string;
DEFINE FIELD detected_at ON claim_similarity TYPE datetime;
DEFINE INDEX idx_claim_similarity_rel ON claim_similarity FIELDS relationship;

-- Index on is_canonical for efficient filtering of canonical claims
DEFINE INDEX idx_claim_is_canonical ON claim FIELDS is_canonical;
`;

/**
 * Vector index for similarity search.
 * Note: SurrealDB vector index syntax may vary by version.
 * This uses SurrealDB 2.x syntax with MTREE.
 */
export const VECTOR_INDEX_SCHEMA = `
-- Vector index for similarity search (SurrealDB 2.x syntax)
DEFINE INDEX idx_claim_embedding ON claim FIELDS embedding
  MTREE DIMENSION 1536 DIST COSINE TYPE F32;
`;
