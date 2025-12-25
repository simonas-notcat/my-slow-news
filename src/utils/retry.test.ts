import { describe, expect, test, mock, beforeEach } from "bun:test";
import { withRetry, type RetryOptions } from "./retry";

describe("withRetry", () => {
  describe("successful execution", () => {
    test("returns result on first attempt success", async () => {
      const fn = mock(() => Promise.resolve("success"));

      const result = await withRetry(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("returns result after retries", async () => {
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error("rate_limit error"));
        }
        return Promise.resolve("success after retries");
      });

      const result = await withRetry(fn, {
        initialDelayMs: 10,
        maxAttempts: 3,
      });

      expect(result).toBe("success after retries");
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe("retry behavior", () => {
    test("retries on retryable errors", async () => {
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error("timeout occurred"));
        }
        return Promise.resolve("ok");
      });

      const result = await withRetry(fn, { initialDelayMs: 10 });

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test("does not retry on non-retryable errors", async () => {
      const fn = mock(() => Promise.reject(new Error("validation failed")));

      await expect(withRetry(fn, { initialDelayMs: 10 })).rejects.toThrow(
        "validation failed"
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("respects maxAttempts", async () => {
      const fn = mock(() => Promise.reject(new Error("rate_limit")));

      await expect(
        withRetry(fn, { maxAttempts: 2, initialDelayMs: 10 })
      ).rejects.toThrow("rate_limit");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test("uses custom retryableErrors", async () => {
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error("custom_error"));
        }
        return Promise.resolve("ok");
      });

      const result = await withRetry(fn, {
        retryableErrors: ["custom_error"],
        initialDelayMs: 10,
      });

      expect(result).toBe("ok");
    });
  });

  describe("delay behavior", () => {
    test("applies exponential backoff", async () => {
      const delays: number[] = [];
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts <= 3) {
          return Promise.reject(new Error("rate_limit"));
        }
        return Promise.resolve("ok");
      });

      const onRetry = mock((error: Error, attempt: number, delay: number) => {
        delays.push(delay);
      });

      await withRetry(fn, {
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxAttempts: 4,
        onRetry,
      });

      // Delays should be: 100, 200, 400
      expect(delays).toEqual([100, 200, 400]);
    });

    test("respects maxDelayMs", async () => {
      const delays: number[] = [];
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts <= 3) {
          return Promise.reject(new Error("rate_limit"));
        }
        return Promise.resolve("ok");
      });

      const onRetry = mock((error: Error, attempt: number, delay: number) => {
        delays.push(delay);
      });

      await withRetry(fn, {
        initialDelayMs: 100,
        backoffMultiplier: 10,
        maxDelayMs: 500,
        maxAttempts: 4,
        onRetry,
      });

      // Delays should be: 100, 500 (capped), 500 (capped)
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(500); // Would be 1000 but capped
      expect(delays[2]).toBe(500); // Would be 5000 but capped
    });
  });

  describe("onRetry callback", () => {
    test("calls onRetry with correct parameters", async () => {
      let attempts = 0;
      const fn = mock(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error("503 error"));
        }
        return Promise.resolve("ok");
      });

      const onRetry = mock(
        (error: Error, attempt: number, delayMs: number) => {}
      );

      await withRetry(fn, {
        initialDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry.mock.calls[0][0].message).toBe("503 error");
      expect(onRetry.mock.calls[0][1]).toBe(1); // attempt number
      expect(onRetry.mock.calls[0][2]).toBe(10); // delay
    });

    test("does not call onRetry on first attempt success", async () => {
      const fn = mock(() => Promise.resolve("ok"));
      const onRetry = mock(() => {});

      await withRetry(fn, { onRetry });

      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    test("converts non-Error throws to Error", async () => {
      const fn = mock(() => Promise.reject("string error"));

      await expect(withRetry(fn, { initialDelayMs: 10 })).rejects.toThrow(
        "string error"
      );
    });

    test("preserves original error type", async () => {
      class CustomError extends Error {
        constructor(
          message: string,
          public code: number
        ) {
          super(message);
          this.name = "CustomError";
        }
      }

      const fn = mock(() =>
        Promise.reject(new CustomError("custom error", 500))
      );

      try {
        await withRetry(fn, { initialDelayMs: 10 });
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CustomError);
        expect((error as CustomError).code).toBe(500);
      }
    });
  });

  describe("default retryable errors", () => {
    const retryablePatterns = [
      "rate_limit",
      "timeout",
      "ECONNRESET",
      "ETIMEDOUT",
      "503",
      "529",
    ];

    for (const pattern of retryablePatterns) {
      test(`retries on ${pattern} error`, async () => {
        let attempts = 0;
        const fn = mock(() => {
          attempts++;
          if (attempts < 2) {
            return Promise.reject(new Error(`Error: ${pattern} occurred`));
          }
          return Promise.resolve("ok");
        });

        const result = await withRetry(fn, { initialDelayMs: 10 });

        expect(result).toBe("ok");
        expect(fn).toHaveBeenCalledTimes(2);
      });
    }
  });
});
