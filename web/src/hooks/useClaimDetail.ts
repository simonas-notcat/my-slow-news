import { useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { useDatabase } from "../context/DatabaseContext";
import { buildClaimDetailQuery } from "../utils/queries";
import { ClaimDetailSchema } from "../types/schemas";

export function useClaimDetail() {
  const { dispatch } = useAppContext();
  const { db, isConnected } = useDatabase();
  const { id } = useParams<{ id: string }>();

  // Track request ID to handle race conditions
  const requestIdRef = useRef(0);

  const fetchDetail = useCallback(async () => {
    if (!db || !isConnected || !id) return;

    // Increment request ID and capture current value
    const currentRequestId = ++requestIdRef.current;

    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const query = buildClaimDetailQuery(id);
      const result = await db.query<unknown[]>(query.sql, query.params);

      // Check if this is still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return; // Stale request, ignore results
      }

      // The RETURN statement returns an array with a single element
      // result[0-2] are the LET statements, result[3] is the RETURN
      const returnResult = result[result.length - 1];
      const rawDetail = Array.isArray(returnResult) ? returnResult[0] : returnResult;

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
  }, [db, isConnected, id, dispatch]);

  useEffect(() => {
    if (id && isConnected) {
      fetchDetail();
    }
  }, [id, isConnected, fetchDetail]);

  return { refetch: fetchDetail };
}
