/**
 * Reddit client using RSS + web scraping (no OAuth required)
 */

import type { RedditPost, RedditComment } from "../types";
import { fetchSubredditRSS } from "./rss-fetcher";
import { scrapePostDetails } from "./scraper";
import { globalRateLimiter } from "../utils/rate-limiter";

// Validate subreddit name to prevent URL injection
function validateSubredditName(subreddit: string): void {
  // Subreddit names: 3-21 chars, alphanumeric + underscore, no leading underscore
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9_]{2,20}$/;
  if (!validPattern.test(subreddit)) {
    throw new Error(`Invalid subreddit name: "${subreddit}". Must be 3-21 alphanumeric characters.`);
  }
}

/**
 * Fetch posts from a subreddit using RSS feed
 * Then scrape full details for each post
 * @param subreddit Subreddit name (without r/ prefix)
 * @param options Fetching options
 * @returns Array of Reddit posts with full details
 */
export async function fetchSubredditPosts(
  subreddit: string,
  options: {
    limit?: number;
    timeframe?: "hour" | "day" | "week" | "month" | "year" | "all";
  } = {}
): Promise<RedditPost[]> {
  validateSubredditName(subreddit);
  const { limit = 25, timeframe = "day" } = options;

  try {
    // Step 1: Fetch RSS feed to get post listings
    const rssItems = await fetchSubredditRSS(subreddit, { timeframe, limit });

    console.log(`  Found ${rssItems.length} posts in RSS feed for r/${subreddit}`);

    // Step 2: Scrape full details for each post
    const posts: RedditPost[] = [];

    for (const item of rssItems) {
      try {
        const { post } = await scrapePostDetails(item.permalink);
        posts.push(post);

        // Rate limiting is handled inside scrapePostDetails
      } catch (error) {
        console.warn(`  Failed to scrape post ${item.id}:`, error);
        // Continue with other posts
      }
    }

    console.log(`  Successfully scraped ${posts.length}/${rssItems.length} posts`);
    return posts;
  } catch (error) {
    console.error(`Failed to fetch posts from r/${subreddit}:`, error);
    return [];
  }
}

/**
 * Fetch comments for a specific post
 * @param subreddit Subreddit name (without r/ prefix)
 * @param postId Reddit post ID
 * @param options Fetching options
 * @returns Array of Reddit comments
 */
export async function fetchPostComments(
  subreddit: string,
  postId: string,
  options: { limit?: number; sort?: "top" | "best" | "new" } = {}
): Promise<RedditComment[]> {
  validateSubredditName(subreddit);
  const { limit = 50, sort = "top" } = options;

  try {
    // Construct permalink
    const permalink = `/r/${subreddit}/comments/${postId}/`;

    // Scrape post and comments
    const { comments } = await scrapePostDetails(permalink);

    // Sort comments by score (top)
    const sortedComments = comments.sort((a, b) => {
      if (sort === "top") return b.score - a.score;
      if (sort === "new") return b.created_utc - a.created_utc;
      return b.score - a.score; // Default to top
    });

    // Apply limit
    return sortedComments.slice(0, limit);
  } catch (error) {
    console.error(`Failed to fetch comments for ${postId}:`, error);
    return [];
  }
}

/**
 * Fetch subreddit info (not needed for current implementation, kept for compatibility)
 * @deprecated This function is no longer used with scraping approach
 */
export async function fetchSubredditInfo(
  subreddit: string
): Promise<{ subscribers: number; active_users: number; avg_score: number }> {
  console.warn("fetchSubredditInfo is deprecated with scraping approach");
  return {
    subscribers: 0,
    active_users: 0,
    avg_score: 100,
  };
}
