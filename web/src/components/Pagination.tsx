import { useMemo, useCallback } from "react";
import { useAppContext } from "../context/AppContext";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

export function Pagination({ currentPage, totalPages, totalItems }: PaginationProps) {
  const { dispatch } = useAppContext();

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        dispatch({ type: "SET_PAGE", page });
      }
    },
    [dispatch, totalPages]
  );

  // Memoize page numbers calculation
  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    const showPages = 5;

    if (totalPages <= showPages + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        end = 4;
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
      }

      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) pages.push("...");

      pages.push(totalPages);
    }

    return pages;
  }, [currentPage, totalPages]);

  if (totalPages <= 1) {
    return (
      <div className="px-4 py-3 text-sm text-gray-500 text-center" role="status">
        {totalItems} claim{totalItems !== 1 ? "s" : ""}
      </div>
    );
  }

  return (
    <nav
      className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white"
      aria-label="Pagination"
    >
      <div className="text-sm text-gray-500" role="status" aria-live="polite">
        Page {currentPage} of {totalPages} · {totalItems} claims
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
        {/* Previous button */}
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Go to previous page"
          className="px-2 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          ←
        </button>

        {/* Page numbers */}
        {pageNumbers.map((page, idx) =>
          page === "..." ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-2 text-gray-400"
              aria-hidden="true"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => goToPage(page)}
              aria-label={`Go to page ${page}`}
              aria-current={page === currentPage ? "page" : undefined}
              className={`px-3 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                page === currentPage
                  ? "bg-blue-500 text-white border-blue-500"
                  : "border-gray-300 hover:bg-gray-50"
              }`}
            >
              {page}
            </button>
          )
        )}

        {/* Next button */}
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Go to next page"
          className="px-2 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          →
        </button>
      </div>
    </nav>
  );
}
