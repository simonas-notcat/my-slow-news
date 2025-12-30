import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { loadConfig } from "../config";
import { getSummarizerAgent, getExtractorAgent } from "../mastra";
import { fetchTopPostsWithComments, type PostWithComments } from "../sources/reddit";
import { getDb, closeDb } from "../db";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import {
  parseLLMJson,
  SummaryResponseSchema,
  ExtractedClaimsSchema,
  type SummaryResponse,
  type ExtractedClaims,
} from "../utils/parse-llm-json";
import { withRetry } from "../utils/retry";
import {
  checkBudget,
  recordUsage,
  estimateTokens,
  getUsageStats,
  BudgetExceededError,
} from "../utils/budget-tracker";
import { selectDiverseComments, type CommentSelectionOptions } from "../utils/comment-selector";
import { isLinkPost, fetchLinkContent, formatLinkContentForPrompt } from "../utils/link-fetcher";
import { detectControversy } from "../utils/controversy-detector";
import {
  synthesizeThemes,
  formatThemeSynthesisMarkdown,
  type PostSummaryInput,
} from "../utils/theme-synthesizer";
import {
  shouldUseHierarchical,
  hierarchicalSummarize,
  formatThreadSummariesForDigest,
} from "../utils/hierarchical-summarizer";
import {
  cotSummarize,
  formatControversyAnalysisMarkdown,
} from "../utils/cot-summarizer";
import {
  sanitizeMarkdown,
  formatHumanDate,
  slugify,
  claimToNaturalLanguage,
} from "../utils/digest-format";
import { getEmbeddingService, type EmbeddingConfig } from "../embeddings";
import { ClaimDeduplicationService } from "../embeddings/deduplication";
import { RelatedClaimsService, type RelatedClaim } from "../embeddings/related";
import { ContradictionDetectionService } from "../embeddings/contradictions/service";
import { createContradictionVerifier } from "../embeddings/contradictions/llm-verifier";
import type { ContradictionPair } from "../embeddings/contradictions/types";

// ============================================================================
// Workflow Schemas - Proper type definitions for step inputs/outputs
// ============================================================================

// Schema for workflow input
const DigestInputSchema = z.object({
  date: z.string().optional().describe("Date for the digest (YYYY-MM-DD)"),
});

// Schema for workflow output
const DigestOutputSchema = z.object({
  digest_path: z.string(),
  posts_processed: z.number(),
  claims_extracted: z.number(),
});

// Export type for use in CLI and other modules
export type DigestOutput = z.infer<typeof DigestOutputSchema>;

// Schema for Reddit post data passed through workflow
const RedditPostDataSchema = z.object({
  id: z.string(),
  subreddit: z.string(),
  title: z.string(),
  selftext: z.string(),
  author: z.string(),
  url: z.string(),
  permalink: z.string(),
  score: z.number(),
  num_comments: z.number(),
  created_utc: z.number(),
});

// Schema for Reddit comment
const RedditCommentSchema = z.object({
  id: z.string(),
  post_id: z.string(),
  author: z.string(),
  body: z.string(),
  score: z.number(),
  parent_id: z.string(),
  created_utc: z.number(),
});

// Schema for fetched post with subreddit info
const FetchedPostSchema = z.object({
  subreddit: z.string(),
  data: z.object({
    post: RedditPostDataSchema,
    comments: z.array(RedditCommentSchema),
  }),
});

// Schema for summary response - with required fields (defaults are applied during parsing)
const WorkflowSummarySchema = z.object({
  summary: z.string(),
  notable_comments: z.array(z.string()),
  sentiment: z.enum(["positive", "negative", "mixed", "neutral"]),
  key_topics: z.array(z.string()),
  // Quality confidence scoring fields
  confidence: z.number().min(0).max(1),
  controversy_level: z.enum(["none", "low", "medium", "high"]),
  information_density: z.enum(["sparse", "moderate", "rich"]),
  missing_context: z.array(z.string()),
});

// Schema for claim - with required fields (defaults are applied during parsing)
const WorkflowClaimSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  confidence: z.number().min(0).max(1),
  source_stance: z.enum(["agrees", "disagrees", "neutral", "uncertain"]),
});

// Schema for post with summary
const PostWithSummarySchema = z.object({
  subreddit: z.string(),
  post: RedditPostDataSchema,
  comments: z.array(RedditCommentSchema),
  summary: WorkflowSummarySchema,
});

// Schema for post with summary and claims
const PostWithClaimsSchema = PostWithSummarySchema.extend({
  claims: z.array(WorkflowClaimSchema),
  commenter_stances: z.object({
    agree_percentage: z.number().optional(),
    disagree_percentage: z.number().optional(),
    notable_camps: z.array(z.any()).optional(),
  }).optional(),
});

// Type alias for use in callbacks
type PostWithClaims = z.infer<typeof PostWithClaimsSchema>;

// ============================================================================
// Step Context Types - Named types for workflow step execute functions
// ============================================================================

type FetchedPost = z.infer<typeof FetchedPostSchema>;
type PostWithSummary = z.infer<typeof PostWithSummarySchema>;
type WorkflowClaim = z.infer<typeof WorkflowClaimSchema>;
type DigestWithData = z.infer<typeof DigestWithDataSchema>;
type RedditComment = z.infer<typeof RedditCommentSchema>;

/** Context for fetch-content step */
type FetchContentContext = {
  inputData?: { date?: string };
  date?: string;
};

/** Context for summarize-posts step */
type SummarizeStepContext = {
  inputData?: { posts: FetchedPost[]; date: string };
  posts?: FetchedPost[];
  date?: string;
};

/** Context for extract-claims step */
type ExtractClaimsContext = {
  inputData?: { summaries: PostWithSummary[]; date: string };
  summaries?: PostWithSummary[];
  date?: string;
};

// Type for semantic analysis
type SemanticAnalysis = z.infer<typeof SemanticAnalysisSchema>;

/** Context for generate-digest step */
type GenerateDigestContext = {
  inputData?: {
    summaries_with_claims: PostWithClaims[];
    all_claims: WorkflowClaim[];
    date: string;
    semantic_analysis?: SemanticAnalysis;
  };
  summaries_with_claims?: PostWithClaims[];
  all_claims?: WorkflowClaim[];
  date?: string;
  semantic_analysis?: SemanticAnalysis;
};

