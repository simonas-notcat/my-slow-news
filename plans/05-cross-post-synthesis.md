# Plan: Cross-Post Theme Synthesis

## Overview

Add a synthesis step after individual summaries to identify recurring themes, conflicting viewpoints, and emerging trends across multiple posts.

## Current State

- Each post summarized independently
- No connection between related posts
- Themes repeated across subreddits not identified
- Conflicting claims not surfaced

## Problem

- User misses patterns across communities
- Same announcement in r/rust and r/programming treated separately
- Conflicting expert opinions not highlighted
- Emerging trends buried in individual posts

## Solution

Add a new workflow step after summarization that:
1. Groups posts by detected topics
2. Identifies recurring themes
3. Surfaces conflicting viewpoints
4. Detects emerging trends

## Implementation Steps

1. Create `src/utils/theme-synthesizer.ts`:
   - `clusterByTopics(summaries)` - group by key_topics overlap
   - `synthesizeThemes(agent, clusters)` - generate theme analysis
   - `detectConflicts(claims)` - find opposing claims

2. Add new workflow step in `src/workflows/digest.ts`:
   - `synthesizeThemesStep` after `summarizeStep`
   - Produces `ThemeSynthesis` object

3. Update markdown generation:
   - Add "Today's Themes" section at top of digest
   - Highlight cross-post connections
   - Surface conflicting viewpoints

## Schema for Theme Synthesis

```typescript
const ThemeSynthesisSchema = z.object({
  recurring_themes: z.array(z.object({
    theme: z.string(),
    posts: z.array(z.string()),  // post IDs
    summary: z.string(),
    sentiment_spread: z.object({
      positive: z.number(),
      negative: z.number(),
      mixed: z.number(),
    }),
  })),
  conflicting_viewpoints: z.array(z.object({
    topic: z.string(),
    viewpoint_a: z.object({
      position: z.string(),
      sources: z.array(z.string()),
    }),
    viewpoint_b: z.object({
      position: z.string(),
      sources: z.array(z.string()),
    }),
  })),
  emerging_trends: z.array(z.object({
    trend: z.string(),
    evidence: z.array(z.string()),
    confidence: z.number(),
  })),
});
```

## Synthesis Prompt

```
Analyze these post summaries from today's tech news:

${summaries.map(s => `[${s.subreddit}] ${s.post.title}: ${s.summary.summary}`).join('\n\n')}

Identify:
1. RECURRING THEMES: Topics appearing in multiple posts
2. CONFLICTING VIEWPOINTS: Opposing opinions on same topic
3. EMERGING TRENDS: New patterns or developments

Return JSON with recurring_themes, conflicting_viewpoints, emerging_trends.
```

## Markdown Output

```markdown
# My Slow News - 2025-01-15

## Today's Themes

### Rust Ecosystem Growth
Discussed in: r/rust, r/programming (3 posts)
The Rust ecosystem continues to expand with new tooling...

### Conflicting Views: AI Code Assistants
- **Proponents** (r/programming): Productivity gains of 30-40%
- **Critics** (r/ExperiencedDevs): Quality concerns, over-reliance

### Emerging: WebAssembly in Backend
Multiple posts suggest growing interest in WASM for server-side...

---

## r/rust
[individual posts...]
```

## Success Criteria

- Themes section provides high-level overview
- Conflicting viewpoints clearly surfaced
- Cross-subreddit connections identified
- Single additional LLM call (cost-effective)
