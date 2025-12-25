/**
 * Retry utility with exponential backoff for transient failures
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ["rate_limit", "timeout", "ECONNRESET", "ETIMEDOUT", "503", "529"],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: Error, retryablePatterns: string[]): boolean {
  const errorString = error.message.toLowerCase() + (error.name?.toLowerCase() || "");

  return retryablePatterns.some((pattern) =>
    errorString.includes(pattern.toLowerCase())
  );
}

/**
 * Executes a function with automatic retry on transient failures
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is the last attempt or if error is not retryable
      if (attempt === opts.maxAttempts || !isRetryableError(lastError, opts.retryableErrors)) {
        throw lastError;
      }

      // Notify about retry
      if (opts.onRetry) {
        opts.onRetry(lastError, attempt, delay);
      }

      // Wait before retrying
      await sleep(delay);

      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError;
}
