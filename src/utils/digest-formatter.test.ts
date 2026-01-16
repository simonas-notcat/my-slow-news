import { describe, test, expect } from "vitest";
import {
  formatWhatMattersHeader,
  formatWhatMattersRow,
  formatWhatMattersTable,
  formatDiscussionHeader,
  formatStorySection,
  formatNotableThreads,
  formatHighConfidenceClaims,
  formatTopDiscussionPost,
  formatTopDiscussionsSection,
  formatPostSection,
  formatLowActivityPosts,
  formatDigestHeader,
  formatPostsBySubreddit,
  assembleDigest,
  determinePriority,
  truncateText,
  extractFirstSentence,
  createImpactSummary,
  PRIORITY_ICONS,
  THREAD_TYPE_ICONS,
  type WhatMattersItem,
  type TopDiscussionPost,
  type NotableThread,
  type FormattedClaim,
  type LowActivityPost,
  type FullPostSection,
  type DigestData,
} from "./digest-formatter";

describe("digest-formatter", () => {
  // ========================================================================
  // What Matters Section Tests
  // ========================================================================
  describe("formatWhatMattersHeader", () => {
    test("returns correct table header", () => {
      const header = formatWhatMattersHeader();
      expect(header).toContain("## What Matters");
      expect(header).toContain("| Topic | Impact | Status |");
      expect(header).toContain("|-------|--------|--------|");
    });
  });

  describe("formatWhatMattersRow", () => {
    test("formats urgent priority with red icon", () => {
      const item: WhatMattersItem = {
        priority: "urgent",
        topic: "Critical Bug",
        impact: "System crashes",
        status: "Being fixed",
      };
      const row = formatWhatMattersRow(item);
      expect(row).toContain("🔴");
      expect(row).toContain("**Critical Bug**");
      expect(row).toContain("System crashes");
      expect(row).toContain("Being fixed");
    });

    test("formats developing priority with yellow icon", () => {
      const item: WhatMattersItem = {
        priority: "developing",
        topic: "New Feature",
        impact: "Users requesting",
        status: "In progress",
      };
      const row = formatWhatMattersRow(item);
      expect(row).toContain("🟡");
      expect(row).toContain("**New Feature**");
    });

    test("formats informational priority with green icon", () => {
      const item: WhatMattersItem = {
        priority: "informational",
        topic: "Update Released",
        impact: "Minor improvements",
        status: "Complete",
      };
      const row = formatWhatMattersRow(item);
      expect(row).toContain("🟢");
      expect(row).toContain("**Update Released**");
    });

    test("escapes markdown characters in content", () => {
      const item: WhatMattersItem = {
        priority: "urgent",
        topic: "Bug with [brackets]",
        impact: "Affects <users>",
        status: "Testing",
      };
      const row = formatWhatMattersRow(item);
      expect(row).toContain("\\[brackets\\]");
      expect(row).toContain("&lt;users&gt;");
    });
  });

  describe("formatWhatMattersTable", () => {
    test("returns empty string for empty items", () => {
      expect(formatWhatMattersTable([])).toBe("");
    });

    test("formats complete table with legend", () => {
      const items: WhatMattersItem[] = [
        { priority: "urgent", topic: "Bug", impact: "Major", status: "Open" },
        { priority: "developing", topic: "Feature", impact: "Medium", status: "WIP" },
      ];
      const table = formatWhatMattersTable(items);
      expect(table).toContain("## What Matters");
      expect(table).toContain("🔴 **Bug**");
      expect(table).toContain("🟡 **Feature**");
      expect(table).toContain("**Note:** 🔴 Urgent • 🟡 Developing • 🟢 Informational");
      expect(table).toContain("---");
    });
  });

  // ========================================================================
  // Top Discussions Section Tests
  // ========================================================================
  describe("formatDiscussionHeader", () => {
    test("formats basic header", () => {
      const post: TopDiscussionPost = {
        title: "Test Post",
        url: "https://reddit.com/r/test/post",
        subreddit: "test",
        score: 100,
        confidence: 0.85,
      };
      const header = formatDiscussionHeader(post);
      expect(header).toContain("### [Test Post](https://reddit.com/r/test/post) • r/test");
      expect(header).toContain("**Score: 100 • Confidence: 85%**");
    });

    test("includes controversy level when present", () => {
      const post: TopDiscussionPost = {
        title: "Controversial Post",
        url: "https://reddit.com/r/test/post",
        subreddit: "test",
        score: 200,
        confidence: 0.75,
        controversyLevel: "high",
      };
      const header = formatDiscussionHeader(post);
      expect(header).toContain("Controversy: High");
    });

    test("excludes controversy when none", () => {
      const post: TopDiscussionPost = {
        title: "Normal Post",
        url: "https://reddit.com/r/test/post",
        subreddit: "test",
        score: 50,
        confidence: 0.9,
        controversyLevel: "none",
      };
      const header = formatDiscussionHeader(post);
      expect(header).not.toContain("Controversy");
    });
  });

  describe("formatStorySection", () => {
    test("returns empty string for empty narrative", () => {
      expect(formatStorySection("")).toBe("");
      expect(formatStorySection("   ")).toBe("");
    });

    test("formats narrative with heading", () => {
      const section = formatStorySection("This is the story of a bug fix.");
      expect(section).toContain("**The Story:**");
      expect(section).toContain("This is the story of a bug fix.");
    });
  });

  describe("formatNotableThreads", () => {
    test("returns empty string for empty threads", () => {
      expect(formatNotableThreads([])).toBe("");
    });

    test("formats threads with correct icons", () => {
      const threads: NotableThread[] = [
        { type: "debate", insight: "Users disagree on approach" },
        { type: "insight", insight: "Key discovery made" },
        { type: "technical", insight: "Deep dive into implementation" },
      ];
      const section = formatNotableThreads(threads);
      expect(section).toContain("**Notable Threads:**");
      expect(section).toContain("⚔️ Users disagree on approach");
      expect(section).toContain("💡 Key discovery made");
      expect(section).toContain("🔬 Deep dive into implementation");
    });
  });

  describe("formatHighConfidenceClaims", () => {
    test("returns empty string for empty claims", () => {
      expect(formatHighConfidenceClaims([])).toBe("");
    });

    test("formats verified claims with checkmark", () => {
      const claims: FormattedClaim[] = [
        { text: "Rust is memory safe", confidence: 0.95, isVerified: true },
      ];
      const section = formatHighConfidenceClaims(claims);
      expect(section).toContain("**High-Confidence Claims:**");
      expect(section).toContain("✓ Rust is memory safe (95%)");
    });

    test("formats unverified claims with question mark", () => {
      const claims: FormattedClaim[] = [
        { text: "Feature will be released soon", confidence: 0.7, isVerified: false },
      ];
      const section = formatHighConfidenceClaims(claims);
      expect(section).toContain("? Feature will be released soon (70%)");
    });
  });

  describe("formatTopDiscussionPost", () => {
    test("formats complete post with all sections", () => {
      const post: TopDiscussionPost = {
        title: "Major Update Released",
        url: "https://reddit.com/r/tech/post",
        subreddit: "tech",
        score: 500,
        confidence: 0.9,
        storyNarrative: "A major update was released today.",
        notableThreads: [{ type: "insight", insight: "Performance improved 2x" }],
        claims: [{ text: "Update improves speed", confidence: 0.92, isVerified: true }],
      };
      const section = formatTopDiscussionPost(post);
      expect(section).toContain("### [Major Update Released]");
      expect(section).toContain("**The Story:**");
      expect(section).toContain("**Notable Threads:**");
      expect(section).toContain("**High-Confidence Claims:**");
      expect(section).toContain("---");
    });
  });

  describe("formatTopDiscussionsSection", () => {
    test("returns empty string for empty posts", () => {
      expect(formatTopDiscussionsSection([])).toBe("");
    });

    test("formats section with header and posts", () => {
      const posts: TopDiscussionPost[] = [
        {
          title: "Post 1",
          url: "https://example.com/1",
          subreddit: "test",
          score: 100,
          confidence: 0.8,
        },
        {
          title: "Post 2",
          url: "https://example.com/2",
          subreddit: "test",
          score: 200,
          confidence: 0.9,
        },
      ];
      const section = formatTopDiscussionsSection(posts);
      expect(section).toContain("## Top Discussions");
      expect(section).toContain("Post 1");
      expect(section).toContain("Post 2");
    });
  });

  // ========================================================================
  // Per-Post Section Tests
  // ========================================================================
  describe("formatPostSection", () => {
    test("formats basic post section", () => {
      const post: FullPostSection = {
        title: "Test Post Title",
        url: "https://reddit.com/r/test/post",
        subreddit: "test",
        score: 150,
        commentCount: 45,
        confidence: 0.85,
        summary: "This is the post summary.",
      };
      const section = formatPostSection(post);
      expect(section).toContain("### [Test Post Title]");
      expect(section).toContain("{#test-post-title}");
      expect(section).toContain("**150↑** • 45 comments • 85% confidence");
      expect(section).toContain("This is the post summary.");
    });

    test("includes controversy badge for high controversy", () => {
      const post: FullPostSection = {
        title: "Controversial Topic",
        url: "https://example.com",
        subreddit: "test",
        score: 100,
        commentCount: 200,
        confidence: 0.7,
        controversyLevel: "high",
        summary: "Summary text.",
      };
      const section = formatPostSection(post);
      expect(section).toContain("⚠️ **Controversial**");
    });

    test("includes debate badge for medium controversy", () => {
      const post: FullPostSection = {
        title: "Debated Topic",
        url: "https://example.com",
        subreddit: "test",
        score: 100,
        commentCount: 100,
        confidence: 0.75,
        controversyLevel: "medium",
        summary: "Summary text.",
      };
      const section = formatPostSection(post);
      expect(section).toContain("⚡ Debate");
    });

    test("includes story with hook when provided", () => {
      const post: FullPostSection = {
        title: "Post with Story",
        url: "https://example.com",
        subreddit: "test",
        score: 200,
        commentCount: 50,
        confidence: 0.9,
        summary: "Summary.",
        storyNarrative: "Full story narrative here.",
        storyHook: "An unexpected discovery",
      };
      const section = formatPostSection(post);
      expect(section).toContain("**The Story:** *An unexpected discovery*");
      expect(section).toContain("Full story narrative here.");
    });

    test("shows missing context warning for low confidence", () => {
      const post: FullPostSection = {
        title: "Low Confidence Post",
        url: "https://example.com",
        subreddit: "test",
        score: 30,
        commentCount: 5,
        confidence: 0.5,
        summary: "Partial information.",
        missingContext: ["Source verification needed", "No official confirmation"],
      };
      const section = formatPostSection(post);
      expect(section).toContain("⚠️ **Missing context:**");
      expect(section).toContain("Source verification needed");
    });

    test("omits missing context for high confidence", () => {
      const post: FullPostSection = {
        title: "High Confidence Post",
        url: "https://example.com",
        subreddit: "test",
        score: 300,
        commentCount: 100,
        confidence: 0.9,
        summary: "Well-sourced information.",
        missingContext: ["Some context"],
      };
      const section = formatPostSection(post);
      expect(section).not.toContain("Missing context");
    });
  });

  // ========================================================================
  // Low-Activity Posts Tests
  // ========================================================================
  describe("formatLowActivityPosts", () => {
    test("returns empty string for empty posts", () => {
      expect(formatLowActivityPosts([])).toBe("");
    });

    test("formats single post correctly", () => {
      const posts: LowActivityPost[] = [
        {
          title: "Quiet Post",
          url: "https://example.com",
          subreddit: "test",
          score: 5,
          commentCount: 2,
        },
      ];
      const section = formatLowActivityPosts(posts);
      expect(section).toContain("## Low-Activity Posts");
      expect(section).toContain("<details>");
      expect(section).toContain("<summary>1 post with limited discussion</summary>");
      expect(section).toContain("</details>");
    });

    test("formats multiple posts with plural summary", () => {
      const posts: LowActivityPost[] = [
        {
          title: "Post 1",
          url: "https://example.com/1",
          subreddit: "test",
          score: 3,
          commentCount: 1,
        },
        {
          title: "Post 2",
          url: "https://example.com/2",
          subreddit: "other",
          score: 7,
          commentCount: 3,
        },
      ];
      const section = formatLowActivityPosts(posts);
      expect(section).toContain("<summary>2 posts with limited discussion</summary>");
    });

    test("includes confidence warning when present", () => {
      const posts: LowActivityPost[] = [
        {
          title: "Uncertain Post",
          url: "https://example.com",
          subreddit: "test",
          score: 10,
          commentCount: 2,
          confidenceWarning: "Low confidence (30%)",
        },
      ];
      const section = formatLowActivityPosts(posts);
      expect(section).toContain("⚠️ Low confidence (30%)");
    });

    test("includes description when provided", () => {
      const posts: LowActivityPost[] = [
        {
          title: "Described Post",
          url: "https://example.com",
          subreddit: "test",
          score: 8,
          commentCount: 4,
          description: "Brief summary of what this post is about.",
        },
      ];
      const section = formatLowActivityPosts(posts);
      expect(section).toContain("Brief summary of what this post is about.");
    });
  });

  // ========================================================================
  // Digest Assembly Tests
  // ========================================================================
  describe("formatDigestHeader", () => {
    test("formats header with date and stats", () => {
      const header = formatDigestHeader("2026-01-15", 10, 3, 25);
      expect(header).toContain("# My Slow News - 2026-01-15");
      expect(header).toContain("10 posts");
      expect(header).toContain("3 subreddits");
      expect(header).toContain("25 claims extracted");
    });
  });

  describe("formatPostsBySubreddit", () => {
    test("groups posts by subreddit", () => {
      const postsBySubreddit = new Map<string, FullPostSection[]>([
        [
          "programming",
          [
            {
              title: "Rust Post",
              url: "https://example.com/1",
              subreddit: "programming",
              score: 100,
              commentCount: 20,
              confidence: 0.8,
              summary: "About Rust.",
            },
          ],
        ],
        [
          "javascript",
          [
            {
              title: "JS Post",
              url: "https://example.com/2",
              subreddit: "javascript",
              score: 80,
              commentCount: 15,
              confidence: 0.85,
              summary: "About JS.",
            },
          ],
        ],
      ]);
      const output = formatPostsBySubreddit(postsBySubreddit);
      expect(output).toContain("## r/programming");
      expect(output).toContain("## r/javascript");
      expect(output).toContain("Rust Post");
      expect(output).toContain("JS Post");
    });
  });

  describe("assembleDigest", () => {
    test("assembles complete digest", () => {
      const data: DigestData = {
        date: "2026-01-15",
        postCount: 5,
        subredditCount: 2,
        claimCount: 12,
        whatMatters: [
          { priority: "urgent", topic: "Bug Found", impact: "Major issue", status: "Open" },
        ],
        topDiscussions: [
          {
            title: "Important Discussion",
            url: "https://example.com",
            subreddit: "test",
            score: 200,
            confidence: 0.9,
          },
        ],
        postsBySubreddit: new Map([
          [
            "test",
            [
              {
                title: "Test Post",
                url: "https://example.com",
                subreddit: "test",
                score: 100,
                commentCount: 30,
                confidence: 0.85,
                summary: "Test summary.",
              },
            ],
          ],
        ]),
        lowActivityPosts: [
          {
            title: "Quiet Post",
            url: "https://example.com/quiet",
            subreddit: "other",
            score: 5,
            commentCount: 2,
          },
        ],
      };

      const digest = assembleDigest(data);
      expect(digest).toContain("# My Slow News - 2026-01-15");
      expect(digest).toContain("## What Matters");
      expect(digest).toContain("🔴 **Bug Found**");
      expect(digest).toContain("## Top Discussions");
      expect(digest).toContain("## r/test");
      expect(digest).toContain("## Low-Activity Posts");
    });

    test("includes optional theme synthesis", () => {
      const data: DigestData = {
        date: "2026-01-15",
        postCount: 3,
        subredditCount: 1,
        claimCount: 5,
        whatMatters: [],
        topDiscussions: [],
        postsBySubreddit: new Map(),
        lowActivityPosts: [],
        themeSynthesis: "## Emerging Themes\n\nSome themes here.\n\n",
      };

      const digest = assembleDigest(data);
      expect(digest).toContain("## Emerging Themes");
    });
  });

  // ========================================================================
  // Utility Functions Tests
  // ========================================================================
  describe("determinePriority", () => {
    test("returns urgent for high importance score", () => {
      expect(determinePriority(75)).toBe("urgent");
      expect(determinePriority(70)).toBe("urgent");
    });

    test("returns urgent for high controversy", () => {
      expect(determinePriority(50, "high")).toBe("urgent");
    });

    test("returns urgent for negative sentiment", () => {
      expect(determinePriority(50, "none", "negative")).toBe("urgent");
    });

    test("returns developing for medium importance", () => {
      expect(determinePriority(50)).toBe("developing");
      expect(determinePriority(45)).toBe("developing");
    });

    test("returns developing for medium controversy", () => {
      expect(determinePriority(30, "medium")).toBe("developing");
    });

    test("returns informational for low importance", () => {
      expect(determinePriority(30)).toBe("informational");
      expect(determinePriority(44)).toBe("informational");
    });
  });

  describe("truncateText", () => {
    test("returns original text if within limit", () => {
      expect(truncateText("Short text", 20)).toBe("Short text");
    });

    test("truncates text with ellipsis", () => {
      const result = truncateText("This is a longer text that needs truncation", 20);
      expect(result).toBe("This is a longer ...");
      expect(result.length).toBe(20);
    });
  });

  describe("extractFirstSentence", () => {
    test("extracts sentence ending with period", () => {
      expect(extractFirstSentence("First sentence. Second sentence.")).toBe("First sentence.");
    });

    test("extracts sentence ending with exclamation", () => {
      expect(extractFirstSentence("Breaking news! More details.")).toBe("Breaking news!");
    });

    test("extracts sentence ending with question mark", () => {
      expect(extractFirstSentence("What happened? Let me explain.")).toBe("What happened?");
    });

    test("returns full text if no sentence end found", () => {
      expect(extractFirstSentence("No sentence ending")).toBe("No sentence ending");
    });
  });

  describe("createImpactSummary", () => {
    test("creates short impact from long summary", () => {
      const summary = "This is a very long summary that goes into great detail about many things that happened during the event.";
      const impact = createImpactSummary(summary, 40);
      expect(impact.length).toBeLessThanOrEqual(40);
      expect(impact).toContain("...");
    });

    test("preserves short summaries", () => {
      const summary = "Short summary.";
      const impact = createImpactSummary(summary);
      expect(impact).toBe("Short summary.");
    });
  });

  // ========================================================================
  // Constants Tests
  // ========================================================================
  describe("constants", () => {
    test("PRIORITY_ICONS has all priorities", () => {
      expect(PRIORITY_ICONS.urgent).toBe("🔴");
      expect(PRIORITY_ICONS.developing).toBe("🟡");
      expect(PRIORITY_ICONS.informational).toBe("🟢");
    });

    test("THREAD_TYPE_ICONS has all types", () => {
      expect(THREAD_TYPE_ICONS.debate).toBe("⚔️");
      expect(THREAD_TYPE_ICONS.insight).toBe("💡");
      expect(THREAD_TYPE_ICONS.story).toBe("📖");
      expect(THREAD_TYPE_ICONS.warning).toBe("✋");
      expect(THREAD_TYPE_ICONS.tangent).toBe("🔀");
      expect(THREAD_TYPE_ICONS.technical).toBe("🔬");
    });
  });
});