/** Context for save-to-database step */
type SaveToDatabaseContext = {
  inputData?: DigestWithData;
} & Partial<DigestWithData>;

// Schema for related claim in digest
const RelatedClaimSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  similarity: z.number(),
  date: z.string().optional(),
});

// Schema for contradiction pair in digest
const ContradictionSchema = z.object({
  newClaim: z.object({
    subject: z.string(),
    predicate: z.string(),
    object: z.string(),
  }),
  existingClaim: z.object({
    id: z.string(),
    subject: z.string(),
    predicate: z.string(),
    object: z.string(),
  }),
  contradictionType: z.string(),
  confidence: z.number(),
  explanation: z.string().optional(),
});

// Schema for semantic analysis results
const SemanticAnalysisSchema = z.object({
  relatedClaimsMap: z.record(z.string(), z.array(RelatedClaimSchema)),
  contradictions: z.array(ContradictionSchema),
});

// Extended schema for passing data through to database step
const DigestWithDataSchema = z.object({
  digest_path: z.string(),
  posts_processed: z.number(),
  claims_extracted: z.number(),
  date: z.string(),
  summaries_with_claims: z.array(PostWithClaimsSchema),
  all_claims: z.array(WorkflowClaimSchema),
  semantic_analysis: SemanticAnalysisSchema.optional(),
});

// Step 1: Fetch Reddit content
const fetchContentStep = createStep({
  id: "fetch-content",
  inputSchema: DigestInputSchema,
  outputSchema: z.object({
    posts: z.array(FetchedPostSchema),
    date: z.string(),
  }),
  execute: async (context: FetchContentContext) => {
    const config = loadConfig();
    // Handle both old and new Mastra API formats
    const input = context.inputData || context;
    const date = input?.date || new Date().toISOString().split("T")[0];

    console.log(`\nFetching content for ${date}...`);
    const postsMap = await fetchTopPostsWithComments(config);

    // Flatten to array with subreddit info
    const posts: Array<{ subreddit: string; data: PostWithComments }> = [];
    for (const [subreddit, subredditPosts] of postsMap) {
      for (const postData of subredditPosts) {
        posts.push({ subreddit, data: postData });
      }
    }

    console.log(`Fetched ${posts.length} posts total`);
    return { posts, date };
  },
});

