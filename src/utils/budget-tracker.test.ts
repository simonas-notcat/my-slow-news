import { describe, expect, test, beforeEach } from "bun:test";
import {
  estimateCost,
  estimateTokens,
  checkBudget,
  recordUsage,
  getUsageStats,
  resetUsageTracker,
  BudgetExceededError,
} from "./budget-tracker";

describe("budget-tracker", () => {
  beforeEach(() => {
    resetUsageTracker();
  });

  describe("estimateCost", () => {
    test("calculates zero cost for zero tokens", () => {
      expect(estimateCost(0, 0)).toBe(0);
    });

    test("calculates input token cost correctly", () => {
      // $3 per 1M input tokens
      const cost = estimateCost(1_000_000, 0);
      expect(cost).toBe(3.0);
    });

    test("calculates output token cost correctly", () => {
      // $15 per 1M output tokens
      const cost = estimateCost(0, 1_000_000);
      expect(cost).toBe(15.0);
    });

    test("calculates combined cost correctly", () => {
      // 100k input ($0.30) + 50k output ($0.75) = $1.05
      const cost = estimateCost(100_000, 50_000);
      expect(cost).toBeCloseTo(1.05, 2);
    });
  });

  describe("estimateTokens", () => {
    test("estimates tokens based on character count", () => {
      // ~4 characters per token
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens("test")).toBe(1);
      expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 -> 3
    });

    test("rounds up for partial tokens", () => {
      expect(estimateTokens("hi")).toBe(1); // 2 chars / 4 = 0.5 -> 1
    });
  });

  describe("checkBudget", () => {
    test("allows request within budget", () => {
      const result = checkBudget(1000, 500, 5.0);

      expect(result.allowed).toBe(true);
      expect(result.remainingBudget).toBe(5.0);
      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    test("denies request exceeding budget", () => {
      // Use enough tokens to exceed a small budget
      const result = checkBudget(10_000_000, 5_000_000, 0.01);

      expect(result.allowed).toBe(false);
      expect(result.estimatedCost).toBeGreaterThan(result.remainingBudget);
    });

    test("accounts for previous usage", () => {
      // Record some usage first
      recordUsage(100_000, 50_000); // ~$1.05

      const result = checkBudget(1000, 500, 5.0);

      expect(result.remainingBudget).toBeLessThan(5.0);
      expect(result.remainingBudget).toBeCloseTo(3.95, 1);
    });
  });

  describe("recordUsage", () => {
    test("tracks usage correctly", () => {
      recordUsage(1000, 500);

      const stats = getUsageStats();
      expect(stats.inputTokens).toBe(1000);
      expect(stats.outputTokens).toBe(500);
      expect(stats.requestCount).toBe(1);
      expect(stats.totalCost).toBeGreaterThan(0);
    });

    test("accumulates multiple requests", () => {
      recordUsage(1000, 500);
      recordUsage(2000, 1000);

      const stats = getUsageStats();
      expect(stats.inputTokens).toBe(3000);
      expect(stats.outputTokens).toBe(1500);
      expect(stats.requestCount).toBe(2);
    });
  });

  describe("getUsageStats", () => {
    test("returns zero stats initially", () => {
      const stats = getUsageStats();

      expect(stats.inputTokens).toBe(0);
      expect(stats.outputTokens).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.requestCount).toBe(0);
    });

    test("includes current date", () => {
      const stats = getUsageStats();
      const today = new Date().toISOString().split("T")[0];

      expect(stats.date).toBe(today);
    });
  });

  describe("BudgetExceededError", () => {
    test("creates error with correct properties", () => {
      const error = new BudgetExceededError(0.5, 1.0);

      expect(error.name).toBe("BudgetExceededError");
      expect(error.remainingBudget).toBe(0.5);
      expect(error.estimatedCost).toBe(1.0);
      expect(error.message).toContain("$0.5000");
      expect(error.message).toContain("$1.0000");
    });

    test("is instanceof Error", () => {
      const error = new BudgetExceededError(0, 1);
      expect(error instanceof Error).toBe(true);
    });
  });
});
