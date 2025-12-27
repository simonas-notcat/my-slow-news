/**
 * Link Content Fetcher
 *
 * Fetches and extracts content from linked URLs in Reddit posts,
 * providing context for link-only posts.
 */

import type { RedditPost } from "../types";

export interface LinkContent {
  title: string;
  content: string;
  domain: string;
  fetchedAt: Date;
  truncated: boolean;
  error?: string;
}

export interface LinkFetchOptions {
  maxLength?: number;
  timeout?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
}

const DEFAULT_OPTIONS: Required<LinkFetchOptions> = {
  maxLength: 5000,
  timeout: 10000,
  allowedDomains: [],
  blockedDomains: [
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "tiktok.com",
  ],
};

/**
 * Checks if a post is a link post (no self text, external URL)
 */
export function isLinkPost(post: RedditPost): boolean {
  // Check if selftext is empty or very short
  const hasNoContent = !post.selftext || post.selftext.trim().length < 50;

  // Check if URL is external (not reddit)
  const isExternalUrl =
    post.url &&
    !post.url.includes("reddit.com") &&
    !post.url.includes("redd.it") &&
    (post.url.startsWith("http://") || post.url.startsWith("https://"));

  return hasNoContent && isExternalUrl;
}

/**
 * Extracts domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Checks if domain is allowed for fetching
 */
export function isDomainAllowed(
  domain: string,
  options: LinkFetchOptions = {}
): boolean {
  const { allowedDomains = [], blockedDomains = DEFAULT_OPTIONS.blockedDomains } = options;

  // Check blocklist first
  if (blockedDomains.some((blocked) => domain.includes(blocked))) {
    return false;
  }

  // If allowlist is specified, check it
  if (allowedDomains.length > 0) {
    return allowedDomains.some((allowed) => domain.includes(allowed));
  }

  return true;
}

/**
 * Extracts main content from HTML
 * Simple extraction focused on article content
 */
function extractMainContent(html: string): string {
  // Remove scripts, styles, and other non-content elements
  let content = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Try to find article or main content
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  if (articleMatch) {
    content = articleMatch[1];
  } else if (mainMatch) {
    content = mainMatch[1];
  }

  // Extract text from remaining HTML
  content = content
    .replace(/<[^>]+>/g, " ") // Remove HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  return content;
}

/**
 * Extracts title from HTML
 */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].trim();
  }

  return "";
}

/**
 * Extracts GitHub repository content
 */
function extractGitHubContent(html: string): string {
  // Try to find README content
  const readmeMatch = html.match(
    /<article[^>]*class="[^"]*markdown-body[^"]*"[^>]*>([\s\S]*?)<\/article>/i
  );

  if (readmeMatch) {
    return extractMainContent(readmeMatch[1]);
  }

  // Fallback to description
  const descMatch = html.match(
    /<p[^>]*class="[^"]*f4[^"]*"[^>]*>([^<]+)<\/p>/i
  );
  if (descMatch) {
    return descMatch[1].trim();
  }

  return extractMainContent(html);
}

/**
 * Domain-specific content extractors
 */
const domainExtractors: Record<string, (html: string) => string> = {
  "github.com": extractGitHubContent,
  "medium.com": extractMainContent,
  "dev.to": extractMainContent,
  "hashnode.dev": extractMainContent,
  "substack.com": extractMainContent,
};

/**
 * Fetches and extracts content from a URL
 */
export async function fetchLinkContent(
  url: string,
  options: LinkFetchOptions = {}
): Promise<LinkContent | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const domain = extractDomain(url);

  if (!domain) {
    return null;
  }

  if (!isDomainAllowed(domain, opts)) {
    return {
      title: "",
      content: "",
      domain,
      fetchedAt: new Date(),
      truncated: false,
      error: `Domain ${domain} is blocked`,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MySlowNews/1.0; +https://github.com/my-slow-news)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        title: "",
        content: "",
        domain,
        fetchedAt: new Date(),
        truncated: false,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const title = extractTitle(html);

    // Use domain-specific extractor if available
    const extractor = Object.entries(domainExtractors).find(([d]) =>
      domain.includes(d)
    );
    let content = extractor ? extractor[1](html) : extractMainContent(html);

    // Truncate if needed
    const truncated = content.length > opts.maxLength;
    if (truncated) {
      content = content.slice(0, opts.maxLength) + "...";
    }

    return {
      title,
      content,
      domain,
      fetchedAt: new Date(),
      truncated,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      title: "",
      content: "",
      domain,
      fetchedAt: new Date(),
      truncated: false,
      error: errorMessage.includes("abort")
        ? "Timeout"
        : errorMessage,
    };
  }
}

/**
 * Formats link content for inclusion in summarization prompt
 */
export function formatLinkContentForPrompt(
  content: LinkContent | null,
  maxLength = 2000
): string {
  if (!content) {
    return "(Link post - external content could not be fetched)";
  }

  if (content.error) {
    return `(Link post - ${content.error})`;
  }

  if (!content.content || content.content.length < 50) {
    return `(Link post to ${content.domain} - content extraction failed)`;
  }

  let text = "";
  if (content.title) {
    text += `Linked Article: "${content.title}"\n`;
  }
  text += `Source: ${content.domain}\n\n`;

  const truncatedContent =
    content.content.length > maxLength
      ? content.content.slice(0, maxLength) + "..."
      : content.content;

  text += truncatedContent;

  return text;
}

/**
 * Batch fetches content for multiple link posts
 */
export async function fetchLinkContentsParallel(
  posts: RedditPost[],
  options: LinkFetchOptions = {}
): Promise<Map<string, LinkContent | null>> {
  const results = new Map<string, LinkContent | null>();

  const linkPosts = posts.filter(isLinkPost);

  const fetches = linkPosts.map(async (post) => {
    const content = await fetchLinkContent(post.url, options);
    return { postId: post.id, content };
  });

  const settled = await Promise.allSettled(fetches);

  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.set(result.value.postId, result.value.content);
    }
  }

  return results;
}
