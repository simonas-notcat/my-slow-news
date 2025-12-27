/**
 * RSS feed fetcher for Reddit
 * Fetches top posts from subreddit RSS feeds
 */

import Parser from "rss-parser";
import type { RSSItem } from "../types";
import { withRetry } from "../../utils/retry";
import { getRandomUserAgent } from "../utils/user-agent-pool";

// Rate limit errors that should trigger retry
const RETRY_PATTERNS = ["429", "rate limit", "503", "ECONNRESET", "ETIMEDOUT"];

const parser = new Parser({
  customFields: {
    item: ["id", "author", "link"],
  },
});

/**
 * Extract Reddit post ID from permalink
 * Example: /r/programming/comments/abc123/title/ -> abc123
 */
function extractPostId(link: string): string {
  const match = link.match(/\/comments\/([a-z0-9]+)\//i);
  return match ? match[1] : "";
}

/**
 * Extract subreddit name from permalink
 * Example: https://www.reddit.com/r/programming/... -> programming
 */
function extractSubreddit(link: string): string {
  const match = link.match(/\/r\/([a-zA-Z0-9_]+)\//);
  return match ? match[1] : "";
}

/**
 * Convert Reddit RSS link to permalink
 * Example: https://www.reddit.com/r/programming/comments/abc123/title/?utm_source=... -> /r/programming/comments/abc123/
 */
function toPermalink(link: string): string {
  try {
    const url = new URL(link);
    const pathMatch = url.pathname.match(/(\/r\/[a-zA-Z0-9_]+\/comments\/[a-z0-9]+)\//i);
    return pathMatch ? `${pathMatch[1]}/` : url.pathname;
  } catch {
    return link;
  }
}

/**
 * Fetch Reddit RSS feed for a subreddit
 * @param subreddit Subreddit name (without r/ prefix)
 * @param options Fetching options
 * @returns Array of RSS items
 */
export async function fetchSubredditRSS(
  subreddit: string,
  options: {
    timeframe?: "hour" | "day" | "week" | "month" | "year" | "all";
    limit?: number;
  } = {}
): Promise<RSSItem[]> {
  const { timeframe = "day", limit = 25 } = options;

  const fetchFeed = async (): Promise<RSSItem[]> => {
    const url = `https://www.reddit.com/r/${subreddit}/top/.rss?t=${timeframe}&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch RSS for r/${subreddit}: ${response.status} ${response.statusText}`
      );
    }

    const xml = await response.text();
    const feed = await parser.parseString(xml);

    // Parse RSS items into our format
    const items: RSSItem[] = feed.items.map((item: { link?: string; author?: string; title?: string; pubDate?: string }) => {
      const link = item.link || "";
      const permalink = toPermalink(link);
      const id = extractPostId(permalink);
      const subredditName = extractSubreddit(link) || subreddit;
      const author = item.author ? item.author.replace(/^\/u\//, "") : "unknown";

      return {
        id,
        title: item.title || "",
        link,
        permalink,
        author,
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        subreddit: subredditName,
      };
    });

    return items.filter((item) => item.id); // Filter out items without IDs
  };

  try {
    return await withRetry(fetchFeed, {
      maxAttempts: 3,
      retryableErrors: RETRY_PATTERNS,
      onRetry: (err, attempt, delay) => {
        console.warn(`Retry ${attempt} for r/${subreddit} RSS after ${delay}ms: ${err.message}`);
      },
    });
  } catch (error) {
    console.error(`Failed to fetch RSS for r/${subreddit}:`, error);
    return []; // Return empty array on failure
  }
}
