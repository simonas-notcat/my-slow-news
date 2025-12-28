import { useEffect, useCallback } from "react";
import { useDatabase } from "../context/DatabaseContext.js";
import { useAppContext } from "../context/AppContext.js";
import { buildClaimsQuery, buildCountQuery } from "../utils/queries.js";
import type { ClaimListItem } from "../types.js";

interface ClaimsQueryResult {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  extracted_at: string;
  user_stance?: string;
}

export function useClaims() {
  const { db, isConnected } = useDatabase();
  const { state, dispatch } = useAppContext();

  const fetchClaims = useCallback(async () => {
    if (!db || !isConnected) return;

    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const offset = (state.currentPage - 1) * state.pageSize;
      const query = buildClaimsQuery(state.filters, state.pageSize, offset);
      const countQuery = buildCountQuery(state.filters);

      const [claimsResult, countResult] = await Promise.all([
        db.query<ClaimsQueryResult[][]>(query.sql, query.params),
        db.query<[{ count: number }][]>(countQuery.sql, countQuery.params),
      ]);

      const rawClaims = claimsResult[0] || [];
      const claims: ClaimListItem[] = rawClaims.map((c) => ({
        id: c.id,
        subject: c.subject,
        predicate: c.predicate,
        object: c.object,
        confidence: c.confidence,
        extracted_at: new Date(c.extracted_at),
        user_stance: c.user_stance as ClaimListItem["user_stance"],
      }));

      const total = countResult[0]?.[0]?.count || 0;

      dispatch({ type: "SET_CLAIMS", claims, total });
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: (err as Error).message });
    }
  }, [db, isConnected, state.currentPage, state.pageSize, state.filters]);

  useEffect(() => {
    if (isConnected) {
      fetchClaims();
    }
  }, [fetchClaims, isConnected]);

  return { refetch: fetchClaims };
}
