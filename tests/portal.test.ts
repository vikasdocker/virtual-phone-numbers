import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import twilio from "twilio";
import { config, validateConfig, type Config } from "../server/config.js";
import { openDatabase, type Order } from "../server/db.js";
import { createApp, runMaintenance } from "../server/app.js";
import {
  demoProvider,
  liveProviders,
  type Provider,
  type Payments,
} from "../server/providers.js";

const origin = "https://numbers.example.test";
const c: Config = {
  ...config,
  NODE_ENV: "test",
  APP_MODE: "live",
  APP_URL: origin,
  SALES_ENABLED: "true",
  TWILIO_AUTH_TOKEN: "test-auth-token",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32),
  SUPPORT_EMAIL: "support@numbers.example.test",
  OPERATOR_NAME: "Test operator",
  OPERATOR_ADDRESS: "Test address",
  LEGAL_REVIEWED: "true",
};
const db = openDatabase(":memory:");
let provisions = 0,
  releases = 0,
  refunds = 0,
  failProvision = false,
  failRelease = false;
const provider: Provider = {
  ...demoProvider,
  async provision(o) {
    provisions++;
    if (failProvision) throw new Error("Timeout");
    return "PN_" + o.id;
  },
  async release() {
    releases++;
    if (failRelease) throw new Error("Unavailable");
  },
};
const verifier = liveProviders(c).payments;
const payments: Payments = {
  async checkout(o) {
    return { id: "cs_" + o.id, url: "https://checkout.stripe.com/c/pay/test" };
  },
  verify: verifier.verify,
  async refund() {
    refunds++;
  },
};
const app = createApp(db, c, provider, payments);
let cookie = "",
  otherCookie = "",
  userId = "",
  orderId = "",
  quoteId = "";
const mutation = (
  path: string,
  method: "post" | "patch" = "post",
  token = cookie,
) => request(app)[method](path).set("Origin", origin).set("Cookie", token);
function sendEvent(event: object) {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: c.STRIPE_WEBHOOK_SECRET!,
  });
  return request(app)
    .post("/api/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);
}
async function quote() {
  const r = await request(app).get("/api/numbers/search?country=US");
  assert.equal(r.status, 200);
  assert.ok(r.body.numbers.length);
  return r.body.numbers[0];
}
async function createOrder() {
  const q = await quote();
  const r = await mutation("/api/checkout").send({
    quoteId: q.id,
    acceptTerms: true,
    price: 1,
  });
  assert.equal(r.status, 200);
  return r.body.orderId as string;
}
function paidEvent(id: string, eventId = randomUUID()) {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(id) as Order;
  return {
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: o.stripe_session,
        object: "checkout.session",
        metadata: { order_id: id },
        client_reference_id: id,
        payment_status: "paid",
        amount_total: o.price,
        currency: "usd",
        payment_intent: "pi_" + id,
      },
    },
  };
}
after(() => db.close());

