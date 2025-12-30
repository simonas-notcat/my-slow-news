import { useState, useEffect, useCallback, useRef } from "react";
import { useDatabase } from "../context/DatabaseContext";
import { buildPredicatesQuery } from "../utils/queries";
import { PredicateOptionSchema } from "../types/schemas";
import type { PredicateOption } from "../types";

export function usePredicates() {
  const { db, isConnected } = useDatabase();
  const [predicates, setPredicates] = useState<PredicateOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Track request ID to handle race conditions
  const requestIdRef = useRef(0);

  const fetchPredicates = useCallback(async () => {
    if (!db || !isConnected) return;

    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);

    try {
      const query = buildPredicatesQuery();
      const result = await db.query<unknown[][]>(query.sql, query.params);

      // Check if this is still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      // Validate with Zod
      const rawPredicates = result[0] || [];
      const validated = rawPredicates.map((item) =>
        PredicateOptionSchema.parse(item)
      );
      setPredicates(validated);
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        console.error("Failed to fetch predicates:", err);
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [db, isConnected]);

  useEffect(() => {
    if (isConnected) {
      fetchPredicates();
    }
  }, [isConnected, fetchPredicates]);

  return { predicates, isLoading, refetch: fetchPredicates };
}
