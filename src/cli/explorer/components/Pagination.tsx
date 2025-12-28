import React from "react";
import { Box, Text } from "ink";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
}) => {
  if (totalPages <= 1) {
    return (
      <Box paddingX={1}>
        <Text dimColor>
          {totalItems} claim{totalItems !== 1 ? "s" : ""}
        </Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text dimColor>
        Page {currentPage}/{totalPages} ({totalItems} claims)
      </Text>
      <Text dimColor>
        {currentPage > 1 ? "← prev" : "     "}{" "}
        {currentPage < totalPages ? "next →" : "     "}
      </Text>
    </Box>
  );
};
