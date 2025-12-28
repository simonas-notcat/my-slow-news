import React, { useReducer } from "react";
import { Box, useApp, useInput } from "ink";
import {
  AppContext,
  appReducer,
  initialState,
} from "./context/AppContext.js";
import { DatabaseProvider } from "./context/DatabaseContext.js";
import { Header } from "./components/Header.js";
import { Footer } from "./components/Footer.js";
import { ClaimsListScreen } from "./screens/ClaimsListScreen.js";
import { ClaimDetailScreen } from "./screens/ClaimDetailScreen.js";
import { FilterScreen } from "./screens/FilterScreen.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import type { Config } from "../../types/index.js";

interface AppProps {
  config: Config;
  initialDays?: number;
  initialSubject?: string;
  initialPredicate?: string;
}

export const App: React.FC<AppProps> = ({
  config,
  initialDays = 30,
  initialSubject,
  initialPredicate,
}) => {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(appReducer, {
    ...initialState,
    filters: {
      ...initialState.filters,
      days: initialDays,
      subject: initialSubject || null,
      predicate: initialPredicate || null,
    },
  });

  // Global keyboard handler
  useInput((input, key) => {
    // Quit
    if (
      input === "q" &&
      !state.showHelp &&
      !state.showFilter &&
      !state.showQuickStance
    ) {
      exit();
    }

    // Toggle help
    if (input === "?") {
      dispatch({ type: "TOGGLE_HELP" });
    }
  });

  return (
    <DatabaseProvider config={config}>
      <AppContext.Provider value={{ state, dispatch }}>
        <Box flexDirection="column" minHeight={20}>
          <Header />

          <Box flexDirection="column" flexGrow={1}>
            {state.currentScreen === "list" && <ClaimsListScreen />}
            {state.currentScreen === "detail" && <ClaimDetailScreen />}
          </Box>

          {state.showFilter && <FilterScreen />}
          {state.showHelp && <HelpOverlay />}

          <Footer />
        </Box>
      </AppContext.Provider>
    </DatabaseProvider>
  );
};
