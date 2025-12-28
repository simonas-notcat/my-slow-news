/**
 * HTML Parser Utilities
 *
 * Consolidated HTML parsing using linkedom's DOM API.
 * Provides robust content extraction, entity decoding, and sanitization.
 */

import { parseHTML } from "linkedom";

/**
 * Common HTML entities mapping for decoding
 */
const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
  "&mdash;": "—",
  "&ndash;": "–",
  "&lsquo;": "'",
  "&rsquo;": "'",
  "&ldquo;": "\u201C",
  "&rdquo;": "\u201D",
  "&hellip;": "…",
  "&bull;": "•",
  "&middot;": "·",
  "&deg;": "°",
  "&plusmn;": "±",
  "&times;": "×",
  "&divide;": "÷",
  "&euro;": "€",
  "&pound;": "£",
  "&yen;": "¥",
  "&cent;": "¢",
  "&sect;": "§",
  "&para;": "¶",
  "&dagger;": "†",
  "&Dagger;": "‡",
  "&laquo;": "«",
  "&raquo;": "»",
};

/**
 * Decode HTML entities in text
 * Handles named entities, decimal entities (&#123;), and hex entities (&#x7B;)
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";

  return text
    // Named entities
    .replace(/&[a-zA-Z]+;/g, (entity) => HTML_ENTITIES[entity] || entity)
    // Decimal entities (&#123;)
    .replace(/&#(\d+);/g, (_, code) => {
      const num = parseInt(code, 10);
      return num > 0 && num <= 0x10ffff ? String.fromCodePoint(num) : "";
    })
    // Hex entities (&#x7B; or &#X7B;)
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => {
      const num = parseInt(hex, 16);
      return num > 0 && num <= 0x10ffff ? String.fromCodePoint(num) : "";
    });
}

/**
 * Parse HTML string into a Document object
 */
export function parseDocument(html: string): Document {
  const { document } = parseHTML(html);
  return document;
}

/**
 * Selectors for elements that typically don't contain main content
 */
const NON_CONTENT_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "iframe",
  "form",
  "button",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[role='complementary']",
  ".nav",
  ".navbar",
  ".navigation",
  ".menu",
  ".sidebar",
  ".footer",
  ".header",
  ".advertisement",
  ".ad",
  ".ads",
  ".social-share",
  ".comments",
  ".related-posts",
];

/**
 * Selectors for main content areas (in priority order)
 */
const CONTENT_SELECTORS = [
  "article",
  "[role='main']",
  "main",
  ".post-content",
  ".article-content",
  ".entry-content",
  ".content",
  ".post-body",
  ".article-body",
  ".markdown-body",
  "#content",
  "#main",
];

/**
 * Minimum text length (in characters) for an element to be considered
 * as having meaningful content. Elements with less text are skipped
 * when searching for main content containers.
 */
const MIN_CONTENT_LENGTH = 100;

/**
 * Remove non-content elements from document
 */
export function removeNonContentElements(document: Document): void {
  const selector = NON_CONTENT_SELECTORS.join(", ");
  document.querySelectorAll(selector).forEach((el) => el.remove());
}

/**
 * Find the main content element in a document
 * Returns the best match based on content selectors, or body as fallback
 */
export function findMainContent(document: Document): Element | null {
  // Try each content selector in priority order
  for (const selector of CONTENT_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) {
      // Verify it has meaningful content
      const text = element.textContent?.trim() || "";
      if (text.length > MIN_CONTENT_LENGTH) {
        return element;
      }
    }
  }

  // Fallback to body
  return document.body || null;
}

/**
 * Calculate a content score for an element based on text density
 * Higher scores indicate better content candidates
 */
function calculateContentScore(element: Element): number {
  const text = element.textContent || "";
  const textLength = text.trim().length;

  // Count paragraph tags
  const paragraphs = element.querySelectorAll("p").length;

  // Penalize for links (navigation-heavy content)
  const links = element.querySelectorAll("a").length;
  const linkDensity = links > 0 ? textLength / links : textLength;

  // Score based on text length, paragraph count, and link density
  return textLength * 0.5 + paragraphs * 50 + linkDensity * 0.1;
}

/**
 * Find the best content container using a scoring algorithm
 * Similar to Readability's approach
 */
