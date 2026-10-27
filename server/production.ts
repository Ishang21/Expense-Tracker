// Vercel's Node.js functions use Neon PostgreSQL; Firebase remains sign-in only.
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { firebaseConfig } from "../shared/config.js";
import { createApp } from "./app.js";
import { firebaseVerifier } from "./auth.js";
import { dbFromPool, type Db } from "./db.js";

let db: Db | undefined;

export function productionDb(): Db {
  if (db) return db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for the deployed backend.");
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000 });
  attachDatabasePool(pool);
  return (db = dbFromPool(pool));
}

export function productionApp() {
  return createApp({ db: productionDb, verifyToken: firebaseVerifier(process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId) });
}
