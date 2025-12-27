/**
 * High-level Reddit fetching orchestration using RSS + web scraping
 */

import { fetchSubredditPosts } from "./client";
import type { RedditPost, RedditComment } from "../types";
import type { Config } from "../../types";

export interface PostWithComments {
  post: RedditPost;
  comments: RedditComment[];
}

/**
 * Fetch top posts with comments from configured subreddits
 * @param config Application configuration
 * @returns Map of subreddit name to posts with comments
 */
export async function fetchTopPostsWithComments(
  config: Config
): Promise<Map<string, PostWithComments[]>> {
  const redditConfig = config.sources.reddit;
  const results = new Map<string, PostWithComments[]>();

  for (const subreddit of redditConfig.subreddits) {
    console.log(`Fetching r/${subreddit}...`);

    try {
      // Fetch posts with comments (scraping returns both)
      const scrapedContent = await fetchSubredditPosts(subreddit, {
        limit: redditConfig.posts_per_subreddit * 2,
        timeframe: redditConfig.lookback_hours <= 24 ? "day" : "week",
      });

      // Filter to posts within the lookback window
      const cutoffTime = Date.now() / 1000 - redditConfig.lookback_hours * 3600;
      const recentContent = scrapedContent.filter((sc) => sc.post.created_utc >= cutoffTime);

      // Calculate average score for relative filtering
      const avgScore =
        recentContent.reduce((sum, sc) => sum + sc.post.score, 0) / (recentContent.length || 1);

      // Filter by relative score threshold
      const filteredContent = recentContent
        .filter((sc) => sc.post.score >= avgScore * redditConfig.min_relative_score)
        .slice(0, redditConfig.posts_per_subreddit);

      console.log(
        `  Found ${recentContent.length} recent posts, selected ${filteredContent.length} (avg score: ${Math.round(avgScore)})`
      );

      // Process comments for each post (already fetched, just need to sort and limit)
      const postsWithComments: PostWithComments[] = filteredContent.map((sc) => {
        // Sort by score and take top comments
        const topComments = sc.comments
          .sort((a, b) => b.score - a.score)
          .slice(0, redditConfig.max_comments_per_post);

        return { post: sc.post, comments: topComments };
      });

      results.set(subreddit, postsWithComments);
    } catch (error) {
      console.error(`Error fetching r/${subreddit}:`, error);
      results.set(subreddit, []);
    }
  }

  return results;
}

// Re-export client functions for compatibility
export { fetchSubredditPosts, fetchPostComments } from "./client";
