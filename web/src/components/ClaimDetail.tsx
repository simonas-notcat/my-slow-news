import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { useDatabase } from "../context/DatabaseContext";
import { useClaimDetail } from "../hooks/useClaimDetail";
import { saveStance } from "../utils/stanceOperations";
import { getStanceIndicator, formatConfidence, formatDate } from "../utils/formatters";
import { LoadingSpinner } from "./LoadingSpinner";
import type { UserStance } from "../types";

const STANCE_OPTIONS: { value: UserStance; label: string; icon: string; color: string }[] = [
  { value: "agrees", label: "Agree", icon: "✓", color: "bg-green-100 text-green-700 border-green-300 hover:bg-green-200" },
  { value: "disagrees", label: "Disagree", icon: "✗", color: "bg-red-100 text-red-700 border-red-300 hover:bg-red-200" },
  { value: "neutral", label: "Neutral", icon: "~", color: "bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200" },
  { value: "uncertain", label: "Uncertain", icon: "?", color: "bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200" },
];

export function ClaimDetail() {
  const { state, dispatch } = useAppContext();
  const navigate = useNavigate();
  const { db } = useDatabase();
  const { refetch } = useClaimDetail();
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const claim = state.claimDetail;

  const handleBack = () => {
    navigate("/claims");
  };

  const handleSelectStance = async (stance: UserStance) => {
    if (!db || !claim) return;

    setIsSaving(true);
    try {
      await saveStance(db, claim.id, stance, note || undefined);
      dispatch({ type: "UPDATE_STANCE", claimId: claim.id, stance, note: note || undefined });
      dispatch({ type: "SET_TOAST", message: `Marked as "${stance}"` });
      refetch();

      setTimeout(() => {
        dispatch({ type: "SET_TOAST", message: null });
      }, 3000);
    } catch (err) {
      console.error("Failed to save stance:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (state.error && !claim) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Back to list
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-medium text-red-900 mb-2">
            Failed to load claim details
          </h3>
          <p className="text-sm text-red-700 mb-4">{state.error}</p>
          <button
            onClick={() => {
              dispatch({ type: "SET_ERROR", error: null });
              refetch();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (state.isLoading || !claim) {
    return <LoadingSpinner message="Loading claim details..." />;
  }

  const stanceInfo = getStanceIndicator(claim.user_stance);
  const confidence = formatConfidence(claim.confidence);

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        ← Back to list
      </button>

      {/* Claim triple */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex flex-wrap items-baseline gap-2 text-lg mb-4">
          <span className="font-semibold text-gray-900">{claim.subject}</span>
          <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded text-sm font-medium">
            {claim.predicate}
          </span>
          <span className="text-gray-700">{claim.object}</span>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Confidence</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: confidence.barWidth }}
                />
              </div>
              <span className="text-gray-700">{confidence.percentage}%</span>
            </div>
          </div>
          <div>
            <span className="text-gray-500">Extracted</span>
            <p className="text-gray-700 mt-1">{formatDate(claim.extracted_at)}</p>
          </div>
        </div>
      </div>

      {/* Predicate info */}
      {claim.predicate_description && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-blue-900">Predicate: {claim.predicate}</span>
            {claim.predicate_is_builtin && (
              <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded">
                built-in
              </span>
            )}
          </div>
          <p className="text-sm text-blue-800">{claim.predicate_description}</p>
        </div>
      )}

      {/* Community sentiment */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h3 className="font-medium text-gray-900 mb-4">Community Sentiment</h3>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-500">Author stance</p>
            <p className="font-medium text-gray-700 mt-1">
              {claim.content_author_stance === "not-stated"
                ? "Not stated"
                : claim.content_author_stance}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Commenters agree</p>
            <p className="font-medium text-green-600 mt-1">{claim.commenter_agree_pct}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Commenters disagree</p>
            <p className="font-medium text-red-600 mt-1">{claim.commenter_disagree_pct}%</p>
          </div>
        </div>
      </div>

      {/* Your stance */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-gray-900">Your Stance</h3>
          {claim.user_stance && (
            <span className={`flex items-center gap-1 ${stanceInfo.colorClass}`}>
              <span>{stanceInfo.symbol}</span>
              <span className="text-sm">{stanceInfo.label}</span>
            </span>
          )}
        </div>

        {/* Stance buttons */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {STANCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelectStance(option.value)}
              disabled={isSaving}
              className={`flex flex-col items-center py-3 px-2 rounded-md border transition-colors disabled:opacity-50 ${
                claim.user_stance === option.value
                  ? option.color
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}
            >
              <span className="text-lg">{option.icon}</span>
              <span className="text-xs mt-1">{option.label}</span>
            </button>
          ))}
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm text-gray-500 mb-1">Note</label>
          <textarea
            value={note || claim.user_note || ""}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about your stance..."
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
