/**
 * Adaptive rate limiter for web scraping
 * Provides configurable delays between requests with automatic backoff on errors
 */

export class RateLimiter {
  private lastRequestTime: number = 0;
  private consecutiveErrors: number = 0;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly errorBackoffMultiplier: number;

  constructor(options: {
    minDelay?: number;
    maxDelay?: number;
    errorBackoffMultiplier?: number;
  } = {}) {
    this.minDelay = options.minDelay ?? 500; // 500ms default
    this.maxDelay = options.maxDelay ?? 5000; // 5s max
    this.errorBackoffMultiplier = options.errorBackoffMultiplier ?? 2;
  }

  /**
   * Wait before making the next request
   * Automatically applies additional delay if there have been consecutive errors
   */
  async wait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Calculate delay with error backoff
    let delay = this.minDelay;
    if (this.consecutiveErrors > 0) {
      delay = Math.min(
        this.minDelay * Math.pow(this.errorBackoffMultiplier, this.consecutiveErrors),
        this.maxDelay
      );
    }

    // Set lastRequestTime immediately to prevent race conditions
    // Multiple concurrent calls will now properly space themselves out
    this.lastRequestTime = now;

    // If not enough time has passed, wait
    const remainingDelay = delay - timeSinceLastRequest;
    if (remainingDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingDelay));
    }
  }

  /**
   * Record a successful request (resets error count)
   */
  recordSuccess(): void {
    this.consecutiveErrors = 0;
  }

  /**
   * Record a failed request (increases backoff)
   */
  recordError(): void {
    this.consecutiveErrors++;
  }

  /**
   * Reset the rate limiter state
   */
  reset(): void {
    this.lastRequestTime = 0;
    this.consecutiveErrors = 0;
  }

  /**
   * Get current delay that would be applied
   */
  getCurrentDelay(): number {
    if (this.consecutiveErrors === 0) {
      return this.minDelay;
    }
    return Math.min(
      this.minDelay * Math.pow(this.errorBackoffMultiplier, this.consecutiveErrors),
      this.maxDelay
    );
  }
}

// Export a singleton instance for convenience
export const globalRateLimiter = new RateLimiter();
