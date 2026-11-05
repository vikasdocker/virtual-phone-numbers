import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import twilio from "twilio";
import type Stripe from "stripe";
import { resolve } from "node:path";
import { type Config, countries } from "./config.js";
import { type Db, type User, type Order, type Quote, audit } from "./db.js";
import { hashPassword, checkPassword, tokenHash, newToken } from "./auth.js";
import { type Provider, type Payments } from "./providers.js";

type AuthedRequest = Request & { user?: User };
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
});
const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
const now = () => new Date().toISOString();

export function createApp(
  db: Db,
  c: Config,
  provider: Provider,
  payments: Payments | null,
) {
  const app = express();
  const simulated = c.APP_MODE !== "live";
  const secure = c.APP_MODE !== "demo";
  app.disable("x-powered-by");
  app.set("trust proxy", c.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: secure ? [] : null,
        },
      },
      strictTransportSecurity: secure
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    }),
  );
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  });

  // The signature is checked against the untouched raw payload, before JSON middleware.
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req, res, next) => {
      if (!payments || c.APP_MODE !== "live") {
        res.sendStatus(404);
        return;
      }
      let event: Stripe.Event;
      try {
        event = payments.verify(req.body, req.get("stripe-signature") || "");
      } catch {
        res.status(400).json({ error: "Invalid webhook signature" });
        return;
      }
      try {
        if (
          db.prepare("SELECT id FROM webhook_events WHERE id=?").get(event.id)
        ) {
          res.json({ received: true });
          return;
        }
        if (
          [
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
          ].includes(event.type)
        ) {
          const session = event.data.object as Stripe.Checkout.Session;
          const order = db
            .prepare("SELECT * FROM orders WHERE id=?")
            .get(session.metadata?.order_id || "") as Order | undefined;
          if (order && session.payment_status === "paid") {
            if (
              session.id !== order.stripe_session ||
              session.currency !== "usd" ||
              session.amount_total !== order.price ||
              session.client_reference_id !== order.id
            )
              throw new HttpError(400, "Payment does not match order");
            const pi =
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id;
            if (!pi) throw new HttpError(400, "Missing payment intent");
            db.prepare(
              "UPDATE orders SET status='paid',payment_intent=? WHERE id=? AND status='awaiting_payment'",
            ).run(pi, order.id);
            // Late payments never silently disappear after a reservation is released.
            db.prepare(
              "UPDATE orders SET status='payment_review',payment_intent=?,error='Late payment after checkout expiry; refund required' WHERE id=? AND status='expired' AND payment_intent IS NULL",
            ).run(pi, order.id);
          }
        }
        if (event.type === "checkout.session.expired") {
          const s = event.data.object as Stripe.Checkout.Session;
          db.prepare(
            "UPDATE orders SET status='expired' WHERE stripe_session=? AND status='awaiting_payment'",
          ).run(s.id);
        }
        db.prepare("INSERT OR IGNORE INTO webhook_events VALUES (?,?)").run(
          event.id,
          now(),
        );
        res.json({ received: true });
      } catch (error) {
        next(error);
      }
    },
  );
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  function validateTwilio(req: Request, res: Response, next: NextFunction) {
    if (
      c.APP_MODE !== "live" ||
      !twilio.validateRequest(
        c.TWILIO_AUTH_TOKEN!,
        req.get("x-twilio-signature") || "",
        `${c.APP_URL}${req.path}`,
        req.body,
      )
    ) {
      res.sendStatus(403);
      return;
    }
    next();
  }
  app.post("/api/webhooks/twilio/sms", validateTwilio, (req, res) => {
    const order = db
      .prepare(
        "SELECT * FROM orders WHERE phone=? AND status='active' AND expires_at>?",
      )
      .get(req.body.To, now()) as Order | undefined;
    if (
      order &&
      typeof req.body.MessageSid === "string" &&
      typeof req.body.From === "string" &&
      typeof req.body.Body === "string"
    )
      db.prepare("INSERT OR IGNORE INTO messages VALUES (?,?,?,?,?,0)").run(
        req.body.MessageSid,
        order.id,
        req.body.From.slice(0, 32),
        req.body.Body.slice(0, 3200),
        now(),
      );
    res
      .type("text/xml")
      .send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  });
  app.post("/api/webhooks/twilio/voice", validateTwilio, (_req, res) =>
    res
      .type("text/xml")
      .send(
        "<Response><Say>This number accepts text messages only. Goodbye.</Say><Hangup/></Response>",
      ),
  );
  app.use(express.json({ limit: "16kb" }), cookieParser());
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== new URL(c.APP_URL).origin
    ) {
      res.status(403).json({ error: "Request origin rejected" });
      return;
    }
    next();
  });
  app.use("/api", (req: AuthedRequest, _res, next) => {
    const token = req.cookies?.linea_session;
    if (typeof token === "string")
      req.user = db
        .prepare(
          "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
        )
        .get(tokenHash(token), Date.now()) as User | undefined;
    next();
  });
  function auth(req: AuthedRequest, _res: Response, next: NextFunction) {
    if (!req.user) throw new HttpError(401, "Sign in to continue");
    next();
  }
  function admin(req: AuthedRequest, _res: Response, next: NextFunction) {
    if (req.user?.role !== "admin")
      throw new HttpError(403, "Administrator access required");
    next();
  }
  function session(res: Response, user: User) {
    const token = newToken();
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      tokenHash(token),
      user.id,
      Date.now() + 7 * 86400_000,
    );
    res.cookie("linea_session", token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 7 * 86400_000,
      path: "/",
    });
  }
  const authLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.get("/api/config", (_req, res) =>
    res.json({
      mode: simulated ? "demo" : "live",
      freePreview: c.APP_MODE === "preview",
      salesEnabled: simulated || c.SALES_ENABLED === "true",
      countries: countries.filter((x) => simulated || x.live),
      supportEmail: c.SUPPORT_EMAIL,
      retentionDays: c.MESSAGE_RETENTION_DAYS,
      operatorName: c.OPERATOR_NAME || "Linea demo operator",
      operatorAddress: c.OPERATOR_ADDRESS || "Demo environment",
    }),
  );
  app.get("/api/auth/me", (req: AuthedRequest, res) =>
    res.json({ user: req.user ? publicUser(req.user) : null }),
  );
  app.post("/api/demo", authLimit, async (req: AuthedRequest, res) => {
    if (!simulated) throw new HttpError(404, "Not found");
    if (req.user) {
      res.json({ user: publicUser(req.user) });
      return;
    }
    if (
      c.APP_MODE === "preview" &&
      Number(
        (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number })
          .n,
      ) >= 1000
    )
      throw new HttpError(
        503,
        "Preview capacity reached. Please try again after the next restart.",
      );
    const user: User = {
      id: randomUUID(),
      email: `demo-${randomUUID()}@example.com`,
      name: "Alex Morgan",
      password: await hashPassword(newToken()),
      role: "customer",
      created_at: now(),
    };
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
      user.id,
      user.email,
      user.name,
      user.password,
      user.role,
      user.created_at,
    );
    const samples = [
      ["+12125550108", "US", "New York, NY", 300],
      ["+442079460014", "GB", "London", 500],
      ["+14165550109", "CA", "Toronto, ON", 400],
    ] as const;
    samples.forEach(([phone, country, locality, price], i) => {
      const id = randomUUID(),
        uniquePhone = `${phone.slice(0, -3)}${String(100 + Math.floor(Math.random() * 800))}`;
      // Demo workspaces use separate fictional numbers to preserve reservation isolation.
      try {
        db.prepare(
          "INSERT INTO orders(id,user_id,phone,country,locality,price,status,provider_sid,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).run(
          id,
          user.id,
          uniquePhone,
          country,
          locality,
          price,
          "active",
          `DEMO_${id}`,
          new Date(Date.now() - (i + 2) * 86400_000).toISOString(),
          new Date(Date.now() + (28 - i) * 86400_000).toISOString(),
        );
        const messages = [
          [
            "+12125550199",
            "Hi Alex! Your meeting is confirmed for tomorrow at 10:00 AM. See you then.",
          ],
          [
            "Linea",
            "Welcome to Linea. Your business number is ready to receive messages.",
          ],
          [
            "+14165550177",
            "Thanks for getting back to us. The proposal looks great!",
          ],
        ];
        const m = messages[i];
        db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?)").run(
          randomUUID(),
          id,
          m[0],
          m[1],
          new Date(Date.now() - (i + 1) * 45 * 60_000).toISOString(),
          i === 2 ? 1 : 0,
        );
      } catch {
        /* A rare demo number collision simply omits that sample. */
      }
    });
    session(res, user);
    res.json({ user: publicUser(user) });
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    if (c.APP_MODE === "preview")
      throw new HttpError(
        403,
        "Account registration is unavailable in the free preview. Use the sample workspace; do not enter personal credentials.",
      );
    const data = credentials
      .extend({
        name: z.string().trim().min(2).max(80),
        acceptTerms: z.literal(true),
      })
      .parse(req.body);
    if (db.prepare("SELECT id FROM users WHERE email=?").get(data.email))
      throw new HttpError(409, "Unable to create account with this email");
    const password = await hashPassword(data.password);
    const user = {
      id: randomUUID(),
      email: data.email,
      name: data.name,
      password,
      role: "customer",
      created_at: now(),
    };
    try {
      db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
        user.id,
        user.email,
        user.name,
        password,
        user.role,
        user.created_at,
      );
    } catch {
      throw new HttpError(409, "Unable to create account with this email");
    }
    audit(db, user.id, "account.created", user.id);
    session(res, user);
    res.status(201).json({ user: publicUser(user) });
  });
  const dummyPassword = hashPassword("invalid-password-placeholder");
  app.post("/api/auth/login", authLimit, async (req, res) => {
    if (c.APP_MODE === "preview")
      throw new HttpError(
        403,
        "Personal accounts are unavailable in the free preview. Reload to open a sample workspace.",
      );
    const data = credentials.parse(req.body);
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(data.email) as User | undefined;
    const valid = await checkPassword(
      data.password,
      user?.password || (await dummyPassword),
    );
    if (!user || !valid)
      throw new HttpError(401, "Email or password is incorrect");
    session(res, user);
    res.json({ user: publicUser(user) });
  });
  app.post("/api/auth/logout", (req, res) => {
    if (req.cookies?.linea_session)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        tokenHash(req.cookies.linea_session),
      );
    res.clearCookie("linea_session", { path: "/" }).json({ ok: true });
  });
  app.patch("/api/account", auth, async (req: AuthedRequest, res) => {
    if (c.APP_MODE === "preview")
      throw new HttpError(
        403,
        "Account changes are unavailable in the free preview.",
      );
    const data = z
      .object({
        name: z.string().trim().min(2).max(80),
        currentPassword: z.string().max(128).optional(),
        newPassword: z.string().min(12).max(128).optional(),
      })
      .parse(req.body);
    if (data.newPassword) {
      if (
        !data.currentPassword ||
        !(await checkPassword(data.currentPassword, req.user!.password))
      )
        throw new HttpError(400, "Current password is incorrect");
      const hash = await hashPassword(data.newPassword);
      db.prepare("UPDATE users SET password=? WHERE id=?").run(
        hash,
        req.user!.id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.user!.id);
      session(res, req.user!);
    }
    db.prepare("UPDATE users SET name=? WHERE id=?").run(
      data.name,
      req.user!.id,
    );
    audit(db, req.user!.id, "account.updated", req.user!.id);
    res.json({ ok: true });
  });
  app.get(
    "/api/numbers/search",
    rateLimit({
      windowMs: 60_000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    async (req, res) => {
      const query = z
        .object({
          country: z.string().length(2).default("US"),
          contains: z
            .string()
            .regex(/^\d{0,10}$/)
            .default(""),
        })
        .parse(req.query);
      const country = countries.find(
        (x) => x.code === query.country && (simulated || x.live),
      );
      if (!country) throw new HttpError(400, "Country is not available");
      const available = await provider.search(country.code, query.contains);
      const results = available
        .filter(
          (n) =>
            !db
              .prepare(
                "SELECT id FROM orders WHERE phone=? AND status IN ('awaiting_payment','paid','provisioning','active','needs_review','release_pending')",
              )
              .get(n.phone),
        )
        .map((n) => {
          const quote = {
            id: randomUUID(),
            phone: n.phone,
            country: country.code,
            locality: n.locality,
            price: country.price,
            capabilities: JSON.stringify(n.capabilities),
            expires_at: Date.now() + 10 * 60_000,
          };
          db.prepare("INSERT INTO quotes VALUES (?,?,?,?,?,?,?)").run(
            quote.id,
            quote.phone,
            quote.country,
            quote.locality,
            quote.price,
            quote.capabilities,
            quote.expires_at,
          );
          return { ...quote, capabilities: n.capabilities };
        });
      res.json({ numbers: results });
    },
  );
  app.get("/api/dashboard", auth, (req: AuthedRequest, res) => {
    const orders = db
      .prepare(
        "SELECT id,phone,country,locality,price,status,created_at,expires_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 200",
      )
      .all(req.user!.id);
    const messages = db
      .prepare(
        "SELECT m.*,o.phone FROM messages m JOIN orders o ON o.id=m.order_id WHERE o.user_id=? ORDER BY m.created_at DESC LIMIT 200",
      )
      .all(req.user!.id);
    res.json({ orders, messages });
  });
  app.post("/api/checkout", auth, async (req: AuthedRequest, res) => {
    if (c.APP_MODE === "live" && c.SALES_ENABLED !== "true")
      throw new HttpError(
        503,
        "Sales are temporarily paused. Please contact support.",
      );
    const { quoteId, acceptTerms } = z
      .object({ quoteId: z.string().uuid(), acceptTerms: z.literal(true) })
      .parse(req.body);
    if (!acceptTerms) throw new HttpError(400, "Accept the terms");
    const quote = db
      .prepare("SELECT * FROM quotes WHERE id=? AND expires_at>?")
      .get(quoteId, Date.now()) as Quote | undefined;
    if (!quote)
      throw new HttpError(
        410,
        "This quote expired. Search again for current availability.",
      );
    const active = db
      .prepare(
        "SELECT COUNT(*) AS n FROM orders WHERE user_id=? AND status IN ('awaiting_payment','paid','provisioning','needs_review')",
      )
      .get(req.user!.id) as { n: number };
    if (active.n >= 3)
      throw new HttpError(
        429,
        "Complete your pending orders before creating another checkout",
      );
    const order = {
      id: randomUUID(),
      user_id: req.user!.id,
      phone: quote.phone,
      country: quote.country,
      locality: quote.locality,
      price: quote.price,
      status: "awaiting_payment",
      stripe_session: null,
      payment_intent: null,
      provider_sid: null,
      created_at: now(),
      expires_at: null,
      checkout_expires: Date.now() + 35 * 60_000,
      error: null,
    } as Order;
    try {
      db.prepare(
        "INSERT INTO orders (id,user_id,phone,country,locality,price,status,created_at,checkout_expires) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(
        order.id,
        order.user_id,
        order.phone,
        order.country,
        order.locality,
        order.price,
        order.status,
        order.created_at,
        order.checkout_expires,
      );
    } catch {
      throw new HttpError(
        409,
        "This number is already reserved. Please choose another.",
      );
    }
    audit(db, req.user!.id, "checkout.created", order.id);
    if (simulated) {
      db.prepare(
        "UPDATE orders SET status='active',provider_sid=?,expires_at=? WHERE id=?",
      ).run(
        `DEMO_${order.id}`,
        new Date(Date.now() + 30 * 86400_000).toISOString(),
        order.id,
      );
      db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,0)").run(
        randomUUID(),
        order.id,
        "Linea Demo",
        "Your demo number is ready. This is a sample message; no real number was purchased.",
        now(),
      );
      res.json({ demo: true, orderId: order.id });
      return;
    }
    try {
      const checkout = await payments!.checkout(order, req.user!.email);
      db.prepare("UPDATE orders SET stripe_session=? WHERE id=?").run(
        checkout.id,
        order.id,
      );
      res.json({ url: checkout.url, orderId: order.id });
    } catch {
      db.prepare(
        "UPDATE orders SET status='needs_review',error='Checkout creation uncertain; reconcile Stripe before releasing reservation' WHERE id=?",
      ).run(order.id);
      throw new HttpError(
        502,
        "Checkout could not be confirmed. Contact support with your order ID " +
          order.id,
      );
    }
  });
  app.patch("/api/messages/:id/read", auth, (req: AuthedRequest, res) => {
    db.prepare(
      "UPDATE messages SET is_read=1 WHERE id=? AND order_id IN (SELECT id FROM orders WHERE user_id=?)",
    ).run(String(req.params.id), req.user!.id);
    res.json({ ok: true });
  });
  app.get("/api/admin/orders", auth, admin, (_req, res) =>
    res.json({
      orders: db
        .prepare(
          "SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 200",
        )
        .all(),
    }),
  );
  app.post(
    "/api/admin/orders/:id/reconcile",
    auth,
    admin,
    async (req: AuthedRequest, res) => {
      const order = db
        .prepare(
          "SELECT * FROM orders WHERE id=? AND status IN ('needs_review','provisioning')",
        )
        .get(String(req.params.id)) as Order | undefined;
      if (!order) throw new HttpError(404, "No order requiring reconciliation");
      if (!order.payment_intent)
        throw new HttpError(
          409,
          "Reconcile checkout/payment in Stripe first. See the operations runbook.",
        );
      const sid = await provider.find(order);
      if (!sid)
        throw new HttpError(
          409,
          "No matching Twilio number found. Inspect provider logs and use refund after confirming no number was provisioned.",
        );
      db.prepare(
        "UPDATE orders SET status='active',provider_sid=?,expires_at=?,error=NULL WHERE id=?",
      ).run(sid, new Date(Date.now() + 30 * 86400_000).toISOString(), order.id);
      audit(db, req.user!.id, "order.reconciled", order.id);
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/admin/orders/:id/refund",
    auth,
    admin,
    async (req: AuthedRequest, res) => {
      const order = db
        .prepare(
          "SELECT * FROM orders WHERE id=? AND status IN ('needs_review','payment_review')",
        )
        .get(String(req.params.id)) as Order | undefined;
      if (!order || !order.payment_intent)
        throw new HttpError(409, "Order is not eligible for automatic refund");
      if (order.status !== "payment_review" && (await provider.find(order)))
        throw new HttpError(
          409,
          "A provisioned number exists. Reconcile the order first.",
        );
      await payments!.refund(order);
      db.prepare(
        "UPDATE orders SET status='refunded',error=NULL WHERE id=?",
      ).run(order.id);
      audit(db, req.user!.id, "order.refunded", order.id);
      res.json({ ok: true });
    },
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use(express.static(resolve("dist"), { maxAge: "1h", index: false }));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
        return;
      }
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if ((error as { type?: string }).type === "entity.parse.failed") {
        res.status(400).json({ error: "Invalid JSON" });
        return;
      }
      console.error(
        "Request failed:",
        error instanceof Error ? error.name : "Unknown error",
      );
      res.status(500).json({
        error: "Something went wrong. Please try again or contact support.",
      });
    },
  );
  return app;
}

