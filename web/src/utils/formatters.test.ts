import { describe, test, expect } from "vitest";
import {
  getStanceIndicator,
  formatConfidence,
  formatDate,
  formatRelativeDate,
  formatFiltersDisplay,
  truncate,
} from "./formatters";

describe("getStanceIndicator", () => {
  test("returns correct indicator for agrees", () => {
    const result = getStanceIndicator("agrees");
    expect(result.symbol).toBe("✓");
    expect(result.colorClass).toBe("text-green-600");
    expect(result.label).toBe("agreed");
  });

  test("returns correct indicator for disagrees", () => {
    const result = getStanceIndicator("disagrees");
    expect(result.symbol).toBe("✗");
    expect(result.colorClass).toBe("text-red-600");
    expect(result.label).toBe("disagreed");
  });

  test("returns correct indicator for neutral", () => {
    const result = getStanceIndicator("neutral");
    expect(result.symbol).toBe("~");
    expect(result.colorClass).toBe("text-yellow-600");
    expect(result.label).toBe("neutral");
  });

  test("returns correct indicator for uncertain", () => {
    const result = getStanceIndicator("uncertain");
    expect(result.symbol).toBe("?");
    expect(result.colorClass).toBe("text-blue-600");
    expect(result.label).toBe("uncertain");
  });

  test("returns unrated indicator for undefined", () => {
    const result = getStanceIndicator(undefined);
    expect(result.symbol).toBe("○");
    expect(result.colorClass).toBe("text-gray-400");
    expect(result.label).toBe("unrated");
  });
});

describe("formatConfidence", () => {
  test("formats 0 confidence", () => {
    const result = formatConfidence(0);
    expect(result.percentage).toBe(0);
    expect(result.barWidth).toBe("0%");
  });

  test("formats 1 (100%) confidence", () => {
    const result = formatConfidence(1);
    expect(result.percentage).toBe(100);
    expect(result.barWidth).toBe("100%");
  });

  test("formats 0.75 confidence", () => {
    const result = formatConfidence(0.75);
    expect(result.percentage).toBe(75);
    expect(result.barWidth).toBe("75%");
  });

  test("rounds confidence percentage", () => {
    const result = formatConfidence(0.666);
    expect(result.percentage).toBe(67);
    expect(result.barWidth).toBe("67%");
  });
});

describe("formatDate", () => {
  test("formats Date object", () => {
    const date = new Date("2025-01-15T10:30:00Z");
    const result = formatDate(date);
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  test("formats ISO string", () => {
    const result = formatDate("2025-01-15T10:30:00Z");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });
});

describe("formatRelativeDate", () => {
  test("returns 'today' for today's date", () => {
    const today = new Date();
    const result = formatRelativeDate(today);
    expect(result).toBe("today");
  });

  test("returns 'yesterday' for yesterday's date", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = formatRelativeDate(yesterday);
    expect(result).toBe("yesterday");
  });

  test("returns 'X days ago' for recent dates", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const result = formatRelativeDate(threeDaysAgo);
    expect(result).toBe("3 days ago");
  });

  test("returns 'X weeks ago' for older dates", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const result = formatRelativeDate(twoWeeksAgo);
    expect(result).toBe("2 weeks ago");
  });

  test("returns 'X months ago' for very old dates", () => {
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const result = formatRelativeDate(twoMonthsAgo);
    expect(result).toBe("2 months ago");
  });
});

describe("formatFiltersDisplay", () => {
  test("returns 'all claims' for default filters", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "all" as const,
    };
    const result = formatFiltersDisplay(filters);
    expect(result).toBe("all claims");
  });

  test("includes predicate filter", () => {
    const filters = {
      predicate: "is-better-than",
      subject: null,
      days: null,
      stanceFilter: "all" as const,
    };
    const result = formatFiltersDisplay(filters);
    expect(result).toContain("predicate:is-better-than");
  });

  test("includes subject filter", () => {
    const filters = {
      predicate: null,
      subject: "Rust",
      days: null,
      stanceFilter: "all" as const,
    };
    const result = formatFiltersDisplay(filters);
    expect(result).toContain("subject:Rust");
  });

  test("includes days filter", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: 30,
      stanceFilter: "all" as const,
    };
    const result = formatFiltersDisplay(filters);
    expect(result).toContain("30 days");
  });

  test("includes stance filter when not 'all'", () => {
    const filters = {
      predicate: null,
      subject: null,
      days: null,
      stanceFilter: "unrated" as const,
    };
    const result = formatFiltersDisplay(filters);
    expect(result).toContain("stance:unrated");
  });

  test("combines multiple filters with separator", () => {
    const filters = {
      predicate: "uses",
      subject: "Python",
      days: 7,
      stanceFilter: "rated" as const,
    };
    const result = formatFiltersDisplay(filters);
    expect(result).toContain("·");
    expect(result).toContain("predicate:uses");
    expect(result).toContain("subject:Python");
    expect(result).toContain("7 days");
    expect(result).toContain("stance:rated");
  });
});

describe("truncate", () => {
  test("returns original string if shorter than maxLength", () => {
    const result = truncate("hello", 10);
    expect(result).toBe("hello");
  });

  test("returns original string if equal to maxLength", () => {
    const result = truncate("hello", 5);
    expect(result).toBe("hello");
  });

  test("truncates and adds ellipsis if longer than maxLength", () => {
    const result = truncate("hello world", 5);
    expect(result).toBe("hell…");
    expect(result.length).toBe(5);
  });
});
