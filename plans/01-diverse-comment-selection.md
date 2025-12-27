# Plan: Diverse Comment Selection

## Overview

Replace the current score-only comment selection with a diversity-aware algorithm that ensures multiple viewpoints are represented in summaries.

## Current State

- `src/workflows/digest.ts:181-184` selects top 10 comments by score
- Comments are sorted by score descending, taking first 10
- This biases toward consensus views, missing contrarian perspectives

## Problem

- High-score comments often echo the same sentiment
- Minority viewpoints with valuable insights get excluded
- Controversial discussions lose nuance
- Reply chains that develop arguments are flattened

## Solution

Create a `selectDiverseComments()` utility that balances:
1. **Top scored** (40%) - consensus/popular views
2. **Most replied-to** (20%) - discussion starters
3. **Controversial** (20%) - comments with mixed reactions
4. **Contrarian** (20%) - lower score but substantive

## Implementation Steps

1. Create `src/utils/comment-selector.ts` with:
   - `selectDiverseComments(comments, count, options)` function
   - Scoring algorithm for diversity
   - Configurable weights for each category

2. Update `src/workflows/digest.ts`:
   - Import and use `selectDiverseComments`
   - Replace `.slice(0, 10)` with diversity selection

3. Add tests in `src/utils/comment-selector.test.ts`

## API Design

```typescript
interface CommentSelectionOptions {
  topScoredWeight?: number;      // default: 0.4
  repliedToWeight?: number;      // default: 0.2
  controversialWeight?: number;  // default: 0.2
  contrarianWeight?: number;     // default: 0.2
  minBodyLength?: number;        // default: 50 chars
}

function selectDiverseComments(
  comments: RedditComment[],
  count: number,
  options?: CommentSelectionOptions
): RedditComment[];
```

## Success Criteria

- Summaries include multiple viewpoints on controversial topics
- Unit tests verify diversity algorithm
- No performance regression
