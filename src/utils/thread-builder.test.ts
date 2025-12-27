import { describe, test, expect } from "bun:test";
import {
  buildThreadTree,
  getSignificantThreads,
  formatThread,
  getThreadStats,
  flattenThread,
} from "./thread-builder";
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

describe("buildThreadTree", () => {
  test("creates tree from flat comments", () => {
    const comments = [
      createComment("1", 100, "Parent comment"),
      createComment("2", 50, "Reply to parent", "t1_1"),
      createComment("3", 25, "Reply to reply", "t1_2"),
    ];

    const tree = buildThreadTree(comments);

    expect(tree.length).toBe(1); // One root
    expect(tree[0].comment.id).toBe("1");
    expect(tree[0].children.length).toBe(1);
    expect(tree[0].children[0].comment.id).toBe("2");
    expect(tree[0].children[0].children[0].comment.id).toBe("3");
  });

  test("handles multiple root comments", () => {
    const comments = [
      createComment("1", 100, "First root"),
      createComment("2", 80, "Second root"),
      createComment("3", 50, "Reply to first", "t1_1"),
    ];

    const tree = buildThreadTree(comments);

    expect(tree.length).toBe(2);
    expect(tree.find((n) => n.comment.id === "1")?.children.length).toBe(1);
    expect(tree.find((n) => n.comment.id === "2")?.children.length).toBe(0);
  });

  test("calculates aggregate scores", () => {
    const comments = [
      createComment("1", 100, "Parent"),
      createComment("2", 50, "Reply", "t1_1"),
      createComment("3", 25, "Nested reply", "t1_2"),
    ];

    const tree = buildThreadTree(comments);

    expect(tree[0].totalScore).toBe(175); // 100 + 50 + 25
    expect(tree[0].replyCount).toBe(2);
  });

  test("handles empty comments array", () => {
    const tree = buildThreadTree([]);
    expect(tree).toEqual([]);
  });
});

describe("getSignificantThreads", () => {
  test("filters by minimum score", () => {
    const comments = [
      createComment("1", 100, "High score thread"),
      createComment("2", 5, "Low score thread"),
    ];

    const tree = buildThreadTree(comments);
    const significant = getSignificantThreads(tree, { minTotalScore: 50 });

    expect(significant.length).toBe(1);
    expect(significant[0].comment.id).toBe("1");
  });

  test("filters by minimum reply count", () => {
    const comments = [
      createComment("1", 10, "Thread with replies"),
      createComment("2", 5, "Reply 1", "t1_1"),
      createComment("3", 5, "Reply 2", "t1_1"),
      createComment("4", 5, "Reply 3", "t1_1"),
      createComment("5", 50, "Thread without replies"),
    ];

    const tree = buildThreadTree(comments);
    const significant = getSignificantThreads(tree, {
      minTotalScore: 100,
      minReplyCount: 3,
    });

    expect(significant.length).toBe(1);
    expect(significant[0].comment.id).toBe("1");
  });

  test("limits number of threads", () => {
    const comments = [
      createComment("1", 100, "Thread 1"),
      createComment("2", 90, "Thread 2"),
      createComment("3", 80, "Thread 3"),
    ];

    const tree = buildThreadTree(comments);
    const significant = getSignificantThreads(tree, { maxThreads: 2 });

    expect(significant.length).toBe(2);
  });
});

describe("formatThread", () => {
  test("formats thread with indentation", () => {
    const comments = [
      createComment("1", 100, "Parent comment text"),
      createComment("2", 50, "Reply text", "t1_1"),
    ];

    const tree = buildThreadTree(comments);
    const formatted = formatThread(tree[0]);

    expect(formatted).toContain("[Parent]");
    expect(formatted).toContain("[Reply]");
    expect(formatted).toContain("u/user_1");
    expect(formatted).toContain("u/user_2");
  });

  test("respects max depth", () => {
    const comments = [
      createComment("1", 100, "Level 0"),
      createComment("2", 50, "Level 1", "t1_1"),
      createComment("3", 25, "Level 2", "t1_2"),
      createComment("4", 10, "Level 3", "t1_3"),
      createComment("5", 5, "Level 4", "t1_4"),
    ];

    const tree = buildThreadTree(comments);
    const formatted = formatThread(tree[0], { maxDepth: 2 });

    expect(formatted).toContain("user_1");
    expect(formatted).toContain("user_2");
    expect(formatted).toContain("user_3");
    expect(formatted).not.toContain("user_4");
  });

  test("truncates long comments", () => {
    const longBody = "x".repeat(500);
    const comments = [createComment("1", 100, longBody)];

    const tree = buildThreadTree(comments);
    const formatted = formatThread(tree[0], { maxLength: 100 });

    expect(formatted).toContain("...");
  });
});

describe("getThreadStats", () => {
  test("calculates correct stats", () => {
    const comments = [
      createComment("1", 100, "Thread 1"),
      createComment("2", 50, "Reply 1-1", "t1_1"),
      createComment("3", 25, "Reply 1-2", "t1_1"),
      createComment("4", 80, "Thread 2"),
    ];

    const tree = buildThreadTree(comments);
    const stats = getThreadStats(tree);

    expect(stats.totalThreads).toBe(2);
    expect(stats.totalParticipants).toBe(4);
    expect(stats.maxDepth).toBe(2);
  });

  test("handles empty tree", () => {
    const stats = getThreadStats([]);

    expect(stats.totalThreads).toBe(0);
    expect(stats.avgDepth).toBe(0);
  });
});

describe("flattenThread", () => {
  test("flattens nested thread", () => {
    const comments = [
      createComment("1", 100, "Parent"),
      createComment("2", 50, "Reply", "t1_1"),
      createComment("3", 25, "Nested", "t1_2"),
    ];

    const tree = buildThreadTree(comments);
    const flattened = flattenThread(tree[0]);

    expect(flattened.length).toBe(3);
    expect(flattened[0].id).toBe("1");
  });
});
