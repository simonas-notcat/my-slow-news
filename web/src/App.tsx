import { useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { AppProvider, useAppContext } from "./context/AppContext";
import { DatabaseProvider, useDatabase } from "./context/DatabaseContext";
import { useClaims } from "./hooks/useClaims";
import { Header } from "./components/Header";
import { FilterBar } from "./components/FilterBar";
import { ClaimsList } from "./components/ClaimsList";
import { Pagination } from "./components/Pagination";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { EmptyState } from "./components/EmptyState";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { Toast } from "./components/Toast";
import { NotFound } from "./components/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ClaimDetailScreen } from "./screens/ClaimDetailScreen";

function ClaimsListScreen() {
  const { state } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refetch } = useClaims();

  const currentPage = Number(searchParams.get("page") || "1");
  const pageSize = 10;
  const totalPages = useMemo(
    () => Math.ceil(state.totalClaims / pageSize),
    [state.totalClaims]
  );

  const handleResetFilters = () => {
    setSearchParams({});
  };

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
            : { label: "Reset filters", onClick: handleResetFilters }
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
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={state.totalClaims}
      />
    </>
  );
}

function MainApp() {
  const { isConnected } = useDatabase();

  if (!isConnected) {
    return <ConnectionDialog />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <FilterBar />

      <main className="flex-1 max-w-4xl mx-auto w-full py-4">
        <Routes>
          <Route path="/" element={<Navigate to="/claims" replace />} />
          <Route path="/claims" element={<ClaimsListScreen />} />
          <Route path="/claims/:id" element={<ClaimDetailScreen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Toast />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <DatabaseProvider>
        <BrowserRouter>
          <AppProvider>
            <MainApp />
          </AppProvider>
        </BrowserRouter>
      </DatabaseProvider>
    </ErrorBoundary>
  );
}
