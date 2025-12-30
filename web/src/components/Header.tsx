import { useDatabase } from "../context/DatabaseContext";

export function Header() {
  const { isConnected } = useDatabase();

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📰</span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              My Slow News
            </h1>
            <p className="text-xs text-gray-500">Knowledge Explorer</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${
              isConnected ? "text-green-600" : "text-gray-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-gray-300"
              }`}
            />
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
    </header>
  );
}
