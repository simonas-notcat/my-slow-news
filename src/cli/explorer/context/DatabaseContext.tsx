import React, {
  createContext,
  useContext,
  useEffect,
  useState,
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

  const connect = async () => {
    try {
      setError(null);
      const surreal = new Surreal();
      await surreal.connect(config.database.url);
      await surreal.use({
        namespace: config.database.namespace,
        database: config.database.database,
      });
      setDb(surreal);
      setIsConnected(true);
    } catch (err) {
      setError(err as Error);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    connect();
    return () => {
      db?.close();
    };
  }, []);

  const reconnect = async () => {
    await db?.close();
    await connect();
  };

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
