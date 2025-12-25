import Surreal from "surrealdb";
import type { Config } from "../types";

let db: Surreal | null = null;

export async function getDb(config: Config): Promise<Surreal> {
  if (db) return db;

  // Require explicit credentials - no defaults
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

    db = newDb;
    return db;
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

export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
