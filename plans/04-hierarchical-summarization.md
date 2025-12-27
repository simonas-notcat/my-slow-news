# Plan: Hierarchical Thread Summarization

## Overview

Replace flat comment lists with hierarchical thread summarization that preserves conversation structure and argument development.

## Current State

- Comments flattened into bullet list
- Reply chains lose context
- Back-and-forth debates collapsed into isolated points
- `src/workflows/digest.ts:181-184` truncates to 300 chars

## Problem

- Nuanced arguments developed across replies are lost
- "This is wrong because..." loses what "this" refers to
- Technical discussions with code examples truncated
- Agreement/disagreement chains not captured

## Solution

1. Group comments into thread clusters by parent_id
2. Summarize each significant thread independently
3. Synthesize thread summaries into coherent narrative
4. For posts with many comments, use multi-stage processing

## Implementation Steps

1. Create `src/utils/thread-builder.ts`:
   - `buildThreadTree(comments)` - create parent-child structure
   - `getSignificantThreads(tree, minScore)` - filter meaningful threads
   - `flattenThread(thread)` - serialize thread for LLM

2. Create `src/utils/hierarchical-summarizer.ts`:
   - `summarizeThread(agent, thread)` - summarize single thread
   - `synthesizeThreadSummaries(agent, summaries)` - combine
   - `hierarchicalSummarize(agent, post, comments)` - main entry

3. Update `src/workflows/digest.ts`:
   - Use hierarchical summarization for posts with 20+ comments
   - Fall back to simple summarization for smaller discussions

## Data Structures

```typescript
interface ThreadNode {
  comment: RedditComment;
  children: ThreadNode[];
  depth: number;
  totalScore: number;  // Sum of this + all child scores
  replyCount: number;  // Total descendants
}

interface ThreadSummary {
  rootAuthor: string;
  topic: string;
  summary: string;
  sentiment: string;
  participantCount: number;
}
```

## Thread Selection Algorithm

```typescript
function getSignificantThreads(root: ThreadNode[], options: {
  minTotalScore: number;    // default: 50
  minReplyCount: number;    // default: 3
  maxThreads: number;       // default: 5
}): ThreadNode[];
```

## Prompt for Thread Summarization

```
Summarize this comment thread:

[Parent] u/author1 (+234): "Original point..."
  [Reply] u/author2 (+89): "Response..."
    [Reply] u/author1 (+45): "Clarification..."
  [Reply] u/author3 (+12): "Alternative view..."

Capture: main argument, counterpoints, resolution (if any)
```

## Success Criteria

- Thread context preserved in summaries
- Back-and-forth arguments captured coherently
- No increase in API costs for typical posts
- Graceful fallback for simple discussions
