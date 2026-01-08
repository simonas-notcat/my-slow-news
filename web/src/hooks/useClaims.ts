import { useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { useDatabase } from "../context/DatabaseContext";
import { buildClaimsQuery, buildCountQuery } from "../utils/queries";
import { ClaimListItemSchema, CountResultSchema } from "../types/schemas";
import type { FilterState } from "../types";

export function useClaims() {
  const { dispatch } = useAppContext();
  const { db, isConnected } = useDatabase();
  const [searchParams] = useSearchParams();

  // Parse filters from URL - memoized to prevent infinite re-renders
  const filters: FilterState = useMemo(() => ({
    predicate: searchParams.get("predicate") || null,
    subject: searchParams.get("subject") || null,
    days: searchParams.get("days") ? Number(searchParams.get("days")) : 30,
    stanceFilter: (searchParams.get("stance") || "all") as FilterState["stanceFilter"],
  }), [searchParams]);

  const currentPage = Number(searchParams.get("page") || "1");
  const pageSize = 10;

  // Track request ID to handle race conditions
  const requestIdRef = useRef(0);

  const fetchClaims = useCallback(async () => {
    if (!db || !isConnected) return;

    // Increment request ID and capture current value
    const currentRequestId = ++requestIdRef.current;

    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const offset = (currentPage - 1) * pageSize;
      const claimsQuery = buildClaimsQuery(filters, pageSize, offset);
      const countQuery = buildCountQuery(filters);

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
  }, [db, isConnected, currentPage, pageSize, filters, dispatch]);

  // Fetch claims when URL parameters or connection changes
  useEffect(() => {
    if (isConnected) {
      fetchClaims();
    }
  }, [isConnected, searchParams, fetchClaims]);

  return { refetch: fetchClaims };
}
