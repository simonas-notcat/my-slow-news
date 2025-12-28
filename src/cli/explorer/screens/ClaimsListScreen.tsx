import React from "react";
import { Box, Text } from "ink";
import { useAppContext } from "../context/AppContext.js";
import { useClaims } from "../hooks/useClaims.js";
import { useListKeyboard } from "../hooks/useKeyboard.js";
import { FilterBar } from "../components/FilterBar.js";
import { ClaimsList } from "../components/ClaimsList.js";
import { Pagination } from "../components/Pagination.js";
import { LoadingSpinner } from "../components/LoadingSpinner.js";
import { QuickStancePopup } from "../components/QuickStancePopup.js";
import { EmptyState } from "../components/EmptyState.js";

export const ClaimsListScreen: React.FC = () => {
  const { state } = useAppContext();
  const { refetch } = useClaims();

  // Set up keyboard navigation
  useListKeyboard();

  const totalPages = Math.ceil(state.totalClaims / state.pageSize);

  // Loading state
  if (state.isLoading && state.claims.length === 0) {
    return <LoadingSpinner message="Loading claims..." />;
  }

  // Error state
  if (state.error) {
    return (
      <Box flexDirection="column" paddingY={2}>
        <EmptyState
          type="connection-error"
          title="Error loading claims"
          description={state.error}
          actions={[
            { key: "r", label: "Retry", onSelect: refetch },
            { key: "q", label: "Quit", onSelect: () => process.exit(0) },
          ]}
        />
      </Box>
    );
  }

  // Empty state
  if (state.claims.length === 0 && !state.isLoading) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <FilterBar filters={state.filters} />
        <EmptyState
          type={state.totalClaims === 0 ? "no-data" : "no-results"}
          title={
            state.totalClaims === 0
              ? "No claims yet"
              : "No claims match your filters"
          }
          description={
            state.totalClaims === 0
              ? "Generate your first digest to start extracting claims."
              : "Try adjusting your filters or resetting them."
          }
          actions={
            state.totalClaims === 0
              ? [{ key: "q", label: "Quit and run: bun run digest", onSelect: () => process.exit(0) }]
              : [{ key: "r", label: "Reset filters", onSelect: refetch }]
          }
          tips={
            state.totalClaims === 0
              ? ["Run: bun run digest", "Configure subreddits in config.yaml"]
              : [
                  "Expand time range",
                  "Remove subject filter",
                  "Try a different predicate",
                ]
          }
        />
      </Box>
    );
  }

  const selectedClaim = state.claims[state.selectedIndex];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <FilterBar filters={state.filters} />

      <Box
        borderStyle="single"
        borderTop={true}
        borderBottom={true}
        borderLeft={false}
        borderRight={false}
        flexDirection="column"
        flexGrow={1}
      >
        {state.isLoading ? (
          <LoadingSpinner message="Loading..." />
        ) : (
          <ClaimsList
            claims={state.claims}
            selectedIndex={state.selectedIndex}
          />
        )}

        {state.showQuickStance && selectedClaim && (
          <QuickStancePopup claim={selectedClaim} />
        )}
      </Box>

      <Pagination
        currentPage={state.currentPage}
        totalPages={totalPages}
        totalItems={state.totalClaims}
      />

      {state.toast && (
        <Box position="absolute" marginTop={-2}>
          <Text color="green">✓ {state.toast}</Text>
        </Box>
      )}
    </Box>
  );
};
