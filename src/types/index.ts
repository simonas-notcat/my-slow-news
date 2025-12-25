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
});

export type Config = z.infer<typeof ConfigSchema>;

// Reddit types
export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
}

export interface RedditComment {
  id: string;
  post_id: string;
  author: string;
  body: string;
  score: number;
  parent_id: string;
  created_utc: number;
}

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