// Step 2: Summarize posts
const summarizeStep = createStep({
  id: "summarize-posts",
  inputSchema: z.object({
    posts: z.array(FetchedPostSchema),
    date: z.string(),
  }),
  outputSchema: z.object({
    summaries: z.array(PostWithSummarySchema),
    date: z.string(),
  }),
  execute: async (context: SummarizeStepContext) => {
    const input = context.inputData ?? context;
    const posts = input.posts ?? [];
    const date = input.date ?? new Date().toISOString().split("T")[0];
    const config = loadConfig();
    const agent = getSummarizerAgent();

    // Get config settings with defaults
    const summarizationConfig = config.summarization ?? {};
    const commentSelectionConfig = summarizationConfig.comment_selection ?? {};
    const hierarchicalConfig = summarizationConfig.hierarchical ?? {};
    const controversyConfig = summarizationConfig.controversy ?? {};
    const linkFetchingConfig = config.link_fetching ?? {};

    // Comment selection weights from config
    const commentSelectionOptions: CommentSelectionOptions = {
      topScoredWeight: commentSelectionConfig.top_scored_weight ?? 0.4,
      repliedToWeight: commentSelectionConfig.replied_to_weight ?? 0.2,
      controversialWeight: commentSelectionConfig.controversial_weight ?? 0.2,
      contrarianWeight: commentSelectionConfig.contrarian_weight ?? 0.2,
    };

    console.log(`\nSummarizing ${posts.length} posts...`);
    const summaries: PostWithSummary[] = [];

    for (const { subreddit, data } of posts) {
      const { post, comments } = data;

      // Detect controversy level for context
      const controversyResult = detectControversy(post, comments);
      const controversyThreshold = controversyConfig.threshold ?? 0.5;
      const useCOT = (controversyConfig.enabled ?? true) &&
                     (controversyConfig.use_cot ?? true) &&
                     controversyResult.score >= controversyThreshold;

      // Check if hierarchical summarization should be used
      const hierarchicalEnabled = hierarchicalConfig.enabled ?? true;
      const minCommentsThreshold = hierarchicalConfig.min_comments_threshold ?? 20;
      const useHierarchical = hierarchicalEnabled &&
                              shouldUseHierarchical(comments, minCommentsThreshold);

      try {
        let normalizedSummary: {
          summary: string;
          notable_comments: string[];
          sentiment: "positive" | "negative" | "mixed" | "neutral";
          key_topics: string[];
          confidence: number;
          controversy_level: "none" | "low" | "medium" | "high";
          information_density: "sparse" | "moderate" | "rich";
          missing_context: string[];
        };

        // Route to appropriate summarization strategy
        if (useCOT) {
          // Use Chain-of-Thought summarization for controversial posts
          console.log(`  [COT] Using chain-of-thought for controversial post: ${post.title.slice(0, 50)}...`);

          // COT prompt includes ~2000 chars template + 15 selected comments (400 chars each)
          // Estimate: template (2000) + post content + 15 comments × 400 chars
          const cotPromptOverhead = 2000;
          const cotCommentsEstimate = Math.min(comments.length, 15) * 400;
          const cotInputTokens = estimateTokens(post.selftext + post.title) + estimateTokens(String(cotPromptOverhead + cotCommentsEstimate));
          const cotOutputEstimate = 1500; // COT responses are typically longer

          const budgetCheck = checkBudget(cotInputTokens, cotOutputEstimate, config.llm.daily_budget_usd);
          if (!budgetCheck.allowed) {
            throw new BudgetExceededError(budgetCheck.remainingBudget, budgetCheck.estimatedCost);
          }

          const cotResult = await cotSummarize(agent, post, comments, controversyResult);

          // Record actual usage with accurate estimate
          recordUsage(cotInputTokens, estimateTokens(cotResult.summary));

          normalizedSummary = {
            summary: cotResult.summary,
            notable_comments: cotResult.notable_comments ?? [],
            sentiment: cotResult.sentiment ?? "mixed",
            key_topics: cotResult.key_topics ?? [],
            confidence: cotResult.confidence ?? 0.7,
            controversy_level: cotResult.controversy_level ?? "high",
            information_density: cotResult.information_density ?? "rich",
            missing_context: cotResult.missing_context ?? [],
          };

          // Append controversy analysis to summary if available
          if (cotResult.controversy_analysis) {
            const analysisText = formatControversyAnalysisMarkdown(cotResult.controversy_analysis);
            normalizedSummary.summary += "\n\n" + analysisText;
          }

        } else if (useHierarchical) {
          // Use hierarchical summarization for posts with many comments
          console.log(`  [Hierarchical] Using thread-based summarization for: ${post.title.slice(0, 50)}...`);

          // Hierarchical makes multiple LLM calls: ~5 thread summaries + 1 synthesis
          // Estimate: 6 calls × (prompt template ~500 + thread content ~1000) = ~9000 tokens input
          // Plus ~300 tokens output per call = ~1800 tokens output
          const estimatedThreadCount = Math.min(5, Math.ceil(comments.length / 10));
          const hierarchicalInputEstimate = estimatedThreadCount * 1500 + 1000; // thread prompts + synthesis prompt
          const hierarchicalOutputEstimate = estimatedThreadCount * 300 + 500; // thread summaries + synthesis

          const budgetCheck = checkBudget(hierarchicalInputEstimate, hierarchicalOutputEstimate, config.llm.daily_budget_usd);
          if (!budgetCheck.allowed) {
            throw new BudgetExceededError(budgetCheck.remainingBudget, budgetCheck.estimatedCost);
          }

          const hierarchicalResult = await hierarchicalSummarize(agent, post, comments);

          // Record actual usage with accurate estimate
          const actualThreadCount = hierarchicalResult.threadSummaries.length;
          const actualInputTokens = actualThreadCount * 1500 + 1000;
          recordUsage(actualInputTokens, estimateTokens(hierarchicalResult.synthesizedSummary));

          const formattedSummary = formatThreadSummariesForDigest(hierarchicalResult);

          normalizedSummary = {
            summary: formattedSummary,
            notable_comments: hierarchicalResult.threadSummaries.map(
              t => `Thread by u/${t.author}: ${t.summary.slice(0, 100)}...`
            ),
            sentiment: "mixed",
            key_topics: [],
            confidence: 0.8,
            controversy_level: controversyResult.isControversial ? "medium" : "none",
            information_density: "rich",
            missing_context: [],
          };

        } else {
          // Standard summarization
          // Use diverse comment selection for better viewpoint representation
          const selectedComments = selectDiverseComments(comments, 10, commentSelectionOptions);

          const controversyHint = controversyResult.isControversial
            ? `\n\nNote: This appears to be a controversial discussion (score: ${Math.round(controversyResult.score * 100)}%). Please ensure balanced representation of viewpoints.`
            : "";

          // Fetch link content for link posts
          let linkContentText = "";
          if ((linkFetchingConfig.enabled ?? true) && isLinkPost(post)) {
            try {
              const linkContent = await fetchLinkContent(post.url, {
                timeout: linkFetchingConfig.timeout_ms ?? 5000,
                maxLength: linkFetchingConfig.max_content_length ?? 5000,
                allowedDomains: linkFetchingConfig.allowed_domains ?? [],
                blockedDomains: linkFetchingConfig.blocked_domains ?? [],
              });
              linkContentText = formatLinkContentForPrompt(linkContent, 1500);
            } catch (e) {
              linkContentText = "(Link post - external content could not be fetched)";
            }
          }

          const contentSection = post.selftext
            ? post.selftext
            : linkContentText || "(Link post - no text content)";

          const prompt = `Summarize this Reddit post and its comments:

Title: ${post.title}
Author: u/${post.author}
Score: ${post.score} upvotes
URL: ${post.permalink}

Content:
${contentSection}

Comments (${comments.length} total, ${selectedComments.length} shown - selected for diversity):
${selectedComments
  .map((c: RedditComment) => `- u/${c.author} (${c.score} pts): ${c.body.slice(0, 500)}`)
  .join("\n")}${controversyHint}

Return a JSON response with: summary, notable_comments, sentiment, key_topics, confidence (0-1), controversy_level (none/low/medium/high), information_density (sparse/moderate/rich), and missing_context (array of strings).`;

          // Check budget before making LLM call
          const inputTokens = estimateTokens(prompt);
          const estimatedOutputTokens = 500; // Rough estimate for summary
          const budgetCheck = checkBudget(inputTokens, estimatedOutputTokens, config.llm.daily_budget_usd);

          if (!budgetCheck.allowed) {
            throw new BudgetExceededError(budgetCheck.remainingBudget, budgetCheck.estimatedCost);
          }

          // Use retry wrapper for transient failures
          const result = await withRetry(
            () => agent.generate(prompt),
            {
              maxAttempts: 3,
              onRetry: (err, attempt, delay) => {
                console.warn(`Retry ${attempt} for post ${post.id} after ${delay}ms: ${err.message}`);
              },
            }
          );

          const text = typeof result === "string" ? result : (result as { text: string }).text;

          // Record actual usage (estimate output tokens from response)
          recordUsage(inputTokens, estimateTokens(text));

          // Parse and validate JSON using robust parser
          const fallback: SummaryResponse = {
            summary: text,
            notable_comments: [],
            sentiment: "neutral",
            key_topics: [],
            confidence: 0.5,
            controversy_level: "none",
            information_density: "moderate",
            missing_context: [],
          };

          const { data: summary, success, error } = parseLLMJson(
            text,
            SummaryResponseSchema,
            fallback
          );

          if (!success) {
            console.warn(`JSON parse warning for post ${post.id}: ${error}`);
          }

          // Normalize summary to ensure all fields have values
          normalizedSummary = {
            summary: summary.summary,
            notable_comments: summary.notable_comments ?? [],
            sentiment: summary.sentiment ?? "neutral",
            key_topics: summary.key_topics ?? [],
            confidence: summary.confidence ?? 0.7,
            controversy_level: summary.controversy_level ?? "none",
            information_density: summary.information_density ?? "moderate",
            missing_context: summary.missing_context ?? [],
          };
        }

        summaries.push({
          subreddit,
          post,
          comments,
          summary: normalizedSummary,
        });
      } catch (error) {
        if (error instanceof BudgetExceededError) {
          console.error(`Budget exceeded, skipping remaining posts. ${error.message}`);
          break; // Stop processing more posts
        }
        console.error(`Error summarizing post ${post.id}:`, error);
        summaries.push({
          subreddit,
          post,
          comments,
          summary: {
            summary: "Failed to summarize",
            notable_comments: [],
            sentiment: "neutral" as const,
            key_topics: [],
            confidence: 0,
            controversy_level: "none" as const,
            information_density: "sparse" as const,
            missing_context: ["summarization failed"],
          },
        });
      }
    }

    const stats = getUsageStats();
    console.log(`Usage: ${stats.requestCount} requests, $${stats.totalCost.toFixed(4)} spent today`);

    return { summaries, date };
  },
});

