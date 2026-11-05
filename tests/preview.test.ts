import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { config, validateConfig, type Config } from "../server/config.js";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
import { demoProvider } from "../server/providers.js";

test("hosted free preview cannot accept real payments, credentials, or account changes", async () => {
  const c: Config = {
    ...config,
    NODE_ENV: "production",
    APP_MODE: "preview",
    APP_URL: "https://preview.example.test",
    SALES_ENABLED: "false",
  };
  assert.doesNotThrow(() => validateConfig(c));
  assert.throws(() => validateConfig({ ...c, SALES_ENABLED: "true" }));
  assert.throws(() =>
    validateConfig({ ...c, APP_URL: "http://localhost:3000" }),
  );
  const db = openDatabase(":memory:");
  try {
    const app = createApp(db, c, demoProvider, null);
    const publicConfig = await request(app).get("/api/config");
    assert.equal(publicConfig.body.freePreview, true);
    assert.equal(publicConfig.body.mode, "demo");
    const demo = await request(app)
      .post("/api/demo")
      .set("Origin", c.APP_URL)
      .send({});
    assert.equal(demo.status, 200);
    assert.match(demo.headers["set-cookie"][0], /Secure/);
    const cookie = demo.headers["set-cookie"][0].split(";")[0];
    for (const route of ["/api/auth/register", "/api/auth/login"]) {
      const response = await request(app)
        .post(route)
        .set("Origin", c.APP_URL)
        .send({});
      assert.equal(response.status, 403);
    }
    assert.equal(
      (
        await request(app)
          .patch("/api/account")
          .set("Cookie", cookie)
          .set("Origin", c.APP_URL)
          .send({ name: "Real Account" })
      ).status,
      403,
    );
    const search = await request(app).get("/api/numbers/search?country=US");
    const checkout = await request(app)
      .post("/api/checkout")
      .set("Cookie", cookie)
      .set("Origin", c.APP_URL)
      .send({ quoteId: search.body.numbers[0].id, acceptTerms: true });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.body.demo, true);
    assert.equal(checkout.body.url, undefined);
    assert.equal(
      (
        await request(app)
          .post("/api/webhooks/stripe")
          .set("Content-Type", "application/json")
          .send("{}")
      ).status,
      404,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/webhooks/twilio/sms")
          .type("form")
          .send({})
      ).status,
      403,
    );
  } finally {
    db.close();
  }
});
