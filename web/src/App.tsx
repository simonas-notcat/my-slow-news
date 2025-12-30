import { useState } from "react";
import { AppProvider, useAppContext } from "./context/AppContext";
import { DatabaseProvider, useDatabase } from "./context/DatabaseContext";
import { useClaims } from "./hooks/useClaims";
import { Header } from "./components/Header";
import { FilterBar } from "./components/FilterBar";
import { ClaimsList } from "./components/ClaimsList";
import { ClaimDetail } from "./components/ClaimDetail";
import { Pagination } from "./components/Pagination";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { EmptyState } from "./components/EmptyState";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { QuickStanceModal } from "./components/QuickStanceModal";
import { Toast } from "./components/Toast";

function ClaimsListScreen() {
  const { state, dispatch } = useAppContext();
  const { refetch } = useClaims();
  const [selectedClaimForStance, setSelectedClaimForStance] = useState<typeof state.claims[0] | null>(null);

  const totalPages = Math.ceil(state.totalClaims / state.pageSize);

  // Loading state
  if (state.isLoading && state.claims.length === 0) {
    return <LoadingSpinner message="Loading claims..." />;
  }

  // Error state
  if (state.error) {
    return (
      <EmptyState
        icon="⚠️"
        title="Error loading claims"
        description={state.error}
        action={{ label: "Retry", onClick: refetch }}
      />
    );
  }

  // Empty state
  if (state.claims.length === 0 && !state.isLoading) {
    return (
      <EmptyState
        icon={state.totalClaims === 0 ? "📭" : "🔍"}
        title={state.totalClaims === 0 ? "No claims yet" : "No claims match your filters"}
        description={
          state.totalClaims === 0
            ? "Generate your first digest to start extracting claims. Run: npm run digest"
            : "Try adjusting your filters or resetting them."
        }
        action={
          state.totalClaims === 0
            ? undefined
            : { label: "Reset filters", onClick: () => dispatch({ type: "RESET_FILTERS" }) }
        }
      />
    );
  }

  return (
    <>
      <div className="bg-white shadow-sm">
        {state.isLoading ? (
          <LoadingSpinner message="Loading..." />
        ) : (
          <ClaimsList claims={state.claims} selectedIndex={state.selectedIndex} />
        )}
      </div>

      <Pagination
        currentPage={state.currentPage}
        totalPages={totalPages}
        totalItems={state.totalClaims}
      />

      {selectedClaimForStance && (
        <QuickStanceModal
          claim={selectedClaimForStance}
          onClose={() => setSelectedClaimForStance(null)}
        />
      )}
    </>
  );
}

function MainApp() {
  const { isConnected } = useDatabase();
  const { state } = useAppContext();

  if (!isConnected) {
    return <ConnectionDialog />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <FilterBar />

      <main className="flex-1 max-w-4xl mx-auto w-full py-4">
        {state.currentScreen === "list" && <ClaimsListScreen />}
        {state.currentScreen === "detail" && <ClaimDetail />}
      </main>

      <Toast />
    </div>
  );
}

export function App() {
  return (
    <DatabaseProvider>
      <AppProvider>
        <MainApp />
      </AppProvider>
    </DatabaseProvider>
  );
}
