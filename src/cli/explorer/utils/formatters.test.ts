import { describe, test, expect } from "bun:test";
import {
  getStanceIndicator,
  formatConfidence,
  formatDate,
  formatRelativeDate,
  formatFiltersDisplay,
  truncate,
} from "./formatters.js";
import type { FilterState } from "../types.js";

describe("formatters", () => {
  describe("getStanceIndicator", () => {
    test("returns correct indicator for agrees", () => {
      const result = getStanceIndicator("agrees");
      expect(result.symbol).toBe("✓");
      expect(result.color).toBe("green");
      expect(result.label).toBe("agreed");
    });

    test("returns correct indicator for disagrees", () => {
      const result = getStanceIndicator("disagrees");
      expect(result.symbol).toBe("✗");
      expect(result.color).toBe("red");
      expect(result.label).toBe("disagreed");
    });

    test("returns correct indicator for neutral", () => {
      const result = getStanceIndicator("neutral");
      expect(result.symbol).toBe("~");
      expect(result.color).toBe("yellow");
      expect(result.label).toBe("neutral");
    });

    test("returns correct indicator for uncertain", () => {
      const result = getStanceIndicator("uncertain");
      expect(result.symbol).toBe("?");
      expect(result.color).toBe("blue");
      expect(result.label).toBe("uncertain");
    });

    test("returns unrated indicator for undefined", () => {
      const result = getStanceIndicator(undefined);
      expect(result.symbol).toBe("○");
      expect(result.color).toBe("gray");
      expect(result.label).toBe("unrated");
    });
  });

  describe("formatConfidence", () => {
    test("formats 100% confidence", () => {
      const result = formatConfidence(1.0);
      expect(result).toContain("100%");
      expect(result).toContain("██████████");
    });

    test("formats 0% confidence", () => {
      const result = formatConfidence(0);
      expect(result).toContain("0%");
      expect(result).toContain("░░░░░░░░░░");
    });

    test("formats 50% confidence", () => {
      const result = formatConfidence(0.5);
      expect(result).toContain("50%");
      expect(result).toContain("█████");
      expect(result).toContain("░░░░░");
    });

    test("rounds to nearest percentage", () => {
      const result = formatConfidence(0.857);
      expect(result).toContain("86%");
    });
  });

  describe("formatDate", () => {
    test("formats date object", () => {
      const date = new Date("2025-01-15T10:30:00Z");
      const result = formatDate(date);
      expect(result).toContain("2025");
      expect(result).toContain("Jan");
      expect(result).toContain("15");
    });

    test("formats date string", () => {
      const result = formatDate("2025-06-20T14:45:00Z");
      expect(result).toContain("2025");
      expect(result).toContain("Jun");
      expect(result).toContain("20");
    });
  });

  describe("formatRelativeDate", () => {
    test("returns 'today' for today's date", () => {
      const today = new Date();
      const result = formatRelativeDate(today);
      expect(result).toBe("today");
    });

    test("returns 'yesterday' for yesterday", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = formatRelativeDate(yesterday);
      expect(result).toBe("yesterday");
    });

    test("returns days ago for recent dates", () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const result = formatRelativeDate(fiveDaysAgo);
      expect(result).toBe("5 days ago");
    });

    test("returns weeks ago for older dates", () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const result = formatRelativeDate(twoWeeksAgo);
      expect(result).toBe("2 weeks ago");
    });
  });

  describe("formatFiltersDisplay", () => {
    test("shows default filters", () => {
      const filters: FilterState = {
        predicate: null,
        subject: null,
        days: 30,
        stanceFilter: "all",
      };
      const result = formatFiltersDisplay(filters);
      expect(result).toContain("predicate:all");
      expect(result).toContain("subject:all");
      expect(result).toContain("days:30");
    });

    test("shows active filters", () => {
      const filters: FilterState = {
        predicate: "released",
        subject: "Rust",
        days: 7,
        stanceFilter: "unrated",
      };
      const result = formatFiltersDisplay(filters);
      expect(result).toContain("predicate:released");
      expect(result).toContain("subject:Rust");
      expect(result).toContain("days:7");
      expect(result).toContain("stance:unrated");
    });
  });

  describe("truncate", () => {
    test("returns original string if shorter than max", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    test("truncates long strings with ellipsis", () => {
      const result = truncate("this is a very long string", 10);
      expect(result).toBe("this is a…");
      expect(result.length).toBe(10);
    });

    test("handles exact length", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });
  });
});
