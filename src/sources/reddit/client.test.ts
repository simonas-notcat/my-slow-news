/**
 * Tests for Reddit client (RSS + scraping)
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { fetchSubredditPosts, fetchPostComments } from "./client";
import type { RSSItem } from "../types";

const originalFetch = globalThis.fetch;

describe("Reddit Client", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() => Promise.resolve(new Response("{}")));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("validateSubredditName", () => {
    test("should accept valid subreddit names", async () => {
      // Mock RSS fetch to return empty feed
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(`<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`)
        )
      );

      // These should return empty arrays (no posts) without errors
      await expect(fetchSubredditPosts("programming")).resolves.toEqual([]);
      await expect(fetchSubredditPosts("rust")).resolves.toEqual([]);
      await expect(fetchSubredditPosts("typescript")).resolves.toEqual([]);
      await expect(fetchSubredditPosts("a1b")).resolves.toEqual([]); // Minimum 3 chars
      await expect(fetchSubredditPosts("a123456789012345678")).resolves.toEqual([]); // Max 21 chars
      await expect(fetchSubredditPosts("test_sub")).resolves.toEqual([]); // With underscore
    });

    test("should reject subreddit names that are too short", async () => {
      await expect(fetchSubredditPosts("ab")).rejects.toThrow("Invalid subreddit name");
    });

    test("should reject subreddit names that are too long", async () => {
      await expect(fetchSubredditPosts("a123456789012345678901")).rejects.toThrow(
        "Invalid subreddit name"
      );
    });

    test("should reject subreddit names with leading underscore", async () => {
      await expect(fetchSubredditPosts("_test")).rejects.toThrow("Invalid subreddit name");
    });

    test("should reject subreddit names with special characters", async () => {
      await expect(fetchSubredditPosts("test-sub")).rejects.toThrow("Invalid subreddit name");
      await expect(fetchSubredditPosts("test.sub")).rejects.toThrow("Invalid subreddit name");
      await expect(fetchSubredditPosts("test sub")).rejects.toThrow("Invalid subreddit name");
    });

    test("should reject empty subreddit name", async () => {
      await expect(fetchSubredditPosts("")).rejects.toThrow("Invalid subreddit name");
    });

    test("should reject subreddit name with r/ prefix", async () => {
      await expect(fetchSubredditPosts("r/programming")).rejects.toThrow("Invalid subreddit name");
    });
  });

  describe("fetchSubredditPosts", () => {
    test("should return empty array on fetch failure", async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));

      const result = await fetchSubredditPosts("programming");

      expect(result).toEqual([]);
    });

    test("should return empty array on invalid RSS", async () => {
      mockFetch.mockImplementation(() => Promise.resolve(new Response("invalid xml")));

      const result = await fetchSubredditPosts("programming");

      expect(result).toEqual([]);
    });

    test("should accept timeframe options", async () => {
      mockFetch.mockImplementation((url) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        // Verify the timeframe is in the URL
        if (urlStr.includes("t=week")) {
          return Promise.resolve(
            new Response(`<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`)
          );
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      await fetchSubredditPosts("programming", { timeframe: "week" });

      // Verify fetch was called with correct timeframe
      const calls = mockFetch.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const firstCall = calls[0] as [string, RequestInit];
      expect(firstCall[0]).toContain("t=week");
    });
  });

  describe("fetchPostComments", () => {
    test("should validate subreddit name", async () => {
      await expect(fetchPostComments("invalid!", "abc123")).rejects.toThrow(
        "Invalid subreddit name"
      );
    });

    test("should return empty array on fetch failure", async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));

      const result = await fetchPostComments("programming", "abc123");

      expect(result).toEqual([]);
    });

    test("should construct correct permalink", async () => {
      mockFetch.mockImplementation((url) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        // Return minimal HTML for scraping
        if (urlStr.includes("/r/programming/comments/abc123/")) {
          return Promise.resolve(
            new Response(`
              <!DOCTYPE html>
              <html>
                <body>
                  <div class="thing link" data-fullname="t3_abc123">
                    <div class="entry">
                      <p class="title"><a class="title" href="/test">Test Post</a></p>
                      <div class="domain">example.com</div>
                      <div class="score unvoted">100</div>
                      <time datetime="2025-01-01T00:00:00Z"></time>
                      <div class="expando">
                        <div class="md"><p>Test content</p></div>
                      </div>
                    </div>
                  </div>
                </body>
              </html>
            `)
          );
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      await fetchPostComments("programming", "abc123");

      // Verify fetch was called with correct permalink
      const calls = mockFetch.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const firstCall = calls[0] as [string, RequestInit];
      expect(firstCall[0]).toContain("/r/programming/comments/abc123/");
    });
  });
});
