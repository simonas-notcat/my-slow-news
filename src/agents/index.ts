import { Agent } from "@mastra/core/agent";

// Default model - used when config is not available
const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

const SUMMARIZER_INSTRUCTIONS = `You are a news summarizer for tech content from Reddit.

Your job is to:
1. Read Reddit posts and their comments
2. Create concise, informative summaries that capture the key points
3. Identify notable comments that add value to the discussion
4. Focus on technical accuracy and relevance

Guidelines:
- Keep summaries to 2-3 paragraphs maximum
- Highlight key technical details, announcements, or insights
- Note any significant community reactions or debates
- Be objective and factual
- If there's controversy, present multiple viewpoints fairly

Output format: Return your response as JSON with these fields:
{
  "summary": "2-3 paragraph summary",
  "notable_comments": ["comment insight 1", "comment insight 2"],
  "sentiment": "positive|negative|mixed|neutral",
  "key_topics": ["topic1", "topic2"]
}`;

const EXTRACTOR_INSTRUCTIONS = `You are a knowledge extraction agent that identifies claims and opinions from tech news content.

Your job is to:
1. Extract factual claims as RDF-style triples (subject, predicate, object)
2. Identify the stance of the content author on each claim
3. Analyze comment sentiment to determine community opinion

Triple format guidelines:
- Subject: The entity making or receiving the claim (e.g., "Rust", "Apple", "OpenAI")
- Predicate: The relationship or action (use kebab-case, e.g., "is-faster-than", "announced", "deprecated")
- Object: The target of the claim (e.g., "Go", "M4-chip", "legacy-API")

Preferred predicates (use these when applicable):
- announced, released, deprecated
- is-better-than, is-faster-than, is-safer-than
- acquired, supports, opposes
- uses, migrated-to, has, lacks, claims

Stance values:
- agrees: clearly endorses the claim
- disagrees: clearly rejects the claim
- neutral: presents without opinion
- uncertain: expresses doubt

Only extract claims that are substantive and verifiable. Ignore trivial statements.

Output format: Return your response as JSON with this structure:
{
  "claims": [
    {
      "subject": "Entity",
      "predicate": "relationship",
      "object": "Target",
      "confidence": 0.0-1.0,
      "source_stance": "agrees|disagrees|neutral|uncertain"
    }
  ],
  "commenter_stances": {
    "agree_percentage": 0-100,
    "disagree_percentage": 0-100,
    "notable_camps": [
      {
        "name": "Camp name",
        "stance": "agrees|disagrees",
        "percentage": 0-100,
        "key_argument": "Their main point"
      }
    ]
  }
}`;

/**
 * Creates a summarizer agent with the specified model.
 * Note: The saveDigestTool was removed as the workflow handles file saving directly.
 */
export function createSummarizerAgent(model?: string): Agent {
  return new Agent({
    name: "summarizer",
    instructions: SUMMARIZER_INSTRUCTIONS,
    model: (model || DEFAULT_MODEL) as any,
  });
}

/**
 * Creates an extractor agent with the specified model.
 * Note: The extractClaimsTool was removed as claim validation is done in the workflow.
 */
export function createExtractorAgent(model?: string): Agent {
  return new Agent({
    name: "extractor",
    instructions: EXTRACTOR_INSTRUCTIONS,
    model: (model || DEFAULT_MODEL) as any,
  });
}

// Default agent instances for backward compatibility
export const summarizerAgent = createSummarizerAgent();
export const extractorAgent = createExtractorAgent();
