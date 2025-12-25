import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import {
  getAccessToken,
  fetchSubredditPosts,
  fetchPostComments,
  fetchSubredditInfo,
} from "./client";

// Store original fetch
const originalFetch = global.fetch;

describe("reddit/client", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() => Promise.resolve(new Response("{}")));
    global.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("fetchSubredditPosts", () => {
    test("fetches posts from subreddit", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                children: [
                  {
                    data: {
                      id: "post1",
                      subreddit: "programming",
                      title: "Test Post",
                      selftext: "Post content",
                      author: "testuser",
                      url: "https://example.com",
                      permalink: "/r/programming/comments/post1/",
                      score: 100,
                      num_comments: 50,
                      created_utc: 1700000000,
                    },
                  },
                ],
              },
            })
          )
        )
      );

      const posts = await fetchSubredditPosts("programming", "test_token");

      expect(posts).toHaveLength(1);
      expect(posts[0]).toEqual({
        id: "post1",
        subreddit: "programming",
        title: "Test Post",
        selftext: "Post content",
        author: "testuser",
        url: "https://example.com",
        permalink: "https://reddit.com/r/programming/comments/post1/",
        score: 100,
        num_comments: 50,
        created_utc: 1700000000,
      });
    });

    test("uses correct API URL with options", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: { children: [] } }))
        )
      );

      await fetchSubredditPosts("rust", "token", { limit: 10, timeframe: "week" });

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://oauth.reddit.com/r/rust/top?t=week&limit=10");
      expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer token");
    });

    test("handles empty selftext", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                children: [
                  {
                    data: {
                      id: "link1",
                      subreddit: "news",
                      title: "Link Post",
                      selftext: null,
                      author: "linker",
                      url: "https://external.com",
                      permalink: "/r/news/comments/link1/",
                      score: 50,
                      num_comments: 10,
                      created_utc: 1700000000,
                    },
                  },
                ],
              },
            })
          )
        )
      );

      const posts = await fetchSubredditPosts("news", "token");

      expect(posts[0].selftext).toBe("");
    });

    test("throws on API error", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response("Not Found", { status: 404, statusText: "Not Found" }))
      );

      await expect(
        fetchSubredditPosts("nonexistent", "token")
      ).rejects.toThrow("Failed to fetch r/nonexistent: 404 Not Found");
    });
  });

  describe("fetchPostComments", () => {
    test("fetches and flattens comments", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              { data: {} },
              {
                data: {
                  children: [
                    {
                      kind: "t1",
                      data: {
                        id: "comment1",
                        author: "commenter1",
                        body: "Top level comment",
                        score: 50,
                        created_utc: 1700000000,
                        replies: {
                          data: {
                            children: [
                              {
                                kind: "t1",
                                data: {
                                  id: "reply1",
                                  author: "replier1",
                                  body: "Reply to comment",
                                  score: 10,
                                  created_utc: 1700001000,
                                  replies: "",
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ])
          )
        )
      );

      const comments = await fetchPostComments("test", "post1", "token");

      expect(comments).toHaveLength(2);
      expect(comments[0]).toEqual({
        id: "comment1",
        post_id: "post1",
        author: "commenter1",
        body: "Top level comment",
        score: 50,
        parent_id: "post1",
        created_utc: 1700000000,
      });
      expect(comments[1]).toEqual({
        id: "reply1",
        post_id: "post1",
        author: "replier1",
        body: "Reply to comment",
        score: 10,
        parent_id: "comment1",
        created_utc: 1700001000,
      });
    });

    test("handles deleted authors", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              { data: {} },
              {
                data: {
                  children: [
                    {
                      kind: "t1",
                      data: {
                        id: "deleted1",
                        author: null,
                        body: "[deleted]",
                        score: 0,
                        created_utc: 1700000000,
                      },
                    },
                  ],
                },
              },
            ])
          )
        )
      );

      const comments = await fetchPostComments("test", "post1", "token");

      expect(comments[0].author).toBe("[deleted]");
    });

    test("skips non-comment items", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              { data: {} },
              {
                data: {
                  children: [
                    {
                      kind: "more",
                      data: { id: "more1", count: 100 },
                    },
                    {
                      kind: "t1",
                      data: {
                        id: "real_comment",
                        author: "user",
                        body: "Real comment",
                        score: 5,
                        created_utc: 1700000000,
                      },
                    },
                  ],
                },
              },
            ])
          )
        )
      );

      const comments = await fetchPostComments("test", "post1", "token");

      expect(comments).toHaveLength(1);
      expect(comments[0].id).toBe("real_comment");
    });

    test("uses correct sort parameter", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify([{ data: {} }, { data: { children: [] } }]))
        )
      );

      await fetchPostComments("test", "post1", "token", { sort: "best", limit: 25 });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://oauth.reddit.com/r/test/comments/post1?sort=best&limit=25"
      );
    });
  });

  describe("fetchSubredditInfo", () => {
    test("fetches subreddit metadata", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                subscribers: 5000000,
                accounts_active: 10000,
              },
            })
          )
        )
      );

      const info = await fetchSubredditInfo("programming", "token");

      expect(info).toEqual({
        subscribers: 5000000,
        active_users: 10000,
        avg_score: 100,
      });
    });

    test("handles missing accounts_active", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                subscribers: 1000,
              },
            })
          )
        )
      );

      const info = await fetchSubredditInfo("smallsub", "token");

      expect(info.active_users).toBe(0);
    });

    test("throws on API error", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response("Not Found", { status: 404 }))
      );

      await expect(
        fetchSubredditInfo("nonexistent", "token")
      ).rejects.toThrow("Failed to fetch r/nonexistent info: 404");
    });
  });

  describe("getAccessToken", () => {
    test("fetches access token with correct request format", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: "new_token",
              token_type: "bearer",
              expires_in: 3600,
            })
          )
        )
      );

      const token = await getAccessToken("client_id", "client_secret");

      expect(token).toBe("new_token");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://www.reddit.com/api/v1/access_token");
      expect(options.method).toBe("POST");
      expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/x-www-form-urlencoded"
      );
      expect((options.headers as Record<string, string>)["User-Agent"]).toBe("MySlowNews/0.1.0");
      expect(options.body).toBe("grant_type=client_credentials");
    });

    test("throws on failed auth request", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response("Unauthorized", { status: 401 }))
      );

      await expect(
        getAccessToken("bad_id", "bad_secret")
      ).rejects.toThrow("Failed to get Reddit access token: 401");
    });
  });
});