export function findBestContentContainer(document: Document): Element | null {
  // First try explicit content selectors
  const explicit = findMainContent(document);
  if (explicit && explicit.tagName !== "BODY") {
    return explicit;
  }

  // Score potential content containers
  const candidates: Array<{ element: Element; score: number }> = [];

  // Look for divs and sections with substantial content
  document.querySelectorAll("div, section").forEach((el) => {
    const text = el.textContent?.trim() || "";
    if (text.length > 200) {
      candidates.push({
        element: el,
        score: calculateContentScore(el),
      });
    }
  });

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Return the best candidate, or body as fallback
  return candidates[0]?.element || document.body || null;
}

/**
 * Extract plain text from an element, normalizing whitespace
 */
export function extractText(element: Element | null): string {
  if (!element) return "";

  const text = element.textContent || "";
  return decodeHtmlEntities(text)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract text content from HTML string
 * Removes non-content elements and extracts main content
 */
export function extractTextFromHtml(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  try {
    const document = parseDocument(html);
    removeNonContentElements(document);

    const mainContent = findBestContentContainer(document);
    return extractText(mainContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`HTML text extraction failed: ${message}`);
    return "";
  }
}

/**
 * Extract title from HTML document
 * Tries <title>, then <h1>, then og:title meta tag
 */
export function extractTitle(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  try {
    const document = parseDocument(html);

    // Try <title> tag
    const titleEl = document.querySelector("title");
    if (titleEl?.textContent) {
      return decodeHtmlEntities(titleEl.textContent.trim());
    }

    // Try og:title meta tag
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      const content = ogTitle.getAttribute("content");
      if (content) {
        return decodeHtmlEntities(content.trim());
      }
    }

    // Try first <h1>
    const h1 = document.querySelector("h1");
    if (h1?.textContent) {
      return decodeHtmlEntities(h1.textContent.trim());
    }

    return "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Title extraction failed: ${message}`);
    return "";
  }
}

/**
 * Extract article content with metadata
 */
export interface ExtractedArticle {
  title: string;
  content: string;
  excerpt: string;
}

/**
 * Extract article content from HTML (Readability-like extraction)
 */
export function extractArticle(html: string): ExtractedArticle {
  const title = extractTitle(html);
  const content = extractTextFromHtml(html);
  const excerpt = content.slice(0, 300).trim() + (content.length > 300 ? "..." : "");

  return { title, content, excerpt };
}

/**
 * Domain-specific content extraction configurations
 */
interface DomainConfig {
  contentSelector: string;
  removeSelectors?: string[];
}

const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  "github.com": {
    contentSelector: ".markdown-body, .readme",
    removeSelectors: [".octicon", ".anchor"],
  },
  "medium.com": {
    contentSelector: "article",
    removeSelectors: [".metabar", ".postActions"],
  },
  "dev.to": {
    contentSelector: "#article-body, .crayons-article__body",
  },
  "substack.com": {
    contentSelector: ".body, .post-content",
  },
};

/**
 * Extract content using domain-specific configuration
 */
export function extractForDomain(html: string, domain: string): string {
  const config = Object.entries(DOMAIN_CONFIGS).find(([d]) =>
    domain.includes(d)
  )?.[1];

  if (!config) {
    return extractTextFromHtml(html);
  }

  try {
    const document = parseDocument(html);

    // Remove domain-specific noise elements
    if (config.removeSelectors) {
      document
        .querySelectorAll(config.removeSelectors.join(", "))
        .forEach((el) => el.remove());
    }

    // Remove standard non-content elements
    removeNonContentElements(document);

    // Find content using domain-specific selector
    const content = document.querySelector(config.contentSelector);
    if (content) {
      return extractText(content);
    }

    // Fallback to generic extraction
    return extractText(findBestContentContainer(document));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Domain extraction failed for ${domain}: ${message}`);
    return extractTextFromHtml(html);
  }
}

/**
 * Sanitize text for safe markdown output
 * Escapes characters that have special meaning in markdown
 */
export function sanitizeForMarkdown(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`");
}

/**
 * Get text content safely from an element
 */
export function getTextContent(element: Element | null): string {
  return element?.textContent?.trim() || "";
}

/**
 * Extract a number from text (e.g., "123 points" -> 123)
 */
export function extractNumber(text: string): number {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
