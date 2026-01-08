import { useState } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { usePredicates } from "../hooks/usePredicates";
import { formatFiltersDisplay } from "../utils/formatters";
import type { FilterState } from "../types";

const STANCE_OPTIONS = [
  { value: "all", label: "All claims" },
  { value: "unrated", label: "Unrated" },
  { value: "rated", label: "Rated" },
  { value: "agrees", label: "Agreed" },
  { value: "disagrees", label: "Disagreed" },
  { value: "neutral", label: "Neutral" },
  { value: "uncertain", label: "Uncertain" },
] as const;

const DAYS_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: null, label: "All time" },
] as const;

export function FilterBar() {
  const { state } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { predicates } = usePredicates();

  // Only show on /claims route
  if (location.pathname !== "/claims") {
    return null;
  }

  // Read filters from URL
  const filters: FilterState = {
    predicate: searchParams.get("predicate") || null,
    subject: searchParams.get("subject") || null,
    days: searchParams.get("days") ? Number(searchParams.get("days")) : 30,
    stanceFilter: (searchParams.get("stance") || "all") as FilterState["stanceFilter"],
  };

  const [subjectInput, setSubjectInput] = useState(filters.subject || "");

  const handleSetFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // Reset to page 1 when filters change
    setSearchParams(params);
  };

  const handleSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSetFilter("subject", subjectInput || null);
  };

  const handleReset = () => {
    setSubjectInput("");
    setSearchParams({});
  };

  const hasActiveFilters =
    filters.predicate ||
    filters.subject ||
    filters.days !== 30 ||
    filters.stanceFilter !== "all";

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
      <div className="max-w-4xl mx-auto">
        {/* Current filters summary */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-600">
            Showing: <span className="font-medium">{formatFiltersDisplay(filters)}</span>
            {state.totalClaims > 0 && (
              <span className="text-gray-400 ml-2">({state.totalClaims} claims)</span>
            )}
          </p>
          {hasActiveFilters && (
            <button
              onClick={handleReset}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap gap-3">
          {/* Predicate filter */}
          <select
            value={filters.predicate || ""}
            onChange={(e) => handleSetFilter("predicate", e.target.value || null)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All predicates</option>
            {predicates.map((p) => (
              <option key={p.predicate} value={p.predicate}>
                {p.predicate} ({p.count})
              </option>
            ))}
          </select>

          {/* Subject search */}
          <form onSubmit={handleSubjectSubmit} className="flex gap-1">
            <input
              type="text"
              value={subjectInput}
              onChange={(e) => setSubjectInput(e.target.value)}
              placeholder="Filter by subject..."
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
            />
            <button
              type="submit"
              className="px-2 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md"
            >
              Go
            </button>
          </form>

          {/* Days filter */}
          <select
            value={filters.days ?? ""}
            onChange={(e) => handleSetFilter("days", e.target.value || null)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {DAYS_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Stance filter */}
          <select
            value={filters.stanceFilter}
            onChange={(e) => handleSetFilter("stance", e.target.value || null)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STANCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
