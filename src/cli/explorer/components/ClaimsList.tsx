import React from "react";
import { Box } from "ink";
import { ClaimItem } from "./ClaimItem.js";
import type { ClaimListItem } from "../types.js";

interface ClaimsListProps {
  claims: ClaimListItem[];
  selectedIndex: number;
}

export const ClaimsList: React.FC<ClaimsListProps> = ({
  claims,
  selectedIndex,
}) => {
  return (
    <Box flexDirection="column" paddingY={1}>
      {claims.map((claim, index) => (
        <ClaimItem
          key={claim.id}
          claim={claim}
          isSelected={index === selectedIndex}
        />
      ))}
    </Box>
  );
};