test("health and CSP; unauthenticated account access denied", async () => {
  const h = await request(app).get("/api/health");
  assert.equal(h.status, 200);
  assert.match(h.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal((await request(app).get("/api/dashboard")).status, 401);
  assert.equal(
    (await request(app).post("/api/demo").set("Origin", origin).send({}))
      .status,
    404,
  );
});
test("cross-origin writes and missing origins are rejected", async () => {
  assert.equal(
    (
      await request(app)
        .post("/api/auth/register")
        .set("Origin", "https://evil.test")
        .send({})
    ).status,
    403,
  );
  assert.equal(
    (await request(app).post("/api/auth/register").send({})).status,
    403,
  );
});
test("password validation and account registration; session stays HTTP-only and secure", async () => {
  assert.equal(
    (
      await mutation("/api/auth/register").send({
        name: "Alex",
        email: "alex@test.example",
        password: "short",
        acceptTerms: true,
      })
    ).status,
    400,
  );
  const r = await mutation("/api/auth/register").send({
    name: "Alex Morgan",
    email: "alex@test.example",
    password: "a-long-test-password",
    acceptTerms: true,
  });
  assert.equal(r.status, 201);
  cookie = r.headers["set-cookie"][0].split(";")[0];
  assert.match(r.headers["set-cookie"][0], /HttpOnly/);
  assert.match(r.headers["set-cookie"][0], /Secure/);
  assert.equal(r.body.user.password, undefined);
  userId = r.body.user.id;
  assert.notEqual(
    (
      db.prepare("SELECT password FROM users WHERE id=?").get(userId) as {
        password: string;
      }
    ).password,
    "a-long-test-password",
  );
});
test("login rejects wrong passwords and exposes only public user fields", async () => {
  assert.equal(
    (
      await mutation("/api/auth/login").send({
        email: "alex@test.example",
        password: "incorrect-password",
      })
    ).status,
    401,
  );
  const r = await mutation("/api/auth/login").send({
    email: "alex@test.example",
    password: "a-long-test-password",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.password, undefined);
});
test("catalog restricts country/patterns; price is server-controlled", async () => {
  assert.equal(
    (await request(app).get("/api/numbers/search?country=GB")).status,
    400,
  );
  assert.equal(
    (await request(app).get("/api/numbers/search?contains=abc")).status,
    400,
  );
  const q = await quote();
  quoteId = q.id;
  const r = await mutation("/api/checkout").send({
    quoteId,
    acceptTerms: true,
    price: 1,
  });
  assert.equal(r.status, 200);
  orderId = r.body.orderId;
  const order = db
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(orderId) as Order;
  assert.equal(order.price, c.PRICE_US_CENTS);
  assert.equal(order.status, "awaiting_payment");
});
test("reserved numbers cannot be purchased twice and stale quotes cannot be used", async () => {
  assert.equal(
    (await mutation("/api/checkout").send({ quoteId, acceptTerms: true }))
      .status,
    409,
  );
  const q = await quote();
  db.prepare("UPDATE quotes SET expires_at=0 WHERE id=?").run(q.id);
  assert.equal(
    (await mutation("/api/checkout").send({ quoteId: q.id, acceptTerms: true }))
      .status,
    410,
  );
  assert.equal(
    (await mutation("/api/checkout").send({ quoteId, acceptTerms: false }))
      .status,
    400,
  );
});
test("Stripe rejects invalid signatures and mismatched payment amounts", async () => {
  assert.equal(
    (
      await request(app)
        .post("/api/webhooks/stripe")
        .set("Content-Type", "application/json")
        .set("stripe-signature", "bad")
        .send("{}")
    ).status,
    400,
  );
  const e = paidEvent(orderId);
  e.data.object.amount_total = 1;
  assert.equal((await sendEvent(e)).status, 400);
  assert.equal(
    (db.prepare("SELECT status FROM orders WHERE id=?").get(orderId) as Order)
      .status,
    "awaiting_payment",
  );
});
test("payment fulfillment is durable and idempotent across duplicate webhooks", async () => {
  const event = paidEvent(orderId);
  assert.equal((await sendEvent(event)).status, 200);
  assert.equal((await sendEvent(event)).status, 200);
  await Promise.all([
    runMaintenance(db, c, provider),
    runMaintenance(db, c, provider),
  ]);
  assert.equal(provisions, 1);
  const order = db
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(orderId) as Order;
  assert.equal(order.status, "active");
  assert.ok(order.expires_at);
  assert.ok(new Date(order.expires_at).getTime() > Date.now() + 29 * 86400_000);
});
test("Twilio signature validation and SMS event deduplication", async () => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Order;
  const body = {
    To: o.phone,
    From: "+12125550199",
    MessageSid: "SM_test_1",
    Body: "A private inbound message",
  };
  assert.equal(
    (
      await request(app)
        .post("/api/webhooks/twilio/sms")
        .type("form")
        .send(body)
    ).status,
    403,
  );
  const signature = twilio.getExpectedTwilioSignature(
    c.TWILIO_AUTH_TOKEN!,
    origin + "/api/webhooks/twilio/sms",
    body,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request(app)
          .post("/api/webhooks/twilio/sms")
          .set("x-twilio-signature", signature)
          .type("form")
          .send(body)
      ).status,
      200,
    );
  assert.equal(
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM messages WHERE id=?")
        .get("SM_test_1") as { n: number }
    ).n,
    1,
  );
});
test("users cannot see or mark another account’s messages; admin access denied", async () => {
  const r = await mutation("/api/auth/register").send({
    name: "Other User",
    email: "other@test.example",
    password: "another-long-password",
    acceptTerms: true,
  });
  assert.equal(r.status, 201);
  otherCookie = r.headers["set-cookie"][0].split(";")[0];
  const dash = await request(app)
    .get("/api/dashboard")
    .set("Cookie", otherCookie);
  assert.deepEqual(dash.body.orders, []);
  assert.deepEqual(dash.body.messages, []);
  await mutation("/api/messages/SM_test_1/read", "patch", otherCookie).send({});
  assert.equal(
    (
      db
        .prepare("SELECT is_read FROM messages WHERE id=?")
        .get("SM_test_1") as { is_read: number }
    ).is_read,
    0,
  );
  assert.equal(
    (await request(app).get("/api/admin/orders").set("Cookie", otherCookie))
      .status,
    403,
  );
  assert.equal(
    (await mutation("/api/messages/SM_test_1/read", "patch").send({})).status,
    200,
  );
});
test("uncertain provisioning is held for review and never automatically retried", async () => {
  const id = await createOrder();
  await sendEvent(paidEvent(id));
  failProvision = true;
  await runMaintenance(db, c, provider);
  const count = provisions;
  await runMaintenance(db, c, provider);
  assert.equal(provisions, count);
  assert.equal(
    (db.prepare("SELECT status FROM orders WHERE id=?").get(id) as Order)
      .status,
    "needs_review",
  );
  failProvision = false;
});
test("admin can refund an unprovisioned paid order, once", async () => {
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(userId);
  const o = db
    .prepare("SELECT * FROM orders WHERE status='needs_review'")
    .get() as Order;
  assert.equal(
    (await mutation(`/api/admin/orders/${o.id}/refund`).send({})).status,
    200,
  );
  assert.equal(refunds, 1);
  assert.equal(
    (await mutation(`/api/admin/orders/${o.id}/refund`).send({})).status,
    409,
  );
  assert.equal(refunds, 1);
});
test("expired rentals release provider numbers; failed release remains queued and retries", async () => {
  db.prepare("UPDATE orders SET expires_at=? WHERE id=?").run(
    new Date(Date.now() - 1000).toISOString(),
    orderId,
  );
  failRelease = true;
  await runMaintenance(db, c, provider);
  assert.equal(
    (db.prepare("SELECT status FROM orders WHERE id=?").get(orderId) as Order)
      .status,
    "release_pending",
  );
  failRelease = false;
  await runMaintenance(db, c, provider);
  assert.equal(
    (db.prepare("SELECT status FROM orders WHERE id=?").get(orderId) as Order)
      .status,
    "expired",
  );
  assert.equal(releases, 2);
});
test("late payments are held for refund even when another customer reserved the same number", async () => {
  const lateOrderId = await createOrder();
  db.prepare("UPDATE orders SET status='expired' WHERE id=?").run(lateOrderId);
  const original = db
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(lateOrderId) as Order;
  db.prepare(
    "INSERT INTO orders(id,user_id,phone,country,locality,price,status,created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(
    randomUUID(),
    userId,
    original.phone,
    "US",
    "NY",
    300,
    "awaiting_payment",
    new Date().toISOString(),
  );
  assert.equal((await sendEvent(paidEvent(lateOrderId))).status, 200);
  assert.equal(
    (
      db
        .prepare("SELECT status FROM orders WHERE id=?")
        .get(lateOrderId) as Order
    ).status,
    "payment_review",
  );
});
test("old messages and sessions are pruned", async () => {
  db.prepare("UPDATE messages SET created_at=?").run(
    "2020-01-01T00:00:00.000Z",
  );
  db.prepare("UPDATE sessions SET expires_at=0 WHERE user_id=?").run(userId);
  await runMaintenance(db, c, provider);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n,
    0,
  );
  assert.equal(
    (await request(app).get("/api/dashboard").set("Cookie", cookie)).status,
    401,
  );
});
test("production refuses demo, missing credentials, HTTP, and unreviewed legal setup", () => {
  assert.throws(() =>
    validateConfig({ ...c, NODE_ENV: "production", APP_MODE: "demo" }),
  );
  assert.throws(() => validateConfig({ ...c, STRIPE_SECRET_KEY: "" }));
  assert.throws(() =>
    validateConfig({ ...c, APP_URL: "http://localhost:3000" }),
  );
  assert.throws(() => validateConfig({ ...c, LEGAL_REVIEWED: "false" }));
  assert.doesNotThrow(() => validateConfig(c));
});
