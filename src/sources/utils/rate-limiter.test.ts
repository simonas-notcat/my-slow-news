import { describe, test, expect, beforeEach } from "vitest";
import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ minDelay: 100, maxDelay: 1000 });
  });

  test("applies minimum delay on first request", async () => {
    const startTime = Date.now();
    await limiter.wait();
    const elapsed = Date.now() - startTime;

    // First call should be immediate (no previous request)
    expect(elapsed).toBeLessThan(50);
  });

  test("enforces minimum delay between requests", async () => {
    await limiter.wait(); // First call
    const startTime = Date.now();
    await limiter.wait(); // Second call
    const elapsed = Date.now() - startTime;

    // Should wait at least minDelay
    expect(elapsed).toBeGreaterThanOrEqual(90); // Allow 10ms tolerance
    expect(elapsed).toBeLessThan(150);
  });

  test("increases delay exponentially after errors", async () => {
    limiter.recordError();
    expect(limiter.getCurrentDelay()).toBe(200); // 100 * 2^1

    limiter.recordError();
    expect(limiter.getCurrentDelay()).toBe(400); // 100 * 2^2

    limiter.recordError();
    expect(limiter.getCurrentDelay()).toBe(800); // 100 * 2^3
  });

  test("caps delay at maxDelay", async () => {
    // Record many errors to exceed maxDelay
    for (let i = 0; i < 10; i++) {
      limiter.recordError();
    }

    const delay = limiter.getCurrentDelay();
    expect(delay).toBeLessThanOrEqual(1000); // maxDelay
  });

  test("resets consecutive errors on success", async () => {
    limiter.recordError();
    limiter.recordError();
    expect(limiter.getCurrentDelay()).toBe(400); // 100 * 2^2

    limiter.recordSuccess();
    expect(limiter.getCurrentDelay()).toBe(100); // Back to minDelay
  });

  test("reset() clears all state", async () => {
    await limiter.wait();
    limiter.recordError();
    limiter.recordError();

    limiter.reset();

    expect(limiter.getCurrentDelay()).toBe(100);
  });

  test("uses default values when no options provided", () => {
    const defaultLimiter = new RateLimiter();
    expect(defaultLimiter.getCurrentDelay()).toBe(500); // Default minDelay
  });

  test("accepts custom error backoff multiplier", () => {
    const customLimiter = new RateLimiter({
      minDelay: 100,
      errorBackoffMultiplier: 3,
    });

    customLimiter.recordError();
    expect(customLimiter.getCurrentDelay()).toBe(300); // 100 * 3^1

    customLimiter.recordError();
    expect(customLimiter.getCurrentDelay()).toBe(900); // 100 * 3^2
  });

  test("wait() applies error backoff delay", async () => {
    await limiter.wait(); // First call to set lastRequestTime

    limiter.recordError();
    const startTime = Date.now();
    await limiter.wait();
    const elapsed = Date.now() - startTime;

    // Should wait at least 200ms (minDelay * 2^1)
    expect(elapsed).toBeGreaterThanOrEqual(190);
    expect(elapsed).toBeLessThan(250);
  });

  test("skips delay if enough time has already passed", async () => {
    await limiter.wait();

    // Wait longer than minDelay
    await new Promise(resolve => setTimeout(resolve, 150));

    const startTime = Date.now();
    await limiter.wait();
    const elapsed = Date.now() - startTime;

    // Should be immediate since enough time has passed
    expect(elapsed).toBeLessThan(50);
  });
});
