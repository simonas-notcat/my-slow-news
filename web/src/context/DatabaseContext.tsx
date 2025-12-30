import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
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

  // Use ref to track the current db instance for cleanup
  const dbRef = useRef<Surreal | null>(null);

  const connect = useCallback(async (config: DatabaseConfig) => {
    try {
      setError(null);

      // Close existing connection if any
      if (dbRef.current) {
        await dbRef.current.close();
      }

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

      dbRef.current = surreal;
      setDb(surreal);
      setIsConnected(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to database";
      setError(message);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (dbRef.current) {
      await dbRef.current.close();
      dbRef.current = null;
      setDb(null);
      setIsConnected(false);
    }
  }, []);

  // Cleanup on unmount - use empty deps and ref
  useEffect(() => {
    return () => {
      if (dbRef.current) {
        const db = dbRef.current;
        dbRef.current = null; // Clear ref synchronously

        // Fire-and-forget async cleanup
        void (async () => {
          try {
            await db.close();
          } catch (error) {
            // Ignore errors during cleanup (component unmounted)
            console.debug("DB cleanup error:", error);
          }
        })();
      }
    };
  }, []);

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
