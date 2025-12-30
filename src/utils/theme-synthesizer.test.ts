import { describe, test, expect } from "vitest";
import {
  clusterByTopics,
  detectPotentialConflicts,
  formatThemeSynthesisMarkdown,
  shouldSynthesizeThemes,
  type PostSummaryInput,
} from "./theme-synthesizer";

function createSummary(overrides: Partial<PostSummaryInput> = {}): PostSummaryInput {
  return {
    subreddit: "programming",
    title: "Test Post",
    summary: "This is a test summary",
    sentiment: "neutral",
    key_topics: ["testing"],
    ...overrides,
  };
}

describe("clusterByTopics", () => {
  test("groups posts by shared topics", () => {
    const summaries = [
      createSummary({ title: "Rust is great", key_topics: ["rust", "performance"] }),
      createSummary({ title: "Go vs Rust", key_topics: ["rust", "go"] }),
      createSummary({ title: "Python news", key_topics: ["python"] }),
    ];

    const clusters = clusterByTopics(summaries);

    expect(clusters.has("rust")).toBe(true);
    expect(clusters.get("rust")?.length).toBe(2);
    expect(clusters.has("python")).toBe(false); // Only 1 post, not significant
  });

  test("returns empty map for single posts per topic", () => {
    const summaries = [
      createSummary({ key_topics: ["topic1"] }),
      createSummary({ key_topics: ["topic2"] }),
      createSummary({ key_topics: ["topic3"] }),
    ];

    const clusters = clusterByTopics(summaries);

    expect(clusters.size).toBe(0);
  });

  test("normalizes topic names", () => {
    const summaries = [
      createSummary({ key_topics: ["TypeScript"] }),
      createSummary({ key_topics: ["typescript"] }),
    ];

    const clusters = clusterByTopics(summaries);

    expect(clusters.has("typescript")).toBe(true);
    expect(clusters.get("typescript")?.length).toBe(2);
  });
});

describe("detectPotentialConflicts", () => {
  test("detects conflicting sentiments on same topic", () => {
    const summaries = [
      createSummary({
        title: "TypeScript is great",
        key_topics: ["typescript"],
        sentiment: "positive",
      }),
      createSummary({
        title: "TypeScript problems",
        key_topics: ["typescript"],
        sentiment: "negative",
      }),
    ];

    const conflicts = detectPotentialConflicts(summaries);

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].topic).toBe("typescript");
  });

  test("detects controversial discussions", () => {
    const summaries = [
      createSummary({
        title: "Hot take on X",
        key_topics: ["programming"],
        controversy_level: "high",
      }),
      createSummary({
        title: "More on X",
        key_topics: ["programming"],
        controversy_level: "low",
      }),
    ];

    const conflicts = detectPotentialConflicts(summaries);

    expect(conflicts.length).toBeGreaterThan(0);
  });

  test("returns empty for agreeable posts", () => {
    const summaries = [
      createSummary({ key_topics: ["rust"], sentiment: "positive" }),
      createSummary({ key_topics: ["rust"], sentiment: "positive" }),
    ];

    const conflicts = detectPotentialConflicts(summaries);

    expect(conflicts.length).toBe(0);
  });
});

describe("formatThemeSynthesisMarkdown", () => {
  test("formats themes correctly", () => {
    const synthesis = {
      recurring_themes: [
        {
          theme: "Rust Adoption",
          posts: ["Post 1", "Post 2"],
          summary: "Growing interest in Rust",
        },
      ],
      conflicting_viewpoints: [],
      emerging_trends: [],
    };

    const markdown = formatThemeSynthesisMarkdown(synthesis);

    expect(markdown).toContain("Today's Themes");
    expect(markdown).toContain("Rust Adoption");
    expect(markdown).toContain("Post 1");
  });

  test("formats conflicting viewpoints", () => {
    const synthesis = {
      recurring_themes: [],
      conflicting_viewpoints: [
        {
          topic: "TypeScript",
          viewpoint_a: {
            position: "Types improve code quality",
            sources: ["Post 1"],
          },
          viewpoint_b: {
            position: "Types add overhead",
            sources: ["Post 2"],
          },
        },
      ],
      emerging_trends: [],
    };

    const markdown = formatThemeSynthesisMarkdown(synthesis);

    expect(markdown).toContain("Conflicting Viewpoints");
    expect(markdown).toContain("TypeScript");
    expect(markdown).toContain("View A");
    expect(markdown).toContain("View B");
  });

  test("formats emerging trends", () => {
    const synthesis = {
      recurring_themes: [],
      conflicting_viewpoints: [],
      emerging_trends: [
        {
          trend: "AI Code Assistants",
          evidence: ["Multiple posts discussing Copilot"],
          confidence: 0.8,
        },
      ],
    };

    const markdown = formatThemeSynthesisMarkdown(synthesis);

    expect(markdown).toContain("Emerging Trends");
    expect(markdown).toContain("AI Code Assistants");
    expect(markdown).toContain("80%");
  });

  test("returns empty for no themes", () => {
    const synthesis = {
      recurring_themes: [],
      conflicting_viewpoints: [],
      emerging_trends: [],
    };

    const markdown = formatThemeSynthesisMarkdown(synthesis);

    expect(markdown.trim()).toBe("");
  });
});

describe("shouldSynthesizeThemes", () => {
  test("returns false for few posts", () => {
    expect(shouldSynthesizeThemes(1)).toBe(false);
    expect(shouldSynthesizeThemes(2)).toBe(false);
  });

  test("returns true for enough posts", () => {
    expect(shouldSynthesizeThemes(3)).toBe(true);
    expect(shouldSynthesizeThemes(10)).toBe(true);
  });
});
