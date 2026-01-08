import { z } from "zod";

// Stance types
export const UserStanceSchema = z.enum([
  "agrees",
  "disagrees",
  "neutral",
  "uncertain",
]);

export const StanceValueSchema = z.enum([
  "agrees",
  "disagrees",
  "neutral",
  "uncertain",
  "not-stated",
]);

// Helper to convert SurrealDB Record ID to string
function recordIdToString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null) {
    // Handle SurrealDB Record ID format: { tb: 'table', id: {...} }
    const record = val as Record<string, unknown>;
    if ('tb' in record && 'id' in record) {
      return `${record.tb}:${JSON.stringify(record.id)}`;
    }
    // Fallback: return JSON representation
    return JSON.stringify(val);
  }
  return String(val);
}

// Claim list item schema
export const ClaimListItemSchema = z.object({
  id: z.union([z.string(), z.record(z.unknown())]).transform(recordIdToString),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  confidence: z.number(),
  extracted_at: z.union([z.string(), z.date()]).optional(),
  user_stance: UserStanceSchema.optional(),
});

// Claim detail schema
export const ClaimDetailSchema = z.object({
  id: z.union([z.string(), z.record(z.unknown())]).transform(recordIdToString),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  confidence: z.number(),
  extracted_at: z.union([z.string(), z.date()]).optional(),

  // Predicate info
  predicate_description: z.string().optional(),
  predicate_is_builtin: z.boolean().default(false),

  // Stance info
  content_author_stance: StanceValueSchema.optional(),
  commenter_agree_pct: z.number().default(0),
  commenter_disagree_pct: z.number().default(0),
  user_stance: UserStanceSchema.optional(),
  user_note: z.string().optional(),

  // Source info
  source_post_title: z.string().optional(),
  source_subreddit: z.string().optional(),
});

// Count result schema
export const CountResultSchema = z.object({
  count: z.number(),
});

// Predicate option schema
export const PredicateOptionSchema = z.object({
  predicate: z.string(),
  count: z.number(),
});

// Export inferred types
export type ClaimListItemParsed = z.infer<typeof ClaimListItemSchema>;
export type ClaimDetailParsed = z.infer<typeof ClaimDetailSchema>;
export type CountResultParsed = z.infer<typeof CountResultSchema>;
export type PredicateOptionParsed = z.infer<typeof PredicateOptionSchema>;
