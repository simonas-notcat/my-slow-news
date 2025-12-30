import { useEffect, useCallback } from "react";
import { useAppContext } from "../context/AppContext";
import { useDatabase } from "../context/DatabaseContext";
import { buildClaimsQuery, buildCountQuery } from "../utils/queries";
import type { ClaimListItem } from "../types";

interface CountResult {
  count: number;
}

export function useClaims() {
  const { state, dispatch } = useAppContext();
  const { db, isConnected } = useDatabase();

  const fetchClaims = useCallback(async () => {
    if (!db || !isConnected) return;

    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const offset = (state.currentPage - 1) * state.pageSize;
      const claimsQuery = buildClaimsQuery(state.filters, state.pageSize, offset);
      const countQuery = buildCountQuery(state.filters);

      const [claimsResult, countResult] = await Promise.all([
        db.query<ClaimListItem[][]>(claimsQuery.sql, claimsQuery.params),
        db.query<CountResult[][]>(countQuery.sql, countQuery.params),
      ]);

      const claims = claimsResult[0] || [];
      const total = countResult[0]?.[0]?.count || 0;

      dispatch({ type: "SET_CLAIMS", claims, total });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch claims";
      dispatch({ type: "SET_ERROR", error: message });
    }
  }, [db, isConnected, state.currentPage, state.pageSize, state.filters, dispatch]);

  // Fetch claims when filters or page changes
  useEffect(() => {
    if (isConnected) {
      fetchClaims();
    }
  }, [isConnected, fetchClaims]);

  return { refetch: fetchClaims };
}
