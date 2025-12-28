import { useEffect, useCallback } from "react";
import { useDatabase } from "../context/DatabaseContext.js";
import { useAppContext } from "../context/AppContext.js";
import { buildClaimDetailQuery } from "../utils/queries.js";
import type { ClaimDetail } from "../types.js";

export function useClaimDetail(claimId: string | null) {
  const { db, isConnected } = useDatabase();
  const { dispatch } = useAppContext();

  const fetchDetail = useCallback(async () => {
    if (!db || !isConnected || !claimId) return;

    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const query = buildClaimDetailQuery(claimId);
      const result = await db.query<any[]>(query.sql, query.params);

      // The RETURN statement gives us the result directly
      const detail = result[result.length - 1];

      if (detail) {
        const claimDetail: ClaimDetail = {
          id: detail.id || claimId,
          subject: detail.subject,
          predicate: detail.predicate,
          object: detail.object,
          confidence: detail.confidence,
          extracted_at: new Date(detail.extracted_at),
          predicate_description: detail.predicate_description,
          predicate_is_builtin: detail.predicate_is_builtin ?? false,
          content_author_stance: detail.content_author_stance ?? "not-stated",
          commenter_agree_pct: detail.commenter_agree_pct ?? 0,
          commenter_disagree_pct: detail.commenter_disagree_pct ?? 0,
          user_stance: detail.user_stance,
          user_note: detail.user_note,
          source_post_title: detail.source_post_title,
          source_subreddit: detail.source_subreddit,
        };

        dispatch({ type: "SET_DETAIL", detail: claimDetail });
      } else {
        dispatch({ type: "SET_ERROR", error: "Claim not found" });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: (err as Error).message });
    }
  }, [db, isConnected, claimId]);

  useEffect(() => {
    if (claimId && isConnected) {
      fetchDetail();
    }
  }, [fetchDetail, claimId, isConnected]);

  return { refetch: fetchDetail };
}
