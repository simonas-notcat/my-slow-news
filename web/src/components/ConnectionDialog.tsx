import { useState } from "react";
import { useDatabase } from "../context/DatabaseContext";
import type { DatabaseConfig } from "../types";

const DEFAULT_CONFIG: DatabaseConfig = {
  url: "ws://localhost:8666/rpc",
  namespace: "myslownews",
  database: "main",
  username: "",
  password: "",
};

export function ConnectionDialog() {
  const { connect, error, isConnected } = useDatabase();
  const [config, setConfig] = useState<DatabaseConfig>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem("surrealdb-config");
    if (saved) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);

    // Save config (except password) to localStorage
    const { password, ...configToSave } = config;
    localStorage.setItem("surrealdb-config", JSON.stringify(configToSave));

    await connect(config);
    setIsConnecting(false);
  };

  if (isConnected) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <div className="text-center mb-6">
          <span className="text-4xl mb-4 block">📰</span>
          <h1 className="text-xl font-semibold text-gray-900">My Slow News</h1>
          <p className="text-sm text-gray-500 mt-1">Connect to your SurrealDB instance</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Database URL
            </label>
            <input
              type="text"
              value={config.url}
              onChange={(e) => setConfig({ ...config, url: e.target.value })}
              placeholder="ws://localhost:8666/rpc"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use wss:// for secure connections
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Namespace
              </label>
              <input
                type="text"
                value={config.namespace}
                onChange={(e) => setConfig({ ...config, namespace: e.target.value })}
                placeholder="myslownews"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Database
              </label>
              <input
                type="text"
                value={config.database}
                onChange={(e) => setConfig({ ...config, database: e.target.value })}
                placeholder="main"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isConnecting}
            className="w-full py-2.5 bg-blue-500 text-white font-medium rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        </form>

        {/* Security warning */}
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-xs text-amber-700">
            <strong>Security note:</strong> This app connects directly to SurrealDB
            from your browser. Only use this for local development or trusted
            networks. For production, use a backend API layer to protect credentials.
          </p>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          Make sure SurrealDB is running and accessible
        </p>
      </div>
    </div>
  );
}