// Step 3: Extract claims
const extractClaimsStep = createStep({
  id: "extract-claims",
  inputSchema: z.object({
    summaries: z.array(PostWithSummarySchema),
    date: z.string(),
  }),
  outputSchema: z.object({
    summaries_with_claims: z.array(PostWithClaimsSchema),
    all_claims: z.array(WorkflowClaimSchema),
    date: z.string(),
  }),
  execute: async (context: ExtractClaimsContext) => {
    const input = context.inputData ?? context;
    const summaries = input.summaries ?? [];
    const date = input.date ?? new Date().toISOString().split("T")[0];
    const config = loadConfig();
    const agent = getExtractorAgent();

    console.log(`\nExtracting claims from ${summaries.length} posts...`);
    const allClaims: WorkflowClaim[] = [];
    const summariesWithClaims: PostWithClaims[] = [];

    for (const item of summaries) {
      const { post, summary } = item;

      const prompt = `Extract knowledge claims from this content:

Title: ${post.title}
Summary: ${summary.summary}
Key Topics: ${(summary.key_topics || []).join(", ")}
Sentiment: ${summary.sentiment || "unknown"}

Notable Comments:
${(summary.notable_comments || []).join("\n")}

Extract claims as RDF triples and analyze commenter stances. Return JSON.`;

      try {
        // Check budget before making LLM call
        const inputTokens = estimateTokens(prompt);
        const estimatedOutputTokens = 800; // Claims extraction tends to be longer
        const budgetCheck = checkBudget(inputTokens, estimatedOutputTokens, config.llm.daily_budget_usd);

        if (!budgetCheck.allowed) {
          throw new BudgetExceededError(budgetCheck.remainingBudget, budgetCheck.estimatedCost);
        }

        // Use retry wrapper for transient failures
        const result = await withRetry(
          () => agent.generate(prompt),
          {
            maxAttempts: 3,
            onRetry: (err, attempt, delay) => {
              console.warn(`Retry ${attempt} for claims from ${post.id} after ${delay}ms: ${err.message}`);
            },
          }
        );

        const text = typeof result === "string" ? result : (result as { text: string }).text;

        // Record actual usage
        recordUsage(inputTokens, estimateTokens(text));

        // Parse and validate JSON using robust parser
        const fallback: ExtractedClaims = {
          claims: [],
          commenter_stances: {},
        };

        const { data: extracted, success, error } = parseLLMJson(
          text,
          ExtractedClaimsSchema,
          fallback
        );

        if (!success) {
          console.warn(`JSON parse warning for claims from ${post.id}: ${error}`);
        }

        // Normalize claims to ensure all fields have values (Zod defaults are applied during parsing)
        type SourceStance = "agrees" | "disagrees" | "neutral" | "uncertain";
        const normalizedClaims = (extracted.claims || []).map((c: { subject: string; predicate: string; object: string; confidence?: number; source_stance?: SourceStance }) => ({
          subject: c.subject,
          predicate: c.predicate,
          object: c.object,
          confidence: c.confidence ?? 0.5,
          source_stance: c.source_stance ?? ("neutral" as SourceStance),
        }));

        summariesWithClaims.push({
          ...item,
          claims: normalizedClaims,
          commenter_stances: extracted.commenter_stances,
        });

        allClaims.push(...normalizedClaims);
      } catch (error) {
        if (error instanceof BudgetExceededError) {
          console.error(`Budget exceeded, skipping remaining claims extraction. ${error.message}`);
          // Add remaining items without claims
          summariesWithClaims.push({
            ...item,
            claims: [],
            commenter_stances: {},
          });
          break;
        }
        console.error(`Error extracting claims from ${post.id}:`, error);
        summariesWithClaims.push({
          ...item,
          claims: [],
          commenter_stances: {},
        });
      }
    }

    const stats = getUsageStats();
    console.log(`Extracted ${allClaims.length} claims total`);
    console.log(`Usage: ${stats.requestCount} requests, $${stats.totalCost.toFixed(4)} spent today`);

    return { summaries_with_claims: summariesWithClaims, all_claims: allClaims, date };
  },
});

