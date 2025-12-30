import { useAppContext } from "../context/AppContext";
import { getStanceIndicator, formatConfidence, formatRelativeDate } from "../utils/formatters";
import type { ClaimListItem } from "../types";

interface ClaimItemProps {
  claim: ClaimListItem;
  isSelected?: boolean;
}

export function ClaimItem({ claim, isSelected }: ClaimItemProps) {
  const { dispatch } = useAppContext();
  const stanceInfo = getStanceIndicator(claim.user_stance);
  const confidence = formatConfidence(claim.confidence);

  const handleClick = () => {
    dispatch({ type: "VIEW_DETAIL", claimId: claim.id });
  };

  return (
    <div
      onClick={handleClick}
      className={`
        p-4 border-b border-gray-100 cursor-pointer transition-colors
        ${isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : "hover:bg-gray-50"}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Stance indicator */}
        <span
          className={`text-lg ${stanceInfo.colorClass}`}
          title={stanceInfo.label}
        >
          {stanceInfo.symbol}
        </span>

        {/* Claim content */}
        <div className="flex-1 min-w-0">
          {/* Triple display */}
          <div className="flex flex-wrap items-baseline gap-1.5 mb-2">
            <span className="font-medium text-gray-900">{claim.subject}</span>
            <span className="text-sm text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              {claim.predicate}
            </span>
            <span className="text-gray-700">{claim.object}</span>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {/* Confidence bar */}
            <div className="flex items-center gap-1.5">
              <span>Confidence:</span>
              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: confidence.barWidth }}
                />
              </div>
              <span>{confidence.percentage}%</span>
            </div>

            {/* Date */}
            <span>{formatRelativeDate(claim.extracted_at)}</span>
          </div>
        </div>

        {/* Arrow indicator */}
        <span className="text-gray-400 text-sm">→</span>
      </div>
    </div>
  );
}
