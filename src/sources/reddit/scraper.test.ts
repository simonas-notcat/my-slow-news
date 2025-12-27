/**
 * Tests for Reddit HTML scraper
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { scrapePostDetails } from "./scraper";
import { globalRateLimiter } from "../utils/rate-limiter";

const originalFetch = globalThis.fetch;

// Sample HTML fixture for a Reddit post with comments
const samplePostHTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="thing link" data-fullname="t3_abc123">
    <div class="entry">
      <p class="title"><a class="title" href="/test">Test Post Title</a></p>
      <div class="domain">example.com</div>
      <p class="tagline">
        submitted <time datetime="2025-01-01T00:00:00Z"></time> by
        <a class="author">testuser</a>
      </p>
      <div class="score unvoted">250</div>
      <a class="comments">42 comments</a>
    </div>
  </div>

  <!-- Comments section -->
  <div class="thing comment" data-fullname="t1_xyz123">
    <div class="entry">
      <p class="tagline">
        <a class="author">commenter1</a>
        <time datetime="2025-01-01T01:00:00Z"></time>
      </p>
      <div class="score unvoted">15</div>
      <div class="usertext-body">
        <div class="md"><p>This is a great post!</p></div>
      </div>
    </div>
  </div>

  <div class="thing comment" data-fullname="t1_xyz456">
    <div class="entry">
      <p class="tagline">
        <a class="author">commenter2</a>
        <time datetime="2025-01-01T02:00:00Z"></time>
      </p>
      <div class="score likes">8</div>
      <div class="usertext-body">
        <div class="md"><p>I agree!</p></div>
      </div>
    </div>
  </div>
</body>
</html>
`;

// HTML with self-text post
const selfTextPostHTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="thing self" data-fullname="t3_def456">
    <div class="entry">
      <p class="title"><span class="title">Discussion: Best Practices</span></p>
      <p class="tagline">
        submitted <time datetime="2025-01-02T00:00:00Z"></time> by
        <a class="author">discussionuser</a>
      </p>
      <div class="score unvoted">100</div>
      <a class="comments">10 comments</a>
    </div>
  </div>

  <div class="usertext-body">
    <div class="md"><p>What are your thoughts on best practices for X?</p></div>
  </div>
</body>
</html>
`;

// HTML with deleted author and comment
const deletedContentHTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="thing link" data-fullname="t3_ghi789">
    <div class="entry">
      <p class="title"><a class="title" href="/deleted">Deleted Post</a></p>
      <p class="tagline">
        submitted <time datetime="2025-01-03T00:00:00Z"></time>
      </p>
      <div class="score unvoted">50</div>
      <a class="comments">5 comments</a>
    </div>
  </div>

  <div class="thing comment" data-fullname="t1_del123">
    <div class="entry">
      <p class="tagline">
        <time datetime="2025-01-03T01:00:00Z"></time>
      </p>
      <div class="score unvoted">3</div>
      <div class="usertext-body">
        <div class="md"><p>Comment by deleted user</p></div>
      </div>
    </div>
  </div>
</body>
</html>
`;

// Invalid HTML without post element
const invalidHTML = `
<!DOCTYPE html>
<html>
<body>
  <div>No post here</div>
</body>
</html>
`;

describe("Reddit Scraper", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() => Promise.resolve(new Response(samplePostHTML)));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    globalRateLimiter.reset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("scrapePostDetails", () => {
    test("should scrape post with comments", async () => {
      mockFetch.mockImplementation(() => Promise.resolve(new Response(samplePostHTML)));

      const result = await scrapePostDetails("/r/programming/comments/abc123/");

      // Verify post data
      expect(result.post.id).toBe("abc123");
      expect(result.post.subreddit).toBe("programming");
      expect(result.post.title).toBe("Test Post Title");
      expect(result.post.author).toBe("testuser");
      expect(result.post.score).toBe(250);
      expect(result.post.num_comments).toBe(42);
      expect(result.post.created_utc).toBe(Math.floor(new Date("2025-01-01T00:00:00Z").getTime() / 1000));

      // Verify comments
      expect(result.comments.length).toBe(2);
      expect(result.comments[0].id).toBe("xyz123");
      expect(result.comments[0].author).toBe("commenter1");
      expect(result.comments[0].body).toBe("This is a great post!");
      expect(result.comments[0].score).toBe(15);

      expect(result.comments[1].id).toBe("xyz456");
      expect(result.comments[1].author).toBe("commenter2");
      expect(result.comments[1].body).toBe("I agree!");
      expect(result.comments[1].score).toBe(8);
    });

    test("should scrape self-text posts", async () => {
      mockFetch.mockImplementation(() => Promise.resolve(new Response(selfTextPostHTML)));

      const result = await scrapePostDetails("/r/discussion/comments/def456/");

      expect(result.post.id).toBe("def456");
      expect(result.post.subreddit).toBe("discussion");
      expect(result.post.title).toBe("Discussion: Best Practices");
      expect(result.post.selftext).toBe("What are your thoughts on best practices for X?");
      expect(result.post.score).toBe(100);
    });

    test("should handle deleted authors", async () => {
      mockFetch.mockImplementation(() => Promise.resolve(new Response(deletedContentHTML)));

      const result = await scrapePostDetails("/r/test/comments/ghi789/");

      expect(result.post.author).toBe("[deleted]");
      expect(result.comments[0].author).toBe("[deleted]");
    });

    test("should throw error when post element not found", async () => {
      mockFetch.mockImplementation(() => Promise.resolve(new Response(invalidHTML)));

      await expect(scrapePostDetails("/r/test/comments/invalid/")).rejects.toThrow(
        "Could not find post element in HTML"
      );
    });

    test("should throw error on HTTP error response", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response("Not Found", { status: 404, statusText: "Not Found" }))
      );

      await expect(scrapePostDetails("/r/test/comments/notfound/")).rejects.toThrow(
        "404"
      );
    });

    test("should retry on network errors", async () => {
      let attemptCount = 0;
      mockFetch.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error("ECONNRESET"));
        }
        return Promise.resolve(new Response(samplePostHTML));
      });

      const result = await scrapePostDetails("/r/programming/comments/abc123/");

      expect(attemptCount).toBe(3);
      expect(result.post.id).toBe("abc123");
    });

    test("should construct correct old Reddit URL", async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        expect(urlStr).toBe("https://old.reddit.com/r/programming/comments/abc123/");
        return Promise.resolve(new Response(samplePostHTML));
      });

      await scrapePostDetails("/r/programming/comments/abc123/");
    });

    test("should use random user agent", async () => {
      mockFetch.mockImplementation((_url: string | URL | Request, init?: RequestInit) => {
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers["User-Agent"]).toBeDefined();
        expect(headers["User-Agent"].length).toBeGreaterThan(0);
        return Promise.resolve(new Response(samplePostHTML));
      });

      await scrapePostDetails("/r/programming/comments/abc123/");
    });

    test("should apply rate limiting", async () => {
      const startTime = Date.now();

      await scrapePostDetails("/r/programming/comments/abc123/");
      await scrapePostDetails("/r/programming/comments/def456/");

      const elapsed = Date.now() - startTime;
      // Should have at least one delay (500ms default)
      expect(elapsed).toBeGreaterThanOrEqual(400); // Allow some margin
    });

    test("should handle posts without comments", async () => {
      const noCommentsHTML = `
        <!DOCTYPE html>
        <html>
        <body>
          <div class="thing link" data-fullname="t3_nocom1">
            <div class="entry">
              <p class="title"><a class="title" href="/test">No Comments Post</a></p>
              <p class="tagline">
                submitted <time datetime="2025-01-01T00:00:00Z"></time> by
                <a class="author">testuser</a>
              </p>
              <div class="score unvoted">10</div>
              <a class="comments">0 comments</a>
            </div>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockImplementation(() => Promise.resolve(new Response(noCommentsHTML)));

      const result = await scrapePostDetails("/r/test/comments/nocom1/");

      expect(result.post.id).toBe("nocom1");
      expect(result.comments.length).toBe(0);
    });

    test("should skip comments without body text", async () => {
      const emptyCommentHTML = `
        <!DOCTYPE html>
        <html>
        <body>
          <div class="thing link" data-fullname="t3_test1">
            <div class="entry">
              <p class="title"><a class="title" href="/test">Test</a></p>
              <p class="tagline">
                submitted <time datetime="2025-01-01T00:00:00Z"></time> by
                <a class="author">testuser</a>
              </p>
              <div class="score unvoted">10</div>
              <a class="comments">1 comment</a>
            </div>
          </div>

          <div class="thing comment" data-fullname="t1_empty1">
            <div class="entry">
              <p class="tagline">
                <a class="author">commenter</a>
                <time datetime="2025-01-01T01:00:00Z"></time>
              </p>
              <div class="score unvoted">5</div>
            </div>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockImplementation(() => Promise.resolve(new Response(emptyCommentHTML)));

      const result = await scrapePostDetails("/r/test/comments/test1/");

      expect(result.comments.length).toBe(0); // Empty comments should be skipped
    });
  });
});