// Step 3.5: Semantic Analysis - Find related claims and detect contradictions
const semanticAnalysisStep = createStep({
  id: "semantic-analysis",
  inputSchema: z.object({
    summaries_with_claims: z.array(PostWithClaimsSchema),
    all_claims: z.array(WorkflowClaimSchema),
    date: z.string(),
  }),
  outputSchema: z.object({
    summaries_with_claims: z.array(PostWithClaimsSchema),
    all_claims: z.array(WorkflowClaimSchema),
    date: z.string(),
    semantic_analysis: SemanticAnalysisSchema.optional(),
  }),
  execute: async (context: {
    inputData?: { summaries_with_claims: PostWithClaims[]; all_claims: WorkflowClaim[]; date: string };
    summaries_with_claims?: PostWithClaims[];
    all_claims?: WorkflowClaim[];
    date?: string;
  }) => {
    const input = context.inputData ?? context;
    const summaries_with_claims = input.summaries_with_claims ?? [];
    const all_claims = input.all_claims ?? [];
    const date = input.date ?? new Date().toISOString().split("T")[0];
    const config = loadConfig();

    // Check if semantic features are enabled
    const semanticConfig = config.semantic ?? {};
    const relatedConfig = semanticConfig.related_in_digest ?? {};
    const contradictionsConfig = semanticConfig.contradictions ?? {};
    const relatedEnabled = relatedConfig.enabled ?? false;
    const contradictionsEnabled = contradictionsConfig.enabled ?? false;

    // If neither feature is enabled, skip
    if (!relatedEnabled && !contradictionsEnabled) {
      console.log("\nSemantic analysis: disabled (enable in config.semantic)");
      return { summaries_with_claims, all_claims, date };
    }

    console.log("\nRunning semantic analysis...");

    // Check for required environment variables
    const provider = config.embeddings?.provider ?? "openai";
    if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      console.warn("  OPENAI_API_KEY not set, skipping semantic analysis");
      return { summaries_with_claims, all_claims, date };
    }

    let db;
    try {
      db = await getDb(config);
    } catch (error) {
      console.error("  Failed to connect to database:", error);
      return { summaries_with_claims, all_claims, date };
    }

    const semanticAnalysis: SemanticAnalysis = {
      relatedClaimsMap: {},
      contradictions: [],
    };

    try {
      // Initialize embedding service
      const embeddingConfig: EmbeddingConfig = {
        provider,
        model: config.embeddings?.model ?? "text-embedding-3-small",
        dimensions: config.embeddings?.dimensions ?? 1536,
        cacheEnabled: config.embeddings?.cache_enabled ?? true,
        cacheSize: config.embeddings?.cache_size ?? 10000,
        batchSize: config.embeddings?.batch_size ?? 100,
      };
      const embeddingService = getEmbeddingService(embeddingConfig);

      // Generate embeddings for new claims
      const validClaims = all_claims.filter(c =>
        c.subject && c.predicate && c.object && (c.confidence ?? 0) >= 0.5
      );

      if (validClaims.length === 0) {
        console.log("  No valid claims to analyze");
        return { summaries_with_claims, all_claims, date };
      }

      console.log(`  Generating embeddings for ${validClaims.length} claims...`);
      const claimTexts = validClaims.map(c =>
        `${c.subject} ${c.predicate.replace(/-/g, " ")} ${c.object}`
      );
      const embeddings = await embeddingService.embedBatch(claimTexts);

      // Find related claims for each new claim (if enabled)
      if (relatedEnabled) {
        console.log("  Finding related claims...");
        const perClaimLimit = relatedConfig.per_claim_limit ?? 2;
        const minSimilarity = relatedConfig.min_similarity ?? 0.65;

        for (let i = 0; i < validClaims.length; i++) {
          const claim = validClaims[i];
          const embedding = embeddings[i];
          const claimKey = `${claim.subject}|${claim.predicate}|${claim.object}`;

          // Query for similar existing claims
          const [existingClaims] = await db.query<[Array<{
            subject: string;
            predicate: string;
            object: string;
            extracted_at: string;
            similarity: number;
          }>]>(`
            SELECT
              subject,
              predicate,
              object,
              extracted_at,
              vector::similarity::cosine(embedding, $embedding) AS similarity
            FROM claim
            WHERE
              embedding IS NOT NONE
              AND is_canonical = true
              AND vector::similarity::cosine(embedding, $embedding) >= $minSimilarity
              AND NOT (subject = $subject AND predicate = $predicate AND object = $object)
            ORDER BY similarity DESC
            LIMIT $limit
          `, {
            embedding,
            minSimilarity,
            limit: perClaimLimit,
            subject: claim.subject,
            predicate: claim.predicate,
            object: claim.object,
          });

          if (existingClaims && existingClaims.length > 0) {
            semanticAnalysis.relatedClaimsMap[claimKey] = existingClaims.map((ec: {
              subject: string;
              predicate: string;
              object: string;
              extracted_at: string;
              similarity: number;
            }) => ({
              subject: ec.subject,
              predicate: ec.predicate,
              object: ec.object,
              similarity: ec.similarity,
              date: ec.extracted_at ? new Date(ec.extracted_at).toISOString().split("T")[0] : undefined,
            }));
          }
        }

        const totalRelated = Object.values(semanticAnalysis.relatedClaimsMap)
          .reduce((sum: number, arr: Array<{ subject: string; predicate: string; object: string; similarity: number; date?: string }>) => sum + arr.length, 0);
        console.log(`  Found ${totalRelated} related claims for ${Object.keys(semanticAnalysis.relatedClaimsMap).length} new claims`);
      }

      // Detect contradictions (if enabled)
      if (contradictionsEnabled) {
        console.log("  Detecting contradictions...");
        const minSimilarity = contradictionsConfig.min_similarity ?? 0.7;
        const useLlmVerification = contradictionsConfig.use_llm_verification ?? true;
        const maxContradictions = contradictionsConfig.max_in_digest ?? 5;

        // Create verifier if LLM verification is enabled
        const llmVerifier = useLlmVerification ? createContradictionVerifier() : undefined;
        const contradictionService = new ContradictionDetectionService(db, llmVerifier);

        // For each new claim, check for contradictions with existing claims
        for (let i = 0; i < validClaims.length && semanticAnalysis.contradictions.length < maxContradictions; i++) {
          const claim = validClaims[i];
          const embedding = embeddings[i];

          // Find similar existing claims that might contradict
          const [candidates] = await db.query<[Array<{
            id: string;
            subject: string;
            predicate: string;
            object: string;
            embedding: number[];
            similarity: number;
          }>]>(`
            SELECT
              id,
              subject,
              predicate,
              object,
              embedding,
              vector::similarity::cosine(embedding, $embedding) AS similarity
            FROM claim
            WHERE
              embedding IS NOT NONE
              AND is_canonical = true
              AND vector::similarity::cosine(embedding, $embedding) >= $minSimilarity
              AND NOT (subject = $subject AND predicate = $predicate AND object = $object)
            ORDER BY similarity DESC
            LIMIT 10
          `, {
            embedding,
            minSimilarity,
            subject: claim.subject,
            predicate: claim.predicate,
            object: claim.object,
          });

          if (!candidates || candidates.length === 0) continue;

          // Check each candidate for contradiction
          for (const candidate of candidates) {
            if (semanticAnalysis.contradictions.length >= maxContradictions) break;

            // Format claims for verification
            const newClaimText = `${claim.subject} ${claim.predicate.replace(/-/g, " ")} ${claim.object}`;
            const existingClaimText = `${candidate.subject} ${candidate.predicate.replace(/-/g, " ")} ${candidate.object}`;

            // Use LLM to verify contradiction
            if (llmVerifier) {
              try {
                const result = await llmVerifier(newClaimText, existingClaimText);
                if (result.isContradiction && result.confidence >= 0.7) {
                  semanticAnalysis.contradictions.push({
                    newClaim: {
                      subject: claim.subject,
                      predicate: claim.predicate,
                      object: claim.object,
                    },
                    existingClaim: {
                      id: candidate.id,
                      subject: candidate.subject,
                      predicate: candidate.predicate,
                      object: candidate.object,
                    },
                    contradictionType: "semantic",
                    confidence: result.confidence,
                    explanation: result.explanation,
                  });
                }
              } catch (error) {
                console.warn(`  Contradiction check failed for claim: ${newClaimText}`);
              }
            }
          }
        }

        console.log(`  Detected ${semanticAnalysis.contradictions.length} contradictions`);
      }
    } catch (error) {
      console.error("  Semantic analysis failed:", error);
    }

    return { summaries_with_claims, all_claims, date, semantic_analysis: semanticAnalysis };
  },
});

