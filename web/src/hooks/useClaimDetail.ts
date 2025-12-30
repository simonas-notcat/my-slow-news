import { useEffect, useCallback, useRef } from "react";
import { useAppContext } from "../context/AppContext";
import { useDatabase } from "../context/DatabaseContext";
import { buildClaimDetailQuery } from "../utils/queries";
import { ClaimDetailSchema } from "../types/schemas";

export function useClaimDetail() {
  const { state, dispatch } = useAppContext();
  const { db, isConnected } = useDatabase();

  // Track request ID to handle race conditions
  const requestIdRef = useRef(0);

  const fetchDetail = useCallback(async () => {
    if (!db || !isConnected || !state.selectedClaimId) return;

    // Increment request ID and capture current value
    const currentRequestId = ++requestIdRef.current;

    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const query = buildClaimDetailQuery(state.selectedClaimId);
      const result = await db.query<unknown[]>(query.sql, query.params);

      // Check if this is still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return; // Stale request, ignore results
      }

      // The result from RETURN statement is the last element
      const rawDetail = result[result.length - 1];

      if (rawDetail) {
        // Validate with Zod
        const detail = ClaimDetailSchema.parse(rawDetail);
        dispatch({ type: "SET_DETAIL", detail });
      } else {
        dispatch({ type: "SET_ERROR", error: "Claim not found" });
      }
    } catch (err) {
      // Only dispatch error if this is still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      const message =
        err instanceof Error ? err.message : "Failed to fetch claim details";
      dispatch({ type: "SET_ERROR", error: message });
    }
  }, [db, isConnected, state.selectedClaimId, dispatch]);

  useEffect(() => {
    if (state.currentScreen === "detail" && state.selectedClaimId) {
      fetchDetail();
    }
  }, [state.currentScreen, state.selectedClaimId, fetchDetail]);

  return { refetch: fetchDetail };
}
