# PRD: Refined Digest Template Implementation

## Overview

Implement the digest output format defined in `digests/TEMPLATE-REFINED.md` to produce more actionable, reader-friendly daily digests with prioritized topics, narrative summaries, and confidence-rated claims.

## Goals

1. Replace current per-subreddit post grouping with unified "Top Discussions" ranked by importance
2. Generate "What Matters" summary table with AI-determined priority, impact, and status
3. Add "The Story" narrative format to each post while preserving claims list
4. Implement "Notable Threads" and "High-Confidence Claims" sections per post
5. Enhance "Conflicting Viewpoints" with more specific opposing viewpoints
6. Use relative threshold for "Low-Activity Posts" collapsible section

## Non-Goals

- Changing the underlying data model or claim extraction logic
- Modifying the database schema
- Real-time digest updates

---

## Detailed Requirements

### 1. "What Matters" Table

**Current:** Table with Priority, Discussion (link), "Why It Matters" columns
**Target:** Table with Topic, Impact, Status columns + priority icons

| Requirement | Details |
|-------------|---------|
| Generation method | Single AI call analyzes all posts together, produces summary table |
| Priority icons | 🔴 Urgent, 🟡 Developing, 🟢 Informational - AI determines based on impact |
| Topic column | Short topic label (not post title) |
| Impact column | ~50 chars max, concise impact description |
| Status column | Both community and official response state combined |

**AI Prompt Requirements:**
- Input: All summarized posts for the day
- Output: JSON array of `{ priority: "urgent"|"developing"|"informational", topic: string, impact: string, status: string }`
- Should identify 3-6 most significant topics across all posts

### 2. Top Discussions Section

**Current:** Posts grouped by subreddit (`## r/ClaudeAI`)
**Target:** Single `## Top Discussions` section, posts ranked by importance

| Requirement | Details |
|-------------|---------|
| Ranking | AI determines importance (not just score) |
| Post header | `### [Title](old.reddit.com/...) • r/subreddit` |
| Metadata line | `**Score: {n} • Confidence: {n}%**` + optional `• Controversy: Medium/High` |
| Threshold | Bottom 20% of posts go to "Low-Activity Posts" section |

### 3. Per-Post Format

Each post in Top Discussions includes:

#### 3.1 "The Story" Section
- Narrative paragraph summarizing the discussion
- AI-generated during summarization
- 2-4 sentences explaining what happened and why it matters

#### 3.2 "Notable Threads" Section
- AI identifies 2-4 notable conversation threads during summarization
- Format: Bullet list with thread description
- Example: `- Changelog parser bug traced to semver failure on date format; workarounds shared within hours`

#### 3.3 "High-Confidence Claims" Section
- Claims with verification markers and confidence
- Format: `- ✓ Claim text (95%)` for verified, `- ? Claim text (30%)` for unverified
- AI assigns both confidence percentage and verification status during extraction
- Show top 3-5 claims per post

### 4. Conflicting Viewpoints Table

**Current:** Basic table format exists
**Target:** Enhanced with more specific opposing viewpoints

| Requirement | Details |
|-------------|---------|
| Enhancement | AI produces specific, contrasting viewpoints per topic |
| Format | Table with Topic, View A, View B columns |
| Source | Synthesized from posts discussing same topic with different stances |

### 5. Emerging Patterns Section

**Current:** Bullet list with patterns
**Target:** Same format, ensure confidence % comes from AI

| Requirement | Details |
|-------------|---------|
| Confidence source | AI's stated confidence in the pattern |
| Format | `• **Pattern Name** ({n}% confidence)\n  Description` |

### 6. Low-Activity Posts Section

| Requirement | Details |
|-------------|---------|
| Threshold | Bottom 20% of posts by importance ranking |
| Format | Collapsible `<details>` section |
| Content | Abbreviated format - title, score, one-line summary |

---

## Technical Implementation

### Modified Files

| File | Changes |
|------|---------|
| `src/workflows/digest.ts` | New step for "What Matters" synthesis, modified digest generation |
| `src/agents/index.ts` | New/modified prompts for narrative summary, notable threads, claim verification |
| `src/utils/theme-synthesizer.ts` | Extend to produce "What Matters" table format |
| `src/utils/digest-formatter.ts` | New file - formats digest sections to match template |

### New AI Prompts Required

1. **What Matters Synthesizer**
   - Input: All post summaries
   - Output: Priority table entries

2. **Story Narrator**
   - Input: Post + comments + existing summary
   - Output: 2-4 sentence narrative

3. **Notable Thread Identifier**
   - Input: Comment threads
   - Output: 2-4 notable thread descriptions

4. **Claim Verifier**
   - Input: Extracted claim
   - Output: Confidence % + verification status (✓ or ?)

### Workflow Changes

```
Current:
fetch → summarize → extract-claims → generate-digest → save

New:
fetch → summarize-with-story → extract-verified-claims → synthesize-what-matters → rank-posts → generate-refined-digest → save
```

### Config Additions

```yaml
digest:
  format: refined  # or "legacy" for old format
  what_matters:
    max_topics: 6
  top_discussions:
    low_activity_percentile: 20  # bottom 20% go to low-activity
  notable_threads:
    max_per_post: 4
  claims:
    max_per_post: 5
```

---

## Success Criteria

1. Generated digest matches `TEMPLATE-REFINED.md` structure
2. "What Matters" table correctly prioritizes urgent vs informational topics
3. "The Story" narratives are coherent and informative
4. "Notable Threads" highlight genuinely interesting discussions
5. Claim confidence percentages align with AI's actual certainty
6. Low-activity threshold correctly identifies bottom 20% of posts

---

## Open Questions

1. Should we keep the legacy format as a fallback option via config?
2. How to handle days with very few posts (< 5) - skip percentile logic?
3. Should "What Matters" topics link to specific posts or just be standalone summaries?

---

## Estimated Scope

- **New AI prompts**: 4
- **Modified files**: 4-5
- **New files**: 1-2
- **Config changes**: New `digest` section