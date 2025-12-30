import { useState } from "react";
import { useAppContext } from "../context/AppContext";
import { useDatabase } from "../context/DatabaseContext";
import { saveStance, removeStance } from "../utils/stanceOperations";
import type { ClaimListItem, UserStance } from "../types";

interface QuickStanceModalProps {
  claim: ClaimListItem;
  onClose: () => void;
}

const STANCE_OPTIONS: { value: UserStance; label: string; color: string }[] = [
  { value: "agrees", label: "Agree", color: "bg-green-500 hover:bg-green-600" },
  { value: "disagrees", label: "Disagree", color: "bg-red-500 hover:bg-red-600" },
  { value: "neutral", label: "Neutral", color: "bg-yellow-500 hover:bg-yellow-600" },
  { value: "uncertain", label: "Uncertain", color: "bg-blue-500 hover:bg-blue-600" },
];

export function QuickStanceModal({ claim, onClose }: QuickStanceModalProps) {
  const { dispatch } = useAppContext();
  const { db } = useDatabase();
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectStance = async (stance: UserStance) => {
    if (!db) return;

    setIsSaving(true);
    try {
      await saveStance(db, claim.id, stance, note || undefined);
      dispatch({ type: "UPDATE_STANCE", claimId: claim.id, stance, note: note || undefined });
      dispatch({ type: "SET_TOAST", message: `Marked as "${stance}"` });
      onClose();

      // Clear toast after 3 seconds
      setTimeout(() => {
        dispatch({ type: "SET_TOAST", message: null });
      }, 3000);
    } catch (err) {
      console.error("Failed to save stance:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveStance = async () => {
    if (!db) return;

    setIsSaving(true);
    try {
      await removeStance(db, claim.id);
      dispatch({ type: "UPDATE_STANCE", claimId: claim.id, stance: undefined as unknown as UserStance });
      dispatch({ type: "SET_TOAST", message: "Stance removed" });
      onClose();

      setTimeout(() => {
        dispatch({ type: "SET_TOAST", message: null });
      }, 3000);
    } catch (err) {
      console.error("Failed to remove stance:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Record Your Stance</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        {/* Claim preview */}
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="flex flex-wrap items-baseline gap-1.5 text-sm">
            <span className="font-medium text-gray-900">{claim.subject}</span>
            <span className="text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded text-xs">
              {claim.predicate}
            </span>
            <span className="text-gray-700">{claim.object}</span>
          </div>
        </div>

        {/* Stance buttons */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {STANCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelectStance(option.value)}
              disabled={isSaving}
              className={`py-2.5 px-4 text-white rounded-md font-medium transition-colors disabled:opacity-50 ${option.color}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Note input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about your stance..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          {claim.user_stance && (
            <button
              onClick={handleRemoveStance}
              disabled={isSaving}
              className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              Remove stance
            </button>
          )}
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 ml-auto"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
