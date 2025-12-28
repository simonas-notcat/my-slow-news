import { describe, test, expect } from "bun:test";
import {
  sanitizeMarkdown,
  formatHumanDate,
  slugify,
  claimToNaturalLanguage,
} from "./digest-format";

describe("sanitizeMarkdown", () => {
  test("escapes HTML angle brackets", () => {
    expect(sanitizeMarkdown("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert('xss')&lt;/script&gt;"
    );
  });

  test("escapes markdown link syntax", () => {
    expect(sanitizeMarkdown("[link](http://evil.com)")).toBe(
      "\\[link\\](http://evil.com)"
    );
  });

  test("leaves safe text unchanged", () => {
    expect(sanitizeMarkdown("Hello world")).toBe("Hello world");
  });

  test("handles mixed unsafe content", () => {
    expect(sanitizeMarkdown("<div>[test]</div>")).toBe(
      "&lt;div&gt;\\[test\\]&lt;/div&gt;"
    );
  });

  test("handles empty string", () => {
    expect(sanitizeMarkdown("")).toBe("");
  });
});

describe("formatHumanDate", () => {
  test("formats valid YYYY-MM-DD date", () => {
    expect(formatHumanDate("2025-12-27")).toBe("Saturday, December 27, 2025");
  });

  test("formats another valid date", () => {
    expect(formatHumanDate("2025-01-01")).toBe("Wednesday, January 1, 2025");
  });

  test("returns original for invalid format (no dashes)", () => {
    expect(formatHumanDate("20251227")).toBe("20251227");
  });

  test("returns original for invalid format (wrong separators)", () => {
    expect(formatHumanDate("2025/12/27")).toBe("2025/12/27");
  });

  test("returns original for invalid date (month 13)", () => {
    expect(formatHumanDate("2025-13-01")).toBe("2025-13-01");
  });

  test("returns original for invalid date (day 32)", () => {
    expect(formatHumanDate("2025-01-32")).toBe("2025-01-32");
  });

  test("returns original for empty string", () => {
    expect(formatHumanDate("")).toBe("");
  });

  test("returns original for random text", () => {
    expect(formatHumanDate("not a date")).toBe("not a date");
  });
});

describe("slugify", () => {
  test("converts title to lowercase slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("removes special characters", () => {
    expect(slugify("What's New? v2.0!")).toBe("what-s-new-v2-0");
  });

  test("collapses multiple dashes", () => {
    expect(slugify("Hello   World")).toBe("hello-world");
  });

  test("removes leading and trailing dashes", () => {
    expect(slugify("--Hello World--")).toBe("hello-world");
  });

  test("truncates to 50 characters", () => {
    const longTitle = "This is a very long title that should be truncated to exactly fifty characters or less";
    expect(slugify(longTitle).length).toBeLessThanOrEqual(50);
  });

  test("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  test("handles unicode characters", () => {
    expect(slugify("Café résumé")).toBe("caf-r-sum");
  });
});

describe("claimToNaturalLanguage", () => {
  test("converts claim to readable sentence", () => {
    const claim = {
      subject: "TypeScript",
      predicate: "is-better-than",
      object: "JavaScript",
      confidence: 0.85,
      source_stance: "agrees",
    };
    expect(claimToNaturalLanguage(claim)).toBe(
      "TypeScript is better than JavaScript *(85% confident)*"
    );
  });

  test("handles kebab-case in all fields", () => {
    const claim = {
      subject: "Boris-Cherny",
      predicate: "completed",
      object: "full-month-production-commits",
      confidence: 0.9,
      source_stance: "agrees",
    };
    expect(claimToNaturalLanguage(claim)).toBe(
      "Boris Cherny completed full month production commits *(90% confident)*"
    );
  });

  test("sanitizes XSS in subject", () => {
    const claim = {
      subject: "<script>evil</script>",
      predicate: "claims",
      object: "something",
      confidence: 0.5,
      source_stance: "neutral",
    };
    expect(claimToNaturalLanguage(claim)).toContain("&lt;script&gt;");
  });

  test("sanitizes markdown links in object", () => {
    const claim = {
      subject: "User",
      predicate: "shared",
      object: "[link](http://evil.com)",
      confidence: 0.7,
      source_stance: "neutral",
    };
    expect(claimToNaturalLanguage(claim)).toContain("\\[link\\]");
  });

  test("rounds confidence to whole percentage", () => {
    const claim = {
      subject: "A",
      predicate: "equals",
      object: "B",
      confidence: 0.777,
      source_stance: "agrees",
    };
    expect(claimToNaturalLanguage(claim)).toContain("*(78% confident)*");
  });
});
