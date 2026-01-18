import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useAppContext } from "../context/AppContext.js";
import { useDatabase } from "../context/DatabaseContext.js";
import { useClaimDetail } from "../hooks/useClaimDetail.js";
import { LoadingSpinner } from "../components/LoadingSpinner.js";
import { EmptyState } from "../components/EmptyState.js";
import { saveStance } from "../utils/stanceOperations.js";
import {
  formatConfidence,
  formatDate,
  getStanceIndicator,
} from "../utils/formatters.js";
import type { UserStance } from "../types.js";

export const ClaimDetailScreen: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { db } = useDatabase();
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [pendingStance, setPendingStance] = useState<UserStance | null>(null);

  const { refetch } = useClaimDetail(state.selectedClaimId);

  const handleStance = useCallback(
    async (stance: UserStance) => {
      if (!db || !state.selectedClaimId) return;

      // If detail view, show note input
      if (state.claimDetail) {
        setPendingStance(stance);
        setNoteInput(state.claimDetail.user_note || "");
        setIsEditingNote(true);
      }
    },
    [db, state.selectedClaimId, state.claimDetail]
  );

  const handleSaveStance = useCallback(async () => {
    if (!db || !state.selectedClaimId || !pendingStance) return;

    try {
      await saveStance(db, state.selectedClaimId, pendingStance, noteInput || undefined);
      dispatch({
        type: "UPDATE_STANCE",
        claimId: state.selectedClaimId,
        stance: pendingStance,
        note: noteInput || undefined,
      });
      dispatch({ type: "SET_TOAST", message: `Stance saved: ${pendingStance}` });
      setTimeout(() => dispatch({ type: "SET_TOAST", message: null }), 2000);
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        error: `Failed to save stance: ${(err as Error).message}`,
      });
    } finally {
      setIsEditingNote(false);
      setPendingStance(null);
      setNoteInput("");
    }
  }, [db, state.selectedClaimId, pendingStance, noteInput, dispatch]);

  // Keyboard handling for detail screen
  useInput((input, key) => {
    if (state.showHelp) return;
    if (state.currentScreen !== "detail") return;

    if (isEditingNote) {
      if (key.escape) {
        setIsEditingNote(false);
        setPendingStance(null);
        setNoteInput("");
      }
      // Enter is handled by TextInput
      return;
    }

    // Go back
    if (key.escape || key.backspace || key.delete) {
      dispatch({ type: "GO_BACK" });
      return;
    }

    // Stance shortcuts
    if (input === "a") handleStance("agrees");
    if (input === "d") handleStance("disagrees");
    if (input === "n") handleStance("neutral");
    if (input === "u") handleStance("uncertain");

    // Edit note
    if (input === "e" && state.claimDetail?.user_stance) {
      setNoteInput(state.claimDetail.user_note || "");
      setPendingStance(state.claimDetail.user_stance);
      setIsEditingNote(true);
    }
  });

  if (state.isLoading) {
    return <LoadingSpinner message="Loading claim details..." />;
  }

  if (state.error && !state.claimDetail) {
    return (
      <Box flexDirection="column" paddingY={2}>
        <EmptyState
          type="connection-error"
          title="Failed to load claim details"
          description="We couldn't fetch this claim."
          errorDetails={state.error}
          actions={[
            { key: "r", label: "Retry", onSelect: refetch },
            { key: "b", label: "Back to list", onSelect: () => dispatch({ type: "GO_BACK" }) },
          ]}
        />
      </Box>
    );
  }

  if (!state.claimDetail) {
    return <LoadingSpinner message="Loading claim details..." />;
  }

  const detail = state.claimDetail;
  const stanceIndicator = getStanceIndicator(detail.user_stance);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Back link */}
      <Box marginBottom={1}>
        <Text dimColor>← Back (Esc/Backspace)</Text>
      </Box>

      {/* Triple visualization */}
      <Box
        borderStyle="round"
        paddingX={2}
        paddingY={1}
        marginBottom={1}
        justifyContent="center"
      >
        <Text bold color="cyan">
          {detail.subject}
        </Text>
        <Text> ──</Text>
        <Text bold>{detail.predicate}</Text>
        <Text>──▶ </Text>
        <Text bold color="cyan">
          {detail.object}
        </Text>
      </Box>

      {/* Metadata */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text dimColor>Confidence: </Text>
          <Text>{formatConfidence(detail.confidence)}</Text>
        </Text>
        <Text>
          <Text dimColor>Extracted:  </Text>
          <Text>{formatDate(detail.extracted_at)}</Text>
        </Text>
        <Text>
          <Text dimColor>Predicate:  </Text>
          <Text>
            {detail.predicate}{" "}
            ({detail.predicate_is_builtin ? "built-in" : "custom"})
          </Text>
        </Text>
        {detail.predicate_description && (
          <Text>
            <Text dimColor>            </Text>
            <Text dimColor>{detail.predicate_description}</Text>
          </Text>
        )}
      </Box>

      {/* Community Sentiment */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={true}
        borderBottom={true}
        borderLeft={false}
        borderRight={false}
        paddingY={1}
        marginBottom={1}
      >
        <Text bold>Community Sentiment</Text>
        <Text>
          <Text dimColor>Author stance:    </Text>
          <Text>{detail.content_author_stance}</Text>
        </Text>
        <Text>
          <Text dimColor>Commenters:       </Text>
          <Text color="green">{detail.commenter_agree_pct}% agree</Text>
          <Text>  </Text>
          <Text color="red">{detail.commenter_disagree_pct}% disagree</Text>
          <Text>  </Text>
          <Text dimColor>
            {100 - detail.commenter_agree_pct - detail.commenter_disagree_pct}%
            other
          </Text>
        </Text>
      </Box>

      {/* Your Stance */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={true}
        borderBottom={true}
        borderLeft={false}
        borderRight={false}
        paddingY={1}
      >
        <Text bold>Your Stance</Text>

        {isEditingNote ? (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              Recording:{" "}
              <Text color={getStanceIndicator(pendingStance!).color as any}>
                {pendingStance}
              </Text>
            </Text>
            <Text dimColor>Add a note (optional):</Text>
            <Box borderStyle="single" paddingX={1}>
              <TextInput
                value={noteInput}
                onChange={setNoteInput}
                onSubmit={handleSaveStance}
              />
            </Box>
            <Text dimColor>[Enter] Save  [Esc] Cancel</Text>
          </Box>
        ) : (
          <>
            <Text>
              <Text dimColor>Current:          </Text>
              {detail.user_stance ? (
                <>
                  <Text color={stanceIndicator.color as any}>
                    {stanceIndicator.symbol}
                  </Text>
                  <Text> {detail.user_stance}</Text>
                </>
              ) : (
                <Text dimColor>○ No stance recorded</Text>
              )}
            </Text>
            {detail.user_note && (
              <Text>
                <Text dimColor>Note:             </Text>
                <Text>"{detail.user_note}"</Text>
              </Text>
            )}
            <Box marginTop={1}>
              <Text color="green">[a] Agree</Text>
              <Text>  </Text>
              <Text color="red">[d] Disagree</Text>
              <Text>  </Text>
              <Text color="yellow">[n] Neutral</Text>
              <Text>  </Text>
              <Text color="blue">[u] Uncertain</Text>
              {detail.user_stance && (
                <>
                  <Text>  </Text>
                  <Text dimColor>[e] Edit note</Text>
                </>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Toast */}
      {state.toast && (
        <Box marginTop={1}>
          <Text color="green">✓ {state.toast}</Text>
        </Box>
      )}
    </Box>
  );
};
