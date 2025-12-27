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
import { selectDiverseComments } from "../utils/comment-selector";
import { isLinkPost, fetchLinkContent, formatLinkContentForPrompt } from "../utils/link-fetcher";
import { detectControversy } from "../utils/controversy-detector";
import {
  synthesizeThemes,
  formatThemeSynthesisMarkdown,
  shouldSynthesizeThemes,
  type PostSummaryInput,
} from "../utils/theme-synthesizer";

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

// Extended schema for passing data through to database step
const DigestWithDataSchema = z.object({
  digest_path: z.string(),
  posts_processed: z.number(),
  claims_extracted: z.number(),
  date: z.string(),
  summaries_with_claims: z.array(PostWithClaimsSchema),
  all_claims: z.array(WorkflowClaimSchema),
});

// Step 1: Fetch Reddit content
const fetchContentStep = createStep({
  id: "fetch-content",
  inputSchema: DigestInputSchema,
  outputSchema: z.object({
    posts: z.array(FetchedPostSchema),
    date: z.string(),
  }),
  execute: async (context: { inputData?: { date?: string }; date?: string }) => {
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
  execute: async (context: { inputData?: { posts: z.infer<typeof FetchedPostSchema>[]; date: string }; posts?: z.infer<typeof FetchedPostSchema>[]; date?: string }) => {
    const input = context.inputData || context;
    const { posts, date } = input as { posts: z.infer<typeof FetchedPostSchema>[]; date: string };
    const config = loadConfig();
    const agent = getSummarizerAgent();

    console.log(`\nSummarizing ${posts.length} posts...`);
    const summaries: z.infer<typeof PostWithSummarySchema>[] = [];

    for (const { subreddit, data } of posts) {
      const { post, comments } = data;

      // Use diverse comment selection for better viewpoint representation
      const selectedComments = selectDiverseComments(comments, 10);

      // Detect controversy level for context
      const controversyResult = detectControversy(post, comments);
      const controversyHint = controversyResult.isControversial
        ? `\n\nNote: This appears to be a controversial discussion (score: ${Math.round(controversyResult.score * 100)}%). Please ensure balanced representation of viewpoints.`
        : "";

      // Fetch link content for link posts
      let linkContentText = "";
      if (isLinkPost(post)) {
        try {
          const linkContent = await fetchLinkContent(post.url, { timeout: 5000 });
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
  .map((c: z.infer<typeof RedditCommentSchema>) => `- u/${c.author} (${c.score} pts): ${c.body.slice(0, 500)}`)
  .join("\n")}${controversyHint}

Return a JSON response with: summary, notable_comments, sentiment, key_topics, confidence (0-1), controversy_level (none/low/medium/high), information_density (sparse/moderate/rich), and missing_context (array of strings).`;

      try {
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

        // Normalize summary to ensure all fields have values (Zod defaults are applied during parsing)
        const normalizedSummary = {
          summary: summary.summary,
          notable_comments: summary.notable_comments ?? [],
          sentiment: summary.sentiment ?? "neutral" as const,
          key_topics: summary.key_topics ?? [],
          confidence: summary.confidence ?? 0.7,
          controversy_level: summary.controversy_level ?? "none" as const,
          information_density: summary.information_density ?? "moderate" as const,
          missing_context: summary.missing_context ?? [],
        };

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
  execute: async (context: { inputData?: { summaries: z.infer<typeof PostWithSummarySchema>[]; date: string }; summaries?: z.infer<typeof PostWithSummarySchema>[]; date?: string }) => {
    const input = context.inputData || context;
    const { summaries, date } = input as { summaries: z.infer<typeof PostWithSummarySchema>[]; date: string };
    const config = loadConfig();
    const agent = getExtractorAgent();

    console.log(`\nExtracting claims from ${summaries.length} posts...`);
    const allClaims: z.infer<typeof WorkflowClaimSchema>[] = [];
    const summariesWithClaims: z.infer<typeof PostWithClaimsSchema>[] = [];

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
        const normalizedClaims = (extracted.claims || []).map((c: { subject: string; predicate: string; object: string; confidence?: number; source_stance?: string }) => ({
          subject: c.subject,
          predicate: c.predicate,
          object: c.object,
          confidence: c.confidence ?? 0.5,
          source_stance: c.source_stance ?? "neutral" as const,
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

// Step 4: Generate markdown and save
const generateDigestStep = createStep({
  id: "generate-digest",
  inputSchema: z.object({
    summaries_with_claims: z.array(PostWithClaimsSchema),
    all_claims: z.array(WorkflowClaimSchema),
    date: z.string(),
  }),
  outputSchema: DigestWithDataSchema,
  execute: async (context: { inputData?: z.infer<typeof DigestWithDataSchema>; summaries_with_claims?: z.infer<typeof PostWithClaimsSchema>[]; all_claims?: z.infer<typeof WorkflowClaimSchema>[]; date?: string }) => {
    const input = context.inputData || context;
    const { summaries_with_claims, all_claims, date } = input as z.infer<typeof DigestWithDataSchema>;
    const config = loadConfig();

    console.log(`\nGenerating digest for ${date}...`);

    // Group by subreddit
    const bySubreddit = new Map<string, z.infer<typeof PostWithClaimsSchema>[]>();
    for (const item of summaries_with_claims) {
      const list = bySubreddit.get(item.subreddit) || [];
      list.push(item);
      bySubreddit.set(item.subreddit, list);
    }

    // Generate markdown
    let markdown = `# My Slow News - ${date}\n\n`;
    markdown += `*Generated at ${new Date().toISOString()}*\n\n`;

    // Theme synthesis across posts (if enough posts)
    if (shouldSynthesizeThemes(summaries_with_claims.length)) {
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

    markdown += `---\n\n`;

    for (const [subreddit, items] of bySubreddit) {
      markdown += `## r/${subreddit}\n\n`;

      for (const item of items) {
        const { post, summary, claims } = item;

        markdown += `### [${post.title}](${post.permalink})\n\n`;

        // Build metadata line with quality indicators
        const confidencePct = Math.round((summary.confidence ?? 0.7) * 100);
        const controversyBadge = summary.controversy_level !== "none"
          ? ` | **Controversy:** ${summary.controversy_level}`
          : "";
        const densityIndicator = summary.information_density === "sparse" ? " ⚠️" : "";

        markdown += `**Author:** u/${post.author} | **Score:** ${post.score} | **Confidence:** ${confidencePct}%${controversyBadge}${densityIndicator}\n\n`;
        markdown += `${summary.summary}\n\n`;

        // Show missing context warnings
        if (summary.missing_context && summary.missing_context.length > 0) {
          markdown += `> **Note:** Missing context: ${summary.missing_context.join(", ")}\n\n`;
        }

        if (summary.notable_comments?.length > 0) {
          markdown += `**Notable Comments:**\n`;
          for (const comment of summary.notable_comments) {
            markdown += `- ${comment}\n`;
          }
          markdown += `\n`;
        }

        if (claims?.length > 0) {
          markdown += `**Claims Extracted:**\n`;
          for (const claim of claims) {
            markdown += `- \`(${claim.subject}, ${claim.predicate}, ${claim.object})\` - ${claim.source_stance} (${Math.round(claim.confidence * 100)}% confidence)\n`;
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
    };
  },
});

// Step 5: Save to database
const saveToDatabaseStep = createStep({
  id: "save-to-database",
  inputSchema: DigestWithDataSchema,
  outputSchema: DigestOutputSchema,
  execute: async (context: { inputData?: z.infer<typeof DigestWithDataSchema> } & Partial<z.infer<typeof DigestWithDataSchema>>) => {
    const input = context.inputData || context;
    const { summaries_with_claims, all_claims, date, digest_path } = input as z.infer<typeof DigestWithDataSchema>;
    console.log(`\nSaving to database...`);

    const config = loadConfig();
    let db;

    try {
      db = await getDb(config);
    } catch (error) {
      console.error("Failed to connect to database:", error);
      console.log("Skipping database persistence");
      return {
        digest_path: input.digest_path,
        posts_processed: input.posts_processed,
        claims_extracted: input.claims_extracted,
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

      // Save claims and create relationships
      for (const claim of all_claims) {
        // Skip invalid claims
        if (!claim.subject || !claim.predicate || !claim.object) {
          continue;
        }

        // Filter low-confidence claims
        if ((claim.confidence ?? 0) < 0.5) {
          continue;
        }

        // Upsert claim
        const claimResult = await db.query<any[][]>(
          `INSERT INTO claim (subject, predicate, object, confidence, extracted_at)
           VALUES ($subject, $predicate, $object, $confidence, time::now())
           ON DUPLICATE KEY UPDATE confidence = math::max([confidence, $confidence])`,
          {
            subject: claim.subject,
            predicate: claim.predicate,
            object: claim.object,
            confidence: claim.confidence ?? 0.5,
          }
        );

        const claimId = claimResult[0]?.[0]?.id;
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
      digest_path: input.digest_path,
      posts_processed: input.posts_processed,
      claims_extracted: input.claims_extracted,
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
  } catch (error: any) {
    // If the error is workflow-related, try extracting the actual result
    if (error?.result) {
      return error.result;
    }
    throw error;
  }
}
