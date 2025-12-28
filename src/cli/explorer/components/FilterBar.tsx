import React from "react";
import { Box, Text } from "ink";
import type { FilterState } from "../types.js";
import { formatFiltersDisplay } from "../utils/formatters.js";

interface FilterBarProps {
  filters: FilterState;
}

export const FilterBar: React.FC<FilterBarProps> = ({ filters }) => {
  const hasActiveFilters =
    filters.predicate ||
    filters.subject ||
    filters.stanceFilter !== "all" ||
    filters.days !== 30;

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text>
        <Text dimColor>Filters: </Text>
        <Text color={hasActiveFilters ? "cyan" : undefined}>
          {formatFiltersDisplay(filters)}
        </Text>
      </Text>
      <Text dimColor>[f] Filter</Text>
    </Box>
  );
};
