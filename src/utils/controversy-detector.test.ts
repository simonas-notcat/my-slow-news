import { describe, test, expect } from "vitest";
import {
  detectControversy,
  formatControversyReport,
} from "./controversy-detector";
import type { RedditPost, RedditComment } from "../types";

function createPost(title: string, selftext = ""): RedditPost {
  return {
    id: "post1",
    subreddit: "programming",
    title,
    selftext,
    author: "test_author",
    url: "https://reddit.com/r/programming/post1",
    permalink: "/r/programming/post1",
    score: 100,
    num_comments: 10,
    created_utc: Date.now() / 1000,
  };
}

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

describe("detectControversy", () => {
  test("detects low controversy for agreeable discussion", () => {
    const post = createPost("Great new feature announced");
    const comments = [
      createComment("1", 100, "This is amazing!"),
      createComment("2", 80, "Love it, great work!"),
      createComment("3", 50, "Can't wait to try this."),
    ];

    const result = detectControversy(post, comments);

    expect(result.isControversial).toBe(false);
    expect(result.score).toBeLessThan(0.4);
  });

  test("detects high controversy with opposing views", () => {
    const post = createPost("TypeScript vs JavaScript - which is better?");
    const comments = [
      createComment("1", 100, "TypeScript is clearly better for large projects"),
      createComment("2", -10, "Wrong! JavaScript is perfectly fine"),
      createComment("3", 50, "I disagree with both of you"),
      createComment("4", 30, "Actually, it depends on the use case"),
      createComment("5", -5, "This is incorrect reasoning"),
    ];

    const result = detectControversy(post, comments);

    expect(result.score).toBeGreaterThan(0.3);
    expect(result.signals.keywordHits.length).toBeGreaterThan(0);
  });

  test("detects controversy keywords", () => {
    const post = createPost("Hot take on programming languages");
    const comments = [
      createComment("1", 50, "I disagree with this take"),
      createComment("2", 30, "Actually, that's wrong because..."),
      createComment("3", 20, "Unpopular opinion: this is overrated"),
    ];

    const result = detectControversy(post, comments);

    expect(result.signals.keywordHits).toContain("disagree");
    expect(result.signals.keywordHits).toContain("wrong");
    expect(result.signals.keywordHits).toContain("unpopular opinion");
  });

  test("detects camps in language debates", () => {
    const post = createPost("Rust vs Go performance comparison");
    const comments = [
      createComment("1", 100, "Rust is faster for this use case"),
      createComment("2", 80, "Go is more practical for most teams"),
    ];

    const result = detectControversy(post, comments);

    expect(result.detectedCamps.length).toBeGreaterThan(0);
  });

  test("calculates negative ratio", () => {
    const post = createPost("Controversial opinion");
    const comments = [
      createComment("1", 100, "Popular opinion"),
      createComment("2", -10, "Downvoted opinion"),
      createComment("3", -5, "Another downvoted one"),
      createComment("4", 50, "Positive comment"),
    ];

    const result = detectControversy(post, comments);

    expect(result.signals.negativeRatio).toBe(0.5); // 2/4
  });

  test("handles empty comments", () => {
    const post = createPost("Post without comments");
    const result = detectControversy(post, []);

    expect(result.isControversial).toBe(false);
    expect(result.score).toBe(0);
  });
});

describe("formatControversyReport", () => {
  test("formats report correctly", () => {
    const result = {
      isControversial: true,
      score: 0.6,
      signals: {
        scoreVariance: 45.5,
        negativeRatio: 0.15,
        replyDepth: 4,
        keywordHits: ["disagree", "wrong"],
        sentimentMix: true,
      },
      detectedCamps: ["Rust advocates", "Go advocates"],
    };

    const report = formatControversyReport(result);

    expect(report).toContain("Controversy Score: 60%");
    expect(report).toContain("Is Controversial: true");
    expect(report).toContain("Score Variance: 45.5");
    expect(report).toContain("Rust advocates");
    expect(report).toContain("Go advocates");
  });
});
