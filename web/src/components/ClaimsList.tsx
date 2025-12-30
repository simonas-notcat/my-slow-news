import { ClaimItem } from "./ClaimItem";
import type { ClaimListItem } from "../types";

interface ClaimsListProps {
  claims: ClaimListItem[];
  selectedIndex?: number;
}

export function ClaimsList({ claims, selectedIndex }: ClaimsListProps) {
  if (claims.length === 0) {
    return null;
  }

  return (
    <div className="divide-y divide-gray-100">
      {claims.map((claim, index) => (
        <ClaimItem
          key={claim.id}
          claim={claim}
          isSelected={index === selectedIndex}
        />
      ))}
    </div>
  );
}
