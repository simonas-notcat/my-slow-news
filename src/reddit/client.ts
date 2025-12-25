import type { RedditPost, RedditComment, Config } from "../types";
import { withRetry } from "../utils/retry";

// Rate limit errors that should trigger retry
const REDDIT_RETRY_PATTERNS = ["429", "rate limit", "503", "ECONNRESET", "ETIMEDOUT"];

interface RedditAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
}

let cachedToken: RedditAuthToken | null = null;

/**
 * Clears the cached token (for testing)
 */
export function clearCachedToken(): void {
  cachedToken = null;
}

export async function getAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && Date.now() < cachedToken.expires_at - 60000) {
    return cachedToken.access_token;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const fetchToken = async () => {
    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "MySlowNews/0.1.0",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      throw new Error(`Failed to get Reddit access token: ${response.status}`);
    }

    return response.json();
  };

  const data = await withRetry(fetchToken, {
    maxAttempts: 3,
    retryableErrors: REDDIT_RETRY_PATTERNS,
    onRetry: (err, attempt, delay) => {
      console.warn(`Reddit auth retry ${attempt} after ${delay}ms: ${err.message}`);
    },
  });

  cachedToken = {
    ...data,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return cachedToken!.access_token;
}

// Validate subreddit name to prevent URL injection
function validateSubredditName(subreddit: string): void {
  // Subreddit names: 3-21 chars, alphanumeric + underscore, no leading underscore
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9_]{2,20}$/;
  if (!validPattern.test(subreddit)) {
    throw new Error(`Invalid subreddit name: "${subreddit}". Must be 3-21 alphanumeric characters.`);
  }
}

export async function fetchSubredditPosts(
  subreddit: string,
  accessToken: string,
  options: {
    limit?: number;
    timeframe?: "hour" | "day" | "week" | "month" | "year" | "all";
  } = {}
): Promise<RedditPost[]> {
  validateSubredditName(subreddit);
  const { limit = 25, timeframe = "day" } = options;

  const fetchPosts = async () => {
    const response = await fetch(
      `https://oauth.reddit.com/r/${subreddit}/top?t=${timeframe}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "MySlowNews/0.1.0",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch r/${subreddit}: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  };

  const data = await withRetry(fetchPosts, {
    maxAttempts: 3,
    retryableErrors: REDDIT_RETRY_PATTERNS,
    onRetry: (err, attempt, delay) => {
      console.warn(`Retry ${attempt} for r/${subreddit} after ${delay}ms: ${err.message}`);
    },
  });

  return data.data.children.map((child: any) => ({
    id: child.data.id,
    subreddit: child.data.subreddit,
    title: child.data.title,
    selftext: child.data.selftext || "",
    author: child.data.author,
    url: child.data.url,
    permalink: `https://reddit.com${child.data.permalink}`,
    score: child.data.score,
    num_comments: child.data.num_comments,
    created_utc: child.data.created_utc,
  }));
}

export async function fetchPostComments(
  subreddit: string,
  postId: string,
  accessToken: string,
  options: { limit?: number; sort?: "top" | "best" | "new" } = {}
): Promise<RedditComment[]> {
  validateSubredditName(subreddit);
  const { limit = 50, sort = "top" } = options;

  const fetchComments = async () => {
    const response = await fetch(
      `https://oauth.reddit.com/r/${subreddit}/comments/${postId}?sort=${sort}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "MySlowNews/0.1.0",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch comments for ${postId}: ${response.status}`);
    }

    return response.json();
  };

  const data = await withRetry(fetchComments, {
    maxAttempts: 3,
    retryableErrors: REDDIT_RETRY_PATTERNS,
    onRetry: (err, attempt, delay) => {
      console.warn(`Retry ${attempt} for comments ${postId} after ${delay}ms: ${err.message}`);
    },
  });

  // Comments are in the second element of the response array
  const commentsData = data[1]?.data?.children || [];

  return flattenComments(commentsData, postId);
}

function flattenComments(
  children: any[],
  postId: string,
  parentId?: string
): RedditComment[] {
  const comments: RedditComment[] = [];

  for (const child of children) {
    if (child.kind !== "t1") continue; // Skip non-comment items

    const data = child.data;

    comments.push({
      id: data.id,
      post_id: postId,
      author: data.author || "[deleted]",
      body: data.body || "",
      score: data.score || 0,
      parent_id: parentId || postId,
      created_utc: data.created_utc,
    });

    // Recursively flatten replies
    if (data.replies?.data?.children) {
      comments.push(...flattenComments(data.replies.data.children, postId, data.id));
    }
  }

  return comments;
}

export async function fetchSubredditInfo(
  subreddit: string,
  accessToken: string
): Promise<{ subscribers: number; active_users: number; avg_score: number }> {
  const response = await fetch(
    `https://oauth.reddit.com/r/${subreddit}/about`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "MySlowNews/0.1.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch r/${subreddit} info: ${response.status}`);
  }

  const data = await response.json();

  return {
    subscribers: data.data.subscribers,
    active_users: data.data.accounts_active || 0,
    avg_score: 100, // Reddit doesn't provide this, we'll calculate from posts
  };
}
