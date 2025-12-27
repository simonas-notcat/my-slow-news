/**
 * Reddit client using RSS + web scraping (no OAuth required)
 */

import type { RedditPost, RedditComment, ScrapedContent } from "../types";
import { fetchSubredditRSS } from "./rss-fetcher";
import { scrapePostDetails } from "./scraper";

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
 * Then scrape full details for each post (including comments)
 * @param subreddit Subreddit name (without r/ prefix)
 * @param options Fetching options
 * @returns Array of scraped content (posts with comments)
 */
export async function fetchSubredditPosts(
  subreddit: string,
  options: {
    limit?: number;
    timeframe?: "hour" | "day" | "week" | "month" | "year" | "all";
  } = {}
): Promise<ScrapedContent[]> {
  validateSubredditName(subreddit);
  const { limit = 25, timeframe = "day" } = options;

  try {
    // Step 1: Fetch RSS feed to get post listings
    const rssItems = await fetchSubredditRSS(subreddit, { timeframe, limit });

    console.log(`  Found ${rssItems.length} posts in RSS feed for r/${subreddit}`);

    // Step 2: Scrape full details for each post (includes comments)
    const results: ScrapedContent[] = [];

    for (const item of rssItems) {
      try {
        const scrapedContent = await scrapePostDetails(item.permalink);
        results.push(scrapedContent);

        // Rate limiting is handled inside scrapePostDetails
      } catch (error) {
        console.warn(`  Failed to scrape post ${item.id}:`, error);
        // Continue with other posts
      }
    }

    console.log(`  Successfully scraped ${results.length}/${rssItems.length} posts`);
    return results;
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
 * @returns Array of Reddit comments (unsorted, caller should sort as needed)
 */
export async function fetchPostComments(
  subreddit: string,
  postId: string,
  options: { limit?: number } = {}
): Promise<RedditComment[]> {
  validateSubredditName(subreddit);
  const { limit = 50 } = options;

  try {
    // Construct permalink
    const permalink = `/r/${subreddit}/comments/${postId}/`;

    // Scrape post and comments
    const { comments } = await scrapePostDetails(permalink);

    // Apply limit (caller should sort as needed)
    return comments.slice(0, limit);
  } catch (error) {
    console.error(`Failed to fetch comments for ${postId}:`, error);
    return [];
  }
}

