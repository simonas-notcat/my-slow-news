import { z } from "zod";

// Configuration schema
export const ConfigSchema = z.object({
  sources: z.object({
    reddit: z.object({
      subreddits: z.array(z.string()),
      posts_per_subreddit: z.number().default(5),
      lookback_hours: z.number().default(24),
      min_relative_score: z.number().default(1.0),
      max_comments_per_post: z.number().default(50),
    }),
  }),
  llm: z.object({
    provider: z.literal("anthropic"),
    model: z.string().default("anthropic/claude-sonnet-4-20250514"),
    daily_budget_usd: z.number().default(5.0),
  }),
  output: z.object({
    digest_dir: z.string().default("./digests"),
    format: z.literal("markdown"),
  }),
  database: z.object({
    url: z.string().default("ws://localhost:8000/rpc"),
    namespace: z.string().default("myslownews"),
    database: z.string().default("main"),
  }),
  // Summarization feature flags
  summarization: z.object({
    comment_selection: z.object({
      top_scored_weight: z.number().default(0.4),
      replied_to_weight: z.number().default(0.2),
      controversial_weight: z.number().default(0.2),
      contrarian_weight: z.number().default(0.2),
    }).optional().default({}),
    hierarchical: z.object({
      enabled: z.boolean().default(true),
      min_comments_threshold: z.number().default(20),
      max_threads: z.number().default(5),
    }).optional().default({}),
    controversy: z.object({
      enabled: z.boolean().default(true),
      use_cot: z.boolean().default(true),
      threshold: z.number().default(0.5),
    }).optional().default({}),
    theme_synthesis: z.object({
      enabled: z.boolean().default(true),
      min_posts: z.number().default(3),
    }).optional().default({}),
  }).optional().default({}),
  // Link fetching configuration
  link_fetching: z.object({
    enabled: z.boolean().default(true),
    timeout_ms: z.number().default(10000),
    max_content_length: z.number().default(5000),
    allowed_domains: z.array(z.string()).optional().default([]),
    blocked_domains: z.array(z.string()).optional().default([]),
  }).optional().default({}),
  // Embedding configuration for semantic features
  embeddings: z.object({
    provider: z.enum(["openai", "ollama"]).default("openai"),
    model: z.string().default("text-embedding-3-small"),
    dimensions: z.number().default(1536),
    cache_enabled: z.boolean().default(true),
    batch_size: z.number().default(100),
    openai: z.object({
      api_key_env: z.string().default("OPENAI_API_KEY"),
    }).optional(),
    ollama: z.object({
      base_url: z.string().default("http://localhost:11434"),
      model: z.string().default("nomic-embed-text"),
    }).optional(),
  }).optional().default({}),
  // Semantic features configuration
  semantic: z.object({
    deduplication: z.object({
      enabled: z.boolean().default(true),
      similarity_threshold: z.number().default(0.92),
      related_threshold: z.number().default(0.75),
    }).optional().default({}),
  }).optional().default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

// Re-export Reddit types from sources
export type { RedditPost, RedditComment } from "../sources/types";

// Database record types
export interface PostRecord {
  id?: string;
  reddit_id: string;
  subreddit: string;
  title: string;
  content: string;
  author: string;
  url: string;
  score: number;
  created_at: Date;
  fetched_at: Date;
}

export interface CommentRecord {
  id?: string;
  reddit_id: string;
  post: string; // record<post>
  author: string;
  content: string;
  score: number;
  parent?: string; // record<comment>
}

export interface ClaimRecord {
  id?: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  extracted_at: Date;
}

export interface ClaimStancesRecord {
  id?: string;
  claim: string; // record<claim>
  content_author_stance: string;
  commenter_agree_pct: number;
  commenter_disagree_pct: number;
  commenter_camps?: Record<string, unknown>;
  user_stance?: string;
  user_note?: string;
}

export interface DigestRecord {
  id?: string;
  date: Date;
  file_path: string;
  posts_included: string[]; // array<record<post>>
  claims_extracted: string[]; // array<record<claim>>
}

// Stance values
export type Stance = "agrees" | "disagrees" | "neutral" | "uncertain" | "not-stated";

// Extracted claim from LLM
export interface ExtractedClaim {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source_stance: Stance;
}

// Post summary from LLM
export interface PostSummary {
  title: string;
  summary: string;
  notable_comments: string[];
  claims: ExtractedClaim[];
}

// Query result types for type-safe database queries
export interface PredicateCount {
  predicate: string;
  count: number;
}

export interface SubjectCount {
  subject: string;
  count: number;
}

export interface ClaimWithStance extends ClaimRecord {
  claim?: ClaimRecord; // For FETCH queries
  user_stance?: string;
  user_note?: string;
}

export interface PredicateRecord {
  id?: string;
  name: string;
  description?: string;
  is_builtin: boolean;
  first_seen: Date;
  usage_count: number;
}
