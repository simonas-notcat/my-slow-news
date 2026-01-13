import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getStanceIndicator, formatConfidence, formatRelativeDate } from "../utils/formatters";
import type { ClaimListItem } from "../types";

interface ClaimItemProps {
  claim: ClaimListItem;
  isSelected?: boolean;
}

export const ClaimItem = memo(function ClaimItem({ claim, isSelected }: ClaimItemProps) {
  const navigate = useNavigate();
  const stanceInfo = getStanceIndicator(claim.user_stance);
  const confidence = formatConfidence(claim.confidence);

  const handleClick = useCallback(() => {
    navigate(`/claims/${encodeURIComponent(claim.id)}`);
  }, [navigate, claim.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigate(`/claims/${encodeURIComponent(claim.id)}`);
      }
    },
    [navigate, claim.id]
  );

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Claim: ${claim.subject} ${claim.predicate} ${claim.object}. Confidence ${confidence.percentage}%. Your stance: ${stanceInfo.label}`}
      aria-selected={isSelected}
      className={`
        p-4 border-b border-gray-100 cursor-pointer transition-colors
        focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500
        ${isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : "hover:bg-gray-50"}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Stance indicator */}
        <span
          className={`text-lg ${stanceInfo.colorClass}`}
          aria-hidden="true"
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
              <span id={`confidence-label-${claim.id}`}>Confidence:</span>
              <div
                className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={confidence.percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-labelledby={`confidence-label-${claim.id}`}
              >
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: confidence.barWidth }}
                />
              </div>
              <span>{confidence.percentage}%</span>
            </div>

            {/* Date */}
            {claim.extracted_at && (
              <time dateTime={new Date(claim.extracted_at).toISOString()}>
                {formatRelativeDate(claim.extracted_at)}
              </time>
            )}
            {!claim.extracted_at && (
              <span>{formatRelativeDate(undefined)}</span>
            )}
          </div>
        </div>

        {/* Arrow indicator */}
        <span className="text-gray-400 text-sm" aria-hidden="true">→</span>
      </div>
    </article>
  );
});
