/**
 * Web scraper for Reddit posts and comments
 * Scrapes old Reddit HTML for full post details and comment threads
 */

import { parseHTML } from "linkedom";
import type { RedditPost, RedditComment, ScrapedContent } from "../types";
import { withRetry } from "../../utils/retry";
import { getRandomUserAgent } from "../utils/user-agent-pool";
import { globalRateLimiter } from "../utils/rate-limiter";

// Rate limit errors that should trigger retry
const RETRY_PATTERNS = ["429", "rate limit", "503", "ECONNRESET", "ETIMEDOUT"];

/**
 * Extract text content from an element, handling null cases
 */
function getTextContent(element: Element | null): string {
  return element?.textContent?.trim() || "";
}

/**
 * Extract number from text (e.g., "123 points" -> 123)
 */
function extractNumber(text: string): number {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Extract Reddit ID from data-fullname attribute
 * Format: t3_abc123 -> abc123
 */
function extractId(fullname: string): string {
  return fullname.replace(/^t[0-9]_/, "");
}

/**
 * Parse timestamp from data-timestamp attribute (milliseconds to seconds)
 */
function parseTimestamp(timestamp: string | null): number {
  if (!timestamp) return Math.floor(Date.now() / 1000);
  const ms = parseInt(timestamp, 10);
  return Math.floor(ms / 1000);
}

/**
 * Scrape a Reddit post and its comments from HTML
 * @param permalink Reddit permalink (e.g., /r/programming/comments/abc123/)
 * @returns Post with comments
 */
export async function scrapePostDetails(permalink: string): Promise<ScrapedContent> {
  // Apply rate limiting before making request
  await globalRateLimiter.wait();

  const fetchHTML = async (): Promise<ScrapedContent> => {
    // Use old Reddit for easier parsing
    const url = `https://old.reddit.com${permalink}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to scrape ${permalink}: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const { document } = parseHTML(html);

    // Extract post details
    const post = extractPost(document, permalink);

    // Extract comments
    const comments = extractComments(document, post.id);

    globalRateLimiter.recordSuccess();
    return { post, comments };
  };

  try {
    return await withRetry(fetchHTML, {
      maxAttempts: 3,
      retryableErrors: RETRY_PATTERNS,
      onRetry: (err, attempt, delay) => {
        console.warn(`Retry ${attempt} for ${permalink} after ${delay}ms: ${err.message}`);
        globalRateLimiter.recordError();
      },
    });
  } catch (error) {
    globalRateLimiter.recordError();
    console.error(`Failed to scrape ${permalink}:`, error);
    // Return minimal post data on failure
    throw error;
  }
}

/**
 * Extract post details from HTML document
 */
function extractPost(document: Document, permalink: string): RedditPost {
  // Find the main post element
  const postElement = document.querySelector(".thing.link, .thing.self");

  if (!postElement) {
    throw new Error("Could not find post element in HTML");
  }

  // Extract data-fullname for ID
  const fullname = postElement.getAttribute("data-fullname") || "";
  const id = extractId(fullname);

  // Extract subreddit from permalink
  const subredditMatch = permalink.match(/\/r\/([a-zA-Z0-9_]+)\//);
  const subreddit = subredditMatch ? subredditMatch[1] : "";

  // Extract title
  const titleElement = postElement.querySelector(".title a.title, .title .title");
  const title = getTextContent(titleElement);

  // Extract author
  const authorElement = postElement.querySelector(".author");
  const author = getTextContent(authorElement) || "[deleted]";

  // Extract score
  const scoreElement = postElement.querySelector(".score.unvoted, .score.likes, .score.dislikes");
  const scoreText = getTextContent(scoreElement);
  const score = extractNumber(scoreText);

  // Extract number of comments
  const commentsElement = postElement.querySelector(".comments");
  const commentsText = getTextContent(commentsElement);
  const num_comments = extractNumber(commentsText);

  // Extract timestamp
  const timeElement = postElement.querySelector("time");
  const timestamp = timeElement?.getAttribute("datetime");
  const created_utc = timestamp ? Math.floor(new Date(timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000);

  // Extract selftext (for text posts)
  const selftextElement = document.querySelector(".usertext-body .md");
  const selftext = selftextElement ? getTextContent(selftextElement) : "";

  // Extract URL (for link posts)
  const urlElement = postElement.querySelector("a.title");
  const url = urlElement?.getAttribute("href") || `https://reddit.com${permalink}`;

  return {
    id,
    subreddit,
    title,
    selftext,
    author,
    url: `https://reddit.com${permalink}`,
    permalink: `https://reddit.com${permalink}`,
    score,
    num_comments,
    created_utc,
  };
}

/**
 * Extract all comments from HTML document
 */
function extractComments(document: Document, postId: string): RedditComment[] {
  const comments: RedditComment[] = [];
  const commentElements = document.querySelectorAll(".thing.comment");

  for (const element of commentElements) {
    try {
      const comment = extractSingleComment(element as Element, postId);
      if (comment) {
        comments.push(comment);
      }
    } catch (error) {
      // Skip malformed comments
      console.warn("Failed to parse comment:", error);
    }
  }

  return comments;
}

/**
 * Extract a single comment from an element
 */
function extractSingleComment(element: Element, postId: string): RedditComment | null {
  // Extract ID
  const fullname = element.getAttribute("data-fullname") || "";
  const id = extractId(fullname);

  if (!id) return null;

  // Extract author
  const authorElement = element.querySelector(".author");
  const author = getTextContent(authorElement) || "[deleted]";

  // Extract body
  const bodyElement = element.querySelector(".usertext-body .md");
  const body = bodyElement ? getTextContent(bodyElement) : "";

  if (!body) return null; // Skip comments without text

  // Extract score
  const scoreElement = element.querySelector(".score.unvoted, .score.likes, .score.dislikes");
  const scoreText = getTextContent(scoreElement);
  const score = scoreText ? extractNumber(scoreText) : 0;

  // Extract timestamp
  const timeElement = element.querySelector("time");
  const timestamp = timeElement?.getAttribute("datetime");
  const created_utc = timestamp ? Math.floor(new Date(timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000);

  // Determine parent ID (either parent comment or post)
  const parentElement = element.closest(".child")?.closest(".thing.comment");
  const parent_id = parentElement
    ? extractId(parentElement.getAttribute("data-fullname") || "")
    : postId;

  return {
    id,
    post_id: postId,
    author,
    body,
    score,
    parent_id,
    created_utc,
  };
}
