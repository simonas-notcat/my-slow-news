import { describe, test, expect } from "vitest";
import {
  isLinkPost,
  extractDomain,
  isDomainAllowed,
  formatLinkContentForPrompt,
  isPrivateOrInternalHost,
  fetchLinkContent,
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

describe("isPrivateOrInternalHost (SSRF protection)", () => {
  test("blocks localhost variants", () => {
    expect(isPrivateOrInternalHost("localhost")).toBe(true);
    expect(isPrivateOrInternalHost("127.0.0.1")).toBe(true);
    expect(isPrivateOrInternalHost("127.0.0.2")).toBe(true);
    expect(isPrivateOrInternalHost("0.0.0.0")).toBe(true);
    expect(isPrivateOrInternalHost("[::1]")).toBe(true);
  });

  test("blocks private IP ranges", () => {
    // 10.0.0.0/8
    expect(isPrivateOrInternalHost("10.0.0.1")).toBe(true);
    expect(isPrivateOrInternalHost("10.255.255.255")).toBe(true);

    // 172.16.0.0/12
    expect(isPrivateOrInternalHost("172.16.0.1")).toBe(true);
    expect(isPrivateOrInternalHost("172.31.255.255")).toBe(true);

    // 192.168.0.0/16
    expect(isPrivateOrInternalHost("192.168.0.1")).toBe(true);
    expect(isPrivateOrInternalHost("192.168.255.255")).toBe(true);
  });

  test("blocks cloud metadata endpoints", () => {
    expect(isPrivateOrInternalHost("169.254.169.254")).toBe(true);
    expect(isPrivateOrInternalHost("metadata.google.internal")).toBe(true);
    expect(isPrivateOrInternalHost("metadata.goog")).toBe(true);
  });

  test("blocks .local and .internal domains", () => {
    expect(isPrivateOrInternalHost("myserver.local")).toBe(true);
    expect(isPrivateOrInternalHost("api.internal")).toBe(true);
  });

  test("allows public domains", () => {
    expect(isPrivateOrInternalHost("github.com")).toBe(false);
    expect(isPrivateOrInternalHost("google.com")).toBe(false);
    expect(isPrivateOrInternalHost("8.8.8.8")).toBe(false);
    expect(isPrivateOrInternalHost("medium.com")).toBe(false);
  });

  test("allows public IPs outside private ranges", () => {
    expect(isPrivateOrInternalHost("172.15.0.1")).toBe(false); // Just before 172.16
    expect(isPrivateOrInternalHost("172.32.0.1")).toBe(false); // Just after 172.31
    expect(isPrivateOrInternalHost("192.167.0.1")).toBe(false); // Just before 192.168
  });
});

describe("fetchLinkContent SSRF protection", () => {
  test("blocks private IP URLs", async () => {
    const result = await fetchLinkContent("http://192.168.1.1/admin");
    expect(result?.error).toBe("Blocked: private or internal host");
  });

  test("blocks localhost URLs", async () => {
    const result = await fetchLinkContent("http://localhost:8080/api");
    expect(result?.error).toBe("Blocked: private or internal host");
  });

  test("blocks metadata endpoint URLs", async () => {
    const result = await fetchLinkContent("http://169.254.169.254/latest/meta-data");
    expect(result?.error).toBe("Blocked: private or internal host");
  });
});
