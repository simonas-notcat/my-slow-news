import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { useAppContext, initialState } from "../context/AppContext.js";
import { useDatabase } from "../context/DatabaseContext.js";
import { buildPredicatesQuery } from "../utils/queries.js";
import type { FilterState, PredicateOption } from "../types.js";

type FilterField = "predicate" | "subject" | "days" | "stance";

const TIME_OPTIONS = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
  { label: "All time", value: null },
];

const STANCE_OPTIONS = [
  { label: "All claims", value: "all" },
  { label: "Unrated only", value: "unrated" },
  { label: "Rated only", value: "rated" },
  { label: "Agreed", value: "agrees" },
  { label: "Disagreed", value: "disagrees" },
  { label: "Neutral", value: "neutral" },
  { label: "Uncertain", value: "uncertain" },
];

export const FilterScreen: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { db, isConnected } = useDatabase();

  const [activeField, setActiveField] = useState<FilterField>("predicate");
  const [predicates, setPredicates] = useState<PredicateOption[]>([]);
  const [localFilters, setLocalFilters] = useState<FilterState>({
    ...state.filters,
  });

  // Fetch predicates
  useEffect(() => {
    const fetchPredicates = async () => {
      if (!db || !isConnected) return;
      try {
        const query = buildPredicatesQuery();
        const result = await db.query<{ predicate: string; count: number }[][]>(
          query.sql,
          query.params
        );
        const preds = result[0] || [];
        setPredicates(
          preds.map((p) => ({
            name: p.predicate,
            count: p.count,
          }))
        );
      } catch {
        // Silently fail, predicates will be empty
      }
    };
    fetchPredicates();
  }, [db, isConnected]);

  useEffect(() => {
    setLocalFilters(state.filters);
  }, [state.filters]);

  // Navigate between fields
  useInput((input, key) => {
    if (key.escape) {
      dispatch({ type: "TOGGLE_FILTER" });
      return;
    }

    if (key.tab || (key.downArrow && activeField !== "stance")) {
      const fields: FilterField[] = ["predicate", "subject", "days", "stance"];
      const currentIndex = fields.indexOf(activeField);
      setActiveField(fields[(currentIndex + 1) % fields.length]);
      return;
    }

    if (key.upArrow && activeField !== "predicate") {
      const fields: FilterField[] = ["predicate", "subject", "days", "stance"];
      const currentIndex = fields.indexOf(activeField);
      setActiveField(fields[(currentIndex - 1 + fields.length) % fields.length]);
      return;
    }

    if (key.return && activeField !== "subject") {
      // Apply filters
      dispatch({ type: "SET_FILTERS", filters: localFilters });
      return;
    }

    if (input === "r") {
      // Reset
      dispatch({ type: "RESET_FILTERS" });
      setLocalFilters(initialState.filters);
      return;
    }
  });

  const predicateItems = [
    { label: "All predicates", value: null as string | null },
    ...predicates.map((p) => ({
      label: `${p.name} (${p.count})`,
      value: p.name,
    })),
  ];

  const predicateInitialIndex = Math.max(
    0,
    predicateItems.findIndex((p) => p.value === localFilters.predicate)
  );

  const daysItems = TIME_OPTIONS.map((o) => ({
    label: o.label,
    value: o.value,
  }));

  const daysInitialIndex = (() => {
    const index = daysItems.findIndex((d) => d.value === localFilters.days);
    return index >= 0 ? index : 1;
  })();

  const stanceItems = STANCE_OPTIONS.map((o) => ({
    label: o.label,
    value: o.value,
  }));

  const stanceInitialIndex = Math.max(
    0,
    stanceItems.findIndex((s) => s.value === localFilters.stanceFilter)
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={2}
      paddingY={1}
      marginX={2}
      marginY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold>Filter Claims</Text>
        <Text dimColor>[Esc] Close</Text>
      </Box>

      {/* Predicate */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold={activeField === "predicate"}>
          {activeField === "predicate" ? "> " : "  "}Predicate:
        </Text>
        {activeField === "predicate" ? (
          <Box marginLeft={2}>
            <SelectInput
              items={predicateItems}
              initialIndex={predicateInitialIndex}
              onSelect={(item) => {
                setLocalFilters((f) => ({
                  ...f,
                  predicate: item.value as string | null,
                }));
              }}
            />
          </Box>
        ) : (
          <Box marginLeft={2}>
            <Text dimColor>
              {localFilters.predicate || "All predicates"}
            </Text>
          </Box>
        )}
      </Box>

      {/* Subject */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold={activeField === "subject"}>
          {activeField === "subject" ? "> " : "  "}Subject:
        </Text>
        {activeField === "subject" ? (
          <Box marginLeft={2} borderStyle="single" paddingX={1}>
            <TextInput
              value={localFilters.subject || ""}
              onChange={(value) =>
                setLocalFilters((f) => ({ ...f, subject: value || null }))
              }
              onSubmit={() =>
                dispatch({ type: "SET_FILTERS", filters: localFilters })
              }
              placeholder="Type to filter by subject..."
            />
          </Box>
        ) : (
          <Box marginLeft={2}>
            <Text dimColor>
              {localFilters.subject || "All subjects"}
            </Text>
          </Box>
        )}
      </Box>

      {/* Time Range */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold={activeField === "days"}>
          {activeField === "days" ? "> " : "  "}Time range:
        </Text>
        {activeField === "days" ? (
          <Box marginLeft={2}>
            <SelectInput
              items={daysItems}
              initialIndex={daysInitialIndex}
              onSelect={(item) => {
                setLocalFilters((f) => ({
                  ...f,
                  days: item.value as number | null,
                }));
              }}
            />
          </Box>
        ) : (
          <Box marginLeft={2}>
            <Text dimColor>
              {TIME_OPTIONS.find((t) => t.value === localFilters.days)?.label ||
                "Last 30 days"}
            </Text>
          </Box>
        )}
      </Box>

      {/* Stance Filter */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold={activeField === "stance"}>
          {activeField === "stance" ? "> " : "  "}Stance:
        </Text>
        {activeField === "stance" ? (
          <Box marginLeft={2}>
            <SelectInput
              items={stanceItems}
              initialIndex={stanceInitialIndex}
              onSelect={(item) => {
                setLocalFilters((f) => ({
                  ...f,
                  stanceFilter: item.value as FilterState["stanceFilter"],
                }));
              }}
            />
          </Box>
        ) : (
          <Box marginLeft={2}>
            <Text dimColor>
              {STANCE_OPTIONS.find((s) => s.value === localFilters.stanceFilter)
                ?.label || "All claims"}
            </Text>
          </Box>
        )}
      </Box>

      {/* Actions */}
      <Box marginTop={1} justifyContent="center">
        <Text color="cyan">[Enter] Apply</Text>
        <Text>  </Text>
        <Text dimColor>[r] Reset</Text>
        <Text>  </Text>
        <Text dimColor>[Esc] Cancel</Text>
      </Box>
    </Box>
  );
};
