import { describe, test, expect } from "vitest";
import {
  shouldUseHierarchical,
  formatThreadSummariesForDigest,
  type HierarchicalSummaryResult,
} from "./hierarchical-summarizer";
import type { RedditComment } from "../types";

function createComment(
  id: string,
  score: number,
  body: string,
  parentId = "t3_post1"
): RedditComment {
  return {
    id,
    post_id: "post1",
    author: `user_${id}`,
    body,
    score,
    parent_id: parentId,
    created_utc: Date.now() / 1000,
  };
}

describe("shouldUseHierarchical", () => {
  test("returns false for few comments", () => {
    const comments = Array.from({ length: 10 }, (_, i) =>
      createComment(String(i), 10, "Comment")
    );

    expect(shouldUseHierarchical(comments)).toBe(false);
  });

  test("returns false for flat discussions below threshold", () => {
    // 19 comments (below default threshold of 20)
    const comments = Array.from({ length: 19 }, (_, i) =>
      createComment(String(i), 10, "Comment")
    );

    expect(shouldUseHierarchical(comments)).toBe(false);
  });

  test("returns true for deep threads", () => {
    // Create a chain of replies
    const comments = [
      createComment("1", 100, "Root comment"),
      createComment("2", 80, "Reply 1", "t1_1"),
      createComment("3", 60, "Reply 2", "t1_2"),
      createComment("4", 40, "Reply 3", "t1_3"),
    ];

    // Add more root comments to meet threshold
    for (let i = 5; i <= 25; i++) {
      comments.push(createComment(String(i), 10, "Filler comment"));
    }

    expect(shouldUseHierarchical(comments)).toBe(true);
  });

  test("returns true for many unique participants", () => {
    // 25 comments from 15 unique authors
    const comments: RedditComment[] = [];
    for (let i = 0; i < 25; i++) {
      comments.push({
        id: String(i),
        post_id: "post1",
        author: `user_${i % 15}`, // 15 unique authors
        body: "Comment",
        score: 10,
        parent_id: "t3_post1",
        created_utc: Date.now() / 1000,
      });
    }

    expect(shouldUseHierarchical(comments)).toBe(true);
  });

  test("respects custom threshold", () => {
    const comments = Array.from({ length: 15 }, (_, i) =>
      createComment(String(i), 10, "Comment")
    );

    expect(shouldUseHierarchical(comments, 10)).toBe(true);
    expect(shouldUseHierarchical(comments, 20)).toBe(false);
  });
});

describe("formatThreadSummariesForDigest", () => {
  test("formats non-hierarchical result", () => {
    const result: HierarchicalSummaryResult = {
      usedHierarchical: false,
      threadSummaries: [],
      synthesizedSummary: "Simple summary text",
      stats: {
        totalThreads: 0,
        significantThreads: 0,
        maxDepth: 1,
        participants: 5,
      },
    };

    const formatted = formatThreadSummariesForDigest(result);

    expect(formatted).toBe("Simple summary text");
  });

  test("formats hierarchical result with threads", () => {
    const result: HierarchicalSummaryResult = {
      usedHierarchical: true,
      threadSummaries: [
        {
          threadId: "1",
          author: "expert_dev",
          summary: "Discussion about performance optimization",
          participants: 5,
          sentiment: "positive",
        },
        {
          threadId: "2",
          author: "skeptic",
          summary: "Concerns about complexity",
          participants: 3,
          sentiment: "negative",
        },
      ],
      synthesizedSummary: "Overall synthesis of the discussion",
      stats: {
        totalThreads: 10,
        significantThreads: 2,
        maxDepth: 4,
        participants: 15,
      },
    };

    const formatted = formatThreadSummariesForDigest(result);

    expect(formatted).toContain("Overall synthesis");
    expect(formatted).toContain("Key Discussion Threads");
    expect(formatted).toContain("u/expert_dev");
    expect(formatted).toContain("5 participants");
    expect(formatted).toContain("u/skeptic");
  });

  test("handles empty thread summaries in hierarchical mode", () => {
    const result: HierarchicalSummaryResult = {
      usedHierarchical: true,
      threadSummaries: [],
      synthesizedSummary: "Just the synthesis",
      stats: {
        totalThreads: 0,
        significantThreads: 0,
        maxDepth: 1,
        participants: 5,
      },
    };

    const formatted = formatThreadSummariesForDigest(result);

    expect(formatted).toBe("Just the synthesis");
    expect(formatted).not.toContain("Key Discussion Threads");
  });
});
