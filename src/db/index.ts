import Surreal from "surrealdb";
import type { Config } from "../types";

let db: Surreal | null = null;

export async function getDb(config: Config): Promise<Surreal> {
  if (db) return db;

  db = new Surreal();

  await db.connect(config.database.url);
  await db.signin({
    username: config.database.username,
    password: config.database.password,
  });
  await db.use({
    namespace: config.database.namespace,
    database: config.database.database,
  });

  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
