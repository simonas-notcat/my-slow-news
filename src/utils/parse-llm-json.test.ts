import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseLLMJson, SummaryResponseSchema, ExtractedClaimsSchema, type ExtractedClaims } from "./parse-llm-json";

describe("parseLLMJson", () => {
  const SimpleSchema = z.object({
    name: z.string(),
    value: z.number(),
  });

  const fallback = { name: "default", value: 0 };

  test("parses valid JSON directly", () => {
    const input = '{"name": "test", "value": 42}';
    const result = parseLLMJson(input, SimpleSchema, fallback);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "test", value: 42 });
    expect(result.error).toBeUndefined();
  });

  test("extracts JSON from markdown code blocks", () => {
    const input = `Here is the response:
\`\`\`json
{"name": "codeblock", "value": 123}
\`\`\`
That's the data.`;

    const result = parseLLMJson(input, SimpleSchema, fallback);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "codeblock", value: 123 });
  });

  test("extracts JSON from code blocks without language tag", () => {
    const input = `\`\`\`
{"name": "notag", "value": 456}
\`\`\``;

    const result = parseLLMJson(input, SimpleSchema, fallback);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "notag", value: 456 });
  });

  test("extracts JSON object from mixed text", () => {
    const input = 'The result is {"name": "inline", "value": 789} as you can see.';
    const result = parseLLMJson(input, SimpleSchema, fallback);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "inline", value: 789 });
  });

  test("handles nested JSON objects", () => {
    const NestedSchema = z.object({
      outer: z.object({
        inner: z.string(),
      }),
    });

    const input = 'Response: {"outer": {"inner": "nested"}} end';
    const result = parseLLMJson(input, NestedSchema, { outer: { inner: "default" } });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ outer: { inner: "nested" } });
  });

  test("returns fallback for invalid JSON", () => {
    const input = "This is not JSON at all";
    const result = parseLLMJson(input, SimpleSchema, fallback);

    expect(result.success).toBe(false);
    expect(result.data).toEqual(fallback);
    expect(result.error).toBeDefined();
  });

  test("returns fallback for malformed JSON", () => {
    const input = '{"name": "incomplete", value:}';
    const result = parseLLMJson(input, SimpleSchema, fallback);

    expect(result.success).toBe(false);
    expect(result.data).toEqual(fallback);
  });

  test("returns fallback when schema validation fails", () => {
    const input = '{"name": 123, "value": "not a number"}';
    const result = parseLLMJson(input, SimpleSchema, fallback);

    expect(result.success).toBe(false);
    expect(result.data).toEqual(fallback);
  });

  test("handles JSON with escaped quotes", () => {
    const input = '{"name": "test \\"quoted\\"", "value": 1}';
    const result = parseLLMJson(input, SimpleSchema, fallback);

    expect(result.success).toBe(true);
    expect(result.data.name).toBe('test "quoted"');
  });

  test("handles empty string", () => {
    const result = parseLLMJson("", SimpleSchema, fallback);

    expect(result.success).toBe(false);
    expect(result.data).toEqual(fallback);
  });
});

describe("SummaryResponseSchema", () => {
  test("parses valid summary response", () => {
    const input = `{
      "summary": "This is a test summary",
      "notable_comments": ["comment1", "comment2"],
      "sentiment": "positive",
      "key_topics": ["topic1"]
    }`;

    const result = parseLLMJson(input, SummaryResponseSchema, {
      summary: "",
      notable_comments: [],
      sentiment: "neutral",
      key_topics: [],
    });

    expect(result.success).toBe(true);
    expect(result.data.summary).toBe("This is a test summary");
    expect(result.data.sentiment).toBe("positive");
  });

  test("applies defaults for optional fields", () => {
    const input = '{"summary": "Just a summary"}';

    const result = parseLLMJson(input, SummaryResponseSchema, {
      summary: "",
      notable_comments: [],
      sentiment: "neutral",
      key_topics: [],
    });

    expect(result.success).toBe(true);
    expect(result.data.summary).toBe("Just a summary");
    expect(result.data.notable_comments).toEqual([]);
    expect(result.data.sentiment).toBe("neutral");
    expect(result.data.key_topics).toEqual([]);
  });
});

describe("ExtractedClaimsSchema", () => {
  test("parses valid claims", () => {
    const input = `{
      "claims": [
        {
          "subject": "Rust",
          "predicate": "is-safer-than",
          "object": "C++",
          "confidence": 0.9,
          "source_stance": "agrees"
        }
      ],
      "commenter_stances": {
        "agree_percentage": 80,
        "disagree_percentage": 20
      }
    }`;

    const result = parseLLMJson(input, ExtractedClaimsSchema, {
      claims: [],
      commenter_stances: {},
    });

    expect(result.success).toBe(true);
    const data = result.data as ExtractedClaims;
    expect(data.claims).toHaveLength(1);
    expect(data.claims[0].subject).toBe("Rust");
    expect(data.claims[0].confidence).toBe(0.9);
  });

  test("applies defaults for missing fields", () => {
    const input = '{"claims": [{"subject": "A", "predicate": "has", "object": "B"}]}';

    const result = parseLLMJson(input, ExtractedClaimsSchema, {
      claims: [],
      commenter_stances: {},
    });

    expect(result.success).toBe(true);
    const data = result.data as ExtractedClaims;
    expect(data.claims[0].confidence).toBe(0.5);
    expect(data.claims[0].source_stance).toBe("neutral");
  });
});
