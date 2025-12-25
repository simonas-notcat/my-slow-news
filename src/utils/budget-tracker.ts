/**
 * Tracks LLM API usage and enforces daily budget limits
 */

// Approximate token costs for Claude Sonnet (per 1M tokens)
const COST_PER_1M_INPUT_TOKENS = 3.0; // $3 per 1M input tokens
const COST_PER_1M_OUTPUT_TOKENS = 15.0; // $15 per 1M output tokens

interface UsageRecord {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  requestCount: number;
}

interface BudgetTrackerState {
  currentDate: string;
  usage: UsageRecord;
}

let state: BudgetTrackerState | null = null;

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function initializeState(): BudgetTrackerState {
  const today = getTodayDate();
  return {
    currentDate: today,
    usage: {
      date: today,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      requestCount: 0,
    },
  };
}

function getState(): BudgetTrackerState {
  const today = getTodayDate();

  // Reset if it's a new day
  if (!state || state.currentDate !== today) {
    state = initializeState();
  }

  return state;
}

/**
 * Estimates the cost of a request based on token counts
 */
export function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * COST_PER_1M_INPUT_TOKENS;
  const outputCost = (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT_TOKENS;
  return inputCost + outputCost;
}

/**
 * Estimates input tokens from text (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Checks if the budget allows for an estimated request cost
 */
export function checkBudget(
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  dailyBudgetUsd: number
): { allowed: boolean; remainingBudget: number; estimatedCost: number } {
  const currentState = getState();
  const estimatedCost = estimateCost(estimatedInputTokens, estimatedOutputTokens);
  const remainingBudget = dailyBudgetUsd - currentState.usage.totalCost;

  return {
    allowed: remainingBudget >= estimatedCost,
    remainingBudget,
    estimatedCost,
  };
}

/**
 * Records usage after a successful API call
 */
export function recordUsage(inputTokens: number, outputTokens: number): void {
  const currentState = getState();
  const cost = estimateCost(inputTokens, outputTokens);

  currentState.usage.inputTokens += inputTokens;
  currentState.usage.outputTokens += outputTokens;
  currentState.usage.totalCost += cost;
  currentState.usage.requestCount += 1;
}

/**
 * Gets the current usage statistics for today
 */
export function getUsageStats(): UsageRecord {
  return { ...getState().usage };
}

/**
 * Resets the usage tracker (for testing)
 */
export function resetUsageTracker(): void {
  state = null;
}

/**
 * Budget enforcement error
 */
export class BudgetExceededError extends Error {
  constructor(
    public remainingBudget: number,
    public estimatedCost: number
  ) {
    super(
      `Daily budget exceeded. Remaining: $${remainingBudget.toFixed(4)}, ` +
        `Estimated cost: $${estimatedCost.toFixed(4)}`
    );
    this.name = "BudgetExceededError";
  }
}
