import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import Surreal from "surrealdb";
import type { Config } from "../../../types/index.js";

interface DatabaseContextValue {
  db: Surreal | null;
  isConnected: boolean;
  error: Error | null;
  reconnect: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

interface DatabaseProviderProps {
  config: Config;
  children: ReactNode;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({
  config,
  children,
}) => {
  const [db, setDb] = useState<Surreal | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Use ref to track current connection for cleanup
  const dbRef = useRef<Surreal | null>(null);

  const connect = useCallback(async () => {
    try {
      setError(null);
      const surreal = new Surreal();
      await surreal.connect(config.database.url);
      await surreal.use({
        namespace: config.database.namespace,
        database: config.database.database,
      });
      dbRef.current = surreal;
      setDb(surreal);
      setIsConnected(true);
    } catch (err) {
      setError(err as Error);
      setIsConnected(false);
    }
  }, [config.database.url, config.database.namespace, config.database.database]);

  useEffect(() => {
    connect();
    return () => {
      // Use ref to get current connection, not stale closure value
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, [connect]);

  const reconnect = useCallback(async () => {
    await dbRef.current?.close();
    dbRef.current = null;
    await connect();
  }, [connect]);

  return (
    <DatabaseContext.Provider value={{ db, isConnected, error, reconnect }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error("useDatabase must be used within DatabaseProvider");
  }
  return context;
}
