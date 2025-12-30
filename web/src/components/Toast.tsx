import { useAppContext } from "../context/AppContext";

export function Toast() {
  const { state } = useAppContext();

  if (!state.toast) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
      <span className="text-green-400">✓</span>
      <span className="text-sm">{state.toast}</span>
    </div>
  );
}
