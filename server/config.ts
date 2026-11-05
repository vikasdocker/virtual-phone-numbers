import "dotenv/config";
import { z } from "zod";

const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_MODE: z.enum(["demo", "preview", "live"]).default("demo"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_URL: z
      .string()
      .url()
      .default(process.env.RENDER_EXTERNAL_URL || "http://127.0.0.1:5173")
      .refine((value) => {
        const u = new URL(value);
        return (
          ["http:", "https:"].includes(u.protocol) &&
          u.pathname === "/" &&
          !u.search &&
          !u.hash &&
          !u.username &&
          !u.password
        );
      }, "APP_URL must be an HTTP(S) origin without a path, query, or credentials")
      .transform((value) => new URL(value).origin),
    DATABASE_PATH: z.string().default("data/linea.db"),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    SUPPORT_EMAIL: z.string().email().default("support@example.com"),
    OPERATOR_NAME: z.string().default(""),
    OPERATOR_ADDRESS: z.string().default(""),
    LEGAL_REVIEWED: z.enum(["true", "false"]).default("false"),
    SALES_ENABLED: z.enum(["true", "false"]).default("false"),
    PRICE_US_CENTS: z.coerce.number().int().min(100).default(300),
    PRICE_CA_CENTS: z.coerce.number().int().min(100).default(400),
    MESSAGE_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  })
  .parse(process.env);

export type Config = typeof env;
export function validateConfig(c: Config) {
  if (c.NODE_ENV === "production" && c.APP_MODE === "demo")
    throw new Error(
      "Production requires APP_MODE=live or the explicitly non-commercial preview profile.",
    );
  if (c.APP_MODE === "preview") {
    if (!c.APP_URL.startsWith("https://"))
      throw new Error("Hosted preview requires an HTTPS APP_URL.");
    if (c.SALES_ENABLED !== "false")
      throw new Error("Real sales cannot be enabled in preview mode.");
  }
  if (c.APP_MODE === "live") {
    if (!c.APP_URL.startsWith("https://"))
      throw new Error("Live mode requires an HTTPS APP_URL.");
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
    ] as const) {
      if (!c[key]) throw new Error(`Missing ${key} for live mode.`);
    }
    if (c.SUPPORT_EMAIL.endsWith("@example.com"))
      throw new Error("Set your SUPPORT_EMAIL before live mode.");
    if (
      c.SALES_ENABLED === "true" &&
      (!c.OPERATOR_NAME.trim() ||
        !c.OPERATOR_ADDRESS.trim() ||
        c.LEGAL_REVIEWED !== "true")
    )
      throw new Error(
        "Sales require OPERATOR_NAME, OPERATOR_ADDRESS, and LEGAL_REVIEWED=true after reviewing rental terms and privacy notice.",
      );
  }
}
export const config = env;
export const countries = [
  {
    code: "US",
    name: "United States",
    dial: "+1",
    flag: "🇺🇸",
    price: env.PRICE_US_CENTS,
    live: true,
  },
  {
    code: "CA",
    name: "Canada",
    dial: "+1",
    flag: "🇨🇦",
    price: env.PRICE_CA_CENTS,
    live: true,
  },
  {
    code: "GB",
    name: "United Kingdom",
    dial: "+44",
    flag: "🇬🇧",
    price: 500,
    live: false,
  },
  {
    code: "AU",
    name: "Australia",
    dial: "+61",
    flag: "🇦🇺",
    price: 600,
    live: false,
  },
  {
    code: "DE",
    name: "Germany",
    dial: "+49",
    flag: "🇩🇪",
    price: 650,
    live: false,
  },
  {
    code: "NL",
    name: "Netherlands",
    dial: "+31",
    flag: "🇳🇱",
    price: 450,
    live: false,
  },
];
