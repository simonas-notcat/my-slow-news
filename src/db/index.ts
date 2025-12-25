import Surreal from "surrealdb";
import type { Config } from "../types";

let db: Surreal | null = null;

export async function getDb(config: Config): Promise<Surreal> {
  if (db) return db;

  db = new Surreal();

  try {
    await db.connect(config.database.url);
  } catch (error) {
    db = null;
    throw new Error(`Failed to connect to database at ${config.database.url}: ${error}`);
  }

  try {
    await db.signin({
      username: process.env.SURREALDB_USERNAME || "root",
      password: process.env.SURREALDB_PASSWORD || "root",
    });
  } catch (error) {
    db = null;
    throw new Error(`Failed to sign in to database: ${error}`);
  }

  try {
    await db.use({
      namespace: config.database.namespace,
      database: config.database.database,
    });
  } catch (error) {
    db = null;
    throw new Error(`Failed to select database namespace: ${error}`);
  }

  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
