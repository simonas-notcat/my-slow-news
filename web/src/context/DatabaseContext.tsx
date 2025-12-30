import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Surreal from "surrealdb";
import type { DatabaseConfig } from "../types";

interface DatabaseContextValue {
  db: Surreal | null;
  isConnected: boolean;
  error: string | null;
  connect: (config: DatabaseConfig) => Promise<void>;
  disconnect: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Surreal | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async (config: DatabaseConfig) => {
    try {
      setError(null);
      const surreal = new Surreal();

      await surreal.connect(config.url);

      // Sign in if credentials provided
      if (config.username && config.password) {
        await surreal.signin({
          username: config.username,
          password: config.password,
        });
      }

      await surreal.use({
        namespace: config.namespace,
        database: config.database,
      });

      setDb(surreal);
      setIsConnected(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to database";
      setError(message);
      setIsConnected(false);
    }
  };

  const disconnect = async () => {
    if (db) {
      await db.close();
      setDb(null);
      setIsConnected(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (db) {
        db.close();
      }
    };
  }, [db]);

  return (
    <DatabaseContext.Provider
      value={{ db, isConnected, error, connect, disconnect }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error("useDatabase must be used within DatabaseProvider");
  }
  return context;
}
