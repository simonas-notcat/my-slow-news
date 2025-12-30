import { useState, useEffect, useCallback } from "react";
import { useDatabase } from "../context/DatabaseContext";
import { buildPredicatesQuery } from "../utils/queries";
import type { PredicateOption } from "../types";

export function usePredicates() {
  const { db, isConnected } = useDatabase();
  const [predicates, setPredicates] = useState<PredicateOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPredicates = useCallback(async () => {
    if (!db || !isConnected) return;

    setIsLoading(true);

    try {
      const query = buildPredicatesQuery();
      const result = await db.query<PredicateOption[][]>(query.sql, query.params);
      setPredicates(result[0] || []);
    } catch (err) {
      console.error("Failed to fetch predicates:", err);
    } finally {
      setIsLoading(false);
    }
  }, [db, isConnected]);

  useEffect(() => {
    if (isConnected) {
      fetchPredicates();
    }
  }, [isConnected, fetchPredicates]);

  return { predicates, isLoading, refetch: fetchPredicates };
}
