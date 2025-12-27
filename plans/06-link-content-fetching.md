# Plan: Link Content Fetching

## Overview

For link posts (posts without selftext that link to external articles), fetch and summarize the linked content to provide context.

## Current State

- Link posts show "(Link post - no text content)"
- External article/repo content not included
- Summaries based only on title and comments
- `src/workflows/digest.ts:178` handles empty selftext

## Problem

- ~40% of Reddit posts are link posts
- Comments discuss content user can't see
- Summary lacks crucial context
- Notable comments reference unseen article points

## Solution

1. Detect link posts (no selftext, external URL)
2. Fetch linked content using WebFetch-style approach
3. Extract/summarize article text
4. Include in summarization prompt

## Implementation Steps

1. Create `src/utils/link-fetcher.ts`:
   - `isLinkPost(post)` - detect link posts
   - `fetchLinkContent(url)` - fetch and extract text
   - `summarizeLinkContent(text, maxLength)` - truncate intelligently
   - Handle common domains (GitHub, Medium, blogs)

2. Update `src/workflows/digest.ts`:
   - Check for link posts before summarization
   - Fetch content with timeout/fallback
   - Include in prompt as "Linked Article Content"

3. Add domain-specific extractors:
   - GitHub: README, description
   - News sites: Article body
   - Blogs: Main content

## Link Fetcher API

```typescript
interface LinkContent {
  title: string;
  content: string;
  domain: string;
  fetchedAt: Date;
  truncated: boolean;
}

async function fetchLinkContent(
  url: string,
  options?: {
    maxLength?: number;      // default: 5000 chars
    timeout?: number;        // default: 10000ms
    allowedDomains?: string[]; // whitelist
  }
): Promise<LinkContent | null>;
```

## Domain Handlers

```typescript
const domainHandlers: Record<string, (html: string) => string> = {
  'github.com': extractGitHubContent,
  'medium.com': extractMediumArticle,
  'dev.to': extractDevToArticle,
  'default': extractMainContent,  // Generic extraction
};
```

## Updated Summarization Prompt

```
Summarize this Reddit post and its comments:

Title: ${post.title}
Author: u/${post.author}
Score: ${post.score} upvotes
URL: ${post.url}

${linkContent ? `
Linked Article Content:
---
${linkContent.title}

${linkContent.content}
---
` : '(Link post - external content could not be fetched)'}

Top Comments (${comments.length} total):
...
```

## Error Handling

- Timeout: Fall back to title-only summary
- Blocked: Note in summary that content was inaccessible
- Rate limited: Queue for retry, continue with other posts
- Invalid content: Skip extraction, note in missing_context

## Configuration

```yaml
# config.yaml
link_fetching:
  enabled: true
  timeout_ms: 10000
  max_content_length: 5000
  allowed_domains:
    - github.com
    - medium.com
    - dev.to
    - blog.*
  blocked_domains:
    - paywalled-site.com
```

## Success Criteria

- Link posts include article context
- GitHub repos show README excerpts
- Graceful degradation on fetch failures
- No significant latency increase (parallel fetching)
