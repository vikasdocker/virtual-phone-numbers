import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import Stripe from "stripe";
const [command, first, second] = process.argv.slice(2);
const db = new DatabaseSync(process.env.DATABASE_PATH || "data/linea.db");
db.exec("PRAGMA busy_timeout=5000");
const log = (action, resource) =>
  db
    .prepare(
      "INSERT INTO audit(actor,action,resource,created_at) VALUES (?,?,?,?)",
    )
    .run("operator-cli", action, resource, new Date().toISOString());
try {
  if (command === "promote" && first) {
    const result = db
      .prepare("UPDATE users SET role='admin' WHERE email=? COLLATE NOCASE")
      .run(first);
    if (!result.changes)
      throw new Error("User not found. Create an account in the portal first.");
    log("admin.promoted", first);
    console.log("Administrator role granted. Sign out and sign in again.");
  } else if (command === "reset-password" && first) {
    // Password supplied only on hidden terminal stdin, never a command argument or log.
    const { default: readline } = await import("node:readline");
    if (!process.stdin.isTTY)
      throw new Error(
        "Run interactively with docker compose exec app node scripts/admin.mjs reset-password EMAIL",
      );
    process.stdout.write("New password (hidden, at least 12 characters): ");
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const password = await new Promise((resolve) => {
      let value = "";
      function handler(str, key) {
        if (key?.ctrl && key.name === "c") process.exit(1);
        if (key?.name === "return") {
          process.stdin.off("keypress", handler);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve(value);
        } else if (key?.name === "backspace") value = value.slice(0, -1);
        else if (str && !key?.ctrl) value += str;
      }
      process.stdin.on("keypress", handler);
    });
    process.stdout.write("\n");
    if (password.length < 12 || password.length > 128)
      throw new Error("Password must be 12 to 128 characters.");
    const { randomBytes, scryptSync } = await import("node:crypto");
    const salt = randomBytes(16).toString("hex");
    const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    const user = db
      .prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE")
      .get(first);
    if (!user) throw new Error("User not found");
    db.prepare("UPDATE users SET password=? WHERE id=?").run(hash, user.id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    log("account.password_reset", user.id);
    console.log(
      "Password reset and all sessions revoked. Verify the requester’s identity before sharing access.",
    );
  } else if (command === "reconcile-checkout" && first && second) {
    const order = db
      .prepare(
        "SELECT * FROM orders WHERE id=? AND status IN ('awaiting_payment','needs_review','expired')",
      )
      .get(first);
    if (!order) throw new Error("Order not eligible");
    if (!process.env.STRIPE_SECRET_KEY)
      throw new Error("STRIPE_SECRET_KEY missing");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(second);
    if (
      s.metadata?.order_id !== order.id ||
      s.client_reference_id !== order.id ||
      s.amount_total !== order.price ||
      s.currency !== "usd"
    )
      throw new Error("Stripe session does not match this order");
    const pi =
      typeof s.payment_intent === "string"
        ? s.payment_intent
        : s.payment_intent?.id || null;
    const status =
      s.payment_status === "paid"
        ? order.status === "expired"
          ? "payment_review"
          : "paid"
        : s.status === "expired"
          ? "expired"
          : "awaiting_payment";
    db.prepare(
      "UPDATE orders SET stripe_session=?,payment_intent=?,status=?,error=NULL WHERE id=?",
    ).run(s.id, pi, status, order.id);
    log("checkout.reconciled", order.id);
    console.log(`Checkout reconciled: ${status}`);
  } else {
    throw new Error(
      "Usage: node scripts/admin.mjs promote EMAIL | reset-password EMAIL | reconcile-checkout ORDER_ID STRIPE_SESSION_ID",
    );
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
