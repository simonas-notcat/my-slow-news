import React from "react";
import { Box, Text } from "ink";
import type { ClaimListItem } from "../types.js";
import { getStanceIndicator, truncate } from "../utils/formatters.js";

interface ClaimItemProps {
  claim: ClaimListItem;
  isSelected: boolean;
}

export const ClaimItem: React.FC<ClaimItemProps> = ({ claim, isSelected }) => {
  const stance = getStanceIndicator(claim.user_stance);

  return (
    <Box>
      <Text color={isSelected ? "cyan" : undefined}>
        {isSelected ? "> " : "  "}
      </Text>
      <Text color={isSelected ? "cyan" : undefined}>
        ({truncate(claim.subject, 20)}, {claim.predicate},{" "}
        {truncate(claim.object, 20)})
      </Text>
      <Text> </Text>
      <Box flexGrow={1} />
      <Text color={stance.color as any}>{stance.symbol}</Text>
      <Text dimColor> {stance.label}</Text>
    </Box>
  );
};