// Step 4: Generate markdown and save
const generateDigestStep = createStep({
  id: "generate-digest",
  inputSchema: z.object({
    summaries_with_claims: z.array(PostWithClaimsSchema),
    all_claims: z.array(WorkflowClaimSchema),
    date: z.string(),
    semantic_analysis: SemanticAnalysisSchema.optional(),
  }),
  outputSchema: DigestWithDataSchema,
  execute: async (context: GenerateDigestContext) => {
    const input = context.inputData ?? context;
    const summaries_with_claims = input.summaries_with_claims ?? [];
    const all_claims = input.all_claims ?? [];
    const date = input.date ?? new Date().toISOString().split("T")[0];
    const semantic_analysis = input.semantic_analysis;
    const config = loadConfig();

    console.log(`\nGenerating digest for ${date}...`);

    // Group by subreddit
    const bySubreddit = new Map<string, PostWithClaims[]>();
    for (const item of summaries_with_claims) {
      const list = bySubreddit.get(item.subreddit) || [];
      list.push(item);
      bySubreddit.set(item.subreddit, list);
    }

    // Calculate stats
    const postCount = summaries_with_claims.length;
    const subredditCount = bySubreddit.size;
    const claimCount = all_claims.length;

    // Generate markdown with improved header
    const humanDate = formatHumanDate(date);
    let markdown = `# My Slow News - ${date}\n\n`;
    markdown += `*${humanDate} • ${postCount} posts • ${subredditCount} subreddits • ${claimCount} claims extracted*\n\n`;

    // Generate TL;DR section
    if (summaries_with_claims.length > 0) {
      markdown += `## TL;DR\n\n`;
      for (const item of summaries_with_claims.slice(0, 5)) {
        const sentiment = item.summary.sentiment;
        const emoji = sentiment === "positive" ? "🔥" :
                     sentiment === "negative" ? "⚠️" :
                     sentiment === "mixed" ? "🔄" : "📰";
        // Create a one-line summary from the first sentence (sanitized)
        const firstSentence = item.summary.summary.split(/[.!?]/)[0].trim();
        const shortSummary = sanitizeMarkdown(
          firstSentence.length > 100 ? firstSentence.slice(0, 100) + "..." : firstSentence
        );
        const safeTitle = sanitizeMarkdown(
          item.post.title.slice(0, 60) + (item.post.title.length > 60 ? "..." : "")
        );
        markdown += `- ${emoji} **${safeTitle}** — ${shortSummary}\n`;
      }
      markdown += `\n---\n\n`;
    }

    // Get theme synthesis config
    const summarizationConfig = config.summarization ?? {};
    const themeSynthesisConfig = summarizationConfig.theme_synthesis ?? {};
    const themeSynthesisEnabled = themeSynthesisConfig.enabled ?? true;
    const minPostsForThemes = themeSynthesisConfig.min_posts ?? 3;

    // Theme synthesis across posts (if enough posts and enabled)
    if (themeSynthesisEnabled && summaries_with_claims.length >= minPostsForThemes) {
      try {
        const agent = getSummarizerAgent();
        const postInputs: PostSummaryInput[] = summaries_with_claims.map((item: PostWithClaims) => ({
          subreddit: item.subreddit,
          title: item.post.title,
          summary: item.summary.summary,
          sentiment: item.summary.sentiment,
          key_topics: item.summary.key_topics,
          controversy_level: item.summary.controversy_level,
        }));

        console.log("Synthesizing themes across posts...");
        const themes = await synthesizeThemes(agent, postInputs);
        const themesMarkdown = formatThemeSynthesisMarkdown(themes);

        if (themesMarkdown.trim()) {
          markdown += themesMarkdown + "\n";
        }
      } catch (e) {
        console.warn("Theme synthesis failed, skipping:", e);
      }
    }

    // Add Contradictions Detected section if any exist
    if (semantic_analysis?.contradictions && semantic_analysis.contradictions.length > 0) {
      markdown += `## Contradictions Detected\n\n`;
      markdown += `*New claims that contradict previously extracted knowledge:*\n\n`;

      for (const contradiction of semantic_analysis.contradictions) {
        const newClaimText = `${contradiction.newClaim.subject} ${contradiction.newClaim.predicate.replace(/-/g, " ")} ${contradiction.newClaim.object}`;
        const existingClaimText = `${contradiction.existingClaim.subject} ${contradiction.existingClaim.predicate.replace(/-/g, " ")} ${contradiction.existingClaim.object}`;
        const confidencePct = Math.round(contradiction.confidence * 100);

        markdown += `> ⚠️ **New:** "${sanitizeMarkdown(newClaimText)}"\n`;
        markdown += `> **Contradicts:** "${sanitizeMarkdown(existingClaimText)}"\n`;
        if (contradiction.explanation) {
          markdown += `> *${sanitizeMarkdown(contradiction.explanation)}* (${confidencePct}% confidence)\n`;
        }
        markdown += `\n`;
      }

      markdown += `---\n\n`;
    }

    markdown += `---\n\n`;

    for (const [subreddit, items] of bySubreddit) {
      markdown += `## r/${sanitizeMarkdown(subreddit)}\n\n`;

      for (const item of items) {
        const { post, summary, claims } = item;
        const slug = slugify(post.title);
        const safeTitle = sanitizeMarkdown(post.title);
        const safeAuthor = sanitizeMarkdown(post.author);

        markdown += `### [${safeTitle}](${post.permalink}) {#${slug}}\n\n`;

        // Build metadata line with quality indicators
        const confidencePct = Math.round((summary.confidence ?? 0.7) * 100);
        const controversyBadge = summary.controversy_level !== "none"
          ? ` • **Controversy:** ${summary.controversy_level}`
          : "";
        const densityIndicator = summary.information_density === "sparse" ? " ⚠️" : "";

        markdown += `**u/${safeAuthor}** • Score: ${post.score} • Confidence: ${confidencePct}%${controversyBadge}${densityIndicator}\n\n`;
        markdown += `${sanitizeMarkdown(summary.summary)}\n\n`;

        // Show missing context warnings
        if (summary.missing_context && summary.missing_context.length > 0) {
          const safeContext = summary.missing_context.map(c => sanitizeMarkdown(c)).join(", ");
          markdown += `> ⚠️ **Missing context:** ${safeContext}\n\n`;
        }

        // Key topics as tags
        if (summary.key_topics?.length > 0) {
          markdown += `**Topics:** ${summary.key_topics.map(t => `\`${sanitizeMarkdown(t)}\``).join(" ")}\n\n`;
        }

        // Claims in natural language format with related claims
        if (claims?.length > 0) {
          markdown += `**Key Claims:**\n`;
          for (const claim of claims.slice(0, 5)) { // Limit to top 5 claims
            markdown += `- ${claimToNaturalLanguage(claim)}\n`;

            // Show related claims if available
            if (semantic_analysis?.relatedClaimsMap) {
              const claimKey = `${claim.subject}|${claim.predicate}|${claim.object}`;
              const related = semantic_analysis.relatedClaimsMap[claimKey];
              if (related && related.length > 0) {
                for (const r of related) {
                  const relatedText = `${r.subject} ${r.predicate.replace(/-/g, " ")} ${r.object}`;
                  const dateStr = r.date ? ` (${r.date})` : "";
                  const simPct = Math.round(r.similarity * 100);
                  markdown += `  - *Related:* "${sanitizeMarkdown(relatedText)}"${dateStr} [${simPct}%]\n`;
                }
              }
            }
          }
          if (claims.length > 5) {
            markdown += `- *...and ${claims.length - 5} more claims*\n`;
          }
          markdown += `\n`;
        }

        markdown += `---\n\n`;
      }
    }

    // Save to file
    const filePath = join(config.output.digest_dir, `${date}.md`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, markdown, "utf-8");

    console.log(`Digest saved to: ${filePath}`);

    return {
      digest_path: filePath,
      posts_processed: summaries_with_claims.length,
      claims_extracted: all_claims.length,
      date,
      summaries_with_claims,
      all_claims,
      semantic_analysis,
    };
  },
});

// Step 5: Save to database
const saveToDatabaseStep = createStep({
  id: "save-to-database",
  inputSchema: DigestWithDataSchema,
  outputSchema: DigestOutputSchema,
  execute: async (context: SaveToDatabaseContext) => {
    const input = context.inputData ?? context;
    const summaries_with_claims = input.summaries_with_claims ?? [];
    const all_claims = input.all_claims ?? [];
    const date = input.date ?? new Date().toISOString().split("T")[0];
    const digest_path = input.digest_path ?? "";
    const posts_processed = input.posts_processed ?? summaries_with_claims.length;
    const claims_extracted = input.claims_extracted ?? all_claims.length;
    console.log(`\nSaving to database...`);

    const config = loadConfig();
    let db;

    try {
      db = await getDb(config);
    } catch (error) {
      console.error("Failed to connect to database:", error);
      console.log("Skipping database persistence");
      return {
        digest_path,
        posts_processed,
        claims_extracted,
      };
    }

    try {
      const savedPostIds: string[] = [];
      const savedClaimIds: string[] = [];
      let savedCommentCount = 0;

      // Save posts and their comments
      for (const item of summaries_with_claims) {
        const { post, subreddit, comments } = item;

        // Upsert post
        const postResult = await db.query<any[][]>(
          `INSERT INTO post (reddit_id, subreddit, title, content, author, url, score, created_at, fetched_at)
           VALUES ($reddit_id, $subreddit, $title, $content, $author, $url, $score, $created_at, time::now())
           ON DUPLICATE KEY UPDATE score = $score, fetched_at = time::now()`,
          {
            reddit_id: post.id,
            subreddit,
            title: post.title,
            content: post.selftext || "",
            author: post.author,
            url: post.permalink,
            score: post.score,
            created_at: new Date(post.created_utc * 1000),
          }
        );

        const postId = postResult[0]?.[0]?.id;
        if (postId) {
          savedPostIds.push(postId);

          // Save comments for this post
          if (comments && comments.length > 0) {
            for (const comment of comments) {
              await db.query(
                `INSERT INTO comment (reddit_id, post, author, content, score, parent_id, created_at)
                 VALUES ($reddit_id, $post, $author, $content, $score, $parent_id, $created_at)
                 ON DUPLICATE KEY UPDATE score = $score`,
                {
                  reddit_id: comment.id,
                  post: postId,
                  author: comment.author,
                  content: comment.body,
                  score: comment.score,
                  parent_id: comment.parent_id,
                  created_at: new Date(comment.created_utc * 1000),
                }
              );
              savedCommentCount++;
            }
          }
        }
      }

      // Save claims with optional semantic deduplication
      const deduplicationEnabled = config.semantic?.deduplication?.enabled ?? false;
      let duplicatesDetected = 0;
      let newClaimsCreated = 0;
      let deduplicationService: ClaimDeduplicationService | null = null;

      // Initialize deduplication service if enabled
      if (deduplicationEnabled) {
        const provider = config.embeddings?.provider ?? "openai";

        // Validate environment variables for embedding provider
        if (provider === "openai" && !process.env.OPENAI_API_KEY) {
          console.warn("  OPENAI_API_KEY not set, skipping semantic deduplication");
          console.log("  Set OPENAI_API_KEY in .env or use ollama provider");
        } else {
          try {
            const embeddingConfig: EmbeddingConfig = {
              provider,
              model: config.embeddings?.model ?? "text-embedding-3-small",
              dimensions: config.embeddings?.dimensions ?? 1536,
              cacheEnabled: config.embeddings?.cache_enabled ?? true,
              cacheSize: config.embeddings?.cache_size ?? 10000,
              batchSize: config.embeddings?.batch_size ?? 100,
            };
            const embeddingService = getEmbeddingService(embeddingConfig);
            deduplicationService = new ClaimDeduplicationService(
              db,
              embeddingService,
              {
                duplicateThreshold: config.semantic?.deduplication?.similarity_threshold ?? 0.92,
                relatedThreshold: config.semantic?.deduplication?.related_threshold ?? 0.75,
              }
            );
            console.log("  Semantic deduplication enabled");
          } catch (error) {
            console.warn("  Failed to initialize deduplication service:", error);
            console.log("  Falling back to simple claim storage");
          }
        }
      }

      for (const claim of all_claims) {
        // Skip invalid claims
        if (!claim.subject || !claim.predicate || !claim.object) {
          continue;
        }

        // Filter low-confidence claims
        if ((claim.confidence ?? 0) < 0.5) {
          continue;
        }

        let claimId: string | undefined;

        if (deduplicationService) {
          // Use semantic deduplication
          try {
            const result = await deduplicationService.processNewClaim({
              subject: claim.subject,
              predicate: claim.predicate,
              object: claim.object,
              confidence: claim.confidence ?? 0.5,
            });

            claimId = result.claim.id as string;

            if (result.isNew) {
              newClaimsCreated++;
            } else {
              duplicatesDetected++;
              console.log(`  Duplicate: "${claim.subject} ${claim.predicate} ${claim.object}" → merged with existing`);
            }
          } catch (error) {
            console.warn(`  Failed to deduplicate claim, falling back to simple storage:`, error);
            // Fall through to simple storage below
          }
        }

        // Fall back to simple storage if deduplication not used or failed
        // Note: With ON DUPLICATE KEY UPDATE, we can't distinguish inserts from updates,
        // so we don't increment newClaimsCreated here (would inflate the count)
        if (!claimId) {
          const claimResult = await db.query<any[][]>(
            `INSERT INTO claim (subject, predicate, object, confidence, extracted_at, is_canonical)
             VALUES ($subject, $predicate, $object, $confidence, time::now(), true)
             ON DUPLICATE KEY UPDATE confidence = math::max([confidence, $confidence])`,
            {
              subject: claim.subject,
              predicate: claim.predicate,
              object: claim.object,
              confidence: claim.confidence ?? 0.5,
            }
          );
          claimId = claimResult[0]?.[0]?.id;
        }

        if (claimId) {
          savedClaimIds.push(claimId);

          // Upsert claim_stances
          await db.query(
            `INSERT INTO claim_stances (claim, content_author_stance, commenter_agree_pct, commenter_disagree_pct)
             VALUES ($claimId, $stance, 0, 0)
             ON DUPLICATE KEY UPDATE content_author_stance = $stance`,
            {
              claimId,
              stance: claim.source_stance || "neutral",
            }
          );

          // Update predicate usage count (or create if new)
          await db.query(
            `INSERT INTO predicate (name, is_builtin, first_seen, usage_count)
             VALUES ($name, false, time::now(), 1)
             ON DUPLICATE KEY UPDATE usage_count = usage_count + 1`,
            { name: claim.predicate }
          );
        }
      }

      // Log deduplication statistics
      if (deduplicationEnabled && deduplicationService) {
        console.log(`  Deduplication: ${newClaimsCreated} new, ${duplicatesDetected} duplicates merged`);
      }

      // Create digest record
      await db.query(
        `INSERT INTO digest (date, file_path, posts_included, claims_extracted)
         VALUES ($date, $file_path, $posts, $claims)
         ON DUPLICATE KEY UPDATE file_path = $file_path, posts_included = $posts, claims_extracted = $claims`,
        {
          date: new Date(date),
          file_path: digest_path,
          posts: savedPostIds,
          claims: savedClaimIds,
        }
      );

      console.log(`Saved ${savedPostIds.length} posts, ${savedCommentCount} comments, and ${savedClaimIds.length} claims to database`);
    } catch (error) {
      console.error("Database save failed:", error);
    } finally {
      await closeDb();
    }

    return {
      digest_path,
      posts_processed,
      claims_extracted,
    };
  },
});

// Create the workflow
export const digestWorkflow = createWorkflow({
  id: "generate-digest",
  inputSchema: DigestInputSchema,
  outputSchema: DigestOutputSchema,
})
  .then(fetchContentStep)
  .then(summarizeStep)
  .then(extractClaimsStep)
  .then(semanticAnalysisStep)
  .then(generateDigestStep)
  .then(saveToDatabaseStep)
  .commit();

// Helper function to run the workflow
export async function runDigestWorkflow(date?: string) {
  try {
    // New Mastra API: create run and start
    const run = await digestWorkflow.createRunAsync();
    const result = await run.start({ inputData: { date } });
    return result;
  } catch (error: unknown) {
    // If the error is workflow-related, try extracting the actual result
    if (error && typeof error === 'object' && 'result' in error) {
      return (error as { result: DigestOutput }).result;
    }
    throw error;
  }
}
