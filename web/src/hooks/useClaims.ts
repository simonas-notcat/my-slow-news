import { useEffect, useCallback, useRef } from "react";
import { useAppContext } from "../context/AppContext";
import { useDatabase } from "../context/DatabaseContext";
import { buildClaimsQuery, buildCountQuery } from "../utils/queries";
import { ClaimListItemSchema, CountResultSchema } from "../types/schemas";

export function useClaims() {
  const { state, dispatch } = useAppContext();
  const { db, isConnected } = useDatabase();

  // Track request ID to handle race conditions
  const requestIdRef = useRef(0);

  const fetchClaims = useCallback(async () => {
    if (!db || !isConnected) return;

    // Increment request ID and capture current value
    const currentRequestId = ++requestIdRef.current;

    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const offset = (state.currentPage - 1) * state.pageSize;
      const claimsQuery = buildClaimsQuery(state.filters, state.pageSize, offset);
      const countQuery = buildCountQuery(state.filters);

      const [claimsResult, countResult] = await Promise.all([
        db.query<unknown[][]>(claimsQuery.sql, claimsQuery.params),
        db.query<unknown[][]>(countQuery.sql, countQuery.params),
      ]);

      // Check if this is still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return; // Stale request, ignore results
      }

      // Validate results with Zod
      const rawClaims = claimsResult[0] || [];
      const claims = rawClaims.map((item) => ClaimListItemSchema.parse(item));

      const rawCount = countResult[0]?.[0];
      const countData = rawCount ? CountResultSchema.parse(rawCount) : { count: 0 };

      dispatch({ type: "SET_CLAIMS", claims, total: countData.count });
    } catch (err) {
      // Only dispatch error if this is still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

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
