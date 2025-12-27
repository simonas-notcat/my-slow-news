import { describe, test, expect } from "bun:test";
import {
  isLinkPost,
  extractDomain,
  isDomainAllowed,
  formatLinkContentForPrompt,
} from "./link-fetcher";
import type { RedditPost } from "../types";

function createPost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: "post1",
    subreddit: "programming",
    title: "Test Post",
    selftext: "",
    author: "test_author",
    url: "https://example.com/article",
    permalink: "/r/programming/post1",
    score: 100,
    num_comments: 10,
    created_utc: Date.now() / 1000,
    ...overrides,
  };
}

describe("isLinkPost", () => {
  test("identifies link posts without selftext", () => {
    const post = createPost({
      selftext: "",
      url: "https://github.com/repo/project",
    });

    expect(isLinkPost(post)).toBe(true);
  });

  test("identifies text posts with content", () => {
    const post = createPost({
      selftext: "This is a long text post with substantial content that explains the topic in detail.",
      url: "https://reddit.com/r/programming/self",
    });

    expect(isLinkPost(post)).toBe(false);
  });

  test("excludes reddit links", () => {
    const post = createPost({
      selftext: "",
      url: "https://reddit.com/r/other/comments/abc",
    });

    expect(isLinkPost(post)).toBe(false);
  });

  test("excludes redd.it links", () => {
    const post = createPost({
      selftext: "",
      url: "https://i.redd.it/image.png",
    });

    expect(isLinkPost(post)).toBe(false);
  });

  test("requires http(s) URLs", () => {
    const post = createPost({
      selftext: "",
      url: "not-a-url",
    });

    expect(isLinkPost(post)).toBe(false);
  });
});

describe("extractDomain", () => {
  test("extracts domain from full URL", () => {
    expect(extractDomain("https://www.example.com/path")).toBe("example.com");
  });

  test("handles subdomain", () => {
    expect(extractDomain("https://blog.example.com/post")).toBe(
      "blog.example.com"
    );
  });

  test("removes www prefix", () => {
    expect(extractDomain("https://www.github.com/repo")).toBe("github.com");
  });

  test("handles invalid URLs", () => {
    expect(extractDomain("not-a-url")).toBe("");
  });
});

describe("isDomainAllowed", () => {
  test("allows domains by default", () => {
    expect(isDomainAllowed("github.com")).toBe(true);
    expect(isDomainAllowed("medium.com")).toBe(true);
  });

  test("blocks social media domains", () => {
    expect(isDomainAllowed("twitter.com")).toBe(false);
    expect(isDomainAllowed("facebook.com")).toBe(false);
    expect(isDomainAllowed("instagram.com")).toBe(false);
  });

  test("respects custom blocklist", () => {
    expect(
      isDomainAllowed("example.com", {
        blockedDomains: ["example.com"],
      })
    ).toBe(false);
  });

  test("respects custom allowlist", () => {
    expect(
      isDomainAllowed("github.com", {
        allowedDomains: ["github.com"],
      })
    ).toBe(true);

    expect(
      isDomainAllowed("other.com", {
        allowedDomains: ["github.com"],
      })
    ).toBe(false);
  });
});

describe("formatLinkContentForPrompt", () => {
  test("formats successful content", () => {
    const content = {
      title: "Article Title",
      content: "This is the article content with enough text to pass the minimum length requirement for proper formatting.",
      domain: "example.com",
      fetchedAt: new Date(),
      truncated: false,
    };

    const formatted = formatLinkContentForPrompt(content);

    expect(formatted).toContain("Article Title");
    expect(formatted).toContain("example.com");
    expect(formatted).toContain("This is the article content");
  });

  test("handles null content", () => {
    const formatted = formatLinkContentForPrompt(null);

    expect(formatted).toContain("could not be fetched");
  });

  test("includes error message", () => {
    const content = {
      title: "",
      content: "",
      domain: "example.com",
      fetchedAt: new Date(),
      truncated: false,
      error: "Timeout",
    };

    const formatted = formatLinkContentForPrompt(content);

    expect(formatted).toContain("Timeout");
  });

  test("handles short content", () => {
    const content = {
      title: "",
      content: "Short",
      domain: "example.com",
      fetchedAt: new Date(),
      truncated: false,
    };

    const formatted = formatLinkContentForPrompt(content);

    expect(formatted).toContain("content extraction failed");
  });

  test("truncates long content", () => {
    const longContent = "x".repeat(5000);
    const content = {
      title: "Title",
      content: longContent,
      domain: "example.com",
      fetchedAt: new Date(),
      truncated: false,
    };

    const formatted = formatLinkContentForPrompt(content, 100);

    expect(formatted.length).toBeLessThan(500);
    expect(formatted).toContain("...");
  });
});
