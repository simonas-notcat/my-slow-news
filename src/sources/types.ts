/**
 * Reddit data types for scraping and RSS parsing
 */

// Core Reddit types (moved from src/types/index.ts)
export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
}

export interface RedditComment {
  id: string;
  post_id: string;
  author: string;
  body: string;
  score: number;
  parent_id: string;
  created_utc: number;
}

// RSS feed types
export interface RSSItem {
  id: string; // Extracted from permalink
  title: string;
  link: string; // Full URL to post
  permalink: string; // Reddit permalink (/r/subreddit/comments/...)
  author: string;
  pubDate: Date;
  subreddit?: string; // Extracted from link
}

// Intermediate scraping result
export interface ParsedPostMetadata {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  url: string;
  permalink: string;
}

// Scraping result with post and comments
export interface ScrapedContent {
  post: RedditPost;
  comments: RedditComment[];
}
