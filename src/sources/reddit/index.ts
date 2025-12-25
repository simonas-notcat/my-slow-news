/**
 * High-level Reddit fetching orchestration using RSS + web scraping
 */

import { fetchSubredditPosts, fetchPostComments } from "./client";
import type { RedditPost, RedditComment } from "../types";
import type { Config } from "../../types";
import { sleep } from "../../utils/retry";

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
      // Fetch more posts than needed to allow filtering
      const posts = await fetchSubredditPosts(subreddit, {
        limit: redditConfig.posts_per_subreddit * 2,
        timeframe: redditConfig.lookback_hours <= 24 ? "day" : "week",
      });

      // Filter to posts within the lookback window
      const cutoffTime = Date.now() / 1000 - redditConfig.lookback_hours * 3600;
      const recentPosts = posts.filter((p) => p.created_utc >= cutoffTime);

      // Calculate average score for relative filtering
      const avgScore =
        recentPosts.reduce((sum, p) => sum + p.score, 0) / (recentPosts.length || 1);

      // Filter by relative score threshold
      const filteredPosts = recentPosts
        .filter((p) => p.score >= avgScore * redditConfig.min_relative_score)
        .slice(0, redditConfig.posts_per_subreddit);

      console.log(
        `  Found ${recentPosts.length} recent posts, selected ${filteredPosts.length} (avg score: ${Math.round(avgScore)})`
      );

      // Fetch comments for each post
      const postsWithComments: PostWithComments[] = [];

      for (const post of filteredPosts) {
        const comments = await fetchPostComments(subreddit, post.id, {
          limit: redditConfig.max_comments_per_post,
        });

        // Sort by score and take top comments
        const topComments = comments
          .sort((a, b) => b.score - a.score)
          .slice(0, redditConfig.max_comments_per_post);

        postsWithComments.push({ post, comments: topComments });

        // Small delay between posts (rate limiting is also inside scraper)
        await sleep(500);
      }

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
