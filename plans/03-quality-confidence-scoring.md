# Plan: Quality Confidence Scoring

## Overview

Add meta-signals to summaries indicating confidence level, controversy, and information density to help users assess summary reliability.

## Current State

- Summaries have no quality indicators
- Users can't tell if a summary captured nuance or missed context
- No signal for controversial vs. consensus topics

## Problem

- All summaries appear equally authoritative
- No way to flag summaries that may need manual review
- Missing context isn't surfaced to users

## Solution

Extend the summary schema with quality signals:
- `confidence`: How confident the model is in the summary (0-1)
- `controversy_level`: none/low/medium/high
- `information_density`: sparse/moderate/rich
- `missing_context`: Array of things that couldn't be determined

## Implementation Steps

1. Update `src/utils/parse-llm-json.ts`:
   - Extend `SummaryResponseSchema` with new fields
   - Add sensible defaults for backwards compatibility

2. Update `src/agents/index.ts`:
   - Add new fields to expected output format in instructions
   - Explain when to use each confidence/controversy level

3. Update `src/workflows/digest.ts`:
   - Handle new fields in schema definitions
   - Pass through to digest generation

4. Update markdown generation in `generateDigestStep`:
   - Display confidence badges
   - Highlight controversial topics
   - Show missing context warnings

## Schema Changes

```typescript
export const SummaryResponseSchema = z.object({
  summary: z.string(),
  notable_comments: z.array(z.string()).optional().default([]),
  sentiment: z.enum(["positive", "negative", "mixed", "neutral"]).optional().default("neutral"),
  key_topics: z.array(z.string()).optional().default([]),
  // New fields:
  confidence: z.number().min(0).max(1).optional().default(0.7),
  controversy_level: z.enum(["none", "low", "medium", "high"]).optional().default("none"),
  information_density: z.enum(["sparse", "moderate", "rich"]).optional().default("moderate"),
  missing_context: z.array(z.string()).optional().default([]),
});
```

## Markdown Output Enhancement

```markdown
### [Post Title](url)

**Author:** u/author | **Score:** 123 | **Confidence:** 85% | **Controversy:** Medium

Summary text here...

> **Note:** Missing context: linked article content, deleted comments
```

## Success Criteria

- Each summary includes confidence score
- Controversial topics are flagged
- Users can prioritize which summaries to verify manually
