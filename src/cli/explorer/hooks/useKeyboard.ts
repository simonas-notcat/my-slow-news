import { useInput } from "ink";
import { useAppContext } from "../context/AppContext.js";

export function useListKeyboard() {
  const { state, dispatch } = useAppContext();

  useInput((input, key) => {
    // Don't handle input when overlays are shown
    if (state.showHelp || state.showFilter || state.showQuickStance) return;
    if (state.currentScreen !== "list") return;

    // Navigation
    if (key.upArrow || input === "k") {
      dispatch({ type: "SELECT_CLAIM", index: state.selectedIndex - 1 });
    }
    if (key.downArrow || input === "j") {
      dispatch({ type: "SELECT_CLAIM", index: state.selectedIndex + 1 });
    }

    // Pagination
    if (key.leftArrow || input === "h") {
      if (state.currentPage > 1) {
        dispatch({ type: "SET_PAGE", page: state.currentPage - 1 });
      }
    }
    if (key.rightArrow || input === "l") {
      const totalPages = Math.ceil(state.totalClaims / state.pageSize);
      if (state.currentPage < totalPages) {
        dispatch({ type: "SET_PAGE", page: state.currentPage + 1 });
      }
    }

    // Jump to first/last
    if (input === "g") {
      dispatch({ type: "SELECT_CLAIM", index: 0 });
    }
    if (input === "G") {
      dispatch({ type: "SELECT_CLAIM", index: state.claims.length - 1 });
    }

    // View detail
    if (key.return) {
      const claim = state.claims[state.selectedIndex];
      if (claim) {
        dispatch({ type: "VIEW_DETAIL", claimId: claim.id });
      }
    }

    // Actions
    if (input === "f") {
      dispatch({ type: "TOGGLE_FILTER" });
    }
    if (input === "r") {
      dispatch({ type: "RESET_FILTERS" });
    }
    if (input === "s") {
      if (state.claims.length > 0) {
        dispatch({ type: "TOGGLE_QUICK_STANCE" });
      }
    }
  });
}

export function useDetailKeyboard(
  onStance: (stance: "agrees" | "disagrees" | "neutral" | "uncertain") => void,
  onEditNote: () => void
) {
  const { state, dispatch } = useAppContext();

  useInput((input, key) => {
    if (state.showHelp) return;
    if (state.currentScreen !== "detail") return;

    // Go back
    if (key.escape || key.backspace || key.delete) {
      dispatch({ type: "GO_BACK" });
    }

    // Stance shortcuts
    if (input === "a") {
      onStance("agrees");
    }
    if (input === "d") {
      onStance("disagrees");
    }
    if (input === "n") {
      onStance("neutral");
    }
    if (input === "u") {
      onStance("uncertain");
    }

    // Edit note
    if (input === "e") {
      onEditNote();
    }
  });
}
