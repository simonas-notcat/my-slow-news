# Plan: Enhanced Prompts with Few-Shot Examples

## Overview

Improve summarization quality by adding structured few-shot examples to the agent instructions, providing clear templates for consistent output.

## Current State

- `src/agents/index.ts:6-27` has generic instructions
- No concrete examples of expected output
- LLM must infer format from description alone

## Problem

- Output quality varies between runs
- JSON structure sometimes deviates from expected format
- No guidance on tone, depth, or style
- Controversial topics handled inconsistently

## Solution

Add 2-3 few-shot examples demonstrating:
1. Standard tech announcement summary
2. Controversial discussion with multiple viewpoints
3. Link post with external content reference

## Implementation Steps

1. Update `SUMMARIZER_INSTRUCTIONS` in `src/agents/index.ts`:
   - Add `<examples>` section with concrete input/output pairs
   - Include edge cases (link posts, controversial topics)
   - Specify handling of missing information

2. Update `EXTRACTOR_INSTRUCTIONS` similarly:
   - Add claim extraction examples
   - Show proper RDF triple formatting
   - Demonstrate stance analysis

## Example Addition

```typescript
const SUMMARIZER_INSTRUCTIONS = `You are a news summarizer for tech content from Reddit.

[existing instructions...]

<examples>
<example>
<input>
Title: "Rust 2024 edition officially released"
Author: u/rust_team
Score: 2847 upvotes
Content: "We're excited to announce the Rust 2024 edition..."
Comments:
- u/dev123 (456 pts): "The new async features are game-changing"
- u/cpp_fan (234 pts): "Migration path looks smooth this time"
- u/skeptic (-12 pts): "Still waiting for better compile times"
</input>
<output>
{
  "summary": "The Rust team has officially released the 2024 edition, featuring significant improvements to async/await ergonomics and a streamlined migration path from previous editions. The community response is overwhelmingly positive, with developers praising the async improvements while some note that compile time concerns remain unaddressed.",
  "notable_comments": [
    "Praise for async improvements making concurrent code more intuitive (u/dev123)",
    "Recognition of improved migration tooling compared to previous editions (u/cpp_fan)",
    "Ongoing concern about compile times despite other improvements (u/skeptic)"
  ],
  "sentiment": "positive",
  "key_topics": ["rust", "programming-languages", "async", "release"]
}
</output>
</example>
</examples>`;
```

## Success Criteria

- More consistent JSON structure across summaries
- Better handling of controversial topics
- Notable comments capture diverse viewpoints
