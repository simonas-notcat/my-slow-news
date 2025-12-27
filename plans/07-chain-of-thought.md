# Plan: Chain-of-Thought for Controversial Topics

## Overview

Use structured chain-of-thought reasoning for controversial or complex discussions to ensure balanced, thorough analysis.

## Current State

- Single-pass summarization for all posts
- Controversial topics may get one-sided summaries
- Complex technical debates oversimplified
- No structured analysis process

## Problem

- Controversy detection happens after summarization
- First-pass summaries may miss nuance
- Model may anchor on majority viewpoint
- Complex debates need structured breakdown

## Solution

1. Detect controversial posts before summarization
2. Use chain-of-thought prompt for flagged posts
3. Structured analysis: claim → evidence → counter → synthesis
4. Ensure all major viewpoints represented

## Implementation Steps

1. Create `src/utils/controversy-detector.ts`:
   - `detectControversy(post, comments)` - pre-summarization check
   - Signals: score variance, reply depth, keyword patterns
   - Returns controversy score and detected camps

2. Create `src/utils/cot-summarizer.ts`:
   - `cotSummarize(agent, post, comments)` - structured analysis
   - Multi-step reasoning prompt
   - Explicit viewpoint enumeration

3. Update `src/workflows/digest.ts`:
   - Check controversy before summarization
   - Route to appropriate summarizer
   - Pass controversy metadata to output

## Controversy Detection

```typescript
interface ControversySignals {
  scoreVariance: number;      // High variance = controversial
  negativeRatio: number;      // % of negative-scored comments
  replyDepth: number;         // Deep threads = debate
  keywordHits: string[];      // "disagree", "wrong", "actually"
}

function detectControversy(
  post: RedditPost,
  comments: RedditComment[]
): { isControversial: boolean; score: number; signals: ControversySignals };
```

## Chain-of-Thought Prompt

```typescript
const COT_PROMPT = `Analyze this controversial discussion step by step:

Title: ${post.title}
Content: ${post.selftext}
Comments: ${formattedComments}

Think through this systematically:

## Step 1: MAIN CLAIM
What is the central assertion or topic being debated?

## Step 2: SUPPORTING ARGUMENTS
What evidence, examples, or reasoning support the main claim?
List the key points made by proponents.

## Step 3: OPPOSING ARGUMENTS
What counterarguments are presented?
List the key points made by critics.

## Step 4: COMMUNITY DIVISION
How is the community split on this issue?
Estimate percentages and identify distinct "camps".

## Step 5: NUANCES
What nuances, edge cases, or "it depends" factors are mentioned?

## Step 6: SYNTHESIS
Write a balanced summary that fairly represents all major viewpoints.

Now provide your final JSON response with the balanced summary.`;
```

## Detection Thresholds

```typescript
const CONTROVERSY_THRESHOLDS = {
  scoreVariance: 100,        // Std dev of comment scores
  negativeRatio: 0.15,       // 15%+ negative comments
  replyDepth: 4,             // Threads 4+ levels deep
  keywordDensity: 0.05,      // 5%+ controversy keywords
};

const CONTROVERSY_KEYWORDS = [
  'disagree', 'wrong', 'incorrect', 'actually',
  'no,', 'but', 'however', 'false', 'misleading',
  'unpopular opinion', 'devil\'s advocate',
];
```

## Output Enhancement

```typescript
// Additional fields for controversial posts
interface ControversySummary extends SummaryResponse {
  controversy_analysis: {
    main_claim: string;
    supporting_points: string[];
    opposing_points: string[];
    community_split: {
      camp_name: string;
      percentage: number;
      key_argument: string;
    }[];
  };
}
```

## Success Criteria

- Controversial posts identified before summarization
- Balanced representation of opposing viewpoints
- Community division quantified
- No increase in cost for non-controversial posts
