import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { fetchSubredditRSS } from "./rss-fetcher";

// Store original fetch
const originalFetch = globalThis.fetch;

describe("fetchSubredditRSS", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() => Promise.resolve(new Response("")));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches RSS feed with correct URL", async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_abc123</id>
    <title>Test Post</title>
    <link href="https://www.reddit.com/r/programming/comments/abc123/test_post/"/>
    <author><name>/u/testuser</name></author>
    <published>2025-01-15T10:00:00Z</published>
  </entry>
</feed>`;

    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(mockRSS, { status: 200 }))
    );

    await fetchSubredditRSS("programming", { timeframe: "day", limit: 25 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://www.reddit.com/r/programming/top/.rss?t=day&limit=25");
    expect(options.headers).toBeDefined();
  });

  test("parses RSS items correctly", async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_abc123</id>
    <title>Test Post Title</title>
    <link href="https://www.reddit.com/r/programming/comments/abc123/test_post/"/>
    <author><name>/u/testuser</name></author>
    <published>2025-01-15T10:00:00Z</published>
  </entry>
  <entry>
    <id>t3_xyz789</id>
    <title>Another Post</title>
    <link href="https://www.reddit.com/r/programming/comments/xyz789/another_post/"/>
    <author><name>/u/anotheruser</name></author>
    <published>2025-01-15T11:00:00Z</published>
  </entry>
</feed>`;

    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(mockRSS, { status: 200 }))
    );

    const items = await fetchSubredditRSS("programming");

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "abc123",
      title: "Test Post Title",
      author: "testuser",
      subreddit: "programming",
    });
    expect(items[0].permalink).toMatch(/^\/r\/programming\/comments\/abc123\//);
  });

  test("uses default options when not provided", async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"></feed>`;

    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(mockRSS, { status: 200 }))
    );

    await fetchSubredditRSS("rust");

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("t=day"); // Default timeframe
    expect(url).toContain("limit=25"); // Default limit
  });

  test("filters out items without post IDs", async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_valid123</id>
    <title>Valid Post</title>
    <link href="https://www.reddit.com/r/programming/comments/valid123/post/"/>
    <author><name>/u/user1</name></author>
    <published>2025-01-15T10:00:00Z</published>
  </entry>
  <entry>
    <id>invalid_entry</id>
    <title>Invalid Post</title>
    <link href="https://www.reddit.com/r/programming/invalid/"/>
    <author><name>/u/user2</name></author>
    <published>2025-01-15T11:00:00Z</published>
  </entry>
</feed>`;

    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(mockRSS, { status: 200 }))
    );

    const items = await fetchSubredditRSS("programming");

    // Should filter out the invalid entry
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("valid123");
  });

  test("handles fetch errors gracefully", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response("Not Found", { status: 404 }))
    );

    const items = await fetchSubredditRSS("nonexistent");

    // Should return empty array on error
    expect(items).toEqual([]);
  });

  test("retries on rate limit errors", async () => {
    let callCount = 0;
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_abc123</id>
    <title>Test</title>
    <link href="https://www.reddit.com/r/programming/comments/abc123/test/"/>
    <author><name>/u/test</name></author>
    <published>2025-01-15T10:00:00Z</published>
  </entry>
</feed>`;

    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call fails with rate limit
        return Promise.resolve(new Response("Too Many Requests", { status: 429 }));
      }
      // Second call succeeds
      return Promise.resolve(new Response(mockRSS, { status: 200 }));
    });

    const items = await fetchSubredditRSS("programming");

    // Should retry and eventually succeed
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(1);
  });

  test("extracts author name correctly", async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_abc123</id>
    <title>Test</title>
    <link href="https://www.reddit.com/r/programming/comments/abc123/test/"/>
    <author><name>/u/john_doe</name></author>
    <published>2025-01-15T10:00:00Z</published>
  </entry>
  <entry>
    <id>t3_def456</id>
    <title>Test2</title>
    <link href="https://www.reddit.com/r/programming/comments/def456/test2/"/>
    <published>2025-01-15T11:00:00Z</published>
  </entry>
</feed>`;

    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(mockRSS, { status: 200 }))
    );

    const items = await fetchSubredditRSS("programming");

    // Should strip /u/ prefix
    expect(items[0].author).toBe("john_doe");
    // Should handle missing author
    expect(items[1].author).toBe("unknown");
  });

  test("handles different timeframe options", async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"></feed>`;

    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(mockRSS, { status: 200 }))
    );

    await fetchSubredditRSS("programming", { timeframe: "week" });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("t=week");
  });

  test("includes User-Agent header", async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"></feed>`;

    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(mockRSS, { status: 200 }))
    );

    await fetchSubredditRSS("programming");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBeDefined();
    expect(headers["User-Agent"].length).toBeGreaterThan(0);
  });

  test("converts permalink correctly with query params", async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_abc123</id>
    <title>Test</title>
    <link href="https://www.reddit.com/r/programming/comments/abc123/test/?utm_source=rss&amp;utm_medium=feed"/>
    <author><name>/u/test</name></author>
    <published>2025-01-15T10:00:00Z</published>
  </entry>
</feed>`;

    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(mockRSS, { status: 200 }))
    );

    const items = await fetchSubredditRSS("programming");

    // Permalink should be clean without query params
    expect(items[0].permalink).toBe("/r/programming/comments/abc123/");
  });
});
