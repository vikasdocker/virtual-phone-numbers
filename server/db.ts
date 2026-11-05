import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
    INSERT OR IGNORE INTO schema_version VALUES (1);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
      password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY, phone TEXT NOT NULL, country TEXT NOT NULL, locality TEXT NOT NULL,
      price INTEGER NOT NULL, capabilities TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), phone TEXT NOT NULL,
      country TEXT NOT NULL, locality TEXT NOT NULL, price INTEGER NOT NULL,
      status TEXT NOT NULL, stripe_session TEXT UNIQUE, payment_intent TEXT, provider_sid TEXT UNIQUE,
      created_at TEXT NOT NULL, expires_at TEXT, checkout_expires INTEGER, error TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS reserved_phone ON orders(phone)
      WHERE status IN ('awaiting_payment','paid','provisioning','active','needs_review','release_pending');
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), sender TEXT NOT NULL,
      body TEXT NOT NULL, created_at TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
      resource TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS user_orders ON orders(user_id, created_at);
    CREATE INDEX IF NOT EXISTS order_messages ON messages(order_id, created_at);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
  `);
  return db;
}
export type Db = ReturnType<typeof openDatabase>;
export type User = {
  id: string;
  email: string;
  name: string;
  password: string;
  role: string;
  created_at: string;
};
export type Order = {
  id: string;
  user_id: string;
  phone: string;
  country: string;
  locality: string;
  price: number;
  status: string;
  stripe_session: string | null;
  payment_intent: string | null;
  provider_sid: string | null;
  created_at: string;
  expires_at: string | null;
  checkout_expires: number | null;
  error: string | null;
};
export type Quote = {
  id: string;
  phone: string;
  country: string;
  locality: string;
  price: number;
  capabilities: string;
  expires_at: number;
};
export function audit(db: Db, actor: string, action: string, resource: string) {
  db.prepare(
    "INSERT INTO audit(actor,action,resource,created_at) VALUES (?,?,?,?)",
  ).run(actor, action, resource, new Date().toISOString());
}
