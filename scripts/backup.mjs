import "dotenv/config";
import { DatabaseSync, backup } from "node:sqlite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const destination = process.argv[2];
if (!destination) {
  console.error("Usage: node scripts/backup.mjs /absolute/path/backup.db");
  process.exit(1);
}
if (existsSync(destination)) {
  console.error("Destination already exists. Choose a new backup path.");
  process.exit(1);
}
const source = process.env.DATABASE_PATH || "data/linea.db";
const db = new DatabaseSync(source);
await backup(db, resolve(destination));
db.close();
console.log(
  "Consistent SQLite backup created. Store it encrypted off the server.",
);
