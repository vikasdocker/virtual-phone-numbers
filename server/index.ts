import { config, validateConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { createApp, runMaintenance } from "./app.js";
import { demoProvider, liveProviders } from "./providers.js";
validateConfig(config);
// A free hosted preview never opens or modifies a real customer database.
const db = openDatabase(
  config.APP_MODE === "preview" ? ":memory:" : config.DATABASE_PATH,
);
// A crash during an external provisioning request requires reconciliation, never a blind retry.
db.prepare(
  "UPDATE orders SET status='needs_review',error='Process restarted during provisioning; reconcile provider state' WHERE status='provisioning'",
).run();
const { provider, payments } =
  config.APP_MODE === "live"
    ? liveProviders(config)
    : { provider: demoProvider, payments: null };
const app = createApp(db, config, provider, payments);
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    await runMaintenance(db, config, provider);
  } catch {
    console.error(
      "Maintenance failed; inspect order queue and database availability",
    );
  } finally {
    running = false;
  }
}
const timer = setInterval(() => void tick(), 15_000);
const server = app.listen(config.PORT, "0.0.0.0", () => {
  console.log(
    `Linea ${config.APP_MODE} listening on http://localhost:${config.PORT}`,
  );
  void tick();
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  const closed = new Promise<void>((r) => server.close(() => r()));
  const limit = setTimeout(() => process.exit(1), 25000);
  limit.unref();
  await closed;
  while (running) await new Promise((r) => setTimeout(r, 50));
  db.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
