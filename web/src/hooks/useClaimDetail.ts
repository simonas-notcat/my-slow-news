import { useEffect, useCallback } from "react";
import { useAppContext } from "../context/AppContext";
import { useDatabase } from "../context/DatabaseContext";
import { buildClaimDetailQuery } from "../utils/queries";
import type { ClaimDetail } from "../types";

export function useClaimDetail() {
  const { state, dispatch } = useAppContext();
  const { db, isConnected } = useDatabase();

  const fetchDetail = useCallback(async () => {
    if (!db || !isConnected || !state.selectedClaimId) return;

    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const query = buildClaimDetailQuery(state.selectedClaimId);
      const result = await db.query<ClaimDetail[]>(query.sql, query.params);

      // The result from RETURN statement is in a specific format
      const detail = result[result.length - 1] as unknown as ClaimDetail;

      if (detail) {
        dispatch({ type: "SET_DETAIL", detail });
      } else {
        dispatch({ type: "SET_ERROR", error: "Claim not found" });
      }
    } catch (err) {
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
