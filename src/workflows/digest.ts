import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { loadConfig } from "../config";
import { getSummarizerAgent, getExtractorAgent } from "../mastra";
import { fetchTopPostsWithComments, type PostWithComments } from "../reddit";
import { getDb, closeDb } from "../db";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

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
        const result = await agent.generate(prompt);
        const text = typeof result === "string" ? result : result.text;

        // Try to parse JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const summary = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text };

        summaries.push({
          subreddit,
          post,
          summary,
        });
      } catch (error) {
        console.error(`Error summarizing post ${post.id}:`, error);
        summaries.push({
          subreddit,
          post,
          summary: { summary: "Failed to summarize", error: String(error) },
        });
      }
    }

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
        const result = await agent.generate(prompt);
        const text = typeof result === "string" ? result : result.text;

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const extracted = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : { claims: [], commenter_stances: {} };

        summariesWithClaims.push({
          ...item,
          claims: extracted.claims || [],
          commenter_stances: extracted.commenter_stances || {},
        });

        allClaims.push(...(extracted.claims || []));
      } catch (error) {
        console.error(`Error extracting claims from ${post.id}:`, error);
        summariesWithClaims.push({
          ...item,
          claims: [],
          commenter_stances: {},
        });
      }
    }

    console.log(`Extracted ${allClaims.length} claims total`);
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
  outputSchema: DigestOutputSchema,
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
    };
  },
});

// Step 5: Save to database
const saveToDatabaseStep = createStep({
  id: "save-to-database",
  inputSchema: DigestOutputSchema,
  outputSchema: DigestOutputSchema,
  execute: async ({ inputData }) => {
    console.log(`\nSaving to database...`);

    // Database persistence would go here
    // For MVP, we just log success
    console.log(`Database save skipped (not implemented yet)`);

    return inputData;
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
  const result = await digestWorkflow.start({
    inputData: { date },
  });

  return result;
}
