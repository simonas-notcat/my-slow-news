/**
 * Thread Builder
 *
 * Builds hierarchical thread structures from flat comment lists,
 * enabling better understanding of conversation flow and argument development.
 */

import type { RedditComment } from "../types";

export interface ThreadNode {
  comment: RedditComment;
  children: ThreadNode[];
  depth: number;
  totalScore: number; // Sum of this + all child scores
  replyCount: number; // Total descendants
}

export interface ThreadSummary {
  rootId: string;
  rootAuthor: string;
  topic: string;
  participantCount: number;
  totalScore: number;
  maxDepth: number;
  formattedThread: string;
}

/**
 * Builds a tree structure from flat comments array
 */
export function buildThreadTree(comments: RedditComment[]): ThreadNode[] {
  const nodeMap = new Map<string, ThreadNode>();
  const roots: ThreadNode[] = [];

  // Create nodes for all comments
  for (const comment of comments) {
    nodeMap.set(comment.id, {
      comment,
      children: [],
      depth: 0,
      totalScore: comment.score,
      replyCount: 0,
    });
  }

  // Build parent-child relationships
  for (const comment of comments) {
    const node = nodeMap.get(comment.id)!;
    // parent_id format: t1_xxxxx for comments, t3_xxxxx for posts
    const parentId = comment.parent_id.replace(/^t[13]_/, "");

    if (nodeMap.has(parentId)) {
      // This is a reply to another comment
      const parentNode = nodeMap.get(parentId)!;
      parentNode.children.push(node);
      node.depth = parentNode.depth + 1;
    } else {
      // This is a top-level comment (reply to post)
      roots.push(node);
    }
  }

  // Calculate aggregate scores and reply counts
  function calculateAggregates(node: ThreadNode): {
    totalScore: number;
    replyCount: number;
  } {
    let totalScore = node.comment.score;
    let replyCount = node.children.length;

    for (const child of node.children) {
      const childAgg = calculateAggregates(child);
      totalScore += childAgg.totalScore;
      replyCount += childAgg.replyCount;
    }

    node.totalScore = totalScore;
    node.replyCount = replyCount;

    return { totalScore, replyCount };
  }

  for (const root of roots) {
    calculateAggregates(root);
  }

  return roots;
}

/**
 * Gets the most significant threads based on engagement
 */
export function getSignificantThreads(
  roots: ThreadNode[],
  options: {
    minTotalScore?: number;
    minReplyCount?: number;
    maxThreads?: number;
  } = {}
): ThreadNode[] {
  const { minTotalScore = 20, minReplyCount = 2, maxThreads = 5 } = options;

  // Filter threads meeting minimum criteria
  const significant = roots.filter(
    (node) =>
      node.totalScore >= minTotalScore || node.replyCount >= minReplyCount
  );

  // Sort by engagement (combination of score and replies)
  significant.sort((a, b) => {
    const aEngagement = a.totalScore + a.replyCount * 10;
    const bEngagement = b.totalScore + b.replyCount * 10;
    return bEngagement - aEngagement;
  });

  return significant.slice(0, maxThreads);
}

/**
 * Formats a thread for LLM processing, showing conversation structure
 */
export function formatThread(
  node: ThreadNode,
  options: { maxDepth?: number; maxLength?: number } = {}
): string {
  const { maxDepth = 4, maxLength = 300 } = options;
  const lines: string[] = [];

  function formatNode(n: ThreadNode, depth: number): void {
    if (depth > maxDepth) return;

    const indent = "  ".repeat(depth);
    const prefix = depth === 0 ? "[Parent]" : "[Reply]";
    const score = n.comment.score >= 0 ? `+${n.comment.score}` : n.comment.score;
    const body = n.comment.body.slice(0, maxLength);
    const truncated = n.comment.body.length > maxLength ? "..." : "";

    lines.push(
      `${indent}${prefix} u/${n.comment.author} (${score}): "${body}${truncated}"`
    );

    // Sort children by score for consistent output
    const sortedChildren = [...n.children].sort(
      (a, b) => b.comment.score - a.comment.score
    );
    for (const child of sortedChildren.slice(0, 3)) {
      // Max 3 replies per level
      formatNode(child, depth + 1);
    }
  }

  formatNode(node, 0);
  return lines.join("\n");
}

/**
 * Gets thread statistics for a comment tree
 */
export function getThreadStats(roots: ThreadNode[]): {
  totalThreads: number;
  avgDepth: number;
  maxDepth: number;
  totalParticipants: number;
  mostEngagedThread: { author: string; replyCount: number } | null;
} {
  if (roots.length === 0) {
    return {
      totalThreads: 0,
      avgDepth: 0,
      maxDepth: 0,
      totalParticipants: 0,
      mostEngagedThread: null,
    };
  }

  const participants = new Set<string>();
  let totalDepth = 0;
  let maxDepth = 0;
  let threadCount = 0;

  function traverse(node: ThreadNode): number {
    participants.add(node.comment.author);
    let maxChildDepth = 0;
    for (const child of node.children) {
      maxChildDepth = Math.max(maxChildDepth, traverse(child));
    }
    return maxChildDepth + 1;
  }

  for (const root of roots) {
    const depth = traverse(root);
    totalDepth += depth;
    maxDepth = Math.max(maxDepth, depth);
    threadCount++;
  }

  const mostEngaged = roots.reduce((best, current) =>
    current.replyCount > (best?.replyCount ?? 0) ? current : best
  );

  return {
    totalThreads: threadCount,
    avgDepth: totalDepth / threadCount,
    maxDepth,
    totalParticipants: participants.size,
    mostEngagedThread: mostEngaged
      ? {
          author: mostEngaged.comment.author,
          replyCount: mostEngaged.replyCount,
        }
      : null,
  };
}

/**
 * Flattens thread back to array while preserving order for display
 */
export function flattenThread(node: ThreadNode): RedditComment[] {
  const result: RedditComment[] = [node.comment];
  for (const child of node.children) {
    result.push(...flattenThread(child));
  }
  return result;
}
