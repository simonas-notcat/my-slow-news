import React from "react";
import { Box, Text, useInput } from "ink";
import { useAppContext } from "../context/AppContext.js";
import { useDatabase } from "../context/DatabaseContext.js";
import { saveStance } from "../utils/stanceOperations.js";
import type { ClaimListItem, UserStance } from "../types.js";

interface QuickStancePopupProps {
  claim: ClaimListItem;
}

export const QuickStancePopup: React.FC<QuickStancePopupProps> = ({
  claim,
}) => {
  const { dispatch } = useAppContext();
  const { db } = useDatabase();

  useInput(async (input, key) => {
    if (key.escape) {
      dispatch({ type: "TOGGLE_QUICK_STANCE" });
      return;
    }

    let stance: UserStance | null = null;
    if (input === "a") stance = "agrees";
    if (input === "d") stance = "disagrees";
    if (input === "n") stance = "neutral";
    if (input === "u") stance = "uncertain";

    if (stance && db) {
      try {
        await saveStance(db, claim.id, stance);
        dispatch({ type: "UPDATE_STANCE", claimId: claim.id, stance });
        dispatch({ type: "SET_TOAST", message: `Stance saved: ${stance}` });
        setTimeout(() => dispatch({ type: "SET_TOAST", message: null }), 2000);
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error: `Failed to save stance: ${(err as Error).message}`,
        });
      }
    }
  });

  return (
    <Box
      borderStyle="round"
      paddingX={2}
      paddingY={0}
      marginX={2}
      marginY={1}
    >
      <Text>Your stance: </Text>
      <Text color="green">[a] Agree</Text>
      <Text>  </Text>
      <Text color="red">[d] Disagree</Text>
      <Text>  </Text>
      <Text color="yellow">[n] Neutral</Text>
      <Text>  </Text>
      <Text color="blue">[u] Uncertain</Text>
      <Text>  </Text>
      <Text dimColor>[Esc] Cancel</Text>
    </Box>
  );
};