export async function runMaintenance(db: Db, c: Config, provider: Provider) {
  const paid = db
    .prepare(
      "SELECT * FROM orders WHERE status='paid' ORDER BY created_at LIMIT 10",
    )
    .all() as Order[];
  for (const order of paid) {
    const claim = db
      .prepare(
        "UPDATE orders SET status='provisioning' WHERE id=? AND status='paid'",
      )
      .run(order.id);
    if (!claim.changes) continue;
    try {
      const sid = await provider.provision(order);
      db.prepare(
        "UPDATE orders SET status='active',provider_sid=?,expires_at=?,error=NULL WHERE id=?",
      ).run(sid, new Date(Date.now() + 30 * 86400_000).toISOString(), order.id);
      audit(db, "system", "number.provisioned", order.id);
    } catch {
      db.prepare(
        "UPDATE orders SET status='needs_review',error='Provider result uncertain; reconcile or refund in admin' WHERE id=?",
      ).run(order.id);
      audit(db, "system", "number.needs_review", order.id);
    }
  }
  db.prepare(
    "UPDATE orders SET status='release_pending' WHERE status='active' AND expires_at<=?",
  ).run(now());
  for (const order of db
    .prepare("SELECT * FROM orders WHERE status='release_pending' LIMIT 25")
    .all() as Order[]) {
    try {
      if (order.provider_sid) await provider.release(order.provider_sid);
      db.prepare(
        "UPDATE orders SET status='expired',error=NULL WHERE id=?",
      ).run(order.id);
      audit(db, "system", "number.released", order.id);
    } catch {
      db.prepare(
        "UPDATE orders SET error='Release failed; automatically retrying' WHERE id=?",
      ).run(order.id);
    }
  }
  db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
  db.prepare("DELETE FROM quotes WHERE expires_at<=?").run(Date.now());
  // Stripe sessions expire at 30 minutes; the local reservation retains a five-minute safety margin.
  db.prepare(
    "UPDATE orders SET status='expired' WHERE status='awaiting_payment' AND checkout_expires<=?",
  ).run(Date.now());
  db.prepare("DELETE FROM messages WHERE created_at<?").run(
    new Date(Date.now() - c.MESSAGE_RETENTION_DAYS * 86400_000).toISOString(),
  );
}
