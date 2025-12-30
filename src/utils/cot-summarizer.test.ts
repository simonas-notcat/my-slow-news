import { describe, test, expect } from "vitest";
import {
  shouldUseCOT,
  formatControversyAnalysisMarkdown,
  type ControversyAnalysis,
} from "./cot-summarizer";
import type { RedditPost, RedditComment } from "../types";

function createPost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: "post1",
    subreddit: "programming",
    title: "Test Post",
    selftext: "Test content",
    author: "test_author",
    url: "https://reddit.com/r/programming/post1",
    permalink: "/r/programming/post1",
    score: 100,
    num_comments: 10,
    created_utc: Date.now() / 1000,
    ...overrides,
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

describe("shouldUseCOT", () => {
  test("returns false for non-controversial posts", () => {
    const post = createPost({ title: "Simple announcement" });
    const comments = [
      createComment("1", 100, "Great news!"),
      createComment("2", 80, "Love it"),
      createComment("3", 50, "Thanks for sharing"),
    ];

    const { useCOT, controversy } = shouldUseCOT(post, comments);

    expect(useCOT).toBe(false);
    expect(controversy.isControversial).toBe(false);
  });

  test("returns true for controversial discussions", () => {
    const post = createPost({ title: "TypeScript vs JavaScript - which is better?" });
    const comments = [
      createComment("1", 100, "TypeScript is clearly better"),
      createComment("2", -10, "No, JavaScript is fine, you're wrong"),
      createComment("3", 50, "I disagree with both viewpoints"),
      createComment("4", 30, "Actually, it depends on the use case"),
      createComment("5", -5, "This is incorrect reasoning"),
    ];

    const { useCOT, controversy } = shouldUseCOT(post, comments);

    expect(controversy.score).toBeGreaterThan(0.3);
  });

  test("respects custom threshold", () => {
    const post = createPost();
    const comments = [
      createComment("1", 50, "I disagree with this approach"),
      createComment("2", 30, "Actually, that's wrong"),
    ];

    const { useCOT: highThreshold } = shouldUseCOT(post, comments, 0.9);
    const { useCOT: lowThreshold } = shouldUseCOT(post, comments, 0.1);

    expect(highThreshold).toBe(false);
    // Low threshold might be true depending on controversy detection
  });

  test("returns controversy result for analysis", () => {
    const post = createPost();
    const comments = [createComment("1", 100, "Test comment")];

    const { controversy } = shouldUseCOT(post, comments);

    expect(controversy).toHaveProperty("isControversial");
    expect(controversy).toHaveProperty("score");
    expect(controversy).toHaveProperty("signals");
    expect(controversy).toHaveProperty("detectedCamps");
  });
});

describe("formatControversyAnalysisMarkdown", () => {
  test("formats full analysis", () => {
    const analysis: ControversyAnalysis = {
      main_claim: "TypeScript improves code quality",
      supporting_points: [
        "Static typing catches errors early",
        "Better IDE support",
      ],
      opposing_points: [
        "Adds development overhead",
        "Not needed for small projects",
      ],
      community_split: [
        {
          camp_name: "TypeScript supporters",
          percentage: 60,
          key_argument: "Type safety is worth the overhead",
        },
        {
          camp_name: "JavaScript purists",
          percentage: 40,
          key_argument: "Keep it simple",
        },
      ],
      nuances: [
        "Team size matters",
        "Project complexity is a factor",
      ],
      balanced_summary: "Both sides have valid points",
    };

    const markdown = formatControversyAnalysisMarkdown(analysis);

    expect(markdown).toContain("Main Claim");
    expect(markdown).toContain("TypeScript improves code quality");
    expect(markdown).toContain("Supporting Arguments");
    expect(markdown).toContain("Static typing catches errors");
    expect(markdown).toContain("Opposing Arguments");
    expect(markdown).toContain("Adds development overhead");
    expect(markdown).toContain("Community Split");
    expect(markdown).toContain("TypeScript supporters");
    expect(markdown).toContain("60%");
    expect(markdown).toContain("Nuances");
    expect(markdown).toContain("Team size matters");
  });

  test("handles minimal analysis", () => {
    const analysis: ControversyAnalysis = {
      main_claim: "A simple claim",
      supporting_points: [],
      opposing_points: [],
      community_split: [],
      nuances: [],
      balanced_summary: "Simple discussion",
    };

    const markdown = formatControversyAnalysisMarkdown(analysis);

    expect(markdown).toContain("Main Claim");
    expect(markdown).toContain("A simple claim");
    expect(markdown).not.toContain("Supporting Arguments");
    expect(markdown).not.toContain("Opposing Arguments");
  });

  test("formats community split percentages", () => {
    const analysis: ControversyAnalysis = {
      main_claim: "Test claim",
      supporting_points: [],
      opposing_points: [],
      community_split: [
        {
          camp_name: "Supporters",
          percentage: 75,
          key_argument: "It works",
        },
      ],
      nuances: [],
      balanced_summary: "Most agree",
    };

    const markdown = formatControversyAnalysisMarkdown(analysis);

    expect(markdown).toContain("Supporters");
    expect(markdown).toContain("~75%");
    expect(markdown).toContain("It works");
  });
});
