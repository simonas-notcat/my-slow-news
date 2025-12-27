/**
 * Hierarchical Summarizer
 *
 * For posts with many comments, this module provides multi-stage summarization
 * that preserves thread context and argument development.
 */

import type { Agent } from "@mastra/core/agent";
import type { RedditPost, RedditComment } from "../types";
import {
  buildThreadTree,
  getSignificantThreads,
  formatThread,
  getThreadStats,
  type ThreadNode,
} from "./thread-builder";

export interface ThreadSummaryResult {
  threadId: string;
  author: string;
  summary: string;
  participants: number;
  sentiment: string;
}

export interface HierarchicalSummaryResult {
  usedHierarchical: boolean;
  threadSummaries: ThreadSummaryResult[];
  synthesizedSummary: string;
  stats: {
    totalThreads: number;
    significantThreads: number;
    maxDepth: number;
    participants: number;
  };
}

/**
 * Determines if hierarchical summarization should be used
 */
export function shouldUseHierarchical(
  comments: RedditComment[],
  threshold = 20
): boolean {
  if (comments.length < threshold) return false;

  const tree = buildThreadTree(comments);
  const stats = getThreadStats(tree);

  // Use hierarchical if there are deep conversations or many participants
  return stats.maxDepth >= 3 || stats.totalParticipants >= 10;
}

/**
 * Summarizes a single thread
 */
export async function summarizeThread(
  agent: Agent,
  thread: ThreadNode,
  postTitle: string
): Promise<ThreadSummaryResult> {
  const formattedThread = formatThread(thread, { maxDepth: 4, maxLength: 400 });

  const prompt = `Summarize this comment thread from a Reddit post titled "${postTitle}":

${formattedThread}

In 2-3 sentences, capture:
1. The main point or argument
2. Key agreements or disagreements
3. The overall sentiment

Respond with just the summary text, no JSON needed.`;

  try {
    const result = await agent.generate(prompt);
    const summary = typeof result === "string" ? result : result.text;

    // Count unique participants
    const participants = new Set<string>();
    function countParticipants(node: ThreadNode) {
      participants.add(node.comment.author);
      node.children.forEach(countParticipants);
    }
    countParticipants(thread);

    return {
      threadId: thread.comment.id,
      author: thread.comment.author,
      summary: summary.trim(),
      participants: participants.size,
      sentiment: thread.totalScore > 50 ? "positive" : thread.totalScore < 0 ? "negative" : "mixed",
    };
  } catch (error) {
    return {
      threadId: thread.comment.id,
      author: thread.comment.author,
      summary: `Thread by u/${thread.comment.author} with ${thread.replyCount} replies`,
      participants: 1,
      sentiment: "unknown",
    };
  }
}

/**
 * Synthesizes multiple thread summaries into a coherent narrative
 */
export async function synthesizeThreadSummaries(
  agent: Agent,
  post: RedditPost,
  threadSummaries: ThreadSummaryResult[],
  totalComments: number
): Promise<string> {
  if (threadSummaries.length === 0) {
    return "No significant discussion threads found.";
  }

  const summariesText = threadSummaries
    .map(
      (t, i) =>
        `Thread ${i + 1} (by u/${t.author}, ${t.participants} participants, ${t.sentiment} sentiment):\n${t.summary}`
    )
    .join("\n\n");

  const prompt = `Given these summaries of the main discussion threads for the Reddit post "${post.title}":

${summariesText}

Total comments: ${totalComments}

Write a 2-3 paragraph synthesis that:
1. Captures the main topics discussed
2. Highlights areas of agreement and disagreement
3. Notes the overall community sentiment

Respond with just the synthesis text.`;

  try {
    const result = await agent.generate(prompt);
    const text = typeof result === "string" ? result : result.text;
    return text.trim();
  } catch {
    return threadSummaries.map((t) => t.summary).join(" ");
  }
}

/**
 * Performs hierarchical summarization for posts with many comments
 */
export async function hierarchicalSummarize(
  agent: Agent,
  post: RedditPost,
  comments: RedditComment[]
): Promise<HierarchicalSummaryResult> {
  // Build thread tree
  const tree = buildThreadTree(comments);
  const stats = getThreadStats(tree);

  // Get significant threads
  const significantThreads = getSignificantThreads(tree, {
    minTotalScore: 20,
    minReplyCount: 2,
    maxThreads: 5,
  });

  // Summarize each significant thread
  const threadSummaries: ThreadSummaryResult[] = [];
  for (const thread of significantThreads) {
    const summary = await summarizeThread(agent, thread, post.title);
    threadSummaries.push(summary);
  }

  // Synthesize into final summary
  const synthesizedSummary = await synthesizeThreadSummaries(
    agent,
    post,
    threadSummaries,
    comments.length
  );

  return {
    usedHierarchical: true,
    threadSummaries,
    synthesizedSummary,
    stats: {
      totalThreads: stats.totalThreads,
      significantThreads: significantThreads.length,
      maxDepth: stats.maxDepth,
      participants: stats.totalParticipants,
    },
  };
}

/**
 * Formats thread summaries for inclusion in the final digest
 */
export function formatThreadSummariesForDigest(
  result: HierarchicalSummaryResult
): string {
  if (!result.usedHierarchical || result.threadSummaries.length === 0) {
    return result.synthesizedSummary;
  }

  let output = result.synthesizedSummary + "\n\n";
  output += "**Key Discussion Threads:**\n";

  for (const thread of result.threadSummaries) {
    output += `- *u/${thread.author}* (${thread.participants} participants): ${thread.summary}\n`;
  }

  return output;
}
