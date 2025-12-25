import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { loadConfig } from "../config";
import { getSummarizerAgent, getExtractorAgent } from "../mastra";
import { fetchTopPostsWithComments, type PostWithComments } from "../reddit";
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

// Extended schema for passing data through to database step
const DigestWithDataSchema = z.object({
  digest_path: z.string(),
  posts_processed: z.number(),
  claims_extracted: z.number(),
  date: z.string(),
  summaries_with_claims: z.array(z.any()),
  all_claims: z.array(z.any()),
});

// Step 1: Fetch Reddit content
const fetchContentStep = createStep({
  id: "fetch-content",
  inputSchema: DigestInputSchema,
  outputSchema: z.object({
    posts: z.array(z.any()),
    date: z.string(),
  }),
  execute: async ({ inputData }) => {
    const config = loadConfig();
    const date = inputData.date || new Date().toISOString().split("T")[0];

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
    posts: z.array(z.any()),
    date: z.string(),
  }),
  outputSchema: z.object({
    summaries: z.array(z.any()),
    date: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { posts, date } = inputData;
    const config = loadConfig();
    const agent = getSummarizerAgent();

    console.log(`\nSummarizing ${posts.length} posts...`);
    const summaries: Array<{
      subreddit: string;
      post: any;
      summary: any;
    }> = [];

    for (const { subreddit, data } of posts) {
      const { post, comments } = data;

      const prompt = `Summarize this Reddit post and its comments:

Title: ${post.title}
Author: u/${post.author}
Score: ${post.score} upvotes
URL: ${post.permalink}

Content:
${post.selftext || "(Link post - no text content)"}

Top Comments (${comments.length} total):
${comments
  .slice(0, 10)
  .map((c: any) => `- u/${c.author} (${c.score} pts): ${c.body.slice(0, 300)}`)
  .join("\n")}

Provide a JSON response with summary, notable_comments, sentiment, and key_topics.`;

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

        const text = typeof result === "string" ? result : result.text;

        // Record actual usage (estimate output tokens from response)
        recordUsage(inputTokens, estimateTokens(text));

        // Parse and validate JSON using robust parser
        const fallback: SummaryResponse = {
          summary: text,
          notable_comments: [],
          sentiment: "neutral",
          key_topics: [],
        };

        const { data: summary, success, error } = parseLLMJson(
          text,
          SummaryResponseSchema,
          fallback
        );

        if (!success) {
          console.warn(`JSON parse warning for post ${post.id}: ${error}`);
        }

        summaries.push({
          subreddit,
          post,
          summary,
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
          summary: {
            summary: "Failed to summarize",
            notable_comments: [],
            sentiment: "neutral" as const,
            key_topics: [],
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
    summaries: z.array(z.any()),
    date: z.string(),
  }),
  outputSchema: z.object({
    summaries_with_claims: z.array(z.any()),
    all_claims: z.array(z.any()),
    date: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { summaries, date } = inputData;
    const config = loadConfig();
    const agent = getExtractorAgent();

    console.log(`\nExtracting claims from ${summaries.length} posts...`);
    const allClaims: any[] = [];
    const summariesWithClaims = [];

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

        const text = typeof result === "string" ? result : result.text;

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

        summariesWithClaims.push({
          ...item,
          claims: extracted.claims,
          commenter_stances: extracted.commenter_stances,
        });

        if (extracted.claims) {
          allClaims.push(...extracted.claims);
        }
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
    summaries_with_claims: z.array(z.any()),
    all_claims: z.array(z.any()),
    date: z.string(),
  }),
  outputSchema: DigestWithDataSchema,
  execute: async ({ inputData }) => {
    const { summaries_with_claims, all_claims, date } = inputData;
    const config = loadConfig();

    console.log(`\nGenerating digest for ${date}...`);

    // Group by subreddit
    const bySubreddit = new Map<string, any[]>();
    for (const item of summaries_with_claims) {
      const list = bySubreddit.get(item.subreddit) || [];
      list.push(item);
      bySubreddit.set(item.subreddit, list);
    }

    // Generate markdown
    let markdown = `# My Slow News - ${date}\n\n`;
    markdown += `*Generated at ${new Date().toISOString()}*\n\n`;
    markdown += `---\n\n`;

    for (const [subreddit, items] of bySubreddit) {
      markdown += `## r/${subreddit}\n\n`;

      for (const item of items) {
        const { post, summary, claims } = item;

        markdown += `### [${post.title}](${post.permalink})\n\n`;
        markdown += `**Author:** u/${post.author} | **Score:** ${post.score}\n\n`;
        markdown += `${summary.summary}\n\n`;

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
  execute: async ({ inputData }) => {
    const { summaries_with_claims, all_claims, date, digest_path } = inputData;
    console.log(`\nSaving to database...`);

    const config = loadConfig();
    let db;

    try {
      db = await getDb(config);
    } catch (error) {
      console.error("Failed to connect to database:", error);
      console.log("Skipping database persistence");
      return {
        digest_path: inputData.digest_path,
        posts_processed: inputData.posts_processed,
        claims_extracted: inputData.claims_extracted,
      };
    }

    try {
      // Use a transaction for atomicity
      await db.query("BEGIN TRANSACTION");

      const savedPostIds: string[] = [];
      const savedClaimIds: string[] = [];

      // Save posts and their comments
      for (const item of summaries_with_claims) {
        const { post, subreddit } = item;

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
            created_at: new Date(post.created_utc * 1000).toISOString(),
          }
        );

        const postId = postResult[0]?.[0]?.id;
        if (postId) {
          savedPostIds.push(postId);
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
           ON DUPLICATE KEY UPDATE confidence = math::max(confidence, $confidence)`,
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
          date: new Date(date).toISOString(),
          file_path: digest_path,
          posts: savedPostIds,
          claims: savedClaimIds,
        }
      );

      await db.query("COMMIT TRANSACTION");

      console.log(`Saved ${savedPostIds.length} posts and ${savedClaimIds.length} claims to database`);
    } catch (error) {
      // Rollback on error
      await db.query("CANCEL TRANSACTION").catch(() => {});
      console.error("Database save failed, transaction rolled back:", error);
    } finally {
      await closeDb();
    }

    return {
      digest_path: inputData.digest_path,
      posts_processed: inputData.posts_processed,
      claims_extracted: inputData.claims_extracted,
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
  const result = await (digestWorkflow as any).execute({
    inputData: { date },
  });

  return result;
}
