/**
 * Link Content Fetcher
 *
 * Fetches and extracts content from linked URLs in Reddit posts,
 * providing context for link-only posts.
 */

import type { RedditPost } from "../types";
import {
  extractTextFromHtml,
  extractTitle as extractTitleFromHtml,
  extractForDomain,
} from "./html-parser";

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

// Private IP ranges and cloud metadata endpoints to block (SSRF protection)
const BLOCKED_HOSTS = [
  // Cloud metadata endpoints
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.goog",
  // Localhost variants
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  // Link-local
  "169.254.",
];

const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 127.0.0.0/8
  /^0\.0\.0\.0$/, // 0.0.0.0
  /^::1$/, // IPv6 localhost
  /^fc00:/i, // IPv6 unique local
  /^fe80:/i, // IPv6 link-local
];

/**
 * Checks if a hostname points to a private/internal address (SSRF protection)
 */
export function isPrivateOrInternalHost(hostname: string): boolean {
  const lowerHost = hostname.toLowerCase();

  // Check blocked hosts list
  for (const blocked of BLOCKED_HOSTS) {
    if (lowerHost === blocked || lowerHost.startsWith(blocked)) {
      return true;
    }
  }

  // Check private IP patterns
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  // Block any hostname ending with .local or .internal
  if (lowerHost.endsWith(".local") || lowerHost.endsWith(".internal")) {
    return true;
  }

  return false;
}

/**
 * Checks if a post is a link post (no self text, external URL)
 */
export function isLinkPost(post: RedditPost): boolean {
  // Check if selftext is empty or very short
  const hasNoContent = !post.selftext || post.selftext.trim().length < 50;

  // Check if URL is external (not reddit)
  const isExternalUrl = Boolean(
    post.url &&
    !post.url.includes("reddit.com") &&
    !post.url.includes("redd.it") &&
    (post.url.startsWith("http://") || post.url.startsWith("https://"))
  );

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
 * Extracts main content from HTML using DOM-based parsing
 * Uses linkedom for robust HTML parsing instead of regex
 */
function extractMainContent(html: string): string {
  return extractTextFromHtml(html);
}

/**
 * Extracts title from HTML using DOM-based parsing
 */
function extractTitle(html: string): string {
  return extractTitleFromHtml(html);
}

/**
 * List of domains with custom extraction logic
 */
const CUSTOM_DOMAINS = [
  "github.com",
  "medium.com",
  "dev.to",
  "hashnode.dev",
  "substack.com",
];

/**
 * Fetches and extracts content from a URL
 */
export async function fetchLinkContent(
  url: string,
  options: LinkFetchOptions = {}
): Promise<LinkContent | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Parse URL to extract hostname for security checks
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname;
  const domain = hostname.replace(/^www\./, "");

  if (!domain) {
    return null;
  }

  // SSRF protection: block private/internal hosts
  if (isPrivateOrInternalHost(hostname)) {
    return {
      title: "",
      content: "",
      domain,
      fetchedAt: new Date(),
      truncated: false,
      error: "Blocked: private or internal host",
    };
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

    // Use domain-specific extractor if available, otherwise generic extraction
    const isCustomDomain = CUSTOM_DOMAINS.some((d) => domain.includes(d));
    let content = isCustomDomain
      ? extractForDomain(html, domain)
      : extractMainContent(html);

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
