import Surreal from "surrealdb";
import type { Config } from "../types";

let db: Surreal | null = null;

/**
 * Check if the database connection is healthy
 */
async function isConnectionHealthy(): Promise<boolean> {
  if (!db) return false;

  try {
    // Simple health check query
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a new database connection
 */
async function createConnection(config: Config): Promise<Surreal> {
  const username = process.env.SURREALDB_USERNAME;
  const password = process.env.SURREALDB_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "SURREALDB_USERNAME and SURREALDB_PASSWORD environment variables are required"
    );
  }

  const newDb = new Surreal();

  try {
    await newDb.connect(config.database.url);

    await newDb.signin({ username, password });

    await newDb.use({
      namespace: config.database.namespace,
      database: config.database.database,
    });

    return newDb;
  } catch (error) {
    // Clean up connection on any failure
    await newDb.close().catch(() => {});

    if (error instanceof Error) {
      if (error.message.includes("connect")) {
        throw new Error(`Failed to connect to database at ${config.database.url}: ${error.message}`);
      }
      if (error.message.includes("signin") || error.message.includes("credentials")) {
        throw new Error(`Failed to sign in to database: ${error.message}`);
      }
    }
    throw new Error(`Failed to initialize database: ${error}`);
  }
}

/**
 * Gets a database connection, reconnecting if necessary
 */
export async function getDb(config: Config): Promise<Surreal> {
  // Check if existing connection is healthy
  if (db && await isConnectionHealthy()) {
    return db;
  }

  // Clean up dead connection
  if (db) {
    await db.close().catch(() => {});
    db = null;
  }

  // Create new connection with retry
  const maxRetries = 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      db = await createConnection(config);
      return db;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s
        console.warn(`Database connection attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Failed to connect to database after retries");
}

/**
 * Closes the database connection
 */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}

/**
 * Force reconnection on next getDb call
 */
export function invalidateConnection(): void {
  db = null;
}
