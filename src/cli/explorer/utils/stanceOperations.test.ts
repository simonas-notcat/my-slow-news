import { describe, test, expect, vi, beforeEach } from "vitest";
import { saveStance, removeStance } from "./stanceOperations.js";

describe("stanceOperations", () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(() => Promise.resolve([[]])),
    };
  });

  describe("saveStance", () => {
    test("creates new stance record when none exists", async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([[]]);
        }
        return Promise.resolve([]);
      });

      await saveStance(mockDb, "claim:123", "agrees", "test note");

      const calls = mockDb.query.mock.calls;
      expect(calls.length).toBe(2);

      // First call is SELECT to check existing
      const [selectSql] = calls[0] as [string, any];
      expect(selectSql).toContain("SELECT");
      expect(selectSql).toContain("claim_stances");

      // Second call is CREATE
      const [createSql, createParams] = calls[1] as [string, any];
      expect(createSql).toContain("CREATE claim_stances");
      expect(createParams.stance).toBe("agrees");
      expect(createParams.note).toBe("test note");
    });

    test("updates existing stance record when one exists", async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (sql.includes("SELECT")) {
          return Promise.resolve([[{ id: "stance:1", claim: "claim:123" }]]);
        }
        return Promise.resolve([]);
      });

      await saveStance(mockDb, "claim:123", "disagrees");

      const calls = mockDb.query.mock.calls;
      expect(calls.length).toBe(2);

      // Second call is UPDATE
      const [updateSql, updateParams] = calls[1] as [string, any];
      expect(updateSql).toContain("UPDATE claim_stances");
      expect(updateParams.stance).toBe("disagrees");
    });

    test("passes null note when not provided", async () => {
      mockDb.query.mockImplementation(() => Promise.resolve([[]]));

      await saveStance(mockDb, "claim:123", "neutral");

      const calls = mockDb.query.mock.calls;
      const [, createParams] = calls[1] as [string, any];
      expect(createParams.note).toBeNull();
    });

    test("uses parameterized queries for claim ID", async () => {
      mockDb.query.mockImplementation(() => Promise.resolve([[]]));

      await saveStance(mockDb, "claim:malicious'--", "agrees");

      const calls = mockDb.query.mock.calls;
      const [selectSql, selectParams] = calls[0] as [string, any];

      // Should use parameter, not string interpolation
      expect(selectSql).toContain("$claim");
      expect(selectSql).not.toContain("malicious");
      expect(selectParams.claim).toBe("claim:malicious'--");
    });
  });

  describe("removeStance", () => {
    test("sets user_stance and user_note to NONE", async () => {
      await removeStance(mockDb, "claim:123");

      const calls = mockDb.query.mock.calls;
      expect(calls.length).toBe(1);

      const [sql, params] = calls[0] as [string, any];
      expect(sql).toContain("UPDATE claim_stances");
      expect(sql).toContain("user_stance = NONE");
      expect(sql).toContain("user_note = NONE");
      expect(params.claim).toBe("claim:123");
    });
  });
});
