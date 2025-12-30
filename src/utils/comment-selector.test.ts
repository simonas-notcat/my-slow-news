import { describe, test, expect } from "vitest";
import {
  selectDiverseComments,
  getCommentDiversityStats,
} from "./comment-selector";
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

describe("selectDiverseComments", () => {
  test("returns all comments when count exceeds available", () => {
    const comments = [
      createComment("1", 100, "A substantive comment with enough length to pass the filter"),
      createComment("2", 50, "Another good comment that provides valuable insight"),
    ];

    const result = selectDiverseComments(comments, 10);
    expect(result.length).toBe(2);
  });

  test("includes top-scored comments", () => {
    const comments = [
      createComment("1", 500, "Highest scored comment with plenty of substance here"),
      createComment("2", 100, "Medium scored comment with enough text to qualify"),
      createComment("3", 50, "Lower scored comment but still has meaningful content"),
      createComment("4", 10, "Lowest scored comment with sufficient body length"),
    ];

    const result = selectDiverseComments(comments, 2);
    expect(result.some((c) => c.id === "1")).toBe(true);
  });

  test("includes controversial comments when present", () => {
    const comments = [
      createComment("1", 500, "Great post, I totally agree with everything said here!"),
      createComment("2", 100, "This is a reasonable take on the subject matter."),
      createComment("3", 50, "I disagree - this is actually wrong because of XYZ reasons"),
      createComment("4", 10, "Just another comment without much controversy."),
    ];

    const result = selectDiverseComments(comments, 3);
    // Should include the controversial comment
    expect(result.some((c) => c.id === "3")).toBe(true);
  });

  test("includes most replied-to comments", () => {
    const comments = [
      createComment("1", 100, "Parent comment that starts a big discussion thread"),
      createComment("2", 200, "Reply to parent with valuable additional context", "t1_1"),
      createComment("3", 150, "Another reply to the parent comment with thoughts", "t1_1"),
      createComment("4", 50, "Third reply to the parent discussion starter", "t1_1"),
      createComment("5", 300, "Standalone comment with very high score points"),
    ];

    const result = selectDiverseComments(comments, 3);
    // Should include comment "1" which has the most replies
    expect(result.some((c) => c.id === "1")).toBe(true);
  });

  test("filters out short comments", () => {
    const comments = [
      createComment("1", 500, "Short"),
      createComment("2", 100, "This is a longer comment that provides enough context and value"),
    ];

    const result = selectDiverseComments(comments, 2, { minBodyLength: 50 });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("2");
  });

  test("filters out deleted authors", () => {
    const comments = [
      {
        ...createComment("1", 500, "A substantive comment with plenty of text"),
        author: "[deleted]",
      },
      createComment("2", 100, "This comment has a valid author and enough content"),
    ];

    const result = selectDiverseComments(comments, 2);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("2");
  });

  test("respects custom weights", () => {
    const comments = Array.from({ length: 20 }, (_, i) =>
      createComment(
        String(i),
        100 - i * 5,
        `Comment number ${i} with enough text to pass all the filtering requirements`
      )
    );

    // With 100% top-scored weight, should just get top by score
    const result = selectDiverseComments(comments, 5, {
      topScoredWeight: 1.0,
      repliedToWeight: 0,
      controversialWeight: 0,
      contrarianWeight: 0,
    });

    expect(result.map((c) => c.id)).toEqual(["0", "1", "2", "3", "4"]);
  });

  test("includes contrarian comments with lower scores", () => {
    const comments = [
      createComment("1", 500, "Highly popular opinion that everyone seems to agree with"),
      createComment("2", 400, "Another very popular take on the subject matter"),
      createComment("3", 300, "Popular consensus view with lots of upvotes"),
      createComment(
        "4",
        5,
        "This is a well-reasoned contrarian viewpoint that goes against the grain but makes valid points about the limitations of the popular approach"
      ),
    ];

    const result = selectDiverseComments(comments, 4);
    // Should include the contrarian comment despite low score
    expect(result.some((c) => c.id === "4")).toBe(true);
  });

  test("handles empty comments array", () => {
    const result = selectDiverseComments([], 5);
    expect(result).toEqual([]);
  });
});

describe("getCommentDiversityStats", () => {
  test("calculates correct stats", () => {
    const comments = [
      createComment("1", 100, "First comment"),
      createComment("2", 50, "Second comment"),
      createComment("3", 0, "I disagree with this take"),
    ];

    const stats = getCommentDiversityStats(comments);
    expect(stats.totalComments).toBe(3);
    expect(stats.scoreRange.min).toBe(0);
    expect(stats.scoreRange.max).toBe(100);
    expect(stats.controversialCount).toBe(1);
    expect(stats.avgBodyLength).toBeGreaterThan(0);
  });

  test("handles empty array", () => {
    const stats = getCommentDiversityStats([]);
    expect(stats.totalComments).toBe(0);
    expect(stats.scoreVariance).toBe(0);
  });
});
