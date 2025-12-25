import {
  getAccessToken,
  fetchSubredditPosts,
  fetchPostComments,
} from "./client";
import type { RedditPost, RedditComment, Config } from "../types";
import { getRedditCredentials } from "../config";

export interface PostWithComments {
  post: RedditPost;
  comments: RedditComment[];
}

export async function fetchTopPostsWithComments(
  config: Config
): Promise<Map<string, PostWithComments[]>> {
  const { clientId, clientSecret } = getRedditCredentials();
  const accessToken = await getAccessToken(clientId, clientSecret);

  const redditConfig = config.sources.reddit;
  const results = new Map<string, PostWithComments[]>();

  for (const subreddit of redditConfig.subreddits) {
    console.log(`Fetching r/${subreddit}...`);

    try {
      // Fetch more posts than needed to allow filtering
      const posts = await fetchSubredditPosts(subreddit, accessToken, {
        limit: redditConfig.posts_per_subreddit * 2,
        timeframe: redditConfig.lookback_hours <= 24 ? "day" : "week",
      });

      // Filter to posts within the lookback window
      const cutoffTime =
        Date.now() / 1000 - redditConfig.lookback_hours * 3600;
      const recentPosts = posts.filter((p) => p.created_utc >= cutoffTime);

      // Calculate average score for relative filtering
      const avgScore =
        recentPosts.reduce((sum, p) => sum + p.score, 0) /
        (recentPosts.length || 1);

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
        const comments = await fetchPostComments(
          subreddit,
          post.id,
          accessToken,
          { limit: redditConfig.max_comments_per_post }
        );

        // Sort by score and take top comments
        const topComments = comments
          .sort((a, b) => b.score - a.score)
          .slice(0, redditConfig.max_comments_per_post);

        postsWithComments.push({ post, comments: topComments });

        // Small delay to avoid rate limiting
        await sleep(100);
      }

      results.set(subreddit, postsWithComments);
    } catch (error) {
      console.error(`Error fetching r/${subreddit}:`, error);
      results.set(subreddit, []);
    }
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { getAccessToken, fetchSubredditPosts, fetchPostComments } from "./client";
